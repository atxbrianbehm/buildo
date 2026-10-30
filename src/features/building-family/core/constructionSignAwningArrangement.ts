import { ConstructionSignAwningArrangementPlanSchema, ConstructionSignAwningArrangementRequestSchema, type ConstructionSignAwningArrangementPlan } from "../contracts/constructionSignAwningArrangement";
import { resolveConstructionStorefrontSign } from "./constructionStorefrontSign";
import { resolveConstructionAwning } from "./constructionAwning";
import { canonicalJson } from "./canonicalJson";

/** Lower the canopy to clear a sign, retaining pedestrian clearance. */
export function resolveConstructionSignAwningArrangement(input: unknown): ConstructionSignAwningArrangementPlan {
  const source = structuredClone(ConstructionSignAwningArrangementRequestSchema.parse(input));
  const sign = resolveConstructionStorefrontSign({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-request", storefront: source.storefront, ...source.sign, awningPresent: false });
  const awning = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: source.storefront, ...source.awning });
  const awningShiftYM = Math.min(0, sign.bottomM - source.gapM - 0.02 - awning.mountYM);
  const lowerEdgeYM = awning.lowerEdgeYM + awningShiftYM;
  if (lowerEdgeYM < source.storefront.source.scope.originM[1] + 2.05) throw new Error("The combined sign and awning need at least 2.05 m of illustrative ground clearance.");
  return ConstructionSignAwningArrangementPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-sign-awning-arrangement-plan", source,
    signBottomM: sign.bottomM, awningShiftYM, lowerEdgeYM });
}

export function readConstructionSignAwningArrangement(input: unknown): ConstructionSignAwningArrangementPlan {
  const plan = ConstructionSignAwningArrangementPlanSchema.parse(input), expected = resolveConstructionSignAwningArrangement(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Sign and awning arrangement does not match its source.");
  return expected;
}
