import { useState } from "react";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";
import type { ConstructionAwningFabricArtifact } from "../contracts/constructionAwningFabric";

/** A single explicit front-bay scope; multiple bays can be authored one at a time. */
export function ConstructionAwningControls({ graph, disabled, unavailableReason, onChange, fabric, fabricDisabled, onFabricChange, supportDisabled, onSupportChange }: {
  graph: BayConstructionGraph; disabled: boolean; unavailableReason?: string; onChange: (bayIndex: number, enabled: boolean, dimensions?: { projectionM: number; dropM: number; valanceHeightM: number }) => void;
  fabric?: ConstructionAwningFabricArtifact; fabricDisabled?: boolean; supportDisabled?: boolean; onSupportChange?: (bayIndex: number, enabled: boolean) => void;
  onFabricChange?: (pattern: "solid" | "striped", primary: [number, number, number], secondary: [number, number, number]) => void;
}) {
  const [bayIndex, setBay] = useState(0);
  const count = graph.nodes.find(node => node.type === "SplitBays")?.parameters.count ?? 0;
  const selected = Math.min(bayIndex, Math.max(0, count - 1));
  const awning = graph.awnings?.find(item => item.bayIndex === selected);
  const present = Boolean(awning);
  if (!count) return null;
  return <section className="construction-grouped-bay" aria-label="Storefront awnings">
    <h3>Storefront awnings</h3>
    <p>Choose a front bay. The first awning starts with striped demo fabric; its source is saved separately.</p>
    {unavailableReason ? <p>{unavailableReason}</p> : null}
    <fieldset disabled={disabled}>
      <label>Bay <select aria-label="Awning bay" value={selected} onChange={event => setBay(Number(event.currentTarget.value))}>
        {Array.from({ length: count }, (_, index) => <option key={index} value={index}>Bay {index + 1}</option>)}
      </select></label>
      <button type="button" onClick={() => onChange(selected, !present)}>{present ? "Remove awning" : "Add awning"}</button>
      {awning && onSupportChange ? <div>
        <button type="button" disabled={supportDisabled} onClick={() => onSupportChange(selected, !graph.awningSupports?.some(item => item.bayIndex === selected))}>{graph.awningSupports?.some(item => item.bayIndex === selected) ? "Remove support rods" : "Add support rods"}</button>
        {supportDisabled ? <p>Support editing is unavailable in a family member.</p> : null}
      </div> : null}
      {awning ? <form key={`${selected}:${awning.projectionM}:${awning.dropM}:${awning.valanceHeightM}`} onSubmit={event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        onChange(selected, true, { projectionM: Number(fields.get("projection")), dropM: Number(fields.get("drop")), valanceHeightM: Number(fields.get("valance")) });
      }}>
        <label>Projection (m) <input aria-label="Awning projection" name="projection" type="number" min="0.4" max="2" step="any" required defaultValue={awning.projectionM} /></label>
        <label>Drop (m) <input aria-label="Awning drop" name="drop" type="number" min="0.15" max="1.2" step="any" required defaultValue={awning.dropM} /></label>
        <label>Valance height (m) <input aria-label="Awning valance height" name="valance" type="number" min="0.08" max="0.4" step="any" required defaultValue={awning.valanceHeightM} /></label>
        <button type="submit">Apply awning dimensions</button>
      </form> : null}
      {fabric && onFabricChange ? <div>
        <p>Fabric applies to all awnings in this building and its generated family. Fabric changes are separate from construction undo.</p>
        {fabricDisabled ? <p>To change shared fabric, return to the original building.</p> : null}
        <fieldset disabled={fabricDisabled}>
          <form key={fabric.contentHash} onSubmit={event => {
            event.preventDefault(); const fields = new FormData(event.currentTarget);
            const color = (name: string): [number, number, number] => { const value = String(fields.get(name)); return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number]; };
            onFabricChange(fields.get("pattern") === "solid" ? "solid" : "striped", color("primary"), color("secondary"));
          }}>
            <label>Fabric pattern <select aria-label="Awning fabric pattern" name="pattern" defaultValue={fabric.source.pattern}><option value="striped">Striped</option><option value="solid">Solid</option></select></label>
            <label>Primary color <input aria-label="Awning primary color" name="primary" type="color" defaultValue={`#${fabric.source.primary.map(value => value.toString(16).padStart(2, "0")).join("")}`} /></label>
            <label>Stripe color <input aria-label="Awning stripe color" name="secondary" type="color" defaultValue={`#${fabric.source.secondary.map(value => value.toString(16).padStart(2, "0")).join("")}`} /></label>
            <button type="submit">Apply awning fabric</button>
          </form>
        </fieldset>
      </div> : null}
      <p>{present ? "This bay has an awning." : "This bay has no awning."} The canopy is rigid; optional tension rods use illustrative dimensions.</p>
    </fieldset>
  </section>;
}
