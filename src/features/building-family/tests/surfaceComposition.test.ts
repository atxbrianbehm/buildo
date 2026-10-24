import { vi } from "vitest";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import {
  BuildingSurfaceBindingArtifactSchema, BuildingSurfaceCompositionSchema,
  type BuildingSurfaceComposition, type BuildingSurfaceLayer
} from "../contracts/surfaceComposition";
import { AtlasChannelSchema } from "../contracts/atlasManifest";
import * as hashes from "../core/contentHash";
import { planAtlas } from "../materials/atlasPlanner";
import { resolveBuildingSurfaceBindings, BuildingSurfaceBindingError } from "../materials/resolveSurfaceBindings";

function surfaceFixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-split-plan",
    sourceIntentHash: "intent-split-plan",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4.2, 3.2, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 5,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

function stable(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
  return value;
}

async function actual(fidelityMode: "kit" | "proof", detailLevel: "high" | "low") {
  const spec = surfaceFixtureSpec(), atlas = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalog = await buildComponentCatalog(spec, atlas.manifest);
  const graph = await buildBuildingGraph(spec, catalog, { fidelityMode });
  const facadePlan = fidelityMode === "kit" ? planFacadeModules({ spec, kit: late19cApartmentKit }) : undefined;
  const ir = await compileBuilding({ spec, catalog, graph, fidelityMode, facadePlan, detailLevel });
  const contentHash = await hashes.hashCanonicalJson(atlas.manifest);
  return { ir, atlas: { manifest: atlas.manifest, contentHash } };
}
type Fixture = Awaited<ReturnType<typeof actual>>;
function empty(): BuildingSurfaceComposition {
  return { schemaVersion: "0.1.0", documentId: "surface-document", revision: 2, sources: [], layers: [] };
}
function entryFor(fixture: Fixture, role: "frame" | "wall" | "horizontalTrim" | "verticalTrim", instance = true, wholeBatch = false) {
  const slots = new Set(fixture.atlas.manifest.slots.filter(slot => slot.role === role).map(slot => slot.id));
  const batches = instance ? fixture.ir.instanceBatches : fixture.ir.meshBatches;
  const entry = fixture.ir.semanticIndex.find(value => batches.some(batch =>
    batch.batchId === value.batchId && batch.materialSlotId && slots.has(batch.materialSlotId)) &&
    value.elementIndex !== undefined && (!wholeBatch ||
      fixture.ir.semanticIndex.filter(other => other.batchId === value.batchId).length === 1));
  if (!entry) throw new Error("Expected actual semantic entry for " + role);
  const batch = batches.find(value => value.batchId === entry.batchId)!;
  return { ...entry, slotId: batch.materialSlotId!, relativePath: entry.semanticPath.slice(("building/" + fixture.ir.familyId + "/").length) };
}
function compose(fixture: Fixture) {
  const frame = entryFor(fixture, "frame"), wall = entryFor(fixture, "wall", false);
  return {
    schemaVersion: "0.1.0", documentId: "surface-document", revision: 2,
    sources: [
      { id: "paint", atlasContentHash: fixture.atlas.contentHash, slotId: frame.slotId },
      { id: "masonry", atlasContentHash: fixture.atlas.contentHash, slotId: wall.slotId }
    ], layers: []
  } satisfies BuildingSurfaceComposition;
}
function layer(id: string, target: BuildingSurfaceLayer["target"], sourceId = "paint"): BuildingSurfaceLayer {
  return { id, target, sourceId, mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 0.7,
    physicalSizeM: { width: 1, height: 2 }, channels: ["baseColor"] };
}
function input(fixture: Fixture, composition: BuildingSurfaceComposition = compose(fixture)) {
  return { composition, ir: fixture.ir, atlas: fixture.atlas };
}
async function rejected(value: Parameters<typeof resolveBuildingSurfaceBindings>[0], code: string) {
  await expect(resolveBuildingSurfaceBindings(value)).rejects.toMatchObject({ name: "BuildingSurfaceBindingError", code });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("R4.P0 semantic surface layers and pure binding resolution", () => {
  let fixtures: Fixture[];
  beforeAll(async () => {
    fixtures = [];
    for (const fidelity of ["kit", "proof"] as const)
      for (const detail of ["high", "low"] as const) fixtures.push(await actual(fidelity, detail));
  }, 30_000);

  it("projects actual kit/proof high/low IR without changing any geometry or atlas metadata", async () => {
    for (const fixture of fixtures) {
      const before = stable(fixture), composition = empty(), compositionBefore = structuredClone(composition);
      const artifact = await resolveBuildingSurfaceBindings(input(fixture, composition));
      expect(artifact.bindings).toHaveLength(fixture.ir.semanticIndex.length);
      expect(artifact.bindings.length).toBeGreaterThan(10);
      expect(artifact.bindings.every(binding => binding.layers.length === 0)).toBe(true);
      expect(artifact.geometryRef).toEqual({
        buildingId: fixture.ir.buildingId, familyId: fixture.ir.familyId, sourceGraphHash: fixture.ir.sourceGraphHash
      });
      const actualPaths = fixture.ir.semanticIndex.map(entry =>
        entry.semanticPath.slice(("building/" + fixture.ir.familyId + "/").length)).sort();
      expect(artifact.bindings.map(binding => binding.relativePath)).toEqual(actualPaths);
      for (const binding of artifact.bindings) {
        const entry = fixture.ir.semanticIndex.find(value => value.semanticPath.endsWith("/" + binding.relativePath))!;
        expect(binding.batchId).toBe(entry.batchId); expect(binding.elementIndex).toBe(entry.elementIndex ?? null);
      }
      expect(stable(fixture)).toStrictEqual(before); expect(composition).toEqual(compositionBefore);
      expect(BuildingSurfaceBindingArtifactSchema.parse(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact);
    }
  });

  it("applies shared defaults in order then the exact local frame, retaining every outside binding", async () => {
    for (const fixture of fixtures) {
      const frame = entryFor(fixture, "frame"), composition: BuildingSurfaceComposition = compose(fixture);
      composition.layers = [
        layer("local", { kind: "element", relativePath: frame.relativePath, expectedRole: "frame" }, "masonry"),
        layer("role-default", { kind: "role", role: "frame" }),
        layer("slot-default", { kind: "slot", slotId: frame.slotId })
      ];
      const before = stable(fixture), baseline = await resolveBuildingSurfaceBindings(input(fixture, empty()));
      const artifact = await resolveBuildingSurfaceBindings(input(fixture, composition));
      const chosen = artifact.bindings.find(binding => binding.relativePath === frame.relativePath)!;
      expect(chosen.layers.map(value => value.id)).toEqual(["role-default", "slot-default", "local"]);
      expect(chosen.layers.at(-1)!.source.slotId).toBe(compose(fixture).sources[1].slotId);
      let sharedOthers = 0;
      for (const binding of artifact.bindings) {
        const original = baseline.bindings.find(value => value.relativePath === binding.relativePath)!;
        expect({ ...binding, layers: [] }).toEqual(original);
        if (binding.relativePath === frame.relativePath) continue;
        const expected = [binding.role === "frame" ? "role-default" : null,
          binding.baseSlot.slotId === frame.slotId ? "slot-default" : null].filter(Boolean);
        expect(binding.layers.map(value => value.id)).toEqual(expected);
        if (expected.length) sharedOthers++;
      }
      expect(sharedOthers).toBeGreaterThan(1);
      expect(stable(fixture)).toStrictEqual(before);
      expect(artifact.geometryRef).toEqual(baseline.geometryRef);
      expect(artifact.compositionHash).not.toBe(baseline.compositionHash);
    }
  });

  it("binds one actual whole trim component without spreading to siblings sharing its material slot", async () => {
    for (const fixture of [fixtures[0], fixtures[2]]) {
      const trim = entryFor(fixture, "horizontalTrim", false, true);
      const baseline = await resolveBuildingSurfaceBindings(input(fixture, empty()));
      const composition: BuildingSurfaceComposition = compose(fixture);
      composition.layers = [layer("trim-weathering", {
        kind: "element", relativePath: trim.relativePath, expectedRole: "horizontalTrim"
      })];
      const artifact = await resolveBuildingSurfaceBindings(input(fixture, composition));
      const changed = artifact.bindings.filter(binding => binding.layers.length);
      expect(changed.map(value => value.relativePath)).toEqual([trim.relativePath]);
      expect(changed[0].coverage).toBe("whole-mesh");
      expect(fixture.ir.semanticIndex.filter(entry => entry.batchId === trim.batchId)).toHaveLength(1);
      const siblings = artifact.bindings.filter(value => value.relativePath !== trim.relativePath && value.baseSlot.slotId === trim.slotId);
      expect(siblings.length).toBeGreaterThan(0);
      for (const binding of artifact.bindings) if (binding.relativePath !== trim.relativePath)
        expect(binding).toEqual(baseline.bindings.find(value => value.relativePath === binding.relativePath));
    }
  });

  it("canonicalizes unordered metadata/source/channel sets while preserving meaningful layer order", async () => {
    const fixture = structuredClone(fixtures[0]), composition: BuildingSurfaceComposition = compose(fixture);
    composition.layers = [layer("first", { kind: "role", role: "frame" }), layer("second", { kind: "role", role: "frame" })];
    composition.layers[0].channels = ["orm", "baseColor", "normal"];
    const expected = await resolveBuildingSurfaceBindings(input(fixture, composition));
    fixture.ir.semanticIndex.reverse(); fixture.ir.instanceBatches.reverse(); fixture.ir.meshBatches.reverse();
    fixture.atlas.manifest.slots.reverse(); composition.sources.reverse(); composition.layers[0].channels.reverse();
    expect(await resolveBuildingSurfaceBindings(input(fixture, composition))).toEqual(expected);
    composition.layers.reverse();
    const reordered = await resolveBuildingSurfaceBindings(input(fixture, composition));
    expect(reordered.contentHash).not.toBe(expected.contentHash);
    expect(reordered.bindings.find(value => value.role === "frame")!.layers.map(value => value.id)).toEqual(["second", "first"]);
  });

  it("owns resolved source/mask pins and carries all existing aligned atlas channels and physical scale", async () => {
    const fixture = fixtures[0], composition: BuildingSurfaceComposition = compose(fixture);
    const value = layer("paint", { kind: "role", role: "frame" });
    value.channels = [...AtlasChannelSchema.options].reverse(); value.blend = "multiply";
    value.mask = { kind: "channel", sourceId: "masonry", channel: "height", component: "r" };
    composition.layers = [value];
    const artifact = await resolveBuildingSurfaceBindings(input(fixture, composition));
    const binding = artifact.bindings.find(item => item.role === "frame")!;
    expect(binding.layers[0]).toEqual({
      id: "paint", source: { atlasContentHash: fixture.atlas.contentHash, slotId: composition.sources[0].slotId },
      mask: { kind: "channel", source: { atlasContentHash: fixture.atlas.contentHash, slotId: composition.sources[1].slotId },
        channel: "height", component: "r" },
      blend: "multiply", opacity: 0.7, physicalSizeM: { width: 1, height: 2 }, channels: AtlasChannelSchema.options
    });
    const sibling = artifact.bindings.find(item => item.role === "frame" && item !== binding)!;
    expect(sibling.layers[0]).not.toBe(binding.layers[0]);
    binding.layers[0].physicalSizeM.width = 100; binding.layers[0].source.slotId = "changed";
    expect(sibling.layers[0].physicalSizeM.width).toBe(1); expect(value.physicalSizeM.width).toBe(1);
    expect(composition.sources[0].slotId).not.toBe("changed");
  });

  it("rejects malformed, non-JSON, duplicate and unresolved composition data without weakening schemas", async () => {
    const fixture = fixtures[0], valid: BuildingSurfaceComposition = compose(fixture);
    valid.layers = [layer("paint", { kind: "role", role: "frame" })];
    const cases: unknown[] = [
      { ...valid, schemaVersion: "9.0.0" }, { ...valid, extra: true }, { ...valid, revision: 0.5 },
      { ...valid, revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, sources: [valid.sources[0], valid.sources[0]] },
      { ...valid, layers: [valid.layers[0], valid.layers[0]] },
      { ...valid, layers: [{ ...valid.layers[0], sourceId: "missing" }] },
      { ...valid, layers: [{ ...valid.layers[0], opacity: Number.NaN }] },
      { ...valid, layers: [{ ...valid.layers[0], opacity: 1.1 }] },
      { ...valid, layers: [{ ...valid.layers[0], physicalSizeM: { width: 0, height: 1 } }] },
      { ...valid, layers: [{ ...valid.layers[0], channels: ["baseColor", "baseColor"] }] },
      { ...valid, layers: [{ ...valid.layers[0], blend: "unsupported" }] },
      { ...valid, layers: [{ ...valid.layers[0], mask: { kind: "channel", sourceId: "missing", channel: "height", component: "r" } }] },
      { ...valid, layers: [{ ...valid.layers[0], target: { kind: "element", relativePath: "building/family/trim", expectedRole: "frame" } }] },
      { ...valid, layers: [{ ...valid.layers[0], target: { kind: "element", relativePath: "trim/../frame", expectedRole: "frame" } }] }
    ];
    for (const composition of cases) {
      expect(BuildingSurfaceCompositionSchema.safeParse(composition).success).toBe(false);
      await rejected({ ...input(fixture), composition }, "surface.invalidComposition");
    }
    const cyclic: Record<string, unknown> = { ...valid }; cyclic.self = cyclic;
    await rejected({ ...input(fixture), composition: cyclic }, "surface.invalidComposition");
  });

  it("rejects outer/composition/runtime metadata accessors without invoking them", async () => {
    const fixture = fixtures[0], getter = vi.fn(() => { throw new Error("getter executed"); });
    const outer = input(fixture); Object.defineProperty(outer, "composition", { enumerable: true, get: getter });
    await rejected(outer, "surface.invalidInput");
    const composition = compose(fixture); Object.defineProperty(composition, "sources", { enumerable: true, get: getter });
    await rejected({ ...input(fixture), composition }, "surface.invalidComposition");
    const ir = structuredClone(fixture.ir);
    Object.defineProperty(ir.semanticIndex[0], "semanticPath", { enumerable: true, get: getter });
    await rejected({ ...input(fixture), ir }, "surface.invalidInput");
    const manifest = structuredClone(fixture.atlas.manifest);
    Object.defineProperty(manifest.slots[0], "role", { enumerable: true, get: getter });
    await rejected({ ...input(fixture), atlas: { ...fixture.atlas, manifest } }, "surface.invalidInput");
    const hole = structuredClone(fixture.ir); delete hole.semanticIndex[0];
    await rejected({ ...input(fixture), ir: hole }, "surface.invalidInput");
    expect(getter).not.toHaveBeenCalled();
  });

  it("diagnoses missing sources/targets, role drift and unsupported local mesh targets before hashing", async () => {
    const fixture = fixtures[0], composition: BuildingSurfaceComposition = compose(fixture), frame = entryFor(fixture, "frame");
    const realHash = hashes.hashCanonicalJson, hash = vi.spyOn(hashes, "hashCanonicalJson");
    try {
      composition.sources[0].atlasContentHash = "0".repeat(64);
      await rejected(input(fixture, composition), "surface.missingSource");
      composition.sources[0].atlasContentHash = fixture.atlas.contentHash; composition.sources[0].slotId = "unavailable";
      await rejected(input(fixture, composition), "surface.missingSource");
      composition.sources = compose(fixture).sources;
      composition.layers = [layer("missing", { kind: "element", relativePath: "facade/front/absent", expectedRole: "frame" })];
      await rejected(input(fixture, composition), "surface.missingTarget");
      composition.layers = [layer("role-drift", { kind: "element", relativePath: frame.relativePath, expectedRole: "glass" })];
      await rejected(input(fixture, composition), "surface.roleMismatch");
      const wall = entryFor(fixture, "wall", false);
      composition.layers = [layer("mesh", { kind: "element", relativePath: wall.relativePath, expectedRole: "wall" })];
      await rejected(input(fixture, composition), "surface.unsupportedTarget");
      expect(hash).not.toHaveBeenCalled(); expect(realHash).toBeTypeOf("function");
    } finally { hash.mockRestore(); }
  });

  it("rejects duplicate paths, aliases, duplicate batches/slots and invalid instance ownership", async () => {
    const fixture = fixtures[0], frame = entryFor(fixture, "frame");
    const incomplete = structuredClone(fixture);
    incomplete.ir.semanticIndex.splice(incomplete.ir.semanticIndex.findIndex(entry => entry.semanticPath === frame.semanticPath), 1);
    await rejected(input(incomplete), "surface.invalidContext");
    const unowned = structuredClone(fixture);
    unowned.ir.semanticIndex = unowned.ir.semanticIndex.filter(entry => entry.batchId !== unowned.ir.meshBatches[0].batchId);
    await rejected(input(unowned), "surface.invalidContext");
    const duplicate = structuredClone(fixture); duplicate.ir.semanticIndex.push({ ...duplicate.ir.semanticIndex[0] });
    await rejected(input(duplicate), "surface.ambiguousTarget");
    const alias = structuredClone(fixture);
    alias.ir.semanticIndex.push({ ...frame, semanticPath: "building/" + alias.ir.familyId + "/facade/front/alias" });
    await rejected(input(alias), "surface.ambiguousTarget");
    const batches = structuredClone(fixture); batches.ir.instanceBatches.push({ ...batches.ir.instanceBatches[0] });
    await rejected(input(batches), "surface.ambiguousTarget");
    const slots = structuredClone(fixture); slots.atlas.manifest.slots.push({ ...slots.atlas.manifest.slots[0] });
    await rejected(input(slots), "surface.invalidContext");
    const outside = structuredClone(fixture);
    const entry = outside.ir.semanticIndex.find(item => item.semanticPath === frame.semanticPath)!;
    entry.elementIndex = outside.ir.instanceBatches.find(batch => batch.batchId === entry.batchId)!.count;
    await rejected(input(outside), "surface.ambiguousTarget");
    const foreign = structuredClone(fixture); foreign.ir.semanticIndex[0].semanticPath = "building/wrong-family/mesh";
    await rejected(input(foreign), "surface.invalidContext");
    const missing = structuredClone(fixture); missing.ir.semanticIndex[0].batchId = "missing";
    await rejected(input(missing), "surface.invalidContext");
  });

  it("diagnoses unavailable aligned source and mask channels", async () => {
    const fixture = structuredClone(fixtures[0]), composition: BuildingSurfaceComposition = compose(fixture);
    fixture.atlas.manifest.channels = ["baseColor"];
    composition.layers = [layer("normal", { kind: "role", role: "frame" })];
    composition.layers[0].channels = ["normal"];
    await rejected(input(fixture, composition), "surface.missingChannel");
    composition.layers[0].channels = ["baseColor"];
    composition.layers[0].mask = { kind: "channel", sourceId: "masonry", channel: "height", component: "r" };
    await rejected(input(fixture, composition), "surface.missingChannel");
  });

  it("owns the complete consumed projection before an actual held hash await", async () => {
    const fixture = structuredClone(fixtures[0]), composition: BuildingSurfaceComposition = compose(fixture);
    composition.layers = [layer("paint", { kind: "role", role: "frame" })];
    const expected = await resolveBuildingSurfaceBindings(input(fixture, composition));
    const real = hashes.hashCanonicalJson, ready = deferred(), release = deferred();
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const result = await real(value); ready.resolve(); await release.promise; return result;
    });
    let pending: ReturnType<typeof resolveBuildingSurfaceBindings> | undefined;
    try {
      pending = resolveBuildingSurfaceBindings(input(fixture, composition)); await ready.promise;
      composition.documentId = "new-document"; composition.layers[0].opacity = 0; composition.sources[0].slotId = "changed";
      fixture.ir.familyId = "new-family"; fixture.ir.semanticIndex.length = 0; fixture.atlas.manifest.slots.length = 0;
      fixture.ir.instanceBatches[0].transforms?.fill(999);
      release.resolve();
      expect(await pending).toEqual(expected);
    } finally { release.resolve(); await pending?.catch(() => undefined); hash.mockRestore(); }
  });

  it("produces independently verifiable binding and normalized composition digests", async () => {
    const fixture = fixtures[0], composition: BuildingSurfaceComposition = compose(fixture);
    composition.layers = [layer("frame", { kind: "role", role: "frame" })];
    const result = await resolveBuildingSurfaceBindings(input(fixture, composition));
    const normalized = structuredClone(composition); normalized.sources.sort((a, b) => a.id < b.id ? -1 : 1);
    expect(result.compositionHash).toBe(await hashes.hashCanonicalJson(normalized));
    const { contentHash, ...payload } = result;
    expect(contentHash).toBe(await hashes.hashCanonicalJson(payload));
    const bad = structuredClone(result); bad.bindings.push(structuredClone(bad.bindings[0]));
    expect(BuildingSurfaceBindingArtifactSchema.safeParse(bad).success).toBe(false);
    expect(BuildingSurfaceBindingArtifactSchema.safeParse({ ...result, schemaVersion: "2.0.0" }).success).toBe(false);
    expect(new BuildingSurfaceBindingError("surface.missingTarget", "missing")).toBeInstanceOf(Error);
  });
});

