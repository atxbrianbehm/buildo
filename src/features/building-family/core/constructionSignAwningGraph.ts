import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** Record an explicit shared clearance for an already-authored sign and awning. */
export function withConstructionSignAwningClearance(input: unknown, gapM: number): BayConstructionGraph {
  const graph = BayConstructionGraphSchema.parse(input);
  if (graph.schemaVersion !== "0.16.0" && graph.schemaVersion !== "0.17.0") throw new Error("Add a storefront sign before choosing shared clearance.");
  return BayConstructionGraphSchema.parse({ ...structuredClone(graph), schemaVersion: "0.17.0", signAwningGapM: gapM });
}

/** Remove the shared awning and its rods, leaving the sign and other bay directives intact. */
export function withoutConstructionSignAwning(input: unknown): BayConstructionGraph {
  const graph = BayConstructionGraphSchema.parse(input);
  if (graph.schemaVersion !== "0.17.0" || !graph.storefrontSign) throw new Error("Choose a combined sign and awning first.");
  const bay = graph.storefrontSign.bayIndex, awnings = graph.awnings?.filter(item => item.bayIndex !== bay), supports = graph.awningSupports?.filter(item => item.bayIndex !== bay);
  const { signAwningGapM: _gap, awnings: _awnings, awningSupports: _supports, ...prior } = graph; void _gap; void _awnings; void _supports;
  return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.16.0", ...(awnings?.length ? { awnings } : {}), ...(supports?.length ? { awningSupports: supports } : {}) });
}
