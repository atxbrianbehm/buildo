import { useId, useState } from "react";
import type { constructionOpeningOptions } from "./constructionBuildingBindings";

export function ConstructionOpeningControls({options,selectedPath,disabled,buildingDirty,onSelect,onApply,onReset,onDraftChange}: {
  options: ReturnType<typeof constructionOpeningOptions>; selectedPath: string|null; disabled: boolean; buildingDirty: boolean;
  onSelect:(path:string)=>void; onApply:(text:string)=>void; onReset:()=>void; onDraftChange:(dirty:boolean)=>void;
}) {
  const selected = options.find(option=>option.path===selectedPath), prefix=useId();
  const original=selected?String(Number(selected.widthM.toPrecision(12))):"";
  const [text,setText]=useState(original);
  const dirty=Boolean(selected) && (!text.trim() || !Number.isFinite(Number(text)) || Number(text)!==selected?.widthM);
  return <section className="construction-grouped construction-opening-edit" aria-label="Selected window">
    <h3>Selected window</h3>
    <fieldset disabled={disabled}>
      <label className="construction-grouped__field construction-opening-edit__target"><span><strong>Window to edit</strong><small id={prefix+"target"}>Select an upper-front frame in the view, or choose one here.</small></span>
        <select aria-label="Window to edit" aria-describedby={prefix+"target"} value={selected?.path??""} onChange={event=>onSelect(event.currentTarget.value)}>
          <option value="">Choose a window</option>{options.map(option=><option key={option.path} value={option.path}>{option.label}</option>)}
        </select>
      </label>
      {selected ? <>
        <p className="construction-grouped__scope">1 window · {selected.label}. Other openings keep their widths.</p>
        <label className="construction-grouped__field"><span><strong>Selected width (m)</strong><small id={prefix+"width"}>Changes its wall opening, frame, glazing and sill together.</small></span>
          <input type="number" step="0.01" aria-label="Selected width (m)" aria-describedby={prefix+"width"} value={text}
            onChange={event=>{const value=event.currentTarget.value;setText(value);onDraftChange(!value.trim() || !Number.isFinite(Number(value)) || Number(value)!==selected.widthM);}} />
        </label>
        {dirty ? <p className="construction-grouped__draft">This width is not applied.</p> : <p>{selected.overridden?"Local width. Shared opening-width changes keep this width.":"Using the shared opening width."}</p>}
        <div className="construction-grouped__actions">
          <button type="button" disabled={!dirty} onClick={()=>onApply(text)}>Apply window width</button>
          {dirty ? <button type="button" onClick={()=>{setText(original);onDraftChange(false);}}>Revert width</button> : null}
          <button type="button" disabled={!selected.overridden} onClick={onReset}>Use shared width</button>
        </div>
      </> : <p>{selectedPath?"This frame is outside the upper-front regular-window scope.":"Local geometry starts with one selected window."}</p>}
    </fieldset>
    {buildingDirty?<p>Apply or revert the building changes before editing one window.</p>:null}
  </section>;
}
