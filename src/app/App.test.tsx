import * as p3AppSourceCodec from "../features/building-family/state/buildingSourceFile";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { StrictMode } from "react";
import type { Scene } from "three";
import { BuildingRunController } from "../features/building-family/state/buildingRunController";
import * as rendererFactoryModule from "../features/building-family/renderer-three/assemblyRendererFactory";
import * as completedFamilyPersistenceModule from "../features/building-family/state/completedFamilyPersistence";
import * as completedFamilyExportImportModule from "../features/building-family/state/completedFamilyExportImport";
import { App } from "./App";
import { latestMaterialSourceCacheHit } from "./runEventSelectors";
import { indexedDbArtifactCacheKey } from "../features/building-family/materials/indexedDbArtifactPersistence";
import { createCompletedFamilyExportBundle } from "../features/building-family/state/completedFamilyExportBundle";
import {
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket
} from "../features/building-family/state/completedFamilyPersistence";
import { defaultBuildingPromptControls } from "../features/building-family/state/buildingStore";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../features/building-family/ui/assemblyHallFixture";

class FakeIdbRequest<T = unknown> {
  error: Error | null = null;
  result: T | undefined;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }
}

class FakeObjectStore {
  constructor(private readonly records: Map<string, unknown>, private readonly transaction?: FakeTransaction) {}

  put(record: { key: string; entry: unknown }): FakeIdbRequest<string> {
    const request = new FakeIdbRequest<string>();
    const owned = structuredClone(record);
    if (this.transaction) this.transaction.stage(record.key, owned);
    else this.records.set(record.key, owned);
    request.succeed(record.key);
    const transaction = this.transaction;
    if (transaction) queueMicrotask(() => transaction.complete());
    return request;
  }

  get(key: string): FakeIdbRequest<unknown> {
    const request = new FakeIdbRequest<unknown>();
    request.succeed(structuredClone(this.records.get(key)));
    return request;
  }

  getAll(): FakeIdbRequest<unknown[]> {
    const request = new FakeIdbRequest<unknown[]>();
    request.succeed(Array.from(this.records.values()).map((record) => structuredClone(record)));
    return request;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;
  private readonly staged = new Map<string, unknown>();
  private active = true;

  constructor(private readonly records: Map<string, unknown>) {}

  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this.records, this);
  }

  stage(key: string, record: unknown): void {
    this.staged.set(key, record);
  }

  complete(): void {
    if (!this.active) return;
    this.active = false;
    for (const [key, record] of this.staged) this.records.set(key, record);
    this.staged.clear();
    this.oncomplete?.();
  }

  abort(): void {
    if (!this.active) return;
    this.active = false;
    this.staged.clear();
    this.onabort?.();
  }
}

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  get records(): Map<string, unknown> { return this.store("cachedArtifacts"); }
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name)
  };

  store(name: string): Map<string, unknown> {
    let records = this.stores.get(name);
    if (!records) { records = new Map(); this.stores.set(name, records); }
    return records;
  }

  createObjectStore(name: string): FakeObjectStore {
    return new FakeObjectStore(this.store(name));
  }

  transaction(name: string = "cachedArtifacts"): FakeTransaction {
    return new FakeTransaction(this.store(name));
  }
}

class FakeOpenRequest extends FakeIdbRequest<FakeDatabase> {
  onupgradeneeded: (() => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly databases = new Map<string, FakeDatabase>();
  readonly opened: string[] = [];
  get database(): FakeDatabase { return this.named("buildo-building-family-artifacts"); }

  named(name: string): FakeDatabase {
    let database = this.databases.get(name);
    if (!database) { database = new FakeDatabase(); this.databases.set(name, database); }
    return database;
  }

  open(name: string = "buildo-building-family-artifacts"): FakeOpenRequest {
    const fresh = !this.databases.has(name), database = this.named(name);
    this.opened.push(name);
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      request.result = database;
      if (fresh) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeAppLocks implements Pick<LockManager, "request"> {
  readonly held = new Map<string, object>();
  readonly requested: string[] = [];
  request<T>(name: string, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  request<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  async request<T>(name: string, optionsOrCallback: LockOptions | LockGrantedCallback<T>, callback?: LockGrantedCallback<T>): Promise<Awaited<T>> {
    const run = typeof optionsOrCallback === "function" ? optionsOrCallback : callback!;
    this.requested.push(name);
    if (this.held.has(name)) { await Promise.resolve(); return await run(null); }
    const token = {};
    this.held.set(name, token);
    await Promise.resolve();
    try { return await run({ name, mode: "exclusive" } as Lock); }
    finally {
      if (this.held.get(name) === token) this.held.delete(name);
    }
  }
}

let appDefaultIndexedDb: FakeIndexedDbFactory;
let appDefaultLocks: FakeAppLocks;
let restoreAppCheckpointEnvironment: (() => void) | undefined;
beforeEach(() => {
  const indexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  appDefaultIndexedDb = new FakeIndexedDbFactory();
  appDefaultLocks = new FakeAppLocks();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: appDefaultIndexedDb as unknown as IDBFactory });
  Object.defineProperty(navigator, "locks", { configurable: true, value: appDefaultLocks });
  restoreAppCheckpointEnvironment = () => {
    if (indexedDb) Object.defineProperty(globalThis, "indexedDB", indexedDb); else Reflect.deleteProperty(globalThis, "indexedDB");
    if (locks) Object.defineProperty(navigator, "locks", locks); else Reflect.deleteProperty(navigator, "locks");
  };
});
afterEach(() => { restoreAppCheckpointEnvironment?.(); restoreAppCheckpointEnvironment = undefined; });

async function waitForInitialRun(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"), { timeout: 10000 });
}

function selectRoom(
  name: "Prompt Lab" | "Atlas Lab" | "Component Forge" | "Art Kit Lab" | "Assembly Hall" | "Sample Gallery"
): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#room=promptLab");
  });

  it("opens the default route in the construction workspace while retaining explicit legacy room links", () => {
    window.history.replaceState(null, "", "/");
    const view = render(<App />);
    expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Prompt Lab" })).not.toBeInTheDocument();
    view.unmount();
  });

  it("does not auto-start a new construction after authority moves to another document", async()=>{
    window.history.replaceState(null,'','/');const view=render(<App />);
    try{
      act(()=>{window.history.replaceState(null,'','/#document=manual-foreign-authority&room=assemblyHall');window.dispatchEvent(new HashChangeEvent('hashchange'));});
      await waitFor(()=>expect(screen.getByLabelText('Route document identity')).toHaveTextContent('manual-foreign-authority'));
      await waitForInitialRun();await waitFor(()=>expect(screen.getByRole('button',{name:'Construct building'})).toBeEnabled(),{timeout:10000});
      expect(view.container.querySelector('.construction-workspace')).toBeNull();
    }finally{view.unmount();}
  },20000);

  it("retains the explicit legacy lab workflow", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Buildo" })).toBeInTheDocument();
    expect(screen.getByText("Wild Construct Lab")).toBeInTheDocument();
    expect(screen.getByLabelText("Project setup status")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Building rooms" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prompt Lab" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "Prompt Lab" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atlas Lab" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Floors"), { target: { value: "5" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("floorCount");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("runtimeBuildingIr");
    expect(await screen.findByRole("heading", { name: "Generation Run" })).toBeInTheDocument();
    await waitForInitialRun();
    expect(screen.getByRole("button", { name: "Cancel Run" })).toBeDisabled();
    const firstArtifactId = screen.getByLabelText("Generation run artifact").textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitForInitialRun();
    await waitFor(() => expect(screen.getByLabelText("Generation run artifact")).not.toHaveTextContent(firstArtifactId));
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("packed-atlas:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("component-catalog:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache hit");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("uploadingGpuResources");
    expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent("assembly-hall-fixture:");
    expect(await screen.findByRole("heading", { name: "Artifact Trace" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Registered artifacts" })).toHaveTextContent("runtime-building-ir");
    expect(screen.getByRole("table", { name: "Run event artifact trace" })).toHaveTextContent("packed-atlas:");
    expect(await screen.findByRole("heading", { name: "Prompt Trace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt trace summary")).toHaveTextContent("local-rule");
    expect(screen.getByLabelText("Prompt trace summary")).toHaveTextContent("late19cCommercialDemo");
    expect(screen.getByRole("table", { name: "Evaluated PSG variables" })).toHaveTextContent("building.stylePack");
    expect(screen.getByRole("table", { name: "Evaluated PSG variables" })).toHaveTextContent("tall-arched");
    expect(screen.getByRole("table", { name: "PSG evaluation trace" })).toHaveTextContent("windowFamily");
    expect(screen.getByRole("table", { name: "Requested controls" })).toHaveTextContent("trimDensity");

    selectRoom("Atlas Lab");
    expect(screen.getByRole("tab", { name: "Atlas Lab" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Prompt Lab" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Provider Diagnostics" })).toHaveTextContent("procedural");
    expect(screen.getByRole("table", { name: "Provider Diagnostics" })).toHaveTextContent("cache hit");
    expect(within(screen.getByRole("table", { name: "Semantic Slots" })).getByText("wall.primary")).toBeInTheDocument();
    expect(screen.getByLabelText("Atlas fixture provenance")).toHaveTextContent("30 entries");

    selectRoom("Component Forge");
    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });
    expect(screen.getByLabelText("Selected component recipe")).toHaveTextContent("Window frame");
    expect(within(screen.getByRole("table", { name: "Selected atlas slots" })).getByText("glass.primary")).toBeInTheDocument();

    selectRoom("Art Kit Lab");
    expect(await screen.findByRole("heading", { name: "Late 19th Century Apartment Kit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Art kit module catalog")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Art kit material roles" })).toHaveTextContent("brick");

    selectRoom("Assembly Hall");
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("View controls", { selector: "summary" }));
    expect(screen.getByRole("combobox", { name: "Reveal through stage" })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: "Interactive generated building viewer" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent("Draw calls");
  });

  it("deep-links room selection through the URL hash and browser history", async () => {
    window.history.replaceState(null, "", "/#room=assemblyHall");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true")
    );
    await waitForInitialRun();
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();

    selectRoom("Atlas Lab");
    expect(window.location.hash).toBe("#room=atlasLab");
    expect(screen.getByRole("tab", { name: "Atlas Lab" })).toHaveAttribute("aria-selected", "true");

    selectRoom("Component Forge");
    expect(window.location.hash).toBe("#room=componentForge");
    expect(screen.getByRole("tab", { name: "Component Forge" })).toHaveAttribute("aria-selected", "true");

    act(() => {
      window.history.back();
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Atlas Lab" })).toHaveAttribute("aria-selected", "true")
    );
    expect(window.location.hash).toBe("#room=atlasLab");
  });

  it("preserves a route-level document id while navigating rooms", async () => {
    window.history.replaceState(null, "", "/#document=family-doc-alpha&room=assemblyHall");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true")
    );
    expect(screen.getByLabelText("Route document identity")).toHaveTextContent("family-doc-alpha");

    selectRoom("Atlas Lab");

    expect(window.location.hash).toBe("#document=family-doc-alpha&room=atlasLab");
    expect(screen.getByLabelText("Route document identity")).toHaveTextContent("family-doc-alpha");
  });

  it("routes to a generated sample building gallery", async () => {
    window.history.replaceState(null, "", "/#room=sampleGallery");
    const entered = appIntentDeferred<void>(), original = BuildingRunController.prototype.startDemoRun;
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun").mockImplementation(function (this: BuildingRunController, input) {
      entered.resolve(); return original.call(this, input);
    });
    const view = render(<App />);
    try {
      await waitFor(() =>
        expect(screen.getByRole("tab", { name: "Sample Gallery" })).toHaveAttribute("aria-selected", "true")
      );
      await act(async () => { await entered.promise; expect((await start.mock.results[0].value).fixture).toBeDefined(); });
      expect(await screen.findByRole("heading", { name: "Sample Buildings" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByLabelText(/^Generated building sample /)).toHaveLength(8));
    } finally { view.unmount(); await Promise.all(start.mock.contexts.map(owner => (owner as BuildingRunController).drainSourceCheckpoints())); start.mockRestore(); }
  });

  it("persists the completed family to IndexedDB using the route document id", async () => {
    const fakeIndexedDb = new FakeIndexedDbFactory();
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb as unknown as IDBFactory
    });
    window.history.replaceState(null, "", "/#document=family-doc-alpha&room=promptLab");

    try {
      render(<App />);
      await waitForInitialRun();

      const records = Array.from(fakeIndexedDb.database.records.values()) as Array<{
        key: string;
        entry: {
          artifactType: string;
          artifact: {
            documentId: string;
            runId: string;
            requestHash: string;
          };
        };
      }>;
      const completedFamilyRecord = records.find((record) => record.entry.artifactType === "completed-family");

      expect(completedFamilyRecord).toBeDefined();
      const completedFamilyEntry = completedFamilyRecord!;
      expect(completedFamilyEntry.key).toMatch(/^0\.1\.0:completed-family:[a-f0-9]{64}$/);
      expect(completedFamilyEntry.entry.artifact).toMatchObject({
        documentId: "family-doc-alpha",
        requestHash: completedFamilyEntry.entry.artifact.requestHash
      });
      expect(completedFamilyEntry.entry.artifact.runId).toMatch(/^building-run-/);
    } finally {
      if (previousIndexedDb) {
        Object.defineProperty(globalThis, "indexedDB", previousIndexedDb);
      } else {
        Reflect.deleteProperty(globalThis, "indexedDB");
      }
    }
  });

  it("restores a cached completed family from IndexedDB before starting fresh generation", async () => {
    const fakeIndexedDb = new FakeIndexedDbFactory();
    const seedFixture = await createAssemblyHallFixture();
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-doc-alpha",
      runId: "run-restored",
      requestHash: "request-restored",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture: seedFixture
    });
    const entry = completedFamilyPersistenceCacheEntry(packet);
    fakeIndexedDb.database.records.set(indexedDbArtifactCacheKey(entry), {
      key: indexedDbArtifactCacheKey(entry),
      entry: structuredClone(entry)
    });
    seedFixture.familyRuntime.dispose();
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb as unknown as IDBFactory
    });
    window.history.replaceState(null, "", "/#document=family-doc-alpha&room=promptLab");

    try {
      render(<App />);
      await waitForInitialRun();

      expect(screen.getByLabelText("Generation run state")).toHaveTextContent("run-restored");
      expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent(packet.buildingId);
      expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("complete");
      expect(screen.getByLabelText("Prompt trace summary")).toHaveTextContent(packet.provenance.promptTrace.traceId);
    } finally {
      if (previousIndexedDb) {
        Object.defineProperty(globalThis, "indexedDB", previousIndexedDb);
      } else {
        Reflect.deleteProperty(globalThis, "indexedDB");
      }
    }
  });

  it("downloads the active completed family export bundle", async () => {
    window.history.replaceState(null, "", "/#document=family-doc-export&room=promptLab");
    const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      void blob;
      return "blob:completed-family-export";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    try {
      render(<App />);
      await waitForInitialRun();

      fireEvent.click(screen.getByRole("button", { name: "Download Export" }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!(blob instanceof Blob)) {
        throw new Error("Expected completed-family export to create a Blob");
      }
      const payload = JSON.parse(await blob.text());

      expect(blob.type).toBe("application/json");
      expect(payload).toMatchObject({
        schemaVersion: "0.1.0",
        bundleType: "completed-family-export",
        documentId: "family-doc-export"
      });
      expect(payload.atlas.channels[0].pngDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:completed-family-export");
    } finally {
      click.mockRestore();
      if (previousCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (previousRevokeObjectUrl) {
        Object.defineProperty(URL, "revokeObjectURL", previousRevokeObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });

  it("disables completed family export while a rerun is active", async () => {
    render(<App />);
    await waitForInitialRun();

    fireEvent.click(screen.getByRole("button", { name: "Run Current" }));

    expect(screen.getByLabelText("Generation run state")).toHaveTextContent("running");
    expect(screen.getByRole("button", { name: "Download Export" })).toBeDisabled();
  });

  it("imports a completed family export bundle into the app runtime", async () => {
    const importedFixture = await createAssemblyHallFixture({
      promptControls: {
        ...defaultBuildingPromptControls,
        prompt: "six floors, 5 bays, brick, gable roof, moderate trim",
        floorCount: 6,
        bayCount: 5,
        roofType: "gable",
        trimDensity: "moderate",
        seeds: {
          family: "import-family-seed",
          building: "import-building-seed",
          material: "import-material-seed",
          trim: "import-trim-seed"
        }
      }
    });
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-doc-imported",
      runId: "run-imported",
      requestHash: "request-imported",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture: importedFixture
    });
    const bundle = createCompletedFamilyExportBundle(packet);

    try {
      render(<App />);
      await waitForInitialRun();
      const initialArtifactId = screen.getByLabelText("Generation run artifact").textContent ?? "";

      fireEvent.change(screen.getByLabelText("Import Export File"), {
        target: {
          files: [
            new File([JSON.stringify(bundle)], "family-doc-imported-completed-family-export.json", {
              type: "application/json"
            })
          ]
        }
      });

      await waitFor(() => expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent(packet.buildingId));
      expect(screen.getByLabelText("Generation run artifact")).not.toHaveTextContent(initialArtifactId);
      expect(screen.getByLabelText("Route document identity")).toHaveTextContent("family-doc-imported");
      expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete");
      expect(screen.getByLabelText("Generation run state")).toHaveTextContent("run-imported");
      expect(screen.getByLabelText("Prompt trace summary")).toHaveTextContent(packet.provenance.promptTrace.traceId);
      expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
      expect(screen.getByText("This saved result has no editable source.", { exact: true })).toBeInTheDocument();
      const preview = within(screen.getByLabelText("Invalidation preview"));
      expect(preview.getByText("Saved inputs could not be verified. The current scene and materials are preserved; regeneration stays gated until material reuse is verified.")).toBeInTheDocument();
      expect(preview.queryByRole("list")).not.toBeInTheDocument();
      expect(preview.queryByText(/Material sources reusable|Material sources regenerate|atlas reusable|atlas refresh|catalog reusable|catalog refresh/)).not.toBeInTheDocument();

      selectRoom("Assembly Hall");
      expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent(
          importedFixture.metrics.triangleCount.toLocaleString("en-US")
        )
      );
    } finally {
      importedFixture.familyRuntime.dispose();
    }
  });

  it("exposes committed roof, trim, and seed controls with invalidation feedback", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitForInitialRun();

    expect(screen.getByLabelText("Family Seed")).toHaveValue("family-seed");
    expect(screen.getByLabelText("Material Seed")).toHaveValue("material-seed");
    expect(screen.getByLabelText("Trim Seed")).toHaveValue("trim-seed");
    expect(screen.getByLabelText("Roof Type")).toHaveValue("flat");
    expect(screen.getByLabelText("Trim Density")).toHaveValue("ornate");

    fireEvent.change(screen.getByLabelText("Roof Type"), { target: { value: "gable" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("roofType");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");

    fireEvent.change(screen.getByLabelText("Trim Density"), { target: { value: "moderate" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("trimDensity");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("atlas reusable");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("catalog refresh");

    fireEvent.change(screen.getByLabelText("Material Seed"), { target: { value: "material-seed-2" } });
    fireEvent.change(screen.getByLabelText("Trim Seed"), { target: { value: "trim-seed-2" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("materialSeed");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("trimSeed");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources regenerate");

    fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
    await waitForInitialRun();
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache miss");
  });

  it("runs low-detail building geometry from the Prompt Lab detail selector", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitForInitialRun();

    selectRoom("Assembly Hall");
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    const highDetailMetrics = screen.getByLabelText("Assembly Hall renderer metrics").textContent ?? "";

    selectRoom("Prompt Lab");
    expect(screen.getByLabelText("Detail Level")).toHaveValue("high");
    fireEvent.change(screen.getByLabelText("Detail Level"), { target: { value: "low" } });

    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("detailLevel");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");

    fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
    await waitForInitialRun();

    selectRoom("Assembly Hall");
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics").textContent ?? "").not.toBe(highDetailMetrics);
    const trimVisibility = within(screen.getByLabelText("Assembly stage visibility")).getByText("trim").closest("li");
    expect(trimVisibility).not.toBeNull();
    expect(trimVisibility).toHaveTextContent("0 objects / 0 paths");
  });

  it("keeps the remote material provider behind an explicit Prompt Lab toggle", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitForInitialRun();

    const remoteToggle = screen.getByRole("checkbox", { name: "Remote Detail Provider" });
    expect(remoteToggle).not.toBeChecked();

    fireEvent.click(remoteToggle);

    expect(remoteToggle).toBeChecked();
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("remoteMaterial");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources regenerate");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("packedAtlas");
  });

  it("surfaces remote material provider progress in the generation timeline", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitForInitialRun();

    fireEvent.click(screen.getByRole("checkbox", { name: "Remote Detail Provider" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Current" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("remote-material-route")
    );
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("procedural");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent(
      "remoteMaterialRouteClient.requestFailed"
    );
  });

  it("keeps the latest concrete material-source cache result after remote provider progress events", () => {
    expect(
      latestMaterialSourceCacheHit([
        {
          stage: "generatingMaterialSources",
          startedAtMs: 1,
          provider: "remote-material-route"
        },
        {
          stage: "generatingMaterialSources",
          startedAtMs: 2,
          endedAtMs: 3,
          provider: "procedural",
          cacheHit: false
        }
      ])
    ).toBe(false);
  });

  it("locks a Component Forge recipe and keeps the lock through a new-building rerun", async () => {
    render(<App />);

    await waitForInitialRun();
    selectRoom("Component Forge");
    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock selected component" }));

    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    selectRoom("Prompt Lab");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("localComponentLock");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("componentCatalog");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("partial");

    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitForInitialRun();
    selectRoom("Component Forge");
    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    selectRoom("Prompt Lab");
    expect(screen.getByLabelText("Invalidation preview")).not.toHaveTextContent("localComponentLock");
  });
});

describe("App fixture ownership integration", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/#room=promptLab"); });
  it("does not duplicate the restore fallback after StrictMode effect replay", async () => {
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily")
      .mockResolvedValue(undefined);
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const view = render(<StrictMode><App /></StrictMode>);
    try {
      await waitForInitialRun();
      expect(restore).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount(); restore.mockRestore(); start.mockRestore();
    }
  });

  it("renders and exports the replacement fixture when regeneration retains the legacy ID", async () => {
    const acquired: AssemblyHallFixture[] = [];
    const submitted: Scene[] = [];
    const acquireOriginal = BuildingRunController.prototype.acquireFixtureViewerLease;
    const acquire = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease")
      .mockImplementation(function (this: BuildingRunController, fixture: AssemblyHallFixture) {
        acquired.push(fixture);
        return acquireOriginal.call(this, fixture);
      });
    const renderer = vi.spyOn(rendererFactoryModule, "createAssemblyRenderer").mockImplementation(async () => ({
      activeBackend: "webgl",
      renderer: {
        domElement: document.createElement("canvas"),
        dispose: vi.fn(),
        render: vi.fn((scene: Scene) => { submitted.push(scene); }),
        setPixelRatio: vi.fn(),
        setSize: vi.fn()
      }
    }));
    const packetOriginal = completedFamilyPersistenceModule.createCompletedFamilyPersistencePacket;
    const packet = vi.spyOn(completedFamilyPersistenceModule, "createCompletedFamilyPersistencePacket")
      .mockImplementation((input) => packetOriginal(input));
    const downloads: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((blob: Blob) => { downloads.push(blob); return "blob:r2-p1-family"; }) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const view = render(<App />);
    try {
      await waitForInitialRun();
      selectRoom("Assembly Hall");
      await waitFor(() => expect(acquired.length).toBeGreaterThan(0));
      const first = acquired[0];
      await waitFor(() => expect(submitted.some((scene) => scene.getObjectById(first.familyRuntime.root.id) === first.familyRuntime.root)).toBe(true));
      selectRoom("Prompt Lab");
      fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
      selectRoom("Assembly Hall");
      await waitFor(() => expect(acquired.some((fixture) => fixture !== first)).toBe(true), { timeout: 10000 });
      const second = acquired.find((fixture) => fixture !== first)!;
      expect(second.ir.buildingId).toBe(first.ir.buildingId);
      expect(second.ir).not.toBe(first.ir);
      expect(second.ir.meshBatches[0].positions).not.toBe(first.ir.meshBatches[0].positions);
      await waitFor(() => expect(submitted.some((scene) => scene.getObjectById(second.familyRuntime.root.id) === second.familyRuntime.root)).toBe(true));
      const currentScene = [...submitted].reverse().find((scene) => scene.getObjectById(second.familyRuntime.root.id) === second.familyRuntime.root)!;
      expect(currentScene.getObjectById(first.familyRuntime.root.id)).toBeUndefined();
      expect(first.familyRuntime.root.parent).toBeNull();
      selectRoom("Prompt Lab");
      packet.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Download Export" }));
      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(packet).toHaveBeenCalledTimes(1);
      expect(packet.mock.calls[0][0].fixture).toBe(second);
      const payload = JSON.parse(await downloads[0].text());
      expect(payload).toMatchObject({ schemaVersion: "0.1.0", bundleType: "completed-family-export", buildingId: second.ir.buildingId });
    } finally {
      view.unmount(); acquire.mockRestore(); renderer.mockRestore(); packet.mockRestore(); click.mockRestore();
      if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate); else Reflect.deleteProperty(URL, "createObjectURL");
      if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke); else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });
});

function appIntentDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}
function appIntentFile(text: () => Promise<string>): File {
  const file = new File(["{}"], "family.json", { type: "application/json" });
  Object.defineProperty(file, "text", { configurable: true, value: text });
  return file;
}
async function appIntentPacket(documentId: string) {
  const fixture = await createAssemblyHallFixture();
  try {
    return await createCompletedFamilyPersistencePacket({ documentId, runId: "run-" + documentId, requestHash: "request-" + documentId, fixture });
  } finally { fixture.familyRuntime.dispose(); }
}
describe("App import request ownership", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/#room=promptLab"); });
  it("keeps the newest import and its current room when an older file read finishes late", async () => {
    const packet = await appIntentPacket("newer-import");
    const oldText = appIntentDeferred<string>();
    const startup = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily").mockResolvedValue({ runId: "startup", stale: false });
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreCompletedFamilyPacket");
    const convert = vi.spyOn(completedFamilyExportImportModule, "importCompletedFamilyExportBundleToPacket").mockResolvedValue(packet);
    const view = render(<App />);
    try {
      await waitFor(() => expect(startup).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Import Export File"), { target: { files: [appIntentFile(() => oldText.promise)] } });
      fireEvent.change(screen.getByLabelText("Import Export File"), { target: { files: [appIntentFile(async () => "{}")] } });
      selectRoom("Atlas Lab");
      await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
      expect(restore).toHaveBeenCalledWith(packet);
      await act(async () => { expect((await restore.mock.results[0].value).stale).toBe(false); });
      await waitFor(() => expect(window.location.hash).toBe("#document=newer-import&room=atlasLab"));
      expect(window.location.hash).toBe("#document=newer-import&room=atlasLab");
      await act(async () => { oldText.resolve("{}"); await oldText.promise; });
      expect(convert).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledWith(packet);
      expect(window.location.hash).toBe("#document=newer-import&room=atlasLab");
    } finally { view.unmount(); startup.mockRestore(); restore.mockRestore(); convert.mockRestore(); }
  });
  it("does not commit an older conversion after a new run starts", async () => {
    const packet = await appIntentPacket("stale-import");
    const converted = appIntentDeferred<typeof packet>();
    const startup = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily").mockResolvedValue({ runId: "startup", stale: false });
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreCompletedFamilyPacket").mockResolvedValue({ runId: packet.runId, stale: false });
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun").mockResolvedValue({ runId: "manual-run", stale: false });
    const convert = vi.spyOn(completedFamilyExportImportModule, "importCompletedFamilyExportBundleToPacket").mockReturnValue(converted.promise);
    const view = render(<App />);
    try {
      await waitFor(() => expect(startup).toHaveBeenCalledTimes(1));
      const hash = window.location.hash;
      fireEvent.change(screen.getByLabelText("Import Export File"), { target: { files: [appIntentFile(async () => "{}")] } });
      await waitFor(() => expect(convert).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
      expect(start).toHaveBeenCalledTimes(1);
      await act(async () => { converted.resolve(packet); await converted.promise; });
      expect(restore).not.toHaveBeenCalled();
      expect(window.location.hash).toBe(hash);
    } finally { view.unmount(); startup.mockRestore(); restore.mockRestore(); start.mockRestore(); convert.mockRestore(); }
  });
  it.each(["cancel", "document-route", "unmount"] as const)("discards a pending file read after %s", async (action) => {
    const text = appIntentDeferred<string>();
    const startup = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily").mockResolvedValue({ runId: "startup", stale: false });
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreCompletedFamilyPacket");
    const convert = vi.spyOn(completedFamilyExportImportModule, "importCompletedFamilyExportBundleToPacket");
    const view = render(<App />);
    try {
      await waitFor(() => expect(startup).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Import Export File"), { target: { files: [appIntentFile(() => text.promise)] } });
      expect(screen.getByRole("button", { name: "Cancel Run" })).toBeEnabled();
      if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
      else if (action === "document-route") act(() => {
        window.history.replaceState(null, "", "/#document=changed-document&room=promptLab");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      else view.unmount();
      const hash = window.location.hash;
      await act(async () => { text.resolve("{}"); await text.promise; });
      expect(convert).not.toHaveBeenCalled();
      expect(restore).not.toHaveBeenCalled();
      expect(window.location.hash).toBe(hash);
      if (action === "document-route") expect(screen.getByLabelText("Route document identity")).toHaveTextContent("changed-document");
    } finally { view.unmount(); startup.mockRestore(); restore.mockRestore(); convert.mockRestore(); }
  });
  it("does not start an old startup fallback while a newer import is waiting for its file", async () => {
    const startupResult = appIntentDeferred<undefined>();
    const text = appIntentDeferred<string>();
    const startup = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily").mockReturnValue(startupResult.promise);
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun").mockResolvedValue({ runId: "fallback", stale: false });
    const convert = vi.spyOn(completedFamilyExportImportModule, "importCompletedFamilyExportBundleToPacket");
    const view = render(<App />);
    try {
      await waitFor(() => expect(startup).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Import Export File"), { target: { files: [appIntentFile(() => text.promise)] } });
      await act(async () => { startupResult.resolve(undefined); await startupResult.promise; });
      expect(start).not.toHaveBeenCalled();
      view.unmount();
      await act(async () => { text.resolve("{}"); await text.promise; });
      expect(convert).not.toHaveBeenCalled();
    } finally { view.unmount(); startup.mockRestore(); start.mockRestore(); convert.mockRestore(); }
  });
});

it("keeps the actual active viewer and owner when a replacement renderer rejects", async () => {
  window.history.replaceState(null, "", "/#room=promptLab");
  type Activation = Awaited<ReturnType<typeof rendererFactoryModule.createAssemblyRenderer>>;
  const initial: Activation = { activeBackend: "webgl", renderer: { domElement: document.createElement("canvas"), dispose: vi.fn(), render: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn() } };
  let rejectNext!: (error: Error) => void;
  const next = new Promise<Activation>((resolve, reject) => { void resolve; rejectNext = reject; });
  const renderer = vi.spyOn(rendererFactoryModule, "createAssemblyRenderer")
    .mockImplementationOnce(async () => initial)
    .mockImplementationOnce(() => next);
  const controllers: BuildingRunController[] = [];
  const registerOriginal = BuildingRunController.prototype.registerFixtureViewer;
  const register = vi.spyOn(BuildingRunController.prototype, "registerFixtureViewer")
    .mockImplementation(function (this: BuildingRunController, preparer) { controllers.push(this); return registerOriginal.call(this, preparer); });
  const fixtures: AssemblyHallFixture[] = [];
  const acquireOriginal = BuildingRunController.prototype.acquireFixtureViewerLease;
  const acquire = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease")
    .mockImplementation(function (this: BuildingRunController, fixture: AssemblyHallFixture) { fixtures.push(fixture); return acquireOriginal.call(this, fixture); });
  const view = render(<App />);
  try {
    await waitForInitialRun();
    selectRoom("Assembly Hall");
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const controller = controllers[0];
    const first = fixtures[0];
    const oldScene = first.familyRuntime.root.parent;
    expect(oldScene).not.toBeNull();
    expect(initial.renderer.domElement.isConnected).toBe(true);
    let run!: Promise<unknown>;
    act(() => { run = controller.startDemoRun().catch((error: unknown) => error); });
    await waitFor(() => expect(renderer).toHaveBeenCalledTimes(2), { timeout: 10000 });
    const candidate = fixtures.find((fixture) => fixture !== first)!;
    expect(candidate).toBeDefined();
    expect(candidate.ir.buildingId).toBe(first.ir.buildingId);
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(first.familyRuntime.root.parent).toBe(oldScene);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    const error = new Error("replacement renderer rejected");
    await act(async () => { rejectNext(error); expect(await run).toBe(error); });
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(first.familyRuntime.root.parent).toBe(oldScene);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(candidate.familyRuntime.root.parent).toBeNull();
    const release = controller.acquireFixtureViewerLease(first);
    release(); release();
    expect(() => controller.acquireFixtureViewerLease(candidate)).toThrow();
    expect(register).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount(); renderer.mockRestore(); register.mockRestore(); acquire.mockRestore();
  }
});

async function appP3PortableSource(documentId: string, windowFamily: typeof defaultBuildingPromptControls.windowFamily) {
  const { createBuildingStore } = await import("../features/building-family/state/buildingStore");
  const { BuildingArtifactRegistry } = await import("../features/building-family/state/artifactRegistry");
  const store = createBuildingStore();
  store.getState().selectDocument(documentId);
  const controller = new BuildingRunController({ store, registry: new BuildingArtifactRegistry(), createFixture: createAssemblyHallFixture });
  try {
    await controller.startDemoRun({ ...defaultBuildingPromptControls, windowFamily, seeds: { ...defaultBuildingPromptControls.seeds, family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" }, lockedComponentKeys: [...defaultBuildingPromptControls.lockedComponentKeys] });
    const saved = await controller.exportSourceFile();
    return { saved, file: p3AppSourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents)) };
  } finally { controller.dispose(); }
}
async function appP3SourceDownload() {
  const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const createObjectURL = vi.fn((blob: Blob | MediaSource) => { void blob; return "blob:building-source-regression"; });
  const revokeObjectURL = vi.fn();
  const fileNames: string[] = [];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { fileNames.push(this.download); });
  try {
    fireEvent.click(screen.getByRole("button", { name: "Save source" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1), { timeout: 10000 });
    const blob = createObjectURL.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error("Source Save did not create a Blob");
    expect(blob.type).toBe("application/json");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:building-source-regression");
    return { file: p3AppSourceCodec.BuildingSourceFileSchema.parse(JSON.parse(await blob.text())), fileName: fileNames[0] };
  } finally {
    click.mockRestore();
    if (previousCreate) Object.defineProperty(URL, "createObjectURL", previousCreate); else Reflect.deleteProperty(URL, "createObjectURL");
    if (previousRevoke) Object.defineProperty(URL, "revokeObjectURL", previousRevoke); else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
}

describe("App editable source ownership", () => {
  let incoming: Awaited<ReturnType<typeof appP3PortableSource>>;
  let newer: Awaited<ReturnType<typeof appP3PortableSource>>;
  let caseIndex = 0;
  beforeAll(async () => {
    incoming = await appP3PortableSource("app-source-open-target", "tall-arched");
    newer = await appP3PortableSource("app-source-newer-target", "tall-rectangular");
  }, 20000);
  beforeEach(() => {
    caseIndex += 1;
    window.history.replaceState(null, "", `/#document=app-source-current-${caseIndex}&room=promptLab`);
  });

  it("opens a different authored document and immediately saves its exact source without a legacy restore", async () => {
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily");
    const save = vi.spyOn(BuildingRunController.prototype, "exportSourceFile");
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const startupRestores = restore.mock.calls.length;
      expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => incoming.saved.contents)] } });
      selectRoom("Atlas Lab");
      await waitFor(() => expect(window.location.hash).toBe(`#document=${incoming.saved.documentId}&room=atlasLab`), { timeout: 10000 });
      selectRoom("Prompt Lab");
      await waitForInitialRun();
      expect(screen.getByLabelText("Route document identity")).toHaveTextContent(incoming.saved.documentId);
      const downloaded = await appP3SourceDownload();
      expect(downloaded.file).toEqual(incoming.file);
      expect(downloaded.file.source.document.documentId).toBe(incoming.saved.documentId);
      expect(save).toHaveBeenCalledTimes(1);
      const saved = await save.mock.results[0].value;
      expect(downloaded.fileName).toBe(saved.fileName);
      expect(saved.documentId).toBe(incoming.saved.documentId);
      expect(saved.revision).toBe(incoming.saved.revision);
      expect(restore.mock.calls.length).toBe(startupRestores);
    } finally {
      view.unmount();
      await act(async () => { await Promise.all(save.mock.contexts.map(owner => (owner as BuildingRunController).drainSourceCheckpoints())); });
      restore.mockRestore(); save.mockRestore();
    }
  }, 20000);

  it.each(["cancel", "cancel-then-run", "document-route", "unmount"] as const)("does not revive an unread source after %s", async (action) => {
    const held = appIntentDeferred<string>();
    const readText = vi.fn(() => held.promise);
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    const parse = vi.spyOn(p3AppSourceCodec, "parseBuildingSourceFile");
    const incomingParses = () => parse.mock.calls.filter(([value]) => (value as typeof incoming.file | undefined)?.source?.document?.documentId === incoming.saved.documentId).length;
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const initialHash = window.location.hash;
      const initialDocumentId = new URLSearchParams(window.location.hash.slice(1)).get("document");
      expect(initialDocumentId).not.toBeNull();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(readText)] } });
      await waitFor(() => expect(readText).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(open).not.toHaveBeenCalled();
      expect(incomingParses()).toBe(0);
      expect(screen.getByRole("button", { name: "Run Current" })).toBeDisabled();
      expect(screen.getByLabelText("Open Source File")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();
      if (action === "cancel" || action === "cancel-then-run") {
        if (action === "cancel") {
          const clicked = await appP3SourceDownload();
          expect(clicked.file.source.document.documentId).toBe(initialDocumentId);
        }
        fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
        if (action === "cancel-then-run") {
          const previousRun = screen.getByLabelText("Generation run state").textContent;
          await waitFor(() => expect(screen.getByRole("button", { name: "Run Current" })).toBeEnabled());
          fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
          await waitFor(() => expect(screen.getByLabelText("Generation run state").textContent).not.toBe(previousRun), { timeout: 10000 });
          await waitForInitialRun();
        }
      } else if (action === "document-route") {
        act(() => {
          window.history.replaceState(null, "", "/#document=source-user-navigation&room=promptLab");
          window.dispatchEvent(new PopStateEvent("popstate"));
        });
      } else view.unmount();
      const retainedHash = window.location.hash;
      if (action === "document-route") await waitForInitialRun();
      const retainedSource = action === "unmount" ? undefined : (await appP3SourceDownload()).file;
      await act(async () => { held.resolve(incoming.saved.contents); await held.promise; });
      expect(open).not.toHaveBeenCalled();
      expect(incomingParses()).toBe(0);
      expect(window.location.hash).toBe(retainedHash);
      if (action !== "document-route" && action !== "unmount") expect(window.location.hash).toBe(initialHash);
      if (action === "document-route") expect(screen.getByLabelText("Route document identity")).toHaveTextContent("source-user-navigation");
      if (retainedSource) expect((await appP3SourceDownload()).file).toEqual(retainedSource);
    } finally { held.resolve(incoming.saved.contents); view.unmount(); open.mockRestore(); parse.mockRestore(); }
  }, 20000);

  it("keeps the newer chosen source when a canceled older file finishes late", async () => {
    const held = appIntentDeferred<string>();
    const readText = vi.fn(() => held.promise);
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    const parse = vi.spyOn(p3AppSourceCodec, "parseBuildingSourceFile");
    const incomingParses = () => parse.mock.calls.filter(([value]) => (value as typeof incoming.file | undefined)?.source?.document?.documentId === incoming.saved.documentId).length;
    const view = render(<App />);
    try {
      await waitForInitialRun();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(readText)] } });
      await waitFor(() => expect(readText).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(open).not.toHaveBeenCalled();
      expect(incomingParses()).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
      await waitFor(() => expect(screen.getByLabelText("Open Source File")).toBeEnabled());
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => newer.saved.contents)] } });
      await waitFor(() => expect(window.location.hash).toBe(`#document=${newer.saved.documentId}&room=promptLab`), { timeout: 10000 });
      await waitForInitialRun();
      await act(async () => { held.resolve(incoming.saved.contents); await held.promise; });
      expect(incomingParses()).toBe(0);
      expect(window.location.hash).toBe(`#document=${newer.saved.documentId}&room=promptLab`);
      expect((await appP3SourceDownload()).file).toEqual(newer.file);
      expect(open).toHaveBeenCalledTimes(1);
      await act(async () => { expect((await open.mock.results[0].value).stale).toBe(false); });
    } finally { held.resolve(incoming.saved.contents); view.unmount(); open.mockRestore(); parse.mockRestore(); }
  }, 20000);

  it("reports a current file read failure and still saves the last accepted source", async () => {
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const expected = await appP3SourceDownload();
      const initialHash = window.location.hash;
      const failure = new Error("source read failed");
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => { throw failure; })] } });
      await waitFor(() => expect(screen.getByLabelText("Source file error")).toHaveTextContent(failure.message));
      expect(open).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete");
      expect(screen.getAllByText("source read failed", { exact: false }).length).toBeGreaterThan(0);
      expect(window.location.hash).toBe(initialHash);
      expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();
      expect((await appP3SourceDownload()).file).toEqual(expected.file);
    } finally { view.unmount(); open.mockRestore(); }
  }, 20000);
});

describe("R2.P11 completed replay startup", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/#document=p11-app-replay&room=promptLab"); });

  it("diagnoses an unresolved cached profile without generating over its retained saved copy", async () => {
    const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const seed = await createAssemblyHallFixture({
      promptControls: { ...structuredClone(defaultBuildingPromptControls), fidelityMode: "kit", detailLevel: "high" }
    });
    let packet: Awaited<ReturnType<typeof createCompletedFamilyPersistencePacket>>;
    try {
      packet = structuredClone(await createCompletedFamilyPersistencePacket({
        documentId: "p11-app-replay", runId: "p11-app-saved", requestHash: "p11-app-saved-request",
        createdAt: "2026-10-15T00:00:00.000Z", fixture: seed
      }));
    } finally { seed.familyRuntime.dispose(); }
    packet.artifacts.runtimeIr.sourceGraphHash = "0".repeat(64);
    const entry = completedFamilyPersistenceCacheEntry(packet);
    const fakeIndexedDb = new FakeIndexedDbFactory(), key = indexedDbArtifactCacheKey(entry);
    fakeIndexedDb.database.records.set(key, { key, entry: structuredClone(entry) });
    const cacheBefore = structuredClone(Array.from(fakeIndexedDb.database.records.entries()));
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb as unknown as IDBFactory });
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily");
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const view = render(<App />);
    try {
      await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("failed"), { timeout: 10000 });
      expect(restore).toHaveBeenCalledTimes(1);
      await expect(restore.mock.results[0].value).rejects.toBeInstanceOf(fixtureModule.CompletedFamilyReplayProfileError);
      expect(start).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Generation run state")).toHaveTextContent(packet.runId);
      expect(screen.getAllByText("This saved building's detail settings could not be verified. The saved copy has been retained.", { exact: false }).length).toBeGreaterThan(0);
      expect(Array.from(fakeIndexedDb.database.records.entries())).toEqual(cacheBefore);
    } finally {
      view.unmount(); restore.mockRestore(); start.mockRestore(); generate.mockRestore(); interpret.mockRestore();
      if (previousIndexedDb) Object.defineProperty(globalThis, "indexedDB", previousIndexedDb);
      else Reflect.deleteProperty(globalThis, "indexedDB");
    }
  }, 20000);

  it("keeps the ordinary procedural fallback for an unrelated restore failure", async () => {
    const failure = new Error("p11 unrelated cache read failure");
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily").mockRejectedValue(failure);
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun").mockResolvedValue({ runId: "p11-fallback", stale: false });
    const view = render(<App />);
    try {
      await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      expect(restore).toHaveBeenCalledTimes(1);
      await expect(restore.mock.results[0].value).rejects.toBe(failure);
      expect(start).toHaveBeenCalledWith();
    } finally { view.unmount(); restore.mockRestore(); start.mockRestore(); }
  });
});

function appR3WorkspaceRenderer() {
  return vi.spyOn(rendererFactoryModule, "createAssemblyRenderer").mockImplementation(async () => ({
    activeBackend: "webgl" as const,
    renderer: {
      domElement: document.createElement("canvas"),
      dispose: vi.fn(),
      render: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn()
    }
  }));
}

describe("R3.P0 continuous building workspace", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#document=r3-workspace&room=assemblyHall");
  });

  it("edits the visible building through one colocated control surface", async () => {
    const renderer = appR3WorkspaceRenderer();
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const fixtures: AssemblyHallFixture[] = [];
    const acquireOriginal = BuildingRunController.prototype.acquireFixtureViewerLease;
    const acquire = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease")
      .mockImplementation(function (this: BuildingRunController, fixture) {
        fixtures.push(fixture);
        return acquireOriginal.call(this, fixture);
      });
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const workspace = screen.getByLabelText("Building workspace");
      const inspector = within(screen.getByLabelText("Building inspector"));
      expect(within(workspace).getByRole("application", { name: "Interactive generated building viewer" })).toBeInTheDocument();
      expect(screen.getAllByRole("application", { name: "Interactive generated building viewer" })).toHaveLength(1);
      expect(screen.getAllByLabelText("Floors")).toHaveLength(1);
      expect(screen.getAllByLabelText("Bays")).toHaveLength(1);
      expect(inspector.getByRole("button", { name: "Run Current" })).toBeEnabled();
      expect(inspector.getByRole("button", { name: "Save source" })).toBeEnabled();
      expect(inspector.getByLabelText("Open Source File")).toBeEnabled();
      await waitFor(() => expect(fixtures.length).toBeGreaterThan(0));
      const original = fixtures[0];
      const floorCount = Number((inspector.getByLabelText("Floors") as HTMLInputElement).value) + 1;
      fireEvent.change(inspector.getByLabelText("Floors"), { target: { value: String(floorCount) } });
      fireEvent.click(inspector.getByRole("button", { name: "Run Current" }));
      await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
      await act(async () => { await start.mock.results[1].value; });
      await waitFor(() => expect(screen.getByLabelText("Workspace run status")).toHaveTextContent("Building ready"));
      const replacement = fixtures.find((fixture) => fixture !== original && fixture.spec.massing.floorCount === floorCount);
      expect(replacement).toBeDefined();
      expect(replacement?.ir).not.toBe(original.ir);
      expect(replacement?.packedAtlas).toBe(original.packedAtlas);
      expect(replacement?.debugExport).toBe(original.debugExport);
      expect(replacement?.sourceSnapshot?.controlsView.floorCount).toBe(floorCount);
      expect(start.mock.calls[1][0]?.floorCount).toBe(floorCount);
      expect(screen.getAllByLabelText("Assembly Hall Three.js canvas")).toHaveLength(1);
      expect(screen.getByLabelText("Assembly Hall Three.js canvas").isConnected).toBe(true);
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true");
      expect(window.location.hash).toBe("#document=r3-workspace&room=assemblyHall");
    } finally {
      view.unmount(); acquire.mockRestore(); start.mockRestore(); renderer.mockRestore();
    }
  }, 20000);

  it("saves and opens the accepted source without leaving the building", async () => {
    const renderer = appR3WorkspaceRenderer();
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const save = vi.spyOn(BuildingRunController.prototype, "exportSourceFile");
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const original = await appP3SourceDownload();
      const captured = await save.mock.results[0].value;
      const floors = original.file.source.controlsView.floorCount;
      fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(floors + 1) } });
      fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
      await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
      await act(async () => { await start.mock.results[1].value; });
      expect((await appP3SourceDownload()).file.source.controlsView.floorCount).toBe(floors + 1);
      fireEvent.change(screen.getByLabelText("Open Source File"), {
        target: { files: [appIntentFile(async () => captured.contents)] }
      });
      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      await act(async () => { expect((await open.mock.results[0].value).stale).toBe(false); });
      expect(screen.getByLabelText("Floors")).toHaveValue(floors);
      expect((await appP3SourceDownload()).file).toEqual(original.file);
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getAllByRole("application", { name: "Interactive generated building viewer" })).toHaveLength(1);
      expect(screen.getAllByLabelText("Assembly Hall Three.js canvas")).toHaveLength(1);
      expect(screen.getByLabelText("Workspace run status")).toHaveTextContent("Building ready");
      expect(window.location.hash).toBe("#document=r3-workspace&room=assemblyHall");
    } finally {
      view.unmount(); open.mockRestore(); save.mockRestore(); start.mockRestore(); renderer.mockRestore();
    }
  }, 20000);

  it("keeps source-unavailable replay controls beside the retained viewer", async () => {
    const packet = await appIntentPacket("r3-workspace");
    const entry = completedFamilyPersistenceCacheEntry(packet);
    const fakeIndexedDb = new FakeIndexedDbFactory();
    const key = indexedDbArtifactCacheKey(entry);
    fakeIndexedDb.database.records.set(key, { key, entry });
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb as unknown as IDBFactory });
    const renderer = appR3WorkspaceRenderer();
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const view = render(<App />);
    try {
      await waitForInitialRun();
      expect(start).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
      expect(screen.getByText("This saved result has no editable source.")).toBeInTheDocument();
      expect(screen.getByLabelText("Open Source File")).toBeEnabled();
      expect(screen.getByLabelText("Floors")).toBeInTheDocument();
      expect(screen.getByRole("application", { name: "Interactive generated building viewer" })).toBeInTheDocument();
      expect(screen.getByLabelText("Workspace run status")).toHaveTextContent("Building ready");
    } finally {
      view.unmount(); start.mockRestore(); renderer.mockRestore();
      if (previousIndexedDb) Object.defineProperty(globalThis, "indexedDB", previousIndexedDb);
      else Reflect.deleteProperty(globalThis, "indexedDB");
    }
  }, 20000);

  it("keeps disclosures and legacy navigation separate from generation", async () => {
    const renderer = appR3WorkspaceRenderer();
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun");
    const view = render(<App />);
    try {
      await waitForInitialRun();
      const canvas = await screen.findByLabelText("Assembly Hall Three.js canvas");
      const run = screen.getByLabelText("Generation run state").textContent;
      for (const label of ["Project info", "Generation details", "View controls", "Component gallery and family benchmarks"]) {
        const summary = screen.getByText(label, { selector: "summary" });
        const details = summary.closest("details");
        expect(details).not.toBeNull();
        expect(details).not.toHaveAttribute("open");
        fireEvent.click(summary);
        expect(details).toHaveAttribute("open");
        if (label === "View controls") {
          const rendererSummary = screen.getByText("Renderer diagnostics", { selector: "summary" });
          const rendererDetails = rendererSummary.closest("details");
          expect(rendererDetails).not.toHaveAttribute("open");
          fireEvent.click(rendererSummary);
          expect(rendererDetails).toHaveAttribute("open");
          fireEvent.click(rendererSummary);
          expect(rendererDetails).not.toHaveAttribute("open");
          expect(details).toHaveAttribute("open");
        }
        fireEvent.click(summary);
        expect(details).not.toHaveAttribute("open");
        expect(screen.getByLabelText("Assembly Hall Three.js canvas")).toBe(canvas);
      }
      expect(screen.getByLabelText("Generation run state").textContent).toBe(run);
      expect(start).toHaveBeenCalledTimes(1);
      selectRoom("Atlas Lab");
      expect(await screen.findByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
      expect(window.location.hash).toBe("#document=r3-workspace&room=atlasLab");
      selectRoom("Prompt Lab");
      expect(screen.getByRole("heading", { name: "Prompt Lab" })).toBeInTheDocument();
      expect(screen.getAllByLabelText("Floors")).toHaveLength(1);
      selectRoom("Assembly Hall");
      expect(screen.getByLabelText("Building workspace")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Generation run state").textContent).toBe(run);
      expect(start).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); start.mockRestore(); renderer.mockRestore(); }
  }, 20000);
});

async function appP6Workspace(documentId: string) {
  window.history.replaceState(null, "", "/#document=" + documentId + "&room=assemblyHall");
  const renderer = appR3WorkspaceRenderer(), fixtures: AssemblyHallFixture[] = [];
  const controllers: BuildingRunController[] = [];
  const registerOriginal = BuildingRunController.prototype.registerFixtureViewer;
  const register = vi.spyOn(BuildingRunController.prototype, "registerFixtureViewer").mockImplementation(function (this: BuildingRunController, prepare) {
    controllers.push(this); return registerOriginal.call(this, prepare);
  });
  const leaseOriginal = BuildingRunController.prototype.acquireFixtureViewerLease;
  const lease = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease").mockImplementation(function (this: BuildingRunController, fixture) {
    if (!fixtures.includes(fixture)) fixtures.push(fixture);
    return leaseOriginal.call(this, fixture);
  });
  const view = render(<App />);
  const cleanup = () => { view.unmount(); lease.mockRestore(); register.mockRestore(); renderer.mockRestore(); };
  try {
    await waitForInitialRun(); await screen.findByLabelText("Assembly Hall Three.js canvas");
    await waitFor(() => expect(controllers.length).toBeGreaterThan(0));
    const controller = controllers.at(-1);
    if (!controller || !fixtures[0]) throw new Error("Expected real attached App controller and fixture");
    const summary = screen.getByText("View controls", { selector: "summary" });
    if (!summary.closest("details")?.open) fireEvent.click(summary);
    return { view, controller, fixture: fixtures[0], fixtures, cleanup };
  } catch (error) { cleanup(); throw error; }
}
function appP6Paths(fixture: AssemblyHallFixture) {
  const paths = fixture.ir.semanticIndex.filter(value => value.batchId === "instances.window").map(value => value.semanticPath);
  if (paths.length < 3) throw new Error("Expected actual distinct window paths");
  return paths;
}
async function appP6Select(fixture: AssemblyHallFixture, index = 0) {
  const semanticPath = appP6Paths(fixture)[index];
  fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: semanticPath } });
  const field = screen.getByLabelText("Window width (m)") as HTMLInputElement;
  await waitFor(() => { expect(field).toBeEnabled(); expect(Number(field.value)).toBeGreaterThanOrEqual(0.23); });
  const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
  const target = await import("../features/building-family/compiler/facadeSplitPlan");
  const split = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: fixture.sourceSnapshot, catalog: fixture.catalog });
  const address = target.resolveWindowSlotAddressFromSemanticPath(split, semanticPath);
  const opening = target.resolveWindowOpeningFromSlotAddress(split, address);
  return { field, semanticPath, address, baseWidth: opening.sizeM[0] };
}

describe("R3.P6 selected window width inspector", () => {
  it("applies, restores and reopens an actual selected width on the same surface with exact source and five materials", async () => {
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride"), open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    try {
      context = await appP6Workspace("r3-p6-apply-open");
      expect(interpret.mock.calls.length).toBeGreaterThan(0); expect(generate.mock.calls.length).toBeGreaterThan(0);
      const original = await appP3SourceDownload(), selected = await appP6Select(context.fixture);
      const channels = Object.entries(context.fixture.packedAtlas.channels).map(([name, layer]) => ({ name,
        widthPx: layer.widthPx, heightPx: layer.heightPx, bytes: Array.from(layer.data) }));
      interpret.mockClear(); generate.mockClear();
      const widthM = Math.max(0.23, selected.baseWidth * 0.6);
      fireEvent.change(selected.field, { target: { value: String(widthM) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
      let changed!: AssemblyHallFixture;
      await act(async () => { const result = await apply.mock.results[0].value; expect(result.stale).toBe(false); changed = result.fixture!; });
      expect(apply.mock.calls[0][0]).toEqual({ expectedSourceContentHash: context.fixture.sourceSnapshot!.sourceContentHash,
        expectedRevision: context.fixture.sourceSnapshot!.document.revision,
        directive: { schemaVersion: "0.1.0", address: selected.address, widthM } });
      expect(changed.ir).not.toBe(context.fixture.ir); expect(changed.packedAtlas).toBe(context.fixture.packedAtlas);
      expect(changed.debugExport).toBe(context.fixture.debugExport); expect(changed.catalog).toBe(context.fixture.catalog);
      await waitFor(() => { expect(screen.getByLabelText("Window width (m)")).toBeEnabled(); expect(screen.getByLabelText("Window width (m)")).toHaveValue(widthM); });
      const edited = await appP3SourceDownload();
      expect(edited.file.schemaVersion).toBe("0.4.0"); expect(edited.file.materials).toEqual(original.file.materials);
      await waitFor(() => expect(screen.getByRole("button", { name: "Restore original" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Restore original" }));
      await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
      await act(async () => { expect((await apply.mock.results[1].value).stale).toBe(false); });
      await waitFor(() => { expect(screen.getByLabelText("Window width (m)")).toBeEnabled(); expect(screen.getByLabelText("Window width (m)")).toHaveValue(selected.baseWidth); });
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => JSON.stringify(edited.file))] } });
      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      let reopened!: AssemblyHallFixture;
      await act(async () => { const result = await open.mock.results[0].value; expect(result.stale).toBe(false); reopened = result.fixture!; });
      expect(reopened.sourceSnapshot).toEqual(edited.file.source); expect(reopened.ir).toEqual(changed.ir);
      expect(reopened.componentGallery).toEqual(changed.componentGallery);
      expect((await appP3SourceDownload()).file).toEqual(edited.file);
      await waitFor(() => { expect(screen.getByLabelText("Window width (m)")).toBeEnabled(); expect(screen.getByLabelText("Window width (m)")).toHaveValue(widthM); });
      for (const before of channels) {
        const layer = Object.entries(reopened.packedAtlas.channels).find(([name]) => name === before.name)?.[1];
        expect(layer).toBeDefined(); expect(layer!.widthPx).toBe(before.widthPx); expect(layer!.heightPx).toBe(before.heightPx);
        expect(Array.from(layer!.data)).toEqual(before.bytes);
      }
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
      expect(screen.getAllByLabelText("Assembly Hall Three.js canvas")).toHaveLength(1);
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true");
    } finally { context?.cleanup(); apply.mockRestore(); open.mockRestore(); interpret.mockRestore(); generate.mockRestore(); }
  }, 30_000);

  it("keeps blank, native-invalid, too-small and above-base values out of the controller", async () => {
    const context = await appP6Workspace("r3-p6-invalid-input"), apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    try {
      const selected = await appP6Select(context.fixture);
      expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled();
      for (const value of ["", " ", "Infinity", "NaN", "0.22", String(selected.baseWidth + 0.1)]) {
        fireEvent.change(selected.field, { target: { value } });
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      }
      expect(apply).not.toHaveBeenCalled();
      fireEvent.change(selected.field, { target: { value: String(selected.baseWidth) } });
      expect(selected.field).toHaveValue(selected.baseWidth);
      const floors = Number((screen.getByLabelText("Floors") as HTMLInputElement).value);
      fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(floors + 1) } });
      expect(screen.getByText("Run Current to apply your building changes before editing a window.")).toBeInTheDocument();
      expect(selected.field).toBeDisabled(); expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled(); expect(apply).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Floors")).toHaveValue(floors + 1);
    } finally { context.cleanup(); apply.mockRestore(); }
  }, 20_000);

  it("keeps the newer selection and its draft when an older model read resolves late", async () => {
    const context = await appP6Workspace("r3-p6-read-race"), apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const module = await import("../features/building-family/ui/assemblyHallFixture"), original = module.buildAssemblyHallSourceWindowSplit;
    const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    const held = vi.spyOn(module, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => { const plan = await original(input); ready.resolve(); await release.promise; return plan; });
    try {
      const paths = appP6Paths(context.fixture);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: paths[0] } });
      await ready.promise;
      const selected = await appP6Select(context.fixture, 1), widthM = Math.max(0.23, selected.baseWidth * 0.6);
      fireEvent.change(selected.field, { target: { value: String(widthM) } });
      await act(async () => { release.resolve(); await held.mock.results[0].value; });
      expect(selected.field).toHaveValue(widthM); expect(apply).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
      expect(apply.mock.calls[0][0].directive).toEqual({ schemaVersion: "0.1.0", address: selected.address, widthM });
      await act(async () => { expect((await apply.mock.results[0].value).stale).toBe(false); });
    } finally { release.resolve(); held.mockRestore(); context.cleanup(); apply.mockRestore(); }
  }, 20_000);

  it("shows local pending before a store run, blocks duplicates, and preserves a canceled or newly dirty draft", async () => {
    for (const action of ["cancel", "dirty-draft"] as const) {
      const context = await appP6Workspace("r3-p6-pending-" + action), apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
      const module = await import("../features/building-family/ui/assemblyHallFixture"), original = module.buildAssemblyHallSourceWindowSplit;
      const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
      let restoreHeld: (() => void) | undefined;
      try {
        const selected = await appP6Select(context.fixture), saved = await context.controller.exportSourceFile();
        const held = vi.spyOn(module, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => { const value = await original(input); ready.resolve(); await release.promise; return value; });
        restoreHeld = () => held.mockRestore();
        fireEvent.change(selected.field, { target: { value: String(Math.max(0.23, selected.baseWidth * 0.6)) } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        await ready.promise;
        expect(screen.getByText("Applying window width…")).toBeInTheDocument();
        expect(screen.getByLabelText("Workspace run status")).toHaveTextContent("Building ready");
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Cancel Run" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "Apply" })); expect(apply).toHaveBeenCalledTimes(1);
        const floors = Number((screen.getByLabelText("Floors") as HTMLInputElement).value);
        if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
        else fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(floors + 1) } });
        await act(async () => { release.resolve(); expect((await apply.mock.results[0].value).stale).toBe(true); });
        expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument();
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        expect(context.fixtures).toHaveLength(1);
        if (action === "dirty-draft") {
          expect(screen.getByLabelText("Floors")).toHaveValue(floors + 1);
          expect(screen.getByText("Run Current to apply your building changes before editing a window.")).toBeInTheDocument();
          expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        }
      } finally { release.resolve(); restoreHeld?.(); context.cleanup(); apply.mockRestore(); }
    }
  }, 30_000);

  it("does not let old action completions refill a different selection, opened source, route or unmounted inspector", async () => {
    for (const action of ["selection", "open", "document", "unmount"] as const) {
      const context = await appP6Workspace("r3-p6-late-" + action), apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
      const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
      const module = await import("../features/building-family/ui/assemblyHallFixture"), original = module.buildAssemblyHallSourceWindowSplit;
      const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
      let restoreHeld: (() => void) | undefined;
      try {
        const selected = await appP6Select(context.fixture), saved = await context.controller.exportSourceFile();
        const held = vi.spyOn(module, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => { const value = await original(input); ready.resolve(); await release.promise; return value; });
        restoreHeld = () => held.mockRestore();
        const widthM = Math.max(0.23, selected.baseWidth * 0.6);
        fireEvent.change(selected.field, { target: { value: String(widthM) } }); fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        await ready.promise;
        let other: Awaited<ReturnType<typeof appP6Select>> | undefined;
        if (action === "selection") {
          fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: appP6Paths(context.fixture)[1] } });
          const split = await original({ sourceSnapshot: context.fixture.sourceSnapshot, catalog: context.fixture.catalog });
          const target = await import("../features/building-family/compiler/facadeSplitPlan");
          const address = target.resolveWindowSlotAddressFromSemanticPath(split, appP6Paths(context.fixture)[1]);
          other = { field: selected.field, semanticPath: appP6Paths(context.fixture)[1], address,
            baseWidth: target.resolveWindowOpeningFromSlotAddress(split, address).sizeM[0] };
        } else if (action === "open") {
          fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => saved.contents)] } });
          await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
          await act(async () => { expect((await open.mock.results[0].value).stale).toBe(false); });
        } else if (action === "document") {
          act(() => { window.history.replaceState(null, "", "/#document=r3-p6-new-route&room=assemblyHall"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
        } else context.view.unmount();
        await act(async () => { release.resolve(); const result = await apply.mock.results[0].value; expect(result.stale).toBe(action !== "selection"); });
        if (action === "selection") {
          await waitFor(() => { expect(screen.getByLabelText("Window width (m)")).toBeEnabled(); expect(screen.getByLabelText("Window width (m)")).toHaveValue(other!.baseWidth); });
          expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue(other!.semanticPath);
          expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled();
        } else if (action === "open") {
          expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
          await waitFor(() => expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument());
        } else if (action === "document") {
          expect(screen.getByLabelText("Route document identity")).toHaveTextContent("r3-p6-new-route");
          expect(screen.getByLabelText("Window width (m)")).toBeDisabled();
        } else expect(screen.queryByLabelText("Building workspace")).not.toBeInTheDocument();
      } finally { release.resolve(); restoreHeld?.(); context.cleanup(); apply.mockRestore(); open.mockRestore(); }
    }
  }, 40_000);

  it("requires a portable source for a source-unavailable replay and enables editing after actual source Open", async () => {
    const incoming = await appP3PortableSource("r3-p6-replay", "tall-arched"), packet = await appIntentPacket("r3-p6-replay");
    const entry = completedFamilyPersistenceCacheEntry(packet), fakeIndexedDb = new FakeIndexedDbFactory(), key = indexedDbArtifactCacheKey(entry);
    fakeIndexedDb.database.records.set(key, { key, entry });
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb as unknown as IDBFactory });
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile"), apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    try {
      context = await appP6Workspace("r3-p6-replay");
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: appP6Paths(context.fixture)[0] } });
      await screen.findByText("Open a portable source file to edit window widths.");
      expect(screen.getByLabelText("Window width (m)")).toBeDisabled(); expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => incoming.saved.contents)] } });
      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      let fixture!: AssemblyHallFixture;
      await act(async () => { const result = await open.mock.results[0].value; expect(result.stale).toBe(false); fixture = result.fixture!; });
      await appP6Select(fixture);
      expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled(); expect(apply).not.toHaveBeenCalled();
      expect((await appP3SourceDownload()).file).toEqual(incoming.file);
      expect(screen.queryByText("Open a portable source file to edit window widths.")).not.toBeInTheDocument();
    } finally {
      context?.cleanup(); open.mockRestore(); apply.mockRestore();
      if (previousIndexedDb) Object.defineProperty(globalThis, "indexedDB", previousIndexedDb); else Reflect.deleteProperty(globalThis, "indexedDB");
    }
  }, 30_000);
});

function appP11Deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}
function appP11Shape(value: unknown): unknown {
  if (value === undefined) return { kind: "undefined" };
  if (!value || typeof value !== "object") return value;
  if (ArrayBuffer.isView(value)) return {
    kind: Object.prototype.toString.call(value), byteOffset: value.byteOffset, byteLength: value.byteLength,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  };
  return { kind: Array.isArray(value) ? "array" : "object", fields: Reflect.ownKeys(value).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("Unexpected accessor in the actual runtime receipt");
    return [String(key), appP11Shape(descriptor.value)];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) };
}

async function appP11Seed(documentId: string) {
  const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
  const target = await import("../features/building-family/compiler/facadeSplitPlan");
  const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
  const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
  const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
  const owned: AssemblyHallFixture[] = [];
  try {
    const legacy = await appP3PortableSource(documentId, "tall-arched");
    expect(generate).toHaveBeenCalledTimes(12); expect(interpret).toHaveBeenCalledTimes(1);
    const parsed = await p3AppSourceCodec.parseBuildingSourceFile(legacy.file);
    const style = structuredClone(parsed.sourceSnapshot.stylePack);
    style.massing.floorHeightM.typical.min = 4.25; style.massing.floorHeightM.typical.max = 4.25;
    const pinned = await p3AppSourceCodec.createBuildingSourceSnapshot({ documentId, revision: 7,
      controls: parsed.sourceSnapshot.controlsView, intent: parsed.sourceSnapshot.intent, stylePack: style });
    const legacyFile = await p3AppSourceCodec.createBuildingSourceFile({ sourceSnapshot: pinned.sourceSnapshot, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    const base = await createAssemblyHallFixture({ sourceSnapshot: pinned.sourceSnapshot, promptControls: pinned.sourceSnapshot.controlsView,
      reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport } }); owned.push(base);
    const split = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: pinned.sourceSnapshot, catalog: base.catalog });
    const address = target.resolveWindowSlotAddressFromSemanticPath(split, appP6Paths(base)[0]);
    const opening = target.resolveWindowOpeningFromSlotAddress(split, address);
    const source = await p3AppSourceCodec.deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: pinned.sourceSnapshot,
      windowWidthOverrides: [{ schemaVersion: "0.1.0", address, widthM: Math.max(0.23, opening.sizeM[0] * 0.65) }] });
    const file = await p3AppSourceCodec.createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    const expected = await createAssemblyHallFixture({ sourceSnapshot: source, promptControls: source.controlsView,
      reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport } }); owned.push(expected);
    expect(file.schemaVersion).toBe("0.4.0"); expect(source.document.revision).toBe(7);
    expect(generate).toHaveBeenCalledTimes(12); expect(interpret).toHaveBeenCalledTimes(1);
    return { file, legacyFile, expected: { ir: appP11Shape(expected.ir), gallery: appP11Shape(expected.componentGallery),
      atlas: appP11Shape(expected.packedAtlas), debug: appP11Shape(expected.debugExport), spec: appP11Shape(expected.spec) } };
  } finally {
    for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    generate.mockRestore(); interpret.mockRestore();
  }
}

async function appP11Checkpoint(file: Awaited<ReturnType<typeof appP11Seed>>["file"]) {
  const module = await import("../features/building-family/state/buildingSourceCheckpoint");
  return module.createBuildingSourceCheckpoint({ schemaVersion: "0.1.0", kind: "source", documentId: file.source.document.documentId,
    createdAt: "2026-10-15T10:00:00.000Z", sourceFile: file });
}

describe("R3.P11 App editable source recovery", () => {
  const documentId = "r3-p11-app-authority";
  let seed: Awaited<ReturnType<typeof appP11Seed>>;
  beforeAll(async () => { seed = await appP11Seed(documentId); }, 30_000);
  beforeEach(() => { window.history.replaceState(null, "", "/#document=" + documentId + "&room=promptLab"); });

  it("automatically opens the exact v4 source, complete runtime/gallery and five materials before acknowledging its accepted publication", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    await module.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile"), start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily");
    const view = render(<App />);
    try {
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "recovered-source"));
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved"));
      expect(open).toHaveBeenCalledTimes(1); expect(start).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
      const result = await open.mock.results[0].value, fixture = result.fixture!;
      const controller = open.mock.contexts[0] as BuildingRunController;
      expect(result.stale).toBe(false); expect(fixture.sourceSnapshot).toEqual(seed.file.source);
      expect(appP11Shape(fixture.ir)).toStrictEqual(seed.expected.ir); expect(appP11Shape(fixture.componentGallery)).toStrictEqual(seed.expected.gallery);
      expect(appP11Shape(fixture.packedAtlas)).toStrictEqual(seed.expected.atlas); expect(appP11Shape(fixture.debugExport)).toStrictEqual(seed.expected.debug);
      expect(appP11Shape(fixture.spec)).toStrictEqual(seed.expected.spec);
      expect((await controller.exportSourceFile()).contents).toBe(JSON.stringify(seed.file, null, 2));
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-run-id", result.runId);
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-source-content-hash", seed.file.source.sourceContentHash);
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-revision", "7");
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      const saved = await module.createBuildingSourceCheckpointPersistence().get(documentId);
      expect(saved?.kind).toBe("source"); if (saved?.kind === "source") expect(saved.sourceFile).toEqual(seed.file);
      expect(appDefaultIndexedDb.databases.has("buildo-building-source-checkpoints")).toBe(true);
      expect(appDefaultIndexedDb.named("buildo-building-source-checkpoints").stores.has("sourceCheckpoints")).toBe(true);
      expect(appDefaultIndexedDb.databases.get("buildo-building-family-artifacts")).not.toBe(appDefaultIndexedDb.databases.get("buildo-building-source-checkpoints"));
    } finally { view.unmount(); open.mockRestore(); start.mockRestore(); restore.mockRestore(); generate.mockRestore(); interpret.mockRestore(); }
  }, 30_000);

  it("keeps pending until actual acknowledgement and binds Saved to the retained accepted owner after a later failed attempt", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    await module.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    const originalFactory = module.createBuildingSourceCheckpointPersistence, entered = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => {
      const actual = originalFactory(); return { ...actual, put: async input => { await actual.put(input); entered.resolve(); await release.promise; } };
    });
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile"), view = render(<App />);
    try {
      await entered.promise;
      const result = await open.mock.results[0].value, controller = open.mock.contexts[0] as BuildingRunController;
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "pending");
      await act(async () => { await expect(controller.startDemoRun({ ...seed.file.source.controlsView, detailLevel: "low" })).rejects.toMatchObject({ code: "building.sourceEditUnsupported" }); });
      expect(screen.getByLabelText("Generation run state")).toHaveTextContent("failed");
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-run-id", result.runId);
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "pending");
      await act(async () => { release.resolve(); await controller.drainSourceCheckpoints(); });
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved"));
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-run-id", result.runId);
      expect((await controller.exportSourceFile()).contents).toBe(JSON.stringify(seed.file, null, 2));
    } finally { release.resolve(); view.unmount(); factory.mockRestore(); open.mockRestore(); }
  }, 30_000);

  it("permits legacy fallback only for undefined and stops automatic work on busy, unsupported, invalid, IO-failed or uncompilable authority", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    const { BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX } = await import("../features/building-family/state/buildingSourceCheckpointWriter");
    for (const mode of ["absent", "busy", "unsupported", "invalid", "io", "compile"] as const) {
      const idb = new FakeIndexedDbFactory(), locks = new FakeAppLocks();
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: idb });
      Object.defineProperty(navigator, "locks", { configurable: true, value: mode === "unsupported" ? undefined : locks });
      if (mode === "busy") locks.held.set(BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX + JSON.stringify(documentId), {});
      if (mode === "invalid" || mode === "compile") await module.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
      if (mode === "invalid") {
        const records = idb.named("buildo-building-source-checkpoints").store("sourceCheckpoints");
        const record = [...records.values()][0] as { entry: { artifact: { contentHash: string } } };
        record.entry.artifact.contentHash = "0".repeat(64);
      }
      const before = appP11Shape([...idb.named("buildo-building-source-checkpoints").store("sourceCheckpoints")]);
      const originalFactory = module.createBuildingSourceCheckpointPersistence;
      const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => {
        const actual = originalFactory(); return mode === "io" ? { ...actual, get: async () => { throw new Error("p11 checkpoint read failed"); } } : actual;
      });
      const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily"), open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
      if (mode === "compile") open.mockRejectedValueOnce(new Error("p11 source compile failed"));
      const view = render(<App />);
      try {
        if (mode === "absent") { await waitForInitialRun(); expect(restore).toHaveBeenCalledTimes(1); expect(start).toHaveBeenCalledTimes(1); }
        else {
          await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", mode === "busy" || mode === "unsupported" ? mode : "failed"));
          expect(start).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
          expect(open).toHaveBeenCalledTimes(mode === "compile" ? 1 : 0);
          expect(appP11Shape([...idb.named("buildo-building-source-checkpoints").store("sourceCheckpoints")])).toStrictEqual(before);
          expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "unsaved");
          if (mode === "busy" || mode === "unsupported") expect(factory).not.toHaveBeenCalled();
          if (mode === "busy") {
            fireEvent.click(screen.getByRole("button", { name: "Run Current" })); await waitForInitialRun();
            expect(start).toHaveBeenCalledTimes(1); expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "unsaved");
            expect(factory).not.toHaveBeenCalled();
          }
        }
      } finally { view.unmount(); start.mockRestore(); restore.mockRestore(); open.mockRestore(); factory.mockRestore(); }
    }
  }, 40_000);

  it("lets manual Open pass a held automatic get and ignores its later success or rejection without retroactive saving", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    const { BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX } = await import("../features/building-family/state/buildingSourceCheckpointWriter");
    for (const outcome of ["success", "failure"] as const) {
      const idb = new FakeIndexedDbFactory(), locks = new FakeAppLocks();
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: idb });
      Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
      const held = appP11Deferred<Awaited<ReturnType<typeof appP11Checkpoint>> | undefined>(), entered = appIntentDeferred<void>();
      const originalFactory = module.createBuildingSourceCheckpointPersistence;
      const puts = vi.fn<ReturnType<typeof originalFactory>["put"]>();
      const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => {
        const actual = originalFactory(); puts.mockImplementation(input => actual.put(input));
        return { put: puts, get: async () => { entered.resolve(); return held.promise; } };
      });
      const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile"), start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), restore = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily");
      const view = render(<App />);
      try {
        await entered.promise;
        const manualText = appIntentDeferred<string>();
        fireEvent.change(screen.getByLabelText("Bays"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(() => manualText.promise)] } });
        const laterFloor = seed.file.source.controlsView.floorCount + 1;
        fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(laterFloor) } });
        await act(async () => { manualText.resolve(JSON.stringify(seed.file)); await manualText.promise; });
        await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
        const controller = open.mock.contexts[0] as BuildingRunController;
        await act(async () => { expect((await open.mock.results[0].value).stale).toBe(false); await controller.drainSourceCheckpoints(); });
        expect((await controller.exportSourceFile()).contents).toBe(JSON.stringify(seed.file, null, 2));
        expect(screen.getByLabelText("Floors")).toHaveValue(laterFloor);
        expect(screen.getByLabelText("Bays")).toHaveValue(seed.file.source.controlsView.bayCount);
        expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("floorCount");
        expect(puts).not.toHaveBeenCalled(); expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "unsaved");
        await act(async () => {
          if (outcome === "success") held.resolve(await appP11Checkpoint(seed.legacyFile)); else held.reject(new Error("stale checkpoint read failure"));
          await held.promise.catch(() => undefined);
        });
        expect(open).toHaveBeenCalledTimes(1); expect(start).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Source checkpoint recovery")).not.toHaveAttribute("data-state", "failed");
        expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "unsaved");
        expect([...locks.held.keys()].filter(name => name.startsWith(BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX))).toHaveLength(1);
        fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => JSON.stringify(seed.file))] } });
        await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
        await act(async () => { await open.mock.results[1].value; await controller.drainSourceCheckpoints(); });
        expect(puts).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
        expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", outcome === "success" ? "saved" : "unsaved");
      } finally { held.resolve(undefined); view.unmount(); factory.mockRestore(); open.mockRestore(); start.mockRestore(); restore.mockRestore(); }
    }
  }, 40_000);

  it("creates a fresh StrictMode controller and closes a stale late acquisition without reading or activating it", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    await module.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    const entered = appIntentDeferred<void>(), originalOpen = BuildingRunController.prototype.openSourceFile;
    const dispose = vi.spyOn(BuildingRunController.prototype, "dispose");
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile").mockImplementation(function (this: BuildingRunController, input) {
      entered.resolve(); return originalOpen.call(this, input);
    });
    const strict = render(<StrictMode><App /></StrictMode>);
    try {
      await act(async () => {
        await entered.promise;
        expect((await open.mock.results[0].value).stale).toBe(false);
        await (open.mock.contexts[0] as BuildingRunController).drainSourceCheckpoints();
      });
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved");
      expect(open).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
      expect(dispose.mock.contexts[0]).not.toBe(open.mock.contexts[0]);
    } finally { strict.unmount(); }
    await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
    expect(new Set(dispose.mock.contexts).size).toBe(2);
    dispose.mockRestore(); open.mockRestore();
    const writer = await import("../features/building-family/state/buildingSourceCheckpointWriter");
    const held = appIntentDeferred<Awaited<ReturnType<typeof writer.acquireBuildingSourceCheckpointWriter>>>(), closed = vi.fn(async () => undefined);
    const original = writer.acquireBuildingSourceCheckpointWriter;
    const acquire = vi.spyOn(writer, "acquireBuildingSourceCheckpointWriter").mockImplementationOnce(() => held.promise).mockImplementation(options => original(options));
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), sourceOpen = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
    const view = render(<App />);
    try {
      await waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
      act(() => { window.history.replaceState(null, "", "/#document=r3-p11-new-generation&room=promptLab"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
      await waitForInitialRun();
      await act(async () => { held.resolve({ documentId, retain: () => undefined, close: closed }); await held.promise; });
      await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
      expect(sourceOpen).not.toHaveBeenCalled(); expect(start).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Route document identity")).toHaveTextContent("r3-p11-new-generation");
    } finally { held.resolve(undefined); view.unmount(); acquire.mockRestore(); start.mockRestore(); sourceOpen.mockRestore(); }
  }, 30_000);

  it("re-enters a document after native close without waiting for its obsolete held read", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint"), original = module.createBuildingSourceCheckpointPersistence;
    const held = appIntentDeferred<undefined>(), entered = appIntentDeferred<void>(); let first = true;
    const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => {
      const actual = original(); return { ...actual, get: async document => {
        if (document === documentId && first) { first = false; entered.resolve(); return held.promise; }
        return actual.get(document);
      } };
    });
    const start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), view = render(<App />);
    try {
      await entered.promise;
      act(() => { window.history.replaceState(null, "", "/#document=r3-p11-away&room=promptLab"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
      await waitForInitialRun();
      act(() => { window.history.replaceState(null, "", "/#document=" + documentId + "&room=promptLab"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
      await waitFor(() => expect(start).toHaveBeenCalledTimes(2)); await waitForInitialRun();
      const active = screen.getByLabelText("Generation run artifact").textContent;
      await act(async () => { held.resolve(undefined); await held.promise; });
      expect(start).toHaveBeenCalledTimes(2); expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent(active!);
    } finally { held.resolve(undefined); view.unmount(); factory.mockRestore(); start.mockRestore(); }
  }, 30_000);

  it("acquires a foreign source before publication and preserves A through real B compile or viewer rejection", async () => {
    const writer = await import("../features/building-family/state/buildingSourceCheckpointWriter"), originalAcquire = writer.acquireBuildingSourceCheckpointWriter;
    const originalOpen = BuildingRunController.prototype.openSourceFile;
    for (const failure of ["none", "compile", "viewer"] as const) {
      const renderer = appR3WorkspaceRenderer();
      window.history.replaceState(null, "", "/#document=r3-p11-retained-a&room=assemblyHall");
      const lease = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease"), open = vi.spyOn(BuildingRunController.prototype, "openSourceFile");
      const entered = appIntentDeferred<void>(), release = appIntentDeferred<void>();
      const acquire = vi.spyOn(writer, "acquireBuildingSourceCheckpointWriter").mockImplementation(async options => {
        const session = await originalAcquire(options); if (options.documentId === documentId) { entered.resolve(); await release.promise; } return session;
      });
      const view = render(<App />);
      try {
        await waitForInitialRun(); await screen.findByLabelText("Assembly Hall Three.js canvas");
        const before = lease.mock.calls[0][0], controller = lease.mock.contexts[0] as BuildingRunController;
        const saved = await controller.exportSourceFile(), raw = appP11Shape(before.packedAtlas), scene = before.familyRuntime.root.parent;
        const canvas = screen.getByLabelText("Assembly Hall Three.js canvas");
        open.mockClear();
        const opening = appIntentDeferred<void>();
        open.mockImplementation(function (this: BuildingRunController, input) { opening.resolve(); return originalOpen.call(this, input); });
        let file = seed.file;
        if (failure === "compile") {
          const directive = seed.file.source.schemaVersion === "0.4.0" ? seed.file.source.windowWidthOverrides[0] : undefined;
          if (!directive) throw new Error("Expected the actual width directive");
          const source = await p3AppSourceCodec.deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: seed.file.source,
            windowWidthOverrides: [{ ...directive, address: { ...directive.address, floorIndex: 999 } }] });
          const parsed = await p3AppSourceCodec.parseBuildingSourceFile(seed.file);
          file = await p3AppSourceCodec.createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
          await p3AppSourceCodec.parseBuildingSourceFile(file);
        }
        if (failure === "viewer") renderer.mockRejectedValueOnce(new Error("p11 foreign viewer rejected"));
        const fileText = appIntentDeferred<string>();
        const newFloor = Number((screen.getByLabelText("Floors") as HTMLInputElement).value) + 1;
        if (failure === "none") fireEvent.change(screen.getByLabelText("Bays"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(failure === "none" ? () => fileText.promise : async () => JSON.stringify(file))] } });
        if (failure === "none") {
          fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(newFloor) } });
          await act(async () => { fileText.resolve(JSON.stringify(file)); await fileText.promise; });
        }
        await entered.promise;
        expect(open).not.toHaveBeenCalled(); expect(window.location.hash).toBe("#document=r3-p11-retained-a&room=assemblyHall");
        expect(canvas.isConnected).toBe(true); expect((await controller.exportSourceFile()).contents).toBe(saved.contents);
        await act(async () => {
          release.resolve(); await opening.promise;
          const pending = open.mock.results[0].value;
          if (failure === "none") {
            expect((await pending).stale).toBe(false);
            await (open.mock.contexts[0] as BuildingRunController).drainSourceCheckpoints();
          } else if (failure === "compile") await expect(pending).rejects.toMatchObject({ code: "building.windowSlot.missingOpening" });
          else await expect(pending).rejects.toThrow("p11 foreign viewer rejected");
        });
        if (failure === "none") {
          await waitFor(() => expect(screen.getByLabelText("Route document identity")).toHaveTextContent(documentId));
          await waitFor(() => expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved"));
          expect((await appP3SourceDownload()).file).toEqual(seed.file);
          expect(screen.getByLabelText("Floors")).toHaveValue(newFloor);
          expect(screen.getByLabelText("Bays")).toHaveValue(seed.file.source.controlsView.bayCount);
          expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("floorCount");
        } else {
          expect(screen.getByLabelText("Source file error")).toHaveTextContent(failure === "compile" ? /opening/i : "p11 foreign viewer rejected");
          expect(window.location.hash).toBe("#document=r3-p11-retained-a&room=assemblyHall");
          expect(canvas.isConnected).toBe(true); expect(before.familyRuntime.root.parent).toBe(scene);
          expect(appP11Shape(before.packedAtlas)).toStrictEqual(raw);
          expect((await controller.exportSourceFile()).contents).toBe(saved.contents);
          const retained = controller.acquireFixtureViewerLease(before); retained();
        }
      } finally {
        release.resolve(); view.unmount(); acquire.mockRestore(); lease.mockRestore(); open.mockRestore(); renderer.mockRestore();
        await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      }
    }
  }, 50_000);

  it.each(["newer-open", "unmount"] as const)("keeps accepted foreign ownership coherent for queued %s before the older Open continuation", async (action) => {
    const incoming = await appP3PortableSource("r3-p11-post-commit-b", "tall-rectangular");
    const parsed = await p3AppSourceCodec.parseBuildingSourceFile(incoming.file);
    const newer = await p3AppSourceCodec.createBuildingSourceFile({ sourceSnapshot: p3AppSourceCodec.withBuildingSourceRevision(parsed.sourceSnapshot, parsed.sourceSnapshot.document.revision + 1), packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    window.history.replaceState(null, "", "/#document=r3-p11-post-commit-a&room=assemblyHall");
    const renderer = appR3WorkspaceRenderer(), queued = appP11Deferred<void>(), newerText = appIntentDeferred<string>();
    let enqueue = true;
    const lifecycle: { unmount?: () => void } = {};
    const originalRegister = BuildingRunController.prototype.registerFixtureViewer;
    const register = vi.spyOn(BuildingRunController.prototype, "registerFixtureViewer").mockImplementation(function (this: BuildingRunController, prepare) {
      return originalRegister.call(this, async (fixture, context) => {
        const prepared = await prepare(fixture, context);
        if (fixture.sourceSnapshot?.document.documentId !== "r3-p11-post-commit-b" || !enqueue) return prepared;
        enqueue = false;
        return {
          commit() {
            const finalize = prepared.commit();
            queueMicrotask(() => {
              try {
                expect(window.location.hash).toBe("#document=r3-p11-post-commit-b&room=assemblyHall");
                expect(screen.getByLabelText("Route document identity")).toHaveTextContent("r3-p11-post-commit-a");
                if (action === "unmount") {
                  if (!lifecycle.unmount) throw new Error("Expected the mounted App cleanup");
                  lifecycle.unmount();
                } else fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(() => newerText.promise)] } });
                queued.resolve();
              } catch (error) { queued.reject(error); }
            });
            return finalize;
          },
          discard() { prepared.discard(); }
        };
      });
    });
    const originalLease = BuildingRunController.prototype.acquireFixtureViewerLease;
    const retired: AssemblyHallFixture[] = [], watched = new Set<AssemblyHallFixture>(), disposers: Array<{ mockRestore(): void }> = [];
    const lease = vi.spyOn(BuildingRunController.prototype, "acquireFixtureViewerLease").mockImplementation(function (this: BuildingRunController, fixture) {
      if (fixture.sourceSnapshot?.document.documentId === "r3-p11-post-commit-b" && !watched.has(fixture)) {
        watched.add(fixture);
        const dispose = fixture.familyRuntime.dispose;
        disposers.push(vi.spyOn(fixture.familyRuntime, "dispose").mockImplementation(() => { retired.push(fixture); return dispose.call(fixture.familyRuntime); }));
      }
      return originalLease.call(this, fixture);
    });
    const dispose = vi.spyOn(BuildingRunController.prototype, "dispose");
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile"), view = render(<App />);
    lifecycle.unmount = view.unmount;
    try {
      await waitForInitialRun(); await screen.findByLabelText("Assembly Hall Three.js canvas");
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => incoming.saved.contents)] } });
      await act(async () => { await queued.promise; await open.mock.results[0].value; });
      const result = await open.mock.results[0].value, fixture = result.fixture!, controller = open.mock.contexts[0] as BuildingRunController;
      expect(result.stale).toBe(false); expect(fixture).toBeDefined();
      if (action === "unmount") {
        await controller.drainSourceCheckpoints();
        await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
        expect(dispose.mock.contexts.filter(owner => owner === controller)).toHaveLength(1);
        expect(retired.filter(owner => owner === fixture)).toHaveLength(1);
        expect(screen.queryByLabelText("Assembly Hall Three.js canvas")).not.toBeInTheDocument();
        return;
      }
      await waitFor(() => expect(screen.getByLabelText("Route document identity")).toHaveTextContent("r3-p11-post-commit-b"));
      expect(retired).not.toContain(fixture);
      expect((await controller.exportSourceFile()).contents).toBe(incoming.saved.contents);
      const currentRenderer = await renderer.mock.results.at(-1)!.value;
      expect(currentRenderer.renderer.domElement.isConnected).toBe(true);
      await waitFor(() => expect(currentRenderer.renderer.render).toHaveBeenCalled());
      const scene = vi.mocked(currentRenderer.renderer.render).mock.calls.at(-1)?.[0] as Scene;
      expect(scene.getObjectById(fixture.familyRuntime.root.id)).toBe(fixture.familyRuntime.root);
      await act(async () => { newerText.resolve(JSON.stringify(newer)); await newerText.promise; });
      await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
      const next = await open.mock.results[1].value;
      expect(next.stale).toBe(false); expect(next.fixture).not.toBe(fixture); expect(open.mock.contexts[1]).toBe(controller);
      expect((await appP3SourceDownload()).file).toEqual(newer);
      expect(retired).not.toContain(next.fixture!);
      const nextRenderer = await renderer.mock.results.at(-1)!.value;
      expect(nextRenderer.renderer.domElement.isConnected).toBe(true);
      expect(window.location.hash).toBe("#document=r3-p11-post-commit-b&room=assemblyHall");
    } finally {
      newerText.resolve("{"); view.unmount(); for (const spy of disposers) spy.mockRestore();
      open.mockRestore(); dispose.mockRestore(); lease.mockRestore(); register.mockRestore(); renderer.mockRestore();
    }
  }, 40_000);

  it("recovers an unavailable marker through exact cached identity with no rewrites and never falls back from a missing reference", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    const packet = await appIntentPacket(documentId), entry = completedFamilyPersistenceCacheEntry(packet), key = indexedDbArtifactCacheKey(entry);
    appDefaultIndexedDb.database.records.set(key, { key, entry });
    const marker = await module.createBuildingSourceCheckpoint({ schemaVersion: "0.1.0", kind: "source-unavailable", documentId,
      createdAt: "2026-10-15T10:00:00.000Z", reason: "completed-family-import",
      completedFamilyRef: { runId: packet.runId, createdAt: packet.createdAt, requestHash: packet.requestHash, contentHash: packet.contentHash } });
    await module.createBuildingSourceCheckpointPersistence().put(marker);
    const put = vi.spyOn(FakeObjectStore.prototype, "put"), start = vi.spyOn(BuildingRunController.prototype, "startDemoRun"), latest = vi.spyOn(BuildingRunController.prototype, "restoreLatestCompletedFamily");
    const restore = vi.spyOn(BuildingRunController.prototype, "restoreSourceUnavailableCheckpoint");
    let view = render(<App />);
    try {
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "recovered-view"));
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveTextContent("View reference saved; editable source unavailable.");
      expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
      expect(restore).toHaveBeenCalledTimes(1); expect(put).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled();
      view.unmount(); await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      appDefaultIndexedDb.database.records.delete(key);
      view = render(<App />);
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "failed"));
      expect(start).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
      expect(await module.createBuildingSourceCheckpointPersistence().get(documentId)).toEqual(marker);
    } finally { view.unmount(); put.mockRestore(); start.mockRestore(); latest.mockRestore(); restore.mockRestore(); }
  }, 30_000);

  it("reports a writable save failure without rolling back the accepted source or overwriting the retained record", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint");
    const record = await appP11Checkpoint(seed.file);
    await module.createBuildingSourceCheckpointPersistence().put(record);
    const original = module.createBuildingSourceCheckpointPersistence, failure = new Error("p11 source write failed");
    const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => ({ ...original(), put: async () => { throw failure; } }));
    const entered = appIntentDeferred<void>(), originalOpen = BuildingRunController.prototype.openSourceFile;
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile").mockImplementation(function (this: BuildingRunController, input) {
      entered.resolve(); return originalOpen.call(this, input);
    }), view = render(<App />);
    try {
      await act(async () => {
        await entered.promise; await open.mock.results[0].value;
        await (open.mock.contexts[0] as BuildingRunController).drainSourceCheckpoints();
      });
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "failed");
      const result = await open.mock.results[0].value, controller = open.mock.contexts[0] as BuildingRunController;
      expect(result.stale).toBe(false); expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete");
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveTextContent("Automatic source saving failed");
      expect((await controller.exportSourceFile()).contents).toBe(JSON.stringify(seed.file, null, 2));
      expect(controller.getSourceCheckpointStatus(documentId)?.error).toBeInstanceOf(module.BuildingSourceCheckpointError);
      expect(await original().get(documentId)).toEqual(record);
    } finally { view.unmount(); open.mockRestore(); factory.mockRestore(); }
  }, 30_000);

  it("shows current local parse errors without losing the accepted scene or replacing them with an older error", async () => {
    const context = await appP6Workspace("r3-p11-local-errors"), saved = await context.controller.exportSourceFile();
    try {
      for (const text of ["{", JSON.stringify({ schemaVersion: "invalid" })]) {
        fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => text)] } });
        await screen.findByLabelText("Source file error");
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        expect(screen.getByLabelText("Assembly Hall Three.js canvas").isConnected).toBe(true);
      }
      const held = appP11Deferred<string>();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(() => held.promise)] } });
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => { throw new Error("current local file error"); })] } });
      await screen.findByText("current local file error");
      await act(async () => { held.reject(new Error("obsolete local file error")); await held.promise.catch(() => undefined); });
      expect(screen.getByLabelText("Source file error")).toHaveTextContent("current local file error");
      expect(screen.queryByText("obsolete local file error")).not.toBeInTheDocument();
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
    } finally { context.cleanup(); }
  }, 30_000);
});


async function appP12Accepted(pending: ReturnType<BuildingRunController["applyWindowWidthOverride"]>) {
  let fixture!: AssemblyHallFixture;
  await act(async () => {
    const result = await pending;
    expect(result.stale).toBe(false);
    if (!result.fixture) throw new Error("Expected an actually accepted history fixture");
    fixture = result.fixture;
  });
  return fixture;
}

async function appP12Edit(fixture: AssemblyHallFixture, ratio: number, index = 0) {
  const selected = await appP6Select(fixture, index);
  const apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
  try {
    fireEvent.change(selected.field, { target: { value: String(Math.max(0.23, selected.baseWidth * ratio)) } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledTimes(1);
    return await appP12Accepted(apply.mock.results[0].value);
  } finally { apply.mockRestore(); }
}

describe("R3.P12 accepted window width history", () => {
  it("undoes and redoes multiple accepted widths without selection while retaining geometry, materials and monotonic authority", async () => {
    const context = await appP6Workspace("r3-p12-history");
    const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride");
    const redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      const originalIr = appP11Shape(context.fixture.ir), material = appP11Shape(context.fixture.packedAtlas);
      const originalSource = context.fixture.sourceSnapshot!;
      const selected = await appP6Select(context.fixture);
      const nativeUndo = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
      expect(selected.field.dispatchEvent(nativeUndo)).toBe(true);
      expect(nativeUndo.defaultPrevented).toBe(false);
      expect(undo).not.toHaveBeenCalled(); expect(redo).not.toHaveBeenCalled();
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      const first = await appP12Edit(context.fixture, 0.6);
      const firstIr = appP11Shape(first.ir), firstGallery = appP11Shape(first.componentGallery);
      const second = await appP12Edit(first, 0.8);
      const secondIr = appP11Shape(second.ir), secondGallery = appP11Shape(second.componentGallery);
      const revisions = [originalSource.document.revision, first.sourceSnapshot!.document.revision, second.sourceSnapshot!.document.revision];
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 2, redoCount: 0, canUndo: true, canRedo: false });
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: "" } });
      expect(screen.getByLabelText("Window width (m)")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Undo width" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      expect(undo.mock.calls[0][0]).toEqual({ expectedSourceContentHash: second.sourceSnapshot!.sourceContentHash, expectedRevision: second.sourceSnapshot!.document.revision });
      const backOne = await appP12Accepted(undo.mock.results[0].value);
      revisions.push(backOne.sourceSnapshot!.document.revision);
      expect(backOne.sourceSnapshot).toEqual(p3AppSourceCodec.withBuildingSourceRevision(first.sourceSnapshot!, backOne.sourceSnapshot!.document.revision));
      expect(appP11Shape(backOne.ir)).toStrictEqual(firstIr);
      expect(appP11Shape(backOne.componentGallery)).toStrictEqual(firstGallery);
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const backBase = await appP12Accepted(undo.mock.results[1].value);
      revisions.push(backBase.sourceSnapshot!.document.revision);
      expect(backBase.sourceSnapshot).toMatchObject({ schemaVersion: "0.4.0", windowWidthOverrides: [] });
      expect(appP11Shape(backBase.ir)).toStrictEqual(originalIr);
      expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo width" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const forwardOne = await appP12Accepted(redo.mock.results[0].value);
      revisions.push(forwardOne.sourceSnapshot!.document.revision);
      expect(appP11Shape(forwardOne.ir)).toStrictEqual(firstIr);
      expect(forwardOne.sourceSnapshot).toEqual(p3AppSourceCodec.withBuildingSourceRevision(first.sourceSnapshot!, forwardOne.sourceSnapshot!.document.revision));
      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const forwardTwo = await appP12Accepted(redo.mock.results[1].value);
      revisions.push(forwardTwo.sourceSnapshot!.document.revision);
      expect(appP11Shape(forwardTwo.ir)).toStrictEqual(secondIr);
      expect(appP11Shape(forwardTwo.componentGallery)).toStrictEqual(secondGallery);
      expect(forwardTwo.sourceSnapshot).toEqual(p3AppSourceCodec.withBuildingSourceRevision(second.sourceSnapshot!, forwardTwo.sourceSnapshot!.document.revision));

      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const branchBase = await appP12Accepted(undo.mock.results[2].value);
      revisions.push(branchBase.sourceSnapshot!.document.revision);
      const same = await appP6Select(branchBase);
      const beforeNoop = context.controller.getWindowWidthHistoryState();
      expect(Number(same.field.value)).toBe(first.sourceSnapshot!.schemaVersion === "0.4.0" ? first.sourceSnapshot!.windowWidthOverrides[0].widthM : Number.NaN);
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(context.controller.getWindowWidthHistoryState()).toEqual(beforeNoop);
      expect(screen.getByRole("button", { name: "Redo width" })).toBeEnabled();
      const branch = await appP12Edit(branchBase, 0.7, 1);
      revisions.push(branch.sourceSnapshot!.document.revision);
      expect(context.controller.getWindowWidthHistoryState().redoCount).toBe(0);
      expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
      for (let index = 1; index < revisions.length; index++) expect(revisions[index]).toBeGreaterThan(revisions[index - 1]);
      for (const fixture of [first, second, backOne, backBase, forwardOne, forwardTwo, branchBase, branch]) {
        expect(fixture.packedAtlas).toBe(context.fixture.packedAtlas);
        expect(fixture.debugExport).toBe(context.fixture.debugExport);
        expect(fixture.catalog).toBe(context.fixture.catalog);
        expect(appP11Shape(fixture.packedAtlas)).toStrictEqual(material);
      }
      const saved = await appP3SourceDownload();
      expect(saved.file.source).toEqual(branch.sourceSnapshot);
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      await act(async () => { await context.controller.drainSourceCheckpoints(); });
    } finally { context.cleanup(); undo.mockRestore(); redo.mockRestore(); generate.mockRestore(); interpret.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 50_000);

  it("serializes history preflight and ignores canceled, dirty, foreign or unmounted completions", async () => {
    const foreign = await appP3PortableSource("r3-p12-history-foreign", "tall-rectangular");
    const module = await import("../features/building-family/ui/assemblyHallFixture"), originalSplit = module.buildAssemblyHallSourceWindowSplit;
    for (const action of ["cancel", "dirty", "foreign", "unmount"] as const) {
      const context = await appP6Workspace("r3-p12-history-late-" + action);
      const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride"), redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
      const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>(), opened = appIntentDeferred<void>();
      const originalOpen = BuildingRunController.prototype.openSourceFile;
      const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile").mockImplementation(function (this: BuildingRunController, input) { opened.resolve(); return originalOpen.call(this, input); });
      let restoreHeld: (() => void) | undefined;
      try {
        const edited = await appP12Edit(context.fixture, 0.6);
        await act(async () => { await context.controller.drainSourceCheckpoints(); });
        fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: "" } });
        const saved = await context.controller.exportSourceFile(), history = context.controller.getWindowWidthHistoryState();
        const held = vi.spyOn(module, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
          const value = await originalSplit(input); ready.resolve(); await release.promise; return value;
        });
        restoreHeld = () => held.mockRestore();
        fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
        await ready.promise;
        expect(screen.getByText("Undoing window width…")).toBeInTheDocument();
        expect(screen.getByLabelText("Workspace run status")).toHaveTextContent("Building ready");
        expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
        fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
        expect(undo).toHaveBeenCalledTimes(1); expect(redo).not.toHaveBeenCalled();
        const floors = Number((screen.getByLabelText("Floors") as HTMLInputElement).value);
        if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
        else if (action === "dirty") fireEvent.change(screen.getByLabelText("Floors"), { target: { value: String(floors + 1) } });
        else if (action === "foreign") fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => foreign.saved.contents)] } });
        else context.view.unmount();
        await act(async () => { release.resolve(); expect((await undo.mock.results[0].value).stale).toBe(true); });
        expect(edited.sourceSnapshot!.sourceContentHash).toBe(JSON.parse(saved.contents).source.sourceContentHash);
        if (action === "cancel" || action === "dirty") {
          expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
          expect(context.controller.getWindowWidthHistoryState()).toEqual(history);
          expect(screen.queryByText("Undoing window width…")).not.toBeInTheDocument();
          if (action === "dirty") {
            expect(screen.getByLabelText("Floors")).toHaveValue(floors + 1);
            expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
          } else expect(screen.getByRole("button", { name: "Undo width" })).toBeEnabled();
        } else if (action === "foreign") {
          await act(async () => { await opened.promise; expect((await open.mock.results[0].value).stale).toBe(false); });
          expect(window.location.hash).toBe("#document=" + foreign.saved.documentId + "&room=assemblyHall");
          expect((await appP3SourceDownload()).file).toEqual(foreign.file);
          expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
          expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
        } else {
          await context.controller.drainSourceCheckpoints();
          await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
          expect(screen.queryByLabelText("Assembly Hall Three.js canvas")).not.toBeInTheDocument();
        }
      } finally {
        release.resolve(); restoreHeld?.(); context.cleanup(); await context.controller.drainSourceCheckpoints();
        undo.mockRestore(); redo.mockRestore(); open.mockRestore();
        await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      }
    }
  }, 60_000);

  it("reports history checkpoint acknowledgement and save failure without rolling back accepted edits", async () => {
    const module = await import("../features/building-family/state/buildingSourceCheckpoint"), original = module.createBuildingSourceCheckpointPersistence;
    let mode: "pass" | "hold" | "fail" = "pass";
    const entered = appIntentDeferred<void>(), release = appIntentDeferred<void>(), failure = new Error("p12 checkpoint put failed");
    const factory = vi.spyOn(module, "createBuildingSourceCheckpointPersistence").mockImplementation(() => {
      const actual = original(); return { ...actual, put: async record => {
        if (mode === "hold") { entered.resolve(); await release.promise; }
        if (mode === "fail") throw failure;
        return actual.put(record);
      } };
    });
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride"), redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
    try {
      context = await appP6Workspace("r3-p12-history-save");
      const edited = await appP12Edit(context.fixture, 0.6);
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      const durableBefore = await original().get("r3-p12-history-save");
      mode = "hold";
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const undone = await appP12Accepted(undo.mock.results[0].value);
      await act(async () => { await entered.promise; });
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "pending");
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-run-id", (await undo.mock.results[0].value).runId);
      expect((await appP3SourceDownload()).file.source).toEqual(undone.sourceSnapshot);
      expect(await original().get("r3-p12-history-save")).toEqual(durableBefore);
      await act(async () => { mode = "pass"; release.resolve(); await context!.controller.drainSourceCheckpoints(); });
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved");
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-source-content-hash", undone.sourceSnapshot!.sourceContentHash);
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-revision", String(undone.sourceSnapshot!.document.revision));
      const durableUndo = await original().get("r3-p12-history-save");
      mode = "fail";
      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const redone = await appP12Accepted(redo.mock.results[0].value);
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "failed");
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveTextContent("Automatic source saving failed");
      expect(redone.sourceSnapshot).toEqual(p3AppSourceCodec.withBuildingSourceRevision(edited.sourceSnapshot!, redone.sourceSnapshot!.document.revision));
      expect((await appP3SourceDownload()).file.source).toEqual(redone.sourceSnapshot);
      expect(context.controller.getWindowWidthHistoryState()).toMatchObject({ canUndo: true, canRedo: false });
      expect(await original().get("r3-p12-history-save")).toEqual(durableUndo);
    } finally {
      mode = "pass"; release.resolve(); context?.cleanup(); await context?.controller.drainSourceCheckpoints();
      undo.mockRestore(); redo.mockRestore(); factory.mockRestore();
    }
  }, 40_000);

  it("resets availability at explicit Open and foreign/source-unavailable boundaries", async () => {
    const foreign = await appP3PortableSource("r3-p12-history-boundary-foreign", "tall-rectangular");
    const context = await appP6Workspace("r3-p12-history-boundary");
    const originalOpen = BuildingRunController.prototype.openSourceFile;
    let entered = appIntentDeferred<void>();
    const open = vi.spyOn(BuildingRunController.prototype, "openSourceFile").mockImplementation(function (this: BuildingRunController, input) { entered.resolve(); return originalOpen.call(this, input); });
    try {
      expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
      expect(screen.getByText("No window width changes to undo or redo.")).toBeInTheDocument();
      await appP12Edit(context.fixture, 0.6);
      expect(screen.getByRole("button", { name: "Undo width" })).toBeEnabled();
      const saved = await context.controller.exportSourceFile();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => saved.contents)] } });
      await act(async () => { await entered.promise; expect((await open.mock.results[0].value).stale).toBe(false); });
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect((await appP3SourceDownload()).file).toEqual(JSON.parse(saved.contents));
      expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
      entered = appIntentDeferred<void>();
      fireEvent.change(screen.getByLabelText("Open Source File"), { target: { files: [appIntentFile(async () => foreign.saved.contents)] } });
      let imported!: AssemblyHallFixture;
      await act(async () => {
        await entered.promise; const result = await open.mock.results[1].value;
        expect(result.stale).toBe(false); imported = result.fixture!;
      });
      const current = open.mock.contexts[1] as BuildingRunController;
      expect(window.location.hash).toBe("#document=" + foreign.saved.documentId + "&room=assemblyHall");
      expect(current.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      const packet = await createCompletedFamilyPersistencePacket({ documentId: foreign.saved.documentId, runId: "r3-p12-unavailable", requestHash: "r3-p12-unavailable-request", fixture: imported });
      await act(async () => { expect((await current.restoreCompletedFamilyPacket(packet)).stale).toBe(false); });
      expect(screen.getByText("Open a portable source file to edit window widths.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
      await act(async () => { await current.drainSourceCheckpoints(); });
    } finally { context.cleanup(); await context.controller.drainSourceCheckpoints(); open.mockRestore(); }
  }, 40_000);
});


async function appP15Seed(documentId: string) {
  const codec = await import("../features/building-family/state/buildingSourceFile");
  const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
  const target = await import("../features/building-family/compiler/facadeSplitPlan");
  const legacy = await appP11Seed(documentId), parsed = await codec.parseBuildingSourceFile(legacy.file);
  const owned: AssemblyHallFixture[] = [];
  try {
    const base = await fixtureModule.createAssemblyHallFixture({ sourceSnapshot: parsed.sourceSnapshot,
      promptControls: parsed.sourceSnapshot.controlsView,
      reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport } });
    owned.push(base);
    const paths = appP6Paths(base), split = await fixtureModule.buildAssemblyHallSourceWindowSplit({
      sourceSnapshot: base.sourceSnapshot, catalog: base.catalog
    });
    const openings = paths.slice(0, 2).map(path => target.resolveWindowOpeningFromSlotAddress(split,
      target.resolveWindowSlotAddressFromSemanticPath(split, path)));
    const widths = openings.map(opening => ({ schemaVersion: "0.1.0" as const, address: {
      schemaVersion: "0.1.0" as const, facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex
    }, widthM: Math.max(0.23, Math.min(0.6, opening.sizeM[0] * 0.6)) }));
    const source = await codec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: parsed.sourceSnapshot,
      windowWidthBatch: { schemaVersion: "0.1.0", directives: [...widths].reverse() } });
    const file = await codec.createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    const explicit = await codec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: source,
      windowWidthBatch: { schemaVersion: "0.1.0", directives: [widths[0], { ...widths[1], widthM: openings[1].sizeM[0] }] } });
    const explicitFile = await codec.createBuildingSourceFile({ sourceSnapshot: explicit, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    const expected = await fixtureModule.createAssemblyHallFixture({ sourceSnapshot: source, promptControls: source.controlsView,
      reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport } });
    owned.push(expected);
    return { file, explicitFile, widths, bases: openings.map(opening => opening.sizeM[0]),
      expected: { ir: appP11Shape(expected.ir), gallery: appP11Shape(expected.componentGallery), atlas: appP11Shape(expected.packedAtlas),
        debug: appP11Shape(expected.debugExport), inputs: appP11Shape({ spec: expected.spec, catalog: expected.catalog,
          graph: expected.graph, fidelityMode: expected.fidelityMode }) } };
  } finally { for (const fixture of owned.reverse()) fixture.familyRuntime.dispose(); }
}
function appP15List(fixture: AssemblyHallFixture) {
  if (fixture.sourceSnapshot?.schemaVersion !== "0.5.0") throw new Error("Expected accepted v5 inspector source");
  return fixture.sourceSnapshot.windowWidthBatch.directives;
}

describe("R3.P15 complete batch selected inspector and recovery", () => {
  const documentId = "r3-p15-app-batch";
  let seed: Awaited<ReturnType<typeof appP15Seed>>;
  beforeAll(async () => { seed = await appP15Seed(documentId); }, 60_000);

  it("reads and edits the second member, restores only that target and replays full-set history without the v4 replacement warning", async () => {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    await checkpoint.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    const apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride"), redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
    try {
      context = await appP6Workspace(documentId);
      expect(context.fixture.sourceSnapshot).toEqual(seed.file.source);
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(seed.expected.ir);
      expect(appP11Shape(context.fixture.componentGallery)).toStrictEqual(seed.expected.gallery);
      expect(appP11Shape({ spec: context.fixture.spec, catalog: context.fixture.catalog, graph: context.fixture.graph,
        fidelityMode: context.fixture.fidelityMode })).toStrictEqual(seed.expected.inputs);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      await appP6Select(context.fixture, 2);
      expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled();
      expect(screen.queryByText("Applying here replaces the width edit on the other window.")).not.toBeInTheDocument();
      const selected = await appP6Select(context.fixture, 1);
      expect(selected.field).toHaveValue(seed.widths[1].widthM);
      expect(screen.getByRole("button", { name: "Restore original" })).toBeEnabled();
      const widthM = (seed.bases[1] + seed.widths[1].widthM) / 2;
      fireEvent.change(selected.field, { target: { value: String(widthM) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(apply).toHaveBeenCalledTimes(1);
      const changed = await appP12Accepted(apply.mock.results[0].value);
      expect(apply.mock.calls[0][0]).toMatchObject({ directive: { address: seed.widths[1].address } });
      expect(appP15List(changed)).toEqual([seed.widths[0], { ...seed.widths[1], widthM }]);
      await waitFor(() => expect(screen.getByRole("button", { name: "Restore original" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Restore original" }));
      const removed = await appP12Accepted(apply.mock.results[1].value);
      expect(appP15List(removed)).toEqual([seed.widths[0]]);
      await waitFor(() => expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled());
      await waitFor(() => expect(screen.getByLabelText("Window width (m)")).toHaveValue(seed.bases[1]));
      expect(screen.queryByText("Applying here replaces the width edit on the other window.")).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const restored = await appP12Accepted(undo.mock.results[0].value);
      expect(appP15List(restored)).toEqual(appP15List(changed));
      expect(appP11Shape(restored.ir)).toStrictEqual(appP11Shape(changed.ir));
      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const redone = await appP12Accepted(redo.mock.results[0].value);
      expect(appP15List(redone)).toEqual([seed.widths[0]]);
      expect(appP11Shape(redone.ir)).toStrictEqual(appP11Shape(removed.ir));
      const revisions = [context.fixture, changed, removed, restored, redone].map(fixture => fixture.sourceSnapshot!.document.revision);
      expect(revisions).toEqual(Array.from({ length: revisions.length }, (_, index) => revisions[0] + index));
      for (const fixture of [changed, removed, restored, redone]) {
        expect(fixture.packedAtlas).toBe(context.fixture.packedAtlas); expect(fixture.debugExport).toBe(context.fixture.debugExport);
        expect(appP11Shape(fixture.packedAtlas)).toStrictEqual(seed.expected.atlas);
        expect(appP11Shape(fixture.debugExport)).toStrictEqual(seed.expected.debug);
      }
      const saved = await appP3SourceDownload();
      expect(saved.file.schemaVersion).toBe("0.5.0"); expect(saved.file.source).toEqual(redone.sourceSnapshot);
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      const record = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      if (record?.kind !== "source") throw new Error("Expected actual v5 App checkpoint");
      expect(record.sourceFile).toEqual(saved.file);
      expect(screen.getByLabelText("Source checkpoint save status")).toHaveAttribute("data-state", "saved");
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      expect(appDefaultIndexedDb.database.records.size).toBe(0);
    } finally {
      context?.cleanup(); await context?.controller.drainSourceCheckpoints();
      apply.mockRestore(); undo.mockRestore(); redo.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  }, 90_000);

  it("preserves explicit equal-base membership until selected Restore and automatically reopens the saved full source with cold history", async () => {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    await checkpoint.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.explicitFile));
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    const apply = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride"), undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      context = await appP6Workspace(documentId);
      const initial = context.fixture, selected = await appP6Select(initial, 1), beforeIr = appP11Shape(initial.ir);
      expect(appP15List(initial)).toEqual([seed.widths[0], { ...seed.widths[1], widthM: seed.bases[1] }]);
      expect(selected.field).toHaveValue(seed.bases[1]); expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Restore original" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Restore original" }));
      const removed = await appP12Accepted(apply.mock.results[0].value);
      expect(appP15List(removed)).toEqual([seed.widths[0]]);
      expect(appP11Shape(removed.ir)).toStrictEqual(beforeIr);
      expect(removed.sourceSnapshot!.sourceContentHash).not.toBe(initial.sourceSnapshot!.sourceContentHash);
      expect(removed.sourceSnapshot!.document.revision).toBe(initial.sourceSnapshot!.document.revision + 1);
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const restored = await appP12Accepted(undo.mock.results[0].value);
      expect(appP15List(restored)).toEqual(appP15List(initial));
      expect(appP11Shape(restored.ir)).toStrictEqual(beforeIr);
      expect(restored.sourceSnapshot!.document.revision).toBe(initial.sourceSnapshot!.document.revision + 2);
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      const saved = await appP3SourceDownload(), expectedIr = appP11Shape(restored.ir), expectedGallery = appP11Shape(restored.componentGallery);
      const record = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      if (record?.kind !== "source") throw new Error("Expected saved explicit-member v5 checkpoint");
      expect(record.sourceFile).toEqual(saved.file);
      const old = context; old.cleanup(); await old.controller.drainSourceCheckpoints(); context = undefined;
      await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      context = await appP6Workspace(documentId);
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "recovered-source"));
      expect(context.fixture.sourceSnapshot).toEqual(saved.file.source);
      expect(appP15List(context.fixture)).toEqual(appP15List(restored));
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(expectedIr);
      expect(appP11Shape(context.fixture.componentGallery)).toStrictEqual(expectedGallery);
      expect(appP11Shape(context.fixture.packedAtlas)).toStrictEqual(seed.expected.atlas);
      expect(appP11Shape(context.fixture.debugExport)).toStrictEqual(seed.expected.debug);
      expect((await appP3SourceDownload()).file).toEqual(saved.file);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect(screen.getByRole("button", { name: "Undo width" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo width" })).toBeDisabled();
      await appP6Select(context.fixture, 1);
      expect(screen.getByRole("button", { name: "Restore original" })).toBeEnabled();
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally {
      context?.cleanup(); await context?.controller.drainSourceCheckpoints();
      apply.mockRestore(); undo.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  }, 90_000);
});

async function appP16Seed(documentId: string) {
  const codec = await import("../features/building-family/state/buildingSourceFile");
  const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
  const target = await import("../features/building-family/compiler/facadeSplitPlan");
  const legacy = await appP15Seed(documentId), parsed = await codec.parseBuildingSourceFile(legacy.file);
  const base = await createAssemblyHallFixture({
    sourceSnapshot: parsed.sourceSnapshot, promptControls: parsed.sourceSnapshot.controlsView,
    reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport }
  });
  try {
    const split = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: base.sourceSnapshot, catalog: base.catalog });
    const windows = appP6Paths(base).map(semanticPath => {
      const address = target.resolveWindowSlotAddressFromSemanticPath(split, semanticPath);
      const opening = target.resolveWindowOpeningFromSlotAddress(split, address);
      return { semanticPath, address, baseWidth: opening.sizeM[0] };
    });
    const first = windows.find(window => window.address.facade === "front" && window.address.floorIndex > 0 &&
      windows.filter(other => other.address.facade === window.address.facade && other.address.floorIndex === window.address.floorIndex).length >= 3);
    if (!first) throw new Error("Expected an actual facade floor with at least three windows");
    const row = windows.filter(window => window.address.facade === first.address.facade && window.address.floorIndex === first.address.floorIndex);
    const otherFloor = windows.find(window => window.address.facade === first.address.facade && window.address.floorIndex !== first.address.floorIndex);
    const otherFacade = windows.find(window => window.address.facade !== first.address.facade);
    if (!otherFloor || !otherFacade) throw new Error("Expected actual outside-floor and outside-facade windows");
    const widthM = Math.max(0.23, Math.min(...row.map(window => window.baseWidth)) * 0.45);
    const siblingWidth = Math.min(row[1].baseWidth, widthM + 0.07);
    expect(siblingWidth).toBeGreaterThan(widthM);
    const directive = (window: (typeof windows)[number], width: number) => ({ schemaVersion: "0.1.0" as const, address: window.address, widthM: width });
    const outside = [directive(otherFloor, Math.max(0.23, otherFloor.baseWidth * 0.7)),
      directive(otherFacade, Math.max(0.23, otherFacade.baseWidth * 0.8))];
    const directives = [directive(first, widthM), directive(row[1], siblingWidth), ...outside];
    const source = await codec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: parsed.sourceSnapshot,
      windowWidthBatch: { schemaVersion: "0.1.0", directives } });
    const file = await codec.createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    return { file, row, first, widthM, outside, directives };
  } finally { base.familyRuntime.dispose(); }
}

function appP16List(fixture: AssemblyHallFixture) {
  return appP15List(fixture).map(directive => JSON.stringify(directive)).sort();
}
function appP16WindowMatrices(fixture: AssemblyHallFixture) {
  const receipts = new Map<string, number[]>();
  for (const entry of fixture.ir.semanticIndex) {
    if (entry.batchId !== "instances.window" && entry.batchId !== "instances.window.glass") continue;
    const batch = fixture.ir.instanceBatches.find(value => value.batchId === entry.batchId);
    if (!batch?.transforms || entry.elementIndex === undefined) throw new Error("Expected actual indexed frame/glass transforms");
    receipts.set(entry.semanticPath, Array.from(batch.transforms.subarray(entry.elementIndex * 16, (entry.elementIndex + 1) * 16)));
  }
  return receipts;
}
async function appP16Select(fixture: AssemblyHallFixture, semanticPath: string, widthM: number) {
  const selector = screen.getByRole("combobox", { name: "Semantic element" });
  const field = screen.getByLabelText("Window width (m)") as HTMLInputElement;
  fireEvent.change(selector, { target: { value: "" } });
  await waitFor(() => expect(field).toBeDisabled());
  fireEvent.change(selector, { target: { value: semanticPath } });
  await waitFor(() => { expect(field).toBeEnabled(); expect(field).toHaveValue(widthM); }, { timeout: 10000 });
  expect(appP6Paths(fixture)).toContain(semanticPath);
  return field;
}

describe("R3.P16 App apply width to one facade floor", () => {
  const documentId = "r3-p16-app-floor";
  let seed: Awaited<ReturnType<typeof appP16Seed>>;
  beforeAll(async () => { seed = await appP16Seed(documentId); }, 30000);

  async function workspace() {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    await checkpoint.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    return appP6Workspace(documentId);
  }

  it("applies an equal selected width to differing siblings only, then saves and recovers the full floor history result", async () => {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const floor = vi.spyOn(BuildingRunController.prototype, "applyWindowFloorWidthOverride");
    const selected = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride");
    const redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    try {
      context = await workspace();
      const initial = context.fixture, source = initial.sourceSnapshot!;
      const beforeMatrices = appP16WindowMatrices(initial), atlas = appP11Shape(initial.packedAtlas), debug = appP11Shape(initial.debugExport);
      await appP16Select(initial, seed.first.semanticPath, seed.widthM);
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      const button = screen.getByRole("button", { name: "Apply to floor" });
      expect(button).toHaveAttribute("type", "button"); expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(floor).toHaveBeenCalledTimes(1); expect(selected).not.toHaveBeenCalled();
      const changed = await appP12Accepted(floor.mock.results[0].value);
      expect(floor.mock.calls[0][0]).toEqual({
        expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision,
        directive: { schemaVersion: "0.1.0", facade: seed.first.address.facade, floorIndex: seed.first.address.floorIndex, widthM: seed.widthM }
      });
      const expected = [...seed.outside, ...seed.row.map(window => ({ schemaVersion: "0.1.0" as const, address: window.address, widthM: seed.widthM }))];
      expect(appP16List(changed)).toEqual(expected.map(value => JSON.stringify(value)).sort());
      expect(changed.sourceSnapshot!.document.revision).toBe(source.document.revision + 1);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
      const afterMatrices = appP16WindowMatrices(changed), rowPaths = new Set(seed.row.flatMap(window => [window.semanticPath, window.semanticPath + "/glass"]));
      for (const [path, matrix] of beforeMatrices) if (!rowPaths.has(path)) expect(afterMatrices.get(path)).toEqual(matrix);
      const changedFrames = seed.row.filter(window => JSON.stringify(afterMatrices.get(window.semanticPath)) !== JSON.stringify(beforeMatrices.get(window.semanticPath)));
      const changedGlass = seed.row.filter(window => JSON.stringify(afterMatrices.get(window.semanticPath + "/glass")) !== JSON.stringify(beforeMatrices.get(window.semanticPath + "/glass")));
      expect(changedFrames.length).toBeGreaterThanOrEqual(2); expect(changedGlass.length).toBeGreaterThanOrEqual(2);
      for (const path of rowPaths) expect(afterMatrices.has(path)).toBe(true);
      await appP16Select(changed, seed.first.semanticPath, seed.widthM);
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" }));
      expect(floor).toHaveBeenCalledTimes(2);
      const noop = await appP12Accepted(floor.mock.results[1].value);
      expect(noop).toBe(changed);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const undone = await appP12Accepted(undo.mock.results[0].value);
      expect(appP16List(undone)).toEqual(appP16List(initial));
      expect(appP11Shape(undone.ir)).toStrictEqual(appP11Shape(initial.ir));
      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const redone = await appP12Accepted(redo.mock.results[0].value);
      expect(appP16List(redone)).toEqual(appP16List(changed));
      expect(appP11Shape(redone.ir)).toStrictEqual(appP11Shape(changed.ir));
      for (const fixture of [changed, undone, redone]) {
        expect(fixture.packedAtlas).toBe(initial.packedAtlas); expect(fixture.debugExport).toBe(initial.debugExport);
        expect(appP11Shape(fixture.packedAtlas)).toStrictEqual(atlas); expect(appP11Shape(fixture.debugExport)).toStrictEqual(debug);
      }
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      const saved = await appP3SourceDownload(), savedIr = appP11Shape(redone.ir), savedGallery = appP11Shape(redone.componentGallery);
      expect(saved.file.source).toEqual(redone.sourceSnapshot);
      const record = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      if (record?.kind !== "source") throw new Error("Expected actual floor source checkpoint");
      expect(record.sourceFile).toEqual(saved.file);
      const old = context; old.cleanup(); await old.controller.drainSourceCheckpoints(); context = undefined;
      await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      context = await appP6Workspace(documentId);
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "recovered-source"));
      expect(context.fixture.sourceSnapshot).toEqual(saved.file.source);
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(savedIr); expect(appP11Shape(context.fixture.componentGallery)).toStrictEqual(savedGallery);
      expect(appP11Shape(context.fixture.packedAtlas)).toStrictEqual(atlas); expect(appP11Shape(context.fixture.debugExport)).toStrictEqual(debug);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally {
      context?.cleanup(); await context?.controller.drainSourceCheckpoints();
      floor.mockRestore(); selected.mockRestore(); undo.mockRestore(); redo.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  }, 30000);

  it.each(["cancel", "dirty"] as const)("locks duplicate floor/selected actions and discards pending work after %s", async (action) => {
    const context = await workspace(), floor = vi.spyOn(BuildingRunController.prototype, "applyWindowFloorWidthOverride");
    const selected = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture"), realSplit = fixtureModule.buildAssemblyHallSourceWindowSplit;
    const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    let restoreHeld: (() => void) | undefined;
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      const saved = await context.controller.exportSourceFile(), source = context.fixture.sourceSnapshot!;
      const held = vi.spyOn(fixtureModule, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
        const split = await realSplit(input); ready.resolve(); await release.promise; return split;
      });
      restoreHeld = () => held.mockRestore();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.row.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" }));
      await ready.promise;
      expect(field).toBeDisabled(); expect(screen.getByRole("button", { name: "Apply to floor" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" })); fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(floor).toHaveBeenCalledTimes(1); expect(selected).not.toHaveBeenCalled();
      expect(floor.mock.calls[0][0]).toMatchObject({ expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision });
      if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
      else {
        const floors = screen.getByLabelText("Floors") as HTMLInputElement;
        fireEvent.change(floors, { target: { value: String(Number(floors.value) + 1) } });
      }
      await act(async () => { release.resolve(); expect((await floor.mock.results[0].value).stale).toBe(true); });
      expect(context.fixtures).toHaveLength(1);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument();
      if (action === "dirty") expect(screen.getByRole("button", { name: "Apply to floor" })).toBeDisabled();
    } finally { release.resolve(); restoreHeld?.(); context.cleanup(); floor.mockRestore(); selected.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);

  it("does not let a held floor command overwrite or report against a newer accepted source", async () => {
    const context = await workspace(), floor = vi.spyOn(BuildingRunController.prototype, "applyWindowFloorWidthOverride");
    const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture"), realSplit = fixtureModule.buildAssemblyHallSourceWindowSplit;
    const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    let restoreHeld: (() => void) | undefined;
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      const held = vi.spyOn(fixtureModule, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
        const split = await realSplit(input); ready.resolve(); await release.promise; return split;
      });
      restoreHeld = () => held.mockRestore();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.row.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" })); await ready.promise;
      const newerWidth = (seed.widthM + seed.first.baseWidth) / 2, source = context.fixture.sourceSnapshot!;
      const newer = await appP12Accepted(context.controller.applyWindowWidthOverride({
        expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision,
        directive: { schemaVersion: "0.1.0", address: seed.first.address, widthM: newerWidth }
      }));
      const saved = await context.controller.exportSourceFile();
      await act(async () => { release.resolve(); expect((await floor.mock.results[0].value).stale).toBe(true); });
      await appP16Select(newer, seed.first.semanticPath, newerWidth);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument();
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(appP15List(newer).find(value => value.address.facade === seed.row[1].address.facade &&
        value.address.floorIndex === seed.row[1].address.floorIndex && value.address.bayIndex === seed.row[1].address.bayIndex)?.widthM).toBe(seed.directives[1].widthM);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    } finally { release.resolve(); restoreHeld?.(); context.cleanup(); floor.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);

  it("shows a typed atomic floor rejection without changing source, geometry, history or checkpoint", async () => {
    const context = await workspace();
    const { BuildingWindowWidthOverrideError } = await import("../features/building-family/compiler/facadeSplitPlan");
    const failure = new BuildingWindowWidthOverrideError("building.windowWidth.unsupportedWidth", "Another window on this floor is narrower than the requested width.");
    // Fault injection covers the App error boundary; kernel/controller tests cover the actual late invalid member.
    const floor = vi.spyOn(BuildingRunController.prototype, "applyWindowFloorWidthOverride").mockRejectedValueOnce(failure);
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      await act(async () => { await context.controller.drainSourceCheckpoints(); });
      const saved = await context.controller.exportSourceFile(), before = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      const ir = appP11Shape(context.fixture.ir), history = context.controller.getWindowWidthHistoryState();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.row.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" }));
      expect(floor).toHaveBeenCalledTimes(1);
      await act(async () => { await expect(floor.mock.results[0].value).rejects.toBe(failure); });
      expect(await screen.findByRole("alert")).toHaveTextContent(failure.message);
      expect(screen.getByRole("button", { name: "Apply to floor" })).toBeEnabled();
      expect(context.fixtures).toHaveLength(1);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(ir);
      expect(context.controller.getWindowWidthHistoryState()).toEqual(history);
      expect(await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId)).toEqual(before);
    } finally { context.cleanup(); floor.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);
});

async function appP18Seed(documentId: string) {
  const codec = await import("../features/building-family/state/buildingSourceFile");
  const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture");
  const target = await import("../features/building-family/compiler/facadeSplitPlan");
  const legacy = await appP15Seed(documentId), parsed = await codec.parseBuildingSourceFile(legacy.file);
  const base = await createAssemblyHallFixture({
    sourceSnapshot: parsed.sourceSnapshot, promptControls: parsed.sourceSnapshot.controlsView,
    reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport }
  });
  try {
    const split = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: base.sourceSnapshot, catalog: base.catalog });
    const windows = appP6Paths(base).map(semanticPath => {
      const address = target.resolveWindowSlotAddressFromSemanticPath(split, semanticPath);
      const opening = target.resolveWindowOpeningFromSlotAddress(split, address);
      return { semanticPath, address, baseWidth: opening.sizeM[0] };
    });
    const first = windows.find(window => window.address.facade === "front" && window.address.floorIndex === 0 &&
      windows.filter(other => other.address.facade === window.address.facade && other.address.bayIndex === window.address.bayIndex).length >= 3);
    if (!first) throw new Error("Expected an actual facade bay with at least three windows");
    const stack = windows.filter(window => window.address.facade === first.address.facade && window.address.bayIndex === first.address.bayIndex).sort((a, b) => a.address.floorIndex - b.address.floorIndex);
    const otherBay = windows.find(window => window.address.facade === first.address.facade && window.address.bayIndex !== first.address.bayIndex);
    const otherFacade = windows.find(window => window.address.facade !== first.address.facade);
    if (!otherBay || !otherFacade) throw new Error("Expected actual outside-bay and outside-facade windows");
    const widthM = Math.max(0.23, Math.min(...stack.map(window => window.baseWidth)) * 0.45);
    const siblingWidth = Math.min(stack[1].baseWidth, widthM + 0.07);
    expect(siblingWidth).toBeGreaterThan(widthM);
    const directive = (window: (typeof windows)[number], width: number) => ({ schemaVersion: "0.1.0" as const, address: window.address, widthM: width });
    const outside = [directive(otherBay, Math.max(0.23, otherBay.baseWidth * 0.7)),
      directive(otherFacade, Math.max(0.23, otherFacade.baseWidth * 0.8))];
    const directives = [directive(first, widthM), directive(stack[1], siblingWidth), ...outside];
    const source = await codec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: parsed.sourceSnapshot,
      windowWidthBatch: { schemaVersion: "0.1.0", directives } });
    const file = await codec.createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport });
    return { file, stack, first, widthM, outside, directives };
  } finally { base.familyRuntime.dispose(); }
}

describe("R3.P18 App apply width to one facade bay", () => {
  const documentId = "r3-p18-app-bay";
  let seed: Awaited<ReturnType<typeof appP18Seed>>;
  beforeAll(async () => { seed = await appP18Seed(documentId); }, 30000);

  async function workspace() {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    await checkpoint.createBuildingSourceCheckpointPersistence().put(await appP11Checkpoint(seed.file));
    return appP6Workspace(documentId);
  }

  it("applies an equal selected width to differing siblings only, then saves and recovers the full bay history result", async () => {
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    const { ProceduralMaterialProvider } = await import("../features/building-family/materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../features/building-family/psg/localRulePromptInterpreter");
    const bay = vi.spyOn(BuildingRunController.prototype, "applyWindowBayWidthOverride");
    const selected = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const undo = vi.spyOn(BuildingRunController.prototype, "undoWindowWidthOverride");
    const redo = vi.spyOn(BuildingRunController.prototype, "redoWindowWidthOverride");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let context: Awaited<ReturnType<typeof appP6Workspace>> | undefined;
    try {
      context = await workspace();
      const initial = context.fixture, source = initial.sourceSnapshot!;
      const beforeMatrices = appP16WindowMatrices(initial), atlas = appP11Shape(initial.packedAtlas), debug = appP11Shape(initial.debugExport);
      await appP16Select(initial, seed.first.semanticPath, seed.widthM);
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      const button = screen.getByRole("button", { name: "Apply to bay" });
      expect(button).toHaveAttribute("type", "button"); expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(bay).toHaveBeenCalledTimes(1); expect(selected).not.toHaveBeenCalled();
      const changed = await appP12Accepted(bay.mock.results[0].value);
      expect(bay.mock.calls[0][0]).toEqual({
        expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision,
        directive: { schemaVersion: "0.1.0", facade: seed.first.address.facade, bayIndex: seed.first.address.bayIndex, widthM: seed.widthM }
      });
      const expected = [...seed.outside, ...seed.stack.map(window => ({ schemaVersion: "0.1.0" as const, address: window.address, widthM: seed.widthM }))];
      expect(appP16List(changed)).toEqual(expected.map(value => JSON.stringify(value)).sort());
      expect(changed.sourceSnapshot!.document.revision).toBe(source.document.revision + 1);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
      const afterMatrices = appP16WindowMatrices(changed), stackPaths = new Set(seed.stack.flatMap(window => [window.semanticPath, window.semanticPath + "/glass"]));
      for (const [path, matrix] of beforeMatrices) if (!stackPaths.has(path)) expect(afterMatrices.get(path)).toEqual(matrix);
      const changedFrames = seed.stack.filter(window => JSON.stringify(afterMatrices.get(window.semanticPath)) !== JSON.stringify(beforeMatrices.get(window.semanticPath)));
      const changedGlass = seed.stack.filter(window => JSON.stringify(afterMatrices.get(window.semanticPath + "/glass")) !== JSON.stringify(beforeMatrices.get(window.semanticPath + "/glass")));
      expect(changedFrames.length).toBeGreaterThanOrEqual(2); expect(changedGlass.length).toBeGreaterThanOrEqual(2);
      for (const path of stackPaths) expect(afterMatrices.has(path)).toBe(true);
      expect(new Set(changedFrames.map(window => window.address.floorIndex)).size).toBeGreaterThanOrEqual(2);
      expect(new Set(changedGlass.map(window => window.address.floorIndex)).size).toBeGreaterThanOrEqual(2);
      await appP16Select(changed, seed.first.semanticPath, seed.widthM);
      fireEvent.click(screen.getByRole("button", { name: "Apply to bay" }));
      expect(bay).toHaveBeenCalledTimes(2);
      const noop = await appP12Accepted(bay.mock.results[1].value);
      expect(noop).toBe(changed);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Undo width" }));
      const undone = await appP12Accepted(undo.mock.results[0].value);
      expect(appP16List(undone)).toEqual(appP16List(initial));
      expect(appP11Shape(undone.ir)).toStrictEqual(appP11Shape(initial.ir));
      fireEvent.click(screen.getByRole("button", { name: "Redo width" }));
      const redone = await appP12Accepted(redo.mock.results[0].value);
      expect(appP16List(redone)).toEqual(appP16List(changed));
      expect(appP11Shape(redone.ir)).toStrictEqual(appP11Shape(changed.ir));
      for (const fixture of [changed, undone, redone]) {
        expect(fixture.packedAtlas).toBe(initial.packedAtlas); expect(fixture.debugExport).toBe(initial.debugExport);
        expect(appP11Shape(fixture.packedAtlas)).toStrictEqual(atlas); expect(appP11Shape(fixture.debugExport)).toStrictEqual(debug);
      }
      await act(async () => { await context!.controller.drainSourceCheckpoints(); });
      const saved = await appP3SourceDownload(), savedIr = appP11Shape(redone.ir), savedGallery = appP11Shape(redone.componentGallery);
      expect(saved.file.source).toEqual(redone.sourceSnapshot);
      const record = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      if (record?.kind !== "source") throw new Error("Expected actual bay source checkpoint");
      expect(record.sourceFile).toEqual(saved.file);
      const old = context; old.cleanup(); await old.controller.drainSourceCheckpoints(); context = undefined;
      await waitFor(() => expect(appDefaultLocks.held.size).toBe(0));
      context = await appP6Workspace(documentId);
      await waitFor(() => expect(screen.getByLabelText("Source checkpoint recovery")).toHaveAttribute("data-state", "recovered-source"));
      expect(context.fixture.sourceSnapshot).toEqual(saved.file.source);
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(savedIr); expect(appP11Shape(context.fixture.componentGallery)).toStrictEqual(savedGallery);
      expect(appP11Shape(context.fixture.packedAtlas)).toStrictEqual(atlas); expect(appP11Shape(context.fixture.debugExport)).toStrictEqual(debug);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally {
      context?.cleanup(); await context?.controller.drainSourceCheckpoints();
      bay.mockRestore(); selected.mockRestore(); undo.mockRestore(); redo.mockRestore(); generate.mockRestore(); interpret.mockRestore();
    }
  }, 30000);

  it.each(["cancel", "dirty"] as const)("locks duplicate bay/selected actions and discards pending work after %s", async (action) => {
    const context = await workspace(), bay = vi.spyOn(BuildingRunController.prototype, "applyWindowBayWidthOverride");
    const selected = vi.spyOn(BuildingRunController.prototype, "applyWindowWidthOverride");
    const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture"), realSplit = fixtureModule.buildAssemblyHallSourceWindowSplit;
    const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    let restoreHeld: (() => void) | undefined;
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      const saved = await context.controller.exportSourceFile(), source = context.fixture.sourceSnapshot!;
      const held = vi.spyOn(fixtureModule, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
        const split = await realSplit(input); ready.resolve(); await release.promise; return split;
      });
      restoreHeld = () => held.mockRestore();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.stack.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to bay" }));
      await ready.promise;
      expect(field).toBeDisabled(); expect(screen.getByRole("button", { name: "Apply to bay" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Apply to floor" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply to floor" }));
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Restore original" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Apply to bay" })); fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(bay).toHaveBeenCalledTimes(1); expect(selected).not.toHaveBeenCalled();
      expect(bay.mock.calls[0][0]).toMatchObject({ expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision });
      if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel Run" }));
      else {
        const floors = screen.getByLabelText("Floors") as HTMLInputElement;
        fireEvent.change(floors, { target: { value: String(Number(floors.value) + 1) } });
      }
      await act(async () => { release.resolve(); expect((await bay.mock.results[0].value).stale).toBe(true); });
      expect(context.fixtures).toHaveLength(1);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 0, redoCount: 0, canUndo: false, canRedo: false });
      expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument();
      if (action === "dirty") expect(screen.getByRole("button", { name: "Apply to bay" })).toBeDisabled();
    } finally { release.resolve(); restoreHeld?.(); context.cleanup(); bay.mockRestore(); selected.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);

  it("does not let a held bay command overwrite or report against a newer accepted source", async () => {
    const context = await workspace(), bay = vi.spyOn(BuildingRunController.prototype, "applyWindowBayWidthOverride");
    const fixtureModule = await import("../features/building-family/ui/assemblyHallFixture"), realSplit = fixtureModule.buildAssemblyHallSourceWindowSplit;
    const ready = appIntentDeferred<void>(), release = appIntentDeferred<void>();
    let restoreHeld: (() => void) | undefined;
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      const held = vi.spyOn(fixtureModule, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
        const split = await realSplit(input); ready.resolve(); await release.promise; return split;
      });
      restoreHeld = () => held.mockRestore();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.stack.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to bay" })); await ready.promise;
      const newerWidth = (seed.widthM + seed.first.baseWidth) / 2, source = context.fixture.sourceSnapshot!;
      const newer = await appP12Accepted(context.controller.applyWindowWidthOverride({
        expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision,
        directive: { schemaVersion: "0.1.0", address: seed.first.address, widthM: newerWidth }
      }));
      const saved = await context.controller.exportSourceFile();
      await act(async () => { release.resolve(); expect((await bay.mock.results[0].value).stale).toBe(true); });
      await appP16Select(newer, seed.first.semanticPath, newerWidth);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("Applying window width…")).not.toBeInTheDocument();
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(appP15List(newer).find(value => value.address.facade === seed.stack[1].address.facade &&
        value.address.floorIndex === seed.stack[1].address.floorIndex && value.address.bayIndex === seed.stack[1].address.bayIndex)?.widthM).toBe(seed.directives[1].widthM);
      expect(context.controller.getWindowWidthHistoryState()).toEqual({ undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    } finally { release.resolve(); restoreHeld?.(); context.cleanup(); bay.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);

  it("shows a typed atomic bay rejection without changing source, geometry, history or checkpoint", async () => {
    const context = await workspace();
    const { BuildingWindowWidthOverrideError } = await import("../features/building-family/compiler/facadeSplitPlan");
    const failure = new BuildingWindowWidthOverrideError("building.windowWidth.unsupportedWidth", "Another window on this bay is narrower than the requested width.");
    // Fault injection covers the App error boundary; kernel/controller tests cover the actual late invalid member.
    const bay = vi.spyOn(BuildingRunController.prototype, "applyWindowBayWidthOverride").mockRejectedValueOnce(failure);
    const checkpoint = await import("../features/building-family/state/buildingSourceCheckpoint");
    try {
      const field = await appP16Select(context.fixture, seed.first.semanticPath, seed.widthM);
      await act(async () => { await context.controller.drainSourceCheckpoints(); });
      const saved = await context.controller.exportSourceFile(), before = await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId);
      const ir = appP11Shape(context.fixture.ir), history = context.controller.getWindowWidthHistoryState();
      fireEvent.change(field, { target: { value: String((seed.widthM + Math.min(...seed.stack.map(window => window.baseWidth))) / 2) } });
      fireEvent.click(screen.getByRole("button", { name: "Apply to bay" }));
      expect(bay).toHaveBeenCalledTimes(1);
      await act(async () => { await expect(bay.mock.results[0].value).rejects.toBe(failure); });
      expect(await screen.findByRole("alert")).toHaveTextContent(failure.message);
      expect(screen.getByRole("button", { name: "Apply to bay" })).toBeEnabled();
      expect(context.fixtures).toHaveLength(1);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(appP11Shape(context.fixture.ir)).toStrictEqual(ir);
      expect(context.controller.getWindowWidthHistoryState()).toEqual(history);
      expect(await checkpoint.createBuildingSourceCheckpointPersistence().get(documentId)).toEqual(before);
    } finally { context.cleanup(); bay.mockRestore(); await context.controller.drainSourceCheckpoints(); }
  }, 30000);
});
