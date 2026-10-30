import { BayConstructionGraphSchema, createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionOpeningTargetSchema, ConstructionOpeningWidthOverrideSchema, type ConstructionOpeningTarget } from "../contracts/constructionOpeningEdit";
import { withConstructionStorefront } from "./constructionStorefrontGraph";
import { canonicalJson } from "./canonicalJson";
import { resolveConstructionOpeningWidth } from "./constructionOpeningEdit";

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
  const expected = ["0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(original.schemaVersion) ? BayConstructionGraphSchema.parse({ ...base, schemaVersion: "0.7.0",
    nodes: [...base.nodes.map(node => "input" in node && node.input.nodeId === "frontage" ? { ...node, input: { ...node.input, nodeId: "openingEdits" } } : node),
      { id: "openingEdits", type: "EditOpeningWidth", input: { nodeId: "frontage", socket: "scope" }, overrides: [] }] }) : base;
  const comparison = ["0.4.0", "0.5.0"].includes(original.schemaVersion)
    ? withConstructionStorefront(original, 0) : original;
  if (topology(comparison) !== topology(expected)) throw new Error("Local opening edits require the registered whole-building connections.");
  if (["0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(original.schemaVersion)) return structuredClone(original);
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

/** Preserve explicit local widths over the immutable recipe, or release every override. */
export function retainConstructionOpeningEdits(currentInput: unknown, generatedInput: unknown, preserve: boolean) {
  const current = BayConstructionGraphSchema.parse(currentInput);
  if (!["0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(current.schemaVersion)) return BayConstructionGraphSchema.parse(generatedInput);
  const graph = withConstructionOpeningEdits(generatedInput);
  const source = current.nodes.find(node => node.type === "EditOpeningWidth")!;
  const operation = graph.nodes.find(node => node.type === "EditOpeningWidth")!;
  operation.overrides = preserve ? structuredClone(source.overrides) : [];
  const footprint = graph.nodes.find(node => node.type === "Footprint")!.parameters;
  const storeys = graph.nodes.find(node => node.type === "Storeys")!, bays = graph.nodes.find(node => node.type === "SplitBays")!.parameters.count;
  const opening = graph.nodes.find(node => node.type === "PlaceOpening")!.parameters;
  const window = graph.nodes.find(node => node.type === "AssembleWindow")!;
  for (const { target, widthM } of operation.overrides) {
    if (target.floorIndex >= storeys.parameters.count || target.bayIndex >= bays || target.storeysNodeId !== storeys.id || target.windowNodeId !== window.id) {
      throw new Error("A preserved selected window no longer exists. Keep its storey/bay, reset its local width, or release edited dimensions and opening locks.");
    }
    const span = footprint.widthM/bays, bottom = storeys.parameters.groundHeightM+(target.floorIndex-1)*storeys.parameters.upperHeightM;
    const left = -footprint.widthM/2+target.bayIndex*span;
    resolveConstructionOpeningWidth({schemaVersion:"0.1.0",kind:"construction-opening-width-request",target,widthM,frameWidthM:window.parameters.frameWidthM,
      scope:{id:`${target.storeysNodeId}/floor/${target.floorIndex}/bay/${target.bayIndex}`,face:"front",floorIndex:target.floorIndex,bayIndex:target.bayIndex,
        originM:[left,bottom,-footprint.wallDepthM],sizeM:[span,storeys.parameters.upperHeightM,footprint.wallDepthM],
        opening:{kind:"window",widthM:opening.widthM,heightM:opening.heightM,centerAlongM:left+span/2,centerYM:bottom+opening.sillM+opening.heightM/2}}});
  }
  return BayConstructionGraphSchema.parse(graph);
}
