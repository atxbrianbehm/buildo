import { ConstructionFacadePierPlanSchema, ConstructionFacadePierRequestSchema, type ConstructionFacadePierPlan } from "../contracts/constructionFacadePier";
import { canonicalJson } from "./canonicalJson";

/** Plan upper-front piers inside explicitly supplied floor and opening clearances. */
export function resolveConstructionFacadePiers(input: unknown): ConstructionFacadePierPlan {
  const source = ConstructionFacadePierRequestSchema.parse(input);
  const { facadeWidthM: width, bayCount, floors, pierWidthM, endHeightM, clearanceM } = source;
  const endWidthM = pierWidthM * 1.2, bayWidth = width / bayCount;
  if (endWidthM + clearanceM * 2 >= bayWidth) throw new Error("Pier ends need clearance within each bay.");
  const indices = new Set<number>();
  for (const [i, floor] of floors.entries()) {
    if (indices.has(floor.floorIndex) || (i > 0 && (floor.floorIndex <= floors[i - 1].floorIndex || floor.bottomM < floors[i - 1].topM)))
      throw new Error("Pier floors must be unique, ordered and non-overlapping.");
    indices.add(floor.floorIndex);
    if (floor.topM - floor.bottomM <= endHeightM * 2 + 0.1) throw new Error("Pier floor clearance is too short for the end blocks and shaft.");
    for (const [left, right] of floor.openingSpans) if (left >= right || left < -width / 2 || right > width / 2)
      throw new Error("Opening clearance spans must be ordered and fit the facade.");
  }
  const piers = floors.flatMap(floor => Array.from({ length: bayCount + 1 }, (_, edgeIndex) => {
    const centerXM = edgeIndex === 0 ? -width / 2 + endWidthM / 2 : edgeIndex === bayCount ? width / 2 - endWidthM / 2 : -width / 2 + edgeIndex * bayWidth;
    const left = centerXM - endWidthM / 2 - clearanceM, right = centerXM + endWidthM / 2 + clearanceM;
    if (floor.openingSpans.some(([a, b]) => left < b && right > a)) throw new Error(`Pier ${edgeIndex} on floor ${floor.floorIndex} conflicts with an opening clearance.`);
    return { floorIndex: floor.floorIndex, edgeIndex, centerXM, bottomM: floor.bottomM, topM: floor.topM, shaftWidthM: pierWidthM, endWidthM };
  }));
  return ConstructionFacadePierPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-facade-pier-plan", source, piers });
}

export function readConstructionFacadePierPlan(input: unknown): ConstructionFacadePierPlan {
  const plan = ConstructionFacadePierPlanSchema.parse(input), expected = resolveConstructionFacadePiers(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Facade pier plan does not match its source.");
  return expected;
}
