import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

/** Add an explicitly bay-scoped sign while retaining compatible authored graph features. */
export function withConstructionStorefrontSign(input: unknown, directive: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = ["0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0", "0.16.0", "0.17.0"].includes(original.schemaVersion)
    ? structuredClone(original) : withConstructionRoundHead(original, original.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: original.schemaVersion === "0.17.0" ? "0.17.0" : "0.16.0", storefrontSign: directive });
}

/** Remove only the sign, returning to the newest required pre-sign graph format. */
export function withoutConstructionStorefrontSign(input: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  if (original.schemaVersion !== "0.16.0" && original.schemaVersion !== "0.17.0") return structuredClone(original);
  const { storefrontSign: _removed, signAwningGapM: _gap, ...prior } = original; void _removed; void _gap;
  if (original.facadePiers) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.15.0" });
  if (original.awningSupports) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.14.0", upperBayGroups: original.upperBayGroups ?? [], storefrontDivision: original.storefrontDivision ?? { displayLights: 1, transomLights: 1 } });
  if (original.awnings) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.13.0", upperBayGroups: original.upperBayGroups ?? [], storefrontDivision: original.storefrontDivision ?? { displayLights: 1, transomLights: 1 } });
  if (original.storefrontDivision) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.12.0", upperBayGroups: original.upperBayGroups ?? [] });
  if (original.upperBayGroups) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.11.0" });
  return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.10.0" });
}
