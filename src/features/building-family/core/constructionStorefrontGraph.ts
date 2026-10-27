import { BayConstructionGraphSchema, createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { canonicalJson } from "./canonicalJson";
import { upgradeConstructionWindowVocabulary } from "./constructionWindowVocabulary";

export const DEFAULT_STOREFRONT_PARAMETERS = Object.freeze({
  mode: 0 as 0 | 1, pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45,
  transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14
});

function topology(graph: BayConstructionGraph) {
  return canonicalJson({ outputNodeId: graph.outputNodeId, nodes: graph.nodes.map(node => ({
    id: node.id, type: node.type, ...("input" in node ? { input: node.input } : {}), ...("inputs" in node ? { inputs: node.inputs } : {})
  })).sort((a, b) => a.id.localeCompare(b.id)) });
}

/** Explicit registered-topology migration. Old graph readers do not synthesize this node. */
export function withConstructionStorefront(input: unknown, mode: 0 | 1): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  if (mode !== 0 && mode !== 1) throw new Error("Choose a supported ground frontage.");
  if (original.schemaVersion === "0.6.0") {
    const graph = structuredClone(original), node = graph.nodes.find(item => item.id === "frontage");
    if (node?.type !== "PlaceStorefront") throw new Error("The registered frontage operator is missing.");
    node.parameters.mode = mode;
    return BayConstructionGraphSchema.parse(graph);
  }
  if (!["0.4.0", "0.5.0"].includes(original.schemaVersion) || topology(original) !== topology(createBuildingConstructionGraph(original.documentId))) {
    throw new Error("Ground frontage requires the registered whole-building connections.");
  }
  const graph = upgradeConstructionWindowVocabulary(original);
  const nodes = graph.nodes.map(node => "input" in node && node.input.nodeId === "entrance"
    ? { ...node, input: { ...node.input, nodeId: "frontage" } } : node);
  nodes.push({ id: "frontage", type: "PlaceStorefront", input: { nodeId: "entrance", socket: "scope" }, parameters: { ...DEFAULT_STOREFRONT_PARAMETERS, mode } });
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.6.0", nodes });
}
