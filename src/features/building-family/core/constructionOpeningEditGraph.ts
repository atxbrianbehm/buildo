import { BayConstructionGraphSchema, createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionOpeningTargetSchema, ConstructionOpeningWidthOverrideSchema, type ConstructionOpeningTarget } from "../contracts/constructionOpeningEdit";
import { withConstructionStorefront } from "./constructionStorefrontGraph";
import { canonicalJson } from "./canonicalJson";

function topology(graph: BayConstructionGraph) {
  return canonicalJson({ output: graph.outputNodeId, nodes: graph.nodes.map(node => ({ id: node.id, type: node.type,
    ...("input" in node ? { input: node.input } : {}), ...("inputs" in node ? { inputs: node.inputs } : {})
  })).sort((a,b) => a.id.localeCompare(b.id)) });
}
function address(target: ConstructionOpeningTarget) { return canonicalJson(target); }

/** Explicit migration only; an empty override set retains exact prior geometry. */
export function withConstructionOpeningEdits(input: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const base = withConstructionStorefront(createBuildingConstructionGraph(original.documentId), 0);
  const expected = original.schemaVersion === "0.7.0" ? BayConstructionGraphSchema.parse({ ...base, schemaVersion: "0.7.0",
    nodes: [...base.nodes.map(node => "input" in node && node.input.nodeId === "frontage" ? { ...node, input: { ...node.input, nodeId: "openingEdits" } } : node),
      { id: "openingEdits", type: "EditOpeningWidth", input: { nodeId: "frontage", socket: "scope" }, overrides: [] }] }) : base;
  const comparison = ["0.4.0", "0.5.0"].includes(original.schemaVersion)
    ? withConstructionStorefront(original, 0) : original;
  if (topology(comparison) !== topology(expected)) throw new Error("Local opening edits require the registered whole-building connections.");
  if (original.schemaVersion === "0.7.0") return structuredClone(original);
  if (!["0.4.0", "0.5.0", "0.6.0"].includes(original.schemaVersion)) throw new Error("Local opening edits require a whole-building construction.");
  const graph = original.schemaVersion === "0.6.0" ? structuredClone(original) : withConstructionStorefront(original, 0);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.7.0", nodes: [
    ...graph.nodes.map(node => "input" in node && node.input.nodeId === "frontage" ? { ...node, input: { ...node.input, nodeId: "openingEdits" } } : node),
    { id: "openingEdits", type: "EditOpeningWidth", input: { nodeId: "frontage", socket: "scope" }, overrides: [] }
  ] });
}

export function withConstructionOpeningWidth(input: unknown, edit: unknown): BayConstructionGraph {
  const graph = withConstructionOpeningEdits(input), owned = ConstructionOpeningWidthOverrideSchema.parse(edit);
  const node = graph.nodes.find(node => node.type === "EditOpeningWidth")!;
  node.overrides = [...node.overrides.filter(value => address(value.target) !== address(owned.target)), owned]
    .sort((a,b) => address(a.target).localeCompare(address(b.target)));
  return BayConstructionGraphSchema.parse(graph);
}

export function withoutConstructionOpeningWidth(input: unknown, targetInput: unknown): BayConstructionGraph {
  const graph = withConstructionOpeningEdits(input), target = ConstructionOpeningTargetSchema.parse(targetInput);
  if (target.documentId !== graph.documentId || !graph.nodes.some(node => node.id === target.storeysNodeId && node.type === "Storeys") ||
      !graph.nodes.some(node => node.id === target.windowNodeId && node.type === "AssembleWindow")) throw new Error("Reset requires a target in this construction.");
  const node = graph.nodes.find(node => node.type === "EditOpeningWidth")!;
  node.overrides = node.overrides.filter(value => address(value.target) !== address(target));
  return BayConstructionGraphSchema.parse(graph);
}
