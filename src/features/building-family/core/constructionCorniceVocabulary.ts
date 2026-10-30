import { BayConstructionGraphSchema, ConstructionCorniceLayoutSchema,
  type BayConstructionGraph, type ConstructionCorniceLayout } from "../contracts/bayConstructionGraph";
import { withConstructionOpeningEdits } from "./constructionOpeningEditGraph";

export const CONSTRUCTION_CORNICE_LAYOUTS = Object.freeze([
  Object.freeze({value:0 as const,label:"Moulded cornice"}),
  Object.freeze({value:1 as const,label:"Dentil course"}),
  Object.freeze({value:2 as const,label:"Bracket course"})
]);

/** Explicit registered-topology upgrade; reading old source never inserts treatment data. */
export function withConstructionCorniceLayout(input: unknown, layout: ConstructionCorniceLayout): BayConstructionGraph {
  const original = structuredClone(BayConstructionGraphSchema.parse(input)), value = ConstructionCorniceLayoutSchema.parse(layout);
  const graph = withConstructionOpeningEdits(original);
  const roof = graph.nodes.find(node => node.id === "roof");
  if (roof?.type !== "BuildingRoof") throw new Error("Cornice treatments require the registered whole-building roof.");
  roof.parameters.corniceAssembly = value;
  return BayConstructionGraphSchema.parse({...graph,schemaVersion:original.schemaVersion === "0.12.0" ? "0.12.0" : original.schemaVersion === "0.11.0" ? "0.11.0" : original.schemaVersion === "0.10.0" ? "0.10.0" : original.schemaVersion === "0.9.0" ? "0.9.0" : "0.8.0"});
}

/** Cornice treatment follows preserve-authored only; opening locks do not lock the roof. */
export function retainConstructionCorniceVocabulary(currentInput: unknown, generatedInput: unknown, preserve: boolean) {
  const current = BayConstructionGraphSchema.parse(currentInput);
  if (!["0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(current.schemaVersion)) return BayConstructionGraphSchema.parse(generatedInput);
  const authored = current.nodes.find(node => node.id === "roof" && node.type === "BuildingRoof");
  if (authored?.type !== "BuildingRoof") throw new Error("The registered roof operator is missing.");
  return withConstructionCorniceLayout(generatedInput, preserve ? authored.parameters.corniceAssembly! : 0);
}
