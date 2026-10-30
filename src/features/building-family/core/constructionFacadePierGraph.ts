import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

/** Add a front-facade pier directive while retaining all existing graph choices. */
export function withConstructionFacadePiers(input: unknown, directive: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = ["0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0"].includes(original.schemaVersion)
    ? structuredClone(original) : withConstructionRoundHead(original, original.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.15.0", facadePiers: directive });
}
