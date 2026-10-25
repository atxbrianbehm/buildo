import { constructionHasStorefront, withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";

/** Only expose fixed shared bindings when they describe the actual registered topology. */
export function supportsGroupedConstruction(graph: BayConstructionGraph) {
  const signature = (input: BayConstructionGraph) => JSON.stringify({ output: input.outputNodeId,
    nodes: input.nodes.map(node => ({ id: node.id, type: node.type,
      ...("input" in node ? { input: node.input } : {}), ...("inputs" in node ? { inputs: node.inputs } : {}) })).sort((a,b) => a.id.localeCompare(b.id)) });
  const base = createBuildingConstructionGraph(graph.documentId);
  return ["0.4.0", "0.5.0", "0.6.0"].includes(graph.schemaVersion) && signature(graph) === signature(graph.schemaVersion === "0.6.0" ? withConstructionStorefront(base, 0) : base);
}
export function groupedWindowCount(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  const windows = new Set(graph.nodes.filter(node => node.type === "AssembleWindow").map(node => node.id));
  return ir.semanticIndex.filter(entry => entry.semanticPath.endsWith("/frame") && [...windows].some(id => entry.semanticPath.includes("/node/" + id + "/") && (!constructionHasStorefront(graph) || !entry.semanticPath.includes("/node/" + id + "/facade/floor/0/")))).length;
}

export function groupedStorefrontCount(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  if (!constructionHasStorefront(graph)) return 0;
  return ir.semanticIndex.filter(entry => entry.semanticPath.endsWith("/frame") && entry.semanticPath.includes("/facade/floor/0/") && ["window", "door"].some(id => entry.semanticPath.includes("/node/" + id + "/"))).length;
}
