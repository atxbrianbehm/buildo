import { useEffect, useState } from "react";
import { useStore } from "zustand";
import "./App.css";
import { AtlasLab } from "../features/building-family/ui/AtlasLab";
import { AssemblyHall } from "../features/building-family/ui/AssemblyHall";
import type { AssemblyHallFixture } from "../features/building-family/ui/assemblyHallFixture";
import { BuildingArtifactRegistry } from "../features/building-family/state/artifactRegistry";
import { BuildingRunController } from "../features/building-family/state/buildingRunController";
import {
  createBuildingStore,
  type BuildingPromptControlPatch,
  type BuildingPromptControls,
  type BuildingStoreApi
} from "../features/building-family/state/buildingStore";

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

function promptWithPatch(
  promptControls: BuildingPromptControls,
  patch: BuildingPromptControlPatch
): BuildingPromptControls {
  return {
    ...promptControls,
    ...patch,
    seeds: {
      ...promptControls.seeds,
      ...(patch.seeds ?? {})
    }
  };
}

function advanceSeed(seed: string): string {
  const match = /^(.*?)-(\d+)$/.exec(seed);
  if (!match) {
    return `${seed}-2`;
  }

  return `${match[1]}-${Number(match[2]) + 1}`;
}

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
  const promptControls = useStore(store, (state) => state.prompt);
  const controlState = useStore(store, (state) => state.controls);
  const updatePromptControls = useStore(store, (state) => state.updatePromptControls);
  const currentRun = runState.currentRun;
  const activeFixtureArtifactId = runState.activeFixtureArtifactId;
  const invalidation = controlState.invalidation;
  const runDisabled = runState.status === "running";
  const fixture = activeFixtureArtifactId
    ? registry.get<AssemblyHallFixture>(activeFixtureArtifactId) ?? null
    : null;

  useEffect(() => {
    void controller.startDemoRun().catch(() => undefined);

    return () => {
      controller.dispose();
    };
  }, [controller]);

  function startRun(nextPrompt: BuildingPromptControls): void {
    void controller.startDemoRun(nextPrompt).catch(() => undefined);
  }

  function updateAndRun(patch: BuildingPromptControlPatch): void {
    const nextPrompt = promptWithPatch(promptControls, patch);
    updatePromptControls(patch);
    startRun(nextPrompt);
  }

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
      <section className="control-panel" aria-labelledby="control-invalidation-heading">
        <div className="control-panel__inputs">
          <p className="project-label">Control Surface</p>
          <h2 id="control-invalidation-heading">Control Invalidation</h2>
          <div className="control-panel__fields" aria-label="Building controls">
            <label>
              <span>Floors</span>
              <input
                aria-label="Floors"
                min={1}
                type="number"
                value={promptControls.floorCount}
                onChange={(event) => updatePromptControls({ floorCount: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>Bays</span>
              <input
                aria-label="Bays"
                min={1}
                type="number"
                value={promptControls.bayCount}
                onChange={(event) => updatePromptControls({ bayCount: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>Building Seed</span>
              <input
                aria-label="Building Seed"
                value={promptControls.seeds.building}
                onChange={(event) => updatePromptControls({ seeds: { building: event.currentTarget.value } })}
              />
            </label>
          </div>
          <div className="control-panel__actions" aria-label="Committed run controls">
            <button type="button" disabled={runDisabled} onClick={() => startRun(promptControls)}>
              Run Current
            </button>
            <button
              type="button"
              disabled={runDisabled}
              onClick={() =>
                updateAndRun({
                  seeds: {
                    building: advanceSeed(promptControls.seeds.building)
                  }
                })
              }
            >
              New Building
            </button>
            <button
              type="button"
              disabled={runDisabled}
              onClick={() =>
                updateAndRun({
                  seeds: {
                    family: advanceSeed(promptControls.seeds.family),
                    building: "building-seed"
                  }
                })
              }
            >
              New Family
            </button>
          </div>
        </div>
        <div className="control-panel__preview" aria-label="Invalidation preview">
          <dl className="control-panel__metrics">
            <div>
              <dt>Changed</dt>
              <dd>{invalidation.changedControls.length ? invalidation.changedControls.join(", ") : "none"}</dd>
            </div>
            <div>
              <dt>Material sources</dt>
              <dd>{invalidation.reusableArtifacts.materialSources ? "Material sources reusable" : "Material sources regenerate"}</dd>
            </div>
            <div>
              <dt>Atlas</dt>
              <dd>{invalidation.reusableArtifacts.packedAtlas ? "atlas reusable" : "atlas refresh"}</dd>
            </div>
            <div>
              <dt>Catalog</dt>
              <dd>{invalidation.reusableArtifacts.componentCatalog ? "catalog reusable" : "catalog refresh"}</dd>
            </div>
          </dl>
          <ol className="control-panel__stages">
            {invalidation.invalidatedStages.length ? (
              invalidation.invalidatedStages.map((stage) => (
                <li key={stage}>
                  <span>{stage}</span>
                  <small>{invalidation.stageImpacts[stage]}</small>
                </li>
              ))
            ) : (
              <li>
                <span>none</span>
                <small>reusable</small>
              </li>
            )}
          </ol>
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
              {event.cacheHit === undefined ? null : (
                <em className={event.cacheHit ? "run-panel__cache-hit" : "run-panel__cache-miss"}>
                  {event.cacheHit ? "cache hit" : "cache miss"}
                </em>
              )}
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
