import { ConstructionStorefrontDivisionPlanSchema, ConstructionStorefrontDivisionRequestSchema,
  type ConstructionStorefrontDivisionPlan } from "../contracts/constructionStorefrontDivision";
import { readConstructionStorefrontPlan } from "./constructionStorefront";
import { canonicalJson } from "./canonicalJson";

/** Divide actual clear regions, leaving physically sized mullions between the panes. */
export function resolveConstructionStorefrontDivision(input: unknown): ConstructionStorefrontDivisionPlan {
  const source = structuredClone(ConstructionStorefrontDivisionRequestSchema.parse(input));
  const storefront = readConstructionStorefrontPlan(source.storefront), p = storefront.source.parameters;
  if (storefront.source.assembly === "glazed-entrance" && source.displayLights !== 1)
    throw new Error("The entrance leaf cannot be divided as a display window.");
  function divide(region: typeof storefront.transomClearRegion, count: number) {
    const clearWidth = (region.widthM - (count - 1) * p.frameWidthM) / count;
    if (clearWidth < 0.15) throw new Error("Storefront divisions must retain 150 mm of clear width per light.");
    const panes = Array.from({ length: count }, (_, index) => ({ ...region,
      leftM: region.leftM + index * (clearWidth + p.frameWidthM), widthM: clearWidth }));
    const mullions = Array.from({ length: count - 1 }, (_, index) => ({ ...region,
      leftM: region.leftM + (index + 1) * clearWidth + index * p.frameWidthM, widthM: p.frameWidthM }));
    return { panes, mullions };
  }
  return ConstructionStorefrontDivisionPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-storefront-division-plan", source,
    transom: divide(storefront.transomClearRegion, source.transomLights),
    display: storefront.source.assembly === "display" ? divide(storefront.lowerClearRegion, source.displayLights) : null });
}

export function readConstructionStorefrontDivision(input: unknown): ConstructionStorefrontDivisionPlan {
  const plan = ConstructionStorefrontDivisionPlanSchema.parse(input), expected = resolveConstructionStorefrontDivision(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Storefront divisions do not match their source.");
  return expected;
}
