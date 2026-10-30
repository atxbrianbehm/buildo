import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CubeTexture, DataTexture, DirectionalLight, LinearFilter, LinearMipmapLinearFilter, Vector3, type Camera, type Scene } from "three";
import { vi } from "vitest";
import { BayConstructionWorkbench, type BayConstructionSession } from "../ui/BayConstructionWorkbench";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { AssemblyHall } from "../ui/AssemblyHall";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";
import * as fixtures from "../ui/bayConstructionFixture";
import * as familySources from "../state/constructionFamilySource";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createBayConstructionGraph, repeatBayAsFacade, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";
import { evaluateBayConstruction } from "../compiler/evaluateBayConstruction";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { sha256Hex, hashCanonicalJson } from "../core/contentHash";
import { createConstructionCheckpoint, readConstructionCheckpoint } from "../state/constructionCheckpoint";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import type { AssemblyRendererActivation, AssemblyRendererFactory } from "../renderer-three/assemblyRendererFactory";

class InlineWorker {
  private closed = false;
  private listeners = { message: new Set<(event: MessageEvent | ErrorEvent) => void>(), error: new Set<(event: MessageEvent | ErrorEvent) => void>() };
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void) { this.listeners[type].add(listener); }
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void) { this.listeners[type].delete(listener); }
  terminate() { this.closed = true; this.listeners.message.clear(); this.listeners.error.clear(); }
  postMessage(input: unknown) {
    const request = BayConstructionWorkerRequestSchema.parse(input);
    const emit = (data: unknown) => { if (!this.closed) for (const listener of this.listeners.message) listener(new MessageEvent("message", { data })); };
    void evaluateConstruction(request.graph, request.previewNodeId).then(result =>
      emit({ schemaVersion: request.schemaVersion, type: "bay-result", requestId: request.requestId, result }),
      error => emit({ schemaVersion: "0.1.0", type: "bay-error", requestId: request.requestId, message: String(error.message) }));
  }
}
let base: AssemblyHallFixture, materials: fixtures.BayConstructionMaterials, sourceCalls: number;
const provider = new ProceduralMaterialProvider(), generate = vi.spyOn(provider, "generate");
const rendererState: { reject: boolean; records: Array<{ canvas: HTMLCanvasElement; scene?: Scene; camera?: Camera; dispose: ReturnType<typeof vi.fn> }> } = { reject: false, records: [] };
const factory: AssemblyRendererFactory = async (): Promise<AssemblyRendererActivation> => {
  if (rendererState.reject) { rendererState.reject = false; throw new Error("Candidate renderer rejected"); }
  const canvas = document.createElement("canvas"), dispose = vi.fn();
  const entry = { canvas, dispose, scene: undefined as Scene | undefined, camera: undefined as Camera | undefined };
  rendererState.records.push(entry);
  return { activeBackend: "webgl", renderer: { domElement: canvas, dispose,
    render: (scene, camera) => { entry.scene = scene; entry.camera = camera; }, setPixelRatio: () => {},
    setSize: (width, height) => { canvas.width = width; canvas.height = height; } } };
};
const pixelHashes = async (atlas: fixtures.BayConstructionMaterials["packedAtlas"]) =>
  Object.fromEntries(await Promise.all(Object.entries(atlas.channels).map(async ([name, layer]) =>
    [name, await sha256Hex(new Uint8Array(layer.data))])));
const exactIR = (ir: unknown) => JSON.stringify(ir, (_key, value) => ArrayBuffer.isView(value)
  ? { type: value.constructor.name, bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] }
  : value);

beforeAll(async () => {
  base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  materials = await fixtures.createBayConstructionMaterials(base, new AbortController().signal, provider);
  sourceCalls = generate.mock.calls.length;
}, 120000);
beforeEach(() => { vi.stubGlobal("Worker", InlineWorker); rendererState.reject = false; rendererState.records = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { base?.familyRuntime.dispose(); generate.mockRestore(); });

describe("construction material and project authority", () => {
  it("owns a six-building preview with one material registry and disposes it on return", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => evaluateConstruction(createBuildingConstructionGraph(`preview_${index}`))));
    const before = await pixelHashes(materials.packedAtlas);
    const family = await fixtures.prepareConstructionFamilyFixture(base, results, materials);
    const runtimes = [...family.familyRuntime.buildingRuntimes.values()];
    try {
      expect(runtimes).toHaveLength(6);
      expect(new Set(runtimes.map(runtime => runtime.root.position.x)).size).toBe(6);
      expect(runtimes.every(runtime => runtime.materialRegistry === family.familyRuntime.materialRegistry)).toBe(true);
      expect(family.familyRuntime.metrics.buildingCount).toBe(6);
      expect(await pixelHashes(materials.packedAtlas)).toEqual(before);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { family.familyRuntime.dispose(); }
    expect(family.familyRuntime.disposed).toBe(true);
    expect(runtimes.every(runtime => runtime.disposed)).toBe(true);
    expect(family.familyRuntime.dispose().buildingRuntimesDisposed).toBe(0);
    const controller = new AbortController(); controller.abort();
    await expect(fixtures.prepareConstructionFamilyFixture(base, results, materials, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const pending = new AbortController();
    const preparing = fixtures.prepareConstructionFamilyFixture(base, results, materials, pending.signal);
    pending.abort();
    await expect(preparing).rejects.toMatchObject({ name: "AbortError" });
    expect(await pixelHashes(materials.packedAtlas)).toEqual(before);
  }, 30000);

  it("allocates an adequate source budget and isolated, aligned mipmapped tiles without changing source or IR", async () => {
    expect(materials.packedAtlas.manifest.widthPx).toBe(1024);
    expect(generate.mock.calls.some(([request]) => request.widthPx === 256)).toBe(true);
    const graph = createBayConstructionGraph(), evaluated = await evaluateBayConstruction(graph);
    const originalIR = exactIR(evaluated.ir), originalPixels = await pixelHashes(materials.packedAtlas);
    const fixture = fixtures.createBayConstructionFixture(base, evaluated, materials);
    try {
      const wall = fixture.familyRuntime.materialRegistry.getMaterial("wall.primary");
      const textures = [wall.map!, wall.normalMap!, wall.roughnessMap!];
      const slot = materials.packedAtlas.manifest.slots.find(slot => slot.id === "wall.primary")!;
      for (const texture of textures) {
        expect(texture).toBeInstanceOf(DataTexture);
        expect(texture.magFilter).toBe(LinearFilter);
        expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
        expect(texture.generateMipmaps).toBe(true);
        expect(texture.repeat.x * slot.rectPx.width / 1024).toBeCloseTo(1);
        expect(texture.repeat.y * slot.rectPx.height / 1024).toBeCloseTo(1);
        expect(texture.offset.x).toBeCloseTo(-slot.rectPx.x / slot.rectPx.width);
      }
      const cropped = (wall.map as DataTexture).image.data as Uint8Array;
      const raw = materials.packedAtlas.channels.baseColor;
      const start = (slot.rectPx.y * raw.widthPx + slot.rectPx.x) * 4;
      expect(cropped[3]).toBe(raw.data[start + 3]);
      const intensity = (data: Uint8Array | Uint8ClampedArray, i: number) => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const originalIntensity: number[] = [], displayIntensity: number[] = [];
      for (let y = 0; y < slot.rectPx.height; y++) for (let x = 0; x < slot.rectPx.width; x++) {
        originalIntensity.push(intensity(raw.data, ((slot.rectPx.y + y) * raw.widthPx + slot.rectPx.x + x) * 4));
        displayIntensity.push(intensity(cropped, (y * slot.rectPx.width + x) * 4));
      }
      const range = (values: number[]) => values.reduce((max, value) => Math.max(max, value), -Infinity)
        - values.reduce((min, value) => Math.min(min, value), Infinity);
      expect(range(displayIntensity)).toBeLessThan(range(originalIntensity));
      for (const channel of ["normal", "orm"] as const) {
        const texture = channel === "normal" ? wall.normalMap : wall.roughnessMap;
        const source = materials.packedAtlas.channels[channel];
        expect([...((texture as DataTexture).image.data as Uint8Array).subarray(0, 4)]).toEqual([...source.data.subarray(start, start + 4)]);
      }
      const environment = fixture.familyRuntime.materialRegistry.getMaterial("glass.primary").envMap as CubeTexture;
      expect(environment).toBeInstanceOf(CubeTexture);
      expect(environment.images).toHaveLength(6);
      expect(exactIR(evaluated.ir)).toBe(originalIR);
      expect(await pixelHashes(materials.packedAtlas)).toEqual(originalPixels);
      const disposals = [...textures, environment].map(texture => vi.spyOn(texture, "dispose"));
      fixture.familyRuntime.dispose(); fixture.familyRuntime.dispose();
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { fixture.familyRuntime.dispose(); }
  }, 30000);

  it("owns graph source before awaits and restores every saved material channel without generation", async () => {
    const graph = createBayConstructionGraph();
    const pending = createBayConstructionProject(graph, materials.file);
    graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = 99;
    const project = await pending, restored = await readBayConstructionProject(JSON.parse(JSON.stringify(project)));
    expect(restored.project.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM).toBe(2.8);
    expect(await pixelHashes(restored.materials.packedAtlas)).toEqual(await pixelHashes(materials.packedAtlas));
    expect(generate).toHaveBeenCalledTimes(sourceCalls);
  }, 30000);

  it("allocates detailed frame and roof sources only during new-building library initialization",async()=>{
    const fresh=new ProceduralMaterialProvider(),calls=vi.spyOn(fresh,'generate');
    try{const built=await fixtures.createBayConstructionMaterials(base,new AbortController().signal,fresh,'building');
      for(const role of ['frame','roof','door','horizontalTrim']){const request=calls.mock.calls.find(([request])=>request.role===role)![0];expect(request.widthPx).toBe(256);expect(request.heightPx).toBe(256);}
      expect(calls).toHaveBeenCalledTimes(12);expect(built.file.contentHash).not.toBe(materials.file.contentHash);
    }finally{calls.mockRestore();}
  },30000);

  it("rejects changed graph source and independently validates nested material authority", async () => {
    const project = await createBayConstructionProject(createBayConstructionGraph(), materials.file);
    const altered = structuredClone(project);
    altered.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = 3.3;
    await expect(readBayConstructionProject(altered)).rejects.toThrow("saved hash");
    const payload = JSON.parse(JSON.stringify(project));
    delete payload.contentHash;
    payload.materialSource.contentHash = "0".repeat(64);
    await expect(readBayConstructionProject({ ...payload, contentHash: await hashCanonicalJson(payload) })).rejects.toThrow("hash mismatch");
  }, 30000);
});

describe("live construction controls and ownership", () => {
  function mount(initialSession: BayConstructionSession = { graph: createBayConstructionGraph(), materials }) {
    const onSessionChange = vi.fn<(session: BayConstructionSession) => void>();
    const releaseBase = vi.fn(), acquireBaseLease = vi.fn(() => releaseBase);
    const view = render(<BayConstructionWorkbench base={base} initialSession={initialSession}
      acquireBaseLease={acquireBaseLease} onSessionChange={onSessionChange} onReturn={() => {}} rendererFactory={factory} />);
    return { ...view, onSessionChange, releaseBase };
  }
  async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Apply construction" })).toBeEnabled(), { timeout: 10000 }); }

  async function generatedFamilySource() {
    const generated = await resolveWorkbenchGeneration(createBuildingConstructionGraph("family_origin"), null, defaultConstructionGenerationControls);
    const generatedMaterials = await fixtures.createReferenceConstructionMaterials(base, generated.source, new AbortController().signal, base.spec);
    const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: generated.source,
      resolution: generated.resolution, materialPlan: generatedMaterials.plan, materialSourceHash: generatedMaterials.materials.file.contentHash };
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "family_test", familySeed: "seed", graph: generated.graph });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    return { schemaVersion: "0.2.0" as const, kind: "construction-family-source" as const, familyId: "family_test", sourceDocumentId: generated.graph.documentId,
      familySeed: "seed", sourceGraph: generated.graph, sourceGeneration: lineage, materialSource: generatedMaterials.materials.file, contentHash: "a".repeat(64),
      members: family.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) };
  }

  it("retains the current building when an invalid family file is opened", async () => {
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready();
      const workspace = view.container.querySelector<HTMLElement>(".construction-workspace")!;
      const before = workspace.dataset.constructionHash;
      expect(screen.getByRole("button", { name: "Save family" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Open family file"), { target: { files: [new File(["{}"], "invalid.json", { type: "application/json" })] } });
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), { timeout: 15000 });
      expect(workspace.dataset.constructionHash).toBe(before);
      expect(workspace.dataset.constructionPreview).toBe("output");
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); }
  }, 30000);

  it("ignores an older family load after a newer load fails", async () => {
    let rejectOld!: (reason: Error) => void;
    const old = new Promise<Awaited<ReturnType<typeof familySources.readConstructionFamilySource>>>((_resolve, reject) => { rejectOld = reject; });
    const read = vi.spyOn(familySources, "readConstructionFamilySource").mockImplementationOnce(() => old).mockRejectedValueOnce(new Error("New family failed"));
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready();
      const workspace = view.container.querySelector<HTMLElement>(".construction-workspace")!, before = workspace.dataset.constructionHash;
      fireEvent.change(screen.getByLabelText("Open family file"), { target: { files: [new File(["{}"], "old.json")] } });
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Open family file"), { target: { files: [new File(["{}"], "new.json")] } });
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("New family failed"));
      rejectOld(new Error("Old family failed"));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("New family failed"));
      expect(workspace.dataset.constructionHash).toBe(before);
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); read.mockRestore(); }
  }, 30000);

  it("disposes both prepared family owners when viewer activation fails", async () => {
    const source = await generatedFamilySource();
    const read = vi.spyOn(familySources, "readConstructionFamilySource").mockResolvedValueOnce(source);
    const original = vi.spyOn(fixtures, "prepareBayConstructionFixture"), preparedFamily = vi.spyOn(fixtures, "prepareConstructionFamilyFixture");
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready(); const workspace = view.container.querySelector<HTMLElement>(".construction-workspace")!, before = workspace.dataset.constructionHash;
      rendererState.reject = true;
      fireEvent.change(screen.getByLabelText("Open family file"), { target: { files: [new File(["{}"], "family.json")] } });
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"), { timeout: 120000 });
      expect(workspace.dataset.constructionHash).toBe(before);
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
      expect((await original.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
      expect((await preparedFamily.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
    } finally { view.unmount(); read.mockRestore(); original.mockRestore(); preparedFamily.mockRestore(); }
  }, 180000);

  it("edits one family member with independent undo while preserving siblings", async () => {
    const source = await generatedFamilySource(), read = vi.spyOn(familySources, "readConstructionFamilySource").mockResolvedValueOnce(source);
    const actualPrepare = fixtures.prepareConstructionFamilyFixture;
    const prepared = vi.spyOn(fixtures, "prepareConstructionFamilyFixture"), view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready();
      fireEvent.change(screen.getByLabelText("Open family file"), { target: { files: [new File(["{}"], "family.json")] } });
      await waitFor(() => expect(screen.getByRole("button", { name: "Edit selected building" })).toBeEnabled(), { timeout: 120000 });
      fireEvent.change(screen.getByLabelText("Family member"), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Edit selected building" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Back to family" })).toBeEnabled(), { timeout: 30000 });
      const memberWorkspace = view.container.querySelector<HTMLElement>(".construction-workspace:not([hidden])")!;
      fireEvent.click(within(memberWorkspace).getByText("Shape", { selector: "summary" }));
      const width = within(memberWorkspace).getByLabelText("Width (m)", { exact: true }) as HTMLInputElement;
      const old = width.value, next = String(Number(old) + 0.4);
      fireEvent.change(width, { target: { value: next } });
      expect(screen.getByRole("button", { name: "Back to family" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Undo construction" })).toBeEnabled(), { timeout: 30000 });
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(width.value).toBe(old), { timeout: 30000 });
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(width.value).toBe(next), { timeout: 30000 });
      rendererState.reject = true;
      fireEvent.click(screen.getByRole("button", { name: "Back to family" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"), { timeout: 120000 });
      expect(width.value).toBe(next);
      expect((await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Back to family" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Edit selected building" })).toBeEnabled(), { timeout: 120000 });
      expect(screen.getByRole("button", { name: "Return to building" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Open family" })).toBeDisabled();
      const results = prepared.mock.calls.at(-1)![1];
      expect(results[1].graph.nodes.find(node => node.type === "Footprint")!.parameters.widthM).toBe(Number(next));
      for (const index of [0, 2, 3, 4, 5]) expect(results[index].graph).toEqual(source.members[index].graph);
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(source.sourceGraph);
      fireEvent.click(screen.getByRole("button", { name: "Edit selected building" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Back to family" })).toBeEnabled(), { timeout: 30000 });
      let release!: () => void, candidate: fixtures.BayConstructionFixture | undefined;
      const hold = new Promise<void>(resolve => { release = resolve; });
      prepared.mockImplementationOnce(async (...args) => { candidate = await actualPrepare(...args); await hold; return candidate; });
      fireEvent.click(screen.getByRole("button", { name: "Back to family" }));
      await waitFor(() => expect(candidate).toBeDefined(), { timeout: 120000 });
      view.unmount(); release();
      await waitFor(() => expect(candidate!.familyRuntime.disposed).toBe(true), { timeout: 30000 });
    } finally { view.unmount(); read.mockRestore(); prepared.mockRestore(); }
  }, 180000);

  it("undoes and redoes accepted construction, excludes previews and failures, and releases historical GPU owners", async () => {
    const created = vi.spyOn(fixtures, "prepareBayConstructionFixture"), view = mount();
    try {
      await ready(); fireEvent.click(screen.getByRole("button", { name: "Repeat bay into facade" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      fireEvent.click(screen.getByRole("button", { name: "Select Split floors" }));
      fireEvent.change(screen.getByLabelText("Floor count"), { target: { value: "2" } }); fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 10000 }); await ready();
      const root = view.container.querySelector<HTMLElement>(".construction-workspace")!;
      expect(root.dataset.constructionUndo).toBe("2");
      fireEvent.click(screen.getByRole("button", { name: "Preview selected" }));
      await waitFor(() => expect(root.dataset.constructionPreview).toBe("floors"), { timeout: 10000 });
      expect(root.dataset.constructionUndo).toBe("2"); expect(view.onSessionChange).toHaveBeenCalledTimes(3);
      fireEvent.keyDown(root, { key: "z", ctrlKey: true });
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 10000 }); await ready();
      expect(root.dataset.constructionPreview).toBe("output"); expect(root.dataset.constructionRedo).toBe("1");
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.nodes.find(node => node.type === "SplitFloors")!.parameters.count).toBe(3);
      fireEvent.keyDown(root, { key: "z", ctrlKey: true, shiftKey: true });
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 10000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.nodes.find(node => node.type === "SplitFloors")!.parameters.count).toBe(2);
      fireEvent.change(screen.getByLabelText("Floor count"), { target: { value: "" } }); fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("finite value");
      expect(root.dataset.constructionUndo).toBe("2"); expect(view.onSessionChange).toHaveBeenCalledTimes(5);
      fireEvent.click(screen.getByRole("button", { name: "Revert draft" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(screen.getByLabelText("Floor count")).toHaveValue(2);
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(6), { timeout: 10000 }); await ready();
      fireEvent.click(screen.getByRole("button", { name: "Select Facade scope" }));
      fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "12" } }); fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(7), { timeout: 10000 }); await ready();
      expect(root.dataset.constructionRedo).toBe("0"); expect(screen.getByRole("button", { name: "Redo construction" })).toBeDisabled();
      expect(view.onSessionChange.mock.calls.at(-1)![0].materials).toBe(materials); expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally {
      view.unmount();
      for (const result of created.mock.results) expect((await result.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
      created.mockRestore();
    }
    for (const record of rendererState.records) expect(record.dispose).toHaveBeenCalledTimes(1);
  }, 60000);

  it("resumes the same source history after leaving the workbench and starts fresh history on Open", async () => {
    const first = mount(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Repeat bay into facade" }));
    await waitFor(() => expect(first.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
    const session = first.onSessionChange.mock.calls.at(-1)![0]; first.unmount();
    const resumed = mount(session);
    try {
      await ready(); expect(screen.getByRole("button", { name: "Undo construction" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(resumed.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 10000 }); await ready();
      expect(resumed.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.1.0");
      expect(screen.getByRole("button", { name: "Redo construction" })).toBeEnabled();
      const project = await createBayConstructionProject(createBayConstructionGraph(), materials.file);
      fireEvent.change(screen.getByLabelText("Open construction file"), { target: { files: [new File([JSON.stringify(project)], "construction.json", { type: "application/json" })] } });
      await waitFor(() => expect(resumed.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 10000 }); await ready();
      expect(screen.getByRole("button", { name: "Undo construction" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Redo construction" })).toBeDisabled();
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { resumed.unmount(); }
  }, 60000);

  it("repeats the accepted bay as actual instances, previews without publishing, edits counts and cleans up", async () => {
    const created = vi.spyOn(fixtures, "prepareBayConstructionFixture"), view = mount();
    try {
      await ready(); fireEvent.click(screen.getByRole("button", { name: "Repeat bay into facade" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      const full = await created.mock.results.at(-1)!.value as fixtures.BayConstructionFixture;
      expect(full.ir.instanceBatches.map(batch => batch.count)).toEqual([12, 12, 12]);
      await waitFor(() => expect(rendererState.records.at(-1)?.camera).toBeDefined());
      const camera = rendererState.records.at(-1)!.camera!, projected: Vector3[] = [];
      for (const x of [full.ir.bounds.min[0], full.ir.bounds.max[0]]) for (const y of [full.ir.bounds.min[1], full.ir.bounds.max[1]]) for (const z of [full.ir.bounds.min[2], full.ir.bounds.max[2]]) {
        const point = new Vector3(x, y, z).project(camera); projected.push(point);
        expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
      }
      expect(Math.max(...projected.map(point => point.y)) - Math.min(...projected.map(point => point.y))).toBeGreaterThan(1.3);
      for (const batch of full.ir.instanceBatches) {
        const mesh = full.buildingRuntime.objectsByBatchId.get(batch.batchId)!;
        expect(mesh.isInstancedMesh).toBe(true); expect(mesh.count).toBe(12);
        expect([...mesh.instanceMatrix!.array]).toEqual([...batch.transforms!]);
        const prototype = full.construction.prototypes!.find(value => value.batchId === batch.recipeId)!;
        expect(mesh.castShadow).toBe(prototype.role !== "glass");
        expect(mesh.receiveShadow).toBe(true);
        expect([...mesh.geometry.getAttribute("position").array]).toEqual([...prototype.positions!]);
        for (const entry of full.ir.semanticIndex.filter(value => value.batchId === batch.batchId)) {
          const lookup = full.buildingRuntime.semanticLookup.get(entry.semanticPath)!;
          expect(lookup.object).toBe(mesh);
          expect(lookup.instanceIndex ?? lookup.elementIndex).toBe(entry.elementIndex);
        }
      }
      const root = view.container.querySelector(".construction-workspace")!;
      fireEvent.click(screen.getByRole("button", { name: "Select Split bays" }));
      fireEvent.click(screen.getByRole("button", { name: "Preview selected" }));
      await waitFor(() => expect(root.getAttribute("data-construction-preview")).toBe("bays"), { timeout: 10000 });
      expect(view.onSessionChange).toHaveBeenCalledTimes(2); expect(full.familyRuntime.disposed).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Show construction" }));
      await waitFor(() => expect(root.getAttribute("data-construction-preview")).toBe("output"), { timeout: 10000 });
      expect(view.onSessionChange).toHaveBeenCalledTimes(2); expect(full.familyRuntime.disposed).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Select Split floors" }));
      fireEvent.change(screen.getByLabelText("Floor count"), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 10000 }); await ready();
      const edited = await created.mock.results.at(-1)!.value as fixtures.BayConstructionFixture;
      expect(edited.ir.instanceBatches.map(batch => batch.count)).toEqual([8, 8, 8]);
      expect(full.familyRuntime.disposed).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Select Roof cap" }));
      fireEvent.click(screen.getByLabelText("Bypass selected node"));
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 10000 }); await ready();
      expect((await created.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir.meshBatches.some(batch => batch.role === "roof")).toBe(false);
      expect(view.onSessionChange.mock.calls.at(-1)![0].materials).toBe(materials);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { view.unmount(); created.mockRestore(); }
    for (const record of rendererState.records) expect(record.dispose).toHaveBeenCalledTimes(1);
  }, 40000);

  it("authors ordered shared layers in the graph and preserves finish source through undo, redo and room restoration", async () => {
    const view = mount();
    try {
      await ready();
      fireEvent.click(screen.getByText("Surface finishes", { exact: false, selector: "summary" }));
      expect(screen.getByRole("button", { name: "Add finish layer" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Finish target"), { target: { value: "all" } });
      fireEvent.change(screen.getByLabelText("New finish strength"), { target: { value: "30" } });
      fireEvent.click(screen.getByRole("button", { name: "Add finish layer" }));
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Save construction" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      const first = view.onSessionChange.mock.calls.at(-1)![0];
      expect(first.graph.schemaVersion).toBe("0.3.0"); expect(first.graph.nodes.find(node => node.type === "SetSurface")!.composition.layers[0].opacity).toBe(0.3);
      expect(view.container.querySelector(".construction-workspace")).toHaveAttribute("data-surface-layer-count", "1");
      fireEvent.change(screen.getByLabelText("Finish source"), { target: { value: "trim.horizontal.primary" } });
      fireEvent.click(screen.getByRole("button", { name: "Add finish layer" }));
      fireEvent.click(screen.getByRole("button", { name: "Move finish 2 up" }));
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
      const second = view.onSessionChange.mock.calls.at(-1)![0], comp = second.graph.nodes.find(node => node.type === "SetSurface")!.composition;
      expect(comp.sources.find(source => source.id === comp.layers[0].sourceId)!.slotId).toBe("trim.horizontal.primary");
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(first.graph);
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(second.graph);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { view.unmount(); }
  }, 60000);

  it("formats derived decimal fields without changing untouched source and can complete the retained facade",async()=>{
    const graph=repeatBayAsFacade(createBayConstructionGraph()),view=mount({graph,materials});
    try {
      await ready();expect(screen.getByLabelText('Height (m)')).toHaveValue(11.4);
      fireEvent.click(screen.getByRole('button',{name:'Apply construction'}));await ready();expect(view.onSessionChange).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button',{name:'Complete building'}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      expect(screen.getByRole('heading',{name:'Building construction'})).toBeInTheDocument();
      expect(view.onSessionChange.mock.calls.at(-1)![0].materials).toBe(materials);
      fireEvent.click(screen.getByRole('button',{name:'Undo construction'}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(graph);
    } finally {view.unmount();}
  },45000);

  it("focuses an actual selected frame and retains the view through a material-only graph publication",async()=>{
    const view=mount();try{
      await ready();await waitFor(()=>expect(rendererState.records.at(-1)?.camera).toBeDefined());
      const before=rendererState.records.at(-1)!.camera!.position.clone();
      fireEvent.change(screen.getByLabelText('Semantic element'),{target:{value:'building/authored-bay/node/window/glass'}});
      await waitFor(()=>expect(screen.getByRole('button',{name:'Focus frame'})).toBeEnabled());
      fireEvent.click(screen.getByRole('button',{name:'Focus frame'}));const focused=rendererState.records.at(-1)!.camera!.position.clone();expect(focused.distanceTo(before)).toBeGreaterThan(.1);
      fireEvent.change(screen.getByLabelText('New finish strength'),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Add finish layer'}));fireEvent.click(screen.getByRole('button',{name:'Apply construction'}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();await waitFor(()=>expect(rendererState.records.at(-1)?.camera?.position.distanceTo(focused)).toBeLessThan(1e-6));
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    }finally{view.unmount();}
  },30000);

  it("edits actual graph dimensions, keeps the material artifact owner, and releases views on close", async () => {
    const view = mount();
    await ready();
    const first = view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash");
    const oldRenderer = rendererState.records[0];
    fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "3.2" } });
    expect(screen.getByRole("button", { name: "Save construction" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 10000 });
    const session = view.onSessionChange.mock.calls[1][0];
    expect(session.graph.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM).toBe(3.2);
    expect(session.materials).toBe(materials);
    expect(view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash")).not.toBe(first);
    expect(oldRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(sourceCalls);
    view.unmount();
    expect(view.releaseBase).toHaveBeenCalledTimes(1);
    expect(rendererState.records.at(-1)!.dispose).toHaveBeenCalledTimes(1);
  }, 30000);

  it("retains the accepted bay after an invalid edit and permits correction", async () => {
    const view = mount();
    await ready();
    const hash = view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash");
    fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("finite value");
    expect(view.onSessionChange).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash")).toBe(hash);
    fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "3.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 10000 });
  }, 30000);

  it("keeps the old canvas and source when candidate renderer preparation fails", async () => {
    const created = vi.spyOn(fixtures, "prepareBayConstructionFixture");
    const view = mount();
    try {
      await ready();
      const currentCanvas = view.container.querySelector("canvas");
      const hash = view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash");
      rendererState.reject = true;
      fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "3.4" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Candidate renderer rejected");
      expect(view.container.querySelector("canvas")).toBe(currentCanvas);
      expect(view.container.querySelector(".construction-workspace")!.getAttribute("data-construction-hash")).toBe(hash);
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
      const rejected = await created.mock.results.at(-1)!.value as fixtures.BayConstructionFixture;
      expect(rejected.familyRuntime.disposed).toBe(true);
    } finally { view.unmount(); created.mockRestore(); }
  }, 30000);

it("lights the visible facade from the front and updates the bay shadow projection", async () => {
  const fixture = fixtures.createBayConstructionFixture(base, await evaluateBayConstruction(createBayConstructionGraph()), materials);
  const view = render(<AssemblyHall fixture={fixture} workspace lighting="bay" showFamilyTools={false} rendererFactory={factory} />);
  try {
    await waitFor(() => expect(rendererState.records[0]?.scene).toBeDefined());
    const key = rendererState.records[0].scene!.getObjectByName("assembly-hall.key-light") as DirectionalLight;
    expect(key).toBeInstanceOf(DirectionalLight);
    expect(key.position.z).toBeLessThan(key.target.position.z);
    expect(key.shadow.camera.right).toBeLessThan(4.1);
    expect(key.shadow.camera.projectionMatrix.elements[0]).toBeCloseTo(2 / (key.shadow.camera.right - key.shadow.camera.left));
    expect(screen.queryByLabelText("Window selection")).not.toBeInTheDocument();
  } finally { view.unmount(); fixture.familyRuntime.dispose(); }
}, 30000);


it("generates, edits, locks and rerolls through the actual workbench with saved lineage and exact material reuse", async () => {
  const created = vi.spyOn(fixtures, "createReferenceConstructionMaterials"), prepared = vi.spyOn(fixtures, "prepareBayConstructionFixture");
  const view = mount({ graph: createBuildingConstructionGraph(), materials });
  try {
    await ready();
    fireEvent.change(screen.getByLabelText("Generated storeys"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Generated bays"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 30000 }); await ready();
    const generated = view.onSessionChange.mock.calls.at(-1)![0];
    expect(generated.generation!.source.intent.requested).toMatchObject({ floorCount: 2, bayCount: 3 });
    expect((await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir.instanceBatches[0].count).toBe(23);
    expect(created).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Advanced recipe graph", { selector: "summary" }));
    await screen.findByRole("button", { name: "Select Footprint" });
    fireEvent.click(screen.getByRole("button", { name: "Select Footprint" }));
    fireEvent.change(screen.getByLabelText("Depth (m)", { exact: true }), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
    fireEvent.click(screen.getByLabelText("Lock footprint"));
    fireEvent.click(screen.getByRole("button", { name: "Reroll unlocked" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
    const rerolled = view.onSessionChange.mock.calls.at(-1)![0];
    expect(rerolled.graph.nodes.find(node => node.type === "Footprint")!.parameters.depthM).toBe(13);
    expect(rerolled.materials).toBe(generated.materials); expect(created).toHaveBeenCalledTimes(1);
    expect(rerolled.generation!.source.intent.seeds.building).not.toBe(generated.generation!.source.intent.seeds.building);
    fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
    expect(view.onSessionChange.mock.calls.at(-1)![0].generation).toEqual(generated.generation);
    fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(6), { timeout: 15000 }); await ready();
    expect(view.onSessionChange.mock.calls.at(-1)![0].generation).toEqual(rerolled.generation);
    const saved = await createBayConstructionProject(rerolled.graph, rerolled.materials.file, rerolled.generation);
    expect(saved.schemaVersion).toBe("0.5.0"); expect(saved.graph.schemaVersion).toBe("0.4.0");
    const parsed = await readBayConstructionProject(JSON.parse(JSON.stringify(saved)));
    expect(parsed.project.graph).toEqual(rerolled.graph); expect(parsed.project.generation).toEqual(rerolled.generation);
    const checkpoint = await createConstructionCheckpoint("generated-workspace", rerolled.graph, rerolled.materials.file, rerolled.generation);
    expect((await readConstructionCheckpoint(checkpoint)).project.generation).toEqual(rerolled.generation);
    const forged = structuredClone(saved); forged.generation!.materialSourceHash = "0".repeat(64);
    const { contentHash: oldHash, ...payload } = forged; expect(oldHash).toBe(saved.contentHash); forged.contentHash = await hashCanonicalJson(payload);
    await expect(readBayConstructionProject(forged)).rejects.toThrow("does not match");
    fireEvent.click(screen.getByText("Surface finishes", { exact: false, selector: "summary" }));
    fireEvent.change(screen.getByLabelText("Finish target"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("button", { name: "Add finish layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(7), { timeout: 15000 }); await ready();
    const finished = view.onSessionChange.mock.calls.at(-1)![0];
    const finishedIR = (await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir;
    fireEvent.change(screen.getByLabelText("Material seed"), { target: { value: "new-material-seed" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
    await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(8), { timeout: 30000 }); await ready();
    const materialChanged = view.onSessionChange.mock.calls.at(-1)![0];
    expect(created).toHaveBeenCalledTimes(2); expect(screen.getByRole("button", { name: "Undo construction" })).toBeDisabled();
    const newComposition = materialChanged.graph.nodes.find(node => node.type === "SetSurface")!.composition;
    expect(newComposition.layers).toEqual(finished.graph.nodes.find(node => node.type === "SetSurface")!.composition.layers);
    expect(newComposition.sources[0].atlasContentHash).toBe(materialChanged.materials.packedAtlas.contentHash);
    const nextIR = (await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir;
    expect(exactIR(nextIR.meshBatches)).toBe(exactIR(finishedIR.meshBatches)); expect(exactIR(nextIR.instanceBatches)).toBe(exactIR(finishedIR.instanceBatches));
    const withFinish = await createBayConstructionProject(materialChanged.graph, materialChanged.materials.file, materialChanged.generation);
    expect((await readBayConstructionProject(JSON.parse(JSON.stringify(withFinish)))).project.generation).toEqual(materialChanged.generation);
    rendererState.reject = true;
    fireEvent.click(screen.getByRole("button", { name: "Reroll unlocked" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"), { timeout: 15000 });
    expect(view.onSessionChange).toHaveBeenCalledTimes(8); expect(created).toHaveBeenCalledTimes(2);
    const accepted = await prepared.mock.results.at(-2)!.value as fixtures.BayConstructionFixture;
    expect(accepted.familyRuntime.disposed).toBe(false);
    expect((await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
  } finally { view.unmount(); created.mockRestore(); prepared.mockRestore(); }
  for (const entry of rendererState.records) expect(entry.dispose).toHaveBeenCalledTimes(1);
}, 120000);

  it("abandons a pending material generation when the workbench owner leaves", async () => {
    const original = fixtures.createReferenceConstructionMaterials;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const created = vi.spyOn(fixtures, "createReferenceConstructionMaterials").mockImplementation(async (...args) => {
      await gate; return original(...args);
    });
    const prepared = vi.spyOn(fixtures, "prepareBayConstructionFixture");
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready(); fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
      await waitFor(() => expect(created).toHaveBeenCalledTimes(1), { timeout: 15000 });
      const signal = created.mock.calls[0][2], pending = created.mock.results[0].value;
      view.unmount(); expect(signal.aborted).toBe(true); release();
      await expect(pending).rejects.toThrow("aborted");
      expect(view.onSessionChange).toHaveBeenCalledTimes(1); expect(prepared).toHaveBeenCalledTimes(1);
      expect((await prepared.mock.results[0].value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
    } finally { release(); view.unmount(); created.mockRestore(); prepared.mockRestore(); }
  }, 30000);

  it("selects real construction recipes, reuses materials and restores recipe lineage with history and portable source", async () => {
    const created = vi.spyOn(fixtures, "createReferenceConstructionMaterials"), prepared = vi.spyOn(fixtures, "prepareBayConstructionFixture");
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready(); fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 30000 }); await ready();
      const baseline = view.onSessionChange.mock.calls.at(-1)![0];
      const originalIR = (await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir;
      fireEvent.change(screen.getByLabelText("Construction recipe"), { target: { value: "deep-reveal-masonry" } });
      fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
      const deep = view.onSessionChange.mock.calls.at(-1)![0];
      expect(deep.generation!.source.recipe.id).toBe("deep-reveal-masonry"); expect(deep.materials).toBe(baseline.materials);
      expect(exactIR((await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).ir.meshBatches)).not.toBe(exactIR(originalIR.meshBatches));
      fireEvent.click(screen.getByText("Advanced recipe graph", { selector: "summary" }));
    await screen.findByRole("button", { name: "Select Footprint" });
    fireEvent.click(screen.getByRole("button", { name: "Select Footprint" }));
      fireEvent.change(screen.getByLabelText("Depth (m)", { exact: true }), { target: { value: "13" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
      fireEvent.change(screen.getByLabelText("Construction recipe"), { target: { value: "projecting-cornice-masonry" } });
      fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
      const cornice = view.onSessionChange.mock.calls.at(-1)![0];
      expect(cornice.graph.nodes.find(node => node.type === "Footprint")!.parameters.depthM).toBe(13);
      expect(cornice.materials).toBe(baseline.materials); expect(created).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(6), { timeout: 15000 }); await ready();
      expect(screen.getByLabelText("Construction recipe")).toHaveValue("deep-reveal-masonry");
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(7), { timeout: 15000 }); await ready();
      expect(screen.getByLabelText("Construction recipe")).toHaveValue("projecting-cornice-masonry");
      const saved = await createBayConstructionProject(cornice.graph, cornice.materials.file, cornice.generation);
      const parsed = await readBayConstructionProject(JSON.parse(JSON.stringify(saved)));
      expect(parsed.project.generation).toEqual(cornice.generation);
      const checkpoint = await createConstructionCheckpoint("recipe-workspace", cornice.graph, cornice.materials.file, cornice.generation);
      expect((await readConstructionCheckpoint(checkpoint)).project.generation).toEqual(cornice.generation);
      rendererState.reject = true;
      fireEvent.change(screen.getByLabelText("Construction recipe"), { target: { value: "restrained-masonry-rectangular" } });
      fireEvent.click(screen.getByRole("button", { name: "Generate building" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"), { timeout: 15000 });
      expect(view.onSessionChange).toHaveBeenCalledTimes(7); expect(created).toHaveBeenCalledTimes(1);
      expect(view.container.querySelector(".construction-generation")).toHaveAttribute("data-generation-recipe", "projecting-cornice-masonry");
      expect((await prepared.mock.results.at(-1)!.value as fixtures.BayConstructionFixture).familyRuntime.disposed).toBe(true);
    } finally { view.unmount(); created.mockRestore(); prepared.mockRestore(); }
    for (const entry of rendererState.records) expect(entry.dispose).toHaveBeenCalledTimes(1);
  }, 120000);

  it("edits shared construction through grouped controls with exact material reuse, undo, recovery and advanced access",async()=>{
    const prepared=vi.spyOn(fixtures,"prepareBayConstructionFixture"),view=mount({graph:createBuildingConstructionGraph(),materials});
    try{
      await ready();expect(screen.getByRole("heading",{name:"Building controls"})).toBeInTheDocument();
      expect(screen.queryByLabelText("Construction step")).not.toBeInTheDocument();expect(screen.queryByRole("region",{name:"Construction nodes"})).not.toBeInTheDocument();
      expect(screen.getByText("Applies to all 47 generated windows.")).toBeInTheDocument();
      const before=view.onSessionChange.mock.calls.at(-1)![0];
      fireEvent.change(screen.getByLabelText("Recess (m)"),{target:{value:"0.25"}});fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      const edited=view.onSessionChange.mock.calls.at(-1)![0];expect(edited.graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.recessM).toBe(.25);expect(edited.materials).toBe(materials);
      fireEvent.click(screen.getByRole("button",{name:"Undo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();expect(screen.getByLabelText("Recess (m)")).toHaveValue(.14);
      fireEvent.click(screen.getByRole("button",{name:"Redo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(4),{timeout:15000});await ready();expect(screen.getByLabelText("Recess (m)")).toHaveValue(.25);
      const portable=await createBayConstructionProject(edited.graph,edited.materials.file,edited.generation);expect((await readBayConstructionProject(JSON.parse(JSON.stringify(portable)))).project.graph).toEqual(edited.graph);
      rendererState.reject=true;fireEvent.change(screen.getByLabelText("Recess (m)"),{target:{value:"0.27"}});fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));
      await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"),{timeout:15000});expect(view.onSessionChange).toHaveBeenCalledTimes(4);
      fireEvent.click(screen.getByRole("button",{name:"Revert draft"}));expect(screen.getByLabelText("Recess (m)")).toHaveValue(.25);
      fireEvent.click(screen.getByText("Advanced recipe graph",{selector:"summary"}));await screen.findByLabelText("Construction step");expect(screen.queryByText("Applies to all 47 generated windows.")).not.toBeInTheDocument();
      expect(screen.getByRole("region",{name:"Construction nodes"})).toBeInTheDocument();
      expect(before.graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.recessM).toBe(.14);expect(generate).toHaveBeenCalledTimes(sourceCalls);
    }finally{view.unmount();prepared.mockRestore();}
    for(const record of rendererState.records)expect(record.dispose).toHaveBeenCalledTimes(1);
  },60000);

  it("lets an artist select family variation groups without changing the building", async () => {
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready();
      for (const label of ["Opening heads and sash", "Ground frontage", "Cornice and parapet"]) {
        const option = screen.getByRole("checkbox", { name: label });
        expect(option).not.toBeChecked(); fireEvent.click(option); expect(option).toBeChecked();
      }
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); }
  }, 60000);

  it("authors grouped openings through history and save/open without replacing materials", async () => {
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready();
      fireEvent.change(screen.getByLabelText("Grouped window arrangement"), { target: { value: "2" } });
      expect(screen.getByRole("button", { name: "Save construction" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply window arrangement" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      const edited = view.onSessionChange.mock.calls.at(-1)![0];
      expect(edited.graph.schemaVersion).toBe("0.11.0"); expect(edited.graph.upperBayGroups).toHaveLength(1); expect(edited.materials).toBe(materials);
      const file = await createBayConstructionProject(edited.graph, edited.materials.file);
      expect(file.schemaVersion).toBe("0.12.0"); expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
      expect(screen.getByLabelText("Grouped window arrangement")).toHaveValue("1");
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
      expect(screen.getByLabelText("Grouped window arrangement")).toHaveValue("2");
      fireEvent.change(screen.getByLabelText("Grouped window pier width"), { target: { value: "0.1" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply window arrangement" }));
      await screen.findByRole("alert"); expect(view.onSessionChange).toHaveBeenCalledTimes(4);
      fireEvent.click(screen.getByRole("button", { name: "Discard window arrangement draft" }));
      fireEvent.change(screen.getByLabelText("Grouped window arrangement"), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply window arrangement" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.10.0");
      fireEvent.change(screen.getByLabelText("Upper front opening head"), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(6), { timeout: 15000 }); await ready();
      fireEvent.change(screen.getByLabelText("Grouped window arrangement"), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply window arrangement" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Change Upper front opening head to Flat head first");
      expect(view.onSessionChange).toHaveBeenCalledTimes(6);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { view.unmount(); }
    for (const record of rendererState.records) expect(record.dispose).toHaveBeenCalledTimes(1);
  }, 60000);

  it("publishes round heads through history and portable source with the same materials",async()=>{
    const view=mount({graph:createBuildingConstructionGraph(),materials});
    try {
      await ready();fireEvent.change(screen.getByRole("combobox",{name:"Upper front opening head"}),{target:{value:"1"}});
      fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      const edited=view.onSessionChange.mock.calls.at(-1)![0];expect(edited.graph.schemaVersion).toBe("0.10.0");expect(edited.materials).toBe(materials);
      expect(edited.graph.nodes.find(n=>n.type==="PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
      const file=await createBayConstructionProject(edited.graph,edited.materials.file);expect(file.schemaVersion).toBe("0.11.0");expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      fireEvent.click(screen.getByRole("button",{name:"Undo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();expect(screen.getByRole("combobox",{name:"Upper front opening head"})).toHaveValue("0");
      fireEvent.click(screen.getByRole("button",{name:"Redo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(4),{timeout:15000});await ready();expect(screen.getByRole("combobox",{name:"Upper front opening head"})).toHaveValue("1");
      rendererState.reject=true;fireEvent.change(screen.getByRole("combobox",{name:"Upper front opening head"}),{target:{value:"0"}});fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));
      await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"),{timeout:15000});expect(view.onSessionChange).toHaveBeenCalledTimes(4);
      fireEvent.click(screen.getByRole("button",{name:"Revert draft"}));expect(screen.getByRole("combobox",{name:"Upper front opening head"})).toHaveValue("1");
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally {view.unmount();}
    for(const record of rendererState.records)expect(record.dispose).toHaveBeenCalledTimes(1);
  },60000);

  it("publishes casement vocabulary through real history and version-six portable source with the same materials",async()=>{
    const view=mount({graph:createBuildingConstructionGraph(),materials});
    try {
      await ready();fireEvent.change(screen.getByRole("combobox",{name:"Window assembly"}),{target:{value:"1"}});
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);expect(screen.getByRole("button",{name:"Apply construction"})).toHaveTextContent("47 windows");
      fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      const edited=view.onSessionChange.mock.calls.at(-1)![0];expect(edited.graph.schemaVersion).toBe("0.5.0");expect(edited.materials).toBe(materials);expect(edited.graph.nodes.find(n=>n.type==="AssembleWindow")!.parameters.layout).toBe(1);
      const file=await createBayConstructionProject(edited.graph,edited.materials.file);expect(file.schemaVersion).toBe("0.6.0");expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      await expect(readBayConstructionProject({...file,schemaVersion:"0.5.0"})).rejects.toThrow("versions must agree");
      fireEvent.click(screen.getByRole("button",{name:"Undo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();expect(screen.getByRole("combobox",{name:"Window assembly"})).toHaveValue("0");expect(view.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.4.0");
      fireEvent.click(screen.getByRole("button",{name:"Redo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(4),{timeout:15000});await ready();expect(screen.getByRole("combobox",{name:"Window assembly"})).toHaveValue("1");
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally {view.unmount();}
    for(const record of rendererState.records)expect(record.dispose).toHaveBeenCalledTimes(1);
  },60000);

  it("publishes the parapet with cornice and opening choices, portable10, checkpoint and history", async () => {
    const base = withConstructionCorniceLayout(createBuildingConstructionGraph(), 2), view = mount({ graph: base, materials });
    try {
      await ready(); fireEvent.click(screen.getByText("Roof & trim", { selector: "summary" }));
      fireEvent.change(screen.getByRole("combobox", { name: "Parapet silhouette" }), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      const edited = view.onSessionChange.mock.calls.at(-1)![0];
      expect(edited.graph).toEqual(withConstructionParapetSilhouette(base, 1)); expect(edited.materials).toBe(materials);
      const file = await createBayConstructionProject(edited.graph, edited.materials.file); expect(file.schemaVersion).toBe("0.10.0");
      expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      await expect(readBayConstructionProject({ ...file, schemaVersion: "0.9.0" })).rejects.toThrow("versions must agree");
      const checkpoint = await createConstructionCheckpoint("parapet-workspace", edited.graph, edited.materials.file);
      expect((await readConstructionCheckpoint(checkpoint)).project.graph).toEqual(edited.graph);
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(base);
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
      expect(screen.getByRole("combobox", { name: "Parapet silhouette" })).toHaveValue("1");
      fireEvent.change(screen.getByRole("combobox", { name: "Cornice treatment" }), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
      const after = view.onSessionChange.mock.calls.at(-1)![0];
      expect(after.graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetSilhouette).toBe(1);
      expect(after.graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.corniceAssembly).toBe(1);
      expect(after.materials).toBe(materials);
    } finally { view.unmount(); }
  }, 90000);

  it("publishes cornice treatment with prior authored choices, portable9, checkpoint, history and failed-candidate retention",async()=>{
    const base=createBuildingConstructionGraph(),target={documentId:base.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front" as const,floorIndex:1,bayIndex:2};
    const graph=withConstructionOpeningWidth(withConstructionStorefront(withConstructionWindowLayout(base,"window",2),1),{target,widthM:1.8});
    const original=structuredClone(graph),view=mount({graph,materials});
    try{
      await ready();fireEvent.click(screen.getByText("Roof & trim",{selector:"summary"}));
      fireEvent.change(screen.getByRole("combobox",{name:"Cornice treatment"}),{target:{value:"1"}});
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      const edited=view.onSessionChange.mock.calls.at(-1)![0];expect(edited.graph).toEqual(withConstructionCorniceLayout(original,1));expect(edited.materials).toBe(materials);
      const file=await createBayConstructionProject(edited.graph,edited.materials.file);expect(file.schemaVersion).toBe("0.9.0");
      expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      await expect(readBayConstructionProject({...file,schemaVersion:"0.8.0"})).rejects.toThrow("versions must agree");
      await expect(readBayConstructionProject({...file,graph:original})).rejects.toThrow("versions must agree");
      const checkpoint=await createConstructionCheckpoint("cornice-workspace",edited.graph,edited.materials.file);
      expect((await readConstructionCheckpoint(checkpoint)).project.graph).toEqual(edited.graph);
      rendererState.reject=true;fireEvent.change(screen.getByRole("combobox",{name:"Cornice treatment"}),{target:{value:"2"}});
      fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));
      await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Candidate renderer rejected"),{timeout:15000});expect(view.onSessionChange).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button",{name:"Revert draft"}));
      fireEvent.click(screen.getByRole("button",{name:"Undo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph).toEqual(original);
      fireEvent.click(screen.getByRole("button",{name:"Redo construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(4),{timeout:15000});await ready();
      expect(screen.getByRole("combobox",{name:"Cornice treatment"})).toHaveValue("1");
      fireEvent.click(screen.getByText("Openings",{selector:"summary"}));fireEvent.change(screen.getByRole("combobox",{name:"Window assembly"}),{target:{value:"1"}});
      fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(5),{timeout:15000});await ready();
      const changed=view.onSessionChange.mock.calls.at(-1)![0];expect(changed.graph.schemaVersion).toBe("0.8.0");expect(changed.graph.nodes.find(n=>n.type==="BuildingRoof")!.parameters.corniceAssembly).toBe(1);
      expect(changed.graph.nodes.find(n=>n.type==="EditOpeningWidth")!.overrides).toEqual([{target,widthM:1.8}]);expect(changed.materials).toBe(materials);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    }finally{view.unmount();}
    for(const record of rendererState.records)expect(record.dispose).toHaveBeenCalledTimes(1);
  },90000);

  it("edits one selected window with material retention, portable/checkpoint source, local history and reset", async () => {
    const view=mount({graph:createBuildingConstructionGraph(),materials});
    try {
      await ready();
      const path=screen.getByRole("option",{name:"Front · Storey 2 · Bay 3"}).getAttribute("value")!;
      fireEvent.change(screen.getByRole("combobox",{name:"Window to edit"}),{target:{value:path}});
      expect(screen.getByLabelText("Selected width (m)")).toHaveValue(1.22);
      fireEvent.change(screen.getByLabelText("Selected width (m)"),{target:{value:"1.8"}});
      expect(screen.getByRole("button", { name: "Apply window width" })).toBeEnabled();
      expect(screen.getByRole("button",{name:"Save construction"})).toBeDisabled();
      expect(screen.getByRole("button",{name:"Apply construction"})).toBeDisabled();
      fireEvent.click(screen.getByRole("button",{name:"Apply window width"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(2),{timeout:15000});await ready();
      const edited=view.onSessionChange.mock.calls.at(-1)![0];
      expect(edited.graph.schemaVersion).toBe("0.7.0");expect(edited.materials).toBe(materials);
      expect(edited.graph.nodes.find(node=>node.type==="EditOpeningWidth")!.overrides).toEqual([{target:{documentId:edited.graph.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front",floorIndex:1,bayIndex:2},widthM:1.8}]);
      expect(screen.getByLabelText("Selected width (m)")).toHaveValue(1.8);
      const file=await createBayConstructionProject(edited.graph,edited.materials.file);
      expect(file.schemaVersion).toBe("0.8.0");expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      await expect(readBayConstructionProject({...file,schemaVersion:"0.7.0"})).rejects.toThrow("versions must agree");
      const checkpoint=await createConstructionCheckpoint("local-opening-workspace",edited.graph,edited.materials.file);
      expect((await readConstructionCheckpoint(checkpoint)).project.graph).toEqual(edited.graph);
      fireEvent.change(screen.getByLabelText("Selected width (m)"),{target:{value:"3"}});
      fireEvent.click(screen.getByRole("button",{name:"Apply window width"}));
      await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("piers"),{timeout:15000});
      expect(view.onSessionChange).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button",{name:"Revert width"}));await ready();
      fireEvent.click(screen.getByRole("button",{name:"Undo construction"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(3),{timeout:15000});await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.4.0");
      fireEvent.click(screen.getByRole("button",{name:"Redo construction"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(4),{timeout:15000});await ready();
      fireEvent.click(screen.getByRole("button",{name:"Use shared width"}));
      await waitFor(()=>expect(view.onSessionChange).toHaveBeenCalledTimes(5),{timeout:15000});await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.nodes.find(node=>node.type==="EditOpeningWidth")!.overrides).toEqual([]);
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally {view.unmount();}
    for(const record of rendererState.records)expect(record.dispose).toHaveBeenCalledTimes(1);
  },90000);

  it("publishes storefronts with unchanged materials, local history, version-seven source and invalid-fit retention", async () => {
    const view = mount({ graph: createBuildingConstructionGraph(), materials });
    try {
      await ready(); fireEvent.click(screen.getByText("Ground floor", { selector: "summary" }));
      fireEvent.change(screen.getByRole("combobox", { name: "Ground frontage" }), { target: { value: "1" } });
      expect(view.onSessionChange).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(2), { timeout: 15000 }); await ready();
      const edited = view.onSessionChange.mock.calls.at(-1)![0];
      expect(edited.graph.schemaVersion).toBe("0.6.0"); expect(edited.materials).toBe(materials);
      expect(screen.getByText("Applies to 4 front ground-floor bays, including the entrance.")).toBeInTheDocument();
      const file = await createBayConstructionProject(edited.graph, edited.materials.file);
      expect(file.schemaVersion).toBe("0.7.0"); expect((await readBayConstructionProject(JSON.parse(JSON.stringify(file)))).project).toEqual(file);
      await expect(readBayConstructionProject({ ...file, schemaVersion: "0.6.0" })).rejects.toThrow("versions must agree");
      const checkpoint = await createConstructionCheckpoint("storefront-workspace", edited.graph, edited.materials.file);
      expect((await readConstructionCheckpoint(checkpoint)).project.graph).toEqual(edited.graph);
      fireEvent.change(screen.getByLabelText("Transom level (m)"), { target: { value: "3" } });
      fireEvent.change(screen.getByLabelText("Head band height (m)"), { target: { value: "1.2" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("150 mm"), { timeout: 15000 });
      expect(view.onSessionChange).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button", { name: "Revert draft" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(3), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.4.0");
      fireEvent.click(screen.getByRole("button", { name: "Redo construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(4), { timeout: 15000 }); await ready();
      expect(screen.getByRole("combobox", { name: "Ground frontage" })).toHaveValue("1");
      fireEvent.click(screen.getByText("Openings", { selector: "summary" }));
      fireEvent.change(screen.getByRole("combobox", { name: "Window assembly" }), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply construction" }));
      await waitFor(() => expect(view.onSessionChange).toHaveBeenCalledTimes(5), { timeout: 15000 }); await ready();
      expect(view.onSessionChange.mock.calls.at(-1)![0].graph.schemaVersion).toBe("0.6.0");
      expect(generate).toHaveBeenCalledTimes(sourceCalls);
    } finally { view.unmount(); }
    for (const record of rendererState.records) expect(record.dispose).toHaveBeenCalledTimes(1);
  }, 90000);

});
