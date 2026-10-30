import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionParapetSilhouette } from "./constructionParapetVocabulary";

export const CONSTRUCTION_OPENING_HEADS = Object.freeze([
  Object.freeze({ value: 0 as const, label: "Flat head" }),
  Object.freeze({ value: 1 as const, label: "Round head" })
]);

/** Explicit migration preserves existing authored topology and all prior choices. */
export function withConstructionRoundHead(input: unknown, value: 0 | 1): BayConstructionGraph {
  if (value !== 0 && value !== 1) throw new Error("Choose a supported opening head.");
  const original = BayConstructionGraphSchema.parse(input);
  const graph = original.schemaVersion === "0.10.0" ? structuredClone(original) : withConstructionParapetSilhouette(original,
    original.nodes.find(node => node.type === "BuildingRoof")?.parameters.parapetSilhouette ?? 0);
  const opening = graph.nodes.find(node => node.id === "opening");
  if (opening?.type !== "PlaceOpening") throw new Error("Opening heads require the registered opening operator.");
  opening.parameters.upperFrontRoundHead = value;
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: "0.10.0" });
}

export function retainConstructionRoundHead(currentInput: unknown, generatedInput: unknown, preserve: boolean): BayConstructionGraph {
  const current = BayConstructionGraphSchema.parse(currentInput);
  if (current.schemaVersion !== "0.10.0") return BayConstructionGraphSchema.parse(generatedInput);
  const opening = current.nodes.find(node => node.id === "opening");
  if (opening?.type !== "PlaceOpening") throw new Error("The registered opening operator is missing.");
  return withConstructionRoundHead(generatedInput, preserve ? opening.parameters.upperFrontRoundHead ?? 0 : 0);
}
