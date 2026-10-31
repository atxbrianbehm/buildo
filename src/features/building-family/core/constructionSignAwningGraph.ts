import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** Record an explicit shared clearance for an already-authored sign and awning. */
export function withConstructionSignAwningClearance(input: unknown, gapM: number): BayConstructionGraph {
  const graph = BayConstructionGraphSchema.parse(input);
  if (graph.schemaVersion !== "0.16.0" && graph.schemaVersion !== "0.17.0") throw new Error("Add a storefront sign before choosing shared clearance.");
  return BayConstructionGraphSchema.parse({ ...structuredClone(graph), schemaVersion: "0.17.0", signAwningGapM: gapM });
}
