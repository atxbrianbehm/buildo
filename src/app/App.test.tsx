import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";
import { latestMaterialSourceCacheHit } from "./runEventSelectors";
import { indexedDbArtifactCacheKey } from "../features/building-family/materials/indexedDbArtifactPersistence";
import { createCompletedFamilyExportBundle } from "../features/building-family/state/completedFamilyExportBundle";
import {
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket
} from "../features/building-family/state/completedFamilyPersistence";
import { defaultBuildingPromptControls } from "../features/building-family/state/buildingStore";
import { createAssemblyHallFixture } from "../features/building-family/ui/assemblyHallFixture";

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
  constructor(private readonly records: Map<string, unknown>) {}

  put(record: { key: string; entry: unknown }): FakeIdbRequest<string> {
    const request = new FakeIdbRequest<string>();
    this.records.set(record.key, structuredClone(record));
    request.succeed(record.key);
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

class FakeDatabase {
  readonly records = new Map<string, unknown>();
  readonly objectStoreNames = {
    contains: () => this.created
  };
  private created = false;

  createObjectStore(): FakeObjectStore {
    this.created = true;
    return new FakeObjectStore(this.records);
  }

  transaction(): { objectStore: () => FakeObjectStore } {
    this.created = true;
    return {
      objectStore: () => new FakeObjectStore(this.records)
    };
  }
}

class FakeOpenRequest extends FakeIdbRequest<FakeDatabase> {
  onupgradeneeded: (() => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly database = new FakeDatabase();

  open(): FakeOpenRequest {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      request.result = this.database;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

async function waitForInitialRun(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
}

function selectRoom(name: "Prompt Lab" | "Atlas Lab" | "Component Forge" | "Assembly Hall"): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders the Buildo launch shell as a four-room workflow", async () => {
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

    selectRoom("Assembly Hall");
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reveal through stage" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rendered generated building fixture" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent("Draw calls");
  });

  it("deep-links room selection through the URL hash and browser history", async () => {
    window.history.replaceState(null, "", "/#room=assemblyHall");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Assembly Hall" })).toHaveAttribute("aria-selected", "true")
    );
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
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources regenerate");

    fireEvent.change(screen.getByLabelText("Material Seed"), { target: { value: "material-seed-2" } });
    fireEvent.change(screen.getByLabelText("Trim Seed"), { target: { value: "trim-seed-2" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("materialSeed");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("trimSeed");

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
