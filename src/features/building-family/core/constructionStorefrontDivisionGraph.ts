import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionGroupedBays } from "./constructionGroupedBayGraph";

/** Explicit migration; storefront divisions apply to the active front ground-floor frontage. */
export function withConstructionStorefrontDivision(input: unknown, division: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = ["0.12.0", "0.13.0"].includes(original.schemaVersion) ? structuredClone(original) : withConstructionGroupedBays(original, original.upperBayGroups ?? []);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: original.schemaVersion === "0.13.0" ? "0.13.0" : "0.12.0", storefrontDivision: division });
}
