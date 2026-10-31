import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { groupedStorefrontCount } from "../ui/constructionBuildingBindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConstructionBuildingControls } from "../ui/ConstructionBuildingControls";
import { supportsGroupedConstruction, groupedWindowCount } from "../ui/constructionBuildingBindings";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
afterEach(cleanup);

it("offers glazing divisions without unlocking unrelated controls on a signed pier building", () => {
  const storefront = withConstructionStorefront(createBuildingConstructionGraph(), 1);
  const graph = withConstructionStorefrontSign(withConstructionFacadePiers(storefront, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 }), { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 });
  const view = mount(graph);
  fireEvent.click(screen.getByText("Ground floor", { selector: "summary" }));
  expect(screen.getByRole("combobox", { name: "Ground frontage" })).toBeDisabled();
  const display = screen.getByRole("combobox", { name: "Display lights" }), transom = screen.getByRole("combobox", { name: "Transom lights" });
  expect(display).toBeEnabled(); expect(transom).toBeEnabled();
  fireEvent.change(display, { target: { value: "2" } }); fireEvent.change(transom, { target: { value: "3" } });
  expect(view.onStorefrontDivisionChange).toHaveBeenCalledWith("displayLights", 2);
  expect(view.onStorefrontDivisionChange).toHaveBeenCalledWith("transomLights", 3);
});

it("offers the front parapet choice while preserving the grouped graph", () => {
  const graph = withConstructionParapetSilhouette(withConstructionCorniceLayout(createBuildingConstructionGraph(), 2), 1);
  const view = mount(graph); expect(supportsGroupedConstruction(graph)).toBe(true);
  fireEvent.click(screen.getByText("Roof & trim", { selector: "summary" }));
  const select = screen.getByRole("combobox", { name: "Parapet silhouette" });
  expect(select).toHaveValue("1"); expect([...select.querySelectorAll("option")].map(item => item.textContent)).toEqual(["Flat parapet", "Raised center"]);
  fireEvent.change(select, { target: { value: "0" } }); expect(view.onFieldChange).toHaveBeenCalledWith("roof", "parapetSilhouette", "0");
});

it("offers one named four-elevation cornice choice and respects bypass/custom boundaries",()=>{
  const graph=withConstructionCorniceLayout(createBuildingConstructionGraph(),2),before=structuredClone(graph),view=mount(graph);
  fireEvent.click(screen.getByText("Roof & trim",{selector:"summary"}));
  const select=screen.getByRole("combobox",{name:"Cornice treatment"});
  expect(select).toHaveValue("2");expect(select).toHaveAccessibleDescription("Profile and detail course on all four elevations.");
  expect([...select.querySelectorAll("option")].map(option=>option.textContent)).toEqual(["Moulded cornice","Dentil course","Bracket course"]);
  fireEvent.change(select,{target:{value:"1"}});expect(view.onFieldChange).toHaveBeenCalledWith("roof","corniceAssembly","1");expect(graph).toEqual(before);
  view.unmount();graph.nodes.find(node=>node.type==="BuildingRoof")!.bypassed=true;mount(graph);
  fireEvent.click(screen.getByText("Roof & trim",{selector:"summary"}));expect(screen.getByRole("combobox",{name:"Cornice treatment"})).toBeDisabled();
  graph.nodes.find(node=>node.type==="BuildingRoof")!.input.nodeId="bays";expect(supportsGroupedConstruction(graph)).toBe(false);
});
function mount(graph = createBuildingConstructionGraph(), dirty = false, counts = { window: 47, storefront: 0 }) {
  const fields = Object.fromEntries(graph.nodes.filter(node => "parameters" in node).map(node => [node.id,Object.fromEntries(Object.entries(node.parameters).map(([key,value]) => [key,String(value)]))]));
  const onFieldChange=vi.fn(),onStorefrontDivisionChange=vi.fn(),onApply=vi.fn(),onRevert=vi.fn(),onAdvanced=vi.fn();
  const view=render(<ConstructionBuildingControls graph={graph} fields={fields} windowCount={counts.window} storefrontCount={counts.storefront} disabled={false} dirty={dirty} onFieldChange={onFieldChange} onStorefrontDivisionChange={onStorefrontDivisionChange} onApply={onApply} onRevert={onRevert} onAdvanced={onAdvanced}/>);
  return {...view,fields,onFieldChange,onStorefrontDivisionChange,onApply,onRevert,onAdvanced};
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
  expect(screen.getByLabelText("Local geometry scope")).toHaveTextContent("Other local geometry edits are not implemented");
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
  fireEvent.change(screen.getByRole("combobox", { name: "Display lights" }), { target: { value: "2" } });
  expect(view.onStorefrontDivisionChange).toHaveBeenCalledWith("displayLights", 2);
  fireEvent.change(screen.getByRole("combobox", { name: "Transom lights" }), { target: { value: "3" } });
  expect(view.onStorefrontDivisionChange).toHaveBeenCalledWith("transomLights", 3);
  expect(screen.getByText("Applies to 4 front ground-floor bays, including the entrance.")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Bay 2" })).toHaveValue("1");
  fireEvent.change(screen.getByRole("combobox", { name: "Entrance bay" }), { target: { value: "2" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("entrance", "bayIndex", "2");
  fireEvent.change(screen.getByLabelText("Bulkhead height (m)"), { target: { value: "0.65" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("frontage", "bulkheadHeightM", "0.65");
  fireEvent.change(screen.getByRole("combobox", { name: "Ground frontage" }), { target: { value: "0" } });
  expect(view.onFieldChange).toHaveBeenCalledWith("frontage", "mode", "0");
});
