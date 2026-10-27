import * as p3SourceCodec from "../state/buildingSourceFile";
import { vi } from "vitest";
import { hashCanonicalJson } from "../core/contentHash";
import type { AssemblyHallFixture, CreateAssemblyHallFixtureInput } from "../ui/assemblyHallFixture";
import type { MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { BuildingArtifactRegistry } from "../state/artifactRegistry";
import { BuildingRunController, type PreparedBuildingFixtureView } from "../state/buildingRunController";
import {
  COMPLETED_FAMILY_ARTIFACT_TYPE,
  type CompletedFamilyPersistenceCacheEntry,
  type CompletedFamilyPersistencePacket
} from "../state/completedFamilyPersistence";
import { defaultBuildingPromptControls, createBuildingStore } from "../state/buildingStore";

function fakeAssemblyFixture(
  label: string,
  options: {
    atlasId?: string;
    atlasContentHash?: string;
    catalogId?: string;
    familyId?: string;
    buildingId?: string;
    graphHash?: string;
  } = {}
): AssemblyHallFixture {
  const familyId = options.familyId ?? `${label}-family`;
  const atlasId = options.atlasId ?? `${label}-atlas`;
  const atlasContentHash = options.atlasContentHash ?? `${label}-atlas-hash`;
  const catalogId = options.catalogId ?? `${label}-catalog`;
  return {
    schemaVersion: "0.1.0",
    prompt: `${label} prompt`,
    spec: {
      schemaVersion: "0.1.0",
      familyId,
      sourceIntentHash: `${label}-intent-hash`
    },
    catalog: {
      schemaVersion: "0.1.0",
      catalogId,
      familyId,
      atlasId
    },
    graph: {
      schemaVersion: "0.1.0",
      graphId: `${label}-graph`
    },
    packedAtlas: {
      schemaVersion: "0.1.0",
      atlasId,
      contentHash: atlasContentHash,
      manifest: {
        atlasId
      }
    },
    debugExport: {
      schemaVersion: "0.1.0",
      channels: []
    },
    ir: {
      schemaVersion: "0.1.0",
      familyId,
      buildingId: options.buildingId ?? `${label}-building`,
      sourceGraphHash: options.graphHash ?? `${label}-graph-hash`
    },
    familyRuntime: {
      dispose: vi.fn()
    }
  } as unknown as AssemblyHallFixture;
}

function eventByStage(store: ReturnType<typeof createBuildingStore>, stage: string) {
  const event = store.getState().runs.currentRun?.events.find((candidate) => candidate.stage === stage);
  if (!event) {
    throw new Error(`Missing run event ${stage}`);
  }
  return event;
}

function fakeCompletedFamilyPacket(
  requestHash: string,
  fixture: AssemblyHallFixture,
  options: {
    contentHash?: string;
    createdAt?: string;
    documentId?: string;
    runId?: string;
  } = {}
): CompletedFamilyPersistencePacket {
  return {
    schemaVersion: "0.1.0",
    documentId: options.documentId ?? "family-doc-alpha",
    runId: options.runId ?? "run-persisted",
    requestHash,
    contentHash: options.contentHash ?? "completed-family-content-hash",
    createdAt: options.createdAt ?? "2026-06-24T00:00:00.000Z",
    familyId: fixture.spec.familyId,
    buildingId: fixture.ir.buildingId,
    artifacts: {
      atlasManifest: { atlasId: fixture.packedAtlas.atlasId },
      atlasContentHash: fixture.packedAtlas.contentHash,
      componentCatalog: { catalogId: fixture.catalog.catalogId },
      graph: { graphId: fixture.graph.graphId },
      runtimeIr: { sourceGraphHash: fixture.ir.sourceGraphHash }
    }
  } as unknown as CompletedFamilyPersistencePacket;
}

function fakeCompletedFamilyEntry(
  packet: CompletedFamilyPersistencePacket,
  createdAt = packet.createdAt
): CompletedFamilyPersistenceCacheEntry {
  return {
    schemaVersion: "0.1.0",
    artifactType: COMPLETED_FAMILY_ARTIFACT_TYPE,
    requestHash: packet.requestHash,
    contentHash: packet.contentHash,
    dependencies: [],
    createdAt,
    artifact: packet
  };
}

describe("building artifact registry", () => {
  it("keeps heavyweight runtime artifacts outside Zustand while exposing serializable metadata", () => {
    const artifact = fakeAssemblyFixture("first");
    const registry = new BuildingArtifactRegistry({ now: () => "2026-06-24T00:00:00.000Z" });
    const metadata = registry.register({
      artifactId: "runtime:first",
      artifactType: "assembly-hall-fixture",
      requestHash: "request-hash",
      contentHash: "content-hash",
      dependencies: ["source-a"],
      artifact,
      dispose: () => artifact.familyRuntime.dispose()
    });
    const store = createBuildingStore();

    store.getState().registerArtifact(metadata);

    expect(registry.get<AssemblyHallFixture>("runtime:first")).toBe(artifact);
    expect(store.getState().artifacts.byId["runtime:first"]).toEqual(metadata);
    expect(JSON.stringify(store.getState().artifacts)).not.toContain("familyRuntime");
  });

  it("disposes registered runtime artifacts exactly once", () => {
    const artifact = fakeAssemblyFixture("disposable");
    const registry = new BuildingArtifactRegistry();
    registry.register({
      artifactId: "runtime:disposable",
      artifactType: "assembly-hall-fixture",
      requestHash: "request-hash",
      contentHash: "content-hash",
      artifact,
      dispose: () => artifact.familyRuntime.dispose()
    });

    expect(registry.dispose("runtime:disposable")).toBe(true);
    expect(registry.dispose("runtime:disposable")).toBe(false);
    expect(artifact.familyRuntime.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("building run controller", () => {
  it("records a real run event stream and stores only the completed fixture artifact id in state", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry({ now: () => "2026-06-24T00:00:00.000Z" });
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: () => "run-001",
      nowMs: (() => {
        let value = 1000;
        return () => {
          value += 10;
          return value;
        };
      })(),
      createFixture: async () => fakeAssemblyFixture("completed")
    });

    const result = await controller.startDemoRun();

    expect(result).toMatchObject({
      runId: "run-001",
      artifactId: "assembly-hall-fixture:completed-building:completed-graph-hash:completed-atlas-hash",
      stale: false
    });
    expect(store.getState().runs.status).toBe("complete");
    expect(store.getState().runs.activeFixtureArtifactId).toBe(result.artifactId);
    expect(store.getState().runs.currentRun?.events.map((event) => event.stage)).toEqual([
      "resolvingPrompt",
      "evaluatingPsg",
      "normalizingSpec",
      "planningAtlas",
      "generatingMaterialSources",
      "compositingChannels",
      "packingAtlas",
      "buildingComponentCatalog",
      "buildingGraph",
      "compilingGeometry",
      "uploadingGpuResources",
      "complete"
    ]);
    expect(registry.get<AssemblyHallFixture>(result.artifactId!)).toBe(result.fixture);
    expect(JSON.stringify(store.getState().runs)).not.toContain("familyRuntime");
  });

  it("persists a completed-family cache entry for successful current runs", async () => {
    const store = createBuildingStore(defaultBuildingPromptControls, "promptLab", "family-doc-alpha");
    const registry = new BuildingArtifactRegistry({ now: () => "2026-06-24T00:00:00.000Z" });
    const fixture = fakeAssemblyFixture("persisted");
    const persistedEntries: CompletedFamilyPersistenceCacheEntry[] = [];
    const createCompletedFamilyPersistencePacket = vi.fn(async (input: {
      documentId: string;
      runId: string;
      requestHash: string;
      fixture: AssemblyHallFixture;
      createdAt?: string;
    }) => fakeCompletedFamilyPacket(input.requestHash, input.fixture));
    const completedFamilyPersistence = {
      put: vi.fn(async (entry: CompletedFamilyPersistenceCacheEntry) => {
        persistedEntries.push(entry);
      })
    };
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: () => "run-persisted",
      createFixture: async () => fixture,
      createCompletedFamilyPersistencePacket,
      completedFamilyPersistence
    });

    await controller.startDemoRun();

    expect(createCompletedFamilyPersistencePacket).toHaveBeenCalledWith({
      documentId: "family-doc-alpha",
      runId: "run-persisted",
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      fixture
    });
    expect(completedFamilyPersistence.put).toHaveBeenCalledTimes(1);
    expect(persistedEntries[0]).toMatchObject({
      schemaVersion: "0.1.0",
      artifactType: COMPLETED_FAMILY_ARTIFACT_TYPE,
      requestHash: createCompletedFamilyPersistencePacket.mock.calls[0][0].requestHash,
      contentHash: "completed-family-content-hash",
      artifact: {
        documentId: "family-doc-alpha",
        runId: "run-persisted",
        requestHash: createCompletedFamilyPersistencePacket.mock.calls[0][0].requestHash
      }
    });
    expect(persistedEntries[0].dependencies).toEqual([
      fixture.spec.familyId,
      fixture.packedAtlas.atlasId,
      fixture.packedAtlas.contentHash,
      fixture.catalog.catalogId,
      fixture.graph.graphId,
      fixture.ir.sourceGraphHash,
      fixture.ir.buildingId
    ]);
  });

  it("keeps the run complete when optional completed-family persistence rejects", async () => {
    const store = createBuildingStore(defaultBuildingPromptControls, "promptLab", "family-doc-alpha");
    const registry = new BuildingArtifactRegistry();
    const fixture = fakeAssemblyFixture("persistence-fallback");
    const createCompletedFamilyPersistencePacket = vi.fn(async (input: {
      documentId: string;
      runId: string;
      requestHash: string;
      fixture: AssemblyHallFixture;
    }) => fakeCompletedFamilyPacket(input.requestHash, input.fixture));
    const completedFamilyPersistence = {
      put: vi.fn(async () => {
        throw new Error("IndexedDB write failed");
      })
    };
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: () => "run-persistence-fallback",
      createFixture: async () => fixture,
      createCompletedFamilyPersistencePacket,
      completedFamilyPersistence
    });

    const result = await controller.startDemoRun();

    expect(result).toMatchObject({
      runId: "run-persistence-fallback",
      artifactId:
        "assembly-hall-fixture:persistence-fallback-building:persistence-fallback-graph-hash:persistence-fallback-atlas-hash",
      stale: false
    });
    expect(completedFamilyPersistence.put).toHaveBeenCalledTimes(1);
    expect(store.getState().runs.status).toBe("complete");
    expect(registry.get<AssemblyHallFixture>(result.artifactId!)).toBe(fixture);
  });

  it("restores the latest completed-family packet for the active document id", async () => {
    const store = createBuildingStore(defaultBuildingPromptControls, "assemblyHall", "family-doc-alpha");
    const registry = new BuildingArtifactRegistry();
    const olderFixture = fakeAssemblyFixture("older-persisted", {
      buildingId: "family-doc-alpha.older-building",
      atlasContentHash: "older-atlas-hash"
    });
    const restoredFixture = fakeAssemblyFixture("restored-persisted", {
      buildingId: "family-doc-alpha.restored-building",
      atlasContentHash: "restored-atlas-hash"
    });
    const otherDocumentFixture = fakeAssemblyFixture("other-document", {
      buildingId: "family-doc-beta.restored-building",
      atlasContentHash: "other-document-atlas-hash"
    });
    const olderPacket = fakeCompletedFamilyPacket("older-request-hash", olderFixture, {
      createdAt: "2026-06-24T00:00:00.000Z",
      runId: "run-older"
    });
    const restoredPacket = fakeCompletedFamilyPacket("restored-request-hash", restoredFixture, {
      contentHash: "restored-completed-family-hash",
      createdAt: "2026-06-24T00:02:00.000Z",
      runId: "run-restored"
    });
    const otherDocumentPacket = fakeCompletedFamilyPacket("other-document-request-hash", otherDocumentFixture, {
      createdAt: "2026-06-24T00:03:00.000Z",
      documentId: "family-doc-beta",
      runId: "run-other-document"
    });
    const completedFamilyPersistence = {
      list: vi.fn(async () => [
        fakeCompletedFamilyEntry(otherDocumentPacket),
        fakeCompletedFamilyEntry(olderPacket),
        fakeCompletedFamilyEntry(restoredPacket)
      ]),
      put: vi.fn()
    };
    const restoreCompletedFamilyFixture = vi.fn(async (packet: CompletedFamilyPersistencePacket) => {
      if (packet.requestHash !== "restored-request-hash") {
        throw new Error(`Unexpected restore packet ${packet.requestHash}`);
      }
      return restoredFixture;
    });
    const createFixture = vi.fn(async () => fakeAssemblyFixture("fresh-generation"));
    const controller = new BuildingRunController({
      store,
      registry,
      completedFamilyPersistence,
      createFixture,
      restoreCompletedFamilyFixture
    });

    const result = await controller.restoreLatestCompletedFamily();

    expect(result).toMatchObject({
      runId: "run-restored",
      artifactId:
        "assembly-hall-fixture:family-doc-alpha.restored-building:restored-persisted-graph-hash:restored-atlas-hash",
      stale: false
    });
    expect(completedFamilyPersistence.list).toHaveBeenCalledTimes(1);
    expect(restoreCompletedFamilyFixture).toHaveBeenCalledWith(restoredPacket);
    expect(createFixture).not.toHaveBeenCalled();
    expect(store.getState().runs.status).toBe("complete");
    expect(store.getState().runs.activeFixtureArtifactId).toBe(result?.artifactId);
    expect(registry.get<AssemblyHallFixture>(result!.artifactId!)).toBe(restoredFixture);
  });

  it("treats a completed-family restore as stale when a newer run starts before it resolves", async () => {
    const store = createBuildingStore(defaultBuildingPromptControls, "assemblyHall", "family-doc-alpha");
    const registry = new BuildingArtifactRegistry();
    const restoredFixture = fakeAssemblyFixture("stale-restored", {
      buildingId: "family-doc-alpha.stale-restored-building",
      atlasContentHash: "stale-restored-atlas-hash"
    });
    const currentFixture = fakeAssemblyFixture("current-generated", {
      buildingId: "family-doc-alpha.current-building",
      atlasContentHash: "current-atlas-hash"
    });
    const restoredPacket = fakeCompletedFamilyPacket("restored-request-hash", restoredFixture, {
      runId: "run-restored"
    });
    const restoreResolvers: Array<(fixture: AssemblyHallFixture) => void> = [];
    const completedFamilyPersistence = {
      list: vi.fn(async () => [fakeCompletedFamilyEntry(restoredPacket)]),
      put: vi.fn()
    };
    const controller = new BuildingRunController({
      store,
      registry,
      completedFamilyPersistence,
      createRunId: () => "run-current",
      createFixture: async () => currentFixture,
      restoreCompletedFamilyFixture: () =>
        new Promise<AssemblyHallFixture>((resolve) => {
          restoreResolvers.push(resolve);
        })
    });

    const restore = controller.restoreLatestCompletedFamily();
    await vi.waitFor(() => expect(restoreResolvers).toHaveLength(1));
    const current = await controller.startDemoRun(defaultBuildingPromptControls);
    restoreResolvers[0](restoredFixture);
    const restored = await restore;

    expect(restored).toMatchObject({ runId: "run-restored", stale: true });
    expect(current).toMatchObject({
      runId: "run-current",
      artifactId:
        "assembly-hall-fixture:family-doc-alpha.current-building:current-generated-graph-hash:current-atlas-hash",
      stale: false
    });
    expect(restoredFixture.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(store.getState().runs.status).toBe("complete");
    expect(store.getState().runs.activeRunId).toBe("run-current");
    expect(store.getState().runs.activeFixtureArtifactId).toBe(current.artifactId);
    expect(registry.get<AssemblyHallFixture>(current.artifactId!)).toBe(currentFixture);
  });

  it("cancels the prior run, disposes stale fixture results, and keeps the latest completed artifact active", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const fixtures: Array<(fixture: AssemblyHallFixture) => void> = [];
    let nextRunNumber = 0;
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: () => {
        nextRunNumber += 1;
        return `run-00${nextRunNumber}`;
      },
      createFixture: () =>
        new Promise<AssemblyHallFixture>((resolve) => {
          fixtures.push(resolve);
        })
    });

    const first = controller.startDemoRun();
    const second = controller.startDemoRun();
    const staleFixture = fakeAssemblyFixture("stale");
    const currentFixture = fakeAssemblyFixture("current");
    fixtures[0](staleFixture);
    fixtures[1](currentFixture);
    const firstResult = await first;
    const secondResult = await second;

    expect(firstResult).toMatchObject({ runId: "run-001", stale: true });
    expect(secondResult).toMatchObject({
      runId: "run-002",
      artifactId: "assembly-hall-fixture:current-building:current-graph-hash:current-atlas-hash",
      stale: false
    });
    expect(staleFixture.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(currentFixture.familyRuntime.dispose).not.toHaveBeenCalled();
    expect(registry.listMetadata().map((artifact) => artifact.artifactId)).toContain(
      "assembly-hall-fixture:current-building:current-graph-hash:current-atlas-hash"
    );
    expect(store.getState().runs.status).toBe("complete");
    expect(store.getState().runs.activeRunId).toBe("run-002");
  });

  it("passes reusable family artifacts into new-building runs and marks atlas/catalog events as cache hits", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const baselineFixture = fakeAssemblyFixture("baseline", {
      familyId: "family-shared",
      atlasId: "atlas-shared",
      atlasContentHash: "atlas-content-shared",
      catalogId: "catalog-shared",
      buildingId: "family-shared.initial",
      graphHash: "graph-initial"
    });
    const newBuildingFixture = fakeAssemblyFixture("new-building", {
      familyId: "family-shared",
      atlasId: "atlas-shared",
      atlasContentHash: "atlas-content-shared",
      catalogId: "catalog-shared",
      buildingId: "family-shared.next-building",
      graphHash: "graph-new-building"
    });
    const createFixture = vi
      .fn()
      .mockResolvedValueOnce(baselineFixture)
      .mockResolvedValueOnce(newBuildingFixture);
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValueOnce("run-001").mockReturnValueOnce("run-002"),
      createFixture
    });

    await controller.startDemoRun(defaultBuildingPromptControls);
    const newBuildingPrompt = {
      ...defaultBuildingPromptControls,
      seeds: {
        ...defaultBuildingPromptControls.seeds,
        building: "building-seed-reroll"
      }
    };
    await controller.startDemoRun(newBuildingPrompt);

    expect(createFixture).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        promptControls: newBuildingPrompt,
        reusableArtifacts: expect.objectContaining({
          packedAtlas: baselineFixture.packedAtlas,
          debugExport: baselineFixture.debugExport,
          catalog: baselineFixture.catalog
        })
      })
    );
    expect(eventByStage(store, "generatingMaterialSources")).toMatchObject({
      cacheHit: true,
      outputArtifactId: "material-sources:atlas-shared:atlas-content-shared"
    });
    expect(eventByStage(store, "packingAtlas")).toMatchObject({
      cacheHit: true,
      outputArtifactId: "packed-atlas:atlas-shared:atlas-content-shared"
    });
    expect(eventByStage(store, "buildingComponentCatalog")).toMatchObject({
      cacheHit: true,
      outputArtifactId: "component-catalog:catalog-shared"
    });
    expect(eventByStage(store, "compilingGeometry")).toMatchObject({
      cacheHit: false,
      outputArtifactId: "runtime-building-ir:family-shared.next-building:graph-new-building"
    });
  });

  it("regenerates the family artifact chain for new-family runs", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const baselineFixture = fakeAssemblyFixture("baseline", {
      familyId: "family-original",
      atlasId: "atlas-original",
      atlasContentHash: "atlas-content-original",
      catalogId: "catalog-original"
    });
    const newFamilyFixture = fakeAssemblyFixture("new-family", {
      familyId: "family-regenerated",
      atlasId: "atlas-regenerated",
      atlasContentHash: "atlas-content-regenerated",
      catalogId: "catalog-regenerated"
    });
    const createFixture = vi
      .fn()
      .mockResolvedValueOnce(baselineFixture)
      .mockResolvedValueOnce(newFamilyFixture);
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValueOnce("run-001").mockReturnValueOnce("run-002"),
      createFixture
    });

    await controller.startDemoRun(defaultBuildingPromptControls);
    await controller.startDemoRun({
      ...defaultBuildingPromptControls,
      seeds: {
        ...defaultBuildingPromptControls.seeds,
        family: "family-seed-regenerated"
      }
    });

    expect(createFixture).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reusableArtifacts: {}
      })
    );
    expect(eventByStage(store, "generatingMaterialSources")).toMatchObject({
      cacheHit: false,
      outputArtifactId: "material-sources:atlas-regenerated:atlas-content-regenerated"
    });
    expect(eventByStage(store, "packingAtlas")).toMatchObject({
      cacheHit: false,
      outputArtifactId: "packed-atlas:atlas-regenerated:atlas-content-regenerated"
    });
    expect(eventByStage(store, "buildingComponentCatalog")).toMatchObject({
      cacheHit: false,
      outputArtifactId: "component-catalog:catalog-regenerated"
    });
  });

  it("passes opt-in remote material wiring only to material-generating fixture runs", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const baselineFixture = fakeAssemblyFixture("baseline", {
      atlasId: "atlas-shared",
      atlasContentHash: "atlas-content-shared",
      catalogId: "catalog-shared"
    });
    const floorRerunFixture = fakeAssemblyFixture("floor-rerun", {
      atlasId: "atlas-shared",
      atlasContentHash: "atlas-content-shared",
      catalogId: "catalog-shared"
    });
    const newFamilyFixture = fakeAssemblyFixture("new-family", {
      atlasId: "atlas-regenerated",
      atlasContentHash: "atlas-content-regenerated",
      catalogId: "catalog-regenerated"
    });
    const remoteMaterial: NonNullable<CreateAssemblyHallFixtureInput["remoteMaterial"]> = {
      decodePngLayer: vi.fn(async (input) => ({
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        channels: "rgba8" as const,
        data: new Uint8ClampedArray(input.widthPx * input.heightPx * 4)
      }))
    };
    const createFixture = vi
      .fn()
      .mockResolvedValueOnce(baselineFixture)
      .mockResolvedValueOnce(floorRerunFixture)
      .mockResolvedValueOnce(newFamilyFixture);
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValueOnce("run-001").mockReturnValueOnce("run-002").mockReturnValueOnce("run-003"),
      createFixture,
      remoteMaterial
    });

    const remoteEnabledPrompt = {
      ...defaultBuildingPromptControls,
      remoteMaterialEnabled: true
    };

    await controller.startDemoRun(remoteEnabledPrompt);
    const floorRerunPrompt = {
      ...defaultBuildingPromptControls,
      floorCount: defaultBuildingPromptControls.floorCount + 1,
      remoteMaterialEnabled: true
    };
    await controller.startDemoRun(floorRerunPrompt);
    await controller.startDemoRun({
      ...floorRerunPrompt,
      seeds: {
        ...floorRerunPrompt.seeds,
        family: "family-seed-regenerated"
      },
      remoteMaterialEnabled: true
    });

    const baselineInput = createFixture.mock.calls[0][0] as CreateAssemblyHallFixtureInput;
    const floorRerunInput = createFixture.mock.calls[1][0] as CreateAssemblyHallFixtureInput;
    const newFamilyInput = createFixture.mock.calls[2][0] as CreateAssemblyHallFixtureInput;
    expect(baselineInput.remoteMaterial).toEqual(
      expect.objectContaining({
        decodePngLayer: remoteMaterial.decodePngLayer,
        requestRemoteImages: expect.any(Function)
      })
    );
    expect(floorRerunInput.reusableArtifacts).toMatchObject({
      packedAtlas: baselineFixture.packedAtlas,
      debugExport: baselineFixture.debugExport
    });
    expect(floorRerunInput.remoteMaterial).toBeUndefined();
    expect(newFamilyInput.reusableArtifacts).toEqual({});
    expect(newFamilyInput.remoteMaterial).toEqual(
      expect.objectContaining({
        decodePngLayer: remoteMaterial.decodePngLayer,
        requestRemoteImages: expect.any(Function)
      })
    );
  });

  it("keeps the remote material lane disabled until the prompt feature flag is enabled", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const disabledFixture = fakeAssemblyFixture("disabled");
    const enabledFixture = fakeAssemblyFixture("enabled", {
      atlasId: "enabled-atlas",
      atlasContentHash: "enabled-atlas-hash"
    });
    const remoteMaterial: NonNullable<CreateAssemblyHallFixtureInput["remoteMaterial"]> = {
      decodePngLayer: vi.fn(async (input) => ({
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        channels: "rgba8" as const,
        data: new Uint8ClampedArray(input.widthPx * input.heightPx * 4)
      }))
    };
    const createFixture = vi.fn().mockResolvedValueOnce(disabledFixture).mockResolvedValueOnce(enabledFixture);
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValueOnce("run-001").mockReturnValueOnce("run-002"),
      createFixture,
      remoteMaterial
    });

    await controller.startDemoRun(defaultBuildingPromptControls);
    await controller.startDemoRun({
      ...defaultBuildingPromptControls,
      remoteMaterialEnabled: true,
      seeds: {
        ...defaultBuildingPromptControls.seeds,
        material: "material-seed-remote-enabled"
      }
    });

    expect((createFixture.mock.calls[0][0] as CreateAssemblyHallFixtureInput).remoteMaterial).toBeUndefined();
    expect((createFixture.mock.calls[1][0] as CreateAssemblyHallFixtureInput).remoteMaterial).toEqual(
      expect.objectContaining({
        decodePngLayer: remoteMaterial.decodePngLayer,
        requestRemoteImages: expect.any(Function)
      })
    );
  });

  it("records remote material provider progress in the run event stream", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const remoteRequest: MaterialSourceRequest = {
      sourceId: "source.wall.primary",
      role: "wall",
      selectedFamily: "running-bond-brick",
      periodicity: "xy",
      physicalSizeM: { width: 18, height: 14 },
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      promptVocabulary: ["running-bond-brick"],
      widthPx: 32,
      heightPx: 32
    };
    const remoteMaterial: NonNullable<CreateAssemblyHallFixtureInput["remoteMaterial"]> = {
      decodePngLayer: vi.fn(async (input) => ({
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        channels: "rgba8" as const,
        data: new Uint8ClampedArray(input.widthPx * input.heightPx * 4)
      })),
      requestRemoteImages: vi.fn(async () => ({
        schemaVersion: "0.1.0" as const,
        status: "generated" as const,
        providerId: "openai-image" as const,
        requestHash: "route-request-hash",
        acceptedRequestCount: 1,
        cacheStatus: "miss" as const,
        artifacts: [],
        diagnostics: []
      }))
    };
    const createFixture = vi.fn(async (input: CreateAssemblyHallFixtureInput & { runId: string; signal: AbortSignal }) => {
      await input.remoteMaterial?.requestRemoteImages?.({
        runId: input.runId,
        requests: [remoteRequest],
        signal: input.signal
      });
      return fakeAssemblyFixture("remote-progress");
    });
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValue("run-remote-progress"),
      createFixture,
      nowMs: (() => {
        let value = 2000;
        return () => {
          value += 5;
          return value;
        };
      })(),
      remoteMaterial
    });

    await controller.startDemoRun({
      ...defaultBuildingPromptControls,
      remoteMaterialEnabled: true
    });

    const providerEvents = store
      .getState()
      .runs.currentRun?.events.filter((event) => event.stage === "generatingMaterialSources" && event.provider);
    expect(providerEvents?.[0]).toEqual(
      expect.objectContaining({
        provider: "remote-material-route"
      })
    );
    expect(providerEvents?.[0].endedAtMs).toBeUndefined();
    expect(providerEvents?.[1]).toEqual(
      expect.objectContaining({
        provider: "openai-image",
        cacheHit: false
      })
    );
    expect(remoteMaterial.requestRemoteImages).toHaveBeenCalledWith({
      runId: "run-remote-progress",
      requests: [remoteRequest],
      signal: expect.any(AbortSignal)
    });
  });

  it("cancels a pending run, disposes its stale fixture, and keeps the prior completed scene active", async () => {
    const store = createBuildingStore();
    const registry = new BuildingArtifactRegistry();
    const pendingFixtures: Array<(fixture: AssemblyHallFixture) => void> = [];
    const completedFixture = fakeAssemblyFixture("completed", {
      buildingId: "completed-building",
      atlasContentHash: "completed-atlas-hash"
    });
    const createFixture = vi
      .fn()
      .mockResolvedValueOnce(completedFixture)
      .mockImplementation(
        () =>
          new Promise<AssemblyHallFixture>((resolve) => {
            pendingFixtures.push(resolve);
          })
      );
    const controller = new BuildingRunController({
      store,
      registry,
      createRunId: vi.fn().mockReturnValueOnce("run-001").mockReturnValueOnce("run-002"),
      createFixture
    });

    const completed = await controller.startDemoRun(defaultBuildingPromptControls);
    const pendingRun = controller.startDemoRun({
      ...defaultBuildingPromptControls,
      seeds: {
        ...defaultBuildingPromptControls.seeds,
        building: "building-seed-pending"
      }
    });

    expect(store.getState().runs.status).toBe("running");
    expect(store.getState().runs.activeFixtureArtifactId).toBe(completed.artifactId);

    controller.cancelActiveRun();
    const staleFixture = fakeAssemblyFixture("cancelled", {
      buildingId: "cancelled-building",
      atlasContentHash: "cancelled-atlas-hash"
    });
    pendingFixtures[0](staleFixture);
    const pendingResult = await pendingRun;

    expect(pendingResult).toMatchObject({ runId: "run-002", stale: true });
    expect(store.getState().runs.status).toBe("cancelled");
    expect(store.getState().runs.activeFixtureArtifactId).toBe(completed.artifactId);
    expect(staleFixture.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(registry.listMetadata().map((artifact) => artifact.artifactId)).not.toContain(
      "assembly-hall-fixture:cancelled-building:cancelled-atlas-hash"
    );
  });
});

describe("building control invalidation state", () => {
  it("records a structural-only invalidation preview for floor-count edits", () => {
    const store = createBuildingStore();

    store.getState().updatePromptControls({ floorCount: 6 });

    expect(store.getState().prompt.floorCount).toBe(6);
    expect(store.getState().controls.invalidation.changedControls).toEqual(["floorCount"]);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(false);
    expect(store.getState().controls.invalidation.stageImpacts.materialSources).toBe("none");
    expect(store.getState().controls.invalidation.reusableArtifacts.packedAtlas).toBe(true);
  });

  it("records new-building reuse and new-family regeneration separately", () => {
    const store = createBuildingStore();

    store.getState().updatePromptControls({ seeds: { building: "new-building-seed" } });
    expect(store.getState().controls.invalidation.changedControls).toEqual(["buildingSeed"]);
    expect(store.getState().controls.invalidation.reusableArtifacts.componentCatalog).toBe(true);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(false);

    store.getState().commitPromptControls();
    store.getState().updatePromptControls({ seeds: { family: "new-family-seed" } });
    expect(store.getState().controls.invalidation.changedControls).toEqual(["familySeed"]);
    expect(store.getState().controls.invalidation.reusableArtifacts.componentCatalog).toBe(false);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(true);
  });

  it("tracks draft control invalidation against the last committed run", () => {
    const store = createBuildingStore();

    store.getState().updatePromptControls({ floorCount: 6 });
    store.getState().updatePromptControls({ bayCount: 5 });

    expect(store.getState().controls.invalidation.changedControls).toEqual(["floorCount", "bayCount"]);

    (store.getState() as unknown as { commitPromptControls(): void }).commitPromptControls();
    expect(store.getState().controls.invalidation.changedControls).toEqual([]);

    store.getState().updatePromptControls({ seeds: { building: "building-seed-2" } });
    expect(store.getState().controls.invalidation.changedControls).toEqual(["buildingSeed"]);
  });

  it("tracks local component locks as prompt controls with branch-scoped invalidation", () => {
    const store = createBuildingStore();

    store.getState().updatePromptControls({
      lockedComponentKeys: ["recipe.window.tall-arched.frame"]
    });

    expect(store.getState().prompt.lockedComponentKeys).toEqual(["recipe.window.tall-arched.frame"]);
    expect(store.getState().controls.invalidation.changedControls).toEqual(["localComponentLock"]);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(false);
    expect(store.getState().controls.invalidation.stageImpacts.componentCatalog).toBe("partial");
    expect(store.getState().controls.invalidation.stageImpacts.buildingGraph).toBe("branch");
    expect(store.getState().controls.invalidation.stageImpacts.runtimeBuildingIr).toBe("branchOrFullMvp");

    store.getState().commitPromptControls();
    store.getState().updatePromptControls({ seeds: { building: "building-seed-reroll" } });

    expect(store.getState().prompt.lockedComponentKeys).toEqual(["recipe.window.tall-arched.frame"]);
    expect(store.getState().controls.invalidation.changedControls).toEqual(["buildingSeed"]);
  });

  it("tracks the remote material feature flag as a material-source invalidation", () => {
    const store = createBuildingStore();

    expect(store.getState().prompt.remoteMaterialEnabled).toBe(false);

    store.getState().updatePromptControls({ remoteMaterialEnabled: true });

    expect(store.getState().prompt.remoteMaterialEnabled).toBe(true);
    expect(store.getState().controls.invalidation.changedControls).toEqual(["remoteMaterial"]);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(true);
    expect(store.getState().controls.invalidation.stageImpacts.materialSources).toBe("full");
    expect(store.getState().controls.invalidation.reusableArtifacts.packedAtlas).toBe(false);
    expect(store.getState().controls.invalidation.reusableArtifacts.componentCatalog).toBe(true);
  });
});


function p1Deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function p1Prompt() {
  return { ...defaultBuildingPromptControls, seeds: { ...defaultBuildingPromptControls.seeds }, lockedComponentKeys: [...defaultBuildingPromptControls.lockedComponentKeys] };
}

function p1SameIdentityFixture(label: string, source: AssemblyHallFixture) {
  const fixture = fakeAssemblyFixture(label, { familyId: source.spec.familyId, buildingId: source.ir.buildingId, graphHash: source.ir.sourceGraphHash, atlasId: source.packedAtlas.atlasId, atlasContentHash: source.packedAtlas.contentHash, catalogId: source.catalog.catalogId });
  fixture.spec.sourceIntentHash = source.spec.sourceIntentHash;
  fixture.graph.graphId = source.graph.graphId;
  fixture.packedAtlas.slotProvenance = [];
  return fixture;
}

function p1Artifact(id: string) {
  return { artifactId: id, artifactType: "runtime-building-ir" as const, requestHash: "request", contentHash: "content", dependencies: ["graph"], artifact: { id } };
}

describe("P1 transactional fixture ownership", () => {
  it("validates all staged records without publishing partial aliases", () => {
    const registry = new BuildingArtifactRegistry();
    expect(() => registry.prepareOwnedArtifacts({ artifacts: [p1Artifact("good"), { ...p1Artifact("bad"), contentHash: "" }], dispose: vi.fn() })).toThrow();
    expect(registry.listMetadata()).toEqual([]);
    expect(() => registry.prepareOwnedArtifacts({ artifacts: [p1Artifact("duplicate"), p1Artifact("duplicate")], dispose: vi.fn() })).toThrow();
    expect(registry.listMetadata()).toEqual([]);
  });

  it("owns staged metadata while intentionally retaining runtime artifact references", () => {
    const registry = new BuildingArtifactRegistry();
    const input = p1Artifact("original");
    const artifact = input.artifact;
    const owner = registry.prepareOwnedArtifacts({ artifacts: [input], dispose: vi.fn() });
    input.artifactId = "changed";
    input.dependencies.push("changed");
    registry.publishOwnedArtifacts(owner);
    expect(registry.get("original")).toBe(artifact);
    expect(registry.get("changed")).toBeUndefined();
    expect(registry.getMetadata("original")?.dependencies).toEqual(["graph"]);
    expect(() => owner.metadata[0].dependencies.push("mutation")).toThrow();
  });

  it("keeps leased retired owners alive through clear without deleting replacement aliases", () => {
    const registry = new BuildingArtifactRegistry();
    const disposeFirst = vi.fn(), disposeSecond = vi.fn();
    const first = registry.prepareOwnedArtifacts({ artifacts: [p1Artifact("same")], dispose: disposeFirst });
    registry.publishOwnedArtifacts(first);
    const releaseFirst = registry.acquireOwnerLease(first);
    const secondInput = p1Artifact("same");
    const second = registry.prepareOwnedArtifacts({ artifacts: [secondInput], dispose: disposeSecond });
    registry.publishOwnedArtifacts(second, first);
    registry.retireOwnedArtifacts(first);
    expect(disposeFirst).not.toHaveBeenCalled();
    releaseFirst(); releaseFirst();
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(registry.get("same")).toBe(secondInput.artifact);
    const releaseSecond = registry.acquireOwnerLease(second);
    registry.clear();
    expect(registry.listMetadata()).toEqual([]);
    expect(disposeSecond).not.toHaveBeenCalled();
    releaseSecond(); releaseSecond(); registry.clear();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
  });

  it("rejects alias collisions before any registry replacement", () => {
    const registry = new BuildingArtifactRegistry();
    const existing = p1Artifact("occupied"); registry.register(existing);
    const dispose = vi.fn();
    const owner = registry.prepareOwnedArtifacts({ artifacts: [p1Artifact("new"), p1Artifact("occupied")], dispose });
    const beforePublish = vi.fn();
    expect(() => registry.publishOwnedArtifacts(owner, undefined, beforePublish)).toThrow();
    expect(beforePublish).not.toHaveBeenCalled();
    expect(registry.get("occupied")).toBe(existing.artifact);
    expect(registry.get("new")).toBeUndefined();
    registry.retireOwnedArtifacts(owner);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("never invokes registry publication when the store run guard rejects", () => {
    const store = createBuildingStore();
    store.getState().beginRun({ runId: "current", event: { stage: "resolvingPrompt", startedAtMs: 0 } });
    const publishArtifacts = vi.fn();
    expect(store.getState().publishCompletedFixture({ runId: "old", artifactId: "candidate", metadata: [], replacedArtifactIds: [], event: { stage: "complete", startedAtMs: 1 }, publishArtifacts })).toBe(false);
    expect(publishArtifacts).not.toHaveBeenCalled();
    expect(store.getState().runs.activeFixtureArtifactId).toBeUndefined();
  });

  it("replaces the fixture and every child reference atomically under the same IDs", async () => {
    const first = fakeAssemblyFixture("p1-first"), second = p1SameIdentityFixture("p1-second", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const createFixture = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const controller = new BuildingRunController({ store, registry, createFixture });
    const initial = await controller.startDemoRun();
    const release = controller.acquireFixtureViewerLease(first);
    const observed: AssemblyHallFixture[] = [];
    const unsubscribe = store.subscribe((state) => {
      if (state.runs.status === "complete") observed.push(registry.get<AssemblyHallFixture>(state.runs.activeFixtureArtifactId!)!);
    });
    const result = await controller.startDemoRun(); unsubscribe();
    expect(result.artifactId).toBe(initial.artifactId);
    expect(observed).toEqual([second]);
    expect(registry.get(initial.artifactId!)).toBe(second);
    expect(registry.get('building-family-spec:' + second.spec.familyId + ':' + second.spec.sourceIntentHash)).toBe(second.spec);
    expect(registry.get('component-catalog:' + second.catalog.catalogId)).toBe(second.catalog);
    expect(registry.get('building-graph:' + second.graph.graphId)).toBe(second.graph);
    expect(registry.get('runtime-building-ir:' + second.ir.buildingId + ':' + second.ir.sourceGraphHash)).toBe(second.ir);
    expect(registry.get('packed-atlas:' + second.packedAtlas.atlasId + ':' + second.packedAtlas.contentHash)).toBe(second.packedAtlas);
    expect(registry.get('material-sources:' + second.packedAtlas.atlasId + ':' + second.packedAtlas.contentHash)).toBe(second.packedAtlas.slotProvenance);
    expect(registry.get('atlas-manifest:' + second.packedAtlas.manifest.atlasId)).toBe(second.packedAtlas.manifest);
    expect(registry.listMetadata()).toHaveLength(8);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    release(); expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose(); expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
  });

  it("snapshots caller prompt seeds and lock arrays before asynchronous work", async () => {
    const prompt = p1Prompt(); prompt.lockedComponentKeys = ["window/frame"];
    const expected = structuredClone(prompt);
    const candidate = p1Deferred<AssemblyHallFixture>();
    const createFixture = vi.fn((input: CreateAssemblyHallFixtureInput) => { void input; return candidate.promise; });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture });
    const run = controller.startDemoRun(prompt);
    prompt.seeds.building = "mutated"; prompt.lockedComponentKeys.push("mutated"); prompt.bayCount = 9;
    expect(createFixture.mock.calls[0][0].promptControls).toEqual(expected);
    candidate.resolve(fakeAssemblyFixture("snapshot")); await run;
    expect(store.getState().controls.committedPrompt).toEqual(expected);
    controller.dispose();
  });

  it("uses distinct operation ownership even when legacy run IDs repeat", async () => {
    const pending = p1Deferred<AssemblyHallFixture>();
    const stale = fakeAssemblyFixture("old"), current = p1SameIdentityFixture("current", stale);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createRunId: () => "same-run", createFixture: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current) });
    const first = controller.startDemoRun(); const second = await controller.startDemoRun();
    pending.resolve(stale);
    expect((await first).stale).toBe(true);
    expect(registry.get(second.artifactId!)).toBe(current);
    expect(stale.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not let an older delayed restore lookup cancel newer generation", async () => {
    const lookup = p1Deferred<Array<ReturnType<typeof fakeCompletedFamilyEntry>>>();
    const saved = fakeAssemblyFixture("saved"), current = fakeAssemblyFixture("current");
    const restoreCompletedFamilyFixture = vi.fn(async () => saved);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createRunId: () => "repeated", createFixture: async () => current, restoreCompletedFamilyFixture, completedFamilyPersistence: { put: vi.fn(), list: () => lookup.promise } });
    const restore = controller.restoreLatestCompletedFamily();
    const generated = await controller.startDemoRun();
    lookup.resolve([fakeCompletedFamilyEntry(fakeCompletedFamilyPacket("saved-request", saved))]);
    expect((await restore)?.stale).toBe(true);
    expect(restoreCompletedFamilyFixture).not.toHaveBeenCalled();
    expect(registry.get(generated.artifactId!)).toBe(current);
    controller.dispose();
  });

  it("keeps candidate rollback separate from the last valid scene on preparation failure", async () => {
    const first = fakeAssemblyFixture("valid"), invalid = p1SameIdentityFixture("invalid", first);
    invalid.packedAtlas.contentHash = "";
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(invalid) });
    const result = await controller.startDemoRun();
    const before = registry.listMetadata();
    await expect(controller.startDemoRun()).rejects.toThrow();
    expect(store.getState().runs.activeFixtureArtifactId).toBe(result.artifactId);
    expect(registry.get(result.artifactId!)).toBe(first);
    expect(registry.listMetadata()).toEqual(before);
    expect(invalid.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("does not fail the new published owner when old runtime cleanup throws", async () => {
    const first = fakeAssemblyFixture("cleanup-old"), second = p1SameIdentityFixture("cleanup-new", first);
    vi.mocked(first.familyRuntime.dispose).mockImplementation(() => { throw new Error("old cleanup"); });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    await controller.startDemoRun();
    const result = await controller.startDemoRun();
    expect(result.stale).toBe(false);
    expect(store.getState().runs.status).toBe("complete");
    expect(registry.get(result.artifactId!)).toBe(second);
    expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not let deferred older persistence overwrite newer ownership or committed controls", async () => {
    const heldPut = p1Deferred<void>();
    const first = fakeAssemblyFixture("base"), stale = p1SameIdentityFixture("stale", first), current = p1SameIdentityFixture("current", first);
    let run = 0;
    const put = vi.fn(async (entry: CompletedFamilyPersistenceCacheEntry) => { if (entry.artifact.runId === "p1-2") await heldPut.promise; });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createRunId: () => "p1-" + (++run), createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(stale).mockResolvedValueOnce(current), completedFamilyPersistence: { put }, createCompletedFamilyPersistencePacket: async (input) => fakeCompletedFamilyPacket(input.requestHash, input.fixture, { runId: input.runId, documentId: input.documentId }) });
    await controller.startDemoRun();
    const oldPrompt = p1Prompt(); oldPrompt.bayCount = 8;
    const old = controller.startDemoRun(oldPrompt);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    const newPrompt = p1Prompt(); newPrompt.bayCount = 9;
    const accepted = await controller.startDemoRun(newPrompt);
    heldPut.resolve();
    expect((await old).stale).toBe(true);
    expect(registry.get(accepted.artifactId!)).toBe(current);
    expect(store.getState().controls.baselineStatus).toBe("known");
    expect(store.getState().controls.committedPrompt!.bayCount).toBe(9);
    expect(stale.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("preserves newer draft controls while committing the accepted run baseline", async () => {
    const heldPut = p1Deferred<void>();
    const put = vi.fn(() => heldPut.promise);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: async () => fakeAssemblyFixture("draft"), completedFamilyPersistence: { put }, createCompletedFamilyPersistencePacket: async (input) => fakeCompletedFamilyPacket(input.requestHash, input.fixture, { runId: input.runId, documentId: input.documentId }) });
    const run = controller.startDemoRun();
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    store.getState().updatePromptControls({ bayCount: 9 });
    heldPut.resolve(); await run;
    expect(store.getState().prompt.bayCount).toBe(9);
    expect(store.getState().controls.baselineStatus).toBe("known");
    expect(store.getState().controls.committedPrompt!.bayCount).toBe(7);
    expect(store.getState().controls.invalidation.changedControls).toContain("bayCount");
    controller.dispose();
  });

  it("uses the document captured at operation start for persistence", async () => {
    const candidate = p1Deferred<AssemblyHallFixture>();
    const savedDocuments: string[] = [];
    const store = createBuildingStore(undefined, "promptLab", "doc-start"), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: () => candidate.promise, completedFamilyPersistence: { put: vi.fn() }, createCompletedFamilyPersistencePacket: async (input) => { savedDocuments.push(input.documentId); return fakeCompletedFamilyPacket(input.requestHash, input.fixture, { documentId: input.documentId, runId: input.runId }); } });
    const run = controller.startDemoRun();
    store.getState().selectDocument("doc-later");
    candidate.resolve(fakeAssemblyFixture("document")); await run;
    expect(savedDocuments).toEqual(["doc-start"]);
    controller.dispose();
  });

  it("gates unknown restored requests before generation, then reuses exact-input artifacts without inventing controls", async () => {
    const prompt = p1Prompt();
    const requestHash = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo", prompt });
    const restored = fakeAssemblyFixture("restored");
    const packet = fakeCompletedFamilyPacket(requestHash, restored);
    const received: CreateAssemblyHallFixtureInput[] = [];
    const createFixture = vi.fn(async (input: CreateAssemblyHallFixtureInput) => {
      received.push(input);
      const next = p1SameIdentityFixture("fresh-" + received.length, restored);
      if (input.reusableArtifacts?.packedAtlas) {
        next.packedAtlas = input.reusableArtifacts.packedAtlas;
        next.catalog = input.reusableArtifacts.catalog!;
        next.debugExport = input.reusableArtifacts.debugExport!;
      }
      return next;
    });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture, restoreCompletedFamilyFixture: async () => restored });
    await controller.startDemoRun({ ...prompt, bayCount: 8 });
    expect(store.getState().controls.baselineStatus).toBe("known");
    expect(store.getState().controls.committedPrompt?.bayCount).toBe(8);
    const saved = await controller.restoreCompletedFamilyPacket(packet);
    expect(store.getState().controls.baselineStatus).toBe("unknown");
    expect(store.getState().controls.committedPrompt).toBeUndefined();
    store.getState().updatePromptControls({ floorCount: 5 });
    expect(store.getState().controls.baselineStatus).toBe("unknown");
    expect(store.getState().controls.committedPrompt).toBeUndefined();
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(false);
    expect(store.getState().controls.invalidation.reusableArtifacts).toEqual({ materialSources: false, packedAtlas: false, componentCatalog: false });
    await expect(controller.startDemoRun({ ...prompt, floorCount: 5 })).rejects.toMatchObject({ code: "building.restoredReuseProvenanceUnresolved" });
    expect(createFixture).toHaveBeenCalledTimes(1);
    expect(registry.get(saved.artifactId!)).toBe(restored);
    expect(restored.familyRuntime.dispose).not.toHaveBeenCalled();
    const exact = await controller.startDemoRun(prompt);
    expect(exact.artifactId).toBe(saved.artifactId);
    expect(store.getState().controls.baselineStatus).toBe("known");
    expect(store.getState().controls.committedPrompt?.bayCount).toBe(7);
    expect(received[1].reusableArtifacts?.packedAtlas).toBe(restored.packedAtlas);
    expect(received[1].reusableArtifacts?.catalog).toBe(restored.catalog);
    await controller.startDemoRun({ ...prompt, floorCount: 6 });
    expect(received[2].reusableArtifacts?.packedAtlas).toBe(restored.packedAtlas);
    expect(received[2].reusableArtifacts?.catalog).toBe(restored.catalog);
    controller.dispose();
  });

  it("replaces same-ID restored owners and defers their retirement until viewer release", async () => {
    const first = fakeAssemblyFixture("restore-first"), second = p1SameIdentityFixture("restore-second", first);
    const packet = fakeCompletedFamilyPacket("saved-request", first, { runId: "same-saved-run" });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, restoreCompletedFamilyFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    const a = await controller.restoreCompletedFamilyPacket(packet);
    const release = controller.acquireFixtureViewerLease(first);
    const b = await controller.restoreCompletedFamilyPacket(packet);
    expect(b.artifactId).toBe(a.artifactId);
    expect(registry.get(b.artifactId!)).toBe(second);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    release(); release();
    expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("allows StrictMode-style setup after teardown while old viewer leases finish independently", async () => {
    const first = fakeAssemblyFixture("strict-first"), second = p1SameIdentityFixture("strict-second", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    await controller.startDemoRun(); const releaseOld = controller.acquireFixtureViewerLease(first);
    controller.dispose(); expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    const accepted = await controller.startDemoRun();
    const releaseNew = controller.acquireFixtureViewerLease(second);
    releaseOld(); releaseOld();
    expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(registry.get(accepted.artifactId!)).toBe(second);
    controller.dispose(); expect(second.familyRuntime.dispose).not.toHaveBeenCalled();
    releaseNew(); releaseNew();
    expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the newer restored owner when identical packet run IDs overlap", async () => {
    const pending = p1Deferred<AssemblyHallFixture>();
    const older = fakeAssemblyFixture("restore-overlap-old"), newer = p1SameIdentityFixture("restore-overlap-new", older);
    const packet = fakeCompletedFamilyPacket("saved-request", older, { runId: "same-persisted-run" });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, restoreCompletedFamilyFixture: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(newer) });
    const first = controller.restoreCompletedFamilyPacket(packet);
    const accepted = await controller.restoreCompletedFamilyPacket(packet);
    pending.resolve(older);
    expect((await first).stale).toBe(true);
    expect(registry.get(accepted.artifactId!)).toBe(newer);
    expect(store.getState().runs.status).toBe("complete");
    expect(older.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(newer.familyRuntime.dispose).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("skips persistence put when packet construction finishes after a newer owner", async () => {
    const packetConstruction = p1Deferred<CompletedFamilyPersistencePacket>();
    const older = fakeAssemblyFixture("construct-old"), newer = p1SameIdentityFixture("construct-new", older);
    const put = vi.fn();
    const construct = vi.fn(async (input: { requestHash: string; fixture: AssemblyHallFixture; documentId: string; runId: string }) => {
      if (input.runId === "construct-1") return packetConstruction.promise;
      return fakeCompletedFamilyPacket(input.requestHash, input.fixture, { runId: input.runId, documentId: input.documentId });
    });
    let number = 0;
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createRunId: () => "construct-" + (++number), createFixture: vi.fn().mockResolvedValueOnce(older).mockResolvedValueOnce(newer), createCompletedFamilyPersistencePacket: construct, completedFamilyPersistence: { put } });
    const first = controller.startDemoRun();
    await vi.waitFor(() => expect(construct).toHaveBeenCalledTimes(1));
    const accepted = await controller.startDemoRun();
    packetConstruction.resolve(fakeCompletedFamilyPacket("old-request", older, { runId: "construct-1" }));
    expect((await first).stale).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0].artifact.runId).toBe("construct-2");
    expect(registry.get(accepted.artifactId!)).toBe(newer);
    expect(older.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("snapshots imported packet receipts and typed IR before a deferred adapter", async () => {
    const prompt = p1Prompt();
    const requestHash = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo", prompt });
    const changedRequestHash = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo", prompt: { ...prompt, floorCount: 5 } });
    const template = fakeAssemblyFixture("packet-snapshot");
    const packet = fakeCompletedFamilyPacket(requestHash, template);
    const positions = new Float32Array([1, 2, 3]);
    packet.artifacts.runtimeIr.meshBatches = [{ batchId: "wall", role: "wall", positions }];
    const adapterGate = p1Deferred<void>();
    const restoreCompletedFamilyFixture = vi.fn(async (input: CompletedFamilyPersistencePacket) => {
      await adapterGate.promise;
      const fixture = p1SameIdentityFixture("owned-packet", template);
      fixture.ir.meshBatches = input.artifacts.runtimeIr.meshBatches;
      return fixture;
    });
    const createFixture = vi.fn(async (input: CreateAssemblyHallFixtureInput) => {
      const fixture = p1SameIdentityFixture("fresh-packet", template);
      fixture.packedAtlas = input.reusableArtifacts!.packedAtlas!;
      fixture.catalog = input.reusableArtifacts!.catalog!;
      fixture.debugExport = input.reusableArtifacts!.debugExport!;
      return fixture;
    });
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture, restoreCompletedFamilyFixture });
    const restoring = controller.restoreCompletedFamilyPacket(packet);
    const adapterInput = restoreCompletedFamilyFixture.mock.calls[0][0];
    expect(adapterInput).not.toBe(packet);
    expect(adapterInput.artifacts.runtimeIr.meshBatches[0].positions?.buffer).not.toBe(positions.buffer);
    packet.requestHash = changedRequestHash;
    positions[0] = 99;
    adapterGate.resolve();
    const restored = await restoring;
    expect(restored.stale).toBe(false);
    expect(restored.fixture!.ir.meshBatches[0].positions?.[0]).toBe(1);
    const fresh = await controller.startDemoRun(prompt);
    expect(fresh.stale).toBe(false);
    expect(createFixture).toHaveBeenCalledTimes(1);
    expect(createFixture.mock.calls[0][0].reusableArtifacts?.packedAtlas).toBe(restored.fixture!.packedAtlas);
    expect(store.getState().controls.baselineStatus).toBe("known");
    controller.dispose();
  });

});


describe("P1 staged viewer activation", () => {
  it("keeps the old owner during preparation and finalizes it only after coherent publication", async () => {
    const first = fakeAssemblyFixture("view-old"), second = p1SameIdentityFixture("view-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    const initial = await controller.startDemoRun();
    const releaseOld = controller.acquireFixtureViewerLease(first);
    const ready = p1Deferred<PreparedBuildingFixtureView>();
    let releaseCandidate!: () => void;
    const prepare = vi.fn((fixture: AssemblyHallFixture) => { releaseCandidate = controller.acquireFixtureViewerLease(fixture); return ready.promise; });
    const unregister = controller.registerFixtureViewer(prepare);
    const order: string[] = [];
    const unsubscribe = store.subscribe((state) => { if (state.runs.status === "complete") { expect(registry.get(initial.artifactId!)).toBe(second); order.push("published"); } });
    const run = controller.startDemoRun();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(registry.get(initial.artifactId!)).toBe(first);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    const discard = vi.fn(() => releaseCandidate());
    ready.resolve({ commit: () => { order.push("commit"); return () => { order.push("finalize"); releaseOld(); }; }, discard });
    expect((await run).stale).toBe(false);
    expect(order).toEqual(["commit", "published", "finalize"]);
    expect(discard).not.toHaveBeenCalled();
    expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    unsubscribe(); unregister(); releaseCandidate(); controller.dispose();
  });

  it("retains the valid scene and aliases when candidate renderer preparation rejects", async () => {
    const first = fakeAssemblyFixture("reject-old"), second = p1SameIdentityFixture("reject-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    const initial = await controller.startDemoRun();
    const metadata = registry.listMetadata();
    const releaseOld = controller.acquireFixtureViewerLease(first);
    const gate = p1Deferred<void>();
    const prepare = vi.fn(async (fixture: AssemblyHallFixture) => { const release = controller.acquireFixtureViewerLease(fixture); await gate.promise; release(); throw new Error("new renderer failed"); });
    const unregister = controller.registerFixtureViewer(prepare);
    const run = controller.startDemoRun();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    const rejected = expect(run).rejects.toThrow("new renderer failed"); gate.resolve(); await rejected;
    expect(registry.get(initial.artifactId!)).toBe(first);
    expect(registry.listMetadata()).toEqual(metadata);
    expect(store.getState().runs.activeFixtureArtifactId).toBe(initial.artifactId);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    unregister(); controller.dispose(); releaseOld();
  });

  it("rolls back a temporary view switch when commit throws before aliases publish", async () => {
    const first = fakeAssemblyFixture("commit-old"), second = p1SameIdentityFixture("commit-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    const initial = await controller.startDemoRun();
    const releaseOld = controller.acquireFixtureViewerLease(first);
    let activeView = first;
    const discard = vi.fn();
    const unregister = controller.registerFixtureViewer(async (fixture) => {
      const release = controller.acquireFixtureViewerLease(fixture);
      return { commit: () => { activeView = fixture; throw new Error("commit failed"); }, discard: () => { activeView = first; discard(); release(); } };
    });
    await expect(controller.startDemoRun()).rejects.toThrow("commit failed");
    expect(activeView).toBe(first);
    expect(registry.get(initial.artifactId!)).toBe(first);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled();
    expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    unregister(); controller.dispose(); releaseOld();
  });

  it("continues without a detached provider and discards its late prepared result", async () => {
    const first = fakeAssemblyFixture("detach-old"), second = p1SameIdentityFixture("detach-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    await controller.startDemoRun(); const releaseOld = controller.acquireFixtureViewerLease(first);
    const gate = p1Deferred<PreparedBuildingFixtureView>();
    let releaseCandidate!: () => void; let signal!: AbortSignal;
    const prepare = vi.fn((fixture: AssemblyHallFixture, context: { signal: AbortSignal }) => { releaseCandidate = controller.acquireFixtureViewerLease(fixture); signal = context.signal; return gate.promise; });
    const unregister = controller.registerFixtureViewer(prepare);
    const run = controller.startDemoRun(); await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    unregister(); releaseOld();
    const accepted = await run;
    expect(accepted.stale).toBe(false); expect(signal.aborted).toBe(true);
    const commit = vi.fn(() => () => undefined), discard = vi.fn(() => releaseCandidate());
    gate.resolve({ commit, discard });
    await vi.waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    expect(commit).not.toHaveBeenCalled(); expect(registry.get(accepted.artifactId!)).toBe(second);
    controller.dispose(); expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
  });


  it("retries the current provider and never commits an obsolete provider result", async () => {
    const first = fakeAssemblyFixture("replace-old"), second = p1SameIdentityFixture("replace-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    await controller.startDemoRun(); const releaseOld = controller.acquireFixtureViewerLease(first);
    const gate = p1Deferred<PreparedBuildingFixtureView>();
    let releaseAbandoned!: () => void; let releaseCurrent!: () => void; let signal!: AbortSignal;
    const oldPrepare = vi.fn((fixture: AssemblyHallFixture, context: { signal: AbortSignal }) => { releaseAbandoned = controller.acquireFixtureViewerLease(fixture); signal = context.signal; return gate.promise; });
    const unregisterOld = controller.registerFixtureViewer(oldPrepare);
    let activeView = first;
    const run = controller.startDemoRun(); await vi.waitFor(() => expect(oldPrepare).toHaveBeenCalledTimes(1));
    const currentPrepare = vi.fn(async (fixture: AssemblyHallFixture) => {
      releaseCurrent = controller.acquireFixtureViewerLease(fixture);
      return { commit: () => { activeView = fixture; return () => releaseOld(); }, discard: () => { activeView = first; releaseCurrent(); } };
    });
    const unregisterCurrent = controller.registerFixtureViewer(currentPrepare); unregisterOld();
    const accepted = await run;
    expect(currentPrepare).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(true); expect(activeView).toBe(second);
    const commit = vi.fn(() => () => undefined), discard = vi.fn(() => releaseAbandoned());
    gate.resolve({ commit, discard }); await vi.waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    expect(commit).not.toHaveBeenCalled(); expect(activeView).toBe(second); expect(registry.get(accepted.artifactId!)).toBe(second);
    unregisterCurrent(); releaseCurrent(); controller.dispose();
  });

  it("returns accepted success and finalizes old view after a committed store observer throws", async () => {
    const first = fakeAssemblyFixture("observer-old"), second = p1SameIdentityFixture("observer-new", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) });
    await controller.startDemoRun(); const releaseOld = controller.acquireFixtureViewerLease(first);
    let releaseCandidate!: () => void;
    const finalize = vi.fn(() => releaseOld()), discard = vi.fn();
    const unregister = controller.registerFixtureViewer(async (fixture) => {
      releaseCandidate = controller.acquireFixtureViewerLease(fixture);
      return { commit: () => finalize, discard: () => { discard(); releaseCandidate(); } };
    });
    const unsubscribe = store.subscribe((state) => { if (state.runs.status === "complete") throw new Error("observer notification"); });
    const accepted = await controller.startDemoRun();
    expect(accepted.stale).toBe(false); expect(accepted.fixture).toBe(second);
    expect(store.getState().runs.status).toBe("complete"); expect(registry.get(accepted.artifactId!)).toBe(second);
    expect(finalize).toHaveBeenCalledTimes(1); expect(discard).not.toHaveBeenCalled(); expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    unsubscribe(); unregister(); releaseCandidate(); controller.dispose();
  });

  it("aborts pending viewer work on teardown and detaches its provider before the next setup", async () => {
    const first = fakeAssemblyFixture("teardown-old"), second = p1SameIdentityFixture("teardown-candidate", first), third = p1SameIdentityFixture("teardown-next", first);
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const controller = new BuildingRunController({ store, registry, createFixture: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third) });
    await controller.startDemoRun(); const releaseOld = controller.acquireFixtureViewerLease(first);
    const gate = p1Deferred<PreparedBuildingFixtureView>();
    let releaseCandidate!: () => void; let signal!: AbortSignal;
    const prepare = vi.fn((fixture: AssemblyHallFixture, context: { signal: AbortSignal }) => { releaseCandidate = controller.acquireFixtureViewerLease(fixture); signal = context.signal; return gate.promise; });
    const unregister = controller.registerFixtureViewer(prepare);
    const pending = controller.startDemoRun(); await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    controller.dispose(); expect((await pending).stale).toBe(true); expect(signal.aborted).toBe(true);
    expect(first.familyRuntime.dispose).not.toHaveBeenCalled(); expect(second.familyRuntime.dispose).not.toHaveBeenCalled();
    const accepted = await controller.startDemoRun();
    expect(prepare).toHaveBeenCalledTimes(1); expect(accepted.fixture).toBe(third);
    const commit = vi.fn(() => () => undefined), discard = vi.fn(() => releaseCandidate());
    gate.resolve({ commit, discard }); await vi.waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    releaseOld(); unregister();
    expect(commit).not.toHaveBeenCalled(); expect(first.familyRuntime.dispose).toHaveBeenCalledTimes(1); expect(second.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(registry.get(accepted.artifactId!)).toBe(third);
    controller.dispose(); expect(third.familyRuntime.dispose).toHaveBeenCalledTimes(1);
  });
});

function p3SourcePrompt(windowFamily: ReturnType<typeof p1Prompt>["windowFamily"] = "tall-arched") {
  const prompt = p1Prompt();
  prompt.windowFamily = windowFamily;
  prompt.seeds = { ...prompt.seeds, family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" };
  return prompt;
}
async function p3SourceHarness(documentId: string, put?: () => Promise<void>) {
  const { createAssemblyHallFixture } = await import("../ui/assemblyHallFixture");
  const store = createBuildingStore();
  store.getState().selectDocument(documentId);
  const registry = new BuildingArtifactRegistry();
  const fixtures: AssemblyHallFixture[] = [];
  const disposals = new Map<AssemblyHallFixture, number>();
  const createFixture = vi.fn(async (input: CreateAssemblyHallFixtureInput) => {
    const fixture = await createAssemblyHallFixture(input);
    const dispose = fixture.familyRuntime.dispose.bind(fixture.familyRuntime);
    vi.spyOn(fixture.familyRuntime, "dispose").mockImplementation(() => {
      disposals.set(fixture, (disposals.get(fixture) ?? 0) + 1);
      return dispose();
    });
    fixtures.push(fixture);
    return fixture;
  });
  const controller = new BuildingRunController({ store, registry, createFixture, ...(put ? { completedFamilyPersistence: { put } } : {}) });
  return { store, registry, controller, fixtures, disposals, createFixture };
}
async function p3StartedSource(documentId: string, windowFamily: ReturnType<typeof p1Prompt>["windowFamily"] = "tall-arched", put?: () => Promise<void>) {
  const context = await p3SourceHarness(documentId, put);
  const prompt = p3SourcePrompt(windowFamily);
  try {
    await context.controller.startDemoRun(prompt);
    const saved = await context.controller.exportSourceFile();
    return { ...context, prompt, saved, file: p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents)) };
  } catch (error) { context.controller.dispose(); throw error; }
}
async function p3PortableSource(documentId: string, windowFamily: ReturnType<typeof p1Prompt>["windowFamily"] = "tall-rectangular") {
  const context = await p3StartedSource(documentId, windowFamily);
  try { return { saved: context.saved, file: context.file, snapshot: context.fixtures[0].sourceSnapshot }; }
  finally { context.controller.dispose(); }
}

describe("building source ownership transactions", () => {
  it("opens an owned authored source through a fresh compile with exact material bytes and no provider calls", async () => {
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const context = await p3SourceHarness("source-roundtrip");
    try {
      const prompt = p3SourcePrompt();
      const expected = structuredClone(prompt);
      const run = context.controller.startDemoRun(prompt);
      prompt.seeds.building = "late-caller-mutation";
      prompt.windowFamily = "tall-rectangular";
      prompt.lockedComponentKeys.push("late-caller-lock");
      await run;
      const original = context.fixtures[0];
      expect(original.sourceSnapshot?.controlsView).toEqual(expected);
      expect(original.spec.selectedFamilies.window).toBe("tall-arched");
      const names = ["baseColor", "height", "normal", "opacity", "orm"] as const;
      const originalChannels = names.map((name) => ({ name, widthPx: original.packedAtlas.channels[name].widthPx, heightPx: original.packedAtlas.channels[name].heightPx, bytes: Uint8Array.from(original.packedAtlas.channels[name].data) }));
      const saved = await context.controller.exportSourceFile();
      const file = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
      expect(file.source).toEqual(original.sourceSnapshot);
      const callsBeforeOpen = generate.mock.calls.length;
      expect(callsBeforeOpen).toBeGreaterThan(0);
      const opened = await context.controller.openSourceFile({ readText: async () => saved.contents });
      expect(opened.stale).toBe(false);
      expect(context.fixtures).toHaveLength(2);
      const fresh = context.fixtures[1];
      expect(fresh).not.toBe(original);
      expect(fresh.ir).not.toBe(original.ir);
      expect(fresh.ir.buildingId).toBe(original.ir.buildingId);
      expect(fresh.sourceSnapshot).toEqual(file.source);
      expect(fresh.spec.selectedFamilies.window).toBe("tall-arched");
      expect(generate.mock.calls.length).toBe(callsBeforeOpen);
      for (const channel of originalChannels) {
        const actual = fresh.packedAtlas.channels[channel.name];
        expect(actual.widthPx).toBe(channel.widthPx);
        expect(actual.heightPx).toBe(channel.heightPx);
        expect(actual.data.byteLength).toBe(channel.bytes.byteLength);
        expect(actual.data.every((value, index) => value === channel.bytes[index])).toBe(true);
      }
      const savedAgain = await context.controller.exportSourceFile();
      expect(savedAgain.documentId).toBe(saved.documentId);
      expect(savedAgain.revision).toBe(saved.revision);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(savedAgain.contents))).toEqual(file);
    } finally { context.controller.dispose(); generate.mockRestore(); }
  }, 20000);

  it("keeps the source revision for identical inputs and increments only an accepted changed source", async () => {
    const context = await p3StartedSource("source-revisions");
    try {
      await context.controller.startDemoRun(context.prompt);
      const same = await context.controller.exportSourceFile();
      expect(same.documentId).toBe(context.saved.documentId);
      expect(same.revision).toBe(context.saved.revision);
      const rejected = new Error("revision candidate rejected");
      const unregister = context.controller.registerFixtureViewer(async () => { throw rejected; });
      try {
        await expect(context.controller.startDemoRun({ ...context.prompt, windowFamily: "tall-rectangular" })).rejects.toBe(rejected);
        expect((await context.controller.exportSourceFile()).revision).toBe(same.revision);
      } finally { unregister(); }
      await context.controller.startDemoRun({ ...context.prompt, windowFamily: "tall-rectangular" });
      const changed = await context.controller.exportSourceFile();
      expect(changed.documentId).toBe(same.documentId);
      expect(changed.revision).toBe(same.revision + 1);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(changed.contents)).source.controlsView.windowFamily).toBe("tall-rectangular");
    } finally { context.controller.dispose(); }
  }, 20000);

  it("does not fabricate source authority for an accepted fixture without a captured source", async () => {
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
    const fixture = fakeAssemblyFixture("no-source-authority");
    const controller = new BuildingRunController({ store, registry, createFixture: async () => fixture });
    try {
      await controller.startDemoRun(p1Prompt());
      await expect(controller.exportSourceFile()).rejects.toMatchObject({ code: "building.sourceUnavailable" });
      expect(fixture.familyRuntime.dispose).not.toHaveBeenCalled();
    } finally { controller.dispose(); }
  });

  it("retains the current source and fixture when portable content verification fails", async () => {
    const context = await p3StartedSource("source-invalid-content");
    try {
      const invalid = JSON.parse(context.saved.contents);
      invalid.contentHash = "0".repeat(64);
      await expect(context.controller.openSourceFile({ readText: async () => JSON.stringify(invalid) })).rejects.toMatchObject({ code: "building.sourceFileInvalid" });
      expect(context.fixtures).toHaveLength(1);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      expect(context.store.getState().selection.documentId).toBe(context.saved.documentId);
      const retained = await context.controller.exportSourceFile();
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(context.file);
    } finally { context.controller.dispose(); }
  }, 20000);

  it("retains the old authored source when a different-document candidate renderer rejects", async () => {
    const incoming = await p3PortableSource("source-renderer-incoming");
    const context = await p3StartedSource("source-renderer-current");
    const failure = new Error("source renderer preparation failed");
    const unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
    try {
      await expect(context.controller.openSourceFile({ readText: async () => incoming.saved.contents })).rejects.toBe(failure);
      expect(context.fixtures).toHaveLength(2);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      expect(context.disposals.get(context.fixtures[1])).toBe(1);
      expect(context.store.getState().selection.documentId).toBe(context.saved.documentId);
      const retained = await context.controller.exportSourceFile();
      expect(retained.documentId).toBe(context.saved.documentId);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(context.file);
    } finally { unregister(); context.controller.dispose(); }
  }, 20000);
  it.each(["newer-run", "newer-open", "cancel"] as const)("discards a late source reader after %s", async (action) => {
    const incoming = await p3PortableSource(`source-late-incoming-${action}`);
    const context = await p3StartedSource(`source-late-current-${action}`);
    const held = p1Deferred<string>();
    const readText = vi.fn(() => held.promise);
    let opening: ReturnType<BuildingRunController["openSourceFile"]> | undefined;
    try {
      opening = context.controller.openSourceFile({ readText });
      await vi.waitFor(() => expect(readText).toHaveBeenCalledTimes(1));
      if (action === "newer-run") await context.controller.startDemoRun({ ...context.prompt, windowFamily: "tall-rectangular" });
      else if (action === "newer-open") await context.controller.openSourceFile({ readText: async () => incoming.saved.contents });
      else context.controller.cancelActiveRun();
      const expected = await context.controller.exportSourceFile();
      const fixtureCount = context.fixtures.length;
      held.resolve(incoming.saved.contents);
      expect((await opening).stale).toBe(true);
      expect(context.fixtures).toHaveLength(fixtureCount);
      expect(context.store.getState().selection.documentId).toBe(expected.documentId);
      const retained = await context.controller.exportSourceFile();
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(expected.contents)));
    } finally {
      held.resolve(incoming.saved.contents);
      context.controller.dispose();
      await opening?.catch(() => undefined);
    }
  }, 20000);

  it("publishes different-document source, controls and selection together after deferred persistence", async () => {
    const incoming = await p3PortableSource("source-atomic-incoming");
    const held = p1Deferred<void>();
    const put = vi.fn(async (): Promise<void> => undefined);
    const context = await p3StartedSource("source-atomic-current", "tall-arched", put);
    const observations: Array<{ documentId: string; windowFamily: string | null }> = [];
    const unsubscribe = context.store.subscribe((next) => observations.push({ documentId: next.selection.documentId, windowFamily: next.controls.committedPrompt?.windowFamily ?? null }));
    let opening: ReturnType<BuildingRunController["openSourceFile"]> | undefined;
    try {
      put.mockImplementationOnce(() => held.promise);
      opening = context.controller.openSourceFile({ readText: async () => incoming.saved.contents });
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
      expect(context.store.getState().selection.documentId).toBe(context.saved.documentId);
      expect(context.store.getState().controls.committedPrompt?.windowFamily).toBe("tall-arched");
      expect((await context.controller.exportSourceFile()).documentId).toBe(context.saved.documentId);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      held.resolve();
      expect((await opening).stale).toBe(false);
      const accepted = observations.filter((entry) => entry.windowFamily === "tall-rectangular");
      expect(accepted.length).toBeGreaterThan(0);
      expect(accepted.every((entry) => entry.documentId === incoming.saved.documentId)).toBe(true);
      expect(context.store.getState().selection.documentId).toBe(incoming.saved.documentId);
      expect(context.store.getState().controls.committedPrompt).toEqual(incoming.snapshot?.controlsView);
      expect((await context.controller.exportSourceFile()).documentId).toBe(incoming.saved.documentId);
    } finally { held.resolve(); unsubscribe(); context.controller.dispose(); await opening?.catch(() => undefined); }
  }, 20000);

  it("preserves a newer draft while the opened source becomes the accepted baseline", async () => {
    const incoming = await p3PortableSource("source-draft-incoming");
    const context = await p3StartedSource("source-draft-current");
    const ready = p1Deferred<PreparedBuildingFixtureView>();
    const handle = { commit: () => () => undefined, discard: vi.fn() };
    const prepare = vi.fn(() => ready.promise);
    const unregister = context.controller.registerFixtureViewer(prepare);
    let opening: ReturnType<BuildingRunController["openSourceFile"]> | undefined;
    try {
      opening = context.controller.openSourceFile({ readText: async () => incoming.saved.contents });
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
      context.store.getState().updatePromptControls({ bayCount: 9 });
      ready.resolve(handle);
      expect((await opening).stale).toBe(false);
      expect(context.store.getState().prompt.bayCount).toBe(9);
      expect(context.store.getState().controls.committedPrompt).toEqual(incoming.snapshot?.controlsView);
      expect(context.store.getState().controls.invalidation.changedControls).toContain("bayCount");
      const saved = await context.controller.exportSourceFile();
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents)).source.controlsView).toEqual(incoming.snapshot?.controlsView);
    } finally { ready.resolve(handle); unregister(); context.controller.dispose(); await opening?.catch(() => undefined); }
  }, 20000);

  it("keeps the exact clicked source owner leased until an asynchronous Save finishes", async () => {
    const context = await p3StartedSource("source-save-owner");
    type Encoded = Awaited<ReturnType<typeof p3SourceCodec.createBuildingSourceFile>>;
    const encodedReady = p1Deferred<Encoded>(), releaseEncoding = p1Deferred<Encoded>();
    const originalCreate = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementationOnce(async (...args) => {
      const encoded = await originalCreate(...args);
      encodedReady.resolve(encoded);
      return releaseEncoding.promise;
    });
    let saving: ReturnType<BuildingRunController["exportSourceFile"]> | undefined;
    let encoded: Encoded | undefined;
    try {
      saving = context.controller.exportSourceFile();
      encoded = await Promise.race([encodedReady.promise, saving.then(() => { throw new Error("Save escaped the held codec"); })]);
      await context.controller.startDemoRun({ ...context.prompt, windowFamily: "tall-rectangular" });
      expect(context.fixtures).toHaveLength(2);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      releaseEncoding.resolve(encoded);
      const saved = await saving;
      expect(saved.documentId).toBe(context.saved.documentId);
      expect(saved.revision).toBe(context.saved.revision);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents))).toEqual(context.file);
      expect(context.disposals.get(context.fixtures[0])).toBe(1);
      const current = await context.controller.exportSourceFile();
      expect(current.revision).toBe(context.saved.revision + 1);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(current.contents)).source.controlsView.windowFamily).toBe("tall-rectangular");
    } finally {
      if (encoded) releaseEncoding.resolve(encoded);
      context.controller.dispose();
      await saving?.catch(() => undefined);
      encode.mockRestore();
    }
  }, 20000);
});

describe("building source adapter receipt validation", () => {
  it.each(["missing", "different"] as const)("rejects a candidate with a %s source snapshot and disposes its owned runtime", async (kind) => {
    const incoming = await p3PortableSource(`source-receipt-incoming-${kind}`);
    const context = await p3StartedSource(`source-receipt-current-${kind}`);
    const create = context.createFixture.getMockImplementation();
    if (!create) { context.controller.dispose(); throw new Error("Expected the real fixture adapter"); }
    context.createFixture.mockImplementationOnce(async (input) => {
      const fixture = await create(input);
      const candidate = { ...fixture };
      if (kind === "missing") Reflect.deleteProperty(candidate, "sourceSnapshot");
      else Object.defineProperty(candidate, "sourceSnapshot", { configurable: true, enumerable: true, writable: true, value: context.fixtures[0].sourceSnapshot });
      return candidate;
    });
    try {
      await expect(context.controller.openSourceFile({ readText: async () => incoming.saved.contents })).rejects.toBeInstanceOf(Error);
      expect(context.fixtures).toHaveLength(2);
      expect(context.disposals.get(context.fixtures[1])).toBe(1);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      expect(context.store.getState().selection.documentId).toBe(context.saved.documentId);
      expect(context.store.getState().controls.committedPrompt).toEqual(context.file.source.controlsView);
      const retained = await context.controller.exportSourceFile();
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(context.file);
    } finally { context.controller.dispose(); }
  }, 20000);
});

async function p4PortablePinnedStyle(documentId = "p4-pinned-dependencies") {
  const { createAssemblyHallFixture } = await import("../ui/assemblyHallFixture");
  const controls = p3SourcePrompt();
  const seedFixture = await createAssemblyHallFixture({ promptControls: controls });
  let pinnedFixture: AssemblyHallFixture | undefined;
  try {
    const captured = seedFixture.sourceSnapshot;
    if (!captured) throw new Error("Expected the generated fixture to capture its source");
    const stylePack = {
      ...captured.stylePack,
      massing: {
        ...captured.stylePack.massing,
        floorHeightM: {
          ...captured.stylePack.massing.floorHeightM,
          typical: {
            ...captured.stylePack.massing.floorHeightM.typical,
            min: 4.25,
            max: 4.25,
          },
        },
      },
    };
    const prepared = await p3SourceCodec.createBuildingSourceSnapshot({
      documentId,
      revision: 7,
      controls,
      intent: captured.intent,
      stylePack,
    });
    pinnedFixture = await createAssemblyHallFixture({
      sourceSnapshot: prepared.sourceSnapshot,
      reusableArtifacts: {
        packedAtlas: seedFixture.packedAtlas,
        debugExport: seedFixture.debugExport,
      },
    });
    expect(pinnedFixture.spec).toEqual(prepared.spec);
    const pinnedSource = pinnedFixture.sourceSnapshot;
    if (!pinnedSource) throw new Error("Expected a source-backed compiled fixture");
    const file = p3SourceCodec.BuildingSourceFileSchema.parse(await p3SourceCodec.createBuildingSourceFile({
      sourceSnapshot: pinnedSource,
      packedAtlas: pinnedFixture.packedAtlas,
      debugExport: pinnedFixture.debugExport,
    }));
    return { controls, file, contents: JSON.stringify(file), spec: prepared.spec };
  } finally {
    pinnedFixture?.familyRuntime.dispose();
    seedFixture.familyRuntime.dispose();
  }
}

describe("source-backed pinned dependency reuse", () => {
  it("retains a source file's pinned style during identical regeneration", async () => {
    const portable = await p4PortablePinnedStyle();
    const context = await p3SourceHarness("p4-red-before-open");
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      expect(context.fixtures).toHaveLength(1);
      const opened = context.fixtures[0];
      expect(opened.sourceSnapshot).toEqual(portable.file.source);
      expect(opened.spec).toEqual(portable.spec);
      expect(opened.sourceSnapshot?.stylePack.massing.floorHeightM.typical).toEqual({ min: 4.25, max: 4.25 });
      expect(context.store.getState().selection.documentId).toBe(portable.file.source.document.documentId);
      expect(context.store.getState().controls.baselineStatus).toBe("known");
      expect(context.store.getState().controls.committedPrompt).toEqual(portable.controls);
      const beforeSave = await context.controller.exportSourceFile();
      expect(beforeSave.revision).toBe(7);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(beforeSave.contents))).toEqual(portable.file);

      await context.controller.startDemoRun(portable.controls);
      expect(context.fixtures).toHaveLength(2);
      const regenerated = context.fixtures[1];
      expect(regenerated).not.toBe(opened);
      expect(regenerated.ir).not.toBe(opened.ir);
      // This is the causal red assertion: Open accepted the custom style above.
      expect(regenerated.sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
      expect(regenerated.spec).toEqual(portable.spec);
      expect(regenerated.sourceSnapshot?.document.documentId).toBe(portable.file.source.document.documentId);
      expect(regenerated.sourceSnapshot?.document.revision).toBe(7);
      const afterSave = await context.controller.exportSourceFile();
      expect(afterSave.documentId).toBe(beforeSave.documentId);
      expect(afterSave.revision).toBe(7);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(afterSave.contents))).toEqual(portable.file);
    } finally {
      context.controller.dispose();
    }
  }, 20000);
});

function p4CopyMaterialBytes(fixture: AssemblyHallFixture) {
  const names = ["baseColor", "height", "normal", "opacity", "orm"] as const;
  expect(Object.keys(fixture.packedAtlas.channels).sort()).toEqual([...names].sort());
  return names.map((name) => {
    const layer = fixture.packedAtlas.channels[name];
    return { name, widthPx: layer.widthPx, heightPx: layer.heightPx, data: Uint8Array.from(layer.data) };
  });
}

function p4ExpectMaterialBytes(fixture: AssemblyHallFixture, expected: ReturnType<typeof p4CopyMaterialBytes>) {
  expect(Object.keys(fixture.packedAtlas.channels).sort()).toEqual(expected.map((row) => row.name).sort());
  for (const row of expected) {
    const layer = fixture.packedAtlas.channels[row.name];
    expect(layer.widthPx).toBe(row.widthPx);
    expect(layer.heightPx).toBe(row.heightPx);
    expect(layer.data.length).toBe(row.data.length);
    expect(layer.data.every((value, index) => value === row.data[index])).toBe(true);
  }
}

describe("pinned source regeneration eligibility", () => {
  it("reuses pinned dependencies and all five material buffers across unchanged and window-only Save/Open", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      const portable = await p4PortablePinnedStyle("p4-byte-preserving-source");
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate.mock.calls.length).toBeGreaterThan(0);
      interpret.mockClear();
      generate.mockClear();
      const context = await p3SourceHarness("p4-byte-receiver-before-open");
      try {
        await context.controller.openSourceFile({ readText: async () => portable.contents });
        const opened = context.fixtures[0];
        const originalBytes = p4CopyMaterialBytes(opened);
        expect(interpret).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        await context.controller.startDemoRun(portable.controls);
        const identical = context.fixtures[1];
        expect(identical.ir).not.toBe(opened.ir);
        expect(identical.spec).toEqual(portable.spec);
        expect(identical.sourceSnapshot).toEqual(portable.file.source);
        p4ExpectMaterialBytes(identical, originalBytes);
        const unchanged = await context.controller.exportSourceFile();
        expect(unchanged.revision).toBe(7);
        expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(unchanged.contents))).toEqual(portable.file);

        const next = structuredClone(portable.controls);
        next.windowFamily = "tall-rectangular";
        await context.controller.startDemoRun(next);
        const changed = context.fixtures[2];
        expect(changed.ir).not.toBe(identical.ir);
        expect(changed.spec.selectedFamilies.window).toBe("tall-rectangular");
        expect(changed.spec.massing).toEqual(opened.spec.massing);
        expect(changed.sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
        expect(changed.sourceSnapshot?.compilation).toEqual(portable.file.source.compilation);
        expect(changed.sourceSnapshot?.controlsView).toEqual(next);
        expect(changed.sourceSnapshot?.intent).toMatchObject({ requested: { windowFamily: "tall-rectangular" } });
        expect(changed.sourceSnapshot?.document.documentId).toBe(portable.file.source.document.documentId);
        expect(changed.sourceSnapshot?.document.revision).toBe(8);
        p4ExpectMaterialBytes(changed, originalBytes);
        const saved = await context.controller.exportSourceFile();
        expect(saved.documentId).toBe(unchanged.documentId);
        expect(saved.revision).toBe(8);
        const savedFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
        expect(savedFile.source.stylePack).toEqual(portable.file.source.stylePack);
        const receiver = await p3SourceHarness("p4-different-open-receiver");
        try {
          await receiver.controller.openSourceFile({ readText: async () => saved.contents });
          expect(receiver.store.getState().selection.documentId).toBe(saved.documentId);
          expect(receiver.fixtures[0].ir).not.toBe(changed.ir);
          expect(receiver.fixtures[0].spec).toEqual(changed.spec);
          expect(receiver.fixtures[0].sourceSnapshot).toEqual(savedFile.source);
          p4ExpectMaterialBytes(receiver.fixtures[0], originalBytes);
          const savedAgain = await receiver.controller.exportSourceFile();
          expect(savedAgain.revision).toBe(8);
          expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(savedAgain.contents))).toEqual(savedFile);
        } finally {
          receiver.controller.dispose();
        }
        expect(interpret).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
      } finally {
        context.controller.dispose();
      }
    } finally {
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);

  it("keeps the accepted pinned source and revision when a prepared viewer rejects its replacement", async () => {
    const portable = await p4PortablePinnedStyle("p4-viewer-rejection");
    const context = await p3SourceHarness("p4-rejection-before-open");
    let unregister: (() => void) | undefined;
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const original = context.fixtures[0];
      const bytes = p4CopyMaterialBytes(original);
      const failure = new Error("P4 candidate viewer rejected");
      unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
      const next = structuredClone(portable.controls);
      next.windowFamily = "tall-rectangular";
      await expect(context.controller.startDemoRun(next)).rejects.toBe(failure);
      expect(context.fixtures).toHaveLength(2);
      expect(context.fixtures[1].sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
      expect(context.disposals.get(context.fixtures[1])).toBe(1);
      expect(context.disposals.get(original) ?? 0).toBe(0);
      expect(context.store.getState().selection.documentId).toBe(portable.file.source.document.documentId);
      expect(context.store.getState().controls.committedPrompt).toEqual(portable.controls);
      const retained = await context.controller.exportSourceFile();
      expect(retained.revision).toBe(7);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(portable.file);
      p4ExpectMaterialBytes(original, bytes);
      unregister();
      unregister = undefined;
      await context.controller.startDemoRun(next);
      expect(context.fixtures[2].sourceSnapshot?.document.revision).toBe(8);
      expect(context.fixtures[2].sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
      p4ExpectMaterialBytes(context.fixtures[2], bytes);
    } finally {
      unregister?.();
      context.controller.dispose();
    }
  }, 20000);

  it("disposes a stale compiled window candidate once while preserving the newer pinned source", async () => {
    const portable = await p4PortablePinnedStyle("p4-stale-compiled-candidate");
    const context = await p3SourceHarness("p4-stale-before-open");
    const ready = p1Deferred<AssemblyHallFixture>();
    const release = p1Deferred<void>();
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const bytes = p4CopyMaterialBytes(context.fixtures[0]);
      const create = context.createFixture.getMockImplementation();
      if (!create) throw new Error("Expected the real source fixture adapter");
      context.createFixture.mockImplementationOnce(async (input) => {
        const candidate = await create(input);
        ready.resolve(candidate);
        await release.promise;
        return candidate;
      });
      const next = structuredClone(portable.controls);
      next.windowFamily = "tall-rectangular";
      pending = context.controller.startDemoRun(next);
      const candidate = await Promise.race([ready.promise, pending.then(() => { throw new Error("Candidate run settled before its release"); })]);
      expect(candidate.sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
      await context.controller.startDemoRun(portable.controls);
      expect(context.fixtures).toHaveLength(3);
      release.resolve();
      expect((await pending).stale).toBe(true);
      expect(context.disposals.get(candidate)).toBe(1);
      expect(context.disposals.get(context.fixtures[2]) ?? 0).toBe(0);
      expect(context.fixtures[2].sourceSnapshot).toEqual(portable.file.source);
      p4ExpectMaterialBytes(context.fixtures[2], bytes);
      const retained = await context.controller.exportSourceFile();
      expect(retained.revision).toBe(7);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(portable.file);
    } finally {
      release.resolve();
      context.controller.dispose();
      await pending?.catch(() => undefined);
    }
  }, 20000);

  it("does not create a fixture after a canceled pinned window derivation finishes late", async () => {
    const portable = await p4PortablePinnedStyle("p4-stale-derived-source");
    const context = await p3SourceHarness("p4-derive-before-open");
    const derive = p3SourceCodec.deriveBuildingSourceWindowEdit;
    type Derived = Awaited<ReturnType<typeof derive>>;
    const ready = p1Deferred<Derived>();
    const release = p1Deferred<Derived>();
    let derivedValue: Derived | undefined;
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    const held = vi.spyOn(p3SourceCodec, "deriveBuildingSourceWindowEdit").mockImplementationOnce(async (input) => {
      derivedValue = await derive(input);
      ready.resolve(derivedValue);
      return release.promise;
    });
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const next = structuredClone(portable.controls);
      next.windowFamily = "tall-rectangular";
      pending = context.controller.startDemoRun(next);
      const actualDerived = await Promise.race([ready.promise, pending.then(() => { throw new Error("Derived run settled before its release"); })]);
      expect(actualDerived.stylePack).toEqual(portable.file.source.stylePack);
      context.controller.cancelActiveRun();
      release.resolve(actualDerived);
      expect((await pending).stale).toBe(true);
      expect(context.fixtures).toHaveLength(1);
      expect(context.disposals.get(context.fixtures[0]) ?? 0).toBe(0);
      const retained = await context.controller.exportSourceFile();
      expect(retained.revision).toBe(7);
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(retained.contents))).toEqual(portable.file);
    } finally {
      if (derivedValue) release.resolve(derivedValue);
      context.controller.dispose();
      await pending?.catch(() => undefined);
      held.mockRestore();
    }
  }, 20000);

  it.each(["structural", "material"] as const)("uses the existing normal path for a non-window %s control change", async (kind) => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const portable = await p4PortablePinnedStyle("p4-other-control-" + kind);
    const context = await p3SourceHarness("p4-other-control-before-open");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const bytes = p4CopyMaterialBytes(context.fixtures[0]);
      interpret.mockClear();
      generate.mockClear();
      const next = structuredClone(portable.controls);
      if (kind === "structural") next.detailLevel = "low";
      else next.seeds.material = "p4-changed-material-seed";
      await context.controller.startDemoRun(next);
      expect(context.fixtures).toHaveLength(2);
      const candidate = context.fixtures[1];
      expect(candidate.ir).not.toBe(context.fixtures[0].ir);
      expect(candidate.sourceSnapshot?.controlsView).toEqual(next);
      expect(candidate.sourceSnapshot?.document.documentId).toBe(portable.file.source.document.documentId);
      expect(context.createFixture.mock.calls[1][0].sourceSnapshot).toBeUndefined();
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      if (kind === "structural") {
        expect(generate).not.toHaveBeenCalled();
        p4ExpectMaterialBytes(candidate, bytes);
      } else {
        expect(generate.mock.calls.length).toBeGreaterThan(0);
      }
    } finally {
      context.controller.dispose();
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);

  it("uses the normal target-document path after navigation retains a different document's source", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const portable = await p4PortablePinnedStyle("p4-source-document-a");
    const context = await p3SourceHarness("p4-route-before-open");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const bytes = p4CopyMaterialBytes(context.fixtures[0]);
      context.store.getState().selectDocument("p4-target-document-b");
      interpret.mockClear();
      const result = await context.controller.startDemoRun(portable.controls);
      expect(result.stale).toBe(false);
      expect(context.fixtures).toHaveLength(2);
      const candidate = context.fixtures[1];
      expect(context.createFixture.mock.calls[1][0].sourceSnapshot).toBeUndefined();
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(candidate.sourceSnapshot?.document.documentId).toBe("p4-target-document-b");
      expect(candidate.sourceSnapshot?.stylePack).not.toEqual(portable.file.source.stylePack);
      expect(context.store.getState().selection.documentId).toBe("p4-target-document-b");
      p4ExpectMaterialBytes(candidate, bytes);
      expect((await context.controller.exportSourceFile()).documentId).toBe("p4-target-document-b");
    } finally {
      context.controller.dispose();
      interpret.mockRestore();
    }
  }, 20000);

  it("keeps source-less completed restoration on its existing exact-request normal path", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { createCompletedFamilyPersistencePacket } = await import("../state/completedFamilyPersistence");
    const { restoreAssemblyHallFixtureFromCompletedFamilyPacket } = await import("../ui/assemblyHallFixture");
    const portable = await p4PortablePinnedStyle("p4-completed-source-less");
    const context = await p3SourceHarness("p4-completed-before-open");
    context.controller.dispose();
    context.controller = new BuildingRunController({
      store: context.store,
      registry: context.registry,
      createFixture: context.createFixture,
      restoreCompletedFamilyFixture: restoreAssemblyHallFixtureFromCompletedFamilyPacket,
    });
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const original = context.fixtures[0];
      const bytes = p4CopyMaterialBytes(original);
      const requestHash = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo", prompt: portable.controls });
      const packet = await createCompletedFamilyPersistencePacket({ documentId: portable.file.source.document.documentId, runId: "p4-completed-run", requestHash, fixture: original });
      await context.controller.restoreCompletedFamilyPacket(packet);
      await expect(context.controller.exportSourceFile()).rejects.toMatchObject({ code: "building.sourceUnavailable" });
      expect(context.store.getState().controls.baselineStatus).toBe("unknown");
      expect(context.store.getState().controls.committedPrompt).toBeUndefined();
      interpret.mockClear();
      generate.mockClear();
      const callsBefore = context.createFixture.mock.calls.length;
      const result = await context.controller.startDemoRun(portable.controls);
      expect(result.stale).toBe(false);
      expect(context.createFixture.mock.calls).toHaveLength(callsBefore + 1);
      expect(context.createFixture.mock.calls[callsBefore][0].sourceSnapshot).toBeUndefined();
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate).not.toHaveBeenCalled();
      const candidate = context.fixtures[context.fixtures.length - 1];
      expect(candidate.sourceSnapshot?.stylePack).not.toEqual(portable.file.source.stylePack);
      expect(candidate.sourceSnapshot?.controlsView).toEqual(portable.controls);
      p4ExpectMaterialBytes(candidate, bytes);
      expect(context.store.getState().controls.baselineStatus).toBe("known");
      expect(context.store.getState().controls.committedPrompt).toEqual(portable.controls);
    } finally {
      context.controller.dispose();
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);
});

describe("pinned floor source continuation", () => {
  it("retains a source file's pinned style during a floor-count edit", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      const portable = await p4PortablePinnedStyle("p5-pinned-floor-source");
      expect(portable.file.schemaVersion).toBe("0.1.0");
      expect(portable.file.model).toBe("building-window-source-v1");
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate.mock.calls.length).toBeGreaterThan(0);
      interpret.mockClear();
      generate.mockClear();
      const context = await p3SourceHarness("p5-red-before-open");
      try {
        await context.controller.openSourceFile({ readText: async () => portable.contents });
        const opened = context.fixtures[0];
        const materials = p4CopyMaterialBytes(opened);
        expect(opened.sourceSnapshot).toEqual(portable.file.source);
        expect(opened.spec).toEqual(portable.spec);
        expect(opened.sourceSnapshot?.document.revision).toBe(7);
        expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse((await context.controller.exportSourceFile()).contents))).toEqual(portable.file);
        expect(interpret).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        const next = structuredClone(portable.controls);
        next.floorCount += 1;
        await context.controller.startDemoRun(next);
        expect(context.fixtures).toHaveLength(2);
        const changed = context.fixtures[1];
        expect(changed.ir).not.toBe(opened.ir);
        expect(changed.sourceSnapshot?.stylePack).toEqual(portable.file.source.stylePack);
        expect(changed.sourceSnapshot?.schemaVersion).toBe("0.2.0");
        expect(changed.sourceSnapshot?.document.authored.floorCount).toBe(next.floorCount);
        expect(changed.sourceSnapshot?.document.authored.windowFamily).toBe(portable.controls.windowFamily);
        expect(changed.sourceSnapshot?.intent.requested.floorCount).toBe(next.floorCount);
        expect(changed.sourceSnapshot?.controlsView).toEqual(next);
        expect(changed.sourceSnapshot?.compilation).toEqual(portable.file.source.compilation);
        expect(changed.sourceSnapshot?.document.documentId).toBe(portable.file.source.document.documentId);
        expect(changed.sourceSnapshot?.document.revision).toBe(8);
        expect(changed.spec.massing.floorHeightsM).toHaveLength(next.floorCount);
        expect(changed.spec.massing.floorHeightsM.slice(1).every(value => value === 4.25)).toBe(true);
        const originalPositions = opened.ir.meshBatches.flatMap(batch => Array.from(batch.positions ?? []));
        const changedPositions = changed.ir.meshBatches.flatMap(batch => Array.from(batch.positions ?? []));
        expect(originalPositions.length).toBeGreaterThan(0);
        expect(changedPositions.length).toBeGreaterThan(0);
        expect(changedPositions).not.toEqual(originalPositions);
        p4ExpectMaterialBytes(changed, materials);
        const saved = await context.controller.exportSourceFile();
        const savedFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
        expect(savedFile.schemaVersion).toBe("0.2.0");
        expect(savedFile.model).toBe("building-window-floor-source-v2");
        expect(saved.revision).toBe(8);
        const receiver = await p3SourceHarness("p5-floor-reopen-receiver");
        try {
          await receiver.controller.openSourceFile({ readText: async () => saved.contents });
          expect(receiver.fixtures[0].ir).not.toBe(changed.ir);
          expect(receiver.fixtures[0].spec).toEqual(changed.spec);
          expect(receiver.fixtures[0].sourceSnapshot).toEqual(savedFile.source);
          p4ExpectMaterialBytes(receiver.fixtures[0], materials);
          expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
        } finally {
          receiver.controller.dispose();
        }
        expect(interpret).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
      } finally {
        context.controller.dispose();
      }
    } finally {
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);
});

async function p5OpenedFloorSource(documentId: string) {
  const portable = await p4PortablePinnedStyle(documentId);
  const context = await p3SourceHarness("p5-before-" + documentId);
  try {
    await context.controller.openSourceFile({ readText: async () => portable.contents });
    const opened = context.fixtures[context.fixtures.length - 1];
    const floorControls = structuredClone(portable.controls);
    floorControls.floorCount = 5;
    await context.controller.startDemoRun(floorControls);
    const fixture = context.fixtures[context.fixtures.length - 1];
    if (!fixture || fixture === opened || !fixture.sourceSnapshot) throw new Error("Expected a freshly accepted floor source");
    expect(fixture.sourceSnapshot.schemaVersion).toBe("0.2.0");
    expect(fixture.sourceSnapshot.document.authored.floorCount).toBe(5);
    expect(fixture.sourceSnapshot.document.revision).toBe(8);
    const saved = await context.controller.exportSourceFile();
    const sourceFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
    expect(sourceFile.model).toBe("building-window-floor-source-v2");
    return { ...context, portable, floorControls, fixture, saved, sourceFile };
  } catch (error) {
    context.controller.dispose();
    throw error;
  }
}
describe("pinned floor source continuation regressions", () => {
  it("retains the authored floor through a v2 window edit, identical run, and portable reopen", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof p5OpenedFloorSource>> | undefined;
    let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    try {
      context = await p5OpenedFloorSource("p5-window-after-floor");
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate.mock.calls.length).toBeGreaterThan(0);
      interpret.mockClear();
      generate.mockClear();
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const next = structuredClone(context.floorControls);
      next.windowFamily = "tall-rectangular";
      await context.controller.startDemoRun(next);
      const windowFixture = context.fixtures[context.fixtures.length - 1];
      expect(windowFixture.ir).not.toBe(context.fixture.ir);
      expect(windowFixture.sourceSnapshot).toMatchObject({
        schemaVersion: "0.2.0",
        document: { documentId: "p5-window-after-floor", revision: 9, authored: { floorCount: 5, windowFamily: "tall-rectangular" } },
        controlsView: next,
        intent: { requested: { floorCount: 5, windowFamily: "tall-rectangular" } },
      });
      expect(windowFixture.sourceSnapshot?.stylePack).toEqual(context.sourceFile.source.stylePack);
      expect(windowFixture.sourceSnapshot?.compilation).toEqual(context.sourceFile.source.compilation);
      expect(windowFixture.spec.massing).toEqual(context.fixture.spec.massing);
      expect(windowFixture.spec.selectedFamilies.window).toBe("tall-rectangular");
      p4ExpectMaterialBytes(windowFixture, materialBytes);
      const edited = await context.controller.exportSourceFile();
      const editedFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(edited.contents));
      expect(editedFile.model).toBe("building-window-floor-source-v2");
      await context.controller.startDemoRun(structuredClone(next));
      const identical = context.fixtures[context.fixtures.length - 1];
      expect(identical.ir).not.toBe(windowFixture.ir);
      expect(identical.sourceSnapshot).toEqual(windowFixture.sourceSnapshot);
      expect(identical.sourceSnapshot?.document.revision).toBe(9);
      p4ExpectMaterialBytes(identical, materialBytes);
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(editedFile);
      receiver = await p3SourceHarness("p5-foreign-floor-receiver");
      await receiver.controller.openSourceFile({ readText: async () => edited.contents });
      const reopened = receiver.fixtures[receiver.fixtures.length - 1];
      expect(receiver.store.getState().selection.documentId).toBe("p5-window-after-floor");
      expect(reopened.ir).not.toBe(identical.ir);
      expect(reopened.sourceSnapshot).toEqual(identical.sourceSnapshot);
      expect(reopened.spec).toEqual(identical.spec);
      p4ExpectMaterialBytes(reopened, materialBytes);
      expect(JSON.parse((await receiver.controller.exportSourceFile()).contents)).toEqual(editedFile);
      expect(interpret).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    } finally {
      receiver?.controller.dispose();
      context?.controller.dispose();
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);
  it("rejects noninteger, nonpositive, and out-of-style floor edits without retiring the accepted v2 source", async () => {
    const context = await p5OpenedFloorSource("p5-invalid-floor");
    try {
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const calls = context.createFixture.mock.calls.length;
      const invalidFloors = [5.5, 0, context.sourceFile.source.stylePack.massing.floorCount.max + 1];
      for (const floorCount of invalidFloors) {
        const next = structuredClone(context.floorControls);
        next.floorCount = floorCount;
        await expect(context.controller.startDemoRun(next)).rejects.toMatchObject({ code: "building.documentResolutionRejected" });
        expect(context.createFixture).toHaveBeenCalledTimes(calls);
        expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
        expect(context.store.getState().selection.documentId).toBe("p5-invalid-floor");
        expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(context.sourceFile);
        expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
        p4ExpectMaterialBytes(context.fixture, materialBytes);
      }
    } finally {
      context.controller.dispose();
    }
  }, 20000);
  it("rejects unsupported, mixed, and mismatched-baseline v2 edits before invoking the factory", async () => {
    const context = await p5OpenedFloorSource("p5-unsupported-floor-source");
    try {
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const calls = context.createFixture.mock.calls.length;
      const bay = structuredClone(context.floorControls);
      bay.detailLevel = "low";
      const material = structuredClone(context.floorControls);
      material.seeds.material += ".unsupported";
      const mixed = structuredClone(context.floorControls);
      mixed.floorCount = context.portable.controls.floorCount;
      mixed.windowFamily = "tall-rectangular";
      for (const next of [bay, material, mixed]) {
        await expect(context.controller.startDemoRun(next)).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
        expect(context.createFixture).toHaveBeenCalledTimes(calls);
        expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
        expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(context.sourceFile);
        p4ExpectMaterialBytes(context.fixture, materialBytes);
      }
      context.store.setState((state) => ({ controls: {
        ...state.controls,
        committedPrompt: { ...context.floorControls, bayCount: context.floorControls.bayCount + 1 },
      } }));
      await expect(context.controller.startDemoRun(structuredClone(context.floorControls))).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
      expect(context.store.getState().selection.documentId).toBe("p5-unsupported-floor-source");
      expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(context.sourceFile);
      p4ExpectMaterialBytes(context.fixture, materialBytes);
    } finally {
      context.controller.dispose();
    }
  }, 20000);
  it("does not create a fixture after a canceled real floor derivation finishes late", async () => {
    const context = await p5OpenedFloorSource("p5-canceled-floor-derive");
    const derive = p3SourceCodec.deriveBuildingSourceFloorEdit;
    type Derived = Awaited<ReturnType<typeof derive>>;
    const ready = p1Deferred<Derived>();
    const release = p1Deferred<void>();
    const deriveSpy = vi.spyOn(p3SourceCodec, "deriveBuildingSourceFloorEdit").mockImplementationOnce(async (input) => {
      const result = await derive(input);
      ready.resolve(result);
      await release.promise;
      return result;
    });
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    try {
      const calls = context.createFixture.mock.calls.length;
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const next = structuredClone(context.floorControls);
      next.floorCount = context.portable.controls.floorCount;
      pending = context.controller.startDemoRun(next);
      const actualDerived = await Promise.race([
        ready.promise,
        pending.then(() => { throw new Error("Floor run completed before the held real derivation"); }),
      ]);
      expect(actualDerived.schemaVersion).toBe("0.2.0");
      expect(actualDerived.document.authored.floorCount).toBe(context.portable.controls.floorCount);
      context.controller.cancelActiveRun();
      release.resolve();
      expect((await pending).stale).toBe(true);
      expect(deriveSpy).toHaveBeenCalledTimes(1);
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(context.sourceFile);
      expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
      p4ExpectMaterialBytes(context.fixture, materialBytes);
    } finally {
      release.resolve();
      context.controller.dispose();
      await pending?.catch(() => undefined);
      deriveSpy.mockRestore();
    }
  }, 20000);
  it("disposes a stale compiled floor candidate once without rolling back a newer v2 window source", async () => {
    const context = await p5OpenedFloorSource("p5-stale-floor-candidate");
    const ready = p1Deferred<AssemblyHallFixture>();
    const release = p1Deferred<void>();
    const create = context.createFixture.getMockImplementation();
    if (!create) throw new Error("Expected the actual source fixture adapter");
    context.createFixture.mockImplementationOnce(async (input: CreateAssemblyHallFixtureInput) => {
      const fixture = await create(input);
      ready.resolve(fixture);
      await release.promise;
      return fixture;
    });
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    try {
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const floorEdit = structuredClone(context.floorControls);
      floorEdit.floorCount = context.portable.controls.floorCount;
      pending = context.controller.startDemoRun(floorEdit);
      const staleCandidate = await Promise.race([
        ready.promise,
        pending.then(() => { throw new Error("Floor run completed before the held compiled candidate"); }),
      ]);
      expect(staleCandidate.sourceSnapshot?.document.authored.floorCount).toBe(context.portable.controls.floorCount);
      const windowEdit = structuredClone(context.floorControls);
      windowEdit.windowFamily = "tall-rectangular";
      await context.controller.startDemoRun(windowEdit);
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted).not.toBe(staleCandidate);
      expect(accepted.sourceSnapshot).toMatchObject({
        schemaVersion: "0.2.0",
        document: { revision: 9, authored: { floorCount: 5, windowFamily: "tall-rectangular" } },
      });
      const saved = await context.controller.exportSourceFile();
      release.resolve();
      expect((await pending).stale).toBe(true);
      expect(context.disposals.get(staleCandidate)).toBe(1);
      expect(context.disposals.get(accepted) ?? 0).toBe(0);
      expect(accepted.sourceSnapshot?.stylePack).toEqual(context.sourceFile.source.stylePack);
      expect(accepted.spec.massing.floorCount).toBe(5);
      expect(accepted.spec.selectedFamilies.window).toBe("tall-rectangular");
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(JSON.parse(saved.contents));
      p4ExpectMaterialBytes(accepted, materialBytes);
    } finally {
      release.resolve();
      context.controller.dispose();
      await pending?.catch(() => undefined);
    }
  }, 20000);
  it("discards a rejected floor viewer candidate once and spends no accepted source revision", async () => {
    const context = await p5OpenedFloorSource("p5-floor-viewer-rejection");
    const failure = new Error("p5 floor viewer preparation rejected");
    let unregister: (() => void) | undefined;
    try {
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const next = structuredClone(context.floorControls);
      next.floorCount = context.portable.controls.floorCount;
      unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
      await expect(context.controller.startDemoRun(next)).rejects.toBe(failure);
      const rejected = context.fixtures[context.fixtures.length - 1];
      expect(rejected).not.toBe(context.fixture);
      expect(rejected.sourceSnapshot?.document.authored.floorCount).toBe(context.portable.controls.floorCount);
      expect(context.disposals.get(rejected)).toBe(1);
      expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
      expect(context.store.getState().selection.documentId).toBe("p5-floor-viewer-rejection");
      expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(context.sourceFile);
      p4ExpectMaterialBytes(context.fixture, materialBytes);
      unregister();
      unregister = undefined;
      await context.controller.startDemoRun(next);
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted.sourceSnapshot).toMatchObject({
        schemaVersion: "0.2.0",
        document: { revision: 9, authored: { floorCount: context.portable.controls.floorCount } },
      });
      expect(accepted.sourceSnapshot?.stylePack).toEqual(context.sourceFile.source.stylePack);
      p4ExpectMaterialBytes(accepted, materialBytes);
    } finally {
      unregister?.();
      context.controller.dispose();
    }
  }, 20000);
  it("keeps the ordinary different-document path when an accepted v2 source belongs to another document", async () => {
    const context = await p5OpenedFloorSource("p5-floor-document-a");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      const materialBytes = p4CopyMaterialBytes(context.fixture);
      const calls = context.createFixture.mock.calls.length;
      context.store.getState().selectDocument("p5-floor-document-b");
      const next = structuredClone(context.floorControls);
      next.bayCount += 1;
      await context.controller.startDemoRun(next);
      expect(context.createFixture).toHaveBeenCalledTimes(calls + 1);
      expect(context.createFixture.mock.calls[calls]?.[0].sourceSnapshot).toBeUndefined();
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted.ir).not.toBe(context.fixture.ir);
      expect(accepted.sourceSnapshot).toMatchObject({
        schemaVersion: "0.1.0",
        document: { documentId: "p5-floor-document-b" },
        controlsView: next,
      });
      expect(context.store.getState().selection.documentId).toBe("p5-floor-document-b");
      const saved = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse((await context.controller.exportSourceFile()).contents));
      expect(saved.model).toBe("building-window-source-v1");
      expect(saved.source.document.documentId).toBe("p5-floor-document-b");
      p4ExpectMaterialBytes(accepted, materialBytes);
    } finally {
      context.controller.dispose();
      interpret.mockRestore();
    }
  }, 20000);
  it("retains the ordinary v1 mixed-control path instead of applying the strict same-document v2 gate", async () => {
    const portable = await p4PortablePinnedStyle("p5-v1-mixed-controls");
    const context = await p3SourceHarness("p5-before-v1-mixed-controls");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      await context.controller.openSourceFile({ readText: async () => portable.contents });
      const opened = context.fixtures[context.fixtures.length - 1];
      const materialBytes = p4CopyMaterialBytes(opened);
      const calls = context.createFixture.mock.calls.length;
      interpret.mockClear();
      generate.mockClear();
      const next = structuredClone(portable.controls);
      next.floorCount = 5;
      next.windowFamily = "tall-rectangular";
      await context.controller.startDemoRun(next);
      expect(context.createFixture).toHaveBeenCalledTimes(calls + 1);
      expect(context.createFixture.mock.calls[calls]?.[0].sourceSnapshot).toBeUndefined();
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate).not.toHaveBeenCalled();
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted.ir).not.toBe(opened.ir);
      expect(accepted.sourceSnapshot).toMatchObject({
        schemaVersion: "0.1.0",
        document: { documentId: "p5-v1-mixed-controls" },
        controlsView: next,
      });
      expect(accepted.spec.massing.floorCount).toBe(5);
      expect(accepted.spec.selectedFamilies.window).toBe("tall-rectangular");
      const saved = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse((await context.controller.exportSourceFile()).contents));
      expect(saved.model).toBe("building-window-source-v1");
      p4ExpectMaterialBytes(accepted, materialBytes);
    } finally {
      context.controller.dispose();
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);
});

describe("pinned trim material reuse", () => {
  it("reuses accepted material bytes when only ordinary v1 trim density changes", async () => {
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    try {
      context = await p3SourceHarness("p6-trim-material-causal");
      const controls = p3SourcePrompt();
      controls.trimDensity = "ornate";
      await context.controller.startDemoRun(controls);
      expect(context.fixtures).toHaveLength(1);
      const original = context.fixtures[0];
      expect(original.sourceSnapshot?.schemaVersion).toBe("0.1.0");
      expect(original.sourceSnapshot?.controlsView).toEqual(controls);
      expect(original.spec.componentParameters.trimDensity).toBe("ornate");
      expect(context.store.getState().controls.baselineStatus).toBe("known");
      expect(context.store.getState().controls.committedPrompt).toEqual(controls);
      expect(generate).toHaveBeenCalledTimes(12);
      const materialBytes = p4CopyMaterialBytes(original);
      const atlasHash = original.packedAtlas.contentHash;
      const debugJson = JSON.stringify(original.debugExport);
      const acceptedSlots = new Set(original.packedAtlas.manifest.slots.map((slot) => slot.id));
      generate.mockClear();
      const next = structuredClone(controls);
      next.trimDensity = "restrained";
      expect({ ...next, trimDensity: controls.trimDensity }).toEqual(controls);
      await context.controller.startDemoRun(next);
      // The causal assertion: this structural edit must not invoke material generation.
      expect(generate).not.toHaveBeenCalled();
      expect(context.fixtures).toHaveLength(2);
      const changed = context.fixtures[1];
      expect(changed).not.toBe(original);
      expect(changed.ir).not.toBe(original.ir);
      expect(changed.familyRuntime).not.toBe(original.familyRuntime);
      expect(changed.buildingRuntime).not.toBe(original.buildingRuntime);
      expect(changed.packedAtlas).toBe(original.packedAtlas);
      expect(changed.debugExport).toBe(original.debugExport);
      expect(changed.packedAtlas.contentHash).toBe(atlasHash);
      expect(JSON.stringify(changed.debugExport)).toBe(debugJson);
      p4ExpectMaterialBytes(changed, materialBytes);
      expect(changed.spec.componentParameters.trimDensity).toBe("restrained");
      expect(changed.sourceSnapshot?.schemaVersion).toBe("0.1.0");
      expect(changed.sourceSnapshot?.intent.requested.trimDensity).toBe("restrained");
      expect(changed.sourceSnapshot?.controlsView).toEqual(next);
      expect(context.store.getState().controls.committedPrompt).toEqual(next);
      expect(changed.catalog.atlasId).toBe(original.packedAtlas.manifest.atlasId);
      const recipeSlots = changed.catalog.recipes.flatMap((recipe) => recipe.atlasSlotIds);
      expect(recipeSlots.length).toBeGreaterThan(0);
      for (const slotId of recipeSlots) expect(acceptedSlots.has(slotId)).toBe(true);
      expect(changed.catalog.diagnostics.filter((entry) => entry.code === "componentCatalog.unknownAtlasSlot")).toEqual([]);
    } finally {
      context?.controller.dispose();
      generate.mockRestore();
    }
  }, 20000);
});

describe("trim material regeneration controls", () => {
  it.each(["material-only", "trim-and-material"] as const)("still generates materials for %s changes", async (kind) => {
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    try {
      context = await p3SourceHarness("p6-generation-control-" + kind);
      const controls = p3SourcePrompt();
      controls.trimDensity = "ornate";
      await context.controller.startDemoRun(controls);
      expect(context.fixtures).toHaveLength(1);
      const original = context.fixtures[0];
      expect(original.sourceSnapshot?.schemaVersion).toBe("0.1.0");
      expect(context.store.getState().controls.baselineStatus).toBe("known");
      expect(context.store.getState().controls.committedPrompt).toEqual(controls);
      expect(generate).toHaveBeenCalledTimes(12);
      generate.mockClear();
      const next = structuredClone(controls);
      next.seeds.material += ".p6-generation-control";
      if (kind === "trim-and-material") next.trimDensity = "restrained";
      expect({ ...next, seeds: { ...next.seeds, material: controls.seeds.material }, trimDensity: controls.trimDensity }).toEqual(controls);
      await context.controller.startDemoRun(next);
      expect(generate).toHaveBeenCalledTimes(12);
      expect(context.fixtures).toHaveLength(2);
      const changed = context.fixtures[1];
      expect(changed.packedAtlas).not.toBe(original.packedAtlas);
      expect(changed.debugExport).not.toBe(original.debugExport);
      expect(context.createFixture.mock.calls[1][0].reusableArtifacts?.packedAtlas).toBeUndefined();
      expect(context.createFixture.mock.calls[1][0].promptControls).toEqual(next);
      expect(changed.sourceSnapshot?.schemaVersion).toBe("0.1.0");
      expect(changed.sourceSnapshot?.controlsView).toEqual(next);
      expect(changed.sourceSnapshot?.intent.seeds.material).toBe(next.seeds.material);
      expect(changed.spec.componentParameters.trimDensity).toBe(next.trimDensity);
      expect(context.store.getState().controls.committedPrompt).toEqual(next);
      expect(Object.keys(changed.packedAtlas.channels).sort()).toEqual(["baseColor", "height", "normal", "opacity", "orm"]);
    } finally {
      context?.controller.dispose();
      generate.mockRestore();
    }
  }, 20000);
});

describe("pinned bay source continuation", () => {
  it("retains pinned source dependencies when a declared bay edit changes six front bays to seven", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    const frontBayIndices = (fixture: AssemblyHallFixture) => [...new Set(fixture.ir.semanticIndex.flatMap((entry) => {
      const match = /\/facade\/front\/floor\/1\/bay\/(\d+)\//.exec(entry.semanticPath);
      return match ? [Number(match[1])] : [];
    }))].sort((left, right) => left - right);
    try {
      const documentId = "p7-pinned-six-bay-source";
      const portable = await p4PortablePinnedStyle(documentId);
      expect(portable.file.schemaVersion).toBe("0.1.0");
      expect(generate).toHaveBeenCalledTimes(12);
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      const decoded = await p3SourceCodec.parseBuildingSourceFile(JSON.parse(portable.contents));
      const controls = { ...structuredClone(decoded.sourceSnapshot.controlsView), bayCount: 6 };
      const intent = structuredClone(decoded.sourceSnapshot.intent);
      intent.requested.bayCount = 6;
      const sixBayV1 = await p3SourceCodec.createBuildingSourceSnapshot({
        documentId, revision: 7, controls, intent, stylePack: decoded.sourceSnapshot.stylePack,
      });
      expect(sixBayV1.sourceSnapshot.schemaVersion).toBe("0.1.0");
      expect(sixBayV1.spec.facade.frontBayCount).toBe(6);
      expect(sixBayV1.sourceSnapshot.controlsView.floorCount).toBe(4);
      const floorSource = await p3SourceCodec.deriveBuildingSourceFloorEdit({
        sourceSnapshot: sixBayV1.sourceSnapshot, floorCount: 5,
      });
      const resolved = await p3SourceCodec.resolveBuildingSourceSnapshot(floorSource);
      expect(resolved.sourceSnapshot.schemaVersion).toBe("0.2.0");
      expect(resolved.sourceSnapshot.document.authored).toEqual({ windowFamily: controls.windowFamily, floorCount: 5 });
      expect(resolved.sourceSnapshot.document.revision).toBe(7);
      expect(resolved.spec.facade.frontBayCount).toBe(6);
      expect(resolved.spec.massing.floorCount).toBe(5);
      expect(resolved.spec.massing.floorHeightsM.slice(1)).toEqual([4.25, 4.25, 4.25, 4.25]);
      const sourceFile = p3SourceCodec.BuildingSourceFileSchema.parse(await p3SourceCodec.createBuildingSourceFile({
        sourceSnapshot: resolved.sourceSnapshot, packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport,
      }));
      expect(sourceFile.schemaVersion).toBe("0.2.0");
      expect(sourceFile.model).toBe("building-window-floor-source-v2");
      const contents = JSON.stringify(sourceFile, null, 2);
      const parsed = await p3SourceCodec.parseBuildingSourceFile(JSON.parse(contents));
      expect(parsed.sourceSnapshot).toEqual(resolved.sourceSnapshot);
      const providerCallsBeforeOpen = generate.mock.calls.length;
      const interpreterCallsBeforeOpen = interpret.mock.calls.length;
      expect(providerCallsBeforeOpen).toBe(12);
      context = await p3SourceHarness("p7-before-six-bay-open");
      expect((await context.controller.openSourceFile({ readText: async () => contents })).stale).toBe(false);
      expect(context.fixtures).toHaveLength(1);
      const opened = context.fixtures[0];
      expect(opened.sourceSnapshot).toEqual(sourceFile.source);
      expect(opened.spec).toEqual(resolved.spec);
      expect(opened.spec.facade.frontBayCount).toBe(6);
      expect(opened.spec.massing.floorCount).toBe(5);
      expect(frontBayIndices(opened)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(opened.sourceSnapshot?.document.revision).toBe(7);
      expect(opened.sourceSnapshot?.stylePack.massing.floorHeightM.typical).toEqual({ min: 4.25, max: 4.25 });
      expect(context.store.getState().selection.documentId).toBe(documentId);
      expect(context.store.getState().controls.baselineStatus).toBe("known");
      expect(context.store.getState().controls.committedPrompt).toEqual(sourceFile.source.controlsView);
      expect(JSON.parse((await context.controller.exportSourceFile()).contents)).toEqual(sourceFile);
      expect(generate).toHaveBeenCalledTimes(providerCallsBeforeOpen);
      expect(interpret).toHaveBeenCalledTimes(interpreterCallsBeforeOpen);
      const materials = p4CopyMaterialBytes(opened);
      const openedWall = opened.ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels");
      const openedWindows = opened.ir.instanceBatches.find((batch) => batch.batchId === "instances.window");
      expect(openedWall).toBeDefined();
      expect(openedWindows).toBeDefined();
      const originalWallPositions = openedWall?.positions;
      const originalWindowTransforms = openedWindows?.transforms;
      if (!originalWallPositions || !originalWindowTransforms) throw new Error("Expected actual baseline wall and window buffers");
      const wallPositions = Array.from(originalWallPositions);
      const windowTransforms = Array.from(originalWindowTransforms);
      expect(wallPositions.length).toBeGreaterThan(0);
      expect(windowTransforms.length).toBeGreaterThan(0);
      interpret.mockClear();
      generate.mockClear();
      const next = structuredClone(sourceFile.source.controlsView);
      next.bayCount = 7;
      expect({ ...next, bayCount: 6 }).toEqual(sourceFile.source.controlsView);

      // The retained red is the current building.sourceEditUnsupported rejection here.
      const result = await context.controller.startDemoRun(next);
      expect(result.stale).toBe(false);
      expect(context.fixtures).toHaveLength(2);
      const changed = context.fixtures[1];
      expect(changed).not.toBe(opened);
      expect(changed.ir).not.toBe(opened.ir);
      expect(changed.familyRuntime).not.toBe(opened.familyRuntime);
      expect(changed.buildingRuntime).not.toBe(opened.buildingRuntime);
      expect(changed.sourceSnapshot?.schemaVersion).toBe("0.3.0");
      expect(changed.sourceSnapshot?.document.authored).toEqual({ windowFamily: controls.windowFamily, floorCount: 5, bayCount: 7 });
      expect(changed.sourceSnapshot?.document.documentId).toBe(documentId);
      expect(changed.sourceSnapshot?.document.revision).toBe(8);
      expect(changed.sourceSnapshot?.intent.requested.bayCount).toBe(7);
      expect(changed.sourceSnapshot?.controlsView).toEqual(next);
      expect(changed.sourceSnapshot?.stylePack).toEqual(sourceFile.source.stylePack);
      expect(changed.sourceSnapshot?.compilation).toEqual(sourceFile.source.compilation);
      expect(changed.spec.facade.frontBayCount).toBe(7);
      expect(changed.spec.massing.floorCount).toBe(5);
      expect(changed.spec.massing.floorHeightsM).toEqual(opened.spec.massing.floorHeightsM);
      expect(frontBayIndices(changed)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      const changedWall = changed.ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels");
      const changedWindows = changed.ir.instanceBatches.find((batch) => batch.batchId === "instances.window");
      expect(changedWall).toBeDefined();
      expect(changedWindows).toBeDefined();
      const changedWallPositions = changedWall?.positions;
      const changedWindowTransforms = changedWindows?.transforms;
      if (!changedWallPositions || !changedWindowTransforms) throw new Error("Expected actual edited wall and window buffers");
      expect(changedWallPositions).not.toBe(originalWallPositions);
      expect(Array.from(changedWallPositions)).not.toEqual(wallPositions);
      expect(changedWindowTransforms).not.toBe(originalWindowTransforms);
      expect(Array.from(changedWindowTransforms)).not.toEqual(windowTransforms);
      expect(changed.packedAtlas).toBe(opened.packedAtlas);
      expect(changed.debugExport).toBe(opened.debugExport);
      p4ExpectMaterialBytes(changed, materials);
      expect(interpret).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      const saved = await context.controller.exportSourceFile();
      const savedFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
      expect(savedFile.schemaVersion).toBe("0.3.0");
      expect(savedFile.model).toBe("building-parameter-source-v3");
      expect(savedFile.source.document.authored).toEqual({ windowFamily: controls.windowFamily, floorCount: 5, bayCount: 7 });
      expect(saved.documentId).toBe(documentId);
      expect(saved.revision).toBe(8);
      receiver = await p3SourceHarness("p7-bay-reopen-receiver");
      expect((await receiver.controller.openSourceFile({ readText: async () => saved.contents })).stale).toBe(false);
      const reopened = receiver.fixtures[0];
      expect(reopened.ir).not.toBe(changed.ir);
      expect(reopened.spec).toEqual(changed.spec);
      expect(reopened.sourceSnapshot).toEqual(savedFile.source);
      expect(frontBayIndices(reopened)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      p4ExpectMaterialBytes(reopened, materials);
      expect(receiver.store.getState().selection.documentId).toBe(documentId);
      expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(interpret).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    } finally {
      receiver?.controller.dispose();
      context?.controller.dispose();
      interpret.mockRestore();
      generate.mockRestore();
    }
  }, 20000);
});

async function p7StartedBaySource(documentId: string) {
  const portable = await p4PortablePinnedStyle(documentId);
  const decoded = await p3SourceCodec.parseBuildingSourceFile(JSON.parse(portable.contents));
  const controls = { ...structuredClone(decoded.sourceSnapshot.controlsView), bayCount: 6 };
  const intent = structuredClone(decoded.sourceSnapshot.intent);
  intent.requested.bayCount = 6;
  const initial = await p3SourceCodec.createBuildingSourceSnapshot({
    documentId, revision: 7, controls, intent, stylePack: decoded.sourceSnapshot.stylePack,
  });
  const floor = await p3SourceCodec.deriveBuildingSourceFloorEdit({ sourceSnapshot: initial.sourceSnapshot, floorCount: 5 });
  const file = await p3SourceCodec.createBuildingSourceFile({
    sourceSnapshot: floor, packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport,
  });
  const context = await p3SourceHarness("p7-before-" + documentId);
  try {
    await context.controller.openSourceFile({ readText: async () => JSON.stringify(file) });
    expect(context.fixtures[0].spec.facade.frontBayCount).toBe(6);
    const next = { ...structuredClone(floor.controlsView), bayCount: 7 };
    await context.controller.startDemoRun(next);
    const fixture = context.fixtures[context.fixtures.length - 1];
    expect(fixture.sourceSnapshot?.schemaVersion).toBe("0.3.0");
    expect(fixture.sourceSnapshot?.document.authored).toEqual({ windowFamily: next.windowFamily, floorCount: 5, bayCount: 7 });
    expect(fixture.sourceSnapshot?.document.revision).toBe(8);
    expect(fixture.spec.facade.frontBayCount).toBe(7);
    const saved = await context.controller.exportSourceFile();
    const sourceFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
    return { ...context, fixture, saved, sourceFile, next, materialBytes: p4CopyMaterialBytes(fixture) };
  } catch (error) {
    context.controller.dispose();
    throw error;
  }
}

async function p7ExpectAcceptedSourceRetained(context: Awaited<ReturnType<typeof p7StartedBaySource>>) {
  expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
  expect(context.store.getState().selection.documentId).toBe(context.saved.documentId);
  expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
  expect((await context.controller.exportSourceFile()).contents).toBe(context.saved.contents);
  p4ExpectMaterialBytes(context.fixture, context.materialBytes);
}

describe("declared bay source continuation regressions", () => {
  it("preserves a declared subset on no-op and retains bays through later window, floor and bay edits", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof p7StartedBaySource>> | undefined;
    try {
      context = await p7StartedBaySource("p7-declared-bay-subset");
      expect(interpret.mock.calls.length).toBeGreaterThan(0);
      expect(generate).toHaveBeenCalledTimes(12);
      interpret.mockClear(); generate.mockClear();
      const subset = structuredClone(context.sourceFile);
      subset.source.document.authored = { bayCount: 7 };
      const { sourceContentHash: omittedSource, ...sourcePayload } = subset.source;
      void omittedSource;
      subset.source.sourceContentHash = await hashCanonicalJson({ ...sourcePayload, document: { ...sourcePayload.document, revision: 0 } });
      const { contentHash: omittedFile, ...filePayload } = subset;
      void omittedFile;
      subset.contentHash = await hashCanonicalJson(filePayload);
      const parsed = await p3SourceCodec.parseBuildingSourceFile(subset);
      expect(parsed.sourceSnapshot.document.authored).toEqual({ bayCount: 7 });
      await context.controller.openSourceFile({ readText: async () => JSON.stringify(subset) });
      const opened = context.fixtures[context.fixtures.length - 1];
      expect(opened.sourceSnapshot?.document.authored).toEqual({ bayCount: 7 });
      const before = await context.controller.exportSourceFile();
      await context.controller.startDemoRun(structuredClone(context.next));
      const identical = context.fixtures[context.fixtures.length - 1];
      expect(identical.ir).not.toBe(opened.ir);
      expect(identical.sourceSnapshot).toEqual(opened.sourceSnapshot);
      expect((await context.controller.exportSourceFile()).contents).toBe(before.contents);
      const window = { ...structuredClone(context.next), windowFamily: "tall-rectangular" };
      await context.controller.startDemoRun(window);
      const windowFixture = context.fixtures[context.fixtures.length - 1];
      expect(windowFixture.sourceSnapshot?.document.authored).toEqual({ bayCount: 7, windowFamily: "tall-rectangular" });
      expect(windowFixture.sourceSnapshot?.document.revision).toBe(9);
      expect(windowFixture.spec.massing.floorHeightsM).toEqual(opened.spec.massing.floorHeightsM);
      const floor = { ...window, floorCount: 6 };
      await context.controller.startDemoRun(floor);
      const floorFixture = context.fixtures[context.fixtures.length - 1];
      expect(floorFixture.sourceSnapshot?.document.authored).toEqual({ bayCount: 7, windowFamily: "tall-rectangular", floorCount: 6 });
      expect(floorFixture.sourceSnapshot?.document.revision).toBe(10);
      expect(floorFixture.spec.massing.floorHeightsM).toHaveLength(6);
      expect(floorFixture.spec.massing.floorHeightsM.slice(1)).toEqual([4.25, 4.25, 4.25, 4.25, 4.25]);
      const bay = { ...floor, bayCount: 6 };
      await context.controller.startDemoRun(bay);
      const bayFixture = context.fixtures[context.fixtures.length - 1];
      expect(bayFixture.sourceSnapshot?.schemaVersion).toBe("0.3.0");
      expect(bayFixture.sourceSnapshot?.document.authored).toEqual({ bayCount: 6, windowFamily: "tall-rectangular", floorCount: 6 });
      expect(bayFixture.sourceSnapshot?.document.revision).toBe(11);
      expect(bayFixture.spec.facade.frontBayCount).toBe(6);
      expect(bayFixture.spec.massing.floorHeightsM).toEqual(floorFixture.spec.massing.floorHeightsM);
      for (const fixture of [identical, windowFixture, floorFixture, bayFixture]) {
        expect(fixture.sourceSnapshot?.stylePack).toEqual(context.sourceFile.source.stylePack);
        expect(fixture.sourceSnapshot?.compilation).toEqual(context.sourceFile.source.compilation);
        expect(fixture.packedAtlas).toBe(opened.packedAtlas);
        expect(fixture.debugExport).toBe(opened.debugExport);
        p4ExpectMaterialBytes(fixture, context.materialBytes);
      }
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally {
      context?.controller.dispose(); interpret.mockRestore(); generate.mockRestore();
    }
  }, 20000);

  it("rejects invalid bays, unsupported or mixed edits and an incoherent baseline before creating a fixture", async () => {
    const context = await p7StartedBaySource("p7-bay-admission");
    try {
      const calls = context.createFixture.mock.calls.length;
      for (const bayCount of [0, 6.5, context.sourceFile.source.stylePack.facade.frontBayCount.max + 1]) {
        await expect(context.controller.startDemoRun({ ...structuredClone(context.next), bayCount })).rejects.toMatchObject({ code: "building.documentResolutionRejected" });
        expect(context.createFixture).toHaveBeenCalledTimes(calls);
        await p7ExpectAcceptedSourceRetained(context);
      }
      const roof = { ...structuredClone(context.next), detailLevel: "low" as const };
      const mixed = { ...structuredClone(context.next), bayCount: 6, floorCount: 6 };
      const material = structuredClone(context.next);
      material.seeds.material += ".unsupported";
      for (const next of [roof, mixed, material]) {
        await expect(context.controller.startDemoRun(next)).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
        expect(context.createFixture).toHaveBeenCalledTimes(calls);
        await p7ExpectAcceptedSourceRetained(context);
      }
      context.store.setState((state) => ({ controls: {
        ...state.controls, committedPrompt: { ...context.next, bayCount: 6 },
      } }));
      await expect(context.controller.startDemoRun({ ...structuredClone(context.next), bayCount: 6 })).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      await p7ExpectAcceptedSourceRetained(context);
    } finally { context.controller.dispose(); }
  }, 20000);

  it("does not create a fixture when a canceled real bay derivation resolves late", async () => {
    const context = await p7StartedBaySource("p7-canceled-bay-derive");
    const derive = p3SourceCodec.deriveBuildingSourceBayEdit;
    type Derived = Awaited<ReturnType<typeof derive>>;
    const ready = p1Deferred<Derived>(), release = p1Deferred<void>();
    const deriveSpy = vi.spyOn(p3SourceCodec, "deriveBuildingSourceBayEdit").mockImplementationOnce(async (input) => {
      const value = await derive(input);
      ready.resolve(value);
      await release.promise;
      return value;
    });
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    try {
      const calls = context.createFixture.mock.calls.length;
      pending = context.controller.startDemoRun({ ...structuredClone(context.next), bayCount: 6 });
      const derived = await Promise.race([ready.promise, pending.then(() => { throw new Error("Bay run settled before held derivation"); })]);
      expect(derived.document.authored.bayCount).toBe(6);
      expect(derived.stylePack).toEqual(context.sourceFile.source.stylePack);
      context.controller.cancelActiveRun(); release.resolve();
      expect((await pending).stale).toBe(true);
      expect(deriveSpy).toHaveBeenCalledTimes(1);
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      await p7ExpectAcceptedSourceRetained(context);
    } finally {
      release.resolve(); context.controller.dispose(); await pending?.catch(() => undefined); deriveSpy.mockRestore();
    }
  }, 20000);

  it("retires a stale compiled bay candidate once without replacing a newer window source", async () => {
    const context = await p7StartedBaySource("p7-stale-bay-candidate");
    const ready = p1Deferred<AssemblyHallFixture>(), release = p1Deferred<void>();
    const create = context.createFixture.getMockImplementation();
    if (!create) { context.controller.dispose(); throw new Error("Expected the real source adapter"); }
    context.createFixture.mockImplementationOnce(async (input) => {
      const fixture = await create(input);
      ready.resolve(fixture);
      await release.promise;
      return fixture;
    });
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    try {
      pending = context.controller.startDemoRun({ ...structuredClone(context.next), bayCount: 6 });
      const candidate = await Promise.race([ready.promise, pending.then(() => { throw new Error("Bay run settled before held candidate"); })]);
      expect(candidate.sourceSnapshot?.document.authored.bayCount).toBe(6);
      await context.controller.startDemoRun({ ...structuredClone(context.next), windowFamily: "tall-rectangular" });
      const accepted = context.fixtures[context.fixtures.length - 1];
      const saved = await context.controller.exportSourceFile();
      release.resolve();
      expect((await pending).stale).toBe(true);
      expect(context.disposals.get(candidate)).toBe(1);
      expect(context.disposals.get(accepted) ?? 0).toBe(0);
      expect(accepted.sourceSnapshot?.document.authored).toEqual({ windowFamily: "tall-rectangular", floorCount: 5, bayCount: 7 });
      expect(accepted.sourceSnapshot?.document.revision).toBe(9);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      p4ExpectMaterialBytes(accepted, context.materialBytes);
    } finally { release.resolve(); context.controller.dispose(); await pending?.catch(() => undefined); }
  }, 20000);

  it.each(["missing", "different"] as const)("rejects a bay candidate with a %s captured source receipt", async (kind) => {
    const context = await p7StartedBaySource("p7-bay-receipt-" + kind);
    const create = context.createFixture.getMockImplementation();
    if (!create) { context.controller.dispose(); throw new Error("Expected the real source adapter"); }
    context.createFixture.mockImplementationOnce(async (input) => {
      const fixture = await create(input), candidate = { ...fixture };
      if (kind === "missing") Reflect.deleteProperty(candidate, "sourceSnapshot");
      else Object.defineProperty(candidate, "sourceSnapshot", { configurable: true, enumerable: true, writable: true, value: context.fixture.sourceSnapshot });
      return candidate;
    });
    try {
      const count = context.fixtures.length;
      await expect(context.controller.startDemoRun({ ...structuredClone(context.next), bayCount: 6 })).rejects.toMatchObject({ code: "building.sourceFileInvalid" });
      expect(context.fixtures).toHaveLength(count + 1);
      expect(context.disposals.get(context.fixtures[count])).toBe(1);
      await p7ExpectAcceptedSourceRetained(context);
    } finally { context.controller.dispose(); }
  }, 20000);

  it("spends no accepted revision when a viewer rejects a bay replacement", async () => {
    const context = await p7StartedBaySource("p7-bay-viewer-rejection");
    const failure = new Error("P7 bay viewer rejected");
    let unregister: (() => void) | undefined;
    try {
      unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
      const next = { ...structuredClone(context.next), bayCount: 6 };
      await expect(context.controller.startDemoRun(next)).rejects.toBe(failure);
      const rejected = context.fixtures[context.fixtures.length - 1];
      expect(rejected).not.toBe(context.fixture);
      expect(rejected.sourceSnapshot?.document.authored.bayCount).toBe(6);
      expect(context.disposals.get(rejected)).toBe(1);
      await p7ExpectAcceptedSourceRetained(context);
      unregister(); unregister = undefined;
      await context.controller.startDemoRun(next);
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted.sourceSnapshot?.document.revision).toBe(9);
      expect(accepted.sourceSnapshot?.document.authored.bayCount).toBe(6);
      p4ExpectMaterialBytes(accepted, context.materialBytes);
    } finally { unregister?.(); context.controller.dispose(); }
  }, 20000);

  it("keeps the exact clicked v3 source owner leased through an asynchronous Save", async () => {
    const context = await p7StartedBaySource("p7-bay-save-lease");
    type Encoded = Awaited<ReturnType<typeof p3SourceCodec.createBuildingSourceFile>>;
    const ready = p1Deferred<Encoded>(), release = p1Deferred<Encoded>();
    const create = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementationOnce(async (...args) => {
      const value = await create(...args);
      ready.resolve(value);
      return release.promise;
    });
    let saving: ReturnType<BuildingRunController["exportSourceFile"]> | undefined;
    let encoded: Encoded | undefined;
    try {
      saving = context.controller.exportSourceFile();
      encoded = await Promise.race([ready.promise, saving.then(() => { throw new Error("Save escaped held encoding"); })]);
      await context.controller.startDemoRun({ ...structuredClone(context.next), bayCount: 6 });
      expect(context.disposals.get(context.fixture) ?? 0).toBe(0);
      release.resolve(encoded);
      const saved = await saving;
      expect(saved.contents).toBe(context.saved.contents);
      expect(saved.revision).toBe(8);
      expect(context.disposals.get(context.fixture)).toBe(1);
      const current = await context.controller.exportSourceFile();
      expect(current.revision).toBe(9);
      const file = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(current.contents));
      expect(file.schemaVersion).toBe("0.3.0");
      expect(file.source.document.authored.bayCount).toBe(6);
    } finally {
      if (encoded) release.resolve(encoded);
      context.controller.dispose(); await saving?.catch(() => undefined); encode.mockRestore();
    }
  }, 20000);
});


describe("R2.P9 pinned roof source continuation", () => {
  it("continues an actual public v3 Save-Open source with only an authored roof edit", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { sha256Hex } = await import("../core/contentHash");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let source: Awaited<ReturnType<typeof p7StartedBaySource>> | undefined;
    let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    let reopenedContext: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    const names = ["baseColor", "normal", "orm", "height", "opacity"] as const;
    const view = async (array: ArrayBufferView | undefined) => array ? {
      type: array.constructor.name, byteLength: array.byteLength,
      sha256: await sha256Hex(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
    } : null;
    const nonroof = async (fixture: AssemblyHallFixture) => ({
      meshes: await Promise.all(fixture.ir.meshBatches.filter(batch => batch.batchId !== "mesh.roof").map(async batch => ({
        batchId: batch.batchId, role: batch.role, materialSlotId: batch.materialSlotId,
        positions: await view(batch.positions), normals: await view(batch.normals),
        uvs: await view(batch.uvs), indices: await view(batch.indices)
      }))),
      instances: await Promise.all(fixture.ir.instanceBatches.map(async batch => ({
        batchId: batch.batchId, recipeId: batch.recipeId, count: batch.count,
        materialSlotId: batch.materialSlotId, transforms: await view(batch.transforms)
      }))),
      semanticIndex: fixture.ir.semanticIndex.filter(entry => entry.batchId !== "mesh.roof")
    });
    const materialMetadata = (fixture: AssemblyHallFixture) => JSON.stringify({
      atlas: { ...fixture.packedAtlas, channels: Object.fromEntries(names.map(name => {
        const layer = fixture.packedAtlas.channels[name];
        return [name, { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, byteLength: layer.data.byteLength }];
      })) }, debug: fixture.debugExport
    });
    try {
      // Equivalent public v3 fixture; frozen external canaries remain outside source tests.
      source = await p7StartedBaySource("p9-public-pinned-roof-source");
      expect(generate).toHaveBeenCalledTimes(12);
      expect(interpret).toHaveBeenCalledTimes(1);
      expect(source.sourceFile.schemaVersion).toBe("0.3.0");
      expect(source.sourceFile.model).toBe("building-parameter-source-v3");
      expect(source.sourceFile.source.document.authored).toEqual({ windowFamily: source.next.windowFamily, floorCount: 5, bayCount: 7 });
      expect(source.sourceFile.source.document.revision).toBe(8);
      expect(source.sourceFile.source.controlsView.roofType).toBe("flat");
      const beforeOpenProviderCalls = generate.mock.calls.length;
      const beforeOpenInterpreterCalls = interpret.mock.calls.length;
      const sourceWall = source.fixture.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels");
      const sourceWindows = source.fixture.ir.instanceBatches.find(batch => batch.batchId === "instances.window");
      if (!sourceWall?.positions?.length || !sourceWindows?.transforms?.length) throw new Error("Expected nonempty source wall and window buffers");
      const sourceMaterials = p4CopyMaterialBytes(source.fixture);
      const sourceMetadata = materialMetadata(source.fixture);
      const sourceContents = source.saved.contents;
      receiver = await p3SourceHarness("p9-before-public-roof-open");
      expect((await receiver.controller.openSourceFile({ readText: async () => sourceContents })).stale).toBe(false);
      expect(receiver.fixtures).toHaveLength(1);
      const opened = receiver.fixtures[0];
      const accepted = opened.sourceSnapshot;
      if (!accepted) throw new Error("Expected a captured v3 source after Open");
      // The roof edit protects this freshly recompiled Open result.
      const sourceNonroof = await nonroof(opened);
      expect(sourceNonroof.meshes.length).toBeGreaterThan(0);
      expect(sourceNonroof.instances.length).toBeGreaterThan(0);
      expect(accepted).toEqual(source.sourceFile.source);
      expect(opened.spec).toEqual(source.fixture.spec);
      expect(opened.spec.massing.floorCount).toBe(5);
      expect(opened.spec.facade.frontBayCount).toBe(7);
      expect(opened.spec.massing.floorHeightsM.slice(1)).toEqual([4.25, 4.25, 4.25, 4.25]);
      expect(opened.spec.massing.roof.type).toBe("flat");
      expect(opened.spec.selectedFamilies.wall).toBe("brick-red");
      expect(accepted.stylePack.massing.roofTypes).toContain("gable");
      expect(accepted.stylePack.massing.floorHeightM.typical).toEqual({ min: 4.25, max: 4.25 });
      expect(accepted.document.authored).toEqual({ windowFamily: source.next.windowFamily, floorCount: 5, bayCount: 7 });
      expect(accepted.document.revision).toBe(8);
      expect(receiver.store.getState().selection.documentId).toBe(accepted.document.documentId);
      expect(receiver.store.getState().controls.baselineStatus).toBe("known");
      expect(receiver.store.getState().controls.committedPrompt).toEqual(accepted.controlsView);
      expect(materialMetadata(opened)).toBe(sourceMetadata);
      p4ExpectMaterialBytes(opened, sourceMaterials);
      expect((await receiver.controller.exportSourceFile()).contents).toBe(source.saved.contents);
      expect(generate).toHaveBeenCalledTimes(beforeOpenProviderCalls);
      expect(interpret).toHaveBeenCalledTimes(beforeOpenInterpreterCalls);
      const oldRoof = opened.ir.meshBatches.find(batch => batch.batchId === "mesh.roof");
      if (!oldRoof?.positions || !oldRoof.normals || !oldRoof.uvs || !oldRoof.indices) throw new Error("Expected complete flat roof IR");
      const oldRoofPositions = Array.from(oldRoof.positions);
      const oldRoofIndices = Array.from(oldRoof.indices);
      const next = structuredClone(accepted.controlsView);
      next.roofType = "gable";
      expect({ ...next, roofType: accepted.controlsView.roofType }).toEqual(accepted.controlsView);
      interpret.mockClear(); generate.mockClear();
      console.log("R2_P9_ROOF_POSITIVE_CONTROLS " + JSON.stringify({
        providerCalls: beforeOpenProviderCalls, interpreterCalls: beforeOpenInterpreterCalls,
        version: accepted.schemaVersion, revision: accepted.document.revision,
        authored: accepted.document.authored, protectedMeshes: sourceNonroof.meshes.length,
        protectedInstances: sourceNonroof.instances.length, materialChannels: names.length
      }));
      // Retained RED is the current building.sourceEditUnsupported rejection here.
      const result = await receiver.controller.startDemoRun(next);
      expect(result.stale).toBe(false);
      expect(receiver.fixtures).toHaveLength(2);
      const changed = receiver.fixtures[1];
      expect(changed).not.toBe(opened);
      expect(changed.ir).not.toBe(opened.ir);
      expect(changed.familyRuntime).not.toBe(opened.familyRuntime);
      expect(changed.buildingRuntime.root).not.toBe(opened.buildingRuntime.root);
      expect(changed.sourceSnapshot?.schemaVersion).toBe("0.3.0");
      expect(changed.sourceSnapshot?.document.documentId).toBe(accepted.document.documentId);
      expect(changed.sourceSnapshot?.document.revision).toBe(9);
      expect(changed.sourceSnapshot?.document.authored).toEqual({ ...accepted.document.authored, roofType: "gable" });
      expect(changed.sourceSnapshot?.intent.requested).toEqual({ ...accepted.intent.requested, roofType: "gable" });
      expect(changed.sourceSnapshot?.controlsView).toEqual(next);
      expect(changed.sourceSnapshot?.stylePack).toEqual(accepted.stylePack);
      expect(changed.sourceSnapshot?.compilation).toEqual(accepted.compilation);
      expect(changed.sourceSnapshot?.document.seeds).toEqual(accepted.document.seeds);
      expect(changed.sourceSnapshot?.document.locks).toEqual(accepted.document.locks);
      expect(changed.sourceSnapshot?.sourceContentHash).not.toBe(accepted.sourceContentHash);
      expect(changed.spec.familyId).toBe(opened.spec.familyId);
      expect(changed.ir.buildingId).toBe(opened.ir.buildingId);
      expect(changed.spec.massing.floorHeightsM).toEqual(opened.spec.massing.floorHeightsM);
      expect(changed.spec.facade).toEqual(opened.spec.facade);
      expect(changed.spec.massing.roof).toEqual({ type: "gable", pitchDegrees: 28 });
      expect(changed.spec.selectedFamilies.roof).toBe("simple-gable");
      expect(changed.spec.sourceIntentHash).not.toBe(opened.spec.sourceIntentHash);
      expect(changed.catalog.catalogId).not.toBe(opened.catalog.catalogId);
      expect(changed.ir.sourceGraphHash).not.toBe(opened.ir.sourceGraphHash);
      expect(await nonroof(changed)).toEqual(sourceNonroof);
      const recipe = changed.catalog.recipes.find(candidate => candidate.role === "roof");
      if (!recipe) throw new Error("Expected the chosen roof recipe");
      expect(recipe.kind).toBe("gableRoof");
      expect(recipe.id).toBe("recipe.roof." + changed.spec.selectedFamilies.roof);
      expect(recipe.atlasSlotIds).toEqual(["roof.primary"]);
      expect(changed.graph.nodes.find(node => node.id === "node.roof")?.parameters).toMatchObject({ recipeId: recipe.id, roofType: "gable" });
      const roof = changed.ir.meshBatches.find(batch => batch.batchId === "mesh.roof");
      if (!roof?.positions || !roof.normals || !roof.uvs || !roof.indices) throw new Error("Expected complete pitched roof IR");
      expect(Array.from(roof.positions)).not.toEqual(oldRoofPositions);
      expect(Array.from(roof.indices)).not.toEqual(oldRoofIndices);
      const ys = Array.from(roof.positions).filter((_, index) => index % 3 === 1);
      const eave = changed.spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0);
      const ridge = eave + Math.tan((changed.spec.massing.roof.pitchDegrees ?? 28) * Math.PI / 180) * changed.spec.massing.depthM / 2;
      expect(ridge).toBeGreaterThan(eave);
      expect(Math.abs(Math.min(...ys) - eave)).toBeLessThanOrEqual(0.00002);
      expect(Math.abs(Math.max(...ys) - ridge)).toBeLessThanOrEqual(0.00002);
      const runtimeRoof = changed.buildingRuntime.objectsByBatchId.get("mesh.roof");
      if (!runtimeRoof) throw new Error("Expected the current pitched roof runtime");
      expect(runtimeRoof.userData).toMatchObject({ batchId: "mesh.roof", role: "roof", materialSlotId: "roof.primary" });
      expect(Array.from(runtimeRoof.geometry.getAttribute("position").array)).toEqual(Array.from(roof.positions));
      const runtimeIndex = runtimeRoof.geometry.getIndex();
      if (!runtimeIndex) throw new Error("Expected indexed current pitched roof geometry");
      expect(Array.from(runtimeIndex.array)).toEqual(Array.from(roof.indices));
      expect(changed.packedAtlas).toBe(opened.packedAtlas);
      expect(changed.debugExport).toBe(opened.debugExport);
      expect(materialMetadata(changed)).toBe(sourceMetadata);
      p4ExpectMaterialBytes(changed, sourceMaterials);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
      const saved = await receiver.controller.exportSourceFile();
      const savedFile = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
      expect(savedFile.schemaVersion).toBe("0.3.0");
      expect(savedFile.model).toBe("building-parameter-source-v3");
      expect(savedFile.source.document.authored).toEqual({ ...accepted.document.authored, roofType: "gable" });
      expect(savedFile.source).toEqual(changed.sourceSnapshot);
      expect(saved.documentId).toBe(accepted.document.documentId);
      expect(saved.revision).toBe(9);
      reopenedContext = await p3SourceHarness("p9-gable-reopen-receiver");
      expect((await reopenedContext.controller.openSourceFile({ readText: async () => saved.contents })).stale).toBe(false);
      const reopened = reopenedContext.fixtures[0];
      expect(reopened.ir).not.toBe(changed.ir);
      expect(reopened.buildingRuntime.root).not.toBe(changed.buildingRuntime.root);
      expect(reopened.sourceSnapshot).toEqual(savedFile.source);
      expect(reopened.spec).toEqual(changed.spec);
      expect(await nonroof(reopened)).toEqual(sourceNonroof);
      const reopenedRoof = reopened.ir.meshBatches.find(batch => batch.batchId === "mesh.roof");
      expect(await view(reopenedRoof?.positions)).toEqual(await view(roof.positions));
      expect(await view(reopenedRoof?.normals)).toEqual(await view(roof.normals));
      expect(await view(reopenedRoof?.uvs)).toEqual(await view(roof.uvs));
      expect(await view(reopenedRoof?.indices)).toEqual(await view(roof.indices));
      expect(materialMetadata(reopened)).toBe(sourceMetadata);
      p4ExpectMaterialBytes(reopened, sourceMaterials);
      expect(reopenedContext.store.getState().selection.documentId).toBe(accepted.document.documentId);
      expect((await reopenedContext.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally {
      reopenedContext?.controller.dispose();
      receiver?.controller.dispose();
      source?.controller.dispose();
      interpret.mockRestore(); generate.mockRestore();
    }
  }, 20_000);
});


describe("R2.P9 roof source lifecycle", () => {
  it.each(["cancel", "viewer-reject"] as const)("retains the accepted roof source after %s and spends one revision only on retry", async (kind) => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const derive = p3SourceCodec.deriveBuildingSourceRoofEdit;
    type Derived = Awaited<ReturnType<typeof derive>>;
    const ready = p1Deferred<Derived>(), release = p1Deferred<void>();
    let context: Awaited<ReturnType<typeof p7StartedBaySource>> | undefined;
    let pending: ReturnType<BuildingRunController["startDemoRun"]> | undefined;
    let unregister: (() => void) | undefined;
    let restoreDerive: (() => void) | undefined;
    let rejected: AssemblyHallFixture | undefined;
    try {
      context = await p7StartedBaySource("p9-roof-lifecycle-" + kind);
      expect(generate).toHaveBeenCalledTimes(12);
      expect(interpret).toHaveBeenCalledTimes(1);
      const calls = context.createFixture.mock.calls.length;
      const next = { ...structuredClone(context.next), roofType: "gable" as const };
      expect({ ...next, roofType: context.next.roofType }).toEqual(context.next);
      expect(context.fixture.sourceSnapshot?.document.revision).toBe(8);
      interpret.mockClear(); generate.mockClear();
      if (kind === "cancel") {
        const held = vi.spyOn(p3SourceCodec, "deriveBuildingSourceRoofEdit").mockImplementationOnce(async (input) => {
          const value = await derive(input);
          ready.resolve(value);
          await release.promise;
          return value;
        });
        restoreDerive = () => { held.mockRestore(); };
        pending = context.controller.startDemoRun(next);
        const derived = await Promise.race([ready.promise, pending.then(() => { throw new Error("Roof run settled before held derivation"); })]);
        expect(derived.schemaVersion).toBe("0.3.0");
        expect(derived.document.authored).toEqual({ ...context.sourceFile.source.document.authored, roofType: "gable" });
        expect(derived.document.revision).toBe(8);
        expect(derived.stylePack).toEqual(context.sourceFile.source.stylePack);
        context.controller.cancelActiveRun();
        release.resolve();
        expect((await pending).stale).toBe(true);
        expect(held).toHaveBeenCalledTimes(1);
        expect(context.createFixture).toHaveBeenCalledTimes(calls);
        restoreDerive(); restoreDerive = undefined;
      } else {
        const failure = new Error("P9 roof viewer rejected");
        unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
        await expect(context.controller.startDemoRun(next)).rejects.toBe(failure);
        expect(context.createFixture).toHaveBeenCalledTimes(calls + 1);
        rejected = context.fixtures[context.fixtures.length - 1];
        expect(rejected).not.toBe(context.fixture);
        expect(rejected.sourceSnapshot?.document.authored).toEqual({ ...context.sourceFile.source.document.authored, roofType: "gable" });
        expect(rejected.spec.massing.roof.type).toBe("gable");
        expect(context.disposals.get(rejected)).toBe(1);
        unregister(); unregister = undefined;
      }
      await p7ExpectAcceptedSourceRetained(context);
      expect(context.store.getState().controls.committedPrompt).toEqual(context.next);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
      expect((await context.controller.startDemoRun(next)).stale).toBe(false);
      const accepted = context.fixtures[context.fixtures.length - 1];
      expect(accepted).not.toBe(context.fixture);
      expect(accepted.ir).not.toBe(context.fixture.ir);
      expect(accepted.sourceSnapshot?.schemaVersion).toBe("0.3.0");
      expect(accepted.sourceSnapshot?.document.documentId).toBe(context.sourceFile.source.document.documentId);
      expect(accepted.sourceSnapshot?.document.revision).toBe(9);
      expect(accepted.sourceSnapshot?.document.authored).toEqual({ ...context.sourceFile.source.document.authored, roofType: "gable" });
      expect(accepted.sourceSnapshot?.controlsView).toEqual(next);
      expect(accepted.sourceSnapshot?.stylePack).toEqual(context.sourceFile.source.stylePack);
      expect(accepted.sourceSnapshot?.compilation).toEqual(context.sourceFile.source.compilation);
      expect(accepted.spec.massing.roof).toEqual({ type: "gable", pitchDegrees: 28 });
      expect(accepted.packedAtlas).toBe(context.fixture.packedAtlas);
      expect(accepted.debugExport).toBe(context.fixture.debugExport);
      p4ExpectMaterialBytes(accepted, context.materialBytes);
      expect(context.disposals.get(context.fixture)).toBe(1);
      if (rejected) expect(context.disposals.get(rejected)).toBe(1);
      const saved = await context.controller.exportSourceFile();
      const file = p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents));
      expect(saved.revision).toBe(9);
      expect(file.source).toEqual(accepted.sourceSnapshot);
      expect(file.source.document.authored.roofType).toBe("gable");
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally {
      release.resolve(); unregister?.(); context?.controller.dispose();
      await pending?.catch(() => undefined);
      restoreDerive?.(); interpret.mockRestore(); generate.mockRestore();
    }
  }, 20_000);
});

describe("R2.P10 bay catalog Source-Open parity", () => {
  it("preserves every live bay-edit IR buffer when its exact public source is opened", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { sha256Hex } = await import("../core/contentHash");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let source: Awaited<ReturnType<typeof p7StartedBaySource>> | undefined;
    let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    const raw = async (array: ArrayBufferView) => ({
      type: array.constructor.name, byteLength: array.byteLength,
      sha256: await sha256Hex(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
    });
    const fingerprint = async (fixture: AssemblyHallFixture) => {
      expect(fixture.ir.meshBatches.length).toBeGreaterThan(0);
      expect(fixture.ir.instanceBatches.length).toBeGreaterThan(0);
      const meshBatches = [];
      for (const batch of fixture.ir.meshBatches) {
        const { positions, normals, uvs, indices } = batch;
        if (!positions?.length || !normals?.length || !uvs?.length || !indices?.length) {
          throw new Error("Expected complete nonempty IR buffers for " + batch.batchId);
        }
        expect(positions.length % 3).toBe(0);
        expect(normals.length).toBe(positions.length);
        expect(uvs.length).toBe(positions.length / 3 * 2);
        expect(indices.length % 3).toBe(0);
        meshBatches.push({
          batchId: batch.batchId, role: batch.role, materialSlotId: batch.materialSlotId,
          positions: await raw(positions), normals: await raw(normals),
          uvs: await raw(uvs), indices: await raw(indices)
        });
      }
      const instanceBatches = [];
      for (const batch of fixture.ir.instanceBatches) {
        if (!batch.transforms?.length) throw new Error("Expected instance transforms for " + batch.batchId);
        expect(batch.count).toBeGreaterThan(0);
        expect(batch.transforms.length).toBe(batch.count * 16);
        instanceBatches.push({
          batchId: batch.batchId, recipeId: batch.recipeId, materialSlotId: batch.materialSlotId,
          count: batch.count, transforms: await raw(batch.transforms)
        });
      }
      for (const id of ["mesh.roof", "mesh.cornice", "mesh.belt-course", "mesh.roof-cap"]) {
        expect(meshBatches.some(batch => batch.batchId === id)).toBe(true);
      }
      expect(fixture.ir.semanticIndex.length).toBeGreaterThan(0);
      return { meshBatches, instanceBatches, semanticIndex: structuredClone(fixture.ir.semanticIndex) };
    };
    const names = ["baseColor", "normal", "orm", "height", "opacity"] as const;
    const materialMetadata = (fixture: AssemblyHallFixture) => JSON.stringify({
      atlas: { ...fixture.packedAtlas, channels: Object.fromEntries(names.map(name => {
        const layer = fixture.packedAtlas.channels[name];
        return [name, { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, byteLength: layer.data.byteLength }];
      })) }, debug: fixture.debugExport
    });
    try {
      source = await p7StartedBaySource("p10-public-bay-catalog-source");
      expect(generate).toHaveBeenCalledTimes(12);
      expect(interpret).toHaveBeenCalledTimes(1);
      const live = source.fixture, accepted = live.sourceSnapshot;
      if (!accepted) throw new Error("Expected captured authority on the live bay-edit fixture");
      expect(accepted.schemaVersion).toBe("0.3.0");
      expect(accepted.document.revision).toBe(8);
      expect(accepted.document.authored).toEqual({ windowFamily: source.next.windowFamily, floorCount: 5, bayCount: 7 });
      expect(accepted.controlsView).toEqual(source.next);
      expect(live.spec.facade.frontBayCount).toBe(7);
      expect(live.spec.massing.floorCount).toBe(5);
      expect(live.spec.massing.floorHeightsM.slice(1)).toEqual([4.25, 4.25, 4.25, 4.25]);
      expect(accepted.stylePack.massing.floorHeightM.typical).toEqual({ min: 4.25, max: 4.25 });
      const sourceContents = source.saved.contents, materials = p4CopyMaterialBytes(live);
      const metadata = materialMetadata(live), liveGeometry = await fingerprint(live);
      interpret.mockClear(); generate.mockClear();
      receiver = await p3SourceHarness("p10-before-public-bay-open");
      expect((await receiver.controller.openSourceFile({ readText: async () => sourceContents })).stale).toBe(false);
      expect(receiver.fixtures).toHaveLength(1);
      const opened = receiver.fixtures[0];
      expect(opened).not.toBe(live);
      expect(opened.ir).not.toBe(live.ir);
      expect(opened.familyRuntime).not.toBe(live.familyRuntime);
      expect(opened.buildingRuntime.root).not.toBe(live.buildingRuntime.root);
      expect(opened.sourceSnapshot).toEqual(accepted);
      expect(opened.spec).toEqual(live.spec);
      expect(opened.ir.schemaVersion).toBe(live.ir.schemaVersion);
      expect(opened.ir.familyId).toBe(live.ir.familyId);
      expect(opened.ir.buildingId).toBe(live.ir.buildingId);
      expect(opened.sourceSnapshot?.document.revision).toBe(8);
      expect(receiver.store.getState().selection.documentId).toBe(accepted.document.documentId);
      expect(receiver.store.getState().controls.baselineStatus).toBe("known");
      expect(receiver.store.getState().controls.committedPrompt).toEqual(accepted.controlsView);
      expect(materialMetadata(opened)).toBe(metadata);
      p4ExpectMaterialBytes(opened, materials);
      expect((await receiver.controller.exportSourceFile()).contents).toBe(sourceContents);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
      const openedGeometry = await fingerprint(opened);
      console.log("R2_P10_BAY_CATALOG_POSITIVE_CONTROLS " + JSON.stringify({
        providerCallsBefore: 12, interpreterCallsBefore: 1,
        providerCallsAfter: generate.mock.calls.length, interpreterCallsAfter: interpret.mock.calls.length,
        version: accepted.schemaVersion, revision: accepted.document.revision,
        floors: live.spec.massing.floorCount, bays: live.spec.facade.frontBayCount,
        meshes: liveGeometry.meshBatches.length, instances: liveGeometry.instanceBatches.length,
        materialChannels: names.length, liveCatalogId: live.catalog.catalogId, openedCatalogId: opened.catalog.catalogId,
        liveSourceGraphHash: live.ir.sourceGraphHash, openedSourceGraphHash: opened.ir.sourceGraphHash
      }));
      // Retain all batches, including the cornice, belt and roof cap, in this complete equality gate.
      expect(openedGeometry).toEqual(liveGeometry);
    } finally {
      receiver?.controller.dispose(); source?.controller.dispose();
      interpret.mockRestore(); generate.mockRestore();
    }
  }, 20_000);
});

async function p11StateReplayContext(documentId: string) {
  const fixtureModule = await import("../ui/assemblyHallFixture");
  const persistenceModule = await import("../state/completedFamilyPersistence");
  const seed = await fixtureModule.createAssemblyHallFixture({
    promptControls: { ...p1Prompt(), detailLevel: "high", fidelityMode: "kit" }
  });
  let packet: CompletedFamilyPersistencePacket;
  try {
    packet = structuredClone(await persistenceModule.createCompletedFamilyPersistencePacket({
      documentId, runId: documentId + "-accepted", requestHash: documentId + "-request",
      createdAt: "2026-10-15T00:00:00.000Z", fixture: seed
    }));
  } finally { seed.familyRuntime.dispose(); }
  const cache = new Map<string, CompletedFamilyPersistenceCacheEntry>();
  const put = vi.fn(async (entry: CompletedFamilyPersistenceCacheEntry) => { cache.set(entry.requestHash, structuredClone(entry)); });
  const list = vi.fn(async () => Array.from(cache.values()).map(entry => structuredClone(entry)));
  const fixtures: AssemblyHallFixture[] = [];
  const adapter = vi.fn(async (input: CompletedFamilyPersistencePacket) => {
    const fixture = await fixtureModule.restoreAssemblyHallFixtureFromCompletedFamilyPacket(input);
    vi.spyOn(fixture.familyRuntime, "dispose");
    fixtures.push(fixture);
    return fixture;
  });
  const createFixture = vi.fn(async () => { throw new Error("Completed replay cannot generate a replacement fixture."); });
  const store = createBuildingStore(p1Prompt(), "assemblyHall", documentId);
  const registry = new BuildingArtifactRegistry();
  const controller = new BuildingRunController({
    store, registry, createFixture, restoreCompletedFamilyFixture: adapter,
    completedFamilyPersistence: { put, list }
  });
  return { packet, cache, put, list, fixtures, adapter, createFixture, store, registry, controller, persistenceModule };
}

describe("R2.P11 completed replay transactions", () => {
  it("retains the accepted owner and exact cache when the latest saved profile is unresolved", async () => {
    const context = await p11StateReplayContext("p11-state-unresolved");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      const accepted = await context.controller.restoreCompletedFamilyPacket(context.packet);
      const fixture = accepted.fixture!;
      const root = fixture.buildingRuntime.root;
      const metadata = context.registry.listMetadata();
      const bad = structuredClone(context.packet);
      bad.requestHash += "-unresolved"; bad.runId += "-unresolved";
      bad.createdAt = "2026-10-15T00:01:00.000Z";
      bad.artifacts.runtimeIr.sourceGraphHash = "0".repeat(64);
      context.cache.set(bad.requestHash, context.persistenceModule.completedFamilyPersistenceCacheEntry(bad));
      const cacheBefore = structuredClone(Array.from(context.cache.entries()));
      const putCalls = context.put.mock.calls.length;
      await expect(context.controller.restoreLatestCompletedFamily()).rejects.toMatchObject({ code: "building.completedReplayProfileUnresolved" });
      expect(context.registry.get(accepted.artifactId!)).toBe(fixture);
      expect(context.registry.listMetadata()).toEqual(metadata);
      expect(fixture.buildingRuntime.root).toBe(root);
      expect(fixture.familyRuntime.dispose).not.toHaveBeenCalled();
      expect(context.store.getState().runs.status).toBe("failed");
      expect(context.store.getState().runs.activeFixtureArtifactId).toBe(accepted.artifactId);
      expect(context.store.getState().controls.baselineStatus).toBe("unknown");
      expect(context.store.getState().controls.committedPrompt).toBeUndefined();
      expect(Array.from(context.cache.entries())).toEqual(cacheBefore);
      expect(context.put).toHaveBeenCalledTimes(putCalls);
      expect(context.createFixture).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally { context.controller.dispose(); generate.mockRestore(); interpret.mockRestore(); }
  }, 20000);

  it("disposes a held real replay once when a newer restored owner has been accepted", async () => {
    const context = await p11StateReplayContext("p11-state-stale");
    const ready = p1Deferred<void>(), release = p1Deferred<void>();
    const realAdapter = context.adapter.getMockImplementation()!;
    let pending: ReturnType<BuildingRunController["restoreCompletedFamilyPacket"]> | undefined;
    let staleFixture: AssemblyHallFixture | undefined;
    try {
      await context.controller.restoreCompletedFamilyPacket(context.packet);
      context.adapter.mockImplementationOnce(async (packet) => {
        const fixture = await realAdapter(packet);
        staleFixture = fixture; ready.resolve(); await release.promise;
        return fixture;
      });
      const stalePacket = structuredClone(context.packet);
      stalePacket.runId += "-stale"; stalePacket.requestHash += "-stale";
      pending = context.controller.restoreCompletedFamilyPacket(stalePacket);
      await ready.promise;
      expect(staleFixture?.familyRuntime.dispose).not.toHaveBeenCalled();
      const nextPacket = structuredClone(context.packet);
      nextPacket.runId += "-newer"; nextPacket.requestHash += "-newer";
      const newer = await context.controller.restoreCompletedFamilyPacket(nextPacket);
      const current = newer.fixture!;
      expect(current).not.toBe(staleFixture);
      expect(current.buildingRuntime.root).not.toBe(staleFixture?.buildingRuntime.root);
      release.resolve();
      expect((await pending).stale).toBe(true);
      expect(staleFixture?.familyRuntime.dispose).toHaveBeenCalledTimes(1);
      expect(current.familyRuntime.dispose).not.toHaveBeenCalled();
      expect(context.registry.get(newer.artifactId!)).toBe(current);
      expect(context.store.getState().runs.activeRunId).toBe(nextPacket.runId);
      expect(context.store.getState().runs.status).toBe("complete");
      expect(context.cache.has(stalePacket.requestHash)).toBe(false);
      expect(context.cache.has(nextPacket.requestHash)).toBe(true);
      expect(context.createFixture).not.toHaveBeenCalled();
      await expect(context.controller.exportSourceFile()).rejects.toMatchObject({ code: "building.sourceUnavailable" });
    } finally {
      release.resolve(); await pending?.catch(() => undefined); context.controller.dispose();
    }
  }, 20000);

  it("retires a rejected real replay candidate once while keeping the attached owner and aliases", async () => {
    const context = await p11StateReplayContext("p11-state-viewer");
    const failure = new Error("p11 replay viewer rejected");
    let unregister: (() => void) | undefined;
    let releaseOld: (() => void) | undefined;
    try {
      const accepted = await context.controller.restoreCompletedFamilyPacket(context.packet);
      const old = accepted.fixture!;
      const metadata = context.registry.listMetadata(), cacheBefore = structuredClone(Array.from(context.cache.entries()));
      const materials = p4CopyMaterialBytes(old), root = old.buildingRuntime.root;
      releaseOld = context.controller.acquireFixtureViewerLease(old);
      const prepare = vi.fn(async (fixture: AssemblyHallFixture) => {
        expect(fixture).not.toBe(old);
        expect(fixture.buildingRuntime.root).not.toBe(root);
        p4ExpectMaterialBytes(fixture, materials);
        const release = context.controller.acquireFixtureViewerLease(fixture);
        release();
        throw failure;
      });
      unregister = context.controller.registerFixtureViewer(prepare);
      await expect(context.controller.restoreCompletedFamilyPacket(context.packet)).rejects.toBe(failure);
      const candidate = context.fixtures[1];
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(candidate.familyRuntime.dispose).toHaveBeenCalledTimes(1);
      expect(old.familyRuntime.dispose).not.toHaveBeenCalled();
      expect(old.buildingRuntime.root).toBe(root);
      expect(context.registry.get(accepted.artifactId!)).toBe(old);
      expect(context.registry.listMetadata()).toEqual(metadata);
      expect(context.store.getState().runs.activeFixtureArtifactId).toBe(accepted.artifactId);
      expect(Array.from(context.cache.entries())).toEqual(cacheBefore);
      expect(context.createFixture).not.toHaveBeenCalled();
      await expect(context.controller.exportSourceFile()).rejects.toMatchObject({ code: "building.sourceUnavailable" });
    } finally {
      unregister?.(); context.controller.dispose(); releaseOld?.();
    }
  }, 20000);
});

type R3P5Width = import("../contracts/buildingDocument").BuildingWindowWidthOverride;

function r3p5Stable(value: unknown): unknown {
  if (value === undefined) return { valueType: "undefined" };
  if (typeof value === "number" && Object.is(value, -0)) return { valueType: "negative-zero" };
  if (value === null || typeof value !== "object") return value;
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new Error("Uncaptured own symbol metadata");
  if (ArrayBuffer.isView(value)) return { valueType: value.constructor.name, byteOffset: value.byteOffset,
    byteLength: value.byteLength, bufferByteLength: value.buffer.byteLength,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  return { valueType: Array.isArray(value) ? "array" : "object", entries: Object.getOwnPropertyNames(value).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("Expected owned data receipt");
    return [key, r3p5Stable(descriptor.value)];
  }) };
}

function r3p5Source(fixture: AssemblyHallFixture) {
  if (!fixture.sourceSnapshot) throw new Error("Expected actual accepted source authority");
  return fixture.sourceSnapshot;
}
function r3p5Request(fixture: AssemblyHallFixture, directive: R3P5Width) {
  const source = r3p5Source(fixture);
  return { expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision, directive };
}
function r3p5Materials(fixture: AssemblyHallFixture) {
  return r3p5Stable({ ...fixture.packedAtlas,
    channels: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name,
      Object.fromEntries(Object.entries(layer).filter(([key]) => key !== "data"))])), debugExport: fixture.debugExport });
}
async function r3p5Split(fixture: AssemblyHallFixture) {
  const { buildAssemblyHallSourceWindowSplit } = await import("../ui/assemblyHallFixture");
  return buildAssemblyHallSourceWindowSplit({ sourceSnapshot: r3p5Source(fixture), catalog: fixture.catalog });
}
async function r3p5Slots(fixture: AssemblyHallFixture) {
  const split = await r3p5Split(fixture);
  const windows = split.openings.filter(value => value.kind === "window" && value.facade === "front" && value.floorIndex === 1);
  if (windows.length < 2) throw new Error("Expected actual upper front window slots");
  return windows.map(opening => ({ baseWidth: opening.sizeM[0], directive: {
    schemaVersion: "0.1.0" as const, address: { schemaVersion: "0.1.0" as const, facade: opening.facade,
      floorIndex: opening.floorIndex, bayIndex: opening.bayIndex }, widthM: Math.min(0.6, opening.sizeM[0] / 2)
  } }));
}
async function r3p5WidthContext(documentId: string, profile: { fidelityMode: "kit" | "proof"; detailLevel: "high" | "low" } = { fidelityMode: "kit", detailLevel: "high" }) {
  const portable = await p4PortablePinnedStyle(documentId);
  const decoded = await p3SourceCodec.parseBuildingSourceFile(JSON.parse(portable.contents));
  const controls = { ...structuredClone(decoded.sourceSnapshot.controlsView), ...profile, bayCount: 6 };
  const intent = structuredClone(decoded.sourceSnapshot.intent); intent.requested.bayCount = 6;
  const initial = await p3SourceCodec.createBuildingSourceSnapshot({ documentId, revision: 7, controls, intent, stylePack: decoded.sourceSnapshot.stylePack });
  const floor = await p3SourceCodec.deriveBuildingSourceFloorEdit({ sourceSnapshot: initial.sourceSnapshot, floorCount: 5 });
  const bay = await p3SourceCodec.deriveBuildingSourceBayEdit({ sourceSnapshot: floor, bayCount: 7 });
  const sourceSnapshot = p3SourceCodec.withBuildingSourceRevision(bay, 8);
  const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot, packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
  const put = vi.fn(async (...args: unknown[]) => { expect(args).toHaveLength(1); }), context = await p3SourceHarness(documentId + "-before-open", put);
  try {
    const opened = await context.controller.openSourceFile({ readText: async () => JSON.stringify(file) });
    const fixture = opened.fixture;
    if (!fixture) throw new Error("Expected accepted public source Open fixture");
    expect(fixture.sourceSnapshot).toEqual(sourceSnapshot);
    expect(fixture.spec.massing.floorCount).toBe(5); expect(fixture.spec.facade.frontBayCount).toBe(7);
    expect(fixture.spec.massing.floorHeightsM.slice(1)).toEqual(Array(4).fill(4.25));
    expect(fixture.fidelityMode).toBe(profile.fidelityMode);
    put.mockClear();
    return { ...context, put, fixture, opened, slots: await r3p5Slots(fixture), materials: p4CopyMaterialBytes(fixture), materialMetadata: r3p5Materials(fixture) };
  } catch (error) { context.controller.dispose(); throw error; }
}

describe("R3.P5 authored window width transactions", () => {
  it("makes equal-base and repeated requests full no-ops, replaces one absolute width, and removes it exactly once", async () => {
    const context = await r3p5WidthContext("r3-p5-width-sequence");
    let unregister: (() => void) | undefined;
    try {
      const { fixture: base, slots } = context, initialSave = await context.controller.exportSourceFile();
      const baseIr = r3p5Stable(base.ir), baseGallery = r3p5Stable(base.componentGallery), calls = context.createFixture.mock.calls.length;
      const prepare = vi.fn(async () => ({ commit: () => () => undefined, discard: () => undefined }));
      unregister = context.controller.registerFixtureViewer(prepare);
      const runs = context.store.getState().runs;
      const equalBase = await context.controller.applyWindowWidthOverride(r3p5Request(base, { ...slots[0].directive, widthM: slots[0].baseWidth }));
      expect(equalBase.fixture).toBe(base); expect(equalBase.runId).toBe(context.opened.runId); expect(equalBase.stale).toBe(false);
      expect(context.store.getState().runs).toBe(runs);
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(prepare).not.toHaveBeenCalled(); expect(context.put).not.toHaveBeenCalled();
      expect((await context.controller.exportSourceFile()).contents).toBe(initialSave.contents);
      const first = await context.controller.applyWindowWidthOverride(r3p5Request(base, slots[0].directive));
      const narrowed = first.fixture!;
      expect(narrowed).not.toBe(base); expect(narrowed.ir).not.toBe(base.ir); expect(narrowed.componentGallery).not.toBe(base.componentGallery);
      expect(r3p5Stable(narrowed.ir)).not.toEqual(baseIr);
      expect(r3p5Source(narrowed).schemaVersion).toBe("0.4.0"); expect(r3p5Source(narrowed).document.revision).toBe(9);
      const narrowedKey = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo",
        prompt: r3p5Source(narrowed).controlsView, sourceContentHash: r3p5Source(narrowed).sourceContentHash });
      expect(context.registry.listMetadata().find(entry => entry.artifactId === context.store.getState().runs.activeFixtureArtifactId)?.requestHash).toBe(narrowedKey);
      const saved = await context.controller.exportSourceFile(), nowCalls = context.createFixture.mock.calls.length, nowRuns = context.store.getState().runs;
      prepare.mockClear();
      for (const directive of [slots[0].directive, { ...slots[1].directive, widthM: slots[1].baseWidth }]) {
        const same = await context.controller.applyWindowWidthOverride(r3p5Request(narrowed, directive));
        expect(same.fixture).toBe(narrowed); expect(same.runId).toBe(first.runId); expect(same.stale).toBe(false);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      }
      expect(context.store.getState().runs).toBe(nowRuns); expect(context.createFixture).toHaveBeenCalledTimes(nowCalls);
      expect(prepare).not.toHaveBeenCalled(); expect(context.put).not.toHaveBeenCalled();
      const increasedDirective = { ...slots[0].directive, widthM: (slots[0].directive.widthM + slots[0].baseWidth) / 2 };
      const increased = (await context.controller.applyWindowWidthOverride(r3p5Request(narrowed, increasedDirective))).fixture!;
      expect(r3p5Source(increased).document.revision).toBe(10);
      const increasedKey = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo",
        prompt: r3p5Source(increased).controlsView, sourceContentHash: r3p5Source(increased).sourceContentHash });
      expect(increasedKey).not.toBe(narrowedKey);
      expect(context.registry.listMetadata().find(entry => entry.artifactId === context.store.getState().runs.activeFixtureArtifactId)?.requestHash).toBe(increasedKey);
      const other = (await context.controller.applyWindowWidthOverride(r3p5Request(increased, slots[1].directive))).fixture!;
      const otherSource = r3p5Source(other);
      if (otherSource.schemaVersion !== "0.4.0") throw new Error("Expected width source v4");
      expect(otherSource.windowWidthOverrides).toEqual([slots[1].directive]); expect(otherSource.document.revision).toBe(11);
      expect(context.put).not.toHaveBeenCalled();
      const removed = await context.controller.applyWindowWidthOverride(r3p5Request(other, { ...slots[1].directive, widthM: slots[1].baseWidth }));
      const empty = removed.fixture!, emptySource = r3p5Source(empty);
      if (emptySource.schemaVersion !== "0.4.0") throw new Error("Removing a directive must retain v4");
      expect(emptySource.windowWidthOverrides).toEqual([]); expect(emptySource.document.revision).toBe(12);
      expect(r3p5Stable(empty.ir)).toEqual(baseIr); expect(r3p5Stable(empty.componentGallery)).toEqual(baseGallery);
      expect(context.put).toHaveBeenCalledTimes(1);
      const removedKey = await hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo",
        prompt: emptySource.controlsView, sourceContentHash: emptySource.sourceContentHash });
      expect(context.put.mock.calls[0][0]).toMatchObject({ requestHash: removedKey, artifact: { requestHash: removedKey } });
      const finalCalls = context.createFixture.mock.calls.length;
      const again = await context.controller.applyWindowWidthOverride(r3p5Request(empty, { ...slots[1].directive, widthM: slots[1].baseWidth }));
      expect(again.fixture).toBe(empty); expect(again.runId).toBe(removed.runId);
      expect(context.createFixture).toHaveBeenCalledTimes(finalCalls); expect(context.put).toHaveBeenCalledTimes(1);
      const portable = await context.controller.exportSourceFile();
      expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(portable.contents)).schemaVersion).toBe("0.4.0");
      for (const value of [narrowed, increased, other, empty]) {
        expect(value.packedAtlas).toBe(base.packedAtlas); expect(value.debugExport).toBe(base.debugExport); expect(value.catalog).toBe(base.catalog);
        p4ExpectMaterialBytes(value, context.materials); expect(r3p5Materials(value)).toEqual(context.materialMetadata);
      }
    } finally { unregister?.(); context.controller.dispose(); }
  }, 30_000);

  it("reopens kit/high and proof/low edits with complete IR, gallery and five exact materials and retains a captured Save owner", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      for (const profile of [{ fidelityMode: "kit", detailLevel: "high" }, { fidelityMode: "proof", detailLevel: "low" }] as const) {
        const context = await r3p5WidthContext("r3-p5-portable-" + profile.fidelityMode, profile);
        let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
        let restoreSave: (() => void) | undefined;
        const releaseSave = p1Deferred<void>();
        try {
          expect(interpret).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(12);
          interpret.mockClear(); generate.mockClear();
          const changed = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive))).fixture!;
          const ir = r3p5Stable(changed.ir), gallery = r3p5Stable(changed.componentGallery), source = r3p5Source(changed);
          if (profile.fidelityMode === "kit") {
            const witness = { ...changed.ir, meshBatches: changed.ir.meshBatches.map(batch => ({ ...batch })) };
            delete witness.meshBatches[0].materialSlotId;
            const absent = r3p5Stable(witness); witness.meshBatches[0].materialSlotId = undefined;
            expect(r3p5Stable(witness)).not.toEqual(absent);
            const positions = changed.ir.meshBatches.find(batch => (batch.positions?.length ?? 0) > 0)?.positions;
            if (!positions) throw new Error("Expected actual width-edited vertices");
            const bytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), first = bytes[0];
            try { bytes[0] ^= 1; expect(r3p5Stable(changed.ir)).not.toEqual(ir); }
            finally { bytes[0] = first; }
            expect(r3p5Stable(changed.ir)).toEqual(ir);
            Object.defineProperty(witness, Symbol("uncaptured"), { value: true });
            expect(() => r3p5Stable(witness)).toThrow("Uncaptured own symbol metadata");
          }
          expect(changed.packedAtlas).toBe(context.fixture.packedAtlas); expect(changed.catalog).toBe(context.fixture.catalog);
          expect(changed.debugExport).toBe(context.fixture.debugExport); expect(context.put).not.toHaveBeenCalled();
          let saved: Awaited<ReturnType<BuildingRunController["exportSourceFile"]>>;
          if (profile.fidelityMode === "kit") {
            const originalSave = p3SourceCodec.createBuildingSourceFile, ready = p1Deferred<void>();
            const held = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementationOnce(async input => {
              const file = await originalSave(input); ready.resolve(); await releaseSave.promise; return file;
            });
            restoreSave = () => held.mockRestore();
            const saving = context.controller.exportSourceFile(); await ready.promise;
            const replacement = (await context.controller.applyWindowWidthOverride(r3p5Request(changed, {
              ...context.slots[0].directive, widthM: (context.slots[0].directive.widthM + context.slots[0].baseWidth) / 2
            }))).fixture!;
            expect(replacement).not.toBe(changed); expect(context.disposals.get(changed) ?? 0).toBe(0);
            releaseSave.resolve(); saved = await saving;
            expect(context.disposals.get(changed)).toBe(1);
            restoreSave(); restoreSave = undefined;
            expect(saved.revision).toBe(source.document.revision);
            expect(p3SourceCodec.BuildingSourceFileSchema.parse(JSON.parse(saved.contents)).source).toEqual(source);
          } else saved = await context.controller.exportSourceFile();
          const put = vi.fn(async () => undefined);
          receiver = await p3SourceHarness("r3-p5-receiver-" + profile.fidelityMode, put);
          const opened = await receiver.controller.openSourceFile({ readText: async () => saved.contents });
          const fresh = opened.fixture!;
          expect(fresh).not.toBe(changed); expect(fresh.ir).not.toBe(changed.ir); expect(fresh.componentGallery).not.toBe(changed.componentGallery);
          expect(r3p5Stable(fresh.ir)).toEqual(ir); expect(r3p5Stable(fresh.componentGallery)).toEqual(gallery);
          expect(fresh.sourceSnapshot).toEqual(source); expect(fresh.fidelityMode).toBe(profile.fidelityMode);
          expect(r3p5Source(fresh).compilation).toEqual(profile);
          expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
          p4ExpectMaterialBytes(fresh, context.materials); expect(r3p5Materials(fresh)).toEqual(context.materialMetadata);
          expect(put).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { releaseSave.resolve(); restoreSave?.(); receiver?.controller.dispose(); context.controller.dispose(); }
        interpret.mockClear(); generate.mockClear();
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 40_000);

  it("rejects invalid targets and stale content or revisions atomically, including an equal-content ABA cycle", async () => {
    const context = await r3p5WidthContext("r3-p5-conflicts");
    try {
      const base = context.fixture, request = r3p5Request(base, context.slots[0].directive), saved = await context.controller.exportSourceFile();
      const calls = context.createFixture.mock.calls.length, metadata = context.registry.listMetadata();
      const publishedSource = r3p5Source(base);
      try {
        base.sourceSnapshot = p3SourceCodec.withBuildingSourceRevision(publishedSource, publishedSource.document.revision + 10);
        await expect(context.controller.applyWindowWidthOverride(r3p5Request(base, context.slots[0].directive)))
          .rejects.toMatchObject({ code: "building.sourceEditConflict" });
      } finally { base.sourceSnapshot = publishedSource; }
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      const split = await r3p5Split(base), door = split.openings.find(value => value.kind === "door");
      if (!door) throw new Error("Expected actual door target");
      let reads = 0;
      const accessor = Object.defineProperty({ ...context.slots[0].directive }, "widthM", { enumerable: true, get() { reads += 1; return 0.6; } });
      const invalid = [
        { input: { ...request, expectedSourceContentHash: "0".repeat(64) }, code: "building.sourceEditConflict" },
        { input: { ...request, expectedRevision: request.expectedRevision - 1 }, code: "building.sourceEditConflict" },
        { input: { ...request, directive: { ...request.directive, address: { ...request.directive.address, floorIndex: 999 } } }, code: "building.windowSlot.missingOpening" },
        { input: { ...request, directive: { ...request.directive, address: { schemaVersion: "0.1.0", facade: door.facade, floorIndex: door.floorIndex, bayIndex: door.bayIndex } } }, code: "building.windowSlot.notWindow" },
        { input: { ...request, directive: { ...request.directive, widthM: context.slots[0].baseWidth + 0.1 } }, code: "building.windowWidth.unsupportedWidth" },
        { input: { ...request, directive: { ...request.directive, widthM: 0.22 } }, code: "building.windowWidth.unsupportedWidth" },
        { input: { ...request, directive: accessor }, code: "building.windowWidth.invalidDirective" }
      ];
      for (const failure of invalid) {
        await expect(context.controller.applyWindowWidthOverride(failure.input)).rejects.toMatchObject({ code: failure.code });
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(base) ?? 0).toBe(0);
      }
      expect(reads).toBe(0); expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.put).not.toHaveBeenCalled();
      const a = (await context.controller.applyWindowWidthOverride(request)).fixture!, oldA = r3p5Request(a, context.slots[0].directive);
      const b = (await context.controller.applyWindowWidthOverride(r3p5Request(a, { ...context.slots[0].directive,
        widthM: (context.slots[0].directive.widthM + context.slots[0].baseWidth) / 2 }))).fixture!;
      const againA = (await context.controller.applyWindowWidthOverride(r3p5Request(b, context.slots[0].directive))).fixture!;
      expect(r3p5Source(againA).sourceContentHash).toBe(oldA.expectedSourceContentHash);
      expect(r3p5Source(againA).document.revision).toBe(oldA.expectedRevision + 2);
      const before = await context.controller.exportSourceFile(), nowCalls = context.createFixture.mock.calls.length;
      await expect(context.controller.applyWindowWidthOverride(oldA)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect((await context.controller.exportSourceFile()).contents).toBe(before.contents);
      expect(context.createFixture).toHaveBeenCalledTimes(nowCalls); expect(context.disposals.get(againA) ?? 0).toBe(0);
    } finally { context.controller.dispose(); }
  }, 30_000);

  it("captures caller input before derivation and discards cancelled or superseded width candidates exactly once", async () => {
    const context = await r3p5WidthContext("r3-p5-width-stale");
    const derived = p1Deferred<import("../state/buildingSourceFile").BuildingSourceSnapshot>(), releaseDerived = p1Deferred<void>();
    const releaseFixture = p1Deferred<void>(), fixtureReady = p1Deferred<AssemblyHallFixture>();
    const releasePlan = p1Deferred<void>(), planReady = p1Deferred<void>();
    let pending: ReturnType<BuildingRunController["applyWindowWidthOverride"]> | undefined;
    let restoreDerive: (() => void) | undefined;
    let restorePlan: (() => void) | undefined;
    try {
      const fixtureModule = await import("../ui/assemblyHallFixture"), originalPlan = fixtureModule.buildAssemblyHallSourceWindowSplit;
      const heldPlan = vi.spyOn(fixtureModule, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => {
        const value = await originalPlan(input); planReady.resolve(); await releasePlan.promise; return value;
      });
      restorePlan = () => heldPlan.mockRestore();
      const beforeCalls = context.createFixture.mock.calls.length, beforeRuns = context.store.getState().runs;
      pending = context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive));
      await Promise.race([planReady.promise, pending.then(() => { throw new Error("Width run settled before held base split"); })]);
      const laterNoop = await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, {
        ...context.slots[0].directive, widthM: context.slots[0].baseWidth
      }));
      expect(laterNoop.fixture).toBe(context.fixture); expect(laterNoop.runId).toBe(context.opened.runId);
      releasePlan.resolve(); expect((await pending).stale).toBe(true);
      expect(context.createFixture).toHaveBeenCalledTimes(beforeCalls); expect(context.store.getState().runs).toBe(beforeRuns);
      expect(context.put).not.toHaveBeenCalled(); expect(r3p5Source(context.fixture).document.revision).toBe(8);
      restorePlan(); restorePlan = undefined;
      const originalDerive = p3SourceCodec.deriveBuildingSourceWindowWidthEdit;
      const held = vi.spyOn(p3SourceCodec, "deriveBuildingSourceWindowWidthEdit").mockImplementationOnce(async input => {
        const value = await originalDerive(input); derived.resolve(value); await releaseDerived.promise; return value;
      });
      restoreDerive = () => held.mockRestore();
      const request = r3p5Request(context.fixture, structuredClone(context.slots[0].directive));
      pending = context.controller.applyWindowWidthOverride(request);
      request.expectedSourceContentHash = "0".repeat(64); request.expectedRevision = 999;
      request.directive.widthM = 999; request.directive.address.floorIndex = 999;
      const captured = await Promise.race([derived.promise, pending.then(() => { throw new Error("Width run settled before held derivation"); })]);
      if (captured.schemaVersion !== "0.4.0") throw new Error("Expected captured width source");
      expect(captured.windowWidthOverrides).toEqual([context.slots[0].directive]);
      const calls = context.createFixture.mock.calls.length;
      context.controller.cancelActiveRun(); releaseDerived.resolve(); expect((await pending).stale).toBe(true);
      expect(context.createFixture).toHaveBeenCalledTimes(calls);
      expect(r3p5Source(context.fixture).document.revision).toBe(8);
      restoreDerive(); restoreDerive = undefined;
      const create = context.createFixture.getMockImplementation();
      if (!create) throw new Error("Expected actual tracked fixture factory");
      context.createFixture.mockImplementationOnce(async input => { const candidate = await create(input); fixtureReady.resolve(candidate); await releaseFixture.promise; return candidate; });
      pending = context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive));
      const candidate = await Promise.race([fixtureReady.promise, pending.then(() => { throw new Error("Width run settled before held actual fixture"); })]);
      expect(context.disposals.get(candidate) ?? 0).toBe(0);
      const next = { ...structuredClone(r3p5Source(context.fixture).controlsView), windowFamily: "tall-rectangular" };
      const winner = (await context.controller.startDemoRun(next)).fixture!;
      const saved = await context.controller.exportSourceFile();
      releaseFixture.resolve(); expect((await pending).stale).toBe(true);
      expect(context.disposals.get(candidate)).toBe(1); expect(context.disposals.get(winner) ?? 0).toBe(0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(r3p5Source(winner).document.revision).toBe(9);
      expect("windowWidthOverrides" in r3p5Source(winner)).toBe(false);
      p4ExpectMaterialBytes(winner, context.materials); expect(context.put).toHaveBeenCalledTimes(1);
    } finally {
      releasePlan.resolve(); releaseDerived.resolve(); releaseFixture.resolve(); restorePlan?.(); restoreDerive?.(); context.controller.dispose();
      await pending?.catch(() => undefined);
    }
  }, 30_000);

  it("retains the directive through supported globals and rejects disappearing slots and stale hashes even when paths survive", async () => {
    const context = await r3p5WidthContext("r3-p5-width-globals");
    try {
      let current = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive))).fixture!;
      const stale = r3p5Request(current, context.slots[0].directive);
      for (const patch of [{ windowFamily: "tall-rectangular" }, { floorCount: 6 }, { bayCount: 6 }, { roofType: "gable" as const }]) {
        const controls = { ...structuredClone(r3p5Source(current).controlsView), ...patch };
        const previous = current;
        current = (await context.controller.startDemoRun(controls)).fixture!;
        const source = r3p5Source(current);
        if (source.schemaVersion !== "0.4.0") throw new Error("A global edit dropped width authority");
        expect(source.windowWidthOverrides).toEqual([context.slots[0].directive]);
        expect(source.document.revision).toBe(r3p5Source(previous).document.revision + 1);
        expect(current.packedAtlas).toBe(context.fixture.packedAtlas); expect(current.debugExport).toBe(context.fixture.debugExport);
        p4ExpectMaterialBytes(current, context.materials); expect(r3p5Materials(current)).toEqual(context.materialMetadata);
      }
      const split = await r3p5Split(current);
      expect(split.openings.some(value => value.facade === stale.directive.address.facade && value.floorIndex === stale.directive.address.floorIndex && value.bayIndex === stale.directive.address.bayIndex)).toBe(true);
      await expect(context.controller.applyWindowWidthOverride(stale)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      const top = split.openings.find(value => value.kind === "window" && value.facade === "front" && value.floorIndex === current.spec.massing.floorCount - 1);
      if (!top) throw new Error("Expected a current last-floor window");
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, { schemaVersion: "0.1.0", address: {
        schemaVersion: "0.1.0", facade: top.facade, floorIndex: top.floorIndex, bayIndex: top.bayIndex }, widthM: Math.min(0.6, top.sizeM[0] / 2) }))).fixture!;
      const saved = await context.controller.exportSourceFile(), revision = r3p5Source(current).document.revision;
      await expect(context.controller.startDemoRun({ ...structuredClone(r3p5Source(current).controlsView), floorCount: top.floorIndex }))
        .rejects.toMatchObject({ code: "building.windowSlot.missingOpening" });
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(r3p5Source(current).document.revision).toBe(revision); expect(context.disposals.get(current) ?? 0).toBe(0);
      expect(context.put).not.toHaveBeenCalled();
    } finally { context.controller.dispose(); }
  }, 30_000);

  it("rolls back viewer failures and a document change inside commit, then retires the leased old owner only after a valid retry", async () => {
    const context = await r3p5WidthContext("r3-p5-width-viewer");
    const base = context.fixture, saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata();
    const releaseOld = context.controller.acquireFixtureViewerLease(base), rejected: AssemblyHallFixture[] = [];
    let unregister: (() => void) | undefined;
    try {
      for (const kind of ["reject", "commit-route", "candidate-source"] as const) {
        const failure = new Error("P5 width viewer rejected"), discard = vi.fn();
        const viewReady = p1Deferred<AssemblyHallFixture>(), releaseView = p1Deferred<void>();
        unregister = context.controller.registerFixtureViewer(async fixture => {
          rejected.push(fixture);
          const release = context.controller.acquireFixtureViewerLease(fixture);
          if (kind === "reject") { release(); throw failure; }
          if (kind === "candidate-source") { viewReady.resolve(fixture); await releaseView.promise; }
          return { commit: () => { if (kind === "commit-route") context.store.getState().selectDocument("r3-p5-other-route"); return () => undefined; },
            discard: () => { discard(); release(); } };
        });
        const request = context.controller.applyWindowWidthOverride(r3p5Request(base, context.slots[0].directive));
        try {
          if (kind === "candidate-source") {
            const candidate = await Promise.race([viewReady.promise, request.then(() => { throw new Error("Width run settled before held viewer"); })]);
            candidate.sourceSnapshot = r3p5Source(base);
            releaseView.resolve();
          }
          if (kind === "reject") await expect(request).rejects.toBe(failure);
          else {
            await expect(request).rejects.toMatchObject({ code: kind === "candidate-source" ? "building.sourceFileInvalid" : "building.sourceEditConflict" });
            expect(discard).toHaveBeenCalledTimes(1);
          }
        } finally { releaseView.resolve(); }
        unregister(); unregister = undefined;
        context.store.getState().selectDocument(r3p5Source(base).document.documentId);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(base) ?? 0).toBe(0);
        expect(context.disposals.get(rejected[rejected.length - 1])).toBe(1);
        expect(r3p5Source(base).document.revision).toBe(8); expect(context.put).not.toHaveBeenCalled();
      }
      const accepted = (await context.controller.applyWindowWidthOverride(r3p5Request(base, context.slots[0].directive))).fixture!;
      expect(r3p5Source(accepted).document.revision).toBe(9); expect(context.disposals.get(base) ?? 0).toBe(0);
      releaseOld(); expect(context.disposals.get(base)).toBe(1);
      for (const candidate of rejected) expect(context.disposals.get(candidate)).toBe(1);
      p4ExpectMaterialBytes(accepted, context.materials); expect(context.disposals.get(accepted) ?? 0).toBe(0);
    } finally { unregister?.(); context.controller.dispose(); releaseOld(); }
  }, 30_000);
});


import { canonicalJson as r3p9CanonicalJson } from "../core/canonicalJson";
type R3P9Record = import("../state/buildingSourceCheckpoint").BuildingSourceCheckpoint;
function r4LegacyCheckpointFile(record: R3P9Record): R3P9File {
  if (record.kind !== "source" || record.sourceFile.schemaVersion === "0.6.0") throw new Error("Expected an unchanged legacy portable checkpoint.");
  return record.sourceFile;
}

type R3P9Status = import("../state/buildingRunController").BuildingSourceCheckpointStatus;
type R3P9Writer = import("../state/buildingRunController").ExclusiveBuildingSourceCheckpointWriter;
type R3P9Options = Omit<import("../state/buildingRunController").BuildingRunControllerOptions, "store" | "registry" | "createFixture">;
type R3P9File = Awaited<ReturnType<typeof p3SourceCodec.createBuildingSourceFile>>;

async function r3p9Harness(documentId: string, options: R3P9Options = {}) {
  const { createAssemblyHallFixture } = await import("../ui/assemblyHallFixture");
  const store = createBuildingStore(), registry = new BuildingArtifactRegistry();
  store.getState().selectDocument(documentId);
  const fixtures: AssemblyHallFixture[] = [], disposals = new Map<AssemblyHallFixture, number>();
  const createFixture = vi.fn(async (input: CreateAssemblyHallFixtureInput) => {
    const fixture = await createAssemblyHallFixture(input), dispose = fixture.familyRuntime.dispose.bind(fixture.familyRuntime);
    vi.spyOn(fixture.familyRuntime, "dispose").mockImplementation(() => {
      disposals.set(fixture, (disposals.get(fixture) ?? 0) + 1); return dispose();
    });
    fixtures.push(fixture); return fixture;
  });
  let sequence = 0;
  const controller = new BuildingRunController({ store, registry, createFixture,
    createRunId: () => documentId + "-run-" + (++sequence), ...options });
  return { store, registry, controller, createFixture, fixtures, disposals };
}

function r3p9Writers(onPut: (record: R3P9Record, index: number) => Promise<void> = async () => undefined,
  onRelease: (index: number) => void = () => undefined) {
  const jobs: Array<{ exclusive: true; documentId: string; put: ReturnType<typeof vi.fn<(record: R3P9Record) => Promise<void>>>;
    release: ReturnType<typeof vi.fn<() => void>> }> = [];
  const retain = vi.fn((documentId: string): R3P9Writer => {
    const index = jobs.length;
    const capability = { exclusive: true as const, documentId,
      put: vi.fn(async (record: R3P9Record) => { await onPut(record, index); }),
      release: vi.fn(() => onRelease(index)) };
    jobs.push(capability); return capability;
  });
  return { jobs, retain };
}

function r3p9MaterialMetadata(packedAtlas: AssemblyHallFixture["packedAtlas"], debugExport: AssemblyHallFixture["debugExport"]) {
  const { channels, ...atlas } = packedAtlas;
  const channelMetadata = Object.fromEntries(Object.entries(channels).map(([name, layer]) => {
    const { data, ...metadata } = layer; void data; return [name, metadata];
  }));
  return r3p9CanonicalJson({ atlas, channelMetadata, debugExport });
}

async function r3p9VerifySourceRecord(record: R3P9Record, source: ReturnType<typeof r3p5Source>,
  bytes: ReturnType<typeof p4CopyMaterialBytes>, metadata: string) {
  const { parseBuildingSourceCheckpoint } = await import("../state/buildingSourceCheckpoint");
  const verified = await parseBuildingSourceCheckpoint(record);
  if (verified.kind !== "source") throw new Error("Expected actual portable source checkpoint.");
  const decoded = await p3SourceCodec.parseBuildingSourceFile(verified.sourceFile);
  expect(r3p9CanonicalJson(decoded.file)).toBe(r3p9CanonicalJson(verified.sourceFile));
  expect(r3p9CanonicalJson(decoded.sourceSnapshot)).toBe(r3p9CanonicalJson(source));
  for (const row of bytes) {
    const channel = decoded.packedAtlas.channels[row.name];
    expect(channel.widthPx).toBe(row.widthPx); expect(channel.heightPx).toBe(row.heightPx);
    expect(channel.data.byteLength).toBe(row.data.byteLength);
    expect(Array.from(channel.data)).toEqual(Array.from(row.data));
  }
  expect(r3p9MaterialMetadata(decoded.packedAtlas, decoded.debugExport)).toBe(metadata);
  return verified;
}

describe("R3.P9 accepted source checkpoint scheduling", () => {
  it("keeps the default disabled with zero source capture, checkpoint status or database work", async () => {
    const generic = await import("../materials/indexedDbArtifactPersistence");
    const database = vi.spyOn(generic, "createIndexedDbArtifactPersistence").mockImplementation(() => { throw new Error("Unexpected checkpoint database."); });
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile"), status = vi.fn();
    const completedPut = vi.fn(async () => undefined);
    const context = await r3p9Harness("r3-p9-disabled", { onSourceCheckpointStatus: status, completedFamilyPersistence: { put: completedPut } });
    try {
      const accepted = await context.controller.startDemoRun(p3SourcePrompt());
      expect(accepted.stale).toBe(false); expect(accepted.fixture?.sourceSnapshot).toBeDefined();
      await context.controller.drainSourceCheckpoints();
      expect(context.controller.getSourceCheckpointStatus("r3-p9-disabled")).toBeUndefined();
      expect(encode).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled(); expect(database).not.toHaveBeenCalled();
      expect(completedPut).toHaveBeenCalledTimes(1);
    } finally { context.controller.dispose(); encode.mockRestore(); database.mockRestore(); }
  }, 30_000);

  it("captures source and materials before retainers and observers, then releases GPU ownership while capture and I/O remain blocked", async () => {
    const documentId = "r3-p9-capture-owner", encodedReady = p1Deferred<R3P9File>(), releaseEncoding = p1Deferred<void>();
    const ioReady = p1Deferred<R3P9Record>(), releaseIo = p1Deferred<void>();
    const originalEncode = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementationOnce(input => {
      const owned = originalEncode(input);
      return owned.then(file => { encodedReady.resolve(file); return releaseEncoding.promise.then(() => file); });
    });
    const statuses: R3P9Status[] = [], writes: R3P9Record[] = [];
    const writers = r3p9Writers(async record => { writes.push(record); ioReady.resolve(record); await releaseIo.promise; });
    let source: ReturnType<typeof r3p5Source> | undefined, bytes: ReturnType<typeof p4CopyMaterialBytes> | undefined, metadata = "";
    const originals: Array<{ layer: Uint8ClampedArray; byte: number }> = [];
    const mutate = (fixture: AssemblyHallFixture, name: "baseColor" | "height" | "normal") => {
      const layer = fixture.packedAtlas.channels[name].data;
      originals.push({ layer, byte: layer[0] }); layer[0] ^= 255;
    };
    const context: Awaited<ReturnType<typeof r3p9Harness>> = await r3p9Harness(documentId, {
      retainSourceCheckpointWriter: doc => {
        const fixture = context.fixtures[0];
        source = r3p5Source(fixture); bytes = p4CopyMaterialBytes(fixture);
        metadata = r3p9MaterialMetadata(fixture.packedAtlas, fixture.debugExport);
        mutate(fixture, "height"); return writers.retain(doc);
      },
      onSourceCheckpointStatus: status => { statuses.push(status); if (status.state === "pending") mutate(context.fixtures[0], "normal"); }
    });
    const unsubscribe = context.store.subscribe(next => {
      if (next.runs.status !== "complete" || !source || originals.some(row => row.layer === context.fixtures[0].packedAtlas.channels.baseColor.data)) return;
      mutate(context.fixtures[0], "baseColor");
      context.fixtures[0].sourceSnapshot = p3SourceCodec.withBuildingSourceRevision(source, source.document.revision + 99);
    });
    try {
      const accepted = await context.controller.startDemoRun(p3SourcePrompt());
      expect(accepted.stale).toBe(false); expect(context.store.getState().runs.status).toBe("complete");
      await vi.waitFor(() => expect(statuses.some(status => status.state === "pending")).toBe(true));
      const encoded = await encodedReady.promise;
      if (!source || !bytes) throw new Error("Expected original accepted capture inputs.");
      expect(r3p9CanonicalJson(encoded.source)).toBe(r3p9CanonicalJson(source));
      expect(writes).toHaveLength(0); expect(writers.jobs).toHaveLength(1);
      expect(writers.jobs[0].release).not.toHaveBeenCalled();
      expect(Object.isFrozen(context.controller.getSourceCheckpointStatus(documentId))).toBe(true);
      context.controller.dispose();
      expect(context.disposals.get(context.fixtures[0])).toBe(1);
      const notificationCount = statuses.length;
      for (const row of originals) row.layer[0] = row.byte;
      context.fixtures[0].sourceSnapshot = source;
      releaseEncoding.resolve();
      const record = await ioReady.promise;
      expect(writers.jobs[0].release).not.toHaveBeenCalled();
      expect(context.disposals.get(context.fixtures[0])).toBe(1);
      await r3p9VerifySourceRecord(record, source, bytes, metadata);
      releaseIo.resolve(); await context.controller.drainSourceCheckpoints();
      expect(writers.jobs[0].release).toHaveBeenCalledTimes(1);
      expect(statuses).toHaveLength(notificationCount);
      expect(writes).toHaveLength(1);
    } finally {
      for (const row of originals) row.layer[0] = row.byte;
      if (source) context.fixtures[0].sourceSnapshot = source;
      unsubscribe(); releaseEncoding.resolve(); releaseIo.resolve(); context.controller.dispose();
      await context.controller.drainSourceCheckpoints(); encode.mockRestore();
    }
  }, 30_000);

  it("serializes reversed captures in acceptance order and drains only the already accepted queue snapshot", async () => {
    const originalEncode = p3SourceCodec.createBuildingSourceFile;
    const captures: Array<{ ready: ReturnType<typeof p1Deferred<R3P9File>>; release: ReturnType<typeof p1Deferred<void>> }> = [];
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementation(input => {
      const owned = originalEncode(input), ready = p1Deferred<R3P9File>(), release = p1Deferred<void>();
      captures.push({ ready, release });
      return owned.then(file => { ready.resolve(file); return release.promise.then(() => file); });
    });
    const writes: R3P9Record[] = [], statuses: R3P9Status[] = [], firstIo = p1Deferred<void>(), thirdIo = p1Deferred<void>();
    const writers = r3p9Writers(async (record, index) => { writes.push(record); if (index === 0) await firstIo.promise; if (index === 2) await thirdIo.promise; });
    const context = await r3p9Harness("r3-p9-fifo", { retainSourceCheckpointWriter: writers.retain, onSourceCheckpointStatus: status => statuses.push(status) });
    try {
      const first = await context.controller.startDemoRun(p3SourcePrompt("tall-arched"));
      const firstPending = context.controller.getSourceCheckpointStatus("r3-p9-fifo");
      const second = await context.controller.startDemoRun(p3SourcePrompt("tall-rectangular"));
      expect(captures).toHaveLength(2); await Promise.all(captures.map(capture => capture.ready.promise));
      captures[1].release.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(writes).toHaveLength(0);
      const drain = context.controller.drainSourceCheckpoints(); let drained = false; void drain.then(() => { drained = true; });
      const third = await context.controller.startDemoRun(p3SourcePrompt("tall-arched"));
      expect(captures).toHaveLength(3); await captures[2].ready.promise;
      const latestPending = context.controller.getSourceCheckpointStatus("r3-p9-fifo");
      expect(latestPending).toMatchObject({ runId: third.runId, state: "pending" });
      expect(latestPending!.publication).toBeGreaterThan(firstPending!.publication);
      expect(context.disposals.get(first.fixture!)).toBe(1); expect(context.disposals.get(second.fixture!)).toBe(1);
      const notificationCutoff = statuses.length;
      captures[0].release.resolve();
      await vi.waitFor(() => expect(writes).toHaveLength(1));
      expect(drained).toBe(false); expect(writers.jobs[0].release).not.toHaveBeenCalled();
      firstIo.resolve(); await drain;
      expect(drained).toBe(true); expect(writes).toHaveLength(2);
      expect(writes.map(record => record.kind === "source" ? r4LegacyCheckpointFile(record).source.document.revision : -1)).toEqual([0, 1]);
      expect(writers.jobs[0].release).toHaveBeenCalledTimes(1); expect(writers.jobs[1].release).toHaveBeenCalledTimes(1);
      expect(writers.jobs[2].release).not.toHaveBeenCalled();
      expect(context.controller.getSourceCheckpointStatus("r3-p9-fifo")).toMatchObject({ runId: third.runId, state: "pending" });
      expect(statuses.slice(notificationCutoff).every(status => status.runId === third.runId)).toBe(true);
      expect(firstPending?.state).toBe("pending"); expect(Object.isFrozen(firstPending)).toBe(true);
      captures[2].release.resolve(); await vi.waitFor(() => expect(writes).toHaveLength(3));
      expect(writes[2].kind === "source" && r4LegacyCheckpointFile(writes[2]).source.document.revision).toBe(2);
      thirdIo.resolve(); await context.controller.drainSourceCheckpoints();
      await vi.waitFor(() => expect(statuses.some(status => status.runId === third.runId && status.state === "saved")).toBe(true));
      expect(context.controller.getSourceCheckpointStatus("r3-p9-fifo")).toMatchObject({ runId: third.runId, state: "saved", checkpointContentHash: writes[2].contentHash });
      expect(statuses.filter(status => status.state === "saved").map(status => status.runId)).toEqual([third.runId]);
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
    } finally {
      for (const capture of captures) capture.release.resolve(); firstIo.resolve(); thirdIo.resolve();
      context.controller.dispose(); await context.controller.drainSourceCheckpoints(); encode.mockRestore();
    }
  }, 40_000);


  it("retains durable data through capture and write failures, keeps the queue usable, and isolates listener and release errors", async () => {
    const captureFailure = new Error("actual capture continuation failed"), writeFailure = new Error("checkpoint I/O failed");
    const releaseFailure = new Error("capability release failed"), listenerFailure = new Error("status listener failed");
    let failWrite = false;
    const committed: R3P9Record[] = [], attempted: R3P9Record[] = [], statuses: R3P9Status[] = [];
    const writers = r3p9Writers(async record => { attempted.push(record); if (failWrite) throw writeFailure; committed.push(record); }, () => { throw releaseFailure; });
    const context = await r3p9Harness("r3-p9-failures", { retainSourceCheckpointWriter: writers.retain,
      onSourceCheckpointStatus: status => { statuses.push(status); throw listenerFailure; } });
    const originalEncode = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile");
    try {
      const first = await context.controller.startDemoRun(p3SourcePrompt("tall-arched"));
      await context.controller.drainSourceCheckpoints();
      expect(first.stale).toBe(false); expect(committed).toHaveLength(1);
      const retained = r3p9CanonicalJson(committed[0]);
      expect(context.controller.getSourceCheckpointStatus("r3-p9-failures")).toMatchObject({ state: "saved", checkpointContentHash: committed[0].contentHash });
      encode.mockImplementationOnce(input => originalEncode(input).then(() => { throw captureFailure; }));
      const captured = await context.controller.startDemoRun(p3SourcePrompt("tall-rectangular"));
      await context.controller.drainSourceCheckpoints();
      expect(captured.stale).toBe(false); expect(context.store.getState().runs.status).toBe("complete");
      expect(context.registry.get(captured.artifactId!)).toBe(captured.fixture);
      expect(attempted).toHaveLength(1); expect(r3p9CanonicalJson(committed[0])).toBe(retained);
      const captureStatus = context.controller.getSourceCheckpointStatus("r3-p9-failures");
      expect(captureStatus).toMatchObject({ runId: captured.runId, state: "failed", error: { code: "building.sourceCheckpointWriteFailed" } });
      expect(captureStatus?.error?.cause).toBe(captureFailure);
      expect(Object.isFrozen(captureStatus)).toBe(true); expect(Object.isFrozen(captureStatus?.error)).toBe(false);
      expect(Object.isFrozen(captureFailure)).toBe(false);
      failWrite = true;
      const rejected = await context.controller.startDemoRun(p3SourcePrompt("tall-arched"));
      await context.controller.drainSourceCheckpoints();
      const writeStatus = context.controller.getSourceCheckpointStatus("r3-p9-failures");
      expect(rejected.stale).toBe(false); expect(context.registry.get(rejected.artifactId!)).toBe(rejected.fixture);
      expect(writeStatus).toMatchObject({ runId: rejected.runId, state: "failed", error: { code: "building.sourceCheckpointWriteFailed" } });
      expect(writeStatus?.error?.cause).toBe(writeFailure);
      expect(committed).toHaveLength(1); expect(r3p9CanonicalJson(committed[0])).toBe(retained);
      failWrite = false;
      const recovered = await context.controller.startDemoRun(p3SourcePrompt("tall-rectangular"));
      await context.controller.drainSourceCheckpoints();
      await vi.waitFor(() => expect(statuses.some(status => status.runId === recovered.runId && status.state === "saved")).toBe(true));
      expect(context.controller.getSourceCheckpointStatus("r3-p9-failures")).toMatchObject({ runId: recovered.runId, state: "saved", checkpointContentHash: committed[1].contentHash });
      expect(attempted).toHaveLength(3); expect(committed).toHaveLength(2); expect(writers.jobs).toHaveLength(4);
      for (const writer of writers.jobs) expect(writer.release).toHaveBeenCalledTimes(1);
      expect(context.store.getState().runs.status).toBe("complete"); expect(context.disposals.get(recovered.fixture!) ?? 0).toBe(0);
      expect(captureStatus?.error?.cause).toBe(captureFailure); expect(writeStatus?.error?.cause).toBe(writeFailure);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); encode.mockRestore(); }
  }, 40_000);

  it("requires an already exclusive matching capability after actual capture and reports retention failures without rolling back the scene", async () => {
    const originalEncode = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementation(input => originalEncode(input));
    try {
      for (const mode of ["throw", "undefined", "nonexclusive", "wrong-document"] as const) {
        const failure = new Error("retention failed " + mode), put = vi.fn(async () => undefined), release = vi.fn();
        const previousCaptures = encode.mock.calls.length;
        let capturedBeforeRetain = false;
        const retain = vi.fn((documentId: string): R3P9Writer | undefined => {
          capturedBeforeRetain = encode.mock.calls.length === previousCaptures + 1;
          if (mode === "throw") throw failure;
          if (mode === "undefined") return undefined;
          // Deliberately violate the trusted capability type to verify its runtime admission guard.
          return { exclusive: mode !== "nonexclusive", documentId: mode === "wrong-document" ? "foreign-document" : documentId, put, release } as unknown as R3P9Writer;
        });
        const documentId = "r3-p9-retain-" + mode;
        const context = await r3p9Harness(documentId, { retainSourceCheckpointWriter: retain });
        try {
          const accepted = await context.controller.startDemoRun(p3SourcePrompt());
          await context.controller.drainSourceCheckpoints();
          expect(accepted.stale).toBe(false); expect(context.registry.get(accepted.artifactId!)).toBe(accepted.fixture);
          expect(context.store.getState().runs.status).toBe("complete"); expect(context.disposals.get(accepted.fixture!) ?? 0).toBe(0);
          expect(capturedBeforeRetain).toBe(true); expect(retain).toHaveBeenCalledExactlyOnceWith(documentId);
          expect(put).not.toHaveBeenCalled();
          const status = context.controller.getSourceCheckpointStatus(documentId);
          expect(status).toMatchObject({ documentId, runId: accepted.runId, state: "failed", error: { code: "building.sourceCheckpointWriteFailed" } });
          if (mode === "throw") expect(status?.error?.cause).toBe(failure);
          else expect(status?.error?.cause).toMatchObject({ message: expect.any(String) });
          expect(release).toHaveBeenCalledTimes(mode === "nonexclusive" || mode === "wrong-document" ? 1 : 0);
        } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
      }
    } finally { encode.mockRestore(); }
  }, 40_000);

  it("automatically records a real v4 width publication with exact portable source and five material channels, but not its repeated no-op", async () => {
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const writes: R3P9Record[] = [], writers = r3p9Writers(async record => { writes.push(record); });
    const context = await r3p9Harness("r3-p9-width-portable", { retainSourceCheckpointWriter: writers.retain });
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile");
    try {
      const first = await context.controller.startDemoRun(p3SourcePrompt()); await context.controller.drainSourceCheckpoints();
      const base = first.fixture!;
      expect(generate.mock.calls.length).toBeGreaterThan(0); expect(interpret.mock.calls.length).toBeGreaterThan(0);
      const bytes = p4CopyMaterialBytes(base), metadata = r3p9MaterialMetadata(base.packedAtlas, base.debugExport);
      await r3p9VerifySourceRecord(writes[0], r3p5Source(base), bytes, metadata);
      generate.mockClear(); interpret.mockClear();
      const slots = await r3p5Slots(base), changed = await context.controller.applyWindowWidthOverride(r3p5Request(base, slots[0].directive));
      expect(changed.stale).toBe(false); const current = changed.fixture!;
      await context.controller.drainSourceCheckpoints();
      expect(writes).toHaveLength(2); expect(encode).toHaveBeenCalledTimes(2);
      const source = r3p5Source(current), record = await r3p9VerifySourceRecord(writes[1], source, bytes, metadata);
      expect(record.kind).toBe("source");
      const checkpointSource = r4LegacyCheckpointFile(record).source;
      if (record.kind !== "source" || checkpointSource.schemaVersion !== "0.4.0") throw new Error("Expected actual v4 portable width checkpoint.");
      expect(record.sourceFile.schemaVersion).toBe("0.4.0");
      expect(checkpointSource.windowWidthOverrides).toEqual([slots[0].directive]);
      expect(r4LegacyCheckpointFile(record).source.document.revision).toBe(r3p5Source(base).document.revision + 1);
      expect(r4LegacyCheckpointFile(record).source.sourceContentHash).not.toBe(r3p5Source(base).sourceContentHash);
      expect(context.controller.getSourceCheckpointStatus("r3-p9-width-portable")).toMatchObject({
        runId: changed.runId, kind: "source", state: "saved", revision: source.document.revision,
        sourceContentHash: source.sourceContentHash, checkpointContentHash: record.contentHash
      });
      const beforeNoop = context.controller.getSourceCheckpointStatus("r3-p9-width-portable");
      const noop = await context.controller.applyWindowWidthOverride(r3p5Request(current, slots[0].directive));
      await context.controller.drainSourceCheckpoints();
      expect(noop.fixture).toBe(current); expect(noop.runId).toBe(changed.runId); expect(noop.stale).toBe(false);
      expect(context.controller.getSourceCheckpointStatus("r3-p9-width-portable")).toEqual(beforeNoop);
      expect(writes).toHaveLength(2); expect(writers.jobs).toHaveLength(2); expect(encode).toHaveBeenCalledTimes(2);
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); encode.mockRestore(); generate.mockRestore(); interpret.mockRestore(); }
  }, 30_000);

  it("writes only an explicit-import identity marker, never cache replay or a marker under a mismatched document", async () => {
    const persistence = await import("../state/completedFamilyPersistence");
    const { restoreAssemblyHallFixtureFromCompletedFamilyPacket } = await import("../ui/assemblyHallFixture");
    const documentId = "r3-p9-import", writes: R3P9Record[] = [], durable = new Map<string, R3P9Record>();
    const writers = r3p9Writers(async record => { writes.push(record); durable.set(record.documentId, record); });
    let cacheEntry: CompletedFamilyPersistenceCacheEntry | undefined;
    const completedPut = vi.fn(async () => undefined), list = vi.fn(async () => cacheEntry ? [cacheEntry] : []);
    const context = await r3p9Harness(documentId, { retainSourceCheckpointWriter: writers.retain,
      completedFamilyPersistence: { put: completedPut, list }, restoreCompletedFamilyFixture: restoreAssemblyHallFixtureFromCompletedFamilyPacket });
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile");
    try {
      const first = await context.controller.startDemoRun(p3SourcePrompt()); await context.controller.drainSourceCheckpoints();
      const packet = await persistence.createCompletedFamilyPersistencePacket({ documentId, runId: "r3-p9-explicit-import",
        requestHash: await hashCanonicalJson({ kind: "p9-import", documentId }), createdAt: "2026-10-15T12:34:56.000Z", fixture: first.fixture! });
      cacheEntry = persistence.completedFamilyPersistenceCacheEntry(packet);
      const imported = await context.controller.restoreCompletedFamilyPacket(packet); await context.controller.drainSourceCheckpoints();
      expect(imported.stale).toBe(false); expect(imported.fixture?.sourceSnapshot).toBeUndefined();
      expect(writes).toHaveLength(2); expect(encode).toHaveBeenCalledTimes(1);
      const marker = writes[1];
      expect(marker).toMatchObject({ schemaVersion: "0.1.0", kind: "source-unavailable", documentId, reason: "completed-family-import",
        completedFamilyRef: { runId: packet.runId, createdAt: packet.createdAt, requestHash: packet.requestHash, contentHash: packet.contentHash } });
      expect("sourceFile" in marker).toBe(false);
      // The document plus these four fields identifies the import; it is not a full completed-IR digest.
      const { parseBuildingSourceCheckpoint } = await import("../state/buildingSourceCheckpoint");
      expect(await parseBuildingSourceCheckpoint(marker)).toEqual(marker);
      const beforeReplay = context.controller.getSourceCheckpointStatus(documentId);
      expect(beforeReplay).toMatchObject({ runId: packet.runId, kind: "source-unavailable", state: "saved" });
      expect(beforeReplay?.sourceContentHash).toBeUndefined(); expect(beforeReplay?.revision).toBeUndefined();
      const replayed = await context.controller.restoreLatestCompletedFamily(); await context.controller.drainSourceCheckpoints();
      expect(replayed?.stale).toBe(false); expect(list).toHaveBeenCalledTimes(1);
      expect(writes).toHaveLength(2); expect(encode).toHaveBeenCalledTimes(1);
      expect(context.controller.getSourceCheckpointStatus(documentId)).toEqual(beforeReplay);
      context.store.getState().selectDocument("r3-p9-other-route");
      const mismatched = await context.controller.restoreCompletedFamilyPacket(packet); await context.controller.drainSourceCheckpoints();
      expect(mismatched.stale).toBe(false); expect(context.store.getState().runs.status).toBe("complete");
      expect(writes).toHaveLength(2); expect(durable.has("r3-p9-other-route")).toBe(false);
      expect(durable.get(documentId)).toBe(marker);
      expect(context.controller.getSourceCheckpointStatus("r3-p9-other-route")).toMatchObject({ state: "failed", error: { code: "building.sourceCheckpointWriteFailed" } });
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); encode.mockRestore(); }
  }, 40_000);

  it("records an observer-throwing accepted publication once but excludes rejected, canceled and superseded width candidates", async () => {
    const writes: R3P9Record[] = [], writers = r3p9Writers(async record => { writes.push(record); });
    const context = await r3p9Harness("r3-p9-publication-admission", { retainSourceCheckpointWriter: writers.retain });
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile");
    const observerFailure = new Error("accepted observer failed");
    let throwObserver = true;
    const unsubscribe = context.store.subscribe(next => {
      if (throwObserver && next.runs.status === "complete") { throwObserver = false; throw observerFailure; }
    });
    let unregister: (() => void) | undefined;
    try {
      const accepted = await context.controller.startDemoRun(p3SourcePrompt()); await context.controller.drainSourceCheckpoints();
      expect(accepted.stale).toBe(false); expect(writes).toHaveLength(1); expect(encode).toHaveBeenCalledTimes(1);
      expect(writers.jobs).toHaveLength(1); expect(writers.jobs[0].release).toHaveBeenCalledTimes(1);
      unsubscribe();
      let current = accepted.fixture!;
      const slots = await r3p5Slots(current);
      const noop = await context.controller.applyWindowWidthOverride(r3p5Request(current, { ...slots[0].directive, widthM: slots[0].baseWidth }));
      expect(noop.fixture).toBe(current); expect(writes).toHaveLength(1); expect(encode).toHaveBeenCalledTimes(1);
      for (const action of ["reject", "cancel", "supersede"] as const) {
        const beforeWrites = writes.length, beforeCaptures = encode.mock.calls.length, beforeJobs = writers.jobs.length;
        const failure = new Error("candidate viewer rejected"), entered = p1Deferred<AssemblyHallFixture>(), release = p1Deferred<void>(), discard = vi.fn();
        const handle = { commit: () => () => undefined, discard };
        unregister = context.controller.registerFixtureViewer(async fixture => {
          if (fixture.sourceSnapshot?.schemaVersion !== "0.4.0") return { commit: () => () => undefined, discard: () => undefined };
          entered.resolve(fixture); if (action === "reject") throw failure;
          await release.promise; return handle;
        });
        const request = context.controller.applyWindowWidthOverride(r3p5Request(current, slots[0].directive));
        try {
          const candidate = await entered.promise;
          if (action === "reject") await expect(request).rejects.toBe(failure);
          else {
            let winner: Awaited<ReturnType<BuildingRunController["startDemoRun"]>> | undefined;
            if (action === "cancel") context.controller.cancelActiveRun();
            else winner = await context.controller.startDemoRun({ ...r3p5Source(current).controlsView });
            release.resolve(); expect((await request).stale).toBe(true);
            if (winner) { expect(winner.stale).toBe(false); current = winner.fixture!; }
          }
          await context.controller.drainSourceCheckpoints();
          expect(context.disposals.get(candidate)).toBe(1);
          expect(writes.length - beforeWrites).toBe(action === "supersede" ? 1 : 0);
          expect(encode.mock.calls.length - beforeCaptures).toBe(action === "supersede" ? 1 : 0);
          expect(writers.jobs.length - beforeJobs).toBe(action === "supersede" ? 1 : 0);
          expect(context.disposals.get(current) ?? 0).toBe(0);
        } finally { release.resolve(); unregister(); unregister = undefined; await request.catch(() => undefined); }
      }
      expect(writes).toHaveLength(2);
      expect(writes.every(record => record.kind === "source" && record.sourceFile.schemaVersion !== "0.4.0")).toBe(true);
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); unregister?.(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); encode.mockRestore(); }
  }, 40_000);
});


describe("R3.P9 paired capture and retention failure", () => {
  it("drains the actual owned capture before reporting its failure ahead of a synchronous retention failure", async () => {
    const checkpoints = await import("../state/buildingSourceCheckpoint");
    const createRecord = vi.spyOn(checkpoints, "createBuildingSourceCheckpoint");
    const captureFailure = new Error("held real capture failed"), retentionFailure = new Error("retainer failed first");
    const encodedReady = p1Deferred<R3P9File>();
    let rejectCapture!: (cause: Error) => void;
    const held = new Promise<R3P9File>((_resolve, reject) => { rejectCapture = reject; });
    void held.catch(() => undefined);
    const originalEncode = p3SourceCodec.createBuildingSourceFile;
    const encode = vi.spyOn(p3SourceCodec, "createBuildingSourceFile").mockImplementationOnce(input => {
      const owned = originalEncode(input);
      return owned.then(file => { encodedReady.resolve(file); return held; });
    });
    const retain = vi.fn((): R3P9Writer => { throw retentionFailure; });
    const context = await r3p9Harness("r3-p9-paired-failure", { retainSourceCheckpointWriter: retain });
    try {
      const accepted = await context.controller.startDemoRun(p3SourcePrompt());
      const file = await encodedReady.promise;
      expect(file.source).toEqual(accepted.fixture?.sourceSnapshot);
      expect(accepted.stale).toBe(false); expect(retain).toHaveBeenCalledTimes(1);
      let drained = false;
      const drain = context.controller.drainSourceCheckpoints().then(() => { drained = true; });
      await Promise.resolve(); await Promise.resolve();
      expect(drained).toBe(false); expect(createRecord).not.toHaveBeenCalled();
      expect(context.controller.getSourceCheckpointStatus("r3-p9-paired-failure")).toMatchObject({ runId: accepted.runId, state: "pending" });
      rejectCapture(captureFailure); await drain;
      const status = context.controller.getSourceCheckpointStatus("r3-p9-paired-failure");
      expect(drained).toBe(true);
      expect(status).toMatchObject({ runId: accepted.runId, state: "failed", error: { code: "building.sourceCheckpointWriteFailed" } });
      expect(status?.error?.cause).toBe(captureFailure); expect(status?.error?.cause).not.toBe(retentionFailure);
      expect(createRecord).not.toHaveBeenCalled();
      expect(context.store.getState().runs.status).toBe("complete");
      expect(context.registry.get(accepted.artifactId!)).toBe(accepted.fixture);
      expect(context.disposals.get(accepted.fixture!) ?? 0).toBe(0);
    } finally {
      rejectCapture(captureFailure); context.controller.dispose(); await context.controller.drainSourceCheckpoints();
      encode.mockRestore(); createRecord.mockRestore();
    }
  }, 30_000);
});

type R3P11Checkpoint = import("../state/buildingSourceCheckpoint").BuildingSourceCheckpoint;
type R3P11SourceFile = Awaited<ReturnType<typeof p3SourceCodec.createBuildingSourceFile>>;
let r3p11Seed: Promise<{ packet: CompletedFamilyPersistencePacket; file: R3P11SourceFile }> | undefined;

function r3p11Owned(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (ArrayBuffer.isView(item)) return {
      type: Object.prototype.toString.call(item), byteOffset: item.byteOffset,
      byteLength: item.byteLength, bufferByteLength: item.buffer.byteLength,
      bytes: Array.from(new Uint8Array(item.buffer, item.byteOffset, item.byteLength))
    };
    return item === undefined ? { absentValue: true } : item;
  });
}

async function r3p11SeedArtifacts() {
  r3p11Seed ??= (async () => {
    const fixtures = await import("../ui/assemblyHallFixture"), persistence = await import("../state/completedFamilyPersistence");
    const fixture = await fixtures.createAssemblyHallFixture({ promptControls: { ...p1Prompt(), detailLevel: "high", fidelityMode: "kit" } });
    try {
      if (!fixture.sourceSnapshot) throw new Error("Expected the actual seed source.");
      return {
        packet: await persistence.createCompletedFamilyPersistencePacket({ documentId: "r3-p11-seed", runId: "r3-p11-seed-run",
          requestHash: "r3-p11-seed-request", createdAt: "2026-10-15T00:00:00.000Z", fixture }),
        file: await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: fixture.sourceSnapshot,
          packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport })
      };
    } finally { fixture.familyRuntime.dispose(); }
  })();
  return r3p11Seed;
}

async function r3p11Marker(packet: CompletedFamilyPersistencePacket): Promise<R3P11Checkpoint> {
  const checkpoints = await import("../state/buildingSourceCheckpoint");
  return checkpoints.createBuildingSourceCheckpoint({ schemaVersion: "0.1.0", kind: "source-unavailable",
    documentId: packet.documentId, createdAt: "2026-10-15T00:01:00.000Z", reason: "completed-family-import",
    completedFamilyRef: { runId: packet.runId, createdAt: packet.createdAt, requestHash: packet.requestHash, contentHash: packet.contentHash } });
}

async function r3p11RecoveryContext(documentId: string) {
  const seed = await r3p11SeedArtifacts(), fixturesModule = await import("../ui/assemblyHallFixture");
  const persistenceModule = await import("../state/completedFamilyPersistence"), checkpoints = await import("../state/buildingSourceCheckpoint");
  const controllerModule = await import("../state/buildingRunController");
  const packet = { ...structuredClone(seed.packet), documentId, runId: documentId + "-saved", requestHash: documentId + "-request" };
  const record = await r3p11Marker(packet), cache = new Map<string, CompletedFamilyPersistenceCacheEntry>();
  cache.set(packet.requestHash, persistenceModule.completedFamilyPersistenceCacheEntry(packet));
  const get = vi.fn(async <T,>(artifactType: string, requestHash: string, schemaVersion?: "0.1.0") => {
    expect(artifactType).toBe(COMPLETED_FAMILY_ARTIFACT_TYPE); expect(schemaVersion).toBe("0.1.0");
    return structuredClone(cache.get(requestHash)) as import("../materials/artifactCache").CachedArtifactEntry<T> | undefined;
  });
  const put = vi.fn(async () => undefined);
  const list = vi.fn(async () => Array.from(cache.values()));
  const persistence: NonNullable<ConstructorParameters<typeof BuildingRunController>[0]["completedFamilyPersistence"]> = {
    get: <T,>(artifactType: string, requestHash: string, schemaVersion?: "0.1.0") =>
      get(artifactType, requestHash, schemaVersion) as Promise<import("../materials/artifactCache").CachedArtifactEntry<T> | undefined>, put, list
  };
  const fixtures: AssemblyHallFixture[] = [];
  const adapter = vi.fn(async (input: CompletedFamilyPersistencePacket) => {
    const fixture = await fixturesModule.restoreAssemblyHallFixtureFromCompletedFamilyPacket(input);
    vi.spyOn(fixture.familyRuntime, "dispose"); fixtures.push(fixture); return fixture;
  });
  const createFixture = vi.fn(async () => { throw new Error("Checkpoint recovery must not generate fresh source."); });
  const retain = vi.fn(() => undefined), status = vi.fn();
  const store = createBuildingStore(p1Prompt(), "assemblyHall", documentId), registry = new BuildingArtifactRegistry();
  let nextRun = 0;
  const controller = new BuildingRunController({ store, registry, completedFamilyPersistence: persistence,
    restoreCompletedFamilyFixture: adapter, createFixture, createRunId: () => documentId + "-recovery-" + (++nextRun),
    retainSourceCheckpointWriter: retain, onSourceCheckpointStatus: status });
  return { seed, packet, record, cache, get, put, list, persistence, fixtures, adapter, createFixture, retain, status,
    store, registry, controller, fixturesModule, persistenceModule, checkpoints, controllerModule };
}

type R3P11Context = Awaited<ReturnType<typeof r3p11RecoveryContext>>;

function r3p11ReadOnly(context: R3P11Context, cacheBefore: string) {
  expect(r3p11Owned(Array.from(context.cache.entries()))).toBe(cacheBefore);
  expect(context.put).not.toHaveBeenCalled(); expect(context.list).not.toHaveBeenCalled();
  expect(context.retain).not.toHaveBeenCalled(); expect(context.status).not.toHaveBeenCalled();
  expect(context.createFixture).not.toHaveBeenCalled();
  expect(context.controller.getSourceCheckpointStatus(context.packet.documentId)).toBeUndefined();
}

async function r3p11Failure(context: R3P11Context, work: Promise<unknown>, cause?: unknown) {
  const failure: unknown = await work.then(() => undefined, error => error);
  expect(failure).toBeInstanceOf(context.controllerModule.BuildingSourceCheckpointRecoveryError);
  expect(failure).toMatchObject({ code: "building.sourceCheckpointRecoveryFailed" });
  if (!(failure instanceof context.controllerModule.BuildingSourceCheckpointRecoveryError)) throw new Error("Expected typed recovery failure.");
  if (cause !== undefined) expect(failure.cause).toBe(cause);
  return failure;
}

describe("R3.P11 exact unavailable checkpoint recovery", () => {
  it("restores the exact referenced real packet instead of a newer cache entry, without source or persistence writes", async () => {
    const context = await r3p11RecoveryContext("r3-p11-exact");
    const newer = { ...structuredClone(context.packet), runId: "newer-unreferenced", requestHash: "newer-request", createdAt: "2026-10-15T02:00:00.000Z" };
    context.cache.set(newer.requestHash, context.persistenceModule.completedFamilyPersistenceCacheEntry(newer));
    const cacheBefore = r3p11Owned(Array.from(context.cache.entries()));
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter"), { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let expected: AssemblyHallFixture | undefined;
    try {
      expected = await context.fixturesModule.restoreAssemblyHallFixtureFromCompletedFamilyPacket(context.packet);
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), fixture = accepted.fixture!;
      expect(accepted).toMatchObject({ runId: context.packet.runId, stale: false });
      expect(context.get).toHaveBeenCalledTimes(1); expect(context.get).toHaveBeenCalledWith("completed-family", context.packet.requestHash, "0.1.0");
      expect(context.adapter).toHaveBeenCalledTimes(1); expect(r3p11Owned(context.adapter.mock.calls[0][0])).toBe(r3p11Owned(context.packet));
      expect(fixture).not.toBe(expected); expect(fixture.buildingRuntime.root).not.toBe(expected.buildingRuntime.root);
      expect(r3p11Owned(fixture.ir)).toBe(r3p11Owned(expected.ir));
      expect(r3p11Owned(fixture.componentGallery)).toBe(r3p11Owned(expected.componentGallery));
      expect(r3p11Owned(fixture.packedAtlas)).toBe(r3p11Owned(expected.packedAtlas));
      expect(r3p11Owned(fixture.debugExport)).toBe(r3p11Owned(expected.debugExport));
      expect(fixture.sourceSnapshot).toBeUndefined();
      expect(context.store.getState().controls.baselineStatus).toBe("unknown");
      expect(context.store.getState().controls.committedPrompt).toBeUndefined();
      await expect(context.controller.exportSourceFile()).rejects.toMatchObject({ code: "building.sourceUnavailable" });
      await context.controller.drainSourceCheckpoints(); r3p11ReadOnly(context, cacheBefore);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally { expected?.familyRuntime.dispose(); context.controller.dispose(); interpret.mockRestore(); generate.mockRestore(); }
  }, 30_000);

  it("rejects every reference identity and envelope mismatch before restore while retaining the accepted owner and records", async () => {
    const context = await r3p11RecoveryContext("r3-p11-identities");
    try {
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), fixture = accepted.fixture!;
      const metadata = r3p11Owned(context.registry.listMetadata()), entry = context.cache.get(context.packet.requestHash)!;
      const mutations: Array<(value: CompletedFamilyPersistenceCacheEntry) => void> = [
        value => { value.artifact.documentId += "-foreign"; }, value => { value.artifact.runId += "-foreign"; },
        value => { value.artifact.createdAt += "-foreign"; }, value => { value.artifact.requestHash += "-foreign"; },
        value => { value.artifact.contentHash += "-foreign"; }, value => { value.artifactType = "another-artifact"; },
        value => { value.requestHash += "-foreign"; }, value => { value.contentHash += "-foreign"; },
        value => { value.dependencies[0] += "-foreign"; }, value => { value.dependencies.reverse(); },
        value => { Reflect.deleteProperty(value, "dependencies"); }, value => { Reflect.deleteProperty(value.artifact, "artifacts"); }
      ];
      for (const mutate of mutations) {
        const corrupt = structuredClone(entry); mutate(corrupt); context.cache.set(context.packet.requestHash, corrupt);
        const before = r3p11Owned(Array.from(context.cache.entries()));
        await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(context.record));
        expect(context.adapter).toHaveBeenCalledTimes(1);
        expect(context.registry.get(accepted.artifactId!)).toBe(fixture); expect(fixture.familyRuntime.dispose).not.toHaveBeenCalled();
        expect(r3p11Owned(context.registry.listMetadata())).toBe(metadata); r3p11ReadOnly(context, before);
      }
    } finally { context.controller.dispose(); }
  }, 30_000);

  it("fails closed for missing get, missing record, IO, invalid marker and source-kind input without fallback", async () => {
    const seed = await r3p11SeedArtifacts(), context = await r3p11RecoveryContext(seed.file.source.document.documentId);
    try {
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), fixture = accepted.fixture!;
      const before = r3p11Owned(Array.from(context.cache.entries()));
      delete context.persistence.get;
      await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(context.record));
      context.persistence.get = <T,>(artifactType: string, requestHash: string, schemaVersion?: "0.1.0") =>
        context.get(artifactType, requestHash, schemaVersion) as Promise<import("../materials/artifactCache").CachedArtifactEntry<T> | undefined>;
      context.get.mockResolvedValueOnce(undefined);
      await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(context.record));
      const ioCause = new Error("completed direct read failed"); context.get.mockRejectedValueOnce(ioCause);
      await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(context.record), ioCause);
      const beforeGet = context.get.mock.calls.length;
      const invalid = { ...structuredClone(context.record), contentHash: "0".repeat(64) };
      const invalidFailure = await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(invalid));
      expect(invalidFailure.cause).toMatchObject({ code: "building.sourceCheckpointInvalid" });
      let getters = 0;
      Object.defineProperty(invalid, "documentId", { enumerable: true, get: () => { getters += 1; return context.packet.documentId; } });
      await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(invalid)); expect(getters).toBe(0);
      const source = await context.checkpoints.createBuildingSourceCheckpoint({ schemaVersion: "0.1.0", kind: "source",
        documentId: seed.file.source.document.documentId, createdAt: "2026-10-15T00:02:00.000Z", sourceFile: seed.file });
      await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(source));
      expect(context.get).toHaveBeenCalledTimes(beforeGet);
      expect(context.adapter).toHaveBeenCalledTimes(1); expect(context.registry.get(accepted.artifactId!)).toBe(fixture);
      expect(fixture.familyRuntime.dispose).not.toHaveBeenCalled(); r3p11ReadOnly(context, before);
    } finally { context.controller.dispose(); }
  }, 30_000);

  it("owns markers before callbacks and reserves recovery before a held parse can be superseded or change document", async () => {
    for (const action of ["supersede", "document"] as const) {
      const context = await r3p11RecoveryContext("r3-p11-parse-" + action);
      const ready = p1Deferred<R3P11Checkpoint>(), release = p1Deferred<void>(), original = context.checkpoints.parseBuildingSourceCheckpoint;
      const parser = vi.spyOn(context.checkpoints, "parseBuildingSourceCheckpoint").mockImplementationOnce(input => {
        const owned = original(input); return owned.then(record => { ready.resolve(record); return release.promise.then(() => record); });
      });
      const caller = structuredClone(context.record), expected = r3p11Owned(caller), pending = context.controller.restoreSourceUnavailableCheckpoint(caller);
      caller.documentId += "-mutated";
      if (caller.kind === "source-unavailable") caller.completedFamilyRef.runId += "-mutated";
      const before = r3p11Owned(Array.from(context.cache.entries()));
      try {
        expect(r3p11Owned(await ready.promise)).toBe(expected); expect(Object.isFrozen(caller)).toBe(false);
        let winner: Awaited<ReturnType<BuildingRunController["restoreSourceUnavailableCheckpoint"]>> | undefined;
        if (action === "supersede") winner = await context.controller.restoreSourceUnavailableCheckpoint(context.record);
        else context.store.getState().selectDocument("another-document");
        release.resolve(); expect((await pending).stale).toBe(true);
        expect(context.get).toHaveBeenCalledTimes(action === "supersede" ? 1 : 0);
        expect(context.adapter).toHaveBeenCalledTimes(action === "supersede" ? 1 : 0);
        if (winner) expect(context.registry.get(winner.artifactId!)).toBe(winner.fixture);
        r3p11ReadOnly(context, before);
      } finally { release.resolve(); await pending.catch(() => undefined); parser.mockRestore(); context.controller.dispose(); }
    }
  }, 30_000);

  it("discards held exact reads after cancellation, supersession or a selected-document change", async () => {
    for (const action of ["cancel", "supersede", "document"] as const) {
      const context = await r3p11RecoveryContext("r3-p11-get-" + action);
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), old = accepted.fixture!;
      const release = p1Deferred<CompletedFamilyPersistenceCacheEntry | undefined>();
      context.get.mockImplementationOnce(async <T,>() => await release.promise as import("../materials/artifactCache").CachedArtifactEntry<T> | undefined);
      const pending = context.controller.restoreSourceUnavailableCheckpoint(context.record);
      const before = r3p11Owned(Array.from(context.cache.entries()));
      try {
        await vi.waitFor(() => expect(context.get).toHaveBeenCalledTimes(2));
        let winner = accepted;
        if (action === "cancel") context.controller.cancelActiveRun();
        else if (action === "document") context.store.getState().selectDocument("another-document");
        else winner = await context.controller.restoreSourceUnavailableCheckpoint(context.record);
        release.resolve(context.cache.get(context.packet.requestHash)); expect((await pending).stale).toBe(true);
        expect(context.adapter).toHaveBeenCalledTimes(action === "supersede" ? 2 : 1);
        expect(context.registry.get(winner.artifactId!)).toBe(winner.fixture);
        expect(old.familyRuntime.dispose).toHaveBeenCalledTimes(action === "supersede" ? 1 : 0);
        r3p11ReadOnly(context, before);
      } finally { release.resolve(context.cache.get(context.packet.requestHash)); await pending.catch(() => undefined); context.controller.dispose(); }
    }
  }, 40_000);

  it("guards selected-document identity through real viewer preparation and synchronous commit rollback", async () => {
    for (const stage of ["prepare", "commit"] as const) {
      const context = await r3p11RecoveryContext("r3-p11-view-" + stage);
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), old = accepted.fixture!;
      const before = r3p11Owned(Array.from(context.cache.entries())), metadata = r3p11Owned(context.registry.listMetadata());
      const entered = p1Deferred<AssemblyHallFixture>(), release = p1Deferred<void>();
      let attached = old;
      const commit = vi.fn((fixture: AssemblyHallFixture) => {
        attached = fixture; if (stage === "commit") context.store.getState().selectDocument("another-document");
        return () => undefined;
      });
      const discard = vi.fn(() => { attached = old; });
      const unregister = context.controller.registerFixtureViewer(async fixture => {
        entered.resolve(fixture); if (stage === "prepare") await release.promise;
        return { commit: () => commit(fixture), discard };
      });
      const pending = context.controller.restoreSourceUnavailableCheckpoint(context.record);
      try {
        const candidate = await entered.promise;
        if (stage === "prepare") context.store.getState().selectDocument("another-document");
        release.resolve(); expect((await pending).stale).toBe(true);
        expect(commit).toHaveBeenCalledTimes(stage === "commit" ? 1 : 0); expect(discard).toHaveBeenCalledTimes(1);
        expect(attached).toBe(old); expect(candidate.familyRuntime.dispose).toHaveBeenCalledTimes(1);
        expect(old.familyRuntime.dispose).not.toHaveBeenCalled(); expect(context.registry.get(accepted.artifactId!)).toBe(old);
        expect(r3p11Owned(context.registry.listMetadata())).toBe(metadata); r3p11ReadOnly(context, before);
      } finally { release.resolve(); await pending.catch(() => undefined); unregister(); context.controller.dispose(); }
    }
  }, 40_000);

  it("retains the real accepted scene on profile, adapter and viewer failure and refuses fabricated source authority", async () => {
    for (const mode of ["profile", "adapter", "viewer", "source"] as const) {
      const context = await r3p11RecoveryContext("r3-p11-failure-" + mode);
      const accepted = await context.controller.restoreSourceUnavailableCheckpoint(context.record), old = accepted.fixture!;
      const metadata = r3p11Owned(context.registry.listMetadata()), materials = r3p11Owned(old.packedAtlas), failure = new Error("recovery " + mode + " failed");
      let unregister: (() => void) | undefined;
      if (mode === "profile") {
        const entry = structuredClone(context.cache.get(context.packet.requestHash)!);
        entry.artifact.artifacts.runtimeIr.sourceGraphHash = "0".repeat(64);
        entry.dependencies = context.persistenceModule.completedFamilyPersistenceCacheEntry(entry.artifact).dependencies;
        context.cache.set(context.packet.requestHash, entry);
      } else if (mode === "adapter") context.adapter.mockRejectedValueOnce(failure);
      else if (mode === "viewer") unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
      else {
        const actual = context.adapter.getMockImplementation()!;
        context.adapter.mockImplementationOnce(async packet => {
          const fixture = await actual(packet); fixture.sourceSnapshot = structuredClone(context.seed.file.source); return fixture;
        });
      }
      const before = r3p11Owned(Array.from(context.cache.entries()));
      try {
        const rejected = await r3p11Failure(context, context.controller.restoreSourceUnavailableCheckpoint(context.record),
          mode === "adapter" || mode === "viewer" ? failure : undefined);
        if (mode === "profile") expect(rejected.cause).toMatchObject({ code: "building.completedReplayProfileUnresolved" });
        expect(context.registry.get(accepted.artifactId!)).toBe(old); expect(old.familyRuntime.dispose).not.toHaveBeenCalled();
        expect(r3p11Owned(context.registry.listMetadata())).toBe(metadata); expect(r3p11Owned(old.packedAtlas)).toBe(materials);
        if (mode === "viewer" || mode === "source") expect(context.fixtures[1].familyRuntime.dispose).toHaveBeenCalledTimes(1);
        expect(context.store.getState().runs.activeFixtureArtifactId).toBe(accepted.artifactId); r3p11ReadOnly(context, before);
      } finally { unregister?.(); context.controller.dispose(); }
    }
  }, 40_000);
});

function r3p12Request(fixture: AssemblyHallFixture) {
  const source = r3p5Source(fixture);
  return { expectedSourceContentHash: source.sourceContentHash, expectedRevision: source.document.revision };
}

function r3p12List(fixture: AssemblyHallFixture): R3P5Width[] {
  const source = r3p5Source(fixture);
  return source.schemaVersion === "0.4.0" ? structuredClone(source.windowWidthOverrides) : [];
}

function r3p12History(controller: BuildingRunController, undoCount: number, redoCount: number): void {
  const state = controller.getWindowWidthHistoryState();
  expect(state).toEqual({ undoCount, redoCount, canUndo: undoCount > 0, canRedo: redoCount > 0 });
  expect(Object.isFrozen(state)).toBe(true);
  expect(controller.getWindowWidthHistoryState()).not.toBe(state);
  expect(Reflect.set(state, "undoCount", 999)).toBe(false);
  expect(Object.values(state).every(value => typeof value === "number" || typeof value === "boolean")).toBe(true);
}

function r3p12PinnedSource(fixture: AssemblyHallFixture): unknown {
  const source = structuredClone(r3p5Source(fixture));
  Reflect.deleteProperty(source, "schemaVersion"); Reflect.deleteProperty(source, "sourceContentHash");
  Reflect.deleteProperty(source, "windowWidthOverrides"); Reflect.deleteProperty(source.document, "revision");
  return r3p5Stable(source);
}

describe("R3.P12 accepted window width history", () => {
  it("undoes and redoes actual aperture geometry with monotonic source authority and no retained old GPU owners", async () => {
    const context = await r3p5WidthContext("r3-p12-sequence"), base = context.fixture;
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate"), interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const pinned = r3p12PinnedSource(base), baseIr = r3p5Stable(base.ir), baseGallery = r3p5Stable(base.componentGallery);
    const a = context.slots[0].directive, b = { ...a, widthM: (a.widthM + context.slots[0].baseWidth) / 2 };
    let current = base;
    const accepted: AssemblyHallFixture[] = [];
    function verify(next: AssemblyHallFixture, expected: R3P5Width[], undo: number, redo: number) {
      expect(r3p5Source(next).document.revision).toBe(r3p5Source(current).document.revision + 1);
      expect(next).not.toBe(current); expect(r3p12List(next)).toEqual(expected);
      expect(r3p12PinnedSource(next)).toEqual(pinned);
      expect(next.packedAtlas).toBe(base.packedAtlas); expect(next.debugExport).toBe(base.debugExport); expect(next.catalog).toBe(base.catalog);
      p4ExpectMaterialBytes(next, context.materials); expect(r3p5Materials(next)).toEqual(context.materialMetadata);
      expect(context.disposals.get(current)).toBe(1);
      current = next; accepted.push(next); r3p12History(context.controller, undo, redo);
    }
    try {
      r3p12History(context.controller, 0, 0);
      await expect(context.controller.undoWindowWidthOverride(r3p12Request(base))).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      verify((await context.controller.applyWindowWidthOverride(r3p5Request(current, a))).fixture!, [a], 1, 0);
      const aRequest = r3p12Request(current), aIr = r3p5Stable(current.ir), aGallery = r3p5Stable(current.componentGallery);
      verify((await context.controller.applyWindowWidthOverride(r3p5Request(current, b))).fixture!, [b], 2, 0);
      const bIr = r3p5Stable(current.ir), bGallery = r3p5Stable(current.componentGallery);
      verify((await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!, [a], 1, 1);
      expect(r3p5Stable(current.ir)).toEqual(aIr); expect(r3p5Stable(current.componentGallery)).toEqual(aGallery);
      expect(r3p5Source(current).sourceContentHash).toBe(aRequest.expectedSourceContentHash);
      await expect(context.controller.undoWindowWidthOverride(aRequest)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      r3p12History(context.controller, 1, 1);
      verify((await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!, [], 0, 2);
      expect(r3p5Source(current).schemaVersion).toBe("0.4.0");
      expect(r3p5Stable(current.ir)).toEqual(baseIr); expect(r3p5Stable(current.componentGallery)).toEqual(baseGallery);
      const file = JSON.parse((await context.controller.exportSourceFile()).contents);
      expect(file.schemaVersion).toBe("0.4.0"); expect(file.source.windowWidthOverrides).toEqual([]);
      verify((await context.controller.redoWindowWidthOverride(r3p12Request(current))).fixture!, [a], 1, 1);
      expect(r3p5Stable(current.ir)).toEqual(aIr); expect(r3p5Stable(current.componentGallery)).toEqual(aGallery);
      verify((await context.controller.redoWindowWidthOverride(r3p12Request(current))).fixture!, [b], 2, 0);
      expect(r3p5Stable(current.ir)).toEqual(bIr); expect(r3p5Stable(current.componentGallery)).toEqual(bGallery);
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
      expect(context.disposals.get(current) ?? 0).toBe(0);
    } finally {
      context.controller.dispose();
      for (const fixture of [base, ...accepted]) expect(context.disposals.get(fixture)).toBe(1);
      generate.mockRestore(); interpret.mockRestore();
    }
  }, 60_000);

  it("preserves redo for no-ops and invalid requests, then branches only for an accepted replacement or restoration", async () => {
    const context = await r3p5WidthContext("r3-p12-branch", { fidelityMode: "proof", detailLevel: "low" });
    const a = context.slots[0].directive, b = { ...a, widthM: (a.widthM + context.slots[0].baseWidth) / 2 }, c = context.slots[1].directive;
    let current = context.fixture;
    try {
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, a))).fixture!;
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, b))).fixture!;
      current = (await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
      const before = await context.controller.exportSourceFile(), runs = context.store.getState().runs, calls = context.createFixture.mock.calls.length;
      for (const directive of [a, { ...c, widthM: context.slots[1].baseWidth }]) {
        const noop = await context.controller.applyWindowWidthOverride(r3p5Request(current, directive));
        expect(noop.fixture).toBe(current); expect(noop.stale).toBe(false); r3p12History(context.controller, 1, 1);
      }
      let getters = 0;
      const accessor = r3p12Request(current);
      Object.defineProperty(accessor, "expectedRevision", { enumerable: true, get: () => { getters += 1; return 999; } });
      for (const invalid of [accessor, { ...r3p12Request(current), extra: true }, { ...r3p12Request(current), expectedRevision: -1 },
        { ...r3p12Request(current), expectedSourceContentHash: "0".repeat(64) }]) {
        await expect(context.controller.redoWindowWidthOverride(invalid)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
        r3p12History(context.controller, 1, 1);
      }
      expect(getters).toBe(0); expect(context.store.getState().runs).toBe(runs);
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect((await context.controller.exportSourceFile()).contents).toBe(before.contents);
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, c))).fixture!;
      r3p12History(context.controller, 2, 0); expect(r3p12List(current)).toEqual([c]);
      await expect(context.controller.redoWindowWidthOverride(r3p12Request(current))).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, { ...c, widthM: context.slots[1].baseWidth }))).fixture!;
      r3p12History(context.controller, 3, 0); expect(r3p12List(current)).toEqual([]);
      current = (await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
      r3p12History(context.controller, 2, 1); expect(r3p12List(current)).toEqual([c]);
      current = (await context.controller.redoWindowWidthOverride(r3p12Request(current))).fixture!;
      r3p12History(context.controller, 3, 0); expect(r3p12List(current)).toEqual([]);
      p4ExpectMaterialBytes(current, context.materials); expect(r3p5Materials(current)).toEqual(context.materialMetadata);
    } finally { context.controller.dispose(); }
  }, 60_000);

  it("leaves accepted history and aliases intact through held, cancelled and rejected replay candidates", async () => {
    const context = await r3p5WidthContext("r3-p12-failures"), a = context.slots[0].directive;
    let unregister: (() => void) | undefined;
    const release = p1Deferred<void>();
    try {
      let current = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, a))).fixture!;
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, { ...a, widthM: (a.widthM + context.slots[0].baseWidth) / 2 }))).fixture!;
      current = (await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata(), active = context.store.getState().runs.activeFixtureArtifactId;
      const original = context.createFixture.getMockImplementation()!, entered = p1Deferred<AssemblyHallFixture>();
      context.createFixture.mockImplementationOnce(async input => { const fixture = await original(input); entered.resolve(fixture); await release.promise; return fixture; });
      const pending = context.controller.redoWindowWidthOverride(r3p12Request(current)), candidate = await entered.promise;
      r3p12History(context.controller, 1, 1); expect(context.registry.get(active!)).toBe(current);
      context.controller.cancelActiveRun(); release.resolve(); expect((await pending).stale).toBe(true);
      expect(context.disposals.get(candidate)).toBe(1); r3p12History(context.controller, 1, 1);
      const failure = new Error("P12 replay viewer rejected");
      unregister = context.controller.registerFixtureViewer(async () => { throw failure; });
      await expect(context.controller.redoWindowWidthOverride(r3p12Request(current))).rejects.toBe(failure);
      expect(context.disposals.get(context.fixtures.at(-1)!)).toBe(1); unregister(); unregister = undefined;
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.registry.get(active!)).toBe(current);
      expect(context.disposals.get(current) ?? 0).toBe(0); r3p12History(context.controller, 1, 1);
      const retried = await context.controller.redoWindowWidthOverride(r3p12Request(current));
      expect(retried.stale).toBe(false); r3p12History(context.controller, 2, 0);
    } finally { release.resolve(); unregister?.(); context.controller.dispose(); }
  }, 60_000);

  it("owns replay requests before awaits and clears history on a direct document ABA without an intermediate getter", async () => {
    const context = await r3p5WidthContext("r3-p12-doc-aba"), module = await import("../ui/assemblyHallFixture");
    const original = module.buildAssemblyHallSourceWindowSplit, release = p1Deferred<void>(), entered = p1Deferred<void>();
    let restorePlan: (() => void) | undefined;
    try {
      let current = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive))).fixture!;
      const plan = vi.spyOn(module, "buildAssemblyHallSourceWindowSplit").mockImplementationOnce(async input => { const value = await original(input); entered.resolve(); await release.promise; return value; });
      restorePlan = () => plan.mockRestore();
      const request = r3p12Request(current), pending = context.controller.undoWindowWidthOverride(request);
      request.expectedRevision = 999; request.expectedSourceContentHash = "0".repeat(64);
      await entered.promise; r3p12History(context.controller, 1, 0); release.resolve();
      current = (await pending).fixture!; r3p12History(context.controller, 0, 1); expect(r3p12List(current)).toEqual([]);
      restorePlan(); restorePlan = undefined;
      current = (await context.controller.redoWindowWidthOverride(r3p12Request(current))).fixture!;
      const before = await context.controller.exportSourceFile(), calls = context.createFixture.mock.calls.length;
      context.store.getState().selectDocument("r3-p12-other-document");
      context.store.getState().selectDocument("r3-p12-doc-aba");
      r3p12History(context.controller, 0, 0);
      await expect(context.controller.undoWindowWidthOverride(r3p12Request(current))).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect((await context.controller.exportSourceFile()).contents).toBe(before.contents);
      current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, { ...context.slots[0].directive,
        widthM: (context.slots[0].directive.widthM + context.slots[0].baseWidth) / 2 }))).fixture!;
      r3p12History(context.controller, 1, 0);
      context.registry.clear(); r3p12History(context.controller, 0, 0);
      await expect(context.controller.undoWindowWidthOverride(r3p12Request(current))).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(context.disposals.get(current)).toBe(1);
    } finally { release.resolve(); restorePlan?.(); context.controller.dispose(); }
  }, 60_000);

  it("publishes the cursor before observers and queued commands, even when an accepted notification throws", async () => {
    const context = await r3p5WidthContext("r3-p12-publication"), observed = p1Deferred<{
      state: ReturnType<BuildingRunController["getWindowWidthHistoryState"]>; beforeReturn: boolean;
      redo: ReturnType<BuildingRunController["redoWindowWidthOverride"]>;
    }>();
    let unregister: (() => void) | undefined, unsubscribe: (() => void) | undefined;
    try {
      const current = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive))).fixture!;
      let queued = false, returned = false;
      unregister = context.controller.registerFixtureViewer(async fixture => ({
        commit() {
          if (!queued) { queued = true; queueMicrotask(() => observed.resolve({ state: context.controller.getWindowWidthHistoryState(),
            beforeReturn: !returned, redo: context.controller.redoWindowWidthOverride(r3p12Request(fixture)) })); }
          return () => undefined;
        }, discard() { /* No viewer-owned resources in this publication observer. */ }
      }));
      let notification = 0;
      unsubscribe = context.store.subscribe(state => {
        if (state.runs.status !== "complete" || !state.runs.activeFixtureArtifactId) return;
        if (notification !== 0) return;
        notification += 1; r3p12History(context.controller, 0, 1); throw new Error("P12 accepted observer failed");
      });
      const undo = context.controller.undoWindowWidthOverride(r3p12Request(current));
      void undo.then(() => { returned = true; }, () => { returned = true; });
      const atCommit = await observed.promise;
      expect(atCommit.beforeReturn).toBe(true); expect(atCommit.state).toEqual({ undoCount: 0, redoCount: 1, canUndo: false, canRedo: true });
      expect((await undo).stale).toBe(false); expect((await atCommit.redo).stale).toBe(false);
      expect(notification).toBe(1); r3p12History(context.controller, 1, 0);
      expect(r3p12List((await atCommit.redo).fixture!)).toEqual([context.slots[0].directive]);
    } finally { unsubscribe?.(); unregister?.(); context.controller.dispose(); }
  }, 60_000);

  it("resets only after accepted non-width publications, including same-content Open, structural runs, imports and recovery", async () => {
    const seed = await r3p5WidthContext("r3-p12-boundaries"), saved = await seed.controller.exportSourceFile();
    const persistence = await import("../state/completedFamilyPersistence"), fixtures = await import("../ui/assemblyHallFixture");
    const packet = await persistence.createCompletedFamilyPersistencePacket({ documentId: "r3-p12-boundaries", runId: "r3-p12-base-packet", requestHash: "r3-p12-base-packet-key", fixture: seed.fixture });
    seed.controller.dispose();
    const entry = persistence.completedFamilyPersistenceCacheEntry(packet);
    const context = await r3p9Harness("r3-p12-boundaries", { restoreCompletedFamilyFixture: fixtures.restoreAssemblyHallFixtureFromCompletedFamilyPacket,
      completedFamilyPersistence: { put: vi.fn(async () => undefined), list: async () => [entry],
        get: async <T,>() => structuredClone(entry) as import("../materials/artifactCache").CachedArtifactEntry<T> } });
    try {
      for (const boundary of ["same-open", "new-run", "floor", "import", "cache", "checkpoint"] as const) {
        const base = (await context.controller.openSourceFile({ readText: async () => saved.contents })).fixture!;
        const slots = await r3p5Slots(base), current = (await context.controller.applyWindowWidthOverride(r3p5Request(base, slots[0].directive))).fixture!;
        r3p12History(context.controller, 1, 0);
        const failure = new Error("P12 rejected source read");
        await expect(context.controller.openSourceFile({ readText: async () => { throw failure; } })).rejects.toBe(failure);
        r3p12History(context.controller, 1, 0);
        const unsupported = { ...structuredClone(r3p5Source(current).controlsView), detailLevel: "low" as const };
        await expect(context.controller.startDemoRun(unsupported)).rejects.toMatchObject({ code: "building.sourceEditUnsupported" });
        r3p12History(context.controller, 1, 0);
        let result: import("../state/buildingRunController").StartDemoRunResult | undefined;
        if (boundary === "same-open") {
          const exact = await context.controller.exportSourceFile();
          result = await context.controller.openSourceFile({ readText: async () => exact.contents });
          expect((await context.controller.exportSourceFile()).contents).toBe(exact.contents);
        } else if (boundary === "new-run" || boundary === "floor") {
          const controls = structuredClone(r3p5Source(current).controlsView);
          if (boundary === "floor") controls.floorCount += 1;
          result = await context.controller.startDemoRun(controls);
        } else if (boundary === "import") result = await context.controller.restoreCompletedFamilyPacket(packet);
        else if (boundary === "cache") result = await context.controller.restoreLatestCompletedFamily();
        else result = await context.controller.restoreSourceUnavailableCheckpoint(await r3p11Marker(packet));
        expect(result?.stale).toBe(false); expect(result?.fixture).toBeDefined(); r3p12History(context.controller, 0, 0);
        await expect(context.controller.undoWindowWidthOverride(r3p12Request(current))).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      }
    } finally { context.controller.dispose(); }
  }, 120_000);

  it("bounds history at 32 owned directive transitions and unsubscribes its document observer exactly once", async () => {
    const context = await r3p5WidthContext("r3-p12-cap", { fidelityMode: "proof", detailLevel: "low" });
    let current = context.fixture;
    try {
      for (let index = 0; index < 33; index += 1) {
        const directive = { ...context.slots[0].directive, widthM: 0.3 + index * 0.005 };
        current = (await context.controller.applyWindowWidthOverride(r3p5Request(current, directive))).fixture!;
        r3p12History(context.controller, Math.min(index + 1, 32), 0);
      }
      expect(context.fixtures.filter(fixture => (context.disposals.get(fixture) ?? 0) === 0)).toEqual([current]);
      const before = r3p5Source(current).document.revision;
      current = (await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
      expect(r3p5Source(current).document.revision).toBe(before + 1); r3p12History(context.controller, 31, 1);
      expect(r3p12List(current)[0].widthM).toBe(0.3 + 31 * 0.005); p4ExpectMaterialBytes(current, context.materials);
    } finally { context.controller.dispose(); }
    const store = createBuildingStore(), registry = new BuildingArtifactRegistry(), original = store.subscribe, release = vi.fn();
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation(listener => { const off = original(listener); return () => { release(); off(); }; });
    const controller = new BuildingRunController({ store, registry });
    try {
      expect(subscribe).toHaveBeenCalledTimes(1); controller.dispose(); controller.dispose(); expect(release).toHaveBeenCalledTimes(1);
      store.getState().selectDocument("r3-p12-after-dispose"); r3p12History(controller, 0, 0);
    } finally { controller.dispose(); subscribe.mockRestore(); }
  }, 120_000);

  it("keeps accepted undo and redo through FIFO checkpoint acknowledgement and failure without retaining history on reopen", async () => {
    const writes: R3P9Record[] = [], entered = p1Deferred<void>(), release = p1Deferred<void>(), failure = new Error("P12 undo checkpoint failed");
    const writers = r3p9Writers(async (record, index) => {
      writes.push(record);
      if (index === 1) { entered.resolve(); await release.promise; }
      if (index === 2) throw failure;
    });
    const context = await r3p9Harness("r3-p12-checkpoints", { retainSourceCheckpointWriter: writers.retain });
    try {
      const base = (await context.controller.startDemoRun(p3SourcePrompt())).fixture!; await context.controller.drainSourceCheckpoints();
      const bytes = p4CopyMaterialBytes(base), metadata = r3p9MaterialMetadata(base.packedAtlas, base.debugExport), slots = await r3p5Slots(base);
      const a = (await context.controller.applyWindowWidthOverride(r3p5Request(base, slots[0].directive))).fixture!;
      await entered.promise; r3p12History(context.controller, 1, 0);
      const undo = await context.controller.undoWindowWidthOverride(r3p12Request(a)), empty = undo.fixture!;
      r3p12History(context.controller, 0, 1); expect(writes).toHaveLength(2);
      expect(context.controller.getSourceCheckpointStatus("r3-p12-checkpoints")).toMatchObject({ runId: undo.runId, state: "pending" });
      release.resolve(); await context.controller.drainSourceCheckpoints();
      expect(writes).toHaveLength(3); r3p12History(context.controller, 0, 1);
      expect(context.controller.getSourceCheckpointStatus("r3-p12-checkpoints")).toMatchObject({ runId: undo.runId, state: "failed", error: { cause: failure } });
      expect(context.registry.get(undo.artifactId!)).toBe(empty); expect(r3p12List(empty)).toEqual([]);
      const redo = await context.controller.redoWindowWidthOverride(r3p12Request(empty)); await context.controller.drainSourceCheckpoints();
      r3p12History(context.controller, 1, 0); expect(writes).toHaveLength(4);
      const record = await r3p9VerifySourceRecord(writes[3], r3p5Source(redo.fixture!), bytes, metadata);
      expect(context.controller.getSourceCheckpointStatus("r3-p12-checkpoints")).toMatchObject({ runId: redo.runId, state: "saved", checkpointContentHash: record.contentHash });
      const revisions = writes.map(record => record.kind === "source" ? r4LegacyCheckpointFile(record).source.document.revision : -1);
      expect(revisions).toEqual([0, 1, 2, 3]);
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
      if (record.kind !== "source") throw new Error("Expected accepted redo source");
      const reopened = await context.controller.openSourceFile({ readText: async () => JSON.stringify(record.sourceFile) });
      expect(r3p5Stable(reopened.fixture!.ir)).toEqual(r3p5Stable(redo.fixture!.ir));
      expect(r3p5Stable(reopened.fixture!.componentGallery)).toEqual(r3p5Stable(redo.fixture!.componentGallery));
      r3p12History(context.controller, 0, 0); await context.controller.drainSourceCheckpoints();
    } finally { release.resolve(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 90_000);

  it("rejects a changed candidate source and a document ABA inside commit without consuming history before acceptance", async () => {
    const context = await r3p5WidthContext("r3-p12-commit-guards");
    let unregister: (() => void) | undefined;
    try {
      const current = (await context.controller.applyWindowWidthOverride(r3p5Request(context.fixture, context.slots[0].directive))).fixture!;
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata(), artifactId = context.store.getState().runs.activeFixtureArtifactId;
      for (const mode of ["source", "document-aba"] as const) {
        const discard = vi.fn(); let candidate: AssemblyHallFixture | undefined;
        unregister = context.controller.registerFixtureViewer(async fixture => {
          candidate = fixture;
          if (mode === "source") fixture.sourceSnapshot = structuredClone(r3p5Source(current));
          return { commit() {
            if (mode === "document-aba") {
              context.store.getState().selectDocument("r3-p12-commit-away");
              context.store.getState().selectDocument("r3-p12-commit-guards");
            }
            return () => undefined;
          }, discard };
        });
        await expect(context.controller.undoWindowWidthOverride(r3p12Request(current))).rejects.toMatchObject({
          code: mode === "source" ? "building.sourceFileInvalid" : "building.sourceEditConflict"
        });
        unregister(); unregister = undefined;
        expect(candidate).toBeDefined(); expect(context.disposals.get(candidate!)).toBe(1); expect(discard).toHaveBeenCalledTimes(1);
        expect(context.registry.get(artifactId!)).toBe(current); expect(context.registry.listMetadata()).toEqual(metadata);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        expect(context.disposals.get(current) ?? 0).toBe(0);
        r3p12History(context.controller, mode === "source" ? 1 : 0, 0);
      }
    } finally { unregister?.(); context.controller.dispose(); }
  }, 60_000);
});


type R3P15Seed = {
  file: import("../state/buildingSourceFile").BuildingSourceFile;
  slots: Awaited<ReturnType<typeof r3p5Slots>>;
  widths: R3P5Width[];
  materials: ReturnType<typeof p4CopyMaterialBytes>;
  metadata: ReturnType<typeof r3p5Materials>;
  checkpointMetadata: string;
  expected: { ir: unknown; gallery: unknown; inputs: unknown };
};
function r3p15List(fixture: AssemblyHallFixture): R3P5Width[] {
  const source = r3p5Source(fixture);
  if (source.schemaVersion !== "0.5.0") throw new Error("Expected accepted complete v5 authority");
  return source.windowWidthBatch.directives;
}
const r3p15Batch = (directives: R3P5Width[]) => ({ schemaVersion: "0.1.0" as const, directives });
const r3p15Inputs = (fixture: AssemblyHallFixture) => r3p5Stable({
  prompt: fixture.prompt, spec: fixture.spec, catalog: fixture.catalog, graph: fixture.graph,
  fidelityMode: fixture.fidelityMode, compilation: r3p5Source(fixture).compilation
});
async function r3p15Open(seed: R3P15Seed, suffix: string) {
  const put = vi.fn(async () => undefined), context = await p3SourceHarness(suffix, put);
  try {
    const result = await context.controller.openSourceFile({ readText: async () => JSON.stringify(seed.file) });
    if (!result.fixture) throw new Error("Expected real v5 public Open");
    put.mockClear();
    return { ...context, put, fixture: result.fixture, opened: result };
  } catch (error) { context.controller.dispose(); throw error; }
}

describe("R3.P15 complete batch source transactions", () => {
  let seeds: R3P15Seed[];
  let derive: typeof import("../state/buildingSourceFile").deriveBuildingSourceWindowWidthBatchEdit;
  beforeAll(async () => {
    derive = (await import("../state/buildingSourceFile")).deriveBuildingSourceWindowWidthBatchEdit;
    const { createAssemblyHallFixture } = await import("../ui/assemblyHallFixture");
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    seeds = [];
    try {
      for (const profile of [{ fidelityMode: "kit", detailLevel: "high" }, { fidelityMode: "proof", detailLevel: "low" }] as const) {
        const context = await r3p5WidthContext("r3-p15-seed-" + profile.fidelityMode, profile);
        let expected: AssemblyHallFixture | undefined;
        try {
          expect(interpret).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(12);
          interpret.mockClear(); generate.mockClear();
          const widths = context.slots.slice(0, 2).map(slot => structuredClone(slot.directive));
          expect(widths).toHaveLength(2);
          const source = await derive({ sourceSnapshot: r3p5Source(context.fixture), windowWidthBatch: r3p15Batch([...widths].reverse()) });
          expected = await createAssemblyHallFixture({ sourceSnapshot: source, promptControls: source.controlsView,
            reusableArtifacts: { packedAtlas: context.fixture.packedAtlas, debugExport: context.fixture.debugExport, catalog: context.fixture.catalog } });
          const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
            packedAtlas: expected.packedAtlas, debugExport: expected.debugExport });
          expect(file.schemaVersion).toBe("0.5.0"); expect(r3p5Source(expected).document.revision).toBe(8);
          expect(expected.spec.massing.floorHeightsM.slice(1)).toEqual(Array(4).fill(4.25));
          seeds.push({ file, slots: context.slots, widths, materials: p4CopyMaterialBytes(expected), metadata: r3p5Materials(expected),
            checkpointMetadata: r3p9MaterialMetadata(expected.packedAtlas, expected.debugExport),
            expected: { ir: r3p5Stable(expected.ir), gallery: r3p5Stable(expected.componentGallery), inputs: r3p15Inputs(expected) } });
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(context.put).not.toHaveBeenCalled();
        } finally { expected?.familyRuntime.dispose(); context.controller.dispose(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 90_000);

  it("publicly opens and literally saves both pinned two-member profiles with complete IR, gallery, inputs and five material channels", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      for (const [index, seed] of seeds.entries()) {
        const context = await r3p15Open(seed, "r3-p15-fresh-" + index);
        try {
          const fixture = context.fixture;
          expect(fixture.sourceSnapshot).toEqual(seed.file.source); expect(r3p15List(fixture)).toEqual(seed.widths);
          expect(r3p5Stable(fixture.ir)).toEqual(seed.expected.ir);
          expect(r3p5Stable(fixture.componentGallery)).toEqual(seed.expected.gallery);
          expect(r3p15Inputs(fixture)).toEqual(seed.expected.inputs);
          p4ExpectMaterialBytes(fixture, seed.materials); expect(r3p5Materials(fixture)).toEqual(seed.metadata);
          const saved = await context.controller.exportSourceFile();
          expect(saved.contents).toBe(JSON.stringify(seed.file, null, 2));
          const decoded = await p3SourceCodec.parseBuildingSourceFile(JSON.parse(saved.contents) as unknown);
          expect(decoded.file.materials).toEqual(seed.file.materials);
          expect(context.put).not.toHaveBeenCalled(); r3p12History(context.controller, 0, 0);
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { context.controller.dispose(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 60_000);

  it("upserts and removes selected members while preserving the complete set through one-revision no-ops and array undo/redo", async () => {
    const seed = seeds[0], context = await r3p15Open(seed, "r3-p15-full-history");
    try {
      const initial = context.fixture, original = structuredClone(seed.widths), second = {
        ...structuredClone(original[1]), widthM: (seed.slots[1].baseWidth + original[1].widthM) / 2
      };
      expect(seed.slots.length).toBeGreaterThan(2);
      const third = structuredClone(seed.slots[2].directive), revisions = [r3p5Source(initial).document.revision];
      const changed = (await context.controller.applyWindowWidthOverride(r3p5Request(initial, second))).fixture!;
      expect(r3p15List(changed)).toEqual([original[0], second]); r3p12History(context.controller, 1, 0);
      const added = (await context.controller.applyWindowWidthOverride(r3p5Request(changed, third))).fixture!;
      const complete = [original[0], second, third].sort((a, b) => a.address.bayIndex - b.address.bayIndex);
      expect(r3p15List(added)).toEqual(complete); r3p12History(context.controller, 2, 0);
      const removed = (await context.controller.applyWindowWidthOverride(r3p5Request(added, {
        ...second, widthM: seed.slots[1].baseWidth
      }))).fixture!;
      const remaining = complete.filter(value => value.address.bayIndex !== second.address.bayIndex);
      expect(r3p15List(removed)).toEqual(remaining); r3p12History(context.controller, 3, 0);
      const calls = context.createFixture.mock.calls.length, currentRun = context.store.getState().runs;
      const same = await context.controller.applyWindowWidthOverride(r3p5Request(removed, original[0]));
      const absentBase = await context.controller.applyWindowWidthOverride(r3p5Request(removed, { ...second, widthM: seed.slots[1].baseWidth }));
      expect(same.fixture).toBe(removed); expect(absentBase.fixture).toBe(removed);
      expect(same.runId).toBe(absentBase.runId); expect(context.createFixture).toHaveBeenCalledTimes(calls);
      expect(context.store.getState().runs).toBe(currentRun); r3p12History(context.controller, 3, 0);
      const undo = (await context.controller.undoWindowWidthOverride(r3p12Request(removed))).fixture!;
      expect(r3p15List(undo)).toEqual(complete);
      expect(r3p5Stable(undo.ir)).toEqual(r3p5Stable(added.ir));
      expect(r3p5Stable(undo.componentGallery)).toEqual(r3p5Stable(added.componentGallery));
      const undoAgain = (await context.controller.undoWindowWidthOverride(r3p12Request(undo))).fixture!;
      expect(r3p15List(undoAgain)).toEqual([original[0], second]);
      expect(r3p5Stable(undoAgain.ir)).toEqual(r3p5Stable(changed.ir));
      const redo = (await context.controller.redoWindowWidthOverride(r3p12Request(undoAgain))).fixture!;
      expect(r3p15List(redo)).toEqual(complete);
      const redoAgain = (await context.controller.redoWindowWidthOverride(r3p12Request(redo))).fixture!;
      expect(r3p15List(redoAgain)).toEqual(remaining);
      expect(r3p5Stable(redoAgain.ir)).toEqual(r3p5Stable(removed.ir));
      r3p12History(context.controller, 3, 0);
      for (const fixture of [changed, added, removed, undo, undoAgain, redo, redoAgain]) {
        revisions.push(r3p5Source(fixture).document.revision);
        expect(fixture.packedAtlas).toBe(initial.packedAtlas); expect(fixture.debugExport).toBe(initial.debugExport);
        expect(fixture.catalog).toBe(initial.catalog); p4ExpectMaterialBytes(fixture, seed.materials);
        expect(r3p5Materials(fixture)).toEqual(seed.metadata);
      }
      expect(revisions).toEqual(Array.from({ length: revisions.length }, (_, index) => revisions[0] + index));
      const saved = await context.controller.exportSourceFile();
      const reopened = (await context.controller.openSourceFile({ readText: async () => saved.contents })).fixture!;
      expect(r3p15List(reopened)).toEqual(remaining); r3p12History(context.controller, 0, 0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.put).not.toHaveBeenCalled();
    } finally { context.controller.dispose(); }
  }, 90_000);

  it("retains every member through supported globals and atomically rejects a structural edit that removes the later target", async () => {
    const seed = seeds[1], context = await r3p15Open(seed, "r3-p15-global");
    try {
      const split = await r3p5Split(context.fixture), last = split.openings.find(opening =>
        opening.kind === "window" && opening.facade === "front" && opening.floorIndex === context.fixture.spec.massing.floorCount - 1)!;
      expect(last).toBeDefined();
      const top: R3P5Width = { schemaVersion: "0.1.0", address: { schemaVersion: "0.1.0", facade: last.facade,
        floorIndex: last.floorIndex, bayIndex: last.bayIndex }, widthM: Math.max(0.23, Math.min(0.6, last.sizeM[0] / 2)) };
      const source = await derive({ sourceSnapshot: r3p5Source(context.fixture), windowWidthBatch: r3p15Batch([seed.widths[0], top]) });
      const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
        packedAtlas: context.fixture.packedAtlas, debugExport: context.fixture.debugExport });
      let current = (await context.controller.openSourceFile({ readText: async () => JSON.stringify(file) })).fixture!;
      const full = structuredClone(r3p15List(current));
      for (const patch of [{ windowFamily: "tall-rectangular" }, { floorCount: 6 }, { roofType: "gable" as const }]) {
        const before = current;
        current = (await context.controller.startDemoRun({ ...structuredClone(r3p5Source(current).controlsView), ...patch })).fixture!;
        expect(r3p15List(current)).toEqual(full);
        expect(r3p5Source(current).document.revision).toBe(r3p5Source(before).document.revision + 1);
        p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata);
        r3p12History(context.controller, 0, 0);
      }
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata();
      await expect(context.controller.startDemoRun({ ...structuredClone(r3p5Source(current).controlsView), floorCount: top.address.floorIndex }))
        .rejects.toMatchObject({ code: "building.windowSlot.missingOpening" });
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(current) ?? 0).toBe(0);
      expect(r3p15List(current)).toEqual(full); expect(context.put).not.toHaveBeenCalled();
    } finally { context.controller.dispose(); }
  }, 60_000);

  it("owns a second-member request and preserves the old full set through cancellation, viewer rejection and stale authority", async () => {
    const seed = seeds[0], context = await r3p15Open(seed, "r3-p15-cancel");
    const entered = p1Deferred<import("../state/buildingSourceFile").BuildingSourceSnapshot>(), release = p1Deferred<void>();
    const actual = p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit;
    const held = vi.spyOn(p3SourceCodec, "deriveBuildingSourceWindowWidthBatchEdit").mockImplementationOnce(async input => {
      const value = await actual(input); entered.resolve(value); await release.promise; return value;
    });
    let unregister: (() => void) | undefined;
    let pending: ReturnType<BuildingRunController["applyWindowWidthOverride"]> | undefined;
    try {
      const fixture = context.fixture, second = { ...structuredClone(seed.widths[1]), widthM: (seed.slots[1].baseWidth + seed.widths[1].widthM) / 2 };
      const request = r3p5Request(fixture, structuredClone(second)), saved = await context.controller.exportSourceFile();
      const calls = context.createFixture.mock.calls.length, metadata = context.registry.listMetadata();
      pending = context.controller.applyWindowWidthOverride(request);
      request.expectedSourceContentHash = "0".repeat(64); request.expectedRevision = 999;
      request.directive.widthM = 999; request.directive.address.floorIndex = 999;
      const captured = await Promise.race([entered.promise, pending.then(() => { throw new Error("Width completed before held batch derivation"); })]);
      if (captured.schemaVersion !== "0.5.0") throw new Error("Expected owned v5 candidate");
      expect(captured.windowWidthBatch.directives).toEqual([seed.widths[0], second]);
      context.controller.cancelActiveRun(); release.resolve();
      expect((await pending).stale).toBe(true); expect(context.createFixture).toHaveBeenCalledTimes(calls);
      held.mockRestore(); r3p12History(context.controller, 0, 0);
      const failure = new Error("P15 viewer rejected complete batch"), rejected: AssemblyHallFixture[] = [];
      unregister = context.controller.registerFixtureViewer(async candidate => { rejected.push(candidate); throw failure; });
      await expect(context.controller.applyWindowWidthOverride(r3p5Request(fixture, second))).rejects.toBe(failure);
      unregister(); unregister = undefined;
      expect(rejected).toHaveLength(1); expect(context.disposals.get(rejected[0])).toBe(1);
      expect(context.disposals.get(fixture) ?? 0).toBe(0); r3p12History(context.controller, 0, 0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(r3p15List(fixture)).toEqual(seed.widths);
      const changed = (await context.controller.applyWindowWidthOverride(r3p5Request(fixture, second))).fixture!;
      expect(r3p15List(changed)).toEqual([seed.widths[0], second]); r3p12History(context.controller, 1, 0);
      const after = await context.controller.exportSourceFile(), afterCalls = context.createFixture.mock.calls.length;
      await expect(context.controller.applyWindowWidthOverride(r3p5Request(fixture, seed.widths[0])))
        .rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(context.createFixture).toHaveBeenCalledTimes(afterCalls);
      expect((await context.controller.exportSourceFile()).contents).toBe(after.contents); expect(context.put).not.toHaveBeenCalled();
    } finally { release.resolve(); held.mockRestore(); unregister?.(); context.controller.dispose(); await pending?.catch(() => undefined); }
  }, 60_000);

  it("uses actual checkpoint put/get for the full v5 file and retains its accepted scene, history and record after member-two failures", async () => {
    const checkpoint = await import("../state/buildingSourceCheckpoint");
    type Entry<T = unknown> = import("../materials/artifactCache").CachedArtifactEntry<T>;
    let retained: Entry | undefined;
    const gets = vi.fn(), puts = vi.fn();
    const persistence = checkpoint.createBuildingSourceCheckpointPersistence({ persistence: {
      async get<T>(artifactType: string, requestHash: string, schemaVersion?: "0.1.0"): Promise<Entry<T> | undefined> {
        gets(artifactType, requestHash, schemaVersion); return structuredClone(retained) as Entry<T> | undefined;
      },
      async put<T>(entry: Entry<T>): Promise<void> { puts(entry); retained = structuredClone(entry); }
    } });
    const writers = r3p9Writers(async record => { await persistence.put(record); }), legacyPut = vi.fn(async () => undefined);
    const context = await r3p9Harness("r3-p15-checkpoint-before", {
      retainSourceCheckpointWriter: writers.retain, completedFamilyPersistence: { put: legacyPut }
    });
    let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
    const seed = seeds[0], documentId = seed.file.source.document.documentId;
    try {
      const first = await context.controller.openSourceFile({ readText: async () => JSON.stringify(seed.file) });
      const fixture = first.fixture!; await context.controller.drainSourceCheckpoints();
      expect(puts).toHaveBeenCalledTimes(1);
      const stored = await persistence.get(documentId);
      if (stored?.kind !== "source") throw new Error("Expected actual saved v5 checkpoint");
      expect(stored.sourceFile).toEqual(seed.file);
      await r3p9VerifySourceRecord(stored, r3p5Source(fixture), seed.materials, seed.checkpointMetadata);
      const second = { ...structuredClone(seed.widths[1]), widthM: (seed.slots[1].baseWidth + seed.widths[1].widthM) / 2 };
      const accepted = await context.controller.applyWindowWidthOverride(r3p5Request(fixture, second)), current = accepted.fixture!;
      await context.controller.drainSourceCheckpoints(); expect(puts).toHaveBeenCalledTimes(2);
      const record = await persistence.get(documentId);
      if (record?.kind !== "source") throw new Error("Expected complete edited source record");
      expect(r4LegacyCheckpointFile(record).source).toEqual(r3p5Source(current));
      expect(record.sourceFile.schemaVersion).toBe("0.5.0");
      expect(context.controller.getSourceCheckpointStatus(documentId)).toMatchObject({ state: "saved", runId: accepted.runId,
        sourceContentHash: r3p5Source(current).sourceContentHash, revision: r3p5Source(current).document.revision,
        checkpointContentHash: record.contentHash });
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata(), status = context.controller.getSourceCheckpointStatus(documentId);
      const malformed = JSON.parse(saved.contents) as import("../state/buildingSourceFile").BuildingSourceFile;
      if (malformed.source.schemaVersion !== "0.5.0") throw new Error("Expected v5 file");
      malformed.source.windowWidthBatch.directives[1].widthM += 0.01;
      const { contentHash: oldHash, ...payload } = malformed; void oldHash;
      malformed.contentHash = await hashCanonicalJson(payload);
      await expect(context.controller.openSourceFile({ readText: async () => JSON.stringify(malformed) }))
        .rejects.toMatchObject({ code: "building.sourceFileInvalid" });
      const bad = await derive({ sourceSnapshot: r3p5Source(current), windowWidthBatch: r3p15Batch([
        r3p15List(current)[0], { ...structuredClone(r3p15List(current)[1]), address: {
          ...r3p15List(current)[1].address, floorIndex: 999 } }
      ]) });
      const badFile = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: bad,
        packedAtlas: current.packedAtlas, debugExport: current.debugExport });
      // This file passes the codec; the actual reconstructed second slot is invalid.
      expect((await p3SourceCodec.parseBuildingSourceFile(badFile)).sourceSnapshot).toEqual(bad);
      await expect(context.controller.openSourceFile({ readText: async () => JSON.stringify(badFile) }))
        .rejects.toMatchObject({ code: "building.windowSlot.missingOpening" });
      await context.controller.drainSourceCheckpoints();
      expect(puts).toHaveBeenCalledTimes(2); expect(await persistence.get(documentId)).toEqual(record);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(current) ?? 0).toBe(0);
      expect(context.controller.getSourceCheckpointStatus(documentId)).toEqual(status); r3p12History(context.controller, 1, 0);
      receiver = await p3SourceHarness("r3-p15-recovery-before");
      const reopened = (await receiver.controller.openSourceFile({ readText: async () => JSON.stringify(record.sourceFile) })).fixture!;
      r3p12History(receiver.controller, 0, 0);
      expect(r3p5Stable(reopened.ir)).toEqual(r3p5Stable(current.ir));
      expect(r3p5Stable(reopened.componentGallery)).toEqual(r3p5Stable(current.componentGallery));
      expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
      p4ExpectMaterialBytes(reopened, seed.materials); expect(r3p5Materials(reopened)).toEqual(seed.metadata);
      expect(gets).toHaveBeenCalledWith("building-source-checkpoint", documentId, "0.1.0");
      expect(legacyPut).not.toHaveBeenCalled();
      for (const job of writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
    } finally { receiver?.controller.dispose(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 90_000);
});


type R3P16Floor = import("../contracts/buildingDocument").BuildingWindowFloorWidthOverride;
type R3P16Split = Awaited<ReturnType<typeof r3p5Split>>;
type R3P16Seed = {
  baseFile: R3P9File; v4File: R3P9File; batchFile: R3P9File; uniformFile: R3P9File; explicitFile: R3P9File;
  split: R3P16Split; members: R3P16Split["openings"]; outside: R3P5Width[]; first: R3P5Width;
  materials: ReturnType<typeof p4CopyMaterialBytes>; metadata: ReturnType<typeof r3p5Materials>; checkpointMetadata: string;
};
const r3p16Key = (address: R3P5Width["address"]) => [address.facade, address.floorIndex, address.bayIndex].join(":");
const r3p16Address = (opening: R3P16Split["openings"][number]): R3P5Width["address"] => ({
  schemaVersion: "0.1.0", facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex
});
const r3p16Directive = (opening: R3P16Split["openings"][number], widthM: number): R3P5Width =>
  ({ schemaVersion: "0.1.0", address: r3p16Address(opening), widthM });
const r3p16Floor = (widthM: number, floorIndex = 1, facade: R3P16Floor["facade"] = "front"): R3P16Floor =>
  ({ schemaVersion: "0.1.0", facade, floorIndex, widthM });
const r3p16Request = (fixture: AssemblyHallFixture, directive: R3P16Floor) => ({ ...r3p12Request(fixture), directive });
const r3p16Sort = (directives: R3P5Width[]) => [...directives].sort((a, b) => {
  const order = { front: 0, rear: 1, left: 2, right: 3 };
  return order[a.address.facade] - order[b.address.facade] || a.address.floorIndex - b.address.floorIndex || a.address.bayIndex - b.address.bayIndex;
});
async function r3p16Open(seed: R3P16Seed, label: string, file = seed.batchFile) {
  const records: R3P9Record[] = [], writers = r3p9Writers(async record => { records.push(record); });
  const legacyPut = vi.fn(async () => undefined), context = await r3p9Harness(label, {
    retainSourceCheckpointWriter: writers.retain, completedFamilyPersistence: { put: legacyPut }
  });
  try {
    const opened = await context.controller.openSourceFile({ readText: async () => JSON.stringify(file) });
    if (!opened.fixture) throw new Error("Expected actual accepted floor source");
    await context.controller.drainSourceCheckpoints(); legacyPut.mockClear();
    expect(records).toHaveLength(1);
    return { ...context, fixture: opened.fixture, opened, records, writers, legacyPut };
  } catch (error) { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); throw error; }
}
async function r3p16Expected(fixture: AssemblyHallFixture, directives: R3P5Width[]) {
  const [{ compileBuilding }, { buildComponentGallery }] = await Promise.all([
    import("../compiler/buildingCompiler"), import("../compiler/componentGalleryBuilder")
  ]);
  const ir = await compileBuilding({ spec: fixture.spec, catalog: fixture.catalog, graph: fixture.graph,
    buildingId: fixture.ir.buildingId, ...r3p5Source(fixture).compilation,
    windowWidthBatch: { schemaVersion: "0.1.0", directives: r3p16Sort(directives) } });
  return { ir, gallery: await buildComponentGallery({ catalog: fixture.catalog, ir }) };
}
function r3p16DoorGeometry(fixture: AssemblyHallFixture, door: R3P16Split["openings"][number]) {
  const prefix = "/facade/" + door.facade + "/floor/" + door.floorIndex + "/bay/" + door.bayIndex + "/opening/";
  const entries = fixture.ir.semanticIndex.filter(entry => entry.semanticPath.includes(prefix));
  expect(entries.length).toBeGreaterThan(0);
  return entries.map(entry => {
    const batch = fixture.ir.instanceBatches.find(value => value.batchId === entry.batchId);
    if (batch && entry.elementIndex !== undefined) {
      const transforms = batch.transforms;
      if (!transforms) throw new Error("Expected actual door instance transforms");
      return { entry, matrix: Array.from(transforms.subarray(entry.elementIndex * 16, entry.elementIndex * 16 + 16)) };
    }
    const mesh = fixture.ir.meshBatches.find(value => value.batchId === entry.batchId);
    if (!mesh) throw new Error("Expected actual door geometry");
    return { entry, mesh: r3p5Stable(mesh) };
  });
}

describe("R3.P16 atomic selected-floor width transactions", () => {
  let seeds: R3P16Seed[];
  beforeAll(async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    seeds = [];
    try {
      for (const profile of [{ fidelityMode: "kit", detailLevel: "high" }, { fidelityMode: "proof", detailLevel: "low" }] as const) {
        const context = await r3p5WidthContext("r3-p16-seed-" + profile.fidelityMode, profile);
        try {
          expect(interpret).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(12);
          interpret.mockClear(); generate.mockClear();
          const fixture = context.fixture, source = r3p5Source(fixture), split = await r3p5Split(fixture);
          const members = split.openings.filter(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 1)
            .sort((a, b) => a.bayIndex - b.bayIndex);
          expect(members.length).toBeGreaterThanOrEqual(2); expect(members.every(opening => opening.sizeM[0] > 0.6)).toBe(true);
          const outsideFloor = split.openings.find(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 2);
          if (!outsideFloor) throw new Error("Expected an actual outside-floor window");
          const outside = [r3p16Directive(outsideFloor, 0.5)];
          if (profile.fidelityMode === "kit") {
            const outsideFacade = split.openings.find(opening => opening.kind === "window" && opening.facade !== "front" && opening.floorIndex === 1);
            if (!outsideFacade) throw new Error("Expected an actual outside-facade window");
            outside.push(r3p16Directive(outsideFacade, 0.5));
          }
          const first = r3p16Directive(members[0], 0.6), makeFile = async (snapshot: import("../state/buildingSourceFile").BuildingSourceSnapshot) =>
            p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: snapshot, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
          const derive = p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit;
          const baseFile = await makeFile(source), v4File = await makeFile(await p3SourceCodec.deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: source, windowWidthOverrides: [first] }));
          const batchFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([first, ...outside]) }));
          const uniformFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([...members.map(opening => r3p16Directive(opening, 0.6)), ...outside]) }));
          const explicitFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([...members.map(opening => r3p16Directive(opening, opening.sizeM[0])), ...outside]) }));
          seeds.push({ baseFile, v4File, batchFile, uniformFile, explicitFile, split, members, outside, first,
            materials: p4CopyMaterialBytes(fixture), metadata: r3p5Materials(fixture), checkpointMetadata: r3p9MaterialMetadata(fixture.packedAtlas, fixture.debugExport) });
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { context.controller.dispose(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 90_000);

  it("publishes one complete floor command for kit/high and proof/low with outside overrides, independent IR/gallery and one exact checkpoint", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      for (const [index, seed] of seeds.entries()) {
        const context = await r3p16Open(seed, "r3-p16-positive-" + index);
        let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
        try {
          const initial = context.fixture, desired = r3p16Sort([...seed.outside, ...seed.members.map(opening => r3p16Directive(opening, 0.4))]);
          const expected = await r3p16Expected(initial, desired), calls = context.createFixture.mock.calls.length;
          const result = await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4))), current = result.fixture!;
          expect(result.stale).toBe(false); expect(current).not.toBe(initial); expect(context.createFixture).toHaveBeenCalledTimes(calls + 1);
          expect(r3p15List(current)).toEqual(desired); expect(seed.members.length).toBeGreaterThanOrEqual(2);
          expect(r3p5Stable(current.ir)).toEqual(r3p5Stable(expected.ir));
          expect(r3p5Stable(current.componentGallery)).toEqual(r3p5Stable(expected.gallery));
          expect(r3p5Stable(current.ir)).not.toEqual(r3p5Stable(initial.ir)); expect(r3p15Inputs(current)).toEqual(r3p15Inputs(initial));
          expect(r3p5Source(current).document.revision).toBe(r3p5Source(initial).document.revision + 1); r3p12History(context.controller, 1, 0);
          expect(current.catalog).toBe(initial.catalog); expect(current.packedAtlas).toBe(initial.packedAtlas); expect(current.debugExport).toBe(initial.debugExport);
          p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata);
          await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2);
          const record = context.records[1]; await r3p9VerifySourceRecord(record, r3p5Source(current), seed.materials, seed.checkpointMetadata);
          expect(context.controller.getSourceCheckpointStatus(r3p5Source(current).document.documentId)).toMatchObject({ state: "saved", runId: result.runId,
            revision: r3p5Source(current).document.revision, sourceContentHash: r3p5Source(current).sourceContentHash, checkpointContentHash: record.contentHash });
          const saved = await context.controller.exportSourceFile();
          if (record.kind !== "source") throw new Error("Expected actual floor source checkpoint");
          expect(record.sourceFile).toEqual(JSON.parse(saved.contents));
          receiver = await p3SourceHarness("r3-p16-fresh-" + index);
          const reopened = (await receiver.controller.openSourceFile({ readText: async () => saved.contents })).fixture!;
          expect(r3p5Stable(reopened.ir)).toEqual(r3p5Stable(current.ir)); expect(r3p5Stable(reopened.componentGallery)).toEqual(r3p5Stable(current.componentGallery));
          expect(r3p15Inputs(reopened)).toEqual(r3p15Inputs(current)); p4ExpectMaterialBytes(reopened, seed.materials);
          expect(r3p5Materials(reopened)).toEqual(seed.metadata); expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
          r3p12History(receiver.controller, 0, 0); expect(context.legacyPut).not.toHaveBeenCalled();
          for (const job of context.writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { receiver?.controller.dispose(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 90_000);

  it("keeps true legacy and redo no-ops intact and undoes a v4 floor upgrade as a complete v5 list at a new revision", async () => {
    const seed = seeds[1], context = await r3p16Open(seed, "r3-p16-noop", seed.baseFile);
    try {
      const initial = context.fixture, baseWidth = seed.members[0].sizeM[0];
      expect(seed.members.every(opening => opening.sizeM[0] === baseWidth)).toBe(true);
      const before = await context.controller.exportSourceFile(), status = context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId);
      const runs = context.store.getState().runs, calls = context.createFixture.mock.calls.length;
      const noop = await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(baseWidth)));
      expect(noop.fixture).toBe(initial); expect(noop.runId).toBe(context.opened.runId); expect(r3p5Source(initial).schemaVersion).toBe("0.3.0");
      expect(context.store.getState().runs).toBe(runs); expect(context.createFixture).toHaveBeenCalledTimes(calls);
      expect((await context.controller.exportSourceFile()).contents).toBe(before.contents); expect(context.records).toHaveLength(1);
      expect(context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId)).toEqual(status); r3p12History(context.controller, 0, 0);
      const changed = (await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4)))).fixture!;
      const undoResult = await context.controller.undoWindowWidthOverride(r3p12Request(changed)), undo = undoResult.fixture!;
      expect(r3p15List(undo)).toEqual([]); expect(r3p5Stable(undo.ir)).toEqual(r3p5Stable(initial.ir)); r3p12History(context.controller, 0, 1);
      await context.controller.drainSourceCheckpoints(); const count = context.records.length, acknowledgement = context.controller.getSourceCheckpointStatus(r3p5Source(undo).document.documentId);
      const unchanged = await context.controller.applyWindowFloorWidthOverride(r3p16Request(undo, r3p16Floor(baseWidth)));
      expect(unchanged.fixture).toBe(undo); expect(unchanged.runId).toBe(undoResult.runId);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(count);
      expect(context.controller.getSourceCheckpointStatus(r3p5Source(undo).document.documentId)).toEqual(acknowledgement); r3p12History(context.controller, 0, 1);
      const redo = (await context.controller.redoWindowWidthOverride(r3p12Request(undo))).fixture!;
      expect(r3p5Stable(redo.ir)).toEqual(r3p5Stable(changed.ir)); r3p12History(context.controller, 1, 0);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
    const legacy = await r3p16Open(seed, "r3-p16-v4", seed.v4File);
    try {
      const initial = legacy.fixture, previous = seed.v4File.source;
      expect(previous.schemaVersion).toBe("0.4.0");
      const changed = (await legacy.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4)))).fixture!;
      expect(r3p15List(changed)).toEqual(seed.members.map(opening => r3p16Directive(opening, 0.4)));
      const undo = (await legacy.controller.undoWindowWidthOverride(r3p12Request(changed))).fixture!;
      expect(r3p15List(undo)).toEqual([seed.first]); expect(r3p5Stable(undo.ir)).toEqual(r3p5Stable(initial.ir));
      expect(r3p5Stable(undo.componentGallery)).toEqual(r3p5Stable(initial.componentGallery));
      expect(r3p5Source(undo).document.revision).toBe(previous.document.revision + 2);
      expect(r3p5Source(undo).sourceContentHash).not.toBe(previous.sourceContentHash);
      p4ExpectMaterialBytes(undo, seed.materials); expect(r3p5Materials(undo)).toEqual(seed.metadata); r3p12History(legacy.controller, 0, 1);
    } finally { legacy.controller.dispose(); await legacy.controller.drainSourceCheckpoints(); }
  }, 90_000);

  it("changes siblings when the selected width is already equal and removes only the selected floor's explicit base members", async () => {
    const seed = seeds[1], context = await r3p16Open(seed, "r3-p16-siblings");
    try {
      const initial = context.fixture, changed = (await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(seed.first.widthM)))).fixture!;
      expect(r3p15List(changed)).toEqual(r3p16Sort([...seed.outside, ...seed.members.map(opening => r3p16Directive(opening, seed.first.widthM))]));
      expect(r3p5Source(changed).document.revision).toBe(r3p5Source(initial).document.revision + 1);
      expect(r3p5Stable(changed.ir)).not.toEqual(r3p5Stable(initial.ir)); r3p12History(context.controller, 1, 0);
      const explicit = (await context.controller.openSourceFile({ readText: async () => JSON.stringify(seed.explicitFile) })).fixture!;
      const before = r3p5Stable(explicit.ir), removed = (await context.controller.applyWindowFloorWidthOverride(r3p16Request(explicit, r3p16Floor(seed.members[0].sizeM[0])))).fixture!;
      expect(r3p15List(removed)).toEqual(r3p16Sort(seed.outside)); expect(r3p5Stable(removed.ir)).toEqual(before);
      expect(r3p5Source(removed).sourceContentHash).not.toBe(r3p5Source(explicit).sourceContentHash);
      expect(r3p5Source(removed).document.revision).toBe(r3p5Source(explicit).document.revision + 1); r3p12History(context.controller, 1, 0);
      const undo = (await context.controller.undoWindowWidthOverride(r3p12Request(removed))).fixture!;
      expect(r3p15List(undo)).toEqual(r3p15List(explicit)); expect(r3p5Stable(undo.ir)).toEqual(before);
      p4ExpectMaterialBytes(undo, seed.materials); expect(r3p5Materials(undo)).toEqual(seed.metadata);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 60_000);

  it("changes real ground-floor windows while excluding the valid door and retaining every outside override", async () => {
    const seed = seeds[0], context = await r3p16Open(seed, "r3-p16-ground");
    try {
      const initial = context.fixture, windows = seed.split.openings.filter(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 0);
      const door = seed.split.openings.find(opening => opening.kind === "door" && opening.facade === "front" && opening.floorIndex === 0);
      if (!door) throw new Error("Expected a real ground-front door");
      expect(windows.length).toBeGreaterThanOrEqual(2); const beforeDoor = r3p16DoorGeometry(initial, door);
      const desired = r3p16Sort([...r3p15List(initial), ...windows.map(opening => r3p16Directive(opening, 0.4))]);
      const expected = await r3p16Expected(initial, desired);
      const current = (await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4, 0)))).fixture!;
      expect(r3p15List(current)).toEqual(desired);
      expect(r3p15List(current).some(directive => r3p16Key(directive.address) === r3p16Key(r3p16Address(door)))).toBe(false);
      expect(r3p16DoorGeometry(current, door)).toEqual(beforeDoor);
      expect(r3p5Stable(current.ir)).toEqual(r3p5Stable(expected.ir)); expect(r3p5Stable(current.componentGallery)).toEqual(r3p5Stable(expected.gallery));
      expect(r3p5Source(current).document.revision).toBe(r3p5Source(initial).document.revision + 1); r3p12History(context.controller, 1, 0);
      p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2); expect(context.legacyPut).not.toHaveBeenCalled();
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 60_000);

  it("rejects unsafe envelopes before getters and owns a valid floor request through its first real kernel await and source ABA", async () => {
    const context = await r3p16Open(seeds[0], "r3-p16-owned"), initial = context.fixture;
    const splitModule = await import("../compiler/facadeSplitPlan"), actual = splitModule.applyWindowFloorWidthOverride;
    const entered = p1Deferred<Awaited<ReturnType<typeof actual>>>(), gate = p1Deferred<void>();
    let restoreHeld: (() => void) | undefined, pending: ReturnType<BuildingRunController["applyWindowFloorWidthOverride"]> | undefined;
    try {
      const saved = await context.controller.exportSourceFile(), calls = context.createFixture.mock.calls.length, metadata = context.registry.listMetadata();
      let reads = 0;
      const getter = Object.defineProperty({ schemaVersion: "0.1.0", facade: "front", floorIndex: 1 }, "widthM", { enumerable: true, get() { reads++; return 0.4; } });
      const symbol = r3p16Floor(0.4); Object.defineProperty(symbol, Symbol("extra"), { value: true });
      for (const directive of [undefined, null, {}, getter, symbol, { ...r3p16Floor(0.4), extra: undefined },
        { ...r3p16Floor(0.4), floorIndex: -1 }, { ...r3p16Floor(0.4), widthM: Number.NaN }]) {
        await expect(context.controller.applyWindowFloorWidthOverride({ ...r3p12Request(initial), directive: directive as R3P16Floor }))
          .rejects.toMatchObject({ code: "building.windowWidth.invalidDirective" });
      }
      const envelope = Object.defineProperty({ directive: r3p16Floor(0.4), expectedRevision: r3p5Source(initial).document.revision }, "expectedSourceContentHash", {
        enumerable: true, get() { reads++; return r3p5Source(initial).sourceContentHash; }
      });
      await expect(context.controller.applyWindowFloorWidthOverride(envelope as Parameters<BuildingRunController["applyWindowFloorWidthOverride"]>[0]))
        .rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(reads).toBe(0); expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.registry.listMetadata()).toEqual(metadata);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents); expect(context.records).toHaveLength(1);
      const held = vi.spyOn(splitModule, "applyWindowFloorWidthOverride").mockImplementationOnce(async (plan, request) => {
        const value = await actual(plan, request); entered.resolve(value); await gate.promise; return value;
      });
      restoreHeld = () => held.mockRestore();
      const request = r3p16Request(initial, r3p16Floor(0.4)), original = structuredClone(request);
      pending = context.controller.applyWindowFloorWidthOverride(request);
      request.expectedRevision = 999; request.expectedSourceContentHash = "0".repeat(64);
      request.directive.floorIndex = 999; request.directive.facade = "rear"; request.directive.widthM = 999;
      const captured = await Promise.race([entered.promise, pending.then(() => { throw new Error("Floor completed before the real kernel gate"); })]);
      expect(captured.directives).toEqual(seeds[0].members.map(opening => r3p16Directive(opening, 0.4)));
      gate.resolve(); const changed = (await pending).fixture!; restoreHeld(); restoreHeld = undefined;
      expect(r3p15List(changed)).toEqual(r3p16Sort([...seeds[0].outside, ...captured.directives]));
      const undo = (await context.controller.undoWindowWidthOverride(r3p12Request(changed))).fixture!;
      expect(r3p5Source(undo).sourceContentHash).toBe(original.expectedSourceContentHash);
      expect(r3p5Source(undo).document.revision).toBe(original.expectedRevision + 2);
      const afterCalls = context.createFixture.mock.calls.length, afterSave = await context.controller.exportSourceFile();
      await expect(context.controller.applyWindowFloorWidthOverride(original)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(context.createFixture).toHaveBeenCalledTimes(afterCalls); expect((await context.controller.exportSourceFile()).contents).toBe(afterSave.contents);
      r3p12History(context.controller, 0, 1);
    } finally { gate.resolve(); restoreHeld?.(); context.controller.dispose(); await pending?.catch(() => undefined); await context.controller.drainSourceCheckpoints(); }
  }, 60_000);

  it("stales held floor preflights on Cancel and later valid selected or floor no-ops without allocating or publishing", async () => {
    const splitModule = await import("../compiler/facadeSplitPlan"), actual = splitModule.applyWindowFloorWidthOverride;
    for (const kind of ["cancel", "selected-noop", "floor-noop"] as const) {
      const context = await r3p16Open(seeds[0], "r3-p16-ticket-" + kind, seeds[0].uniformFile), initial = context.fixture;
      const entered = p1Deferred<void>(), gate = p1Deferred<void>();
      const held = vi.spyOn(splitModule, "applyWindowFloorWidthOverride").mockImplementationOnce(async (plan, request) => {
        const result = await actual(plan, request); entered.resolve(); await gate.promise; return result;
      });
      let pending: ReturnType<BuildingRunController["applyWindowFloorWidthOverride"]> | undefined;
      try {
        const saved = await context.controller.exportSourceFile(), calls = context.createFixture.mock.calls.length;
        const metadata = context.registry.listMetadata(), status = context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId);
        pending = context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4)));
        await Promise.race([entered.promise, pending.then(() => { throw new Error("Floor preflight escaped its gate"); })]);
        if (kind === "cancel") context.controller.cancelActiveRun();
        else {
          const noop = kind === "selected-noop"
            ? await context.controller.applyWindowWidthOverride(r3p5Request(initial, seeds[0].first))
            : await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.6)));
          expect(noop.fixture).toBe(initial); expect(noop.runId).toBe(context.opened.runId);
        }
        gate.resolve(); expect((await pending).stale).toBe(true);
        expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.registry.listMetadata()).toEqual(metadata);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents); expect(context.disposals.get(initial) ?? 0).toBe(0);
        await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(1);
        expect(context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId)).toEqual(status); r3p12History(context.controller, 0, 0);
      } finally { gate.resolve(); held.mockRestore(); context.controller.dispose(); await pending?.catch(() => undefined); await context.controller.drainSourceCheckpoints(); }
    }
  }, 90_000);

  it("rolls back floor viewer preparation, commit errors and document ABA without history or checkpoint writes and permits one retry", async () => {
    const context = await r3p16Open(seeds[0], "r3-p16-viewer"), initial = context.fixture;
    let unregister: (() => void) | undefined;
    try {
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata();
      for (const kind of ["prepare", "commit", "document-aba"] as const) {
        const failure = new Error("P16 floor viewer " + kind), candidates: AssemblyHallFixture[] = [], discarded = vi.fn();
        unregister = context.controller.registerFixtureViewer(async candidate => {
          candidates.push(candidate);
          if (kind === "prepare") throw failure;
          return { commit: () => {
            if (kind === "commit") throw failure;
            const documentId = r3p5Source(initial).document.documentId;
            context.store.getState().selectDocument("r3-p16-other-document"); context.store.getState().selectDocument(documentId);
            return () => undefined;
          }, discard: discarded };
        });
        const pending = context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4)));
        if (kind === "document-aba") await expect(pending).rejects.toMatchObject({ code: "building.sourceEditConflict" });
        else await expect(pending).rejects.toBe(failure);
        unregister(); unregister = undefined;
        expect(candidates).toHaveLength(1); expect(context.disposals.get(candidates[0])).toBe(1);
        if (kind !== "prepare") expect(discarded).toHaveBeenCalledTimes(1);
        expect(context.disposals.get(initial) ?? 0).toBe(0); expect(context.registry.listMetadata()).toEqual(metadata);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents); r3p12History(context.controller, 0, 0);
        await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(1);
      }
      const accepted = (await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4)))).fixture!;
      expect(r3p15List(accepted)).toEqual(r3p16Sort([...seeds[0].outside, ...seeds[0].members.map(opening => r3p16Directive(opening, 0.4))]));
      expect(r3p5Source(accepted).document.revision).toBe(r3p5Source(initial).document.revision + 1); r3p12History(context.controller, 1, 0);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2);
    } finally { unregister?.(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 90_000);

  it("rejects an early real narrower sibling even when the selected wider window admits the draft, without partial publication", async () => {
    // The actual P13 last-member-invalid coherent-split test remains the separate late-validation proof.
    // This public-source row is naturally heterogeneous; its first narrow member rejects before the selected wide member.
    const seed = seeds[0], controls = structuredClone(seed.baseFile.source.controlsView);
    controls.seeds = { family: "family-seed", building: "p16-floor-04", material: "material-seed", trim: "trim-seed" };
    controls.floorCount = 5; controls.bayCount = 3; controls.roofType = "gable";
    const intent = structuredClone(seed.baseFile.source.intent); intent.seeds = structuredClone(controls.seeds);
    intent.requested.floorCount = 5; intent.requested.bayCount = 3; intent.requested.roofType = "gable";
    const prepared = await p3SourceCodec.createBuildingSourceSnapshot({ documentId: "r3-p16-real-heterogeneous", revision: 7,
      controls, intent, stylePack: seed.baseFile.source.stylePack });
    const decoded = await p3SourceCodec.parseBuildingSourceFile(seed.baseFile);
    const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: prepared.sourceSnapshot,
      packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof r3p16Open>> | undefined;
    try {
      context = await r3p16Open(seed, "r3-p16-real-heterogeneous-before", file);
      const split = await r3p5Split(context.fixture), members = split.openings.filter(opening => opening.facade === "front" &&
        opening.floorIndex === 2 && opening.kind === "window").sort((a, b) => a.bayIndex - b.bayIndex);
      expect(context.fixture.spec.familyId).toBe("family-468c016c562bfd32");
      expect(members.map(opening => [opening.bayIndex, opening.sizeM[0]])).toEqual([[0, 1.25], [1, 1.25], [2, 1.35]]);
      const outside = split.openings.find(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 1);
      if (!outside) throw new Error("Expected a real unrelated floor window");
      const source = await p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: r3p5Source(context.fixture),
        windowWidthBatch: r3p15Batch([r3p16Directive(outside, 0.5)]) });
      const portable = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
        packedAtlas: context.fixture.packedAtlas, debugExport: context.fixture.debugExport });
      const current = (await context.controller.openSourceFile({ readText: async () => JSON.stringify(portable) })).fixture!;
      await context.controller.drainSourceCheckpoints();
      const actual = await r3p5Split(current), selected = actual.openings.find(opening => r3p16Key(r3p16Address(opening)) === "front:2:2");
      if (!selected) throw new Error("Expected the actual wider selected slot");
      const splitModule = await import("../compiler/facadeSplitPlan");
      const individuallyValid = await splitModule.applyWindowWidthOverride(actual, r3p16Directive(selected, 1.30));
      expect(splitModule.resolveWindowOpeningFromSlotAddress(individuallyValid, r3p16Address(selected)).sizeM[0]).toBe(1.30);
      const saved = await context.controller.exportSourceFile(), ir = r3p5Stable(current.ir), gallery = r3p5Stable(current.componentGallery);
      const metadata = context.registry.listMetadata(), calls = context.createFixture.mock.calls.length, records = context.records.length;
      const documentId = r3p5Source(current).document.documentId, acknowledgement = context.controller.getSourceCheckpointStatus(documentId), runs = context.store.getState().runs;
      await expect(context.controller.applyWindowFloorWidthOverride(r3p16Request(current, r3p16Floor(1.30, 2))))
        .rejects.toMatchObject({ name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.unsupportedWidth" });
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.store.getState().runs).toBe(runs);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(current) ?? 0).toBe(0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(r3p5Stable(current.ir)).toEqual(ir); expect(r3p5Stable(current.componentGallery)).toEqual(gallery);
      p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata); r3p12History(context.controller, 0, 0);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(records);
      expect(context.controller.getSourceCheckpointStatus(documentId)).toEqual(acknowledgement);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally { context?.controller.dispose(); await context?.controller.drainSourceCheckpoints(); interpret.mockRestore(); generate.mockRestore(); }
  }, 60_000);

  it("rejects a genuinely last invalid real sibling after two valid floor widths without partial controller publication", async () => {
    // Public source and the real kit produce two wider windows followed by a narrower final member.
    const seed = seeds[0], controls = structuredClone(seed.baseFile.source.controlsView);
    controls.seeds = { family: "family-seed", building: "p16-direct-late-22", material: "material-seed", trim: "trim-seed" };
    controls.floorCount = 5; controls.bayCount = 3; controls.roofType = "gable";
    const intent = structuredClone(seed.baseFile.source.intent); intent.seeds = structuredClone(controls.seeds);
    intent.requested.floorCount = 5; intent.requested.bayCount = 3; intent.requested.roofType = "gable";
    const prepared = await p3SourceCodec.createBuildingSourceSnapshot({ documentId: "r3-p16-real-late-heterogeneous", revision: 7,
      controls, intent, stylePack: seed.baseFile.source.stylePack });
    const decoded = await p3SourceCodec.parseBuildingSourceFile(seed.baseFile);
    const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: prepared.sourceSnapshot,
      packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof r3p16Open>> | undefined;
    try {
      context = await r3p16Open(seed, "r3-p16-real-late-heterogeneous-before", file);
      const split = await r3p5Split(context.fixture), members = split.openings.filter(opening => opening.facade === "front" &&
        opening.floorIndex === 3 && opening.kind === "window").sort((a, b) => a.bayIndex - b.bayIndex);
      expect(context.fixture.spec.familyId).toBe("family-468c016c562bfd32");
      expect(members.map(opening => [opening.bayIndex, opening.sizeM[0]])).toEqual([[0, 1.35], [1, 1.35], [2, 1.25]]);
      const outside = split.openings.find(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 1);
      if (!outside) throw new Error("Expected a real unrelated floor window");
      const source = await p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: r3p5Source(context.fixture),
        windowWidthBatch: r3p15Batch([r3p16Directive(outside, 0.5)]) });
      const portable = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
        packedAtlas: context.fixture.packedAtlas, debugExport: context.fixture.debugExport });
      const current = (await context.controller.openSourceFile({ readText: async () => JSON.stringify(portable) })).fixture!;
      await context.controller.drainSourceCheckpoints();
      const actual = await r3p5Split(current), selected = actual.openings.find(opening => r3p16Key(r3p16Address(opening)) === "front:3:0");
      if (!selected) throw new Error("Expected the actual wider selected slot");
      const splitModule = await import("../compiler/facadeSplitPlan");
      const splitBefore = r3p5Stable(actual);
      for (const member of members.slice(0, -1)) {
        const individuallyValid = await splitModule.applyWindowWidthOverride(actual, r3p16Directive(member, 1.30));
        expect(splitModule.resolveWindowOpeningFromSlotAddress(individuallyValid, r3p16Address(member)).sizeM[0]).toBe(1.30);
        expect(r3p5Stable(actual)).toEqual(splitBefore);
      }
      await expect(splitModule.applyWindowWidthOverride(actual, r3p16Directive(members[2], 1.30)))
        .rejects.toMatchObject({ code: "building.windowWidth.unsupportedWidth" });
      expect(r3p5Stable(actual)).toEqual(splitBefore);
      expect(r3p16Address(selected)).toEqual(r3p16Address(members[0]));
      const saved = await context.controller.exportSourceFile(), ir = r3p5Stable(current.ir), gallery = r3p5Stable(current.componentGallery);
      const metadata = context.registry.listMetadata(), calls = context.createFixture.mock.calls.length, records = context.records.length;
      const documentId = r3p5Source(current).document.documentId, acknowledgement = context.controller.getSourceCheckpointStatus(documentId), runs = context.store.getState().runs;
      await expect(context.controller.applyWindowFloorWidthOverride(r3p16Request(current, r3p16Floor(1.30, 3))))
        .rejects.toMatchObject({ name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.unsupportedWidth" });
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.store.getState().runs).toBe(runs);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(current) ?? 0).toBe(0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(r3p5Stable(current.ir)).toEqual(ir); expect(r3p5Stable(current.componentGallery)).toEqual(gallery);
      p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata); r3p12History(context.controller, 0, 0);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(records);
      expect(context.controller.getSourceCheckpointStatus(documentId)).toEqual(acknowledgement);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    } finally { context?.controller.dispose(); await context?.controller.drainSourceCheckpoints(); interpret.mockRestore(); generate.mockRestore(); }
  }, 60_000);
});

type R3P18Bay = import("../contracts/buildingDocument").BuildingWindowBayWidthOverride;
type R3P18Seed = R3P16Seed & { bayIndex: number };
const r3p18Request = (fixture: AssemblyHallFixture, directive: R3P18Bay) => ({ ...r3p12Request(fixture), directive });

describe("R3.P18 atomic selected-bay width transactions", () => {
  let seeds: R3P18Seed[];
  const r3p18Bay = (widthM: number, bayIndex = seeds[0].bayIndex, facade: R3P18Bay["facade"] = "front"): R3P18Bay =>
    ({ schemaVersion: "0.1.0", facade, bayIndex, widthM });

  beforeAll(async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    seeds = [];
    try {
      for (const profile of [{ fidelityMode: "kit", detailLevel: "high" }, { fidelityMode: "proof", detailLevel: "low" }] as const) {
        const context = await r3p5WidthContext("r3-p18-seed-" + profile.fidelityMode, profile);
        try {
          expect(interpret).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(12);
          interpret.mockClear(); generate.mockClear();
          const fixture = context.fixture, source = r3p5Source(fixture), split = await r3p5Split(fixture);
          const bayIndex = [...new Set(split.openings.filter(opening => opening.facade === "front" && opening.kind === "window").map(opening => opening.bayIndex))]
            .sort((a, b) => a - b).find(index => {
              const windows = split.openings.filter(opening => opening.facade === "front" && opening.bayIndex === index && opening.kind === "window");
              return windows.length >= 2 && windows.some(opening => opening.floorIndex === 0) && windows.every(opening => opening.sizeM[0] > 0.6);
            });
          if (bayIndex === undefined) throw new Error("Expected an actual multi-floor front bay with ground glazing");
          const members = split.openings.filter(opening => opening.kind === "window" && opening.facade === "front" && opening.bayIndex === bayIndex)
            .sort((a, b) => a.floorIndex - b.floorIndex);
          expect(members.length).toBeGreaterThanOrEqual(2); expect(members.every(opening => opening.sizeM[0] > 0.6)).toBe(true);
          const outsideBay = split.openings.find(opening => opening.kind === "window" && opening.facade === "front" && opening.bayIndex !== bayIndex);
          if (!outsideBay) throw new Error("Expected an actual outside-bay window");
          const outside = [r3p16Directive(outsideBay, 0.5)];
          if (profile.fidelityMode === "kit") {
            const outsideFacade = split.openings.find(opening => opening.kind === "window" && opening.facade !== "front" && opening.floorIndex === 1);
            if (!outsideFacade) throw new Error("Expected an actual outside-facade window");
            outside.push(r3p16Directive(outsideFacade, 0.5));
          }
          const first = r3p16Directive(members[0], 0.6), makeFile = async (snapshot: import("../state/buildingSourceFile").BuildingSourceSnapshot) =>
            p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: snapshot, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
          const derive = p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit;
          const baseFile = await makeFile(source), v4File = await makeFile(await p3SourceCodec.deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: source, windowWidthOverrides: [first] }));
          const batchFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([first, ...outside]) }));
          const uniformFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([...members.map(opening => r3p16Directive(opening, 0.6)), ...outside]) }));
          const explicitFile = await makeFile(await derive({ sourceSnapshot: source, windowWidthBatch: r3p15Batch([...members.map(opening => r3p16Directive(opening, opening.sizeM[0])), ...outside]) }));
          seeds.push({ baseFile, v4File, batchFile, uniformFile, explicitFile, split, members, outside, first, bayIndex,
            materials: p4CopyMaterialBytes(fixture), metadata: r3p5Materials(fixture), checkpointMetadata: r3p9MaterialMetadata(fixture.packedAtlas, fixture.debugExport) });
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { context.controller.dispose(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 90_000);

  it("publishes one complete bay command for kit/high and proof/low with outside overrides, independent IR/gallery and one exact checkpoint", async () => {
    const { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    try {
      for (const [index, seed] of seeds.entries()) {
        const context = await r3p16Open(seed, "r3-p18-positive-" + index);
        let receiver: Awaited<ReturnType<typeof p3SourceHarness>> | undefined;
        try {
          const initial = context.fixture, desired = r3p16Sort([...seed.outside, ...seed.members.map(opening => r3p16Directive(opening, 0.4))]);
          const expected = await r3p16Expected(initial, desired), calls = context.createFixture.mock.calls.length;
          const result = await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4, seed.bayIndex))), current = result.fixture!;
          expect(result.stale).toBe(false); expect(current).not.toBe(initial); expect(context.createFixture).toHaveBeenCalledTimes(calls + 1);
          expect(r3p15List(current)).toEqual(desired); expect(seed.members.length).toBeGreaterThanOrEqual(2);
          expect(r3p5Stable(current.ir)).toEqual(r3p5Stable(expected.ir));
          expect(r3p5Stable(current.componentGallery)).toEqual(r3p5Stable(expected.gallery));
          expect(r3p5Stable(current.ir)).not.toEqual(r3p5Stable(initial.ir)); expect(r3p15Inputs(current)).toEqual(r3p15Inputs(initial));
          expect(r3p5Source(current).document.revision).toBe(r3p5Source(initial).document.revision + 1); r3p12History(context.controller, 1, 0);
          expect(current.catalog).toBe(initial.catalog); expect(current.packedAtlas).toBe(initial.packedAtlas); expect(current.debugExport).toBe(initial.debugExport);
          p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata);
          await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2);
          const record = context.records[1]; await r3p9VerifySourceRecord(record, r3p5Source(current), seed.materials, seed.checkpointMetadata);
          expect(context.controller.getSourceCheckpointStatus(r3p5Source(current).document.documentId)).toMatchObject({ state: "saved", runId: result.runId,
            revision: r3p5Source(current).document.revision, sourceContentHash: r3p5Source(current).sourceContentHash, checkpointContentHash: record.contentHash });
          const saved = await context.controller.exportSourceFile();
          if (record.kind !== "source") throw new Error("Expected actual floor source checkpoint");
          expect(record.sourceFile).toEqual(JSON.parse(saved.contents));
          receiver = await p3SourceHarness("r3-p18-fresh-" + index);
          const reopened = (await receiver.controller.openSourceFile({ readText: async () => saved.contents })).fixture!;
          expect(r3p5Stable(reopened.ir)).toEqual(r3p5Stable(current.ir)); expect(r3p5Stable(reopened.componentGallery)).toEqual(r3p5Stable(current.componentGallery));
          expect(r3p15Inputs(reopened)).toEqual(r3p15Inputs(current)); p4ExpectMaterialBytes(reopened, seed.materials);
          expect(r3p5Materials(reopened)).toEqual(seed.metadata); expect((await receiver.controller.exportSourceFile()).contents).toBe(saved.contents);
          r3p12History(receiver.controller, 0, 0); expect(context.legacyPut).not.toHaveBeenCalled();
          for (const job of context.writers.jobs) expect(job.release).toHaveBeenCalledTimes(1);
          expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
        } finally { receiver?.controller.dispose(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
      }
    } finally { interpret.mockRestore(); generate.mockRestore(); }
  }, 90_000);

  it("retains a genuine legacy bay noop, upgrades real legacy edits and preserves complete-set redo on noops", async () => {
    const proof = seeds[1], decoded = await p3SourceCodec.parseBuildingSourceFile(proof.baseFile);
    const ground = proof.members.find(opening => opening.floorIndex === 0);
    const body = proof.members.filter(opening => opening.floorIndex > 0), bodyWidth = body[0].sizeM[0];
    expect(ground).toBeDefined(); expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.every(opening => opening.sizeM[0] === bodyWidth)).toBe(true);
    expect(ground!.sizeM[0]).toBeGreaterThan(bodyWidth);
    const legacySource = await p3SourceCodec.deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: decoded.sourceSnapshot,
      windowWidthOverrides: [r3p16Directive(ground!, bodyWidth)] });
    const legacyFile = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: legacySource,
      packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
    const legacy = await r3p16Open(proof, "r3-p18-legacy-noop", legacyFile);
    try {
      const initial = legacy.fixture, saved = await legacy.controller.exportSourceFile(), calls = legacy.createFixture.mock.calls.length;
      expect(r3p5Source(initial).schemaVersion).toBe("0.4.0");
      const ack = legacy.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId), runs = legacy.store.getState().runs;
      const result = await legacy.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(bodyWidth, proof.bayIndex)));
      expect(result.fixture).toBe(initial); expect(result.runId).toBe(legacy.opened.runId); expect(result.stale).toBe(false);
      expect(legacy.createFixture).toHaveBeenCalledTimes(calls); expect(legacy.store.getState().runs).toBe(runs);
      expect((await legacy.controller.exportSourceFile()).contents).toBe(saved.contents); r3p12History(legacy.controller, 0, 0);
      await legacy.controller.drainSourceCheckpoints(); expect(legacy.records).toHaveLength(1);
      expect(legacy.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId)).toEqual(ack);
    } finally { legacy.controller.dispose(); await legacy.controller.drainSourceCheckpoints(); }

    for (const [index, seed] of seeds.entries()) {
      const context = await r3p16Open(seed, "r3-p18-legacy-upgrade-" + index, seed.v4File);
      try {
        const initial = context.fixture, legacySource = r3p5Source(initial), priorIr = r3p5Stable(initial.ir);
        if (legacySource.schemaVersion !== "0.4.0") throw new Error("Expected actual legacy v4 authority before upgrade");
        const priorWidths = legacySource.windowWidthOverrides;
        expect(legacySource.schemaVersion).toBe("0.4.0");
        const current = (await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4, seed.bayIndex)))).fixture!;
        expect(r3p5Source(current).schemaVersion).toBe("0.5.0");
        expect(r3p5Source(current).document.revision).toBe(r3p5Source(initial).document.revision + 1);
        r3p12History(context.controller, 1, 0);
        const undo = (await context.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
        expect(r3p5Source(undo).schemaVersion).toBe("0.5.0"); expect(r3p15List(undo)).toEqual(priorWidths);
        expect(r3p5Source(undo).document.revision).toBe(r3p5Source(initial).document.revision + 2);
        expect(r3p5Stable(undo.ir)).toEqual(priorIr); expect(r3p5Stable(undo.componentGallery)).toEqual(r3p5Stable(initial.componentGallery));
        p4ExpectMaterialBytes(undo, seed.materials); expect(r3p5Materials(undo)).toEqual(seed.metadata);
      } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }

      const uniform = await r3p16Open(seed, "r3-p18-redo-noop-" + index, seed.uniformFile);
      try {
        const changed = (await uniform.controller.applyWindowBayWidthOverride(r3p18Request(uniform.fixture, r3p18Bay(0.4, seed.bayIndex)))).fixture!;
        const undo = (await uniform.controller.undoWindowWidthOverride(r3p12Request(changed))).fixture!;
        await uniform.controller.drainSourceCheckpoints(); r3p12History(uniform.controller, 0, 1);
        const saved = await uniform.controller.exportSourceFile(), records = uniform.records.length, calls = uniform.createFixture.mock.calls.length;
        const ack = uniform.controller.getSourceCheckpointStatus(r3p5Source(undo).document.documentId);
        const noop = await uniform.controller.applyWindowBayWidthOverride(r3p18Request(undo, r3p18Bay(0.6, seed.bayIndex)));
        expect(noop.fixture).toBe(undo); expect(uniform.createFixture).toHaveBeenCalledTimes(calls); r3p12History(uniform.controller, 0, 1);
        expect((await uniform.controller.exportSourceFile()).contents).toBe(saved.contents);
        await uniform.controller.drainSourceCheckpoints(); expect(uniform.records).toHaveLength(records);
        expect(uniform.controller.getSourceCheckpointStatus(r3p5Source(undo).document.documentId)).toEqual(ack);
        const redo = (await uniform.controller.redoWindowWidthOverride(r3p12Request(undo))).fixture!;
        expect(r3p15List(redo)).toEqual(r3p16Sort([...seed.outside, ...seed.members.map(opening => r3p16Directive(opening, 0.4))]));
        r3p12History(uniform.controller, 1, 0);
      } finally { uniform.controller.dispose(); await uniform.controller.drainSourceCheckpoints(); }
    }
  }, 90_000);

  it("changes siblings when the selected width matches and removes only explicit base authority in the selected bay", async () => {
    const seed = seeds[1], context = await r3p16Open(seed, "r3-p18-identical-selected");
    try {
      const initial = context.fixture, desired = r3p16Sort([...seed.outside, ...seed.members.map(opening => r3p16Directive(opening, seed.first.widthM))]);
      const expected = await r3p16Expected(initial, desired);
      const changed = (await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(seed.first.widthM, seed.bayIndex)))).fixture!;
      expect(changed).not.toBe(initial); expect(r3p15List(changed)).toEqual(desired);
      expect(r3p5Stable(changed.ir)).toEqual(r3p5Stable(expected.ir)); r3p12History(context.controller, 1, 0);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }

    const door = seed.split.openings.find(opening => opening.facade === "front" && opening.kind === "door");
    if (!door) throw new Error("Expected the actual proof ground door");
    const members = seed.split.openings.filter(opening => opening.facade === "front" && opening.bayIndex === door.bayIndex && opening.kind === "window");
    expect(members.length).toBeGreaterThanOrEqual(2); const widthM = members[0].sizeM[0];
    expect(members.every(opening => opening.sizeM[0] === widthM)).toBe(true);
    const retained = [...seed.outside, seed.first], retainedKeys = new Set(retained.map(directive => r3p16Key(directive.address)));
    const explicitOutside = seed.split.openings.find(opening => opening.kind === "window" && opening.bayIndex !== door.bayIndex &&
      !retainedKeys.has(r3p16Key(r3p16Address(opening))));
    if (!explicitOutside) throw new Error("Expected an actual outside explicit-base window");
    const outside = r3p16Sort([...retained, r3p16Directive(explicitOutside, explicitOutside.sizeM[0])]);
    const decoded = await p3SourceCodec.parseBuildingSourceFile(seed.baseFile);
    const snapshot = await p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: decoded.sourceSnapshot,
      windowWidthBatch: r3p15Batch([...outside, ...members.map(opening => r3p16Directive(opening, widthM))]) });
    const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: snapshot,
      packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
    const explicit = await r3p16Open(seed, "r3-p18-explicit-base", file);
    try {
      const initial = explicit.fixture, before = r3p5Stable(initial.ir), hash = r3p5Source(initial).sourceContentHash;
      const current = (await explicit.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(widthM, door.bayIndex)))).fixture!;
      expect(r3p15List(current)).toEqual(outside); expect(r3p5Stable(current.ir)).toEqual(before);
      expect(r3p5Source(current).sourceContentHash).not.toBe(hash);
      expect(r3p5Source(current).document.revision).toBe(r3p5Source(initial).document.revision + 1);
      expect(r3p15List(current)).toContainEqual(r3p16Directive(explicitOutside, explicitOutside.sizeM[0]));
      p4ExpectMaterialBytes(current, seed.materials); r3p12History(explicit.controller, 1, 0);
      await explicit.controller.drainSourceCheckpoints(); expect(explicit.records).toHaveLength(2);
      const undo = (await explicit.controller.undoWindowWidthOverride(r3p12Request(current))).fixture!;
      expect(r3p15List(undo)).toEqual(r3p15List(initial)); expect(r3p5Source(undo).sourceContentHash).toBe(hash);
      expect(r3p5Stable(undo.ir)).toEqual(before);
    } finally { explicit.controller.dispose(); await explicit.controller.drainSourceCheckpoints(); }
  }, 90_000);

  it("edits the actual body stack above a ground door while preserving every door instance and outside directive", async () => {
    const seed = seeds[0], context = await r3p16Open(seed, "r3-p18-door-stack");
    try {
      const initial = context.fixture, split = await r3p5Split(initial);
      const door = split.openings.find(opening => opening.facade === "front" && opening.kind === "door");
      if (!door) throw new Error("Expected a real kit ground door");
      const windows = split.openings.filter(opening => opening.facade === "front" && opening.bayIndex === door.bayIndex && opening.kind === "window");
      expect(windows.length).toBeGreaterThan(0);
      const beforeDoor = r3p16DoorGeometry(initial, door);
      const desired = r3p16Sort([...r3p15List(initial).filter(directive => directive.address.facade !== "front" ||
        directive.address.bayIndex !== door.bayIndex), ...windows.map(opening => r3p16Directive(opening, 0.4))]);
      const expected = await r3p16Expected(initial, desired);
      const current = (await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4, door.bayIndex)))).fixture!;
      expect(r3p15List(current)).toEqual(desired); expect(r3p16DoorGeometry(current, door)).toEqual(beforeDoor);
      expect(r3p15List(current).some(directive => r3p16Key(directive.address) === r3p16Key(r3p16Address(door)))).toBe(false);
      expect(r3p5Stable(current.ir)).toEqual(r3p5Stable(expected.ir));
      expect(r3p5Stable(current.componentGallery)).toEqual(r3p5Stable(expected.gallery));
      p4ExpectMaterialBytes(current, seed.materials); expect(r3p5Materials(current)).toEqual(seed.metadata);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2); r3p12History(context.controller, 1, 0);
    } finally { context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 60_000);

  it("rejects unsafe envelopes before getters and owns a valid bay request through its first real kernel await and source ABA", async () => {
    const context = await r3p16Open(seeds[0], "r3-p18-owned"), initial = context.fixture;
    const splitModule = await import("../compiler/facadeSplitPlan"), actual = splitModule.applyWindowBayWidthOverride;
    const entered = p1Deferred<Awaited<ReturnType<typeof actual>>>(), gate = p1Deferred<void>();
    let restoreHeld: (() => void) | undefined, pending: ReturnType<BuildingRunController["applyWindowBayWidthOverride"]> | undefined;
    try {
      const saved = await context.controller.exportSourceFile(), calls = context.createFixture.mock.calls.length, metadata = context.registry.listMetadata();
      let reads = 0;
      const getter = Object.defineProperty({ schemaVersion: "0.1.0", facade: "front", bayIndex: 1 }, "widthM", { enumerable: true, get() { reads++; return 0.4; } });
      const symbol = r3p18Bay(0.4); Object.defineProperty(symbol, Symbol("extra"), { value: true });
      for (const directive of [undefined, null, {}, getter, symbol, { ...r3p18Bay(0.4), extra: undefined },
        { ...r3p18Bay(0.4), bayIndex: -1 }, { ...r3p18Bay(0.4), widthM: Number.NaN }]) {
        await expect(context.controller.applyWindowBayWidthOverride({ ...r3p12Request(initial), directive: directive as R3P18Bay }))
          .rejects.toMatchObject({ code: "building.windowWidth.invalidDirective" });
      }
      const envelope = Object.defineProperty({ directive: r3p18Bay(0.4), expectedRevision: r3p5Source(initial).document.revision }, "expectedSourceContentHash", {
        enumerable: true, get() { reads++; return r3p5Source(initial).sourceContentHash; }
      });
      await expect(context.controller.applyWindowBayWidthOverride(envelope as Parameters<BuildingRunController["applyWindowBayWidthOverride"]>[0]))
        .rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(reads).toBe(0); expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.registry.listMetadata()).toEqual(metadata);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents); expect(context.records).toHaveLength(1);
      const held = vi.spyOn(splitModule, "applyWindowBayWidthOverride").mockImplementationOnce(async (plan, request) => {
        const value = await actual(plan, request); entered.resolve(value); await gate.promise; return value;
      });
      restoreHeld = () => held.mockRestore();
      const request = r3p18Request(initial, r3p18Bay(0.4)), original = structuredClone(request);
      pending = context.controller.applyWindowBayWidthOverride(request);
      request.expectedRevision = 999; request.expectedSourceContentHash = "0".repeat(64);
      request.directive.bayIndex = 999; request.directive.facade = "rear"; request.directive.widthM = 999;
      const captured = await Promise.race([entered.promise, pending.then(() => { throw new Error("Bay completed before the real kernel gate"); })]);
      expect(captured.directives).toEqual(seeds[0].members.map(opening => r3p16Directive(opening, 0.4)));
      gate.resolve(); const changed = (await pending).fixture!; restoreHeld(); restoreHeld = undefined;
      expect(r3p15List(changed)).toEqual(r3p16Sort([...seeds[0].outside, ...captured.directives]));
      const undo = (await context.controller.undoWindowWidthOverride(r3p12Request(changed))).fixture!;
      expect(r3p5Source(undo).sourceContentHash).toBe(original.expectedSourceContentHash);
      expect(r3p5Source(undo).document.revision).toBe(original.expectedRevision + 2);
      const afterCalls = context.createFixture.mock.calls.length, afterSave = await context.controller.exportSourceFile();
      await expect(context.controller.applyWindowBayWidthOverride(original)).rejects.toMatchObject({ code: "building.sourceEditConflict" });
      expect(context.createFixture).toHaveBeenCalledTimes(afterCalls); expect((await context.controller.exportSourceFile()).contents).toBe(afterSave.contents);
      r3p12History(context.controller, 0, 1);
    } finally { gate.resolve(); restoreHeld?.(); context.controller.dispose(); await pending?.catch(() => undefined); await context.controller.drainSourceCheckpoints(); }
  }, 60_000);

  it("shares preflight tickets across selected, floor and bay noops and Cancel without partial allocation or publication", async () => {
    const seed = seeds[0], decoded = await p3SourceCodec.parseBuildingSourceFile(seed.baseFile);
    const front = seed.split.openings.filter(opening => opening.facade === "front" && opening.kind === "window");
    expect(front.every(opening => opening.sizeM[0] > 0.6)).toBe(true);
    const uniform = await p3SourceCodec.deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: decoded.sourceSnapshot,
      windowWidthBatch: r3p15Batch([...front.map(opening => r3p16Directive(opening, 0.6)),
        ...seed.outside.filter(directive => directive.address.facade !== "front")]) });
    const file = await p3SourceCodec.createBuildingSourceFile({ sourceSnapshot: uniform,
      packedAtlas: decoded.packedAtlas, debugExport: decoded.debugExport });
    const splitModule = await import("../compiler/facadeSplitPlan"), actualBay = splitModule.applyWindowBayWidthOverride;
    const actualFloor = splitModule.applyWindowFloorWidthOverride, actualSingle = splitModule.applyWindowWidthOverride;
    const floorIndex = seed.members.find(opening => opening.floorIndex > 0)!.floorIndex;
    for (const variant of ["cancel", "selected-noop", "floor-noop", "bay-noop", "bay-after-floor", "bay-after-selected"] as const) {
      const context = await r3p16Open(seed, "r3-p18-ticket-" + variant, file), initial = context.fixture;
      const entered = p1Deferred<void>(), gate = p1Deferred<void>();
      let restoreHeld: (() => void) | undefined, pending: ReturnType<BuildingRunController["applyWindowBayWidthOverride"]> | undefined;
      try {
        if (variant === "bay-after-floor") {
          const held = vi.spyOn(splitModule, "applyWindowFloorWidthOverride").mockImplementationOnce(async (plan, request) => {
            const result = await actualFloor(plan, request); entered.resolve(); await gate.promise; return result;
          }); restoreHeld = () => held.mockRestore();
        } else if (variant === "bay-after-selected") {
          const held = vi.spyOn(splitModule, "applyWindowWidthOverride").mockImplementationOnce(async (plan, request) => {
            const result = await actualSingle(plan, request); entered.resolve(); await gate.promise; return result;
          }); restoreHeld = () => held.mockRestore();
        } else {
          const held = vi.spyOn(splitModule, "applyWindowBayWidthOverride").mockImplementationOnce(async (plan, request) => {
            const result = await actualBay(plan, request); entered.resolve(); await gate.promise; return result;
          }); restoreHeld = () => held.mockRestore();
        }
        const saved = await context.controller.exportSourceFile(), calls = context.createFixture.mock.calls.length;
        const metadata = context.registry.listMetadata(), ack = context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId);
        const runs = context.store.getState().runs;
        pending = variant === "bay-after-floor"
          ? context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.4, floorIndex)))
          : variant === "bay-after-selected"
            ? context.controller.applyWindowWidthOverride(r3p5Request(initial, r3p16Directive(seed.members[0], 0.4)))
            : context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4)));
        await Promise.race([entered.promise, pending.then(() => { throw new Error("Width preflight escaped its real kernel gate"); })]);
        if (variant === "cancel") context.controller.cancelActiveRun();
        else {
          const noop = variant === "selected-noop"
            ? await context.controller.applyWindowWidthOverride(r3p5Request(initial, r3p16Directive(seed.members[0], 0.6)))
            : variant === "floor-noop"
              ? await context.controller.applyWindowFloorWidthOverride(r3p16Request(initial, r3p16Floor(0.6, floorIndex)))
              : await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.6)));
          expect(noop.fixture).toBe(initial); expect(noop.runId).toBe(context.opened.runId);
          expect(context.store.getState().runs).toBe(runs);
        }
        gate.resolve(); expect((await pending).stale).toBe(true);
        expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.registry.listMetadata()).toEqual(metadata);
        expect(context.disposals.get(initial) ?? 0).toBe(0); expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
        r3p12History(context.controller, 0, 0); await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(1);
        expect(context.controller.getSourceCheckpointStatus(r3p5Source(initial).document.documentId)).toEqual(ack);
        expect(context.legacyPut).not.toHaveBeenCalled();
      } finally { gate.resolve(); await pending?.catch(() => undefined); restoreHeld?.(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
    }
  }, 90_000);

  it("rolls back bay viewer preparation, commit errors and document ABA without history or checkpoint writes and permits one retry", async () => {
    const context = await r3p16Open(seeds[0], "r3-p18-viewer"), initial = context.fixture;
    let unregister: (() => void) | undefined;
    try {
      const saved = await context.controller.exportSourceFile(), metadata = context.registry.listMetadata();
      for (const kind of ["prepare", "commit", "document-aba"] as const) {
        const failure = new Error("P16 bay viewer " + kind), candidates: AssemblyHallFixture[] = [], discarded = vi.fn();
        unregister = context.controller.registerFixtureViewer(async candidate => {
          candidates.push(candidate);
          if (kind === "prepare") throw failure;
          return { commit: () => {
            if (kind === "commit") throw failure;
            const documentId = r3p5Source(initial).document.documentId;
            context.store.getState().selectDocument("r3-p18-other-document"); context.store.getState().selectDocument(documentId);
            return () => undefined;
          }, discard: discarded };
        });
        const pending = context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4)));
        if (kind === "document-aba") await expect(pending).rejects.toMatchObject({ code: "building.sourceEditConflict" });
        else await expect(pending).rejects.toBe(failure);
        unregister(); unregister = undefined;
        expect(candidates).toHaveLength(1); expect(context.disposals.get(candidates[0])).toBe(1);
        if (kind !== "prepare") expect(discarded).toHaveBeenCalledTimes(1);
        expect(context.disposals.get(initial) ?? 0).toBe(0); expect(context.registry.listMetadata()).toEqual(metadata);
        expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents); r3p12History(context.controller, 0, 0);
        await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(1);
      }
      const accepted = (await context.controller.applyWindowBayWidthOverride(r3p18Request(initial, r3p18Bay(0.4)))).fixture!;
      expect(r3p15List(accepted)).toEqual(r3p16Sort([...seeds[0].outside, ...seeds[0].members.map(opening => r3p16Directive(opening, 0.4))]));
      expect(r3p5Source(accepted).document.revision).toBe(r3p5Source(initial).document.revision + 1); r3p12History(context.controller, 1, 0);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(2);
    } finally { unregister?.(); context.controller.dispose(); await context.controller.drainSourceCheckpoints(); }
  }, 90_000);

  it("rejects a genuinely later narrower body window after a real valid ground member without publishing any partial bay edit", async () => {
    const seed = seeds[0], { LocalRulePromptInterpreter } = await import("../psg/localRulePromptInterpreter");
    const { ProceduralMaterialProvider } = await import("../materials/providers/proceduralMaterialProvider");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret"), generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    let context: Awaited<ReturnType<typeof r3p16Open>> | undefined;
    try {
      context = await r3p16Open(seed, "r3-p18-real-late-rejection");
      const initial = context.fixture, base = await r3p5Split(initial);
      const members = base.openings.filter(opening => opening.facade === "front" && opening.bayIndex === seed.bayIndex && opening.kind === "window")
        .sort((a, b) => a.floorIndex - b.floorIndex);
      expect(members.length).toBeGreaterThanOrEqual(2); expect(members[0].floorIndex).toBe(0);
      const widthM = (members[0].sizeM[0] + Math.min(...members.slice(1).map(opening => opening.sizeM[0]))) / 2;
      const firstInvalid = members.findIndex(opening => opening.sizeM[0] < widthM); expect(firstInvalid).toBeGreaterThan(0);
      const splitModule = await import("../compiler/facadeSplitPlan"), baseBefore = r3p5Stable(base);
      for (const member of members.slice(0, firstInvalid)) {
        const valid = await splitModule.applyWindowWidthOverride(base, r3p16Directive(member, widthM));
        expect(splitModule.resolveWindowOpeningFromSlotAddress(valid, r3p16Address(member)).sizeM[0]).toBe(widthM);
        expect(r3p5Stable(base)).toEqual(baseBefore);
      }
      await expect(splitModule.applyWindowWidthOverride(base, r3p16Directive(members[firstInvalid], widthM)))
        .rejects.toMatchObject({ code: "building.windowWidth.unsupportedWidth" });
      const saved = await context.controller.exportSourceFile(), ir = r3p5Stable(initial.ir), gallery = r3p5Stable(initial.componentGallery);
      const metadata = context.registry.listMetadata(), calls = context.createFixture.mock.calls.length, runs = context.store.getState().runs;
      const documentId = r3p5Source(initial).document.documentId, ack = context.controller.getSourceCheckpointStatus(documentId), records = context.records.length;
      const request = r3p18Request(initial, r3p18Bay(widthM)), owned = structuredClone(request);
      await expect(context.controller.applyWindowBayWidthOverride(request))
        .rejects.toMatchObject({ name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.unsupportedWidth" });
      expect(request).toEqual(owned); expect(r3p5Stable(base)).toEqual(baseBefore);
      expect(context.createFixture).toHaveBeenCalledTimes(calls); expect(context.store.getState().runs).toBe(runs);
      expect(context.registry.listMetadata()).toEqual(metadata); expect(context.disposals.get(initial) ?? 0).toBe(0);
      expect((await context.controller.exportSourceFile()).contents).toBe(saved.contents);
      expect(r3p5Stable(initial.ir)).toEqual(ir); expect(r3p5Stable(initial.componentGallery)).toEqual(gallery);
      p4ExpectMaterialBytes(initial, seed.materials); expect(r3p5Materials(initial)).toEqual(seed.metadata); r3p12History(context.controller, 0, 0);
      await context.controller.drainSourceCheckpoints(); expect(context.records).toHaveLength(records);
      expect(context.controller.getSourceCheckpointStatus(documentId)).toEqual(ack);
      expect(interpret).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(context.legacyPut).not.toHaveBeenCalled();
    } finally { context?.controller.dispose(); await context?.controller.drainSourceCheckpoints(); interpret.mockRestore(); generate.mockRestore(); }
  }, 60_000);
});
