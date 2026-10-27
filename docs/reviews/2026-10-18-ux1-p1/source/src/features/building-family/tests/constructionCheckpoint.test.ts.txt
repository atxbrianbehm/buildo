import { vi } from "vitest";
import { createBayConstructionGraph, repeatBayAsFacade } from "../contracts/bayConstructionGraph";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import type { CachedArtifactEntry } from "../materials/artifactCache";
import type { IndexedDbArtifactPersistence } from "../materials/indexedDbArtifactPersistence";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { createBuildingSourceFile, type BuildingSourceFile } from "../state/buildingSourceFile";
import { createConstructionCheckpoint, readConstructionCheckpoint, createConstructionCheckpointPersistence,
  type ConstructionCheckpoint, type ConstructionCheckpointPersistence } from "../state/constructionCheckpoint";
import { acquireConstructionCheckpointWriter, ConstructionCheckpointQueue, type ConstructionCheckpointWriter, type ConstructionSaveEvent } from "../state/constructionCheckpointWriter";

let base: AssemblyHallFixture, file: BuildingSourceFile, record: ConstructionCheckpoint;
function graph(width = 11.2) {
  const value = repeatBayAsFacade(createBayConstructionGraph()); value.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = width; return value;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(finish => { resolve = finish; }); return { promise, resolve }; }
function locks(grant: "yes" | "busy" | "wrong" = "yes"): Pick<LockManager, "request"> {
  return { request: vi.fn(async (name: string, _options: unknown, callback: (lock: Lock | null) => Promise<void>) => {
    await callback(grant === "busy" ? null : { name: grant === "wrong" ? "wrong" : name, mode: "exclusive" } as Lock);
  }) } as unknown as Pick<LockManager, "request">;
}
function memoryPersistence() {
  let stored: CachedArtifactEntry<unknown> | undefined;
  const native: Pick<IndexedDbArtifactPersistence, "get" | "put"> = {
    async put(entry) { stored = structuredClone(entry); },
    async get<T>() { return stored as CachedArtifactEntry<T> | undefined; }
  };
  return { native, read: () => stored, replace: (entry: CachedArtifactEntry<unknown>) => { stored = entry; } };
}
beforeAll(async () => {
  base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  file = await createBuildingSourceFile({ sourceSnapshot: base.sourceSnapshot!, packedAtlas: base.packedAtlas, debugExport: base.debugExport });
  record = await createConstructionCheckpoint("workspace-a", graph(), file);
}, 120000);
afterAll(() => { base?.familyRuntime.dispose(); });

it("owns checkpoint input before awaits and restores all five material channels", async () => {
  const input = graph(), mutableFile = JSON.parse(JSON.stringify(file));
  const pending = createConstructionCheckpoint("workspace-a", input, mutableFile);
  input.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = 70; mutableFile.contentHash = "0".repeat(64);
  const restored = await readConstructionCheckpoint(await pending);
  expect(restored.project.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM).toBe(11.2);
  expect(restored.project.materialSource.contentHash).toBe(file.contentHash);
  for (const name of ["baseColor", "normal", "orm", "height", "opacity"] as const) {
    expect(await sha256Hex(new Uint8Array(restored.materials.packedAtlas.channels[name].data)))
      .toBe(await sha256Hex(new Uint8Array(base.packedAtlas.channels[name].data)));
  }
}, 30000);
it("validates outer and nested hashes and rejects accessors without reading them", async () => {
  const outer = structuredClone(record); outer.project.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = 12;
  await expect(readConstructionCheckpoint(outer)).rejects.toThrow("saved hash");
  const nested = structuredClone(record); nested.project.materialSource.contentHash = "0".repeat(64);
  const { contentHash: originalProjectHash, ...projectPayload } = nested.project;
  expect(originalProjectHash).toBe(record.project.contentHash);
  nested.project.contentHash = await hashCanonicalJson(projectPayload);
  const { contentHash: originalOuterHash, ...payload } = nested; nested.contentHash = await hashCanonicalJson(payload);
  expect(originalOuterHash).toBe(record.contentHash);
  await expect(readConstructionCheckpoint(nested)).rejects.toThrow();
  let reads = 0; const unsafe = { ...record };
  Object.defineProperty(unsafe, "project", { enumerable: true, get() { reads++; throw new Error("getter"); } });
  await expect(readConstructionCheckpoint(unsafe)).rejects.toThrow(); expect(reads).toBe(0);
}, 30000);
it("pins storage metadata to the workspace and retains a mismatched record", async () => {
  const memory = memoryPersistence(), persistence = createConstructionCheckpointPersistence({ persistence: memory.native });
  await persistence.put(record); expect((await persistence.get("workspace-a"))!.record.contentHash).toBe(record.contentHash);
  const corrupt = structuredClone(memory.read()!); corrupt.requestHash = "other"; memory.replace(corrupt);
  await expect(persistence.get("workspace-a")).rejects.toThrow("identity"); expect(memory.read()).toBe(corrupt);
}, 30000);
it("admits no persistence work without the exact exclusive writer grant", async () => {
  const factory = vi.fn(() => ({ get: vi.fn(), put: vi.fn() }) as unknown as ConstructionCheckpointPersistence);
  expect(await acquireConstructionCheckpointWriter({ workspaceDocumentId: "workspace-a", locks: locks("busy"), createPersistence: factory })).toBeUndefined();
  await expect(acquireConstructionCheckpointWriter({ workspaceDocumentId: "workspace-a", locks: locks("wrong"), createPersistence: factory })).rejects.toThrow("identity");
  expect(factory).not.toHaveBeenCalled();
  const early = { request: (_name: string, _options: unknown, callback: (lock: Lock | null) => Promise<void>) => {
    void callback({ name: 'buildo-construction-source:"workspace-a"', mode: "exclusive" } as Lock); return Promise.resolve();
  } } as unknown as Pick<LockManager, "request">;
  await expect(acquireConstructionCheckpointWriter({ workspaceDocumentId: "workspace-a", locks: early, createPersistence: factory })).rejects.toThrow();
  expect(factory.mock.results[0]?.value.put).not.toHaveBeenCalled();
});
it("holds the writer through persistence acknowledgement and controlled close", async () => {
  const gate = deferred(), put = vi.fn(() => gate.promise);
  const writer = (await acquireConstructionCheckpointWriter({ workspaceDocumentId: "workspace-a", locks: locks(),
    createPersistence: () => ({ put, get: async () => undefined }) }))!;
  const pending = writer.put(record); let closed = false; const closing = writer.close().then(() => { closed = true; });
  await Promise.resolve(); expect(closed).toBe(false); expect(put).toHaveBeenCalledTimes(1);
  gate.resolve(); await pending; await closing; expect(closed).toBe(true);
  await expect(writer.put(record)).rejects.toThrow("closed");
});
it("serializes a later accepted source behind an in-flight save and acknowledges only the latest", async () => {
  const gate = deferred(), records: ConstructionCheckpoint[] = [], events: ConstructionSaveEvent[] = [];
  const writer: ConstructionCheckpointWriter = { workspaceDocumentId: "workspace-a", read: async () => undefined, close: vi.fn(async () => {}),
    put: vi.fn(async input => { records.push(input as ConstructionCheckpoint); if (records.length === 1) await gate.promise; }) };
  const queue = new ConstructionCheckpointQueue(writer, event => events.push(event));
  queue.save("a", graph(), file); await vi.waitFor(() => expect(writer.put).toHaveBeenCalledTimes(1), { timeout: 15000 });
  queue.save("b", graph(12), file); const closing = queue.close(); queue.save("ignored", graph(13), file);
  expect(events.filter(event => event.state === "saved")).toHaveLength(0); expect(writer.close).not.toHaveBeenCalled();
  gate.resolve(); await closing;
  expect(records.map(value => value.project.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM)).toEqual([11.2, 12]);
  expect(events.filter(event => event.state === "saved").map(event => event.sourceKey)).toEqual(["b"]);
  expect(writer.close).toHaveBeenCalledTimes(1);
}, 30000);
it("coalesces superseded encodings and retries after a failed write without a false saved state", async () => {
  const events: ConstructionSaveEvent[] = [], records: ConstructionCheckpoint[] = []; let fail = false;
  const writer: ConstructionCheckpointWriter = { workspaceDocumentId: "workspace-a", read: async () => undefined, close: async () => {},
    put: vi.fn(async input => { if (fail) throw new Error("quota"); records.push(input as ConstructionCheckpoint); }) };
  const queue = new ConstructionCheckpointQueue(writer, event => events.push(event));
  queue.save("a", graph(), file); queue.save("b", graph(12), file); await queue.drain();
  expect(records).toHaveLength(1); expect(events.filter(event => event.state === "saved").map(event => event.sourceKey)).toEqual(["b"]);
  fail = true; queue.save("c", graph(13), file); await queue.drain(); expect(events.at(-1)?.state).toBe("failed"); expect(records).toHaveLength(1);
  fail = false; queue.save("b", graph(12), file); await queue.drain(); expect(events.at(-1)?.state).toBe("saved"); expect(records).toHaveLength(2);
  await queue.close();
}, 30000);
