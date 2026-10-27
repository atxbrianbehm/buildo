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
  if (original.schemaVersion === "0.8.0") {
    // Validate the owned existing topology through its prior registered form.
    // This temporary copy is never published as a downgraded user source.
    original.schemaVersion = "0.7.0";
    for (const node of original.nodes) if (node.type === "BuildingRoof") delete node.parameters.corniceAssembly;
  }
  const graph = withConstructionOpeningEdits(original);
  const roof = graph.nodes.find(node => node.id === "roof");
  if (roof?.type !== "BuildingRoof") throw new Error("Cornice treatments require the registered whole-building roof.");
  roof.parameters.corniceAssembly = value;
  return BayConstructionGraphSchema.parse({...graph,schemaVersion:"0.8.0"});
}
