import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { groupedStorefrontCount } from "../ui/constructionBuildingBindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConstructionBuildingControls } from "../ui/ConstructionBuildingControls";
import { supportsGroupedConstruction, groupedWindowCount } from "../ui/constructionBuildingBindings";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
afterEach(cleanup);
function mount(graph = createBuildingConstructionGraph(), dirty = false, counts = { window: 47, storefront: 0 }) {
  const fields = Object.fromEntries(graph.nodes.filter(node => "parameters" in node).map(node => [node.id,Object.fromEntries(Object.entries(node.parameters).map(([key,value]) => [key,String(value)]))]));
  const onFieldChange=vi.fn(),onApply=vi.fn(),onRevert=vi.fn(),onAdvanced=vi.fn();
  const view=render(<ConstructionBuildingControls graph={graph} fields={fields} windowCount={counts.window} storefrontCount={counts.storefront} disabled={false} dirty={dirty} onFieldChange={onFieldChange} onApply={onApply} onRevert={onRevert} onAdvanced={onAdvanced}/>);
  return {...view,fields,onFieldChange,onApply,onRevert,onAdvanced};
}
it("reports real generated window frames, excludes the entrance and follows scope filtering",async()=>{
  const graph=createBuildingConstructionGraph();expect(groupedWindowCount(graph,(await evaluateConstruction(graph)).ir)).toBe(47);
  graph.nodes.find(node=>node.type==="SelectScopes")!.parameters.floorIndex=1;
  graph.nodes.find(node=>node.type==="SelectScopes")!.parameters.bayIndex=1;
  expect(groupedWindowCount(graph,(await evaluateConstruction(graph)).ir)).toBe(4);
});
it("keeps shared controls explicit and forwards owned draft text without mutating graph parameters",()=>{
  const graph=createBuildingConstructionGraph(),before=structuredClone(graph),view=mount(graph);
  expect(screen.getByText("Applies to all 47 generated windows.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Scope input")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Local geometry editing unavailable")).toHaveTextContent("not implemented");
  fireEvent.change(screen.getByLabelText("Recess (m)"),{target:{value:""}});expect(view.onFieldChange).toHaveBeenCalledWith("window","recessM","");
  fireEvent.click(screen.getByRole("button",{name:"Apply construction"}));expect(view.onApply).toHaveBeenCalledOnce();expect(graph).toEqual(before);
});
it("exposes architectural groups with actual node-field bindings and one active form action",()=>{
  const view=mount();fireEvent.click(screen.getByText("Shape",{selector:"summary"}));
  expect(screen.queryByLabelText("Recess (m)")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Depth (m)"),{target:{value:"13"}});expect(view.onFieldChange).toHaveBeenCalledWith("footprint","depthM","13");
  fireEvent.click(screen.getByText("Storeys",{selector:"summary"}));fireEvent.change(screen.getByLabelText("Floor count"),{target:{value:"4"}});expect(view.onFieldChange).toHaveBeenCalledWith("facade","count","4");
  fireEvent.click(screen.getByText("Roof & trim",{selector:"summary"}));fireEvent.change(screen.getByLabelText("Cornice projection (m)"),{target:{value:"0.3"}});expect(view.onFieldChange).toHaveBeenCalledWith("roof","corniceProjectionM","0.3");
  expect(screen.getAllByRole("button",{name:"Apply construction"})).toHaveLength(1);
});
it("preserves explicit custom topology instead of binding controls to guessed nodes",()=>{
  const graph=createBuildingConstructionGraph();graph.nodes.push({id:"extra",type:"SplitFloors",input:{nodeId:"facade",socket:"scope"},parameters:{count:3}});
  expect(supportsGroupedConstruction(graph)).toBe(false);const view=mount(graph);expect(screen.queryByLabelText("Recess (m)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Edit custom construction"}));expect(view.onAdvanced).toHaveBeenCalledOnce();
});
it("accepts parameter and finish edits but rejects rewired canonical node IDs",()=>{
  const graph=createBuildingConstructionGraph();graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.recessM=.25;graph.nodes.find(node=>node.type==="SetSurface")!.composition.revision++;
  expect(supportsGroupedConstruction(graph)).toBe(true);graph.nodes.find(node=>node.type==="AssembleWindow")!.input.nodeId="bays";expect(supportsGroupedConstruction(graph)).toBe(false);
});
it("does not offer edits to a bypassed assembly as visible geometry changes",()=>{
  const graph=createBuildingConstructionGraph();graph.nodes.find(node=>node.type==="AssembleWindow")!.bypassed=true;mount(graph);
  expect(screen.getByLabelText("Recess (m)")).toBeDisabled();expect(screen.getAllByText(/bypassed in the advanced graph/).length).toBe(3);
});

it("offers named real assembly choices while preserving shared and bypass boundaries",()=>{
  const graph=createBuildingConstructionGraph(),before=structuredClone(graph),view=mount(graph);
  expect(screen.getByRole("combobox",{name:"Window assembly"})).toHaveValue("0");
  fireEvent.change(screen.getByRole("combobox",{name:"Window assembly"}),{target:{value:"2"}});
  expect(view.onFieldChange).toHaveBeenCalledWith("window","layout","2");expect(graph).toEqual(before);
  expect(screen.getByRole("option",{name:"Twin casement"})).toBeInTheDocument();expect(screen.getByRole("option",{name:"Six-light casement"})).toBeInTheDocument();
});

it("separates regular windows from the four real front-ground bays and binds artist-friendly entrance choices", async () => {
  const graph = withConstructionStorefront(createBuildingConstructionGraph(), 1), result = await evaluateConstruction(graph);
  const counts = { window: groupedWindowCount(graph, result.ir), storefront: groupedStorefrontCount(graph, result.ir) };
  expect(counts).toEqual({ window: 44, storefront: 4 }); expect(supportsGroupedConstruction(graph)).toBe(true);
  const view = mount(graph, false, counts);
  expect(screen.getByText("Applies to 44 regular windows. Display glazing is controlled under Ground floor.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Ground floor", { selector: "summary" }));
  expect(screen.getByRole("combobox", { name: "Ground frontage" })).toHaveValue("1");
  expect(screen.getByText("Applies to 4 front ground-floor bays, including the entrance.")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Bay 2" })).toHaveValue("1");
  fireEvent.change(screen.getByRole("combobox", { name: "Entrance bay" }), { target: { value: "2" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("entrance", "bayIndex", "2");
  fireEvent.change(screen.getByLabelText("Bulkhead height (m)"), { target: { value: "0.65" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("frontage", "bulkheadHeightM", "0.65");
  fireEvent.change(screen.getByRole("combobox", { name: "Ground frontage" }), { target: { value: "0" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("frontage", "mode", "0");
});
