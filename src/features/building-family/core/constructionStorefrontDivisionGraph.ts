import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionGroupedBays } from "./constructionGroupedBayGraph";

/** Explicit migration; storefront divisions apply to the active front ground-floor frontage. */
export function withConstructionStorefrontDivision(input: unknown, division: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  if (["0.15.0", "0.16.0", "0.17.0"].includes(original.schemaVersion))
    return BayConstructionGraphSchema.parse({ ...structuredClone(original), storefrontDivision: division });
  const graph = ["0.12.0", "0.13.0", "0.14.0"].includes(original.schemaVersion) ? structuredClone(original) : withConstructionGroupedBays(original, original.upperBayGroups ?? []);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: original.schemaVersion === "0.14.0" ? "0.14.0" : original.schemaVersion === "0.13.0" ? "0.13.0" : "0.12.0", storefrontDivision: division });
}
