import { useEffect, useRef, useState } from "react";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import type { PackedAtlas } from "../materials/atlasPacker";
import { emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";

const sourceNames: Record<string, string> = { "frame.primary": "Wood", "trim.horizontal.primary": "Stone", "wall.primary": "Masonry" };
export function ConstructionSurfacePanel({ graph, atlas, selectedPath, selectedNode, disabled, onChange }: {
  graph: BayConstructionGraph; atlas: PackedAtlas; selectedPath: string | null; selectedNode: string; disabled: boolean;
  onChange: (graph: BayConstructionGraph, nodeId: string) => void;
}) {
  const surface = graph.nodes.find(node => node.type === "SetSurface");
  const composition = surface?.composition ?? emptyConstructionComposition(graph.documentId);
  const details = useRef<HTMLDetailsElement>(null);
  const [sourceSlot, setSourceSlot] = useState("frame.primary"), [scope, setScope] = useState("selected"), [opacity, setOpacity] = useState(100);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (details.current && (selectedPath || selectedNode === surface?.id)) details.current.open = true; }, [selectedPath, selectedNode, surface?.id]);
  function update(next: BuildingSurfaceComposition) {
    try {
      const changed = setConstructionSurface(graph, { ...next, revision: composition.revision + 1 });
      onChange(changed, changed.nodes.find(node => node.type === "SetSurface")!.id); setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Finish instructions are invalid."); }
  }
  function add() {
    const slot = atlas.manifest.slots.find(slot => slot.id === sourceSlot);
    if (!slot || scope === "selected" && !selectedPath) return;
    const prefix = `building/${graph.documentId}/`;
    if (scope === "selected" && (!selectedPath?.startsWith(prefix) || !selectedPath.endsWith("/frame"))) { setError("Select a current construction frame first."); return; }
    const next = structuredClone(composition);
    let source = next.sources.find(source => source.slotId === slot.id && source.atlasContentHash === atlas.contentHash);
    const unique = (stem: string, ids: string[]) => { let id = stem, suffix = 1; while (ids.includes(id)) id = `${stem}_${suffix++}`; return id; };
    if (!source) { source = { id: unique(`source.${slot.id}`, next.sources.map(source => source.id)), atlasContentHash: atlas.contentHash, slotId: slot.id }; next.sources.push(source); }
    next.layers.push({ id: unique("finish", next.layers.map(layer => layer.id)), sourceId: source.id,
      target: scope === "selected" ? { kind: "element", relativePath: selectedPath!.slice(prefix.length), expectedRole: "frame" } : { kind: "role", role: "frame" },
      mask: { kind: "constant", value: 1 }, opacity: opacity / 100, blend: "replace", physicalSizeM: { ...slot.physicalSizeM }, channels: ["baseColor", "normal", "orm"] });
    update(next);
  }
  const selectionName = selectedPath?.match(/floor\/(\d+)\/bay\/(\d+)/);
  const describeTarget = (target: BuildingSurfaceComposition["layers"][number]["target"]) => target.kind === "element" ? (() => {
    const address = target.relativePath.match(/floor\/(\d+)\/bay\/(\d+)/);
    return address ? `Floor ${Number(address[1]) + 1}, window ${Number(address[2]) + 1}` : "Bay frame";
  })() : target.kind === "role" ? target.role === "frame" ? "All frames" : "All horizontal trim" : target.slotId;
  return <details className="construction-finishes" ref={details}>
    <summary>Surface finishes <span>{composition.layers.length} layers</span></summary>
    <p>{selectedPath ? selectionName ? `Selected: floor ${Number(selectionName[1]) + 1}, window ${Number(selectionName[2]) + 1}.` : "Selected: bay frame." : "Click a frame or its glass to select it."}</p>
    <fieldset disabled={disabled}>
      <legend>New finish layer</legend>
      <label>Source<select aria-label="Finish source" value={sourceSlot} onChange={event => setSourceSlot(event.currentTarget.value)}>
        {Object.entries(sourceNames).map(([id, label]) => <option key={id} value={id} disabled={!atlas.manifest.slots.some(slot => slot.id === id)}>{label}</option>)}
      </select></label>
      <label>Apply to<select aria-label="Finish target" value={scope} onChange={event => setScope(event.currentTarget.value)}><option value="selected">Selected frame</option><option value="all">All frames</option></select></label>
      <label>Strength <output>{opacity}%</output><input aria-label="New finish strength" type="range" min="0" max="100" value={opacity} onChange={event => setOpacity(Number(event.currentTarget.value))} /></label>
      <button type="button" disabled={scope === "selected" && !selectedPath} onClick={add}>Add finish layer</button>
      {!surface ? <button type="button" onClick={() => update(composition)}>Add empty finish node</button> : null}
    </fieldset>
    <p>Shared layers blend first, then local layers. Apply construction to preview or save changes.</p>
    {composition.layers.length ? <ol aria-label="Finish layers">{composition.layers.map((layer, index) => <li key={layer.id}>
      <strong>{sourceNames[composition.sources.find(source => source.id === layer.sourceId)?.slotId ?? ""] ?? layer.sourceId}</strong><span>{describeTarget(layer.target)}</span>
      <label>Strength <output>{Math.round(layer.opacity * 100)}%</output><input type="range" min="0" max="100" aria-label={`Strength of finish ${index + 1}`} value={layer.opacity * 100} disabled={disabled}
        onChange={event => update({ ...composition, layers: composition.layers.map(value => value.id === layer.id ? { ...value, opacity: Number(event.currentTarget.value) / 100 } : value) })} /></label>
      <div className="construction-finishes__actions">
        <button type="button" aria-label={`Move finish ${index + 1} up`} disabled={disabled || index === 0} onClick={() => { const layers = [...composition.layers]; [layers[index - 1], layers[index]] = [layers[index], layers[index - 1]]; update({ ...composition, layers }); }}>Up</button>
        <button type="button" aria-label={`Move finish ${index + 1} down`} disabled={disabled || index === composition.layers.length - 1} onClick={() => { const layers = [...composition.layers]; [layers[index + 1], layers[index]] = [layers[index], layers[index + 1]]; update({ ...composition, layers }); }}>Down</button>
        <button type="button" aria-label={`Remove finish ${index + 1}`} disabled={disabled} onClick={() => update({ ...composition, layers: composition.layers.filter(value => value.id !== layer.id) })}>Remove</button>
      </div>
    </li>)}</ol> : <p>No finish layers. The original painted surfaces are retained.</p>}
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
