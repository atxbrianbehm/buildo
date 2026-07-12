import type { ArtKitFacadePlanSummary } from "../art-kit";
import { emptyArtKitFacadePlanSummary } from "../art-kit";
import type { GenerationRun, GenerationRunEvent } from "../contracts/generationRun";
import type { BuildingArtifactMetadata } from "../state/artifactRegistry";
import type { BuildingArtifactSliceState } from "../state/buildingStore";

export interface ArtifactTracePanelProps {
  activeArtifactId?: string;
  artifacts: BuildingArtifactSliceState;
  run: GenerationRun | null;
  artKitFacadePlan?: ArtKitFacadePlanSummary;
}

function artifactRows(artifacts: BuildingArtifactSliceState): BuildingArtifactMetadata[] {
  return Object.values(artifacts.byId).sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function eventRows(run: GenerationRun | null): GenerationRunEvent[] {
  return run?.events.filter((event) => event.outputArtifactId) ?? [];
}

function formatDuration(event: GenerationRunEvent): string {
  if (event.endedAtMs === undefined) {
    return "pending";
  }

  return `${Math.max(0, event.endedAtMs - event.startedAtMs)} ms`;
}

function cacheLabel(event: GenerationRunEvent): string {
  if (event.cacheHit === undefined) {
    return "recorded";
  }

  return event.cacheHit ? "cache hit" : "cache miss";
}

function shortHash(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 18)}...`;
}

function dependencyLabel(dependencies: string[]): string {
  return dependencies.length ? dependencies.join(", ") : "none";
}

function facadeCountLabel(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([facade, count]) => `${facade}:${count}`).join(" · ");
}

export function ArtifactTracePanel({
  activeArtifactId,
  artifacts,
  run,
  artKitFacadePlan
}: ArtifactTracePanelProps) {
  const rows = artifactRows(artifacts);
  const events = eventRows(run);
  const activeArtifact = activeArtifactId ? artifacts.byId[activeArtifactId] : undefined;
  const plan = artKitFacadePlan ?? emptyArtKitFacadePlanSummary();

  return (
    <section className="artifact-trace" aria-labelledby="artifact-trace-heading">
      <div className="artifact-trace__header">
        <div>
          <p className="project-label">Provenance</p>
          <h2 id="artifact-trace-heading">Artifact Trace</h2>
        </div>
        <dl className="artifact-trace__summary" aria-label="Artifact trace summary">
          <div>
            <dt>Run</dt>
            <dd>{run?.runId ?? "pending"}</dd>
          </div>
          <div>
            <dt>Artifacts</dt>
            <dd>{rows.length}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{activeArtifactId ?? "pending"}</dd>
          </div>
        </dl>
      </div>

      <section className="artifact-trace__art-kit" aria-labelledby="art-kit-facade-plan-heading">
        <h3 id="art-kit-facade-plan-heading">Art-Kit Facade Plan</h3>
        <dl className="artifact-trace__summary" aria-label="Art-kit facade plan summary">
          <div>
            <dt>Manifest</dt>
            <dd>{plan.present ? (plan.artKitManifestId ?? "unknown") : "not present"}</dd>
          </div>
          <div>
            <dt>Planner</dt>
            <dd>{plan.plannerId ?? "—"}</dd>
          </div>
          <div>
            <dt>Cells</dt>
            <dd>{plan.cellCount}</dd>
          </div>
          <div>
            <dt>Placements</dt>
            <dd>{plan.placementCount}</dd>
          </div>
          <div>
            <dt>By facade</dt>
            <dd>{facadeCountLabel(plan.placementsByFacade)}</dd>
          </div>
          <div>
            <dt>Diagnostics</dt>
            <dd>{plan.diagnostics.length}</dd>
          </div>
        </dl>

        {plan.diagnostics.length > 0 ? (
          <ul aria-label="Art-kit facade plan diagnostics">
            {plan.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <strong>{diagnostic.severity}</strong> {diagnostic.code}: {diagnostic.message}
              </li>
            ))}
          </ul>
        ) : (
          <p aria-label="Art-kit facade plan diagnostics">No art-kit plan diagnostics.</p>
        )}
      </section>

      <div className="artifact-trace__tables">
        <div className="artifact-trace__table-scroll">
          <table className="artifact-trace__events" aria-label="Run event artifact trace">
            <caption>Run Event Artifacts</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Artifact</th>
                <th scope="col">Cache</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={`${event.stage}-${index}`}>
                  <td>{event.stage}</td>
                  <td>{event.outputArtifactId}</td>
                  <td>{cacheLabel(event)}</td>
                  <td>{formatDuration(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="artifact-trace__table-scroll">
          <table className="artifact-trace__registered" aria-label="Registered artifacts">
            <caption>Registered Artifacts</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Artifact</th>
                <th scope="col">Content</th>
                <th scope="col">Dependencies</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((artifact) => (
                <tr data-active={artifact.artifactId === activeArtifactId ? "true" : "false"} key={artifact.artifactId}>
                  <td>{artifact.artifactType}</td>
                  <td>{artifact.artifactId}</td>
                  <td>{shortHash(artifact.contentHash)}</td>
                  <td>{dependencyLabel(artifact.dependencies)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <dl className="artifact-trace__active" aria-label="Active artifact provenance">
        <div>
          <dt>Type</dt>
          <dd>{activeArtifact?.artifactType ?? "pending"}</dd>
        </div>
        <div>
          <dt>Request</dt>
          <dd>{activeArtifact ? shortHash(activeArtifact.requestHash) : "pending"}</dd>
        </div>
        <div>
          <dt>Content</dt>
          <dd>{activeArtifact ? shortHash(activeArtifact.contentHash) : "pending"}</dd>
        </div>
        <div>
          <dt>Dependencies</dt>
          <dd>{activeArtifact ? dependencyLabel(activeArtifact.dependencies) : "pending"}</dd>
        </div>
      </dl>
    </section>
  );
}
