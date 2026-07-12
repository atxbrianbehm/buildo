import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureCompilerInputs() {
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim"
  });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: "trim-seed"
    },
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const atlasPlan = await planAtlas(spec);
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  return { spec, catalog, graph };
}

function assertMeshIntegrity(ir: RuntimeBuildingIR): void {
  for (const batch of ir.meshBatches) {
    expect(batch.positions).toBeInstanceOf(Float32Array);
    expect(batch.normals).toBeInstanceOf(Float32Array);
    expect(batch.uvs).toBeInstanceOf(Float32Array);
    expect(batch.indices).toBeInstanceOf(Uint32Array);

    const positions = batch.positions!;
    const normals = batch.normals!;
    const uvs = batch.uvs!;
    const indices = batch.indices!;
    const vertexCount = positions.length / 3;

    expect(Number.isInteger(vertexCount)).toBe(true);
    expect(normals.length).toBe(positions.length);
    expect(uvs.length).toBe(vertexCount * 2);

    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(vertexCount);
    }

    for (let index = 0; index < positions.length; index += 3) {
      expect(positions[index]).toBeGreaterThanOrEqual(ir.bounds.min[0]);
      expect(positions[index]).toBeLessThanOrEqual(ir.bounds.max[0]);
      expect(positions[index + 1]).toBeGreaterThanOrEqual(ir.bounds.min[1]);
      expect(positions[index + 1]).toBeLessThanOrEqual(ir.bounds.max[1]);
      expect(positions[index + 2]).toBeGreaterThanOrEqual(ir.bounds.min[2]);
      expect(positions[index + 2]).toBeLessThanOrEqual(ir.bounds.max[2]);
    }
  }
}

function serializableIr(ir: RuntimeBuildingIR) {
  return {
    ...ir,
    meshBatches: ir.meshBatches.map((batch) => ({
      ...batch,
      positions: Array.from(batch.positions ?? []),
      normals: Array.from(batch.normals ?? []),
      uvs: Array.from(batch.uvs ?? []),
      indices: Array.from(batch.indices ?? [])
    })),
    instanceBatches: ir.instanceBatches.map((batch) => ({
      ...batch,
      transforms: Array.from(batch.transforms ?? [])
    }))
  };
}

describe("compileBuilding", () => {
  it("emits deterministic runtime IR with typed geometry arrays and a source graph hash", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const first = await compileBuilding({ spec, catalog, graph });
    const second = await compileBuilding({ spec, catalog, graph });

    expect(RuntimeBuildingIRSchema.safeParse(first).success).toBe(true);
    expect(serializableIr(first)).toEqual(serializableIr(second));
    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.buildingId).toBe(spec.familyId);
    expect(first.familyId).toBe(spec.familyId);
    expect(first.sourceGraphHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.meshBatches.length).toBeGreaterThan(0);
    expect(first.metrics.vertexCount).toBeGreaterThan(0);
    expect(first.metrics.triangleCount).toBeGreaterThan(0);
  });

  it("keeps geometry buffers internally consistent and bounds every emitted primitive", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const ir = await compileBuilding({ spec, catalog, graph });

    assertMeshIntegrity(ir);
    expect(ir.bounds.min[0]).toBeLessThanOrEqual(-spec.massing.widthM / 2);
    expect(ir.bounds.min[1]).toBe(0);
    expect(ir.bounds.min[2]).toBeLessThanOrEqual(-spec.massing.depthM / 2);
    expect(ir.bounds.max[0]).toBeGreaterThanOrEqual(spec.massing.widthM / 2);
    expect(ir.bounds.max[1]).toBeGreaterThanOrEqual(
      spec.massing.floorHeightsM.reduce((total, height) => total + height, 0) + spec.massing.parapetHeightM
    );
    expect(ir.bounds.max[2]).toBeGreaterThanOrEqual(spec.massing.depthM / 2);
  });

  it("uses an instance batch for repeated windows instead of duplicating window mesh data", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const ir = await compileBuilding({ spec, catalog, graph });
    const windowBatch = ir.instanceBatches.find((batch) => batch.recipeId === "recipe.window.tall-arched.frame");

    expect(windowBatch).toBeDefined();
    expect(windowBatch?.materialSlotId).toBe("glass.primary");
    // Kit-mode openings come from the facade plan (front/side/rear), so count is plan-driven.
    expect(windowBatch?.count).toBeGreaterThan(spec.massing.floorCount);
    expect(windowBatch?.transforms).toBeInstanceOf(Float32Array);
    expect(windowBatch?.transforms?.length).toBe(windowBatch!.count * 16);
    expect(ir.meshBatches.some((batch) => batch.role === "window")).toBe(false);
    expect(catalog.recipes.filter((recipe) => recipe.role === "window")).toHaveLength(1);
    expect(ir.semanticIndex.some((entry) => entry.semanticPath.includes("/opening/"))).toBe(true);
  });

  it("preserves proof-mode hardcoded front window counts when fidelityMode is proof", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const ir = await compileBuilding({ spec, catalog, graph, fidelityMode: "proof" });
    const windowBatch = ir.instanceBatches.find((batch) => batch.recipeId === "recipe.window.tall-arched.frame");

    expect(windowBatch?.count).toBe(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(ir.meshBatches.some((batch) => batch.role === "window")).toBe(false);
    expect(catalog.recipes.filter((recipe) => recipe.role === "window")).toHaveLength(1);
  });

  it("switches between high and low component detail without changing the default high-detail output", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const defaultIr = await compileBuilding({ spec, catalog, graph });
    const highIr = await compileBuilding({ spec, catalog, graph, detailLevel: "high" });
    const lowIr = await compileBuilding({ spec, catalog, graph, detailLevel: "low" });

    expect(serializableIr(highIr)).toEqual(serializableIr(defaultIr));
    expect(lowIr.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.roof"]);
    expect(lowIr.instanceBatches.map((batch) => batch.batchId)).toEqual(["instances.window", "instances.door"]);
    expect(lowIr.semanticIndex.some((entry) => entry.stage === "trim")).toBe(false);
    expect(lowIr.sourceGraphHash).not.toBe(highIr.sourceGraphHash);
    expect(lowIr.metrics.triangleCount).toBeLessThan(highIr.metrics.triangleCount);
    expect(lowIr.metrics.instanceCount).toBeLessThan(highIr.metrics.instanceCount);
  });

  it("indexes every emitted element with semantic path, batch id, stage, and element index", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const ir = await compileBuilding({ spec, catalog, graph });
    const sideBayCount = Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));
    const expectedWallPanelCount =
      spec.massing.floorCount * (spec.facade.frontBayCount * 2 + sideBayCount * 2);
    const doorBay = Math.floor(spec.facade.frontBayCount / 2);

    expect(ir.semanticIndex).toContainEqual(
      expect.objectContaining({
        semanticPath: expect.stringContaining(
          `building/${spec.familyId}/facade/front/floor/2/bay/3/opening/`
        ),
        batchId: "instances.window",
        stage: "openings"
      })
    );
    expect(ir.semanticIndex).toContainEqual(
      expect.objectContaining({
        semanticPath: `building/${spec.familyId}/facade/front/floor/0/bay/${doorBay}/opening/door.storefront.recessed`,
        batchId: "instances.door",
        stage: "openings",
        elementIndex: 0
      })
    );
    expect(ir.semanticIndex).toContainEqual(
      expect.objectContaining({
        semanticPath: expect.stringContaining(`building/${spec.familyId}/facade/front/cornice/`),
        batchId: "mesh.cornice",
        stage: "trim"
      })
    );
    expect(ir.meshBatches.map((batch) => batch.batchId)).toEqual(
      expect.arrayContaining(["mesh.cornice", "mesh.belt-course", "mesh.roof-cap", "mesh.corner-quoins"])
    );
    expect(ir.semanticIndex.filter((entry) => entry.batchId === "mesh.wall-panels")).toHaveLength(
      expectedWallPanelCount
    );
    expect(ir.semanticIndex.every((entry) => entry.semanticPath.startsWith(`building/${spec.familyId}/`))).toBe(true);
  });
});
