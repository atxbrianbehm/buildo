import { constructionHasStorefront, withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningEdits } from "../core/constructionOpeningEditGraph";
import { constructionOpeningTargetFromSelection } from "../core/constructionOpeningEdit";
import { createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";

/** Only expose fixed shared bindings when they describe the actual registered topology. */
export function supportsGroupedConstruction(graph: BayConstructionGraph) {
  const signature = (input: BayConstructionGraph) => JSON.stringify({ output: input.outputNodeId,
    nodes: input.nodes.map(node => ({ id: node.id, type: node.type,
      ...("input" in node ? { input: node.input } : {}), ...("inputs" in node ? { inputs: node.inputs } : {}) })).sort((a,b) => a.id.localeCompare(b.id)) });
  const base = createBuildingConstructionGraph(graph.documentId);
  return ["0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0"].includes(graph.schemaVersion) && signature(graph) === signature(["0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0"].includes(graph.schemaVersion) ? withConstructionOpeningEdits(base) : graph.schemaVersion === "0.6.0" ? withConstructionStorefront(base, 0) : base);
}

/** Options come from accepted semantic entries, never guessed instance positions. */
export function constructionOpeningOptions(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  if (!supportsGroupedConstruction(graph) || graph.documentId !== ir.buildingId) return [];
  const storeys = graph.nodes.find(node => node.type === "Storeys")!, window = graph.nodes.find(node => node.type === "AssembleWindow")!;
  const shared = graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.widthM;
  const edits = graph.nodes.find(node => node.type === "EditOpeningWidth");
  if (edits?.bypassed) return [];
  return ir.semanticIndex.flatMap(entry => {
    try {
      const target = constructionOpeningTargetFromSelection({documentId:graph.documentId,storeysNodeId:storeys.id,windowNodeId:window.id,semanticPath:entry.semanticPath});
      const override = edits && !edits.bypassed ? edits.overrides.find(value=>value.target.floorIndex===target.floorIndex && value.target.bayIndex===target.bayIndex && value.target.windowNodeId===target.windowNodeId && value.target.storeysNodeId===target.storeysNodeId && value.target.documentId===graph.documentId) : undefined;
      return [{path:entry.semanticPath,target,widthM:override?.widthM??shared,overridden:Boolean(override),
        label:`Front · Storey ${target.floorIndex+1} · Bay ${target.bayIndex+1}`}];
    } catch { return []; }
  }).sort((a,b)=>a.target.floorIndex-b.target.floorIndex || a.target.bayIndex-b.target.bayIndex);
}
export function groupedWindowCount(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  const windows = new Set(graph.nodes.filter(node => node.type === "AssembleWindow").map(node => node.id));
  return ir.semanticIndex.filter(entry => entry.semanticPath.endsWith("/frame") && [...windows].some(id => entry.semanticPath.includes("/node/" + id + "/") && (!constructionHasStorefront(graph) || !entry.semanticPath.includes("/node/" + id + "/facade/floor/0/")))).length;
}

export function groupedStorefrontCount(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  if (!constructionHasStorefront(graph)) return 0;
  return ir.semanticIndex.filter(entry => entry.semanticPath.endsWith("/frame") && entry.semanticPath.includes("/facade/floor/0/") && ["window", "door"].some(id => entry.semanticPath.includes("/node/" + id + "/"))).length;
}
