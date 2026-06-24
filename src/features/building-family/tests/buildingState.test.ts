import { vi } from "vitest";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";
import { BuildingArtifactRegistry } from "../state/artifactRegistry";
import { BuildingRunController } from "../state/buildingRunController";
import { createBuildingStore } from "../state/buildingStore";

function fakeAssemblyFixture(label: string): AssemblyHallFixture {
  return {
    schemaVersion: "0.1.0",
    prompt: `${label} prompt`,
    packedAtlas: {
      contentHash: `${label}-atlas-hash`
    },
    ir: {
      buildingId: `${label}-building`,
      sourceGraphHash: `${label}-graph-hash`
    },
    familyRuntime: {
      dispose: vi.fn()
    }
  } as unknown as AssemblyHallFixture;
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
    expect(registry.listMetadata().map((artifact) => artifact.artifactId)).toEqual([
      "assembly-hall-fixture:current-building:current-atlas-hash"
    ]);
    expect(store.getState().runs.status).toBe("complete");
    expect(store.getState().runs.activeRunId).toBe("run-002");
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

    store.getState().updatePromptControls({ seeds: { family: "new-family-seed" } });
    expect(store.getState().controls.invalidation.changedControls).toEqual(["familySeed"]);
    expect(store.getState().controls.invalidation.reusableArtifacts.componentCatalog).toBe(false);
    expect(store.getState().controls.invalidation.materialGenerationRequired).toBe(true);
  });
});
