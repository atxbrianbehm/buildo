import { useEffect, useState } from "react";
import { useStore } from "zustand";
import "./App.css";
import { AtlasLab } from "../features/building-family/ui/AtlasLab";
import { AssemblyHall } from "../features/building-family/ui/AssemblyHall";
import type { AssemblyHallFixture } from "../features/building-family/ui/assemblyHallFixture";
import { BuildingArtifactRegistry } from "../features/building-family/state/artifactRegistry";
import { BuildingRunController } from "../features/building-family/state/buildingRunController";
import { createBuildingStore, type BuildingStoreApi } from "../features/building-family/state/buildingStore";

const setupCards = [
  {
    title: "Plan",
    body: "Dynamic Building Family source plan is preserved in project docs.",
    status: "landed"
  },
  {
    title: "Architecture",
    body: "Greenfield integration map defines the first source boundaries.",
    status: "mapped"
  },
  {
    title: "Runtime",
    body: "React, TypeScript, and Vite are ready for the first feature milestone.",
    status: "ready"
  }
];

export function App() {
  const [{ store, registry, controller }] = useState(() => {
    const createdStore: BuildingStoreApi = createBuildingStore();
    const createdRegistry = new BuildingArtifactRegistry();
    return {
      store: createdStore,
      registry: createdRegistry,
      controller: new BuildingRunController({
        store: createdStore,
        registry: createdRegistry
      })
    };
  });
  const runState = useStore(store, (state) => state.runs);
  const currentRun = runState.currentRun;
  const activeFixtureArtifactId = runState.activeFixtureArtifactId;
  const fixture = activeFixtureArtifactId
    ? registry.get<AssemblyHallFixture>(activeFixtureArtifactId) ?? null
    : null;

  useEffect(() => {
    void controller.startDemoRun();

    return () => {
      controller.dispose();
    };
  }, [controller]);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="buildo-title">
        <div className="hero-copy">
          <p className="project-label">Wild Construct Lab</p>
          <h1 id="buildo-title">Buildo</h1>
          <p className="hero-text">
            A new workspace for deterministic building families, semantic material atlases, and
            inspectable browser assembly.
          </p>
        </div>
        <div className="status-panel" aria-label="Project setup status">
          {setupCards.map((card) => (
            <article className="status-card" key={card.title}>
              <div>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </div>
              <span>{card.status}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="run-panel" aria-labelledby="generation-run-heading">
        <div className="run-panel__summary">
          <p className="project-label">Run Controller</p>
          <h2 id="generation-run-heading">Generation Run</h2>
          <dl className="run-panel__metrics" aria-label="Generation run state">
            <div>
              <dt>Status</dt>
              <dd>{runState.status}</dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>{runState.activeRunId ?? "pending"}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{currentRun?.events.length ?? 0}</dd>
            </div>
          </dl>
          <p className="run-panel__artifact" aria-label="Generation run artifact">
            {activeFixtureArtifactId ?? "pending"}
          </p>
        </div>
        <ol className="run-panel__timeline" aria-label="Generation run timeline">
          {currentRun?.events.map((event, index) => (
            <li key={`${event.stage}-${index}`}>
              <span>{event.stage}</span>
              {event.outputArtifactId ? <small>{event.outputArtifactId}</small> : null}
            </li>
          )) ?? (
            <li>
              <span>idle</span>
            </li>
          )}
        </ol>
      </section>
      <section className="atlas-fixture" aria-labelledby="atlas-fixture-heading">
        <div className="atlas-fixture__intro">
          <p className="project-label">Material Atlas</p>
          <h2 id="atlas-fixture-heading">Generated Fixture</h2>
          <p>
            {fixture
              ? fixture.prompt
              : runState.error ?? "Generating deterministic atlas fixture..."}
          </p>
          {fixture ? (
            <dl className="atlas-fixture__provenance" aria-label="Atlas fixture provenance">
              <div>
                <dt>Channels</dt>
                <dd>{fixture.debugExport.channels.length}</dd>
              </div>
              <div>
                <dt>Slots</dt>
                <dd>{fixture.debugExport.slotOverlays.length}</dd>
              </div>
              <div>
                <dt>Provenance</dt>
                <dd>{fixture.provenanceEntryCount} entries</dd>
              </div>
            </dl>
          ) : null}
        </div>
        {fixture ? (
          <AtlasLab packedAtlas={fixture.packedAtlas} debugExport={fixture.debugExport} />
        ) : (
          <div className="atlas-fixture__loading" role={runState.error ? "alert" : "status"}>
            {runState.error ?? "Preparing atlas channels"}
          </div>
        )}
      </section>
      {fixture ? <AssemblyHall fixture={fixture} /> : null}
    </main>
  );
}

export default App;
