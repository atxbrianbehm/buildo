import { ConstructionParapetSilhouettePlanSchema, ConstructionParapetSilhouetteRequestSchema,
  type ConstructionParapetSilhouettePlan } from "../contracts/constructionParapetSilhouette";
import { canonicalJson } from "./canonicalJson";

/** Plan the front elevation only; geometry and renderer ownership remain downstream. */
export function resolveConstructionParapetSilhouette(input: unknown): ConstructionParapetSilhouettePlan {
  const source = ConstructionParapetSilhouetteRequestSchema.parse(input);
  const { widthM, depthM, heightM } = source.building;
  const { heightM: parapetHeightM, copingProjectionM } = source.parapet;
  // Leave room for the existing 0.22 m parapet thickness, coping and both shoulders.
  if (widthM <= 0.44 + 2 * copingProjectionM || depthM <= 0.44 + 2 * copingProjectionM ||
      (source.treatment === "raised-center" && widthM / 4 <= 0.22 + 2 * copingProjectionM)) {
    throw new Error("Parapet shoulders and coping do not fit the footprint.");
  }
  const lowTopM = heightM + parapetHeightM;
  const highTopM = source.treatment === "raised-center" ? lowTopM + parapetHeightM * 0.75 : lowTopM;
  const left = -widthM / 2, right = widthM / 2;
  const spans = source.treatment === "flat" ? [{ startM: left, endM: right, topM: lowTopM }] : [
    { startM: left, endM: -widthM / 4, topM: lowTopM },
    { startM: -widthM / 4, endM: widthM / 4, topM: highTopM },
    { startM: widthM / 4, endM: right, topM: lowTopM }
  ];
  const copingPath = [{ alongM: left, topM: lowTopM }];
  for (let i = 0; i < spans.length; i++) {
    copingPath.push({ alongM: spans[i].endM, topM: spans[i].topM });
    if (i + 1 < spans.length) copingPath.push({ alongM: spans[i].endM, topM: spans[i + 1].topM });
  }
  return ConstructionParapetSilhouettePlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-parapet-silhouette-plan",
    source, baseM: heightM, lowTopM, highTopM, spans, copingPath });
}

/** A serialized plan is trusted only when every derived value matches its source. */
export function readConstructionParapetSilhouettePlan(input: unknown): ConstructionParapetSilhouettePlan {
  const plan = ConstructionParapetSilhouettePlanSchema.parse(input);
  const expected = resolveConstructionParapetSilhouette(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Parapet silhouette plan does not match its source.");
  return expected;
}
