import { useEffect, useState } from "react";
import "./App.css";
import { AtlasLab } from "../features/building-family/ui/AtlasLab";
import { AssemblyHall } from "../features/building-family/ui/AssemblyHall";
import {
  createAssemblyHallFixture,
  type AssemblyHallFixture
} from "../features/building-family/ui/assemblyHallFixture";

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
  const [fixture, setFixture] = useState<AssemblyHallFixture | null>(null);
  const [fixtureError, setFixtureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeFixture: AssemblyHallFixture | null = null;

    createAssemblyHallFixture()
      .then((result) => {
        if (!cancelled) {
          activeFixture = result;
          setFixture(result);
        } else {
          result.familyRuntime.dispose();
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFixtureError(error instanceof Error ? error.message : "Assembly Hall fixture generation failed");
        }
      });

    return () => {
      cancelled = true;
      activeFixture?.familyRuntime.dispose();
    };
  }, []);

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
      <section className="atlas-fixture" aria-labelledby="atlas-fixture-heading">
        <div className="atlas-fixture__intro">
          <p className="project-label">Material Atlas</p>
          <h2 id="atlas-fixture-heading">Generated Fixture</h2>
          <p>
            {fixture
              ? fixture.prompt
              : fixtureError ?? "Generating deterministic atlas fixture..."}
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
          <div className="atlas-fixture__loading" role={fixtureError ? "alert" : "status"}>
            {fixtureError ?? "Preparing atlas channels"}
          </div>
        )}
      </section>
      {fixture ? <AssemblyHall fixture={fixture} /> : null}
    </main>
  );
}

export default App;
