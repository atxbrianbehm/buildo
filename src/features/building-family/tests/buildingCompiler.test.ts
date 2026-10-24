import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { buildFacadeSplitPlan } from "../compiler/facadeSplitPlan";
import { expandBayWallPrimitives } from "../compiler/facadeWallSubdivision";
import { combinePrimitiveGeometry } from "../compiler/primitiveGeometry";
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
    expect(lowIr.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.opening-pockets", "mesh.roof"]);
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
            `building/${spec.familyId}/facade/front/floor/0/bay/\\d+/opening/storefront\\.door\\.recessed`
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

  it.each([
    ["proof", "high"], ["proof", "low"], ["kit", "high"], ["kit", "low"]
  ] as const)("compiles shared wall phase through the %s/%s path without changing source geometry", async (fidelityMode, detailLevel) => {
    const { spec, catalog } = await fixtureCompilerInputs();
    const graph = await buildBuildingGraph(spec, catalog, { fidelityMode });
    const facadePlan = fidelityMode === "kit" ? planFacadeModules({ spec, kit: late19cApartmentKit }) : undefined;
    const split = await buildFacadeSplitPlan({
      spec, wallDepthM: Math.max(0.02, catalog.recipes.find((recipe) => recipe.role === "wall")!.dimensionsM.depth),
      facadePlan, kit: fidelityMode === "kit" ? late19cApartmentKit : undefined,
      defaultOpeningMode: "front-only"
    });
    const originals = split.scopes.flatMap((scope) =>
      expandBayWallPrimitives(scope).map((primitive) => ({ primitive, facade: scope.facade })));
    const originalGeometry = combinePrimitiveGeometry(originals.map(({ primitive }) => primitive));
    const before = structuredClone({ spec, catalog, graph, facadePlan });
    const ir = await compileBuilding({ spec, catalog, graph, fidelityMode, detailLevel, facadePlan });
    const wall = ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels")!;
    expect(wall.positions).toEqual(originalGeometry.positions);
    expect(wall.normals).toEqual(originalGeometry.normals);
    expect(wall.indices).toEqual(originalGeometry.indices);
    expect(wall.uvs).toBeInstanceOf(Float32Array);
    const exteriorFace = { rear: 0, front: 1, right: 2, left: 3 };
    const sharedPoints = new Map<string, number[]>();
    let sharedPointCount = 0;
    let maximumV = 0;
    originals.forEach(({ facade }, piece) => {
      for (let face = 0; face < 6; face += 1) {
        const firstVertex = piece * 24 + face * 4;
        if (face !== exteriorFace[facade]) {
          expect(wall.uvs!.slice(firstVertex * 2, firstVertex * 2 + 8))
            .toEqual(originalGeometry.uvs.slice(firstVertex * 2, firstVertex * 2 + 8));
          continue;
        }
        for (let corner = 0; corner < 4; corner += 1) {
          const vertex = firstVertex + corner;
          const point = Array.from(wall.positions!.slice(vertex * 3, vertex * 3 + 3));
          const uv = Array.from(wall.uvs!.slice(vertex * 2, vertex * 2 + 2));
          const key = `${facade}/${point.join("/")}`;
          const prior = sharedPoints.get(key);
          if (prior) {
            expect(uv).toEqual(prior);
            sharedPointCount += 1;
          }
          sharedPoints.set(key, uv);
          maximumV = Math.max(maximumV, uv[1]);
        }
      }
    });
    expect(sharedPointCount).toBeGreaterThan(0);
    expect(maximumV).toBe(Math.max(...originalGeometry.positions.filter((_, index) => index % 3 === 1)));
    expect({ spec, catalog, graph, facadePlan }).toEqual(before);
    const repeated = await compileBuilding({ spec, catalog, graph, fidelityMode, detailLevel, facadePlan });
    expect(serializableIr(repeated)).toEqual(serializableIr(ir));
  });
});

describe("R2.P8 fresh primary roof geometry", () => {
  it.each([
    ["proof", "high"], ["proof", "low"], ["kit", "high"], ["kit", "low"]
  ] as const)("compiles a pitched primary roof while preserving flat and non-roof bytes through %s/%s", async (fidelityMode, detailLevel) => {
    const { createHash } = await import("node:crypto");
    const { z } = await import("zod");
    const { spec } = await fixtureCompilerInputs();
    const flatSpec = structuredClone(spec);
    flatSpec.massing.roof = { type: "flat" };
    flatSpec.selectedFamilies.roof = "flat-membrane";
    const gableSpec = structuredClone(flatSpec);
    gableSpec.massing.roof = { type: "gable", pitchDegrees: 28 };
    gableSpec.selectedFamilies.roof = "simple-gable";
    const sourceBefore = structuredClone({ flatSpec, gableSpec });
    const atlas = await planAtlas(flatSpec);
    const flatCatalog = await buildComponentCatalog(flatSpec, atlas.manifest);
    const gableCatalog = await buildComponentCatalog(gableSpec, atlas.manifest);
    expect(flatCatalog.recipes.find((recipe) => recipe.role === "roof")?.kind).toBe("flatRoof");
    expect(gableCatalog.recipes.find((recipe) => recipe.role === "roof")?.kind).toBe("gableRoof");
    expect(gableSpec.massing.widthM).toBe(flatSpec.massing.widthM);
    expect(gableSpec.massing.depthM).toBe(flatSpec.massing.depthM);
    expect(gableSpec.massing.floorHeightsM).toEqual(flatSpec.massing.floorHeightsM);
    const flatGraph = await buildBuildingGraph(flatSpec, flatCatalog, { fidelityMode });
    const gableGraph = await buildBuildingGraph(gableSpec, gableCatalog, { fidelityMode });
    const flat = await compileBuilding({ spec: flatSpec, catalog: flatCatalog, graph: flatGraph, fidelityMode, detailLevel });
    const gable = await compileBuilding({ spec: gableSpec, catalog: gableCatalog, graph: gableGraph, fidelityMode, detailLevel });
    RuntimeBuildingIRSchema.parse(flat);
    RuntimeBuildingIRSchema.parse(gable);
    const flatRoof = flat.meshBatches.find((batch) => batch.batchId === "mesh.roof");
    const gableRoof = gable.meshBatches.find((batch) => batch.batchId === "mesh.roof");
    if (!flatRoof?.positions || !flatRoof.normals || !flatRoof.uvs || !flatRoof.indices ||
        !gableRoof?.positions || !gableRoof.normals || !gableRoof.uvs || !gableRoof.indices) {
      throw new Error("Expected actual typed roof geometry in both compiled results");
    }
    const flatPositions = flatRoof.positions;
    const positions = gableRoof.positions;
    const normals = gableRoof.normals;
    const uvs = gableRoof.uvs;
    const indices = gableRoof.indices;
    const eaves = flatSpec.massing.floorHeightsM.reduce((height, value) => height + value, 0);
    const halfWidth = flatSpec.massing.widthM / 2;
    const halfDepth = flatSpec.massing.depthM / 2;
    const pitch = 28 * Math.PI / 180;
    const rise = Math.tan(pitch) * halfDepth;
    const coordinate = (values: Float32Array, axis: number) => Array.from(values).filter((_, index) => index % 3 === axis);
    expect(Math.min(...coordinate(flatPositions, 1))).toBeCloseTo(eaves, 4);
    expect(Math.max(...coordinate(flatPositions, 1))).toBeCloseTo(eaves + Math.max(0.01, flatSpec.massing.parapetHeightM), 4);
    const flatSerialized = serializableIr(flat);
    const gableSerialized = serializableIr(gable);
    expect(gableSerialized.meshBatches.filter((batch) => batch.batchId !== "mesh.roof"))
      .toEqual(flatSerialized.meshBatches.filter((batch) => batch.batchId !== "mesh.roof"));
    expect(gableSerialized.instanceBatches).toEqual(flatSerialized.instanceBatches);
    expect(gable.semanticIndex).toEqual(flat.semanticIndex);

    type RawBuffer = Float32Array | Uint32Array | Uint16Array;
    const receipt = (key: string, value: RawBuffer | undefined) => {
      if (!value) throw new Error("Missing protected raw buffer: " + key);
      return {
        key, arrayType: value.constructor.name, byteLength: value.byteLength,
        sha256: createHash("sha256").update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).digest("hex")
      };
    };
    const meshReceipts = (batch: RuntimeBuildingIR["meshBatches"][number]) => [
      receipt(batch.batchId + "/positions", batch.positions),
      receipt(batch.batchId + "/normals", batch.normals),
      receipt(batch.batchId + "/uvs", batch.uvs),
      receipt(batch.batchId + "/indices", batch.indices)
    ];
    const BufferReceipt = z.object({
      key: z.string().min(1), arrayType: z.enum(["Float32Array", "Uint32Array", "Uint16Array"]),
      byteLength: z.int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/)
    }).strict();
    const ControlReceipt = z.object({
      schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r2-p8-flat-geometry-control"),
      fidelityMode: z.enum(["proof", "kit"]), detailLevel: z.enum(["high", "low"]),
      roof: z.array(BufferReceipt).length(4), nonRoof: z.array(BufferReceipt).min(1)
    }).strict();
    // Emitted before the causal roof assertion so the retained red and green runs bind the same flat controls.
    console.info("R2_P8_FLAT_GEOMETRY_RECEIPT " + JSON.stringify(ControlReceipt.parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r2-p8-flat-geometry-control", fidelityMode, detailLevel,
      roof: meshReceipts(flatRoof),
      nonRoof: [
        ...flat.meshBatches.filter((batch) => batch.batchId !== "mesh.roof").flatMap(meshReceipts),
        ...flat.instanceBatches.map((batch) => receipt(batch.batchId + "/transforms", batch.transforms))
      ]
    })));

    // Causal assertion: the existing compiler emits a parapet-height box even with a matching gable recipe.
    expect(Math.max(...coordinate(positions, 1))).toBeCloseTo(eaves + rise, 4);
    expect(Math.min(...coordinate(positions, 1))).toBeCloseTo(eaves, 4);
    expect(Math.min(...coordinate(positions, 0))).toBeCloseTo(-halfWidth, 4);
    expect(Math.max(...coordinate(positions, 0))).toBeCloseTo(halfWidth, 4);
    expect(Math.min(...coordinate(positions, 2))).toBeCloseTo(-halfDepth, 4);
    expect(Math.max(...coordinate(positions, 2))).toBeCloseTo(halfDepth, 4);
    expect(positions).not.toEqual(flatPositions);
    assertMeshIntegrity(gable);
    const slopeVertices = { positive: [] as number[], negative: [] as number[] };
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      const x = positions[vertex * 3], y = positions[vertex * 3 + 1], zValue = positions[vertex * 3 + 2];
      const nx = normals[vertex * 3], ny = normals[vertex * 3 + 1], nz = normals[vertex * 3 + 2];
      expect([x, y, zValue, nx, ny, nz, uvs[vertex * 2], uvs[vertex * 2 + 1]].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      if (ny > 0.1 && Math.abs(nz) > 0.1) {
        expect(nx).toBeCloseTo(0, 5);
        expect(ny).toBeCloseTo(Math.cos(pitch), 5);
        expect(Math.abs(nz)).toBeCloseTo(Math.sin(pitch), 5);
        expect(y).toBeCloseTo(eaves + rise * (1 - Math.abs(zValue) / halfDepth), 4);
        (nz > 0 ? slopeVertices.positive : slopeVertices.negative).push(vertex);
      }
    }
    for (const vertices of Object.values(slopeVertices)) {
      expect(vertices.length).toBeGreaterThanOrEqual(4);
      const us = vertices.map((vertex) => uvs[vertex * 2]);
      const vs = vertices.map((vertex) => uvs[vertex * 2 + 1]);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(flatSpec.massing.widthM, 4);
      expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(Math.hypot(halfDepth, rise), 4);
    }
    const ridge = Array.from({ length: positions.length / 3 }, (_, vertex) => vertex)
      .filter((vertex) => Math.abs(positions[vertex * 3 + 2]) < 1e-4 && Math.abs(positions[vertex * 3 + 1] - eaves - rise) < 1e-4);
    expect(ridge.some((vertex) => Math.abs(positions[vertex * 3] + halfWidth) < 1e-4)).toBe(true);
    expect(ridge.some((vertex) => Math.abs(positions[vertex * 3] - halfWidth) < 1e-4)).toBe(true);
    expect(indices.length % 3).toBe(0);
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const a = indices[triangle], b = indices[triangle + 1], c = indices[triangle + 2];
      const ab = [0, 1, 2].map((axis) => positions[b * 3 + axis] - positions[a * 3 + axis]);
      const ac = [0, 1, 2].map((axis) => positions[c * 3 + axis] - positions[a * 3 + axis]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...cross);
      expect(length).toBeGreaterThan(1e-6);
      const alignment = cross.reduce((dot, value, axis) => dot + value / length * normals[a * 3 + axis], 0);
      expect(alignment).toBeGreaterThan(0.9999);
    }
    expect({ flatSpec, gableSpec }).toEqual(sourceBefore);
  }, 20000);
});

describe("R2.P8 roof pitch boundaries", () => {
  it("honors distinct valid pitches and the 28-degree default without changing protected geometry", async () => {
    const { spec } = await fixtureCompilerInputs();
    const atlas = await planAtlas(spec);
    const results: { pitch: number | undefined; ir: RuntimeBuildingIR; roof: NonNullable<RuntimeBuildingIR["meshBatches"][number]> }[] = [];
    for (const pitch of [20, 40, undefined, 28]) {
      const controlled = structuredClone(spec);
      controlled.massing.roof = pitch === undefined ? { type: "gable" } : { type: "gable", pitchDegrees: pitch };
      controlled.selectedFamilies.roof = "simple-gable";
      const catalog = await buildComponentCatalog(controlled, atlas.manifest);
      const graph = await buildBuildingGraph(controlled, catalog, { fidelityMode: "proof" });
      const input = { spec: controlled, catalog, graph, fidelityMode: "proof" as const, detailLevel: "low" as const };
      const ir = await compileBuilding(input);
      expect(serializableIr(await compileBuilding(input))).toEqual(serializableIr(ir));
      const roof = ir.meshBatches.find((batch) => batch.batchId === "mesh.roof");
      if (!roof?.positions || !roof.normals || !roof.uvs || !roof.indices) throw new Error("Expected compiled pitched roof buffers");
      const eaves = controlled.massing.floorHeightsM.reduce((height, value) => height + value, 0);
      const rise = Math.tan((pitch ?? 28) * Math.PI / 180) * controlled.massing.depthM / 2;
      const ys = Array.from(roof.positions).filter((_, index) => index % 3 === 1);
      expect(Math.min(...ys)).toBeCloseTo(eaves, 4);
      expect(Math.max(...ys)).toBeCloseTo(eaves + rise, 4);
      for (const [axis, sign, expectedU, expectedV] of [
        [0, -1, controlled.massing.depthM, rise],
        [0, 1, controlled.massing.depthM, rise],
        [1, -1, controlled.massing.widthM, controlled.massing.depthM]
      ] as const) {
        const vertices = Array.from({ length: roof.positions.length / 3 }, (_, vertex) => vertex)
          .filter((vertex) => Math.abs(roof.normals![vertex * 3 + axis] - sign) < 1e-5);
        expect(vertices.length).toBeGreaterThanOrEqual(3);
        const us = vertices.map((vertex) => roof.uvs![vertex * 2]);
        const vs = vertices.map((vertex) => roof.uvs![vertex * 2 + 1]);
        expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(expectedU, 4);
        expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(expectedV, 4);
      }
      results.push({ pitch, ir, roof });
    }
    const [shallow, steep, fallback, explicit] = results;
    for (const current of results) {
      expect(current.roof.indices).toEqual(shallow.roof.indices);
      expect(Array.from(current.roof.positions!).filter((_, index) => index % 3 !== 1))
        .toEqual(Array.from(shallow.roof.positions!).filter((_, index) => index % 3 !== 1));
      expect(serializableIr(current.ir).meshBatches.filter((batch) => batch.batchId !== "mesh.roof"))
        .toEqual(serializableIr(shallow.ir).meshBatches.filter((batch) => batch.batchId !== "mesh.roof"));
      expect(serializableIr(current.ir).instanceBatches).toEqual(serializableIr(shallow.ir).instanceBatches);
    }
    const top = (roof: typeof shallow.roof) => Math.max(...Array.from(roof.positions!).filter((_, index) => index % 3 === 1));
    expect(top(steep.roof)).toBeGreaterThan(top(shallow.roof));
    expect(fallback.roof).toEqual(explicit.roof);
    expect(serializableIr(fallback.ir).instanceBatches).toEqual(serializableIr(explicit.ir).instanceBatches);
  }, 20000);

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 90, 180])("rejects an invalid gable pitch locally: %s", async (pitchDegrees) => {
    const { spec } = await fixtureCompilerInputs();
    spec.massing.roof = { type: "gable", pitchDegrees: 28 };
    spec.selectedFamilies.roof = "simple-gable";
    const atlas = await planAtlas(spec);
    const catalog = await buildComponentCatalog(spec, atlas.manifest);
    const graph = await buildBuildingGraph(spec, catalog, { fidelityMode: "proof" });
    const invalid = structuredClone(spec);
    invalid.massing.roof.pitchDegrees = pitchDegrees;
    const before = structuredClone({ invalid, catalog, graph });
    // A valid accepted recipe keeps recipe-schema rejection out of the compiler pitch boundary.
    await expect(compileBuilding({ spec: invalid, catalog, graph, fidelityMode: "proof", detailLevel: "low" }))
      .rejects.toThrow(/pitch/i);
    expect({ invalid, catalog, graph }).toEqual(before);
  });
});
