import { BayConstructionGraphSchema, ConstructionWindowLayoutSchema, type ConstructionWindowLayout } from "../contracts/bayConstructionGraph";

export const CONSTRUCTION_WINDOW_LAYOUTS = Object.freeze([
  Object.freeze({ value: 0 as const, label: "Double-hung sash" }),
  Object.freeze({ value: 1 as const, label: "Twin casement" }),
  Object.freeze({ value: 2 as const, label: "Six-light casement" })
]);

/** Explicit, owned format migration. Reading an old graph never inserts defaults. */
export function upgradeConstructionWindowVocabulary(input: unknown) {
  const graph = structuredClone(BayConstructionGraphSchema.parse(input));
  if (!["0.4.0", "0.5.0"].includes(graph.schemaVersion)) throw new Error("Window vocabulary currently requires a whole-building construction.");
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.5.0", nodes: graph.nodes.map(node =>
    node.type === "AssembleWindow" ? { ...node, parameters: { ...node.parameters, layout: node.parameters.layout ?? 0 } } : node) });
}

export function withConstructionWindowLayout(input: unknown, nodeId: string, layout: ConstructionWindowLayout) {
  const graph = upgradeConstructionWindowVocabulary(input), value = ConstructionWindowLayoutSchema.parse(layout);
  const node = graph.nodes.find(item => item.id === nodeId);
  if (node?.type !== "AssembleWindow") throw new Error("Choose an actual window assembly operator.");
  node.parameters.layout = value;
  return BayConstructionGraphSchema.parse(graph);
}

/** Authored assembly exceptions stay in the current graph, not the immutable recipe lineage. */
export function retainConstructionWindowVocabulary(currentInput: unknown, generatedInput: unknown, preserve: boolean) {
  const current = BayConstructionGraphSchema.parse(currentInput), generated = BayConstructionGraphSchema.parse(generatedInput);
  if (current.schemaVersion !== "0.5.0") return generated;
  const graph = upgradeConstructionWindowVocabulary(generated);
  if (preserve) for (const node of graph.nodes) if (node.type === "AssembleWindow") {
    const authored = current.nodes.find(item => item.id === node.id);
    if (authored?.type === "AssembleWindow") node.parameters.layout = authored.parameters.layout!;
  }
  return BayConstructionGraphSchema.parse(graph);
}
