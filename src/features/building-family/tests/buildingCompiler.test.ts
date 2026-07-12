import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { buildFacadeSplitPlan } from "../compiler/facadeSplitPlan";
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
      const epsilon = 1e-4;
      expect(positions[index]).toBeGreaterThanOrEqual(ir.bounds.min[0] - epsilon);
      expect(positions[index]).toBeLessThanOrEqual(ir.bounds.max[0] + epsilon);
      expect(positions[index + 1]).toBeGreaterThanOrEqual(ir.bounds.min[1] - epsilon);
      expect(positions[index + 1]).toBeLessThanOrEqual(ir.bounds.max[1] + epsilon);
      expect(positions[index + 2]).toBeGreaterThanOrEqual(ir.bounds.min[2] - epsilon);
      expect(positions[index + 2]).toBeLessThanOrEqual(ir.bounds.max[2] + epsilon);
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
    expect(ir.bounds.min[1]).toBeGreaterThanOrEqual(-1e-6);
    expect(ir.bounds.min[1]).toBeLessThanOrEqual(1e-6);
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
    expect(windowBatch?.materialSlotId).toBe("frame.primary");
    // Kit-mode openings come from the facade plan (front/side/rear), so count is plan-driven.
    expect(windowBatch?.count).toBeGreaterThan(spec.massing.floorCount);
    expect(windowBatch?.transforms).toBeInstanceOf(Float32Array);
    expect(windowBatch?.transforms?.length).toBe(windowBatch!.count * 16);
    const glassBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window.glass");
    expect(glassBatch?.materialSlotId).toBe("glass.primary");
    expect(glassBatch?.count).toBe(windowBatch?.count);
    expect(ir.meshBatches.some((batch) => batch.role === "window")).toBe(false);
    expect(catalog.recipes.filter((recipe) => recipe.role === "window")).toHaveLength(1);
    expect(ir.semanticIndex.some((entry) => entry.semanticPath.includes("/opening/"))).toBe(true);
  });

  it("proof mode uses front-only split openings without an art-kit plan", async () => {
    const { spec, catalog } = await fixtureCompilerInputs();
    const proofGraph = await buildBuildingGraph(spec, catalog, { fidelityMode: "proof" });
    const ir = await compileBuilding({
      spec,
      catalog,
      graph: proofGraph,
      fidelityMode: "proof"
    });
    const windowBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window");
    const doorBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.door");
    const frontCells = spec.massing.floorCount * spec.facade.frontBayCount;

    // Front-only split: one door on ground center bay, windows on remaining front cells.
    expect(doorBatch?.count).toBe(1);
    expect(windowBatch?.count).toBe(frontCells - 1);
    expect((windowBatch?.count ?? 0) + (doorBatch?.count ?? 0)).toBe(frontCells);
    expect(ir.meshBatches.some((batch) => batch.role === "window")).toBe(false);
    expect(catalog.recipes.filter((recipe) => recipe.role === "window")).toHaveLength(1);
  });

  it("kit mode opening instances are 1:1 with facade split plan openings", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const wallDepthM = catalog.recipes.find((recipe) => recipe.role === "wall")?.dimensionsM.depth ?? 0.34;
    const split = await buildFacadeSplitPlan({
      spec,
      wallDepthM,
      facadePlan,
      kit: late19cApartmentKit
    });
    const ir = await compileBuilding({
      spec,
      catalog,
      graph,
      fidelityMode: "kit",
      facadePlan
    });
    const windowCount =
      ir.instanceBatches.find((batch) => batch.batchId === "instances.window")?.count ?? 0;
    const doorCount = ir.instanceBatches.find((batch) => batch.batchId === "instances.door")?.count ?? 0;

    expect(split.openings.length).toBeGreaterThan(0);
    expect(windowCount + doorCount).toBe(split.openings.length);
    expect(doorCount).toBe(split.openings.filter((opening) => opening.kind === "door").length);
    expect(windowCount).toBe(split.openings.filter((opening) => opening.kind === "window").length);
  });

  it("switches between high and low component detail without changing the default high-detail output", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const defaultIr = await compileBuilding({ spec, catalog, graph });
    const highIr = await compileBuilding({ spec, catalog, graph, detailLevel: "high" });
    const lowIr = await compileBuilding({ spec, catalog, graph, detailLevel: "low" });

    expect(serializableIr(highIr)).toEqual(serializableIr(defaultIr));
    expect(lowIr.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.roof"]);
    expect(lowIr.instanceBatches.map((batch) => batch.batchId)).toEqual([
      "instances.window",
      "instances.window.glass",
      "instances.door",
      "instances.door.glass"
    ]);
    expect(highIr.meshBatches.some((batch) => batch.batchId === "mesh.vertical-pilasters")).toBe(true);
    expect(highIr.meshBatches.some((batch) => batch.batchId === "mesh.spandrels")).toBe(true);
    expect(highIr.meshBatches.some((batch) => batch.batchId === "mesh.base-plinth")).toBe(true);
    expect(highIr.meshBatches.some((batch) => batch.batchId === "mesh.opening-pockets")).toBe(true);
    expect(highIr.meshBatches.some((batch) => batch.batchId === "mesh.storefront-hierarchy")).toBe(true);
    expect(highIr.instanceBatches.some((batch) => batch.batchId === "instances.vertical-trim")).toBe(false);
    expect(catalog.recipes.find((recipe) => recipe.role === "cornice")?.profileRecipeId).toContain("profile.");
    expect(lowIr.semanticIndex.some((entry) => entry.stage === "trim")).toBe(false);
    expect(lowIr.sourceGraphHash).not.toBe(highIr.sourceGraphHash);
    expect(lowIr.metrics.triangleCount).toBeLessThan(highIr.metrics.triangleCount);
    // High-detail facade mass (pilasters/spandrels/trim) is mesh, not instances.
    expect(highIr.meshBatches.length).toBeGreaterThan(lowIr.meshBatches.length);
    expect(lowIr.metrics.instanceCount).toBe(highIr.metrics.instanceCount);
  });

  it("indexes every emitted element with semantic path, batch id, stage, and element index", async () => {
    const { spec, catalog, graph } = await fixtureCompilerInputs();
    const ir = await compileBuilding({ spec, catalog, graph });
    expect(
      ir.semanticIndex.some(
        (entry) =>
          entry.batchId === "instances.window" &&
          entry.stage === "openings" &&
          entry.semanticPath.includes(`building/${spec.familyId}/facade/front/`)
      )
    ).toBe(true);
    // Door bay is seed-weighted around center (±1), not a fixed middle bay.
    expect(ir.semanticIndex).toContainEqual(
      expect.objectContaining({
        semanticPath: expect.stringMatching(
          new RegExp(
            `building/${spec.familyId}/facade/front/floor/0/bay/\\d+/opening/door\\.storefront\\.recessed`
          )
        ),
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
    // Subdivided walls emit many pier/sill/head pieces (not one slab per bay).
    expect(ir.semanticIndex.filter((entry) => entry.batchId === "mesh.wall-panels").length).toBeGreaterThan(
      spec.massing.floorCount * spec.facade.frontBayCount
    );
    expect(ir.semanticIndex.some((entry) => entry.semanticPath.includes("wall/subdivided"))).toBe(true);
    expect(ir.semanticIndex.every((entry) => entry.semanticPath.startsWith(`building/${spec.familyId}/`))).toBe(true);
  });
});
