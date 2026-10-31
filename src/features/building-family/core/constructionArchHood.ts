import { ConstructionArchHoodPlanSchema, ConstructionArchHoodRequestSchema } from "../contracts/constructionArchHood";
import { readConstructionRoundHeadPlan } from "./constructionRoundHead";
import { canonicalJson } from "./canonicalJson";

/** Plan separate radial stones within the source window's front-facade scope. */
export function resolveConstructionArchHood(input: unknown) {
  const parsed = ConstructionArchHoodRequestSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Arch hood admission would change serialized fields.");
  const source = structuredClone(parsed), opening = readConstructionRoundHeadPlan(source.opening), scope = opening.source.scope;
  // Four chords per stone must remain outside the circular aperture even at the widest supported opening.
  const apertureRadius = opening.aperture.radiusM;
  const radius = Math.max(apertureRadius + 0.005, apertureRadius / Math.cos(Math.PI / (8 * source.stoneCount)) + 0.002);
  const outer = radius + source.bandM + source.keystoneRiseM;
  const centerX = (opening.aperture.pointsM[0][0] + opening.aperture.pointsM[1][0]) / 2, centerY = opening.aperture.springY;
  if (centerX - outer < scope.originM[0] + 0.02 || centerX + outer > scope.originM[0] + scope.sizeM[0] - 0.02 || centerY + outer > scope.originM[1] + scope.sizeM[1] - 0.02)
    throw new Error("Arch hood needs masonry clearance within its facade scope.");
  const step = Math.PI / source.stoneCount, halfGap = source.jointM / (2 * (radius + source.bandM / 2));
  if (halfGap * 2 >= step / 2) throw new Error("Arch hood joints are too wide for the stones.");
  const stones = Array.from({ length: source.stoneCount }, (_, index) => ({ startRad: index * step + (index ? halfGap : 0),
    endRad: (index + 1) * step - (index + 1 < source.stoneCount ? halfGap : 0), outerRadiusM: radius + source.bandM + (index === (source.stoneCount - 1) / 2 ? source.keystoneRiseM : 0), keystone: index === (source.stoneCount - 1) / 2 }));
  return ConstructionArchHoodPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-arch-hood-plan", source, centerM: [centerX, centerY], innerRadiusM: radius, stones });
}

export function readConstructionArchHoodPlan(input: unknown) {
  const parsed = ConstructionArchHoodPlanSchema.parse(input), replay = resolveConstructionArchHood(parsed.source);
  if (canonicalJson(input) !== canonicalJson(replay)) throw new Error("Arch hood plan does not match its source.");
  return replay;
}
