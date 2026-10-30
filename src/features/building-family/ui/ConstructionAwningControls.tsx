import { useState } from "react";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** A single explicit front-bay scope; multiple bays can be authored one at a time. */
export function ConstructionAwningControls({ graph, disabled, unavailableReason, onChange }: {
  graph: BayConstructionGraph; disabled: boolean; unavailableReason?: string; onChange: (bayIndex: number, enabled: boolean, dimensions?: { projectionM: number; dropM: number; valanceHeightM: number }) => void;
}) {
  const [bayIndex, setBay] = useState(0);
  const count = graph.nodes.find(node => node.type === "SplitBays")?.parameters.count ?? 0;
  const selected = Math.min(bayIndex, Math.max(0, count - 1));
  const awning = graph.awnings?.find(item => item.bayIndex === selected);
  const present = Boolean(awning);
  if (!count) return null;
  return <section className="construction-grouped-bay" aria-label="Storefront awnings">
    <h3>Storefront awnings</h3>
    <p>Choose a front bay. The first awning uses a striped demo fabric; its source is retained for undo and saving.</p>
    {unavailableReason ? <p>{unavailableReason}</p> : null}
    <fieldset disabled={disabled}>
      <label>Bay <select aria-label="Awning bay" value={selected} onChange={event => setBay(Number(event.currentTarget.value))}>
        {Array.from({ length: count }, (_, index) => <option key={index} value={index}>Bay {index + 1}</option>)}
      </select></label>
      <button type="button" onClick={() => onChange(selected, !present)}>{present ? "Remove awning" : "Add awning"}</button>
      {awning ? <form key={`${selected}:${awning.projectionM}:${awning.dropM}:${awning.valanceHeightM}`} onSubmit={event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        onChange(selected, true, { projectionM: Number(fields.get("projection")), dropM: Number(fields.get("drop")), valanceHeightM: Number(fields.get("valance")) });
      }}>
        <label>Projection (m) <input aria-label="Awning projection" name="projection" type="number" min="0.4" max="2" step="any" required defaultValue={awning.projectionM} /></label>
        <label>Drop (m) <input aria-label="Awning drop" name="drop" type="number" min="0.15" max="1.2" step="any" required defaultValue={awning.dropM} /></label>
        <label>Valance height (m) <input aria-label="Awning valance height" name="valance" type="number" min="0.08" max="0.4" step="any" required defaultValue={awning.valanceHeightM} /></label>
        <button type="submit">Apply awning dimensions</button>
      </form> : null}
      <p>{present ? "This bay has an awning." : "This bay has no awning."} The current treatment has a rigid canopy and no support arms.</p>
    </fieldset>
  </section>;
}
