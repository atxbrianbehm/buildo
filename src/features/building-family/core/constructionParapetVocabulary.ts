import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** Explicit upgrade of an already admitted cornice graph; old source is never rewritten on read. */
export function withConstructionParapetSilhouette(input: unknown, silhouette: 0 | 1): BayConstructionGraph {
  const graph = structuredClone(BayConstructionGraphSchema.parse(input));
  if (graph.schemaVersion !== "0.8.0" && graph.schemaVersion !== "0.9.0") throw new Error("Parapet treatment requires a cornice vocabulary graph.");
  const roof = graph.nodes.find(node => node.id === "roof");
  if (roof?.type !== "BuildingRoof") throw new Error("Parapet treatments require the registered whole-building roof.");
  roof.parameters.parapetSilhouette = silhouette;
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.9.0" });
}
