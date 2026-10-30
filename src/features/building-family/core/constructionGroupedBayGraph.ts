import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

/** Explicit migration; legacy graphs are unchanged until this operation is requested. */
export function withConstructionGroupedBays(input: unknown, directives: unknown): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = original.schemaVersion === "0.11.0" ? structuredClone(original) : withConstructionRoundHead(original,
    original.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0);
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.11.0", upperBayGroups: directives });
}
