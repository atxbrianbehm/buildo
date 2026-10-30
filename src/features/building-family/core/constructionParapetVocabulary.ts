import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionCorniceLayout } from "./constructionCorniceVocabulary";

export const CONSTRUCTION_PARAPET_SILHOUETTES = Object.freeze([
  Object.freeze({ value: 0 as const, label: "Flat parapet" }),
  Object.freeze({ value: 1 as const, label: "Raised center" })
]);

/** Explicit upgrade of an already admitted cornice graph; old source is never rewritten on read. */
export function withConstructionParapetSilhouette(input: unknown, silhouette: 0 | 1): BayConstructionGraph {
  const original = BayConstructionGraphSchema.parse(input);
  const graph = ["0.9.0", "0.10.0", "0.11.0"].includes(original.schemaVersion) ? structuredClone(original) : withConstructionCorniceLayout(original,
    original.nodes.find(node => node.type === "BuildingRoof")?.parameters.corniceAssembly ?? 0);
  const roof = graph.nodes.find(node => node.id === "roof");
  if (roof?.type !== "BuildingRoof") throw new Error("Parapet treatments require the registered whole-building roof.");
  roof.parameters.parapetSilhouette = silhouette;
  return BayConstructionGraphSchema.parse({ ...graph, schemaVersion: original.schemaVersion === "0.11.0" ? "0.11.0" : original.schemaVersion === "0.10.0" ? "0.10.0" : "0.9.0" });
}

/** Parapet is an authored roof choice, independent of opening locks. */
export function retainConstructionParapetVocabulary(currentInput: unknown, generatedInput: unknown, preserve: boolean): BayConstructionGraph {
  const current = BayConstructionGraphSchema.parse(currentInput);
  if (!["0.9.0", "0.10.0", "0.11.0"].includes(current.schemaVersion)) return BayConstructionGraphSchema.parse(generatedInput);
  const roof = current.nodes.find(node => node.id === "roof");
  if (roof?.type !== "BuildingRoof") throw new Error("The registered roof operator is missing.");
  return withConstructionParapetSilhouette(generatedInput, preserve ? roof.parameters.parapetSilhouette! : 0);
}
