import { useId, useMemo, useState } from "react";
import {
  late19cApartmentKit,
  resolveArtKitMaterialSet,
  summarizeArtKitFacadePlanFromGraph,
  type ArtKitModule
} from "../art-kit";
import type { AssemblyHallFixture } from "./assemblyHallFixture";

export type ArtKitPresentationMode = "clay" | "wireframe" | "textured";

export interface ArtKitLabProps {
  fixture?: AssemblyHallFixture | null;
}

function formatMeters(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value);
}

function materialLabelForModule(module: ArtKitModule): string {
  return Object.entries(module.materialRoles)
    .map(([role, materialId]) => `${role}: ${materialId}`)
    .join(", ");
}

function ModulePreview({
  module,
  presentationMode
}: {
  module: ArtKitModule;
  presentationMode: ArtKitPresentationMode;
}) {
  const { width, height, depth } = module.boundsMeters;
  const scale = 80 / Math.max(width, height, depth, 0.1);
  const w = Math.max(8, width * scale);
  const h = Math.max(8, height * scale);
  const d = Math.max(4, depth * scale);
  const fill =
    presentationMode === "clay"
      ? "#c8c2b4"
      : presentationMode === "textured"
        ? module.kind.includes("opening") || module.kind === "door"
          ? "#6f93a0"
          : module.kind.includes("roof") || module.kind === "parapet"
            ? "#4d4a47"
            : "#a2573f"
        : "none";
  const stroke = presentationMode === "wireframe" ? "#2f3430" : "#1f2420";
  const strokeWidth = presentationMode === "wireframe" ? 1.6 : 1;

  return (
    <svg
      aria-label={`Module preview ${module.id} (${presentationMode})`}
      className="art-kit-lab__preview"
      role="img"
      viewBox="0 0 120 100"
    >
      <rect className="art-kit-lab__preview-bg" height="100" rx="8" width="120" x="0" y="0" />
      <g transform={`translate(${60 - w / 2 - d * 0.25}, ${55 - h / 2 + d * 0.15})`}>
        <rect
          fill={fill}
          height={h}
          stroke={stroke}
          strokeWidth={strokeWidth}
          width={w}
          x={0}
          y={0}
        />
        <path
          d={`M ${w} 0 L ${w + d * 0.45} ${-d * 0.35} L ${w + d * 0.45} ${h - d * 0.35} L ${w} ${h} Z`}
          fill={presentationMode === "wireframe" ? "none" : fill}
          opacity={presentationMode === "textured" ? 0.75 : 0.9}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d={`M 0 0 L ${d * 0.45} ${-d * 0.35} L ${w + d * 0.45} ${-d * 0.35} L ${w} 0 Z`}
          fill={presentationMode === "wireframe" ? "none" : fill}
          opacity={presentationMode === "textured" ? 0.55 : 0.7}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
      {presentationMode === "textured" ? (
        <text className="art-kit-lab__preview-caption" textAnchor="middle" x="60" y="94">
          {module.kind}
        </text>
      ) : null}
    </svg>
  );
}

export function ArtKitLab({ fixture = null }: ArtKitLabProps) {
  const presentationId = useId();
  const moduleFilterId = useId();
  const [presentationMode, setPresentationMode] = useState<ArtKitPresentationMode>("clay");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const materialSet = useMemo(() => resolveArtKitMaterialSet(late19cApartmentKit), []);
  const planSummary = useMemo(
    () => (fixture ? summarizeArtKitFacadePlanFromGraph(fixture.graph) : null),
    [fixture]
  );
  const kinds = useMemo(
    () => Array.from(new Set(late19cApartmentKit.modules.map((module) => module.kind))).sort(),
    []
  );
  const modules = useMemo(
    () =>
      late19cApartmentKit.modules.filter((module) => kindFilter === "all" || module.kind === kindFilter),
    [kindFilter]
  );

  return (
    <section className="art-kit-lab" aria-labelledby="art-kit-lab-heading">
      <div className="art-kit-lab__header">
        <div>
          <p className="project-label">Art Kit Lab</p>
          <h2 id="art-kit-lab-heading">{late19cApartmentKit.label}</h2>
        </div>
        <dl className="art-kit-lab__summary" aria-label="Art kit summary">
          <div>
            <dt>Manifest</dt>
            <dd>{late19cApartmentKit.id}</dd>
          </div>
          <div>
            <dt>Modules</dt>
            <dd>{late19cApartmentKit.modules.length}</dd>
          </div>
          <div>
            <dt>Materials</dt>
            <dd>{late19cApartmentKit.materials.length}</dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{late19cApartmentKit.unitMeters} m</dd>
          </div>
          <div>
            <dt>Live fidelity</dt>
            <dd>{fixture?.fidelityMode ?? "no fixture"}</dd>
          </div>
          <div>
            <dt>Quality</dt>
            <dd>
              {late19cApartmentKit.quality.target} / {late19cApartmentKit.quality.status}
            </dd>
          </div>
        </dl>
      </div>

      <div className="art-kit-lab__controls" aria-label="Art kit lab controls">
        <label htmlFor={presentationId}>
          <span>Presentation mode</span>
          <select
            id={presentationId}
            aria-label="Art kit presentation mode"
            value={presentationMode}
            onChange={(event) => setPresentationMode(event.currentTarget.value as ArtKitPresentationMode)}
          >
            <option value="clay">Clay</option>
            <option value="wireframe">Wireframe</option>
            <option value="textured">Textured</option>
          </select>
        </label>
        <label htmlFor={moduleFilterId}>
          <span>Module kind</span>
          <select
            id={moduleFilterId}
            aria-label="Art kit module kind filter"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.currentTarget.value)}
          >
            <option value="all">All kinds</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="art-kit-lab__section" aria-labelledby="art-kit-modules-heading">
        <h3 id="art-kit-modules-heading">Module catalog</h3>
        <div className="art-kit-lab__module-grid" aria-label="Art kit module catalog">
          {modules.map((module) => (
            <article
              aria-label={`Art kit module ${module.id}`}
              className="art-kit-lab__module-card"
              key={module.id}
              data-presentation={presentationMode}
            >
              <ModulePreview module={module} presentationMode={presentationMode} />
              <div className="art-kit-lab__module-body">
                <h4>{module.id}</h4>
                <dl>
                  <div>
                    <dt>Kind</dt>
                    <dd>{module.kind}</dd>
                  </div>
                  <div>
                    <dt>Bounds (m)</dt>
                    <dd>
                      {formatMeters(module.boundsMeters.width)} × {formatMeters(module.boundsMeters.height)} ×{" "}
                      {formatMeters(module.boundsMeters.depth)}
                    </dd>
                  </div>
                  <div>
                    <dt>Zones</dt>
                    <dd>{module.facadeZones.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Materials</dt>
                    <dd>{materialLabelForModule(module)}</dd>
                  </div>
                  <div>
                    <dt>Recipe</dt>
                    <dd>
                      {module.recipe.kind} / {module.recipe.id}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="art-kit-lab__section" aria-labelledby="art-kit-materials-heading">
        <h3 id="art-kit-materials-heading">Material roles</h3>
        <div className="art-kit-lab__table-scroll">
          <table className="art-kit-lab__table" aria-label="Art kit material roles">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Label</th>
                <th scope="col">m/tile</th>
                <th scope="col">Atlas slot</th>
                <th scope="col">Procedural source</th>
                <th scope="col">Channels</th>
                <th scope="col">glTF alpha</th>
              </tr>
            </thead>
            <tbody>
              {materialSet.bindings.map((binding) => (
                <tr key={binding.materialRoleId}>
                  <td>{binding.materialRoleId}</td>
                  <td>{binding.label}</td>
                  <td>{formatMeters(binding.metersPerTile)}</td>
                  <td>{binding.atlasSlotId}</td>
                  <td>{binding.proceduralSource}</td>
                  <td>{binding.channels.join(", ")}</td>
                  <td>{binding.gltfHints.alphaMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="art-kit-lab__section" aria-labelledby="art-kit-quality-heading">
        <h3 id="art-kit-quality-heading">Quality report</h3>
        <dl className="art-kit-lab__quality" aria-label="Art kit quality report">
          <div>
            <dt>Module count</dt>
            <dd>{late19cApartmentKit.modules.length}</dd>
          </div>
          <div>
            <dt>Material roles</dt>
            <dd>{materialSet.bindings.length}</dd>
          </div>
          <div>
            <dt>Material diagnostics</dt>
            <dd>{materialSet.diagnostics.length}</dd>
          </div>
          <div>
            <dt>Live plan placements</dt>
            <dd>{planSummary?.present ? planSummary.placementCount : "n/a"}</dd>
          </div>
          <div>
            <dt>Live plan diagnostics</dt>
            <dd>{planSummary?.present ? planSummary.diagnostics.length : "n/a"}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{late19cApartmentKit.quality.target}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{late19cApartmentKit.quality.status}</dd>
          </div>
        </dl>
        {late19cApartmentKit.quality.notes.length > 0 ? (
          <ul aria-label="Art kit quality notes">
            {late19cApartmentKit.quality.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        {materialSet.diagnostics.length > 0 ? (
          <ul aria-label="Art kit material diagnostics">
            {materialSet.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <strong>{diagnostic.severity}</strong> {diagnostic.code}: {diagnostic.message}
              </li>
            ))}
          </ul>
        ) : (
          <p aria-label="Art kit material diagnostics">No material-set diagnostics.</p>
        )}
      </section>
    </section>
  );
}
