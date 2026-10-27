import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import type { CachedArtifactEntry } from "../materials/artifactCache";
import type { IndexedDbArtifactPersistence } from "../materials/indexedDbArtifactPersistence";
import {
  BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE,
  BUILDING_SOURCE_CHECKPOINT_DATABASE_NAME,
  BUILDING_SOURCE_CHECKPOINT_STORE_NAME,
  BuildingSourceCheckpointSchema,
  createBuildingSourceCheckpoint,
  createBuildingSourceCheckpointPersistence,
  parseBuildingSourceCheckpoint,
  type BuildingSourceCheckpoint
} from "../state/buildingSourceCheckpoint";
import {
  createBuildingSourceFile,
  deriveBuildingSourceBayEdit,
  deriveBuildingSourceFloorEdit,
  deriveBuildingSourceWindowWidthEdit,
  parseBuildingSourceFile,
  type BuildingSourceFile
} from "../state/buildingSourceFile";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";

function r4LegacyCheckpointFile(record: { kind: string; sourceFile?: Extract<BuildingSourceCheckpoint, { kind: "source" }>["sourceFile"] }): BuildingSourceFile {
  if (record.kind !== "source" || !record.sourceFile || record.sourceFile.schemaVersion === "0.6.0") throw new Error("Expected an unchanged legacy portable checkpoint.");
  return record.sourceFile;
}

const channels = ["baseColor", "normal", "orm", "height", "opacity"] as const;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const invalid = { name: "BuildingSourceCheckpointError", code: "building.sourceCheckpointInvalid" };
const completedFamilyRef = {
  runId: "completed-reference-run",
  createdAt: "2026-10-15T11:00:00.000Z",
  requestHash: "completed-reference-request",
  contentHash: "completed-reference-content"
};

function withoutHash<T extends { contentHash: string }>(value: T) {
  const { contentHash, ...payload } = value;
  void contentHash;
  return payload;
}

async function resealRecord(record: BuildingSourceCheckpoint): Promise<void> {
  record.contentHash = await hashCanonicalJson(withoutHash(record));
}

async function resealFile(file: BuildingSourceFile): Promise<void> {
  const { sourceContentHash, ...source } = file.source;
  void sourceContentHash;
  file.source.sourceContentHash = await hashCanonicalJson({
    ...source,
    document: { ...source.document, revision: 0 }
  });
  file.contentHash = await hashCanonicalJson(withoutHash(file));
}

class CheckpointIo implements Pick<IndexedDbArtifactPersistence, "get" | "put"> {
  readonly records = new Map<string, unknown>();
  readonly gets: Array<{ artifactType: string; requestHash: string; schemaVersion: string }> = [];
  readonly puts: CachedArtifactEntry[] = [];
  listCalls = 0;
  deleteCalls = 0;
  getFailure: unknown;
  putFailure: unknown;

  async put<T>(entry: CachedArtifactEntry<T>): Promise<void> {
    this.puts.push(structuredClone(entry));
    if (this.putFailure !== undefined) throw this.putFailure;
    this.records.set(`${entry.schemaVersion}:${entry.artifactType}:${entry.requestHash}`, structuredClone(entry));
  }

  async get<T>(artifactType: string, requestHash: string, schemaVersion = "0.1.0"): Promise<CachedArtifactEntry<T> | undefined> {
    this.gets.push({ artifactType, requestHash, schemaVersion });
    if (this.getFailure !== undefined) throw this.getFailure;
    // Return the injected boundary's value directly, including deliberately
    // corrupt values. The checkpoint adapter must validate and own it.
    return this.records.get(`${schemaVersion}:${artifactType}:${requestHash}`) as CachedArtifactEntry<T> | undefined;
  }

  async list(): Promise<never> {
    this.listCalls += 1;
    throw new Error("Checkpoint reads must not list other documents.");
  }

  async delete(): Promise<never> {
    this.deleteCalls += 1;
    throw new Error("Checkpoint failure must not delete the retained record.");
  }
}

describe("R3.P8 portable building source checkpoints", () => {
  let fixture: AssemblyHallFixture;
  const files: BuildingSourceFile[] = [];
  const records: BuildingSourceCheckpoint[] = [];

  beforeAll(async () => {
    fixture = await createAssemblyHallFixture({
      sourceIdentity: { documentId: "portable-checkpoint", revision: 4 },
      promptControls: {
        ...defaultBuildingPromptControls,
        seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" }
      }
    });
    if (!fixture.sourceSnapshot) throw new Error("Expected the actual fixture's captured source.");
    const v1 = fixture.sourceSnapshot;
    const v2 = await deriveBuildingSourceFloorEdit({ sourceSnapshot: v1, floorCount: v1.controlsView.floorCount + 1 });
    const v3 = await deriveBuildingSourceBayEdit({ sourceSnapshot: v2, bayCount: v2.controlsView.bayCount + 1 });
    const v4 = await deriveBuildingSourceWindowWidthEdit({
      sourceSnapshot: v3,
      windowWidthOverrides: [{
        schemaVersion: "0.1.0",
        address: { schemaVersion: "0.1.0", facade: "front", floorIndex: 1, bayIndex: 1 },
        widthM: 0.7
      }]
    });
    // This packet tests record/file validity, not compilation or recovery of v4.
    for (const [index, sourceSnapshot] of [v1, v2, v3, v4].entries()) {
      const sourceFile = await createBuildingSourceFile({ sourceSnapshot, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
      files.push(sourceFile);
      records.push(await createBuildingSourceCheckpoint({
        schemaVersion: "0.1.0", kind: "source", documentId: sourceSnapshot.document.documentId,
        createdAt: `2026-10-15T12:00:0${index}.000Z`, sourceFile
      }));
    }
  }, 30_000);

  afterAll(() => { fixture?.familyRuntime.dispose(); });

  it("round-trips actual portable v1–v4 files without upgrades and preserves every material byte and metadata field", async () => {
    expect(files.map(file => file.schemaVersion)).toEqual(["0.1.0", "0.2.0", "0.3.0", "0.4.0"]);
    expect(BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE).toBe("building-source-checkpoint");
    expect(BUILDING_SOURCE_CHECKPOINT_DATABASE_NAME).toBe("buildo-building-source-checkpoints");
    expect(BUILDING_SOURCE_CHECKPOINT_STORE_NAME).toBe("sourceCheckpoints");
    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    for (const [index, original] of records.entries()) {
      expect(BuildingSourceCheckpointSchema.safeParse(original).success).toBe(true);
      const parsed = await parseBuildingSourceCheckpoint(clone(original));
      expect(canonicalJson(parsed)).toBe(canonicalJson(original));
      expect(parsed.contentHash).toBe(await hashCanonicalJson(withoutHash(original)));
      await persistence.put(clone(original));
      const restored = await persistence.get(original.documentId);
      expect(canonicalJson(restored)).toBe(canonicalJson(original));
      if (restored?.kind !== "source") throw new Error("Expected a restored portable source record.");
      expect(canonicalJson(restored.sourceFile)).toBe(canonicalJson(files[index]));
      const decoded = await parseBuildingSourceFile(restored.sourceFile);
      expect(canonicalJson(decoded.file)).toBe(canonicalJson(files[index]));
      expect(decoded.file.schemaVersion).toBe(files[index].schemaVersion);
      expect(decoded.sourceSnapshot.schemaVersion).toBe(files[index].source.schemaVersion);
      const { channels: omitted, ...atlasMetadata } = decoded.packedAtlas;
      const { channels: expectedOmitted, ...expectedMetadata } = fixture.packedAtlas;
      void omitted; void expectedOmitted;
      expect(canonicalJson(atlasMetadata)).toBe(canonicalJson(expectedMetadata));
      expect(canonicalJson(decoded.debugExport)).toBe(canonicalJson(fixture.debugExport));
      for (const name of channels) {
        const actual = decoded.packedAtlas.channels[name], expected = fixture.packedAtlas.channels[name];
        expect({ widthPx: actual.widthPx, heightPx: actual.heightPx, channels: actual.channels, byteLength: actual.data.byteLength })
          .toEqual({ widthPx: expected.widthPx, heightPx: expected.heightPx, channels: expected.channels, byteLength: expected.data.byteLength });
        expect(Array.from(actual.data)).toEqual(Array.from(expected.data));
      }
      expect(io.puts.at(-1)).toMatchObject({
        schemaVersion: "0.1.0", artifactType: "building-source-checkpoint", requestHash: original.documentId,
        createdAt: original.createdAt, contentHash: original.contentHash,
        dependencies: [files[index].contentHash, files[index].source.sourceContentHash,
          files[index].source.document.intentRef.contentHash, files[index].source.document.stylePackRef.contentHash,
          files[index].materials.atlas.contentHash, files[index].materials.debugMetadata.exportHash]
      });
    }
    expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0);
  }, 20_000);

  it("rejects unknown fields, versions, malformed identities and unsafe JSON without evaluating getters", async () => {
    const record = records[0];
    const malformed: unknown[] = [
      { ...clone(record), schemaVersion: "0.2.0" }, { ...clone(record), kind: "completed-family" },
      { ...clone(record), documentId: "" }, { ...clone(record), createdAt: 7 },
      { ...clone(record), contentHash: "not-a-hash" }, { ...clone(record), extra: true },
      { ...clone(record), extra: undefined },
      { ...clone(record), sourceFile: { ...clone(files[0]), schemaVersion: "0.4.0" } },
      Object.assign(Object.create({ inherited: true }), clone(record))
    ];
    const symbolic = clone(record);
    Object.defineProperty(symbolic, Symbol("hidden"), { value: "unsafe", enumerable: true });
    malformed.push(symbolic);
    let getterCalls = 0;
    const accessor = clone(record);
    Object.defineProperty(accessor, "documentId", { enumerable: true, get: () => { getterCalls += 1; return record.documentId; } });
    malformed.push(accessor);
    const nestedAccessor = clone(record), nonfinite = clone(record);
    if (nestedAccessor.kind !== "source" || nonfinite.kind !== "source") throw new Error("Expected source records.");
    Object.defineProperty(r4LegacyCheckpointFile(nestedAccessor).source.intent.psg.evaluatedVariables, "unsafe", {
      enumerable: true, get: () => { getterCalls += 1; return "unsafe"; }
    });
    r4LegacyCheckpointFile(nonfinite).source.intent.psg.evaluatedVariables.unsafe = Number.NaN;
    malformed.push(nestedAccessor, nonfinite);
    for (const value of malformed) {
      expect(BuildingSourceCheckpointSchema.safeParse(value).success).toBe(false);
      await expect(parseBuildingSourceCheckpoint(value)).rejects.toMatchObject(invalid);
    }
    const payloadAccessor = withoutHash(clone(record));
    Object.defineProperty(payloadAccessor, "createdAt", { enumerable: true, get: () => { getterCalls += 1; return record.createdAt; } });
    await expect(createBuildingSourceCheckpoint(payloadAccessor)).rejects.toMatchObject(invalid);
    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    await expect(persistence.put(accessor)).rejects.toMatchObject(invalid);
    expect(io.puts).toHaveLength(0);
    expect(getterCalls).toBe(0);
    await expect(createBuildingSourceCheckpoint(clone(record))).rejects.toMatchObject(invalid);
  });

  it("rejects resealed foreign or corrupt source files and mismatched storage echoes and dependencies", async () => {
    for (const field of ["outerHash", "document", "fileHash", "intentRef", "channelHash"] as const) {
      const changed = clone(records[0]);
      if (changed.kind !== "source") throw new Error("Expected source record.");
      if (field === "outerHash") changed.contentHash = "0".repeat(64);
      if (field === "document") changed.documentId = "foreign-document";
      if (field === "fileHash") changed.sourceFile.contentHash = "0".repeat(64);
      if (field === "intentRef") {
        r4LegacyCheckpointFile(changed).source.intent.psg.evaluatedVariables.foreign = { changed: true };
        await resealFile(r4LegacyCheckpointFile(changed));
      }
      if (field === "channelHash") {
        r4LegacyCheckpointFile(changed).materials.channels[0].channelHash = "0".repeat(64);
        changed.sourceFile.contentHash = await hashCanonicalJson(withoutHash(changed.sourceFile));
      }
      if (field !== "outerHash") await resealRecord(changed);
      await expect(parseBuildingSourceCheckpoint(changed)).rejects.toMatchObject(invalid);
    }

    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    const original = records[0], key = `0.1.0:building-source-checkpoint:${original.documentId}`;
    await persistence.put(original);
    const validEntry = clone(io.puts[0]);
    const mutations: Array<(entry: CachedArtifactEntry) => void> = [
      entry => { entry.artifactType = "completed-family"; }, entry => { entry.requestHash = "foreign-document"; },
      entry => { entry.contentHash = "0".repeat(64); }, entry => { entry.createdAt = "foreign-time"; },
      entry => { entry.dependencies[0] = "foreign-dependency"; }, entry => { entry.dependencies.pop(); },
      entry => { entry.dependencies.push("unexpected-dependency"); }
    ];
    for (const mutate of mutations) {
      const entry = clone(validEntry); mutate(entry); io.records.set(key, entry);
      await expect(persistence.get(original.documentId)).rejects.toMatchObject(invalid);
      expect(canonicalJson(io.records.get(key))).toBe(canonicalJson(entry));
    }
    for (const entry of [{ ...clone(validEntry), schemaVersion: "0.2.0" }, { ...clone(validEntry), extra: true }]) {
      io.records.set(key, entry);
      await expect(persistence.get(original.documentId)).rejects.toMatchObject(invalid);
    }
    io.records.set(key, validEntry);
    expect(canonicalJson(await persistence.get(original.documentId))).toBe(canonicalJson(original));
    expect(io.puts).toHaveLength(1); expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0);
  }, 20_000);

  it("owns create, parse and put inputs before their first await while leaving caller data mutable", async () => {
    const expected = records[3];
    if (expected.kind !== "source") throw new Error("Expected source record.");
    const input = withoutHash(clone(expected));
    const creating = createBuildingSourceCheckpoint(input);
    input.documentId = "late-create"; input.createdAt = "late-time";
    const inputSource = r4LegacyCheckpointFile(input).source;
    if (inputSource.schemaVersion !== "0.4.0") throw new Error("Expected v4 input.");
    inputSource.windowWidthOverrides[0].widthM = 0.9;
    r4LegacyCheckpointFile(input).materials.channels[0].channelHash = "0".repeat(64);
    expect(canonicalJson(await creating)).toBe(canonicalJson(expected));
    expect(Object.isFrozen(input)).toBe(false); expect(Object.isFrozen(r4LegacyCheckpointFile(input).source)).toBe(false);

    const mutable = clone(expected), parsing = parseBuildingSourceCheckpoint(mutable);
    mutable.documentId = "late-parse";
    if (mutable.kind !== "source") throw new Error("Expected source.");
    r4LegacyCheckpointFile(mutable).source.intent.psg.evaluatedVariables.late = true;
    expect(canonicalJson(await parsing)).toBe(canonicalJson(expected));
    expect(Object.isFrozen(r4LegacyCheckpointFile(mutable).source.intent.psg.evaluatedVariables)).toBe(false);

    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    const toStore = clone(expected), writing = persistence.put(toStore);
    toStore.documentId = "late-put";
    if (toStore.kind !== "source") throw new Error("Expected source.");
    r4LegacyCheckpointFile(toStore).materials.debugMetadata.exportHash = "0".repeat(64);
    await writing;
    expect(canonicalJson(await persistence.get(expected.documentId))).toBe(canonicalJson(expected));
    expect(io.puts[0].requestHash).toBe(expected.documentId);
    expect(Object.isFrozen(toStore)).toBe(false);
    expect(Object.isFrozen(r4LegacyCheckpointFile(toStore).materials.debugMetadata)).toBe(false);
    expect(toStore.documentId).toBe("late-put");
  });

  it("reads exactly one document key, isolates other documents and treats only undefined as absent", async () => {
    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    const first = records[0];
    const second = await createBuildingSourceCheckpoint({
      schemaVersion: "0.1.0", kind: "source-unavailable", documentId: first.documentId + ":other",
      createdAt: "2026-10-15T13:00:00.000Z", reason: "completed-family-import", completedFamilyRef
    });
    await persistence.put(first); await persistence.put(second);
    expect(canonicalJson(await persistence.get(first.documentId))).toBe(canonicalJson(first));
    expect(canonicalJson(await persistence.get(second.documentId))).toBe(canonicalJson(second));
    expect(await persistence.get("missing-document")).toBeUndefined();
    expect(io.gets).toEqual([first.documentId, second.documentId, "missing-document"].map(requestHash => ({
      artifactType: "building-source-checkpoint", requestHash, schemaVersion: "0.1.0"
    })));
    const before = canonicalJson(Array.from(io.records));
    await expect(persistence.get("")).rejects.toMatchObject(invalid);
    expect(io.gets).toHaveLength(3);
    io.records.set("0.1.0:building-source-checkpoint:missing-document", null);
    await expect(persistence.get("missing-document")).rejects.toMatchObject(invalid);
    io.records.delete("0.1.0:building-source-checkpoint:missing-document");
    expect(canonicalJson(Array.from(io.records))).toBe(before);
    expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0);
  });

  it("replaces source with an explicit completed identity marker and then source at the same document key", async () => {
    const io = new CheckpointIo(), persistence = createBuildingSourceCheckpointPersistence({ persistence: io });
    const first = records[0];
    const unavailable = await createBuildingSourceCheckpoint({
      schemaVersion: "0.1.0", kind: "source-unavailable", documentId: first.documentId,
      createdAt: "2026-10-15T14:00:00.000Z", reason: "completed-family-import", completedFamilyRef
    });
    await persistence.put(first); await persistence.put(unavailable);
    expect(canonicalJson(await persistence.get(first.documentId))).toBe(canonicalJson(unavailable));
    expect(unavailable).toMatchObject({ documentId: first.documentId, kind: "source-unavailable", reason: "completed-family-import", completedFamilyRef });
    expect(unavailable.contentHash).toBe(await hashCanonicalJson(withoutHash(unavailable)));
    expect(io.puts[1].dependencies).toEqual([completedFamilyRef.contentHash]);
    expect("sourceFile" in unavailable).toBe(false); expect("artifacts" in unavailable).toBe(false);
    // The five identity fields are retained; this is not a full packet/buffer proof.
    expect(BuildingSourceCheckpointSchema.safeParse({
      ...clone(unavailable), completedFamilyRef: { ...completedFamilyRef, runtimeIr: {} }
    }).success).toBe(false);
    await persistence.put(records[3]);
    expect(canonicalJson(await persistence.get(first.documentId))).toBe(canonicalJson(records[3]));
    expect(io.records.size).toBe(1);
    expect(io.puts.map(entry => entry.requestHash)).toEqual([first.documentId, first.documentId, first.documentId]);
    expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0);
  });

  it("reports a write failure with its original cause and retains the previous record without fallback or deletion", async () => {
    const io = new CheckpointIo();
    let fallbackOpens = 0;
    const forbiddenFactory = { open: () => { fallbackOpens += 1; throw new Error("Unexpected fallback database."); } };
    const persistence = createBuildingSourceCheckpointPersistence({ persistence: io, indexedDb: forbiddenFactory as unknown as IDBFactory });
    const first = records[0]; await persistence.put(first);
    const before = canonicalJson(Array.from(io.records)), cause = new DOMException("Storage quota", "QuotaExceededError");
    io.putFailure = cause;
    const failure = await persistence.put(records[3]).then(() => undefined, error => error);
    expect(failure).toMatchObject({ name: "BuildingSourceCheckpointError", code: "building.sourceCheckpointWriteFailed" });
    expect(failure.cause).toBe(cause);
    expect(canonicalJson(Array.from(io.records))).toBe(before);
    expect(io.puts).toHaveLength(2); expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0); expect(fallbackOpens).toBe(0);
    io.putFailure = undefined;
    expect(canonicalJson(await persistence.get(first.documentId))).toBe(canonicalJson(first));
  });

  it("reports a read failure with its original cause instead of inventing absence, fallback or a replacement", async () => {
    const io = new CheckpointIo();
    let fallbackOpens = 0;
    const forbiddenFactory = { open: () => { fallbackOpens += 1; throw new Error("Unexpected fallback database."); } };
    const persistence = createBuildingSourceCheckpointPersistence({ persistence: io, indexedDb: forbiddenFactory as unknown as IDBFactory });
    const first = records[0]; await persistence.put(first);
    const before = canonicalJson(Array.from(io.records)), cause = new Error("Read unavailable");
    io.getFailure = cause;
    const failure = await persistence.get(first.documentId).then(() => undefined, error => error);
    expect(failure).toMatchObject({ name: "BuildingSourceCheckpointError", code: "building.sourceCheckpointReadFailed" });
    expect(failure.cause).toBe(cause);
    expect(canonicalJson(Array.from(io.records))).toBe(before);
    expect(io.puts).toHaveLength(1); expect(io.gets).toHaveLength(1);
    expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0); expect(fallbackOpens).toBe(0);
    io.getFailure = undefined;
    expect(canonicalJson(await persistence.get(first.documentId))).toBe(canonicalJson(first));
  });

  it("wires the default generic persistence factory to the isolated checkpoint database and store", async () => {
    const { vi } = await import("vitest");
    const generic = await import("../materials/indexedDbArtifactPersistence");
    const io = new CheckpointIo();
    const indexedDb = { open: () => { throw new Error("The factory spy supplies the storage boundary."); } } as unknown as IDBFactory;
    const factory = vi.spyOn(generic, "createIndexedDbArtifactPersistence").mockReturnValue(io);
    try {
      const persistence = createBuildingSourceCheckpointPersistence({ indexedDb });
      expect(factory.mock.calls).toEqual([[{
        databaseName: "buildo-building-source-checkpoints", storeName: "sourceCheckpoints", indexedDb
      }]]);
      await persistence.put(records[0]);
      expect(io.puts).toHaveLength(1);
      expect(canonicalJson(await persistence.get(records[0].documentId))).toBe(canonicalJson(records[0]));
      expect(io.gets).toEqual([{
        artifactType: "building-source-checkpoint", requestHash: records[0].documentId, schemaVersion: "0.1.0"
      }]);
      expect(io.listCalls).toBe(0); expect(io.deleteCalls).toBe(0);
    } finally { factory.mockRestore(); }
  });

  it("binds revision-only changes in file and checkpoint receipts while preserving the normalized source hash", async () => {
    const original = records[0];
    if (original.kind !== "source") throw new Error("Expected original v1 source record.");
    const revisedFile = clone(r4LegacyCheckpointFile(original)), oldRevision = revisedFile.source.document.revision;
    expect(revisedFile.schemaVersion).toBe("0.1.0");
    revisedFile.source.document.revision += 1;
    await resealFile(revisedFile);
    expect(revisedFile.source.sourceContentHash).toBe(r4LegacyCheckpointFile(original).source.sourceContentHash);
    expect(revisedFile.contentHash).not.toBe(original.sourceFile.contentHash);
    const masked = clone(revisedFile);
    masked.source.document.revision = oldRevision;
    masked.contentHash = original.sourceFile.contentHash;
    expect(canonicalJson(masked)).toBe(canonicalJson(original.sourceFile));

    const revised = await createBuildingSourceCheckpoint({ ...withoutHash(original), sourceFile: revisedFile });
    expect(revised.contentHash).not.toBe(original.contentHash);
    expect(revised.contentHash).toBe(await hashCanonicalJson(withoutHash(revised)));
    const parsed = await parseBuildingSourceCheckpoint(clone(revised));
    if (parsed.kind !== "source") throw new Error("Expected revised source record.");
    expect(canonicalJson(parsed.sourceFile)).toBe(canonicalJson(revisedFile));
    const decoded = await parseBuildingSourceFile(parsed.sourceFile);
    expect(decoded.sourceSnapshot.document.revision).toBe(oldRevision + 1);
    expect(decoded.sourceSnapshot.sourceContentHash).toBe(r4LegacyCheckpointFile(original).source.sourceContentHash);
    expect(decoded.file.schemaVersion).toBe("0.1.0");
  });
});
