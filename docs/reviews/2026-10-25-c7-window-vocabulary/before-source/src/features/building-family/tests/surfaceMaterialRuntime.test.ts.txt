import { vi } from "vitest";
import { InstancedMesh, Matrix4, NoColorSpace, SRGBColorSpace } from "three";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { BuildingSurfaceComposition, BuildingSurfaceLayer } from "../contracts/surfaceComposition";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import * as hashes from "../core/contentHash";
import { createAtlasLabFixture } from "../materials/atlasLabFixture";
import { hashPackedAtlasContent } from "../materials/atlasPacker";
import { composeBuildingSurfaceTile } from "../materials/composeSurfaceTile";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { createBuildingFamilyRuntime } from "../renderer-three/familyRuntime";
import { resolveWindowSelectionFromSemanticPath } from "../renderer-three/buildingSceneAdapter";
import { prepareBuildingSurfaceRuntime, type BuildingSurfaceRuntime } from "../renderer-three/surfaceMaterialRuntime";

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
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
  return value;
}
async function makeInputs() {
  const { packedAtlas: atlas } = await createAtlasLabFixture(), spec = surfaceFixtureSpec();
  const catalog = await buildComponentCatalog(spec, atlas.manifest);
  const graph = await buildBuildingGraph(spec, catalog, { fidelityMode: "kit" });
  const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
  const ir = await compileBuilding({ spec, catalog, graph, fidelityMode: "kit", facadePlan });
  const gallery = await buildComponentGallery({ catalog, ir });
  const base: BuildingSurfaceComposition = { schemaVersion: "0.1.0", documentId: "runtime-surface", revision: 0,
    sources: [{ id: "paint", slotId: atlas.manifest.slots.find(slot => slot.role === "wall")!.id, atlasContentHash: atlas.contentHash }], layers: [] };
  const bindings = await resolveBuildingSurfaceBindings({ composition: base, ir, atlas });
  const frame = bindings.bindings.find(binding => binding.role === "frame" && binding.kind === "instance" &&
    catalog.recipes.find(recipe => recipe.id === ir.instanceBatches.find(batch => batch.batchId === binding.batchId)?.recipeId)?.role === "window")!;
  expect(frame).toBeDefined();
  const neighbour = bindings.bindings.find(binding => binding.batchId === frame.batchId && binding.elementIndex !== frame.elementIndex)!;
  expect(neighbour).toBeDefined();
  return { atlas, ir, catalog, gallery, base, bindings, frame, neighbour };
}
let inputs: Awaited<ReturnType<typeof makeInputs>>;
beforeAll(async () => { inputs = await makeInputs(); }, 30_000);
function composition(layers: BuildingSurfaceLayer[]): BuildingSurfaceComposition { return { ...structuredClone(inputs.base), layers }; }
function paint(overrides: Partial<BuildingSurfaceLayer> = {}): BuildingSurfaceLayer {
  const slot = inputs.atlas.manifest.slots.find(value => value.id === inputs.frame.baseSlot.slotId)!;
  return { id: "paint", target: { kind: "element", relativePath: inputs.frame.relativePath, expectedRole: "frame" },
    sourceId: "paint", mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 1,
    physicalSizeM: { ...slot.physicalSizeM }, channels: ["baseColor", "orm"], ...overrides };
}
function family() { return createBuildingFamilyRuntime({ familyId: inputs.ir.familyId, packedAtlas: inputs.atlas }); }
const fullPath = (relativePath: string) => "building/" + inputs.ir.familyId + "/" + relativePath;
function scene(target: ReturnType<typeof family>, surfaceRuntime?: BuildingSurfaceRuntime) {
  return target.createOrReplaceBuilding({ ir: inputs.ir, catalog: inputs.catalog, componentGallery: inputs.gallery, surfaceRuntime });
}
function matrixAt(object: InstancedMesh, index: number) {
  const matrix = new Matrix4(); object.getMatrixAt(index, matrix); return matrix.toArray();
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { resolve, promise }; }

describe("R4.P2 actual surface renderer integration", () => {
  it("changes one actual window frame material while preserving neighbours, glass, source geometry and native transforms", async () => {
    const before = stable({ ir: inputs.ir, atlas: inputs.atlas }), target = family();
    const surface = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    try {
      const original = scene(target), oldMaterial = original.semanticLookup.get(fullPath(inputs.frame.relativePath))!.object.material;
      const materialPointers = new Map([...original.semanticLookup].map(([path, lookup]) => [path, lookup.object.material]));
      const runtime = scene(target, surface), selected = runtime.semanticLookup.get(fullPath(inputs.frame.relativePath))!;
      expect(original.disposed).toBe(true);
      expect(selected.object.material).not.toBe(oldMaterial);
      for (const [path, lookup] of runtime.semanticLookup) if (path !== selected.semanticPath)
        expect(lookup.object.material).toBe(materialPointers.get(path));
      const neighbour = runtime.semanticLookup.get(fullPath(inputs.neighbour.relativePath))!;
      expect(neighbour.object).not.toBe(selected.object);
      expect(neighbour.object.material).toBe(oldMaterial);
      expect(selected.elementIndex).toBe(inputs.frame.elementIndex); expect(selected.instanceIndex).toBe(0);
      const batch = inputs.ir.instanceBatches.find(value => value.batchId === inputs.frame.batchId)!;
      expect(matrixAt(selected.object as InstancedMesh, selected.instanceIndex!))
        .toEqual(Array.from(batch.transforms!.slice(inputs.frame.elementIndex! * 16, (inputs.frame.elementIndex! + 1) * 16)));
      expect(runtime.metrics.instanceCount).toBe(inputs.ir.metrics.instanceCount);
      expect(stable({ ir: inputs.ir, atlas: inputs.atlas })).toStrictEqual(before);
      const exact = resolveWindowSelectionFromSemanticPath(runtime, inputs.catalog, selected.semanticPath)!;
      expect(exact.object).toBe(selected.object); expect(exact.instanceIndex).toBe(0);
      expect(exact.elementIndex).toBe(inputs.frame.elementIndex);
      const gallery = runtime.galleryObjects.get(batch.recipeId)!;
      const entry = inputs.gallery.entries.find(value => value.recipeId === batch.recipeId)!;
      if (entry.sampleSemanticPath) expect(gallery.object).toBe(runtime.semanticLookup.get(entry.sampleSemanticPath)!.object);
      expect(surface.metrics.materialCount).toBe(1); expect(surface.metrics.textureCount).toBe(5);
      expect(target.metrics.textureCount).toBe(10);
    } finally { target.dispose(); surface.dispose(); }
  });

  it("deduplicates shared recipes before evaluation and shares actual five-channel GPU inputs across all matching instances", async () => {
    const target = family(), layers = [paint({ target: { kind: "role", role: "frame" } })];
    const surface = await prepareBuildingSurfaceRuntime({ composition: composition(layers), ir: inputs.ir, atlas: inputs.atlas });
    try {
      const runtime = scene(target, surface);
      const objects = inputs.bindings.bindings.filter(binding => binding.role === "frame")
        .map(binding => runtime.semanticLookup.get(fullPath(binding.relativePath))!.object);
      expect(objects.length).toBeGreaterThan(20);
      expect(new Set(objects.map(object => object.material)).size).toBe(1);
      expect(surface.metrics).toMatchObject({ evaluatedRecipes: 1, materialCount: 1, textureCount: 5, leases: 1 });
      const artifact = await resolveBuildingSurfaceBindings({ composition: composition(layers), ir: inputs.ir, atlas: inputs.atlas });
      const tile = await composeBuildingSurfaceTile({ artifact, relativePath: inputs.frame.relativePath, atlas: inputs.atlas });
      for (const texture of surface.listTextures()) {
        const channel = texture.userData.channel as keyof typeof tile.channels;
        expect(Array.from(texture.image.data!)).toEqual(Array.from(tile.channels[channel].data));
        expect(texture.image.data!.buffer).not.toBe(tile.channels[channel].data.buffer);
        expect(texture.colorSpace).toBe(channel === "baseColor" ? SRGBColorSpace : NoColorSpace);
      }
      expect(surface.listMaterials()[0].userData.pixelContentHash).toBe(tile.pixelContentHash);
      expect(surface.listMaterials()[0].userData.atlasSlot.uvRect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    } finally { target.dispose(); surface.dispose(); }
  });

  it("deduplicates identical effective pixels from distinct local layer identities", async () => {
    const layers = [paint(), paint({ id: "second-local", target: { kind: "element", relativePath: inputs.neighbour.relativePath, expectedRole: "frame" } })];
    const target = family(), surface = await prepareBuildingSurfaceRuntime({ composition: composition(layers), ir: inputs.ir, atlas: inputs.atlas });
    try {
      const runtime = scene(target, surface);
      expect(surface.metrics.evaluatedRecipes).toBe(2); expect(surface.metrics.materialCount).toBe(1);
      const a = runtime.semanticLookup.get(fullPath(inputs.frame.relativePath))!, b = runtime.semanticLookup.get(fullPath(inputs.neighbour.relativePath))!;
      expect(a.object.material).toBe(b.object.material); expect(a.object).toBe(b.object);
      expect(a.instanceIndex).not.toBe(b.instanceIndex);
    } finally { target.dispose(); surface.dispose(); }
  });

  it("keeps literal/no-layer and zero-weight compositions on original shared atlas resources", async () => {
    for (const layers of [[], [paint({ opacity: 0 })], [paint({ mask: { kind: "constant", value: 0 } })]]) {
      const target = family(), original = scene(target), pointers = new Map([...original.semanticLookup].map(([path, lookup]) => [path, lookup.object.material]));
      const surface = await prepareBuildingSurfaceRuntime({ composition: composition(layers), ir: inputs.ir, atlas: inputs.atlas });
      try {
        const runtime = scene(target, surface);
        expect(surface.metrics.materialCount).toBe(0); expect(surface.metrics.textureCount).toBe(0);
        for (const [path, lookup] of runtime.semanticLookup) expect(lookup.object.material).toBe(pointers.get(path));
        expect(target.metrics.textureCount).toBe(5);
      } finally { target.dispose(); surface.dispose(); }
    }
  });

  it("renders uniform shared mesh batches and one-owner trim while rejecting local multi-piece targets", async () => {
    const target = family();
    const wall = await prepareBuildingSurfaceRuntime({ composition: composition([paint({ target: { kind: "role", role: "wall" } })]), ir: inputs.ir, atlas: inputs.atlas });
    try {
      // Painting wall pixels back onto a wall is a literal no-op at this scale; coverage remains valid.
      const runtime = scene(target, wall);
      for (const binding of inputs.bindings.bindings.filter(value => value.kind === "mesh"))
        expect(runtime.semanticLookup.has(fullPath(binding.relativePath))).toBe(true);
    } finally { target.dispose(); wall.dispose(); }
    const one = inputs.bindings.bindings.find(binding => binding.kind === "mesh" && binding.coverage === "whole-mesh")!;
    expect(one).toBeDefined();
    const trim = await prepareBuildingSurfaceRuntime({ composition: composition([paint({
      target: { kind: "element", relativePath: one.relativePath, expectedRole: one.role }
    })]), ir: inputs.ir, atlas: inputs.atlas });
    const another = family();
    try { expect(scene(another, trim).semanticLookup.get(fullPath(one.relativePath))!.object.material.userData.pixelContentHash).toBeTruthy(); }
    finally { another.dispose(); trim.dispose(); }
    const piece = inputs.bindings.bindings.find(binding => binding.coverage === "mesh-piece")!;
    await expect(prepareBuildingSurfaceRuntime({ composition: composition([paint({
      target: { kind: "element", relativePath: piece.relativePath, expectedRole: piece.role }
    })]), ir: inputs.ir, atlas: inputs.atlas })).rejects.toMatchObject({ code: "surface.unsupportedTarget" });
  });

  it("rejects stale identity, instance count, recipe and semantic membership before retiring the current building", async () => {
    const target = family(), current = scene(target), surface = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    try {
      const cases = [
        { ...inputs.ir, sourceGraphHash: "changed" },
        { ...inputs.ir, instanceBatches: inputs.ir.instanceBatches.map((batch, index) => index ? batch : { ...batch, count: batch.count + 1 }) },
        { ...inputs.ir, instanceBatches: inputs.ir.instanceBatches.map((batch, index) => index ? batch : { ...batch, recipeId: "changed-recipe" }) },
        { ...inputs.ir, semanticIndex: inputs.ir.semanticIndex.slice(1) }
      ];
      for (const ir of cases) {
        expect(() => target.createOrReplaceBuilding({ ir, catalog: inputs.catalog, surfaceRuntime: surface })).toThrow(/context/i);
        expect(target.buildingRuntimes.get(inputs.ir.buildingId)).toBe(current);
        expect(current.disposed).toBe(false); expect(target.root.children).toContain(current.root);
        expect(surface.metrics.leases).toBe(0);
      }
    } finally { target.dispose(); surface.dispose(); }
  });

  it("retains the old runtime and releases the attempted lease when later scene construction fails", async () => {
    const target = family(), current = scene(target), surface = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    try {
      expect(() => target.createOrReplaceBuilding({ ir: inputs.ir, catalog: { ...inputs.catalog, recipes: [] }, surfaceRuntime: surface })).toThrow(/Missing component recipe/);
      expect(current.disposed).toBe(false); expect(target.buildingRuntimes.get(inputs.ir.buildingId)).toBe(current);
      expect(surface.metrics.leases).toBe(0);
      expect(scene(target, surface).disposed).toBe(false); expect(current.disposed).toBe(true);
    } finally { target.dispose(); surface.dispose(); }
  });

  it("defers composite disposal until the last scene lease and never releases shared family atlas resources", async () => {
    const target = family(), surface = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    const materialSpies = surface.listMaterials().map(material => vi.spyOn(material, "dispose"));
    const textureSpies = surface.listTextures().map(texture => vi.spyOn(texture, "dispose"));
    try {
      scene(target, surface);
      const extra = surface.acquire(inputs.ir, target.materialRegistry);
      surface.dispose(); surface.dispose();
      expect(surface.disposed).toBe(true); expect(surface.metrics.leases).toBe(2);
      expect(() => surface.acquire(inputs.ir, target.materialRegistry)).toThrow(/closed/);
      target.removeBuilding(inputs.ir.buildingId);
      expect(surface.metrics.leases).toBe(1); expect(materialSpies[0]).not.toHaveBeenCalled();
      expect(target.textureSet.disposed).toBe(false);
      extra.release(); extra.release();
      expect(surface.metrics).toMatchObject({ leases: 0, materialCount: 0, textureCount: 0 });
      expect(materialSpies.every(spy => spy.mock.calls.length === 1)).toBe(true);
      expect(textureSpies.every(spy => spy.mock.calls.length === 1)).toBe(true);
      expect(() => extra.getMaterial(inputs.frame.batchId, inputs.frame.elementIndex!)).toThrow(/released/);
      expect(target.textureSet.disposed).toBe(false);
    } finally { target.dispose(); surface.dispose(); }
  });

  it("supports repeated replacement without accumulating leases or disposing a surface owner still in use", async () => {
    const target = family(), surface = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    try {
      const material = surface.listMaterials()[0], dispose = vi.spyOn(material, "dispose");
      for (let count = 0; count < 4; count++) { scene(target, surface); expect(surface.metrics.leases).toBe(1); }
      expect(dispose).not.toHaveBeenCalled();
      scene(target); expect(surface.metrics.leases).toBe(0); expect(dispose).not.toHaveBeenCalled();
      surface.dispose(); expect(dispose).toHaveBeenCalledTimes(1); expect(target.textureSet.disposed).toBe(false);
    } finally { target.dispose(); surface.dispose(); }
  });

  it("owns atlas bytes, composition and IR metadata before a real held hash await without invoking providers", async () => {
    const mutable = { composition: composition([paint()]), ir: structuredClone(inputs.ir), atlas: structuredClone(inputs.atlas) };
    const before = await prepareBuildingSurfaceRuntime({ composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas });
    const expected = before.listMaterials()[0].userData.pixelContentHash; before.dispose();
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const ready = deferred(), release = deferred(), real = hashes.hashCanonicalJson;
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const result = await real(value); ready.resolve(); await release.promise; return result;
    });
    let pending: ReturnType<typeof prepareBuildingSurfaceRuntime> | undefined, surface: BuildingSurfaceRuntime | undefined;
    try {
      pending = prepareBuildingSurfaceRuntime(mutable); await ready.promise;
      mutable.composition.layers.length = 0; mutable.ir.semanticIndex.length = 0;
      mutable.atlas.manifest.slots.length = 0;
      for (const channel of Object.values(mutable.atlas.channels)) channel.data.fill(17);
      release.resolve(); surface = await pending;
      expect(surface.listMaterials()[0].userData.pixelContentHash).toBe(expected);
      const target = family();
      try { scene(target, surface); } finally { target.dispose(); }
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally {
      release.resolve(); surface?.dispose(); const settled = await pending?.catch(() => undefined); settled?.dispose();
      hash.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  });

  it("shares identical pixel textures while retaining distinct slot labels and UV sampling configurations", async () => {
    const atlas = structuredClone(inputs.atlas), width = atlas.manifest.widthPx, height = atlas.manifest.heightPx;
    for (const name of Object.keys(atlas.channels) as Array<keyof typeof atlas.channels>) {
      const old = atlas.channels[name], data = new Uint8ClampedArray(width * 2 * height * 4);
      for (let y = 0; y < height; y++) {
        const row = old.data.subarray(y * width * 4, (y + 1) * width * 4);
        data.set(row, y * width * 8); data.set(row, y * width * 8 + width * 4);
      }
      atlas.channels[name] = { ...old, widthPx: width * 2, data };
    }
    atlas.manifest.widthPx = width * 2;
    const frame = atlas.manifest.slots.find(slot => slot.id === inputs.frame.baseSlot.slotId)!;
    const copied = { ...structuredClone(frame), id: "frame.alternate", materialSourceId: "alternate-frame-source",
      rectPx: { ...frame.rectPx, x: frame.rectPx.x + width },
      uvMode: frame.uvMode === "repeat" ? "stretch" as const : "repeat" as const };
    atlas.manifest.slots.push(copied);
    atlas.slotProvenance.push({ ...atlas.slotProvenance.find(value => value.slotId === frame.id)!,
      slotId: copied.id, sourceId: copied.materialSourceId });
    atlas.contentHash = await hashPackedAtlasContent(atlas);
    const sourceBatch = inputs.ir.instanceBatches.find(batch => batch.batchId === inputs.frame.batchId)!;
    const split = Math.floor(sourceBatch.count / 2);
    expect(split).toBeGreaterThan(0);
    const frameBatches = [
      { ...sourceBatch, count: split, transforms: sourceBatch.transforms!.slice(0, split * 16) },
      { ...sourceBatch, batchId: sourceBatch.batchId + ".alternate", count: sourceBatch.count - split,
        materialSlotId: copied.id, transforms: sourceBatch.transforms!.slice(split * 16) }
    ];
    const ir = { ...inputs.ir,
      instanceBatches: inputs.ir.instanceBatches.flatMap(batch => batch === sourceBatch ? frameBatches : [batch]),
      semanticIndex: inputs.ir.semanticIndex.map(entry => entry.batchId === sourceBatch.batchId && entry.elementIndex! >= split
        ? { ...entry, batchId: frameBatches[1].batchId, elementIndex: entry.elementIndex! - split } : entry)
    };
    const document = composition([paint({ target: { kind: "role", role: "frame" } })]);
    for (const source of document.sources) source.atlasContentHash = atlas.contentHash;
    const surface = await prepareBuildingSurfaceRuntime({ composition: document, ir, atlas });
    const target = createBuildingFamilyRuntime({ familyId: ir.familyId, packedAtlas: atlas });
    try {
      const runtime = target.createOrReplaceBuilding({ ir, catalog: inputs.catalog, surfaceRuntime: surface });
      const original = runtime.renderables.find(object => object.userData.batchId === frameBatches[0].batchId)!;
      const alternate = runtime.renderables.find(object => object.userData.batchId === frameBatches[1].batchId)!;
      expect(original.material).not.toBe(alternate.material);
      expect(original.material.map).toBe(alternate.material.map);
      expect(original.material.normalMap).toBe(alternate.material.normalMap);
      expect(original.material.userData.atlasSlot.slotId).toBe(frame.id);
      expect(alternate.material.userData.atlasSlot.slotId).toBe(copied.id);
      expect(original.material.userData.atlasSlot.uvMode).toBe(frame.uvMode);
      expect(alternate.material.userData.atlasSlot.uvMode).toBe(copied.uvMode);
      expect(surface.metrics).toMatchObject({ evaluatedRecipes: 2, materialCount: 2, textureCount: 5 });
    } finally { target.dispose(); surface.dispose(); }
  });

  it("rejects getters, corrupt pixels, unsupported normals and mismatched borrowed atlas registries", async () => {
    const getter = vi.fn(() => { throw Error("getter executed"); }), input = { composition: composition([paint()]), ir: inputs.ir, atlas: inputs.atlas };
    const hostile = { ...input }; Object.defineProperty(hostile, "atlas", { enumerable: true, get: getter });
    await expect(prepareBuildingSurfaceRuntime(hostile)).rejects.toMatchObject({ code: "surfaceRuntime.invalidInput" });
    const atlas = structuredClone(inputs.atlas); Object.defineProperty(atlas.channels.baseColor, "data", { enumerable: true, get: getter });
    await expect(prepareBuildingSurfaceRuntime({ ...input, atlas })).rejects.toMatchObject({ code: "surfaceRuntime.invalidInput" });
    expect(getter).not.toHaveBeenCalled();
    const corrupt = structuredClone(inputs.atlas); corrupt.channels.height.data[0] ^= 255;
    await expect(prepareBuildingSurfaceRuntime({ ...input, atlas: corrupt })).rejects.toMatchObject({ code: "surfaceTile.sourceHashMismatch" });
    await expect(prepareBuildingSurfaceRuntime({ ...input, composition: composition([paint({ blend: "multiply", channels: ["normal"] })]) }))
      .rejects.toMatchObject({ code: "surfaceTile.unsupportedNormalMultiply" });
    const surface = await prepareBuildingSurfaceRuntime(input);
    const wrong = createBuildingFamilyRuntime({ familyId: inputs.ir.familyId, packedAtlas: { ...inputs.atlas, contentHash: "0".repeat(64) } });
    try {
      expect(() => scene(wrong, surface)).toThrow(/atlas/);
      expect(surface.metrics.leases).toBe(0); expect(wrong.buildingRuntimes.size).toBe(0);
    } finally { wrong.dispose(); surface.dispose(); }
  });
});
