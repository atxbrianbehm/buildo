import type { ConstructionAwningFabricArtifact } from "../contracts/constructionAwningFabric";

export function ConstructionFamilyFabricControls({ buildingNumber, fabric, inherited, disabled, onApply, onReset }: {
  buildingNumber: number; fabric: ConstructionAwningFabricArtifact; inherited: boolean; disabled: boolean;
  onApply: (pattern: "solid" | "striped", primary: [number, number, number], secondary: [number, number, number]) => void;
  onReset: () => void;
}) {
  const hex = (value: [number, number, number]) => `#${value.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  return <section aria-label="Selected building fabric">
    <h4>Building {buildingNumber} awning fabric</h4>
    <p>{inherited ? "Using the original building's shared fabric." : "Using an individual fabric override."} Changes apply to this building's awnings and are saved with the family.</p>
    <fieldset disabled={disabled}>
      <form key={`${buildingNumber}:${fabric.contentHash}`} onSubmit={event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        const color = (name: string): [number, number, number] => { const value = String(fields.get(name)); return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number]; };
        onApply(fields.get("pattern") === "solid" ? "solid" : "striped", color("primary"), color("secondary"));
      }}>
        <label>Pattern <select aria-label="Family fabric pattern" name="pattern" defaultValue={fabric.source.pattern}><option value="striped">Striped</option><option value="solid">Solid</option></select></label>
        <label>Primary color <input aria-label="Family fabric primary color" name="primary" type="color" defaultValue={hex(fabric.source.primary)} /></label>
        <label>Stripe color <input aria-label="Family fabric stripe color" name="secondary" type="color" defaultValue={hex(fabric.source.secondary)} /></label>
        <button type="submit">Apply individual fabric</button>
      </form>
      <button type="button" disabled={inherited} onClick={onReset}>Use shared fabric</button>
    </fieldset>
    <p>Fabric changes are separate from construction undo.</p>
  </section>;
}
