import { vi } from "vitest";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import { canonicalJson } from "../core/canonicalJson";
import * as hashes from "../core/contentHash";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBuildingSourceFile, parseBuildingSourceFile } from "../state/buildingSourceFile";
import { BuildingSurfaceSourceFileSchema, createBuildingSurfaceSourceFile, parseBuildingSurfaceSourceFile } from "../state/buildingSurfaceSourceFile";

function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)) as T; }
function stable(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, stable(child)]));
  return value;
}
async function makeInputs() {
  const fixture = await createAssemblyHallFixture({ sourceIdentity: { documentId: "surface-source-fixture", revision: 2 } });
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
async function refresh(value: typeof file) { const { contentHash: _hash, ...contents } = value; void _hash; value.contentHash = await hashes.hashCanonicalJson(contents); }

describe("R4.P3 portable surface-source codec", () => {
  it("wraps literal structural/material JSON with strict versioned owned surface instructions", async () => {
    expect(file.schemaVersion).toBe("0.6.0"); expect(file.model).toBe("building-surface-source-v6");
    expect(BuildingSurfaceSourceFileSchema.safeParse(file).success).toBe(true);
    expect(canonicalJson(file.baseFile)).toBe(canonicalJson(inputs.baseFile));
    expect(canonicalJson(file.composition)).toBe(canonicalJson(inputs.composition));
    expect(Object.isFrozen(file.composition.layers[0])).toBe(true);
    expect(Object.isFrozen(inputs.composition)).toBe(false);
    const { contentHash, ...contents } = file; expect(contentHash).toBe(await hashes.hashCanonicalJson(contents));
    expect(Object.keys(file)).toEqual(["schemaVersion", "model", "baseFile", "composition", "contentHash"]);
    expect(JSON.stringify(file)).not.toContain("pixelContentHash");
  });

  it("round-trips ordered layers/masks/scales and all five exact decoded atlas planes from JSON alone", async () => {
    const parsed = await parseBuildingSurfaceSourceFile(clone(file));
    expect(parsed.legacyInput).toBe(false); expect(canonicalJson(parsed.file)).toBe(canonicalJson(file));
    expect(parsed.file.composition.layers.map(layer => layer.id)).toEqual(["shared-frame", "local-frame"]);
    expect(stable(parsed.packedAtlas)).toStrictEqual(stable(inputs.fixture.packedAtlas));
    expect(canonicalJson(parsed.debugExport)).toBe(canonicalJson(inputs.fixture.debugExport));
    expect(parsed.packedAtlas.channels.baseColor.data.buffer).not.toBe(inputs.fixture.packedAtlas.channels.baseColor.data.buffer);
    expect(parsed.sourceSnapshot.document).toEqual(inputs.baseFile.source.document);
  });

  it("admits a legacy source explicitly with an empty composition and keeps its old reader/payload unchanged", async () => {
    const input = clone(inputs.baseFile), before = canonicalJson(input), parsed = await parseBuildingSurfaceSourceFile(input);
    expect(parsed.legacyInput).toBe(true); expect(canonicalJson(input)).toBe(before);
    expect(canonicalJson(parsed.file.baseFile)).toBe(before);
    expect(parsed.file.composition).toEqual(inputs.empty);
    expect(canonicalJson((await parseBuildingSourceFile(input)).file)).toBe(before);
    expect((await parseBuildingSurfaceSourceFile(clone(parsed.file))).legacyInput).toBe(false);
  });

  it("rejects document and revision disagreement even under a recomputed outer receipt", async () => {
    for (const changed of [
      { ...clone(file), composition: { ...clone(file.composition), documentId: "other-document" } },
      { ...clone(file), composition: { ...clone(file.composition), revision: 3 } }
    ]) {
      await refresh(changed);
      await expect(parseBuildingSurfaceSourceFile(changed)).rejects.toMatchObject({ code: "surfaceSource.documentMismatch" });
      await expect(createBuildingSurfaceSourceFile({ baseFile: changed.baseFile, composition: changed.composition }))
        .rejects.toMatchObject({ code: "surfaceSource.documentMismatch" });
    }
  });

  it("rejects an altered composition under the original outer hash", async () => {
    const changed = clone(file); changed.composition.layers[1].opacity = 0.1;
    await expect(parseBuildingSurfaceSourceFile(changed)).rejects.toMatchObject({ code: "surfaceSource.invalidFile" });
  });

  it("independently verifies nested legacy receipts and encoded channel content", async () => {
    const changed = clone(file); changed.baseFile.contentHash = "0".repeat(64); await refresh(changed);
    await expect(parseBuildingSurfaceSourceFile(changed)).rejects.toMatchObject({ code: "building.sourceFileInvalid" });
    const channels = clone(file); channels.baseFile.materials.channels[0].channelHash = "0".repeat(64);
    const { contentHash: _old, ...payload } = channels.baseFile; void _old;
    channels.baseFile.contentHash = await hashes.hashCanonicalJson(payload); await refresh(channels);
    await expect(parseBuildingSurfaceSourceFile(channels)).rejects.toMatchObject({ code: "building.sourceFileInvalid" });
  });

  it("rejects missing sources and wrong atlas pins before restore", async () => {
    const missing = clone(file); missing.composition.sources[0].slotId = "unavailable"; await refresh(missing);
    await expect(parseBuildingSurfaceSourceFile(missing)).rejects.toMatchObject({ code: "surfaceSource.sourcePinMismatch" });
    const pin = clone(file); pin.composition.sources[0].atlasContentHash = "0".repeat(64); await refresh(pin);
    await expect(parseBuildingSurfaceSourceFile(pin)).rejects.toMatchObject({ code: "surfaceSource.sourcePinMismatch" });
    const target = clone(file); target.composition.layers[0].target = { kind: "slot", slotId: "unavailable" }; await refresh(target);
    await expect(parseBuildingSurfaceSourceFile(target)).rejects.toMatchObject({ code: "surfaceSource.sourcePinMismatch" });
  });

  it("rejects unsupported fields/versions instead of stripping or downgrading them", async () => {
    for (const value of [
      { ...clone(file), schemaVersion: "0.7.0" },
      { ...clone(file), extra: true },
      { ...clone(file), composition: { ...clone(file.composition), extra: true } },
      { ...clone(file), baseFile: { ...clone(file.baseFile), extra: true } }
    ]) await expect(parseBuildingSurfaceSourceFile(value)).rejects.toBeInstanceOf(Error);
    await expect(createBuildingSurfaceSourceFile({ baseFile: inputs.baseFile, composition: inputs.composition, ir: inputs.fixture.ir }))
      .rejects.toMatchObject({ code: "surfaceSource.invalidInput" });
  });

  it("rejects currently unsupported normal multiplication even at zero opacity", async () => {
    const changed = clone(file); changed.composition.layers[0].channels = ["normal"];
    changed.composition.layers[0].blend = "multiply"; changed.composition.layers[0].opacity = 0; await refresh(changed);
    await expect(parseBuildingSurfaceSourceFile(changed)).rejects.toMatchObject({ code: "surfaceSource.unsupportedOperation" });
  });

  it("never executes untrusted record/array getters", async () => {
    const getter = vi.fn(() => { throw Error("getter executed"); }), envelope = clone(file), layer = clone(file), entries = clone(file);
    Object.defineProperty(envelope, "baseFile", { enumerable: true, get: getter });
    Object.defineProperty(layer.composition.layers[0], "sourceId", { enumerable: true, get: getter });
    Object.defineProperty(entries.composition.layers, "0", { enumerable: true, get: getter });
    for (const value of [envelope, layer, entries]) await expect(parseBuildingSurfaceSourceFile(value)).rejects.toMatchObject({ code: "surfaceSource.invalidInput" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("captures both create inputs before an actual held hash await", async () => {
    const mutable = { baseFile: clone(inputs.baseFile), composition: clone(inputs.composition) };
    const ready = deferred(), release = deferred(), real = hashes.hashCanonicalJson;
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const result = await real(value); ready.resolve(); await release.promise; return result;
    });
    let pending: ReturnType<typeof createBuildingSurfaceSourceFile> | undefined;
    try {
      pending = createBuildingSurfaceSourceFile(mutable); await ready.promise;
      mutable.composition.layers.length = 0; mutable.baseFile.source.document.documentId = "late";
      mutable.baseFile.materials.channels.length = 0; release.resolve();
      expect(canonicalJson(await pending)).toBe(canonicalJson(file));
    } finally { release.resolve(); await pending?.catch(() => undefined); hash.mockRestore(); }
  });

  it("captures the entire parse envelope before decoding and hashing can yield", async () => {
    const mutable = clone(file), ready = deferred(), release = deferred(), real = hashes.hashCanonicalJson;
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const result = await real(value); ready.resolve(); await release.promise; return result;
    });
    let pending: ReturnType<typeof parseBuildingSurfaceSourceFile> | undefined;
    try {
      pending = parseBuildingSurfaceSourceFile(mutable); await ready.promise;
      mutable.composition.sources.length = 0; mutable.baseFile.materials.channels.length = 0; mutable.contentHash = "0".repeat(64);
      release.resolve(); expect(canonicalJson((await pending).file)).toBe(canonicalJson(file));
    } finally { release.resolve(); await pending?.catch(() => undefined); hash.mockRestore(); }
  });
});

