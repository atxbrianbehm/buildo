import { ConstructionSignAwningSupportPlanSchema, ConstructionSignAwningSupportRequestSchema, type ConstructionSignAwningSupportPlan } from "../contracts/constructionSignAwningSupports";
import { readConstructionSignAwningArrangement } from "./constructionSignAwningArrangement";
import { resolveConstructionAwning } from "./constructionAwning";
import { resolveConstructionAwningSupports } from "./constructionAwningSupports";
import { canonicalJson } from "./canonicalJson";

/** Fit original rod dimensions below the sign by lowering the complete canopy and supports. */
export function resolveConstructionSignAwningSupports(input: unknown): ConstructionSignAwningSupportPlan {
  const source = structuredClone(ConstructionSignAwningSupportRequestSchema.parse(input)), arrangement = readConstructionSignAwningArrangement(source.arrangement);
  const awning = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: arrangement.source.storefront, ...arrangement.source.awning });
  resolveConstructionAwningSupports({ schemaVersion: "0.1.0", kind: "construction-awning-support-request", awning, anchorRiseM: source.anchorRiseM, thicknessM: source.thicknessM });
  const awningShiftYM = Math.min(arrangement.awningShiftYM, arrangement.signBottomM - arrangement.source.gapM - source.thicknessM / 2 - source.anchorRiseM - awning.mountYM);
  const lowerEdgeYM = awning.lowerEdgeYM + awningShiftYM, anchorTopYM = awning.mountYM + source.anchorRiseM + source.thicknessM / 2 + awningShiftYM;
  const anchorBottomYM = anchorTopYM - source.thicknessM;
  if (lowerEdgeYM < arrangement.source.storefront.source.scope.originM[1] + 2.05) throw new Error("The sign, awning and supports need at least 2.05 m of illustrative ground clearance.");
  const aperture = arrangement.source.storefront.aperture;
  if (anchorBottomYM < aperture.bottomM + aperture.heightM) throw new Error("Support anchors need clearance above the storefront opening.");
  return ConstructionSignAwningSupportPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-sign-awning-support-plan", source, awningShiftYM, lowerEdgeYM, anchorTopYM, anchorBottomYM });
}

export function readConstructionSignAwningSupports(input: unknown): ConstructionSignAwningSupportPlan {
  const plan = ConstructionSignAwningSupportPlanSchema.parse(input), expected = resolveConstructionSignAwningSupports(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Sign and awning supports do not match their source.");
  return expected;
}
