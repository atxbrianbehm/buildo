import {
  ConstructionStorefrontPlanSchema,
  ConstructionStorefrontRequestSchema,
  type ConstructionStorefrontPlan
} from "../contracts/constructionStorefront";
import { canonicalJson } from "./canonicalJson";

const MIN_CLEAR_REGION_M = 0.15;

/** Plan a real aperture and framed subdivisions in facade-local metre coordinates. */
export function resolveConstructionStorefront(input: unknown): ConstructionStorefrontPlan {
  const source = ConstructionStorefrontRequestSchema.parse(input);
  const { scope, parameters: p } = source;
  if (scope.face !== "front" || scope.floorIndex !== 0) {
    throw new Error("Storefronts currently require a front ground-floor scope.");
  }
  if (p.recessM + 0.08 >= scope.sizeM[2]) {
    throw new Error("Storefront recess must fit inside the wall depth.");
  }

  const availableWidthM = scope.sizeM[0] - p.pierWidthM * 2;
  const widthM = source.assembly === "display" ? availableWidthM : p.entranceWidthM;
  if (widthM > availableWidthM || widthM <= p.frameWidthM * 4) {
    throw new Error("Storefront width must retain its masonry piers and clear framed opening.");
  }
  const sillM = source.assembly === "display" ? p.bulkheadHeightM : 0;
  const aperture = {
    leftM: scope.originM[0] + (scope.sizeM[0] - widthM) / 2,
    bottomM: scope.originM[1] + sillM,
    widthM,
    heightM: scope.sizeM[1] - p.headHeightM - sillM
  };
  const innerLeftM = aperture.leftM + p.frameWidthM;
  const clearWidthM = widthM - p.frameWidthM * 2;
  const railBottomM = scope.originM[1] + p.transomBaseM;
  const lowerBottomM = aperture.bottomM + p.frameWidthM;
  const transomBottomM = railBottomM + p.frameWidthM;
  const transomTopM = aperture.bottomM + aperture.heightM - p.frameWidthM;
  if (railBottomM - lowerBottomM < MIN_CLEAR_REGION_M || transomTopM - transomBottomM < MIN_CLEAR_REGION_M) {
    throw new Error("Storefront transom must leave at least 150 mm clear above and below its rail.");
  }

  return ConstructionStorefrontPlanSchema.parse({
    schemaVersion: "0.1.0",
    kind: "construction-storefront-plan",
    source,
    aperture,
    lowerClearRegion: { leftM: innerLeftM, bottomM: lowerBottomM, widthM: clearWidthM, heightM: railBottomM - lowerBottomM },
    transomRail: { leftM: innerLeftM, bottomM: railBottomM, widthM: clearWidthM, heightM: p.frameWidthM },
    transomClearRegion: { leftM: innerLeftM, bottomM: transomBottomM, widthM: clearWidthM, heightM: transomTopM - transomBottomM }
  });
}

/** Reject stale/tampered derived rectangles rather than silently repairing saved data. */
export function readConstructionStorefrontPlan(input: unknown): ConstructionStorefrontPlan {
  const parsed = ConstructionStorefrontPlanSchema.parse(input);
  const expected = resolveConstructionStorefront(parsed.source);
  if (canonicalJson(parsed) !== canonicalJson(expected)) {
    throw new Error("Storefront plan dimensions do not match their source.");
  }
  return expected;
}
