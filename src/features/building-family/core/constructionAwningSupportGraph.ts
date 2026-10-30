import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** Upgrade only an existing awning graph; old graph output remains unchanged. */
export function withConstructionAwningSupports(input: unknown, supports: unknown): BayConstructionGraph {
  const graph = BayConstructionGraphSchema.parse(input);
  if (graph.schemaVersion !== "0.13.0" && graph.schemaVersion !== "0.14.0") throw new Error("Add awnings before choosing supports.");
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.14.0", awningSupports: supports });
}
