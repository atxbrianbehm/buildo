import { vi } from "vitest";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import { canonicalJson } from "../core/canonicalJson";
import * as hashes from "../core/contentHash";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { composeBuildingSurfaceTile } from "../materials/composeSurfaceTile";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import * as fixtureModule from "../ui/assemblyHallFixture";
import * as surfaceModule from "../renderer-three/surfaceMaterialRuntime";
import { createBuildingSourceFile, deriveBuildingSourceWindowWidthBatchEdit } from "../state/buildingSourceFile";
import { createBuildingSurfaceSourceFile } from "../state/buildingSurfaceSourceFile";
import { restoreBuildingSurfaceSourceFile, type RestoredBuildingSurfaceSource } from "../state/buildingSurfaceSourceRestore";

function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)) as T; }
function stable(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, stable(child)]));
  return value;
}
async function makeInputs() {
  const fixture = await fixtureModule.createAssemblyHallFixture({ sourceIdentity: { documentId: "surface-source-fixture", revision: 2 } });
  if (!fixture.sourceSnapshot) throw Error("Missing actual source fixture");
  const baseFile = await createBuildingSourceFile({ sourceSnapshot: fixture.sourceSnapshot, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
  const empty: BuildingSurfaceComposition = { schemaVersion: "0.1.0", documentId: baseFile.source.document.documentId,
    revision: baseFile.source.document.revision, sources: [], layers: [] };
  const bindings = await resolveBuildingSurfaceBindings({ composition: empty, ir: fixture.ir, atlas: fixture.packedAtlas });
  const frame = bindings.bindings.find(binding => binding.role === "frame" && binding.kind === "instance" &&
    binding.relativePath.includes("facade/front/floor/1/") &&
    fixture.catalog.recipes.find(recipe => recipe.id === fixture.ir.instanceBatches.find(batch => batch.batchId === binding.batchId)?.recipeId)?.role === "window")!;
  if (!frame) throw Error("Missing actual frame binding");
  const slot = fixture.packedAtlas.manifest.slots.find(value => value.id === frame.baseSlot.slotId)!;
  const composition: BuildingSurfaceComposition = { ...empty,
    sources: [{ id: "masonry", atlasContentHash: fixture.packedAtlas.contentHash,
      slotId: fixture.packedAtlas.manifest.slots.find(value => value.role === "wall")!.id }],
    layers: [{ id: "shared-frame", target: { kind: "role", role: "frame" }, sourceId: "masonry",
      mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 0.2,
      physicalSizeM: { ...slot.physicalSizeM }, channels: ["baseColor"] },
    { id: "local-frame", target: { kind: "element", relativePath: frame.relativePath, expectedRole: "frame" }, sourceId: "masonry",
      mask: { kind: "channel", sourceId: "masonry", channel: "height", component: "r" }, blend: "replace", opacity: 0.75,
      physicalSizeM: { width: slot.physicalSizeM.width / 2, height: slot.physicalSizeM.height }, channels: ["baseColor", "orm"] }] };
  // A restored runtime must come from the saved file; the generating runtime is already closed.
  fixture.familyRuntime.dispose();
  return { fixture, baseFile, empty, composition, frame, bindings };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { resolve, promise }; }

let inputs: Awaited<ReturnType<typeof makeInputs>>;
let file: Awaited<ReturnType<typeof createBuildingSurfaceSourceFile>>;
beforeAll(async () => { inputs = await makeInputs(); file = await createBuildingSurfaceSourceFile({ baseFile: inputs.baseFile, composition: inputs.composition }); }, 30_000);
const fullPath = (relativePath: string) => "building/" + inputs.fixture.ir.familyId + "/" + relativePath;

describe("R4.P3 saved surface-source runtime restore", () => {
  it("rebuilds a live composed family from JSON after the original runtime has been disposed", async () => {
    expect(inputs.fixture.familyRuntime.disposed).toBe(true);
    const before = stable({ ir: inputs.fixture.ir, atlas: inputs.fixture.packedAtlas }), owner = await restoreBuildingSurfaceSourceFile(clone(file));
    try {
      expect(owner.fixture.familyRuntime).not.toBe(inputs.fixture.familyRuntime);
      expect(owner.fixture.familyRuntime.disposed).toBe(false); expect(owner.fixture.buildingRuntime.disposed).toBe(false);
      expect(stable(owner.fixture.ir)).toStrictEqual(stable(inputs.fixture.ir));
      expect(stable(owner.fixture.packedAtlas)).toStrictEqual(stable(inputs.fixture.packedAtlas));
      expect(stable({ ir: inputs.fixture.ir, atlas: inputs.fixture.packedAtlas })).toStrictEqual(before);
      expect(owner.fixture.packedAtlas.channels.baseColor.data.buffer).not.toBe(inputs.fixture.packedAtlas.channels.baseColor.data.buffer);
      expect(canonicalJson(owner.file)).toBe(canonicalJson(file));
      expect(owner.fixture.metrics.textureCount).toBe(owner.fixture.familyRuntime.metrics.textureCount);
      expect(owner.surfaceRuntime.metrics.leases).toBe(1);
    } finally { owner.dispose(); }
  });

  it("reproduces independent P0/P1 selected pixel identity and preserves every outside non-frame atlas binding", async () => {
    const artifact = await resolveBuildingSurfaceBindings({ composition: inputs.composition, ir: inputs.fixture.ir, atlas: inputs.fixture.packedAtlas });
    const expected = await composeBuildingSurfaceTile({ artifact, relativePath: inputs.frame.relativePath, atlas: inputs.fixture.packedAtlas });
    const owner = await restoreBuildingSurfaceSourceFile(clone(file));
    try {
      const lookup = owner.fixture.buildingRuntime.semanticLookup.get(fullPath(inputs.frame.relativePath))!;
      expect(lookup.object.material.userData.pixelContentHash).toBe(expected.pixelContentHash);
      for (const texture of owner.surfaceRuntime.listTextures())
        if (texture.userData.pixelContentHash === expected.pixelContentHash) {
          const channel = texture.userData.channel as keyof typeof expected.channels;
          expect(Array.from(texture.image.data!)).toEqual(Array.from(expected.channels[channel].data));
        }
      for (const binding of inputs.bindings.bindings.filter(value => value.role !== "frame")) {
        const material = owner.fixture.buildingRuntime.semanticLookup.get(fullPath(binding.relativePath))!.object.material;
        expect(material.userData.pixelContentHash).toBeUndefined();
        expect(material.userData.atlasSlotId).toBe(binding.baseSlot.slotId);
        expect(material.map).toBe(owner.fixture.familyRuntime.textureSet.textures.baseColor);
      }
      expect(owner.surfaceRuntime.metrics).toMatchObject({ evaluatedRecipes: 2, materialCount: 2, textureCount: 10 });
    } finally { owner.dispose(); }
  });

  it("restores legacy input with explicit empty surfaces and zero regeneration", async () => {
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let owner: RestoredBuildingSurfaceSource | undefined;
    try {
      owner = await restoreBuildingSurfaceSourceFile(clone(inputs.baseFile));
      expect(owner.file.composition).toEqual(inputs.empty);
      expect(owner.surfaceRuntime.metrics).toMatchObject({ materialCount: 0, textureCount: 0, leases: 1 });
      expect(owner.fixture.familyRuntime.metrics.textureCount).toBe(5);
      expect(stable(owner.fixture.ir)).toStrictEqual(stable(inputs.fixture.ir));
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally { owner?.dispose(); generate.mockRestore(); interpret.mockRestore(); }
  });

  it("preserves complete v5 width-batch authority alongside surface layers and exact reconstructed geometry", async () => {
    const match = inputs.frame.relativePath.match(/facade\/(front|rear|left|right)\/floor\/(\d+)\/bay\/(\d+)/)!;
    const address = { schemaVersion: "0.1.0" as const, facade: match[1] as "front", floorIndex: Number(match[2]), bayIndex: Number(match[3]) };
    const directives = [{ schemaVersion: "0.1.0" as const, address, widthM: 0.5 },
      { schemaVersion: "0.1.0" as const, address: { ...address, bayIndex: address.bayIndex + 1 }, widthM: 0.7 }];
    const source = await deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: inputs.baseFile.source,
      windowWidthBatch: { schemaVersion: "0.1.0", directives } });
    const baseFile = await createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: inputs.fixture.packedAtlas, debugExport: inputs.fixture.debugExport });
    const saved = await createBuildingSurfaceSourceFile({ baseFile, composition: inputs.composition });
    const expected = await fixtureModule.createAssemblyHallFixture({ sourceSnapshot: source,
      reusableArtifacts: { packedAtlas: inputs.fixture.packedAtlas, debugExport: inputs.fixture.debugExport } });
    const owner = await restoreBuildingSurfaceSourceFile(clone(saved));
    try {
      const reopened = owner.file.baseFile.source;
      expect(reopened.schemaVersion).toBe("0.5.0");
      if (reopened.schemaVersion !== "0.5.0") throw Error("Lost complete batch authority");
      expect(reopened.windowWidthBatch.directives).toEqual(directives);
      expect(stable(owner.fixture.ir)).toStrictEqual(stable(expected.ir));
      expect(canonicalJson(owner.file.composition)).toBe(canonicalJson(inputs.composition));
      expect(owner.fixture.buildingRuntime.semanticLookup.get(fullPath(inputs.frame.relativePath))!.object.material.userData.pixelContentHash).toBeTruthy();
    } finally { owner.dispose(); expected.familyRuntime.dispose(); }
  });

  it("rejects stale and unsupported semantic targets and disposes the already reconstructed family", async () => {
    const real = fixtureModule.createAssemblyHallFixture;
    const piece = inputs.bindings.bindings.find(value => value.coverage === "mesh-piece")!;
    for (const target of [
      { kind: "element" as const, relativePath: "facade/front/floor/999/bay/0/opening/window", expectedRole: "frame" as const },
      { kind: "element" as const, relativePath: piece.relativePath, expectedRole: piece.role }
    ]) {
      const composition = clone(inputs.composition); composition.layers[1].target = target;
      const saved = await createBuildingSurfaceSourceFile({ baseFile: inputs.baseFile, composition });
      let allocated: fixtureModule.AssemblyHallFixture | undefined;
      const create = vi.spyOn(fixtureModule, "createAssemblyHallFixture").mockImplementationOnce(async input => {
        allocated = await real(input); return allocated;
      });
      try {
        await expect(restoreBuildingSurfaceSourceFile(clone(saved))).rejects.toBeInstanceOf(Error);
        expect(create).toHaveBeenCalledTimes(1); expect(allocated?.familyRuntime.disposed).toBe(true);
        expect(allocated?.familyRuntime.root.children).toHaveLength(0);
      } finally { allocated?.familyRuntime.dispose(); create.mockRestore(); }
    }
  });

  it("releases fixture and prepared composite resources when cancellation arrives after material preparation", async () => {
    const signal = new AbortController(), real = surfaceModule.prepareBuildingSurfaceRuntime, fixtureReal = fixtureModule.createAssemblyHallFixture;
    let allocated: fixtureModule.AssemblyHallFixture | undefined, prepared: surfaceModule.BuildingSurfaceRuntime | undefined;
    const create = vi.spyOn(fixtureModule, "createAssemblyHallFixture").mockImplementationOnce(async input => {
      allocated = await fixtureReal(input); return allocated;
    });
    const prepare = vi.spyOn(surfaceModule, "prepareBuildingSurfaceRuntime").mockImplementationOnce(async input => {
      prepared = await real(input); signal.abort(); return prepared;
    });
    try {
      await expect(restoreBuildingSurfaceSourceFile(clone(file), { signal: signal.signal })).rejects.toBeInstanceOf(Error);
      expect(prepare).toHaveBeenCalledTimes(1); expect(allocated?.familyRuntime.disposed).toBe(true);
      expect(prepared?.disposed).toBe(true);
      expect(prepared?.metrics).toMatchObject({ leases: 0, materialCount: 0, textureCount: 0 });
    } finally { allocated?.familyRuntime.dispose(); prepared?.dispose(); create.mockRestore(); prepare.mockRestore(); }
  });

  it("closes every fixture/composite resource exactly once across repeated dispose", async () => {
    const owner = await restoreBuildingSurfaceSourceFile(clone(file));
    const materials = owner.surfaceRuntime.listMaterials().map(material => vi.spyOn(material, "dispose"));
    const textures = owner.surfaceRuntime.listTextures().map(texture => vi.spyOn(texture, "dispose"));
    const originalTextures = Object.values(owner.fixture.familyRuntime.textureSet.textures).map(texture => vi.spyOn(texture, "dispose"));
    owner.dispose(); owner.dispose();
    expect(materials.every(spy => spy.mock.calls.length === 1)).toBe(true);
    expect(textures.every(spy => spy.mock.calls.length === 1)).toBe(true);
    expect(originalTextures.every(spy => spy.mock.calls.length === 1)).toBe(true);
    expect(owner.fixture.familyRuntime.disposed).toBe(true); expect(owner.surfaceRuntime.metrics.leases).toBe(0);
  });

  it("captures saved JSON before a held hash await and does no provider/interpreter work", async () => {
    const mutable = clone(file), ready = deferred(), release = deferred(), real = hashes.hashCanonicalJson;
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const result = await real(value); ready.resolve(); await release.promise; return result;
    });
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let pending: ReturnType<typeof restoreBuildingSurfaceSourceFile> | undefined, owner: RestoredBuildingSurfaceSource | undefined;
    try {
      pending = restoreBuildingSurfaceSourceFile(mutable); await ready.promise;
      mutable.composition.layers.length = 0; mutable.baseFile.materials.channels.length = 0;
      release.resolve(); owner = await pending;
      expect(canonicalJson(owner.file)).toBe(canonicalJson(file)); expect(owner.surfaceRuntime.metrics.materialCount).toBe(2);
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally {
      release.resolve(); owner?.dispose(); const settled = await pending?.catch(() => undefined); settled?.dispose();
      hash.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  });

  it("rejects pre-aborted or corrupt input before any fixture allocation", async () => {
    const signal = new AbortController(); signal.abort();
    const create = vi.spyOn(fixtureModule, "createAssemblyHallFixture");
    try {
      await expect(restoreBuildingSurfaceSourceFile(clone(file), { signal: signal.signal })).rejects.toBeInstanceOf(Error);
      await expect(restoreBuildingSurfaceSourceFile({ ...clone(file), contentHash: "0".repeat(64) })).rejects.toBeInstanceOf(Error);
      expect(create).not.toHaveBeenCalled();
    } finally { create.mockRestore(); }
  });
});

