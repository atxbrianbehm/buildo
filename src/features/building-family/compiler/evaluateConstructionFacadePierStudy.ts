import { ConstructionFacadePierStudyRequestSchema } from "../contracts/constructionFacadePierStudy";
import { evaluateFacadeConstruction } from "./evaluateFacadeConstruction";
import { DEFAULT_BAY_MATERIALS, type BayConstructionMaterials } from "./evaluateBayConstruction";

/** Experimental full-building compiler path; the graph and project formats are unchanged. */
export async function evaluateConstructionFacadePierStudy(input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS) {
  const request = structuredClone(ConstructionFacadePierStudyRequestSchema.parse(input));
  return evaluateFacadeConstruction(request.graph, materials, undefined, [], request);
}
