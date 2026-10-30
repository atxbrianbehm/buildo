import { ConstructionAwningSupportPlanSchema, ConstructionAwningSupportRequestSchema, type ConstructionAwningSupportPlan } from "../contracts/constructionAwningSupports";
import { canonicalJson } from "./canonicalJson";
import { readConstructionAwning } from "./constructionAwning";

/** A demo pair of wall-to-canopy tension rods in canopy-local coordinates. */
export function resolveConstructionAwningSupports(input: unknown): ConstructionAwningSupportPlan {
  const source = structuredClone(ConstructionAwningSupportRequestSchema.parse(input));
  const awning = readConstructionAwning(source.awning), scope = awning.source.storefront.source.scope;
  const top = awning.mountYM + source.anchorRiseM;
  if (top + source.thicknessM / 2 > scope.originM[1] + scope.sizeM[1]) throw new Error("Awning support anchors need room within the storefront storey.");
  const x = awning.widthM / 2 - 0.07, z = awning.source.projectionM - 0.05;
  if (x <= source.thicknessM || z <= source.thicknessM) throw new Error("Awning is too small for the support anchors.");
  const base = scope.originM[1], canopyY = awning.mountYM - awning.source.dropM * (z / awning.source.projectionM) + 0.025;
  return ConstructionAwningSupportPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-awning-support-plan", source,
    rods: [{ side: "left", wall: [-x, top - base, 0], canopy: [-x, canopyY - base, z] },
      { side: "right", wall: [x, top - base, 0], canopy: [x, canopyY - base, z] }] });
}
export function readConstructionAwningSupports(input: unknown): ConstructionAwningSupportPlan {
  const plan = ConstructionAwningSupportPlanSchema.parse(input), expected = resolveConstructionAwningSupports(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Awning supports do not match their source.");
  return expected;
}
