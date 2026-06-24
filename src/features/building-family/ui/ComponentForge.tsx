import { useId, useMemo, useState } from "react";
import type { ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { AtlasSlot } from "../contracts/atlasManifest";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { AssemblyHallFixture } from "./assemblyHallFixture";

export interface ComponentForgeProps {
  fixture: AssemblyHallFixture;
}

function formatMeters(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function rectLabel(slot: AtlasSlot): string {
  const rect = slot.rectPx;
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function recipeForEntry(entry: ComponentGalleryEntry | undefined, recipes: ComponentRecipe[]): ComponentRecipe | undefined {
  return entry ? recipes.find((recipe) => recipe.id === entry.recipeId) : undefined;
}

function atlasSlotsForEntry(entry: ComponentGalleryEntry | undefined, slots: AtlasSlot[]): AtlasSlot[] {
  if (!entry) {
    return [];
  }

  const selectedSlotIds = new Set(entry.atlasSlotIds);
  return slots.filter((slot) => selectedSlotIds.has(slot.id));
}

export function ComponentForge({ fixture }: ComponentForgeProps) {
  const selectorId = useId();
  const [selectedEntryId, setSelectedEntryId] = useState(fixture.componentGallery.entries[0]?.id ?? "");
  const [showWireframe, setShowWireframe] = useState(false);
  const [showUvOverlay, setShowUvOverlay] = useState(false);
  const [showSemanticAnchors, setShowSemanticAnchors] = useState(false);
  const selectedEntry =
    fixture.componentGallery.entries.find((entry) => entry.id === selectedEntryId) ?? fixture.componentGallery.entries[0];
  const selectedRecipe = useMemo(
    () => recipeForEntry(selectedEntry, fixture.catalog.recipes),
    [fixture.catalog.recipes, selectedEntry]
  );
  const selectedAtlasSlots = useMemo(
    () => atlasSlotsForEntry(selectedEntry, fixture.packedAtlas.manifest.slots),
    [fixture.packedAtlas.manifest.slots, selectedEntry]
  );
  const recipeJson = selectedRecipe ? JSON.stringify(selectedRecipe, null, 2) : "{}";

  return (
    <section className="component-forge" aria-labelledby="component-forge-heading">
      <div className="component-forge__header">
        <div>
          <p className="project-label">Component Forge</p>
          <h2 id="component-forge-heading">Component Forge</h2>
        </div>

        <div className="component-forge__controls" aria-label="Component Forge controls">
          <label className="component-forge__selector" htmlFor={selectorId}>
            <span>Component selector</span>
            <select
              id={selectorId}
              aria-label="Component selector"
              value={selectedEntry?.id ?? ""}
              onChange={(event) => setSelectedEntryId(event.target.value)}
            >
              {fixture.componentGallery.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} / {entry.source}
                </option>
              ))}
            </select>
          </label>

          <div className="component-forge__toggles" aria-label="Component preview modes">
            <label>
              <input
                checked={showWireframe}
                type="checkbox"
                onChange={(event) => setShowWireframe(event.currentTarget.checked)}
              />
              <span>Wireframe</span>
            </label>
            <label>
              <input
                checked={showUvOverlay}
                type="checkbox"
                onChange={(event) => setShowUvOverlay(event.currentTarget.checked)}
              />
              <span>UV Overlay</span>
            </label>
            <label>
              <input
                checked={showSemanticAnchors}
                type="checkbox"
                onChange={(event) => setShowSemanticAnchors(event.currentTarget.checked)}
              />
              <span>Semantic Anchors</span>
            </label>
          </div>
        </div>
      </div>

      <div className="component-forge__grid" aria-label="Generated component grid">
        {fixture.componentGallery.entries.map((entry) => (
          <button
            className="component-forge__tile"
            data-selected={entry.id === selectedEntry?.id ? "true" : "false"}
            key={entry.id}
            type="button"
            onClick={() => setSelectedEntryId(entry.id)}
          >
            <span>{entry.label}</span>
            <small>
              {entry.stage} / {entry.source}
            </small>
            <em>{formatCount(entry.metrics.elementCount || entry.metrics.instanceCount)} elements</em>
          </button>
        ))}
      </div>

      {selectedEntry && selectedRecipe ? (
        <div className="component-forge__detail">
          <section className="component-forge__recipe" aria-label="Selected component recipe">
            <div className="component-forge__recipe-heading">
              <h3>{selectedEntry.label}</h3>
              <span>{selectedEntry.source}</span>
            </div>
            <dl className="component-forge__definition">
              <div>
                <dt>Recipe</dt>
                <dd>{selectedRecipe.id}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{selectedRecipe.kind}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{selectedRecipe.role}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{selectedEntry.stage}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {formatMeters(selectedEntry.dimensionsM.width)} x {formatMeters(selectedEntry.dimensionsM.height)} x{" "}
                  {formatMeters(selectedEntry.dimensionsM.depth)} m
                </dd>
              </div>
              <div>
                <dt>Batch</dt>
                <dd>{selectedEntry.batchId ?? "recipe only"}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>
                  {showWireframe ? "Wireframe on" : "Wireframe off"} /{" "}
                  {showUvOverlay ? "UV overlay on" : "UV overlay off"} /{" "}
                  {showSemanticAnchors ? "Semantic anchors on" : "Semantic anchors off"}
                </dd>
              </div>
            </dl>
          </section>

          <table className="component-forge__atlas-slots" aria-label="Selected atlas slots">
            <caption>Atlas Slots</caption>
            <thead>
              <tr>
                <th scope="col">Slot</th>
                <th scope="col">Role</th>
                <th scope="col">UV</th>
                <th scope="col">Rect</th>
                <th scope="col">Prompt</th>
              </tr>
            </thead>
            <tbody>
              {selectedAtlasSlots.map((slot) => (
                <tr key={slot.id} data-highlighted="true">
                  <td>{slot.id}</td>
                  <td>{slot.role}</td>
                  <td>{slot.uvMode}</td>
                  <td>{rectLabel(slot)}</td>
                  <td>{slot.generationPrompt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="component-forge__anchors" aria-label="Selected semantic anchors">
            <h3>Semantic Anchors</h3>
            <ol>
              {selectedRecipe.anchors.map((anchor) => (
                <li key={anchor.id}>
                  <span>{anchor.id}</span>
                  <small>{anchor.position.map((value) => formatMeters(value)).join(", ")}</small>
                </li>
              ))}
            </ol>
          </section>

          <pre className="component-forge__json" aria-label="Selected component recipe JSON">
            {recipeJson}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
