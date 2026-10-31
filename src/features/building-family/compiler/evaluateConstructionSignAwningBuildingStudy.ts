import { ConstructionSignAwningBuildingStudyRequestSchema } from "../contracts/constructionSignAwningBuildingStudy";
import { DEFAULT_BAY_MATERIALS, type BayConstructionMaterials } from "./evaluateBayConstruction";
import { evaluateFacadeConstruction } from "./evaluateFacadeConstruction";

/** Experimental complete-building study; the combined treatment is not saved in the graph. */
export async function evaluateConstructionSignAwningBuildingStudy(input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS) {
  const request = structuredClone(ConstructionSignAwningBuildingStudyRequestSchema.parse(input));
  return evaluateFacadeConstruction(request.graph, materials, undefined, [], undefined, undefined, request);
}
