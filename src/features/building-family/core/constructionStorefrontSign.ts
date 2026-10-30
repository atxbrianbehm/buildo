import { ConstructionStorefrontSignPlanSchema, ConstructionStorefrontSignRequestSchema, type ConstructionStorefrontSignPlan } from "../contracts/constructionStorefrontSign";
import { readConstructionStorefrontPlan } from "./constructionStorefront";
import { canonicalJson } from "./canonicalJson";

/** A framed demo sign in a storefront head band; coexistence with awnings is not yet resolved. */
export function resolveConstructionStorefrontSign(input: unknown): ConstructionStorefrontSignPlan {
  const source = structuredClone(ConstructionStorefrontSignRequestSchema.parse(input));
  const storefront = readConstructionStorefrontPlan(source.storefront), { scope, parameters } = storefront.source;
  if (source.awningPresent) throw new Error("Sign and awning placement need a shared clearance plan before they can coexist.");
  if (source.heightM + 0.08 > parameters.headHeightM) throw new Error("Sign height needs clearance within the storefront head band.");
  const widthM = scope.sizeM[0] - 0.16;
  if (widthM <= source.frameWidthM * 2 + 0.1 || source.heightM <= source.frameWidthM * 2 + 0.06)
    throw new Error("The sign frame needs room for a visible inset panel.");
  return ConstructionStorefrontSignPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-plan", source,
    centerAlongM: scope.originM[0] + scope.sizeM[0] / 2,
    bottomM: storefront.aperture.bottomM + storefront.aperture.heightM + (parameters.headHeightM - source.heightM) / 2, widthM });
}

export function readConstructionStorefrontSign(input: unknown): ConstructionStorefrontSignPlan {
  const plan = ConstructionStorefrontSignPlanSchema.parse(input), expected = resolveConstructionStorefrontSign(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Storefront sign dimensions do not match their source.");
  return expected;
}
