import { useState } from "react";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** A single explicit front-bay scope; multiple bays can be authored one at a time. */
export function ConstructionAwningControls({ graph, disabled, unavailableReason, onChange }: {
  graph: BayConstructionGraph; disabled: boolean; unavailableReason?: string; onChange: (bayIndex: number, enabled: boolean) => void;
}) {
  const [bayIndex, setBay] = useState(0);
  const count = graph.nodes.find(node => node.type === "SplitBays")?.parameters.count ?? 0;
  const selected = Math.min(bayIndex, Math.max(0, count - 1));
  const present = graph.awnings?.some(awning => awning.bayIndex === selected) ?? false;
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
      <p>{present ? "This bay has an awning." : "This bay has no awning."} The current treatment has a rigid canopy and no support arms.</p>
    </fieldset>
  </section>;
}
