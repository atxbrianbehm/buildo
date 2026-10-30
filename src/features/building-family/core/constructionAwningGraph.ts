import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefrontDivision } from "./constructionStorefrontDivisionGraph";

/** Explicitly place awnings on selected front storefront bays. */
export function withConstructionAwnings(input: unknown, awnings: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = (original.schemaVersion === "0.13.0" || original.schemaVersion === "0.14.0" || original.schemaVersion === "0.15.0") ? structuredClone(original) : original.schemaVersion === "0.12.0" ? structuredClone(original) : withConstructionStorefrontDivision(original, { displayLights: 1, transomLights: 1 });
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: graph.schemaVersion === "0.15.0" ? "0.15.0" : graph.schemaVersion === "0.14.0" ? "0.14.0" : "0.13.0", awnings });
}
