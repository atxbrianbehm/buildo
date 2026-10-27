import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { ConstructionOpeningControls } from "../ui/ConstructionOpeningControls";
import { constructionOpeningOptions } from "../ui/constructionBuildingBindings";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";

afterEach(cleanup);
it("lists only actual upper-front frames with human-readable scope and keeps scratch text out of source",async()=>{
  const graph=createBuildingConstructionGraph(), result=await evaluateConstruction(graph), before=structuredClone(graph), options=constructionOpeningOptions(graph,result.ir);
  expect(options).toHaveLength(8);expect(options[0].label).toBe("Front · Storey 2 · Bay 1");
  const onApply=vi.fn(),onSelect=vi.fn(),onDraftChange=vi.fn();
  render(<ConstructionOpeningControls options={options} selectedPath={options[0].path} disabled={false} buildingDirty={false} onApply={onApply} onSelect={onSelect} onDraftChange={onDraftChange} onReset={()=>{}}/>);
  fireEvent.change(screen.getByLabelText("Selected width (m)"),{target:{value:"1.8"}});
  expect(onDraftChange).toHaveBeenCalledWith(true);expect(graph).toEqual(before);
  fireEvent.click(screen.getByRole("button",{name:"Apply window width"}));expect(onApply).toHaveBeenCalledWith("1.8");
  fireEvent.change(screen.getByRole("combobox",{name:"Window to edit"}),{target:{value:options[1].path}});expect(onSelect).toHaveBeenCalledWith(options[1].path);
  fireEvent.click(screen.getByRole("button",{name:"Revert width"}));expect(screen.getByLabelText("Selected width (m)")).toHaveValue(1.22);expect(onDraftChange).toHaveBeenLastCalledWith(false);
});
it("requires an eligible selection and never offers a misleading edit on bypassed/custom scopes",async()=>{
  const graph=createBuildingConstructionGraph(),ir=(await evaluateConstruction(graph)).ir;
  render(<ConstructionOpeningControls options={constructionOpeningOptions(graph,ir)} selectedPath={null} disabled={false} buildingDirty={false} onApply={()=>{}} onSelect={()=>{}} onDraftChange={()=>{}} onReset={()=>{}}/>);
  expect(screen.queryByLabelText("Selected width (m)")).not.toBeInTheDocument();
  const edited=withConstructionOpeningWidth(graph,{target:{documentId:graph.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front",floorIndex:1,bayIndex:0},widthM:1.8});
  edited.nodes.find(node=>node.type==="EditOpeningWidth")!.bypassed=true;
  expect(constructionOpeningOptions(edited,(await evaluateConstruction(edited)).ir)).toEqual([]);
  graph.nodes.find(node=>node.type==="SelectScopes")!.parameters.bayIndex=0;
  expect(constructionOpeningOptions(graph,(await evaluateConstruction(graph)).ir)).toHaveLength(2);
});
