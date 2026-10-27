import { describe, expect, it } from "vitest";
import brief from "../../../../docs/research/utdg-late19c-v0.1.json";
import oldSource from "../../../../docs/reviews/2026-10-17-c5-p1/two-storey-source.json";
import oldResolution from "../../../../docs/reviews/2026-10-17-c5-p1/two-storey-resolution.json";
import oldMetrics from "../../../../docs/reviews/2026-10-17-c5-p1/two-storey-metrics.json";
import type { ConstructionGenerationInput, ConstructionGenerationSource } from "../contracts/constructionGeneration";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { compileConstructionGeneration, constructionRecipeReference, readConstructionGenerationResolution, resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { getConstructionRecipeDefinition, getConstructionRecipeOptions } from "../core/constructionRecipeCatalog";
import { sha256Hex } from "../core/contentHash";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";

async function source(recipeId = "restrained-masonry-rectangular", change?: (input: ConstructionGenerationInput) => void) {
  const input: ConstructionGenerationInput = {
    schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: "generated-test",
    intent: { schemaVersion: "0.1.0", prompt: "Masonry building", requested: { floorCount: 3, bayCount: 4, trimDensity: "moderate" },
      seeds: { family: "family", building: "building", material: "material", trim: "trim" }, locks: [],
      psg: { traceId: "generation-test", evaluatedVariables: { "building.floorCount": 3 } } },
    recipe: await constructionRecipeReference(recipeId), reference: {
      schemaVersion: "0.1.0", kind: "construction-reference-snapshot", id: "late19c-demo", revision: "1",
      origin: { kind: "local-demo", locator: "docs/research/utdg-late19c-v0.1.json" },
      architectureCoverage: "unknown", coverageNotes: "Draft material vocabulary; architecture evidence unverified.", claims: [],
      materialBrief: structuredClone(brief) as ConstructionGenerationInput["reference"]["materialBrief"]
    }, intentionalExceptions: []
  };
  change?.(input);
  return captureConstructionGenerationSource(input);
}
async function recapture(value: ConstructionGenerationSource, change: (input: ConstructionGenerationInput) => void) {
  const input: ConstructionGenerationInput = { schemaVersion: "0.1.0", kind: "construction-generation-input",
    documentId: value.documentId, intent: structuredClone(value.intent), recipe: structuredClone(value.recipe),
    reference: structuredClone(value.reference), intentionalExceptions: structuredClone(value.intentionalExceptions) };
  change(input); return captureConstructionGenerationSource(input);
}

const ids = ["restrained-masonry-rectangular", "deep-reveal-masonry", "projecting-cornice-masonry"];
const digest = (value: ArrayBufferView<ArrayBufferLike>) => sha256Hex(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
async function matched(recipeId: string) {
  return source(recipeId, input => { input.intent.locks = [
    { semanticPath: "construction/footprint/widthM", scope: "building", lockedValue: 12 },
    { semanticPath: "construction/footprint/depthM", scope: "building", lockedValue: 10 },
    { semanticPath: "construction/opening/widthM", scope: "building", lockedValue: 1.22 },
    { semanticPath: "construction/opening/heightM", scope: "building", lockedValue: 2.12 }
  ]; });
}
const param = (result: Awaited<ReturnType<typeof resolveConstructionGeneration>>, id: string, field: string) => {
  const node = result.graph.nodes.find(node => node.id === id)!;
  if (!("parameters" in node)) throw new Error("Expected parameter node");
  return (node.parameters as Record<string, number>)[field];
};

describe("pinned executable construction recipe catalog", () => {
  it("retains the original C5 recipe pin, resolution, mesh buffers and instance transforms", async () => {
    expect(await constructionRecipeReference()).toEqual(oldSource.recipe);
    expect(await readConstructionGenerationResolution(oldResolution, oldSource)).toEqual(oldResolution);
    const { construction, resolution } = await compileConstructionGeneration(oldSource);
    expect(resolution).toEqual(oldResolution);
    expect(construction.ir.bounds).toEqual(oldMetrics.bounds);
    for (const expected of oldMetrics.meshes) {
      const batch = construction.ir.meshBatches.find(item => item.batchId === expected.id)!;
      expect(await digest(batch.positions!)).toBe(expected.positions);
      expect(await digest(batch.normals!)).toBe(expected.normals);
      expect(await digest(batch.uvs!)).toBe(expected.uvs);
      expect(await digest(batch.indices!)).toBe(expected.indices);
    }
    for (const expected of oldMetrics.instances) {
      // Prototype IDs include the corrected trim compiler revision; authored scopes
      // and every archived instance transform remain exact.
      const role = expected.id.match(/prototype\.([^.]+)\./)![1];
      const matches = construction.ir.instanceBatches.filter(item => item.recipeId.startsWith(`construction.prototype.${role}.`));
      expect(matches).toHaveLength(1);
      const batch = matches[0];
      expect(batch.count).toBe(expected.count); expect(await digest(batch.transforms!)).toBe(expected.transforms);
    }
  });

  it("owns catalog data and reference inputs so callers cannot rewrite an existing pin", async () => {
    const original = await constructionRecipeReference("deep-reveal-masonry"), definition = getConstructionRecipeDefinition("deep-reveal-masonry");
    definition.choices.floorCount[0] = 12; definition.baseGraph.nodes.length = 0;
    definition.parameterChoices!["construction/window/recessM"].values[0] = 100;
    const options = getConstructionRecipeOptions(); options[0].label = "Changed"; options.length = 0;
    expect(await constructionRecipeReference("deep-reveal-masonry")).toEqual(original);
    expect(getConstructionRecipeOptions().map(item => item.id)).toEqual(ids);
    expect(getConstructionRecipeOptions()[0].label).toBe("Restrained masonry");
  });

  it("deep reveals change actual shared frame geometry, wall thickness and the door without adding preassembled meshes", async () => {
    const a = await compileConstructionGeneration(await matched(ids[0])), b = await compileConstructionGeneration(await matched(ids[1]));
    expect(param(b.resolution, "footprint", "wallDepthM")).toBeGreaterThan(param(a.resolution, "footprint", "wallDepthM"));
    expect(param(b.resolution, "window", "recessM")).toBeGreaterThan(param(a.resolution, "window", "recessM"));
    const frame = (value: typeof a) => value.construction.prototypes!.find(item => item.role === "frame")!;
    expect(await digest(frame(a).positions!)).not.toBe(await digest(frame(b).positions!));
    const minZ = (value: typeof a) => Math.min(...[...frame(value).positions!].filter((_, index) => index % 3 === 2));
    expect(minZ(b)).toBeGreaterThan(minZ(a));
    expect(minZ(b)).toBeCloseTo(param(b.resolution, "window", "recessM"), 5);
    expect(b.construction.prototypes).toHaveLength(3); expect(b.construction.ir.instanceBatches[0].count).toBe(47);
    const door = (value: typeof a) => value.construction.ir.meshBatches.find(item => item.batchId.includes("/node/door/") && item.role === "frame")!;
    expect(await digest(door(a).positions!)).not.toBe(await digest(door(b).positions!));
  });

  it("projecting cornice changes real continuous roof/profile geometry on the same locked footprint", async () => {
    const a = await compileConstructionGeneration(await matched(ids[0])), b = await compileConstructionGeneration(await matched(ids[2]));
    expect(param(b.resolution, "roof", "corniceProjectionM")).toBe(.38);
    const cornice = (value: typeof a) => value.construction.ir.meshBatches.find(item => item.batchId.includes("/node/roof/") && item.batchId.includes("cornice"))!;
    expect(await digest(cornice(a).positions!)).not.toBe(await digest(cornice(b).positions!));
    const maxX = (value: typeof a) => Math.max(...[...cornice(value).positions!].filter((_, index) => index % 3 === 0));
    expect(maxX(b)).toBeGreaterThan(maxX(a));
    expect(b.construction.ir.meshBatches.filter(item => item.role === "wall")).toHaveLength(4);
    expect(b.resolution.resolverVersion).toBe("construction-generation-resolver-v2");
    expect(a.resolution.resolverVersion).toBe("construction-generation-resolver-v1");
  });

  it.each(ids)("repeats and reopens a supported recipe from its pinned source: %s", async id => {
    const captured = await source(id), a = await compileConstructionGeneration(captured), b = await compileConstructionGeneration(captured);
    expect(b).toEqual(a);
    expect(await readConstructionGenerationResolution(JSON.parse(JSON.stringify(a.resolution)), JSON.parse(JSON.stringify(captured)))).toEqual(a.resolution);
  });

  it.each(ids)("compiles deterministic seeded variants at supported count boundaries: %s", async id => {
    const graphs = new Set<string>();
    for (const [floorCount, bayCount] of [[2, 3], [4, 5], [6, 6]]) for (const seed of ["boundary-a", "boundary-b"]) {
      const captured = await source(id, input => { Object.assign(input.intent.requested, { floorCount, bayCount }); input.intent.seeds.building = seed; });
      const result = await compileConstructionGeneration(captured); graphs.add(result.resolution.graphContentHash);
      expect(result.construction.ir.instanceBatches[0].count).toBe(4 * floorCount * bayCount - 1);
      expect(result.construction.ir.meshBatches.filter(item => item.role === "wall")).toHaveLength(4);
      expect(result.construction.prototypes).toHaveLength(3);
    }
    expect(graphs.size).toBeGreaterThan(3);
  }, 30000);

  it("keeps new recipe heads clear of the deepest supported cornice across seeded variants", async () => {
    for (const id of ids.slice(1)) for (let index = 0; index < 20; index++) {
      const captured = await source(id, input => { input.intent.seeds.building = "clearance-" + index; });
      const result = await compileConstructionGeneration(captured), r = result.resolution;
      expect(param(r, "facade", "upperHeightM") - param(r, "opening", "heightM") - param(r, "opening", "sillM") - param(r, "roof", "corniceHeightM")).toBeGreaterThan(.16);
    }
  }, 30000);

  it("retains explicit numeric locks over added seeded profile choices", async () => {
    for (const id of ids.slice(1)) for (const building of ["lock-a", "lock-b"]) {
      const captured = await source(id, input => { input.intent.seeds.building = building; input.intent.locks = [
        { semanticPath: "construction/window/recessM", scope: "family", lockedValue: .19 },
        { semanticPath: "construction/roof/corniceProjectionM", scope: "building", lockedValue: .16 }
      ]; });
      const result = await compileConstructionGeneration(captured);
      expect(param(result.resolution, "window", "recessM")).toBe(.19);
      expect(param(result.resolution, "roof", "corniceProjectionM")).toBe(.16);
      expect(result.resolution.choices.filter(choice => choice.basis === "locked")).toHaveLength(2);
    }
  });

  it("keeps a pinned material template's exact plan identity while recipes change only construction", async () => {
    const first = await source(), template = (await normalizeBuildingSpec(first.intent, stylePack)).spec;
    const expected = await planConstructionReferenceMaterials(template, first);
    for (const id of ids.slice(1)) {
      const captured = await source(id), plan = await planConstructionReferenceMaterials(template, captured);
      expect(plan.materialInputsHash).toBe(expected.materialInputsHash); expect(plan.atlas).toEqual(expected.atlas);
    }
  });

  it.each(ids.slice(1))("keeps material/reference-only input changes out of compiled geometry: %s", async id => {
    const first = await source(id), a = await compileConstructionGeneration(first);
    const changed = await recapture(first, input => { input.intent.seeds.material = "changed"; input.reference.materialBrief.nodes[0].generationHints.weathering = "changed description"; });
    expect((await compileConstructionGeneration(changed)).construction).toEqual(a.construction);
  });

  it.each(["id", "version", "contentHash"] as const)("rejects unavailable or mismatched variant recipe pins: %s", async field => {
    const first = await source(ids[1]), changed = await recapture(first, input => { input.recipe[field] = field === "contentHash" ? "a".repeat(64) : "unavailable"; });
    await expect(resolveConstructionGeneration(changed)).rejects.toThrow("unavailable or mismatched");
  });
});
