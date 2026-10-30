import { ConstructionStorefrontSignStudyRequestSchema } from "../contracts/constructionStorefrontSignStudy";
import { DEFAULT_BAY_MATERIALS, type BayConstructionMaterials } from "./evaluateBayConstruction";
import { evaluateFacadeConstruction } from "./evaluateFacadeConstruction";

/** Experimental complete-building compilation; no sign is saved in the graph. */
export async function evaluateConstructionStorefrontSignStudy(input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS) {
  const request = structuredClone(ConstructionStorefrontSignStudyRequestSchema.parse(input));
  return evaluateFacadeConstruction(request.graph, materials, undefined, [], undefined, request);
}
