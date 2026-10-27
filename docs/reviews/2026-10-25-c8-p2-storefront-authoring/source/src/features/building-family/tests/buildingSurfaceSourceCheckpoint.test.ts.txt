import { vi } from "vitest";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import * as hashes from "../core/contentHash";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBuildingSourceFile, withBuildingSourceRevision } from "../state/buildingSourceFile";
import { createBuildingSurfaceSourceFile, type BuildingSurfaceSourceFile } from "../state/buildingSurfaceSourceFile";
import { createBuildingSourceCheckpoint, parseBuildingSourceCheckpoint, createBuildingSourceCheckpointPersistence } from "../state/buildingSourceCheckpoint";
import type { CachedArtifactEntry } from "../materials/artifactCache";
function clone<T>(input: T): T { return JSON.parse(JSON.stringify(input)) as T; }
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

let inputs: Awaited<ReturnType<typeof makeInputs>>;
let file: BuildingSurfaceSourceFile;
beforeAll(async () => { inputs = await makeInputs(); file = await createBuildingSurfaceSourceFile({ baseFile: inputs.baseFile, composition: inputs.composition }); }, 30_000);
function payload(sourceFile: unknown = file) { return { schemaVersion: "0.1.0", kind: "source", documentId: file.composition.documentId,
  createdAt: "2026-10-16T10:00:00.000Z", sourceFile }; }
function memoryIo() {
  let stored: CachedArtifactEntry<unknown> | undefined;
  const put = vi.fn(async <T,>(entry: CachedArtifactEntry<T>) => { stored = clone(entry); });
  async function get<T>(): Promise<CachedArtifactEntry<T> | undefined> { return stored as CachedArtifactEntry<T> | undefined; }
  return { put, get, read: () => stored!, inject: (value: CachedArtifactEntry<unknown>) => { stored = value; } };
}
describe("R4.P4 surface-source checkpoints", () => {
  it("round-trips actual v6 layers and nested bytes through strict storage with complete dependency pins", async () => {
    const record = await createBuildingSourceCheckpoint(payload()), io = memoryIo();
    expect(await parseBuildingSourceCheckpoint(clone(record))).toEqual(record);
    const persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    await persistence.put(record); expect(await persistence.get(record.documentId)).toEqual(record);
    expect(io.read().dependencies).toEqual([file.contentHash, file.baseFile.contentHash,
      file.baseFile.source.sourceContentHash, file.baseFile.source.document.intentRef.contentHash,
      file.baseFile.source.document.stylePackRef.contentHash, file.baseFile.materials.atlas.contentHash,
      file.baseFile.materials.debugMetadata.exportHash]);
    expect((io.read().artifact as typeof record)).toEqual(record);
  });
  it("preserves legacy and unavailable-source record bytes and dependency order", async () => {
    const legacy = await createBuildingSourceCheckpoint(payload(inputs.baseFile)), io = memoryIo();
    const persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    await persistence.put(legacy);
    expect(io.read().dependencies).toEqual([inputs.baseFile.contentHash, inputs.baseFile.source.sourceContentHash,
      inputs.baseFile.source.document.intentRef.contentHash, inputs.baseFile.source.document.stylePackRef.contentHash,
      inputs.baseFile.materials.atlas.contentHash, inputs.baseFile.materials.debugMetadata.exportHash]);
    expect(await persistence.get(legacy.documentId)).toEqual(legacy);
    const unavailable = await createBuildingSourceCheckpoint({ schemaVersion: "0.1.0", documentId: file.composition.documentId,
      createdAt: "same-time", kind: "source-unavailable", reason: "completed-family-import",
      completedFamilyRef: { runId: "old-run", createdAt: "old-time", requestHash: "old-request", contentHash: "old-content" } });
    await persistence.put(unavailable); expect(io.read().dependencies).toEqual(["old-content"]);
    expect(await persistence.get(unavailable.documentId)).toEqual(unavailable);
  });
  it("rejects foreign identity, unsupported versions/fields and corrupt nested composition receipts", async () => {
    const changed = clone(file); changed.composition.layers[1].opacity = 0.01;
    const values = [payload(changed), { ...payload(), documentId: "foreign" },
      payload({ ...clone(file), schemaVersion: "0.7.0" }), payload({ ...clone(file), extra: true })];
    for (const value of values) await expect(createBuildingSourceCheckpoint(value)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
    const record = await createBuildingSourceCheckpoint(payload());
    const corrupt = clone(record); corrupt.contentHash = "0".repeat(64);
    await expect(parseBuildingSourceCheckpoint(corrupt)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
  });
  it("rejects dropped or substituted v6 dependency pins and retains the exact stored record", async () => {
    const record = await createBuildingSourceCheckpoint(payload()), io = memoryIo();
    const persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    await persistence.put(record); const original = clone(io.read());
    for (const index of [0, 1, 2, 5, 6]) {
      const changed = clone(original); changed.dependencies[index] = "0".repeat(64); io.inject(changed);
      await expect(persistence.get(record.documentId)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
      expect(io.read()).toEqual(changed);
    }
    const short = clone(original); short.dependencies.splice(1, 1); io.inject(short);
    await expect(persistence.get(record.documentId)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
    expect(io.put).toHaveBeenCalledTimes(1);
  });
  it("captures complete v6 JSON before create/parse/put awaits while leaving callers mutable", async () => {
    const input = clone(payload()), creating = createBuildingSourceCheckpoint(input);
    (input.sourceFile as BuildingSurfaceSourceFile).composition.layers[1].opacity = 0;
    const record = await creating; expect(record.kind === "source" && record.sourceFile).toEqual(file);
    const mutable = clone(record), parsing = parseBuildingSourceCheckpoint(mutable);
    if (mutable.kind !== "source" || mutable.sourceFile.schemaVersion !== "0.6.0") throw Error("Expected v6");
    mutable.sourceFile.composition.layers.reverse(); expect(await parsing).toEqual(record);
    const io = memoryIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    const toStore = clone(record), putting = persistence.put(toStore);
    if (toStore.kind !== "source" || toStore.sourceFile.schemaVersion !== "0.6.0") throw Error("Expected v6");
    toStore.sourceFile.baseFile.materials.channels[0].channelHash = "0".repeat(64);
    await putting; expect(await persistence.get(record.documentId)).toEqual(record);
    expect(Object.isFrozen(toStore.sourceFile.composition)).toBe(false);
  });
  it("rejects nested accessors without invoking them before any hash or storage operation", async () => {
    const input = clone(payload()), getter = vi.fn(() => 0.2), io = memoryIo();
    Object.defineProperty((input.sourceFile as BuildingSurfaceSourceFile).composition.layers[1], "opacity", { enumerable: true, get: getter });
    const hash = vi.spyOn(hashes, "hashCanonicalJson"), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    try {
      await expect(createBuildingSourceCheckpoint(input)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
      await expect(persistence.put({ ...input, contentHash: "0".repeat(64) })).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
      expect(getter).not.toHaveBeenCalled(); expect(hash).not.toHaveBeenCalled(); expect(io.put).not.toHaveBeenCalled();
    } finally { hash.mockRestore(); }
  });
  it("binds aligned revision-only v6 changes while keeping normalized structural authority and pixels literal", async () => {
    const sourceSnapshot = withBuildingSourceRevision(inputs.baseFile.source, inputs.baseFile.source.document.revision + 1);
    const baseFile = await createBuildingSourceFile({ sourceSnapshot, packedAtlas: inputs.fixture.packedAtlas, debugExport: inputs.fixture.debugExport });
    const revised = await createBuildingSurfaceSourceFile({ baseFile, composition: { ...file.composition, revision: sourceSnapshot.document.revision } });
    const a = await createBuildingSourceCheckpoint(payload()), b = await createBuildingSourceCheckpoint(payload(revised));
    expect(a.contentHash).not.toBe(b.contentHash); expect(revised.contentHash).not.toBe(file.contentHash);
    expect(revised.baseFile.source.sourceContentHash).toBe(file.baseFile.source.sourceContentHash);
    expect(revised.baseFile.materials).toEqual(file.baseFile.materials);
    expect(await parseBuildingSourceCheckpoint(clone(b))).toEqual(b);
  });
});

