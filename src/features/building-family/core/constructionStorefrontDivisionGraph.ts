import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionGroupedBays } from "./constructionGroupedBayGraph";

/** Explicit migration; storefront divisions apply to the active front ground-floor frontage. */
export function withConstructionStorefrontDivision(input: unknown, division: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = original.schemaVersion === "0.12.0" ? structuredClone(original) : withConstructionGroupedBays(original, original.upperBayGroups ?? []);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.12.0", storefrontDivision: division });
}
