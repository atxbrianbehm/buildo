import { ConstructionRoundHeadPlanSchema, ConstructionRoundHeadRequestSchema, type ConstructionRoundHeadPlan } from "../contracts/constructionRoundHead";
import { canonicalJson } from "./canonicalJson";

// Fixed resolution and counterclockwise traversal let downstream consumers share one contour.
function contour(centerX: number, bottomY: number, springY: number, radius: number) {
  const pointsM: [number, number][] = [[centerX - radius, bottomY], [centerX + radius, bottomY]];
  for (let step = 0; step <= 16; step++) {
    const angle = Math.PI * step / 16;
    pointsM.push(step === 0 ? [centerX + radius, springY] : step === 16 ? [centerX - radius, springY] :
      [centerX + radius * Math.cos(angle), springY + radius * Math.sin(angle)]);
  }
  return { pointsM, springY, radiusM: radius };
}

/** Plan a semicircular upper aperture and its concentric frame opening in facade-local metres. */
export function resolveConstructionRoundHead(input: unknown): ConstructionRoundHeadPlan {
  const source = ConstructionRoundHeadRequestSchema.parse(input), { scope, parameters: p } = source;
  const radius = p.widthM / 2, springHeight = p.heightM - radius, innerRadius = radius - p.frameWidthM;
  if (scope.face !== "front") throw new Error("Round-headed openings currently require an upper front scope.");
  if (p.widthM + 2 * p.masonryMarginM > scope.sizeM[0] || p.sillM + p.heightM + p.masonryMarginM > scope.sizeM[1])
    throw new Error("Round-headed opening must fit within the facade cell and masonry margins.");
  if (springHeight <= 2 * p.frameWidthM || innerRadius <= 0.075)
    throw new Error("Round-headed opening must leave a clear framed opening below its spring line.");
  if (p.revealDepthM >= scope.sizeM[2]) throw new Error("Round-headed reveal must fit within the wall depth.");
  const centerX = scope.originM[0] + scope.sizeM[0] / 2, bottomY = scope.originM[1] + p.sillM;
  const springY = bottomY + springHeight;
  return ConstructionRoundHeadPlanSchema.parse({
    schemaVersion: "0.1.0", kind: "construction-round-head-plan", source,
    aperture: contour(centerX, bottomY, springY, radius),
    glazing: contour(centerX, bottomY + p.frameWidthM, springY, innerRadius),
    revealDepthM: p.revealDepthM
  });
}

/** Derived geometry must replay exactly from the admitted source. */
export function readConstructionRoundHeadPlan(input: unknown): ConstructionRoundHeadPlan {
  const parsed = ConstructionRoundHeadPlanSchema.parse(input), expected = resolveConstructionRoundHead(parsed.source);
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("Round-headed aperture plan does not match its source.");
  return expected;
}
