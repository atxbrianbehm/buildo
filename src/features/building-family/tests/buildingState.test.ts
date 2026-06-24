import { vi } from "vitest";
import type { AssemblyHallFixture, CreateAssemblyHallFixtureInput } from "../ui/assemblyHallFixture";
import { BuildingArtifactRegistry } from "../state/artifactRegistry";
import { BuildingRunController } from "../state/buildingRunController";
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
      artifactId: "assembly-hall-fixture:completed-building:completed-atlas-hash",
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
      artifactId: "assembly-hall-fixture:current-building:current-atlas-hash",
      stale: false
    });
    expect(staleFixture.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(currentFixture.familyRuntime.dispose).not.toHaveBeenCalled();
    expect(registry.listMetadata().map((artifact) => artifact.artifactId)).toContain(
      "assembly-hall-fixture:current-building:current-atlas-hash"
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

    await controller.startDemoRun(defaultBuildingPromptControls);
    const floorRerunPrompt = {
      ...defaultBuildingPromptControls,
      floorCount: defaultBuildingPromptControls.floorCount + 1
    };
    await controller.startDemoRun(floorRerunPrompt);
    await controller.startDemoRun({
      ...floorRerunPrompt,
      seeds: {
        ...floorRerunPrompt.seeds,
        family: "family-seed-regenerated"
      }
    });

    const baselineInput = createFixture.mock.calls[0][0] as CreateAssemblyHallFixtureInput;
    const floorRerunInput = createFixture.mock.calls[1][0] as CreateAssemblyHallFixtureInput;
    const newFamilyInput = createFixture.mock.calls[2][0] as CreateAssemblyHallFixtureInput;
    expect(baselineInput.remoteMaterial).toBe(remoteMaterial);
    expect(floorRerunInput.reusableArtifacts).toMatchObject({
      packedAtlas: baselineFixture.packedAtlas,
      debugExport: baselineFixture.debugExport
    });
    expect(floorRerunInput.remoteMaterial).toBeUndefined();
    expect(newFamilyInput.reusableArtifacts).toEqual({});
    expect(newFamilyInput.remoteMaterial).toBe(remoteMaterial);
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
});
