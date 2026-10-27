import { createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";

/** Only expose fixed shared bindings when they describe the actual registered topology. */
export function supportsGroupedConstruction(graph: BayConstructionGraph) {
  const signature = (input: BayConstructionGraph) => JSON.stringify({ output: input.outputNodeId,
    nodes: input.nodes.map(node => ({ id: node.id, type: node.type,
      ...("input" in node ? { input: node.input } : {}), ...("inputs" in node ? { inputs: node.inputs } : {}) })).sort((a,b) => a.id.localeCompare(b.id)) });
  return ["0.4.0", "0.5.0"].includes(graph.schemaVersion) && signature(graph) === signature(createBuildingConstructionGraph(graph.documentId));
}
export function groupedWindowCount(graph: BayConstructionGraph, ir: RuntimeBuildingIR) {
  const windows = new Set(graph.nodes.filter(node => node.type === "AssembleWindow").map(node => node.id));
  return ir.semanticIndex.filter(entry => entry.semanticPath.endsWith("/frame") && [...windows].some(id => entry.semanticPath.includes("/node/" + id + "/"))).length;
}
