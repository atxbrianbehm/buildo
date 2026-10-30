import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

/** Add a front-facade pier directive while retaining all existing graph choices. */
export function withConstructionFacadePiers(input: unknown, directive: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = ["0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0"].includes(original.schemaVersion)
    ? structuredClone(original) : withConstructionRoundHead(original, original.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.15.0", facadePiers: directive });
}

/** Remove the pier directive without dropping any retained building features. */
export function withoutConstructionFacadePiers(input: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  if (original.schemaVersion !== "0.15.0") return structuredClone(original);
  const { facadePiers: _removed, ...prior } = original; void _removed;
  if (original.awningSupports) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.14.0", upperBayGroups: original.upperBayGroups ?? [],
    storefrontDivision: original.storefrontDivision ?? { displayLights: 1, transomLights: 1 } });
  if (original.awnings) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.13.0", upperBayGroups: original.upperBayGroups ?? [],
    storefrontDivision: original.storefrontDivision ?? { displayLights: 1, transomLights: 1 } });
  if (original.storefrontDivision) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.12.0", upperBayGroups: original.upperBayGroups ?? [] });
  if (original.upperBayGroups) return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.11.0" });
  return BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.10.0" });
}
