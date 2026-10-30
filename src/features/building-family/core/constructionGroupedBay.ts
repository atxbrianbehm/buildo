import { ConstructionGroupedBayPlanSchema, ConstructionGroupedBayRequestSchema, type ConstructionGroupedBayPlan } from "../contracts/constructionGroupedBay";
import { canonicalJson } from "./canonicalJson";

/** A group is distinct wall apertures with masonry between them, not a sash pattern. */
export function resolveConstructionGroupedBay(input: unknown): ConstructionGroupedBayPlan {
  const source = structuredClone(ConstructionGroupedBayRequestSchema.parse(input));
  const { scope, parameters: p } = source, [width, height, depth] = scope.sizeM;
  const groupWidth = p.memberCount * p.memberWidthM + (p.memberCount - 1) * p.pierWidthM;
  if (width <= 0 || height <= 0 || depth <= 0 || groupWidth > width - 0.16 || p.sillM < 0.08 || p.sillM + p.heightM > height - 0.08)
    throw new Error("Grouped apertures must fit within the bay and retain 80 mm of surrounding masonry.");
  if (p.frameWidthM * 4 >= Math.min(p.memberWidthM, p.heightM) || p.recessM + 0.08 >= depth)
    throw new Error("Grouped aperture frames or recesses do not fit.");
  const start = scope.originM[0] + (width - groupWidth) / 2;
  const members = Array.from({ length: p.memberCount }, (_, index) => ({ id: `${scope.id}/opening/${index}`,
    index, centerAlongM: start + index * (p.memberWidthM + p.pierWidthM) + p.memberWidthM / 2,
    centerYM: scope.originM[1] + p.sillM + p.heightM / 2, widthM: p.memberWidthM, heightM: p.heightM }));
  return ConstructionGroupedBayPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-grouped-bay-plan", source, members });
}

export function readConstructionGroupedBay(input: unknown): ConstructionGroupedBayPlan {
  const plan = ConstructionGroupedBayPlanSchema.parse(input), expected = resolveConstructionGroupedBay(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Grouped bay plan does not match its source.");
  return expected;
}
