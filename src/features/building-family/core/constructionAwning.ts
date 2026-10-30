import { ConstructionAwningPlanSchema, ConstructionAwningRequestSchema, type ConstructionAwningPlan } from "../contracts/constructionAwning";
import { readConstructionStorefrontPlan } from "./constructionStorefront";
import { canonicalJson } from "./canonicalJson";

/** Fit an illustrative canopy to one storefront bay, preserving a clear front edge. */
export function resolveConstructionAwning(input: unknown): ConstructionAwningPlan {
  const source = structuredClone(ConstructionAwningRequestSchema.parse(input));
  const storefront = readConstructionStorefrontPlan(source.storefront), scope = storefront.source.scope;
  const widthM = Math.min(scope.sizeM[0] - 0.08, storefront.aperture.widthM + 0.2);
  const centerAlongM = storefront.aperture.leftM + storefront.aperture.widthM / 2;
  const mountYM = storefront.aperture.bottomM + storefront.aperture.heightM + storefront.source.parameters.headHeightM / 2;
  const frontYM = mountYM - source.dropM, lowerEdgeYM = frontYM - source.valanceHeightM;
  if (widthM <= 0 || centerAlongM - widthM / 2 < scope.originM[0] + 0.04 || centerAlongM + widthM / 2 > scope.originM[0] + scope.sizeM[0] - 0.04)
    throw new Error("The awning must fit inside its storefront bay.");
  if (lowerEdgeYM < scope.originM[1] + 2.05) throw new Error("The awning must retain at least 2.05 m of illustrative ground clearance.");
  return ConstructionAwningPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-awning-plan", source,
    widthM, centerAlongM, mountYM, frontYM, lowerEdgeYM });
}

export function readConstructionAwning(input: unknown): ConstructionAwningPlan {
  const plan = ConstructionAwningPlanSchema.parse(input), expected = resolveConstructionAwning(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Awning dimensions do not match their source.");
  return expected;
}
