import { vi } from "vitest";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import * as hashes from "../core/contentHash";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBuildingSourceFile } from "../state/buildingSourceFile";
import { createBuildingSurfaceSourceFile, type BuildingSurfaceSourceFile } from "../state/buildingSurfaceSourceFile";
import { BuildingRunController } from "../state/buildingRunController";
import { BuildingArtifactRegistry } from "../state/artifactRegistry";
import { createBuildingStore } from "../state/buildingStore";
import { parseBuildingSourceCheckpoint, type BuildingSourceCheckpoint } from "../state/buildingSourceCheckpoint";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
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

let inputs: Awaited<ReturnType<typeof makeInputs>>, file: BuildingSurfaceSourceFile;
const active = new Set<BuildingRunController>();
let generate: ReturnType<typeof vi.spyOn>, interpret: ReturnType<typeof vi.spyOn>;
beforeAll(async () => { inputs = await makeInputs(); file = await createBuildingSurfaceSourceFile({ baseFile: inputs.baseFile, composition: inputs.composition }); }, 30_000);
beforeEach(() => { generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"); interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"); });
afterEach(async () => { for (const controller of active) { controller.dispose(); await controller.drainSourceCheckpoints(); } active.clear();
  expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
function harness() {
  const store = createBuildingStore(), registry = new BuildingArtifactRegistry(), records: BuildingSourceCheckpoint[] = [];
  store.getState().selectDocument(file.composition.documentId);
  let run = 0;
  const controller = new BuildingRunController({ store, registry, createRunId: () => "surface-controller-" + (++run),
    retainSourceCheckpointWriter: documentId => ({ exclusive: true, documentId, put: async record => { records.push(record); }, release() {} }) });
  active.add(controller); return { controller, store, registry, records };
}
async function open(controller: BuildingRunController, source: unknown = file) {
  const result = await controller.openSourceFile({ readText: async () => JSON.stringify(source) });
  if (!result.fixture || result.stale) throw Error("Expected accepted fixture"); return result;
}
async function save(controller: BuildingRunController) {
  const saved = await controller.exportSourceFile(), decoded: unknown = JSON.parse(saved.contents);
  const { parseBuildingSurfaceSourceFile } = await import("../state/buildingSurfaceSourceFile");
  const parsed = await parseBuildingSurfaceSourceFile(decoded);
  expect(parsed.legacyInput).toBe(false); return { saved, file: parsed.file };
}
function request(fixture: AssemblyHallFixture) { return { expectedSourceContentHash: fixture.sourceSnapshot!.sourceContentHash,
  expectedRevision: fixture.sourceSnapshot!.document.revision }; }
function material(fixture: AssemblyHallFixture) {
  const entry = [...fixture.buildingRuntime.semanticLookup.entries()].find(([path]) => path.endsWith("/" + inputs.frame.relativePath));
  if (!entry) throw Error("Lost selected semantic frame"); return entry[1].object.material;
}
function assertComposition(saved: BuildingSurfaceSourceFile) {
  expect({ ...saved.composition, revision: file.composition.revision }).toEqual(file.composition);
  expect(saved.composition.revision).toBe(saved.baseFile.source.document.revision);
  expect(saved.baseFile.materials).toEqual(file.baseFile.materials);
}
function address() {
  const match = inputs.frame.relativePath.match(/facade\/(front|rear|left|right)\/floor\/(\d+)\/bay\/(\d+)/)!;
  return { schemaVersion: "0.1.0" as const, facade: match[1] as "front", floorIndex: Number(match[2]), bayIndex: Number(match[3]) };
}
describe("R4.P4 app controller surface continuity", () => {
  it("keeps surface source as recovery authority and does not cache a legacy completed view without its layers", async () => {
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry(), put = vi.fn(async () => undefined);
    store.getState().selectDocument(file.composition.documentId);
    const controller = new BuildingRunController({ store, registry, completedFamilyPersistence: { put } });
    active.add(controller);
    await open(controller);
    const saved = await save(controller); assertComposition(saved.file);
    expect(put).not.toHaveBeenCalled();
  }, 30_000);
  it("opens and saves actual v6 source literally and checkpoints the same owned layer authority", async () => {
    const h = harness(), opened = await open(h.controller), saved = await save(h.controller);
    expect(saved.file).toEqual(file); expect(stable(opened.fixture!.ir)).toEqual(stable(inputs.fixture.ir));
    expect(stable(opened.fixture!.packedAtlas)).toEqual(stable(inputs.fixture.packedAtlas));
    expect(material(opened.fixture!).userData.pixelContentHash).toBeTruthy();
    await h.controller.drainSourceCheckpoints(); expect(h.records).toHaveLength(1);
    const record = await parseBuildingSourceCheckpoint(h.records[0]);
    expect(record.kind === "source" && record.sourceFile).toEqual(file);
    expect(h.controller.getSourceCheckpointStatus(file.composition.documentId)).toMatchObject({ state: "saved", revision: 2 });
  }, 30_000);
  it("preserves layers and atlas through local width apply, undo and redo with monotonic revisions", async () => {
    const h = harness(), initial = await open(h.controller), pixelHash = material(initial.fixture!).userData.pixelContentHash;
    const changed = await h.controller.applyWindowWidthOverride({ ...request(initial.fixture!), directive: { schemaVersion: "0.1.0", address: address(), widthM: 0.5 } });
    expect(changed.stale).toBe(false); assertComposition((await save(h.controller)).file);
    expect(material(changed.fixture!).userData.pixelContentHash).toBe(pixelHash);
    expect(stable(changed.fixture!.ir)).not.toEqual(stable(initial.fixture!.ir));
    const undo = await h.controller.undoWindowWidthOverride(request(changed.fixture!));
    const redo = await h.controller.redoWindowWidthOverride(request(undo.fixture!));
    for (const fixture of [changed.fixture!, undo.fixture!, redo.fixture!]) expect(stable(fixture.packedAtlas)).toEqual(stable(inputs.fixture.packedAtlas));
    expect(stable(undo.fixture!.ir)).toEqual(stable(initial.fixture!.ir));
    expect(stable(redo.fixture!.ir)).toEqual(stable(changed.fixture!.ir));
    const saved = await save(h.controller); assertComposition(saved.file); expect(saved.file.composition.revision).toBe(5);
    await h.controller.drainSourceCheckpoints(); expect(h.records).toHaveLength(4);
    for (const record of h.records) { if (record.kind !== "source" || record.sourceFile.schemaVersion !== "0.6.0") throw Error("Dropped v6");
      assertComposition(record.sourceFile); }
  }, 45_000);
  it.each(["floor", "bay"] as const)("preserves surfaces through %s width batches and full undo/redo authority", async kind => {
    const h = harness(), initial = await open(h.controller), a = address();
    const changed = kind === "floor"
      ? await h.controller.applyWindowFloorWidthOverride({ ...request(initial.fixture!), directive: { schemaVersion: "0.1.0", facade: a.facade, floorIndex: a.floorIndex, widthM: 0.5 } })
      : await h.controller.applyWindowBayWidthOverride({ ...request(initial.fixture!), directive: { schemaVersion: "0.1.0", facade: a.facade, bayIndex: a.bayIndex, widthM: 0.5 } });
    expect(changed.fixture!.sourceSnapshot!.schemaVersion).toBe("0.5.0");
    const undo = await h.controller.undoWindowWidthOverride(request(changed.fixture!));
    const redo = await h.controller.redoWindowWidthOverride(request(undo.fixture!));
    expect(stable(redo.fixture!.ir)).toEqual(stable(changed.fixture!.ir));
    assertComposition((await save(h.controller)).file);
  }, 45_000);
  it("rebinds layers after a compatible global roof edit without changing material bytes", async () => {
    const h = harness(), initial = await open(h.controller), pixelHash = material(initial.fixture!).userData.pixelContentHash;
    const prompt = clone(initial.fixture!.sourceSnapshot!.controlsView); prompt.roofType = prompt.roofType === "flat" ? "gable" : "flat";
    const changed = await h.controller.startDemoRun(prompt);
    expect(changed.fixture).toBeTruthy(); assertComposition((await save(h.controller)).file);
    expect(material(changed.fixture!).userData.pixelContentHash).toBe(pixelHash);
    expect(stable(changed.fixture!.packedAtlas)).toEqual(stable(inputs.fixture.packedAtlas));
  }, 30_000);
  it("retains the accepted building when a structural edit removes its exact local target", async () => {
    const h = harness(), initial = await open(h.controller), before = await save(h.controller);
    const prompt = clone(initial.fixture!.sourceSnapshot!.controlsView); prompt.floorCount = 1;
    await expect(h.controller.startDemoRun(prompt)).rejects.toBeInstanceOf(Error);
    expect((await save(h.controller)).file).toEqual(before.file);
    expect(initial.fixture!.familyRuntime.disposed).toBe(false); expect(h.registry.get(initial.artifactId!)).toBe(initial.fixture);
  }, 30_000);
  it("rejects unsupported seed/material regeneration before invoking providers and keeps saved surfaces", async () => {
    const h = harness(), initial = await open(h.controller), before = await save(h.controller);
    const prompt = clone(initial.fixture!.sourceSnapshot!.controlsView); prompt.seeds.family += "-new";
    await expect(h.controller.startDemoRun(prompt)).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
    expect((await save(h.controller)).file).toEqual(before.file); expect(initial.fixture!.familyRuntime.disposed).toBe(false);
  }, 30_000);
  it("uses composition authority in request identity for two files sharing identical structural and atlas source", async () => {
    const h = harness(), first = await open(h.controller), firstRequest = h.registry.getMetadata(first.artifactId!)!.requestHash,
      firstPixels = material(first.fixture!).userData.pixelContentHash;
    const composition = clone(file.composition); composition.layers[1].opacity = 0.1;
    const secondFile = await createBuildingSurfaceSourceFile({ baseFile: file.baseFile, composition });
    const second = await open(h.controller, secondFile), secondRequest = h.registry.getMetadata(second.artifactId!)!.requestHash;
    expect(firstRequest).not.toBe(secondRequest); expect(first.fixture!.familyRuntime.disposed).toBe(true);
    expect(material(second.fixture!).userData.pixelContentHash).not.toBe(firstPixels);
    expect((await save(h.controller)).file).toEqual(secondFile);
  }, 30_000);
  it("restores a cold controller solely from its v6 checkpoint with equal source, geometry and material pixels", async () => {
    const writer = harness(), first = await open(writer.controller), before = await save(writer.controller);
    const ir = stable(first.fixture!.ir), pixels = material(first.fixture!).userData.pixelContentHash;
    await writer.controller.drainSourceCheckpoints(); const record = await parseBuildingSourceCheckpoint(writer.records[0]);
    if (record.kind !== "source") throw Error("Expected source");
    writer.controller.dispose(); await writer.controller.drainSourceCheckpoints();
    const reader = harness(), reopened = await open(reader.controller, JSON.parse(JSON.stringify(record.sourceFile)));
    expect((await save(reader.controller)).file).toEqual(before.file); expect(stable(reopened.fixture!.ir)).toEqual(ir);
    expect(material(reopened.fixture!).userData.pixelContentHash).toBe(pixels);
    expect(reader.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
  }, 30_000);
  it("defers old owner cleanup to its final viewer lease and disposes replacement resources once", async () => {
    const h = harness(), initial = await open(h.controller), old = initial.fixture!, dispose = vi.spyOn(old.familyRuntime, "dispose");
    const textureDispose = vi.spyOn(material(old).map!, "dispose"), release = h.controller.acquireFixtureViewerLease(old);
    await open(h.controller); expect(dispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
    release(); release(); expect(dispose).toHaveBeenCalledTimes(1); expect(textureDispose).toHaveBeenCalledTimes(1);
    h.controller.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
  }, 30_000);
  it("cleans a cancelled staged v6 owner and keeps the previously accepted source", async () => {
    const h = harness(), initial = await open(h.controller), entered = deferred(), held = deferred();
    let candidate: AssemblyHallFixture | undefined;
    const unregister = h.controller.registerFixtureViewer(async fixture => { candidate = fixture; entered.resolve(); await held.promise;
      return { commit: () => () => undefined, discard() {} }; });
    const opening = h.controller.openSourceFile({ readText: async () => JSON.stringify(file) });
    await entered.promise; h.controller.cancelActiveRun(); held.resolve();
    try { expect((await opening).stale).toBe(true); expect(candidate!.familyRuntime.disposed).toBe(true);
      expect(initial.fixture!.familyRuntime.disposed).toBe(false); expect((await save(h.controller)).file).toEqual(file);
    } finally { held.resolve(); unregister(); }
  }, 30_000);
  it("rejects corrupt and failed-view sources without replacing or leaking the current surface owner", async () => {
    const h = harness(), initial = await open(h.controller), bad = clone(file); bad.composition.layers[1].opacity = 0;
    await expect(open(h.controller, bad)).rejects.toMatchObject({ code: "surfaceSource.invalidFile" });
    let candidate: AssemblyHallFixture | undefined;
    const unregister = h.controller.registerFixtureViewer(async fixture => { candidate = fixture;
      return { commit() { throw Error("Rejected view"); }, discard() {} }; });
    try { await expect(open(h.controller)).rejects.toThrow("Rejected view"); expect(candidate!.familyRuntime.disposed).toBe(true);
      expect(initial.fixture!.familyRuntime.disposed).toBe(false); expect((await save(h.controller)).file).toEqual(file);
    } finally { unregister(); }
  }, 30_000);
  it("captures surface authority before a held save hash and an explicit legacy Open replaces it cleanly", async () => {
    const h = harness(), initial = await open(h.controller), realHash = hashes.hashCanonicalJson, entered = deferred(), held = deferred();
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const captured = realHash(value); entered.resolve(); await held.promise; return captured;
    });
    const saving = h.controller.exportSourceFile(); await entered.promise;
    const legacy = await open(h.controller, inputs.baseFile); held.resolve();
    try { expect(JSON.parse((await saving).contents)).toEqual(file); const next = JSON.parse((await h.controller.exportSourceFile()).contents);
      expect(next).toEqual(inputs.baseFile); expect(initial.fixture!.familyRuntime.disposed).toBe(true);
      expect(material(legacy.fixture!).userData.pixelContentHash).toBeUndefined();
    } finally { held.resolve(); hash.mockRestore(); }
  }, 30_000);
});

