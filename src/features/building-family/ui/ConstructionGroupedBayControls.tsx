import { useState } from "react";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";

export type GroupedBayEdit = { floorIndex: number; bayIndex: number; memberCount: 1 | 2 | 3; memberWidthM: string; pierWidthM: string };

/** Explicit scope and dimensions; edits commit through the same construction history. */
export function ConstructionGroupedBayControls({ graph, disabled, dirty, onDraftChange, onApply }: {
  graph: BayConstructionGraph; disabled: boolean; dirty: boolean; onDraftChange: (dirty: boolean) => void; onApply: (edit: GroupedBayEdit) => void;
}) {
  const [floorIndex, setFloor] = useState(1), [bayIndex, setBay] = useState(0);
  const floors = graph.nodes.find(node => node.type === "Storeys")?.parameters.count ?? 0;
  const bays = graph.nodes.find(node => node.type === "SplitBays")?.parameters.count ?? 0;
  const saved = graph.upperBayGroups?.find(group => group.storeysNodeId === "facade" && group.floorIndex === floorIndex && group.bayIndex === bayIndex);
  if (floors < 2 || bays < 1) return null;
  return <section className="construction-grouped-bay" aria-label="Grouped upper windows">
    <h3>Grouped upper windows</h3>
    <p>Choose one front bay. Each window has its own opening, with masonry between them.</p>
    <fieldset disabled={disabled}>
      <label>Storey <select aria-label="Grouped window storey" value={floorIndex} disabled={dirty} onChange={event => setFloor(Number(event.currentTarget.value))}>
        {Array.from({ length: floors - 1 }, (_, i) => <option key={i+1} value={i+1}>Storey {i+2}</option>)}
      </select></label>
      <label>Bay <select aria-label="Grouped window bay" value={bayIndex} disabled={dirty} onChange={event => setBay(Number(event.currentTarget.value))}>
        {Array.from({ length: bays }, (_, i) => <option key={i} value={i}>Bay {i+1}</option>)}
      </select></label>
      <ArrangementControls key={`${floorIndex}:${bayIndex}:${JSON.stringify(saved)}`} saved={saved} floorIndex={floorIndex} bayIndex={bayIndex}
        dirty={dirty} onDraftChange={onDraftChange} onApply={onApply} />
    </fieldset>
  </section>;
}

function ArrangementControls({ saved, floorIndex, bayIndex, dirty, onDraftChange, onApply }: {
  saved: NonNullable<BayConstructionGraph["upperBayGroups"]>[number] | undefined; floorIndex: number; bayIndex: number;
  dirty: boolean; onDraftChange: (dirty: boolean) => void; onApply: (edit: GroupedBayEdit) => void;
}) {
  const [memberCount, setCount] = useState<1 | 2 | 3>(saved?.memberCount ?? 1);
  const [memberWidthM, setWidth] = useState(String(saved?.memberWidthM ?? 0.6)), [pierWidthM, setPier] = useState(String(saved?.pierWidthM ?? 0.24));
  const reset = () => { setCount(saved?.memberCount ?? 1); setWidth(String(saved?.memberWidthM ?? 0.6)); setPier(String(saved?.pierWidthM ?? 0.24)); onDraftChange(false); };
  return <>
      <label>Arrangement <select aria-label="Grouped window arrangement" value={memberCount} onChange={event => { setCount(Number(event.currentTarget.value) as 1 | 2 | 3); onDraftChange(true); }}>
        <option value={1}>Single opening</option><option value={2}>Pair</option><option value={3}>Three openings</option>
      </select></label>
      {memberCount > 1 ? <><label>Window width (m) <input aria-label="Grouped window width" type="number" step="0.01" value={memberWidthM} onChange={event => { setWidth(event.currentTarget.value); onDraftChange(true); }} /></label>
        <label>Masonry between windows (m) <input aria-label="Grouped window pier width" type="number" step="0.01" value={pierWidthM} onChange={event => { setPier(event.currentTarget.value); onDraftChange(true); }} /></label></> : null}
      <p>Grouped windows currently use flat heads. Reset any selected-window width edit on this bay before grouping it. Keep edited assemblies or lock openings to retain groups when generating.</p>
      <button type="button" disabled={!dirty} onClick={() => onApply({ floorIndex, bayIndex, memberCount, memberWidthM, pierWidthM })}>Apply window arrangement</button>
      {dirty ? <button type="button" onClick={reset}>Discard window arrangement draft</button> : null}
  </>;
}
