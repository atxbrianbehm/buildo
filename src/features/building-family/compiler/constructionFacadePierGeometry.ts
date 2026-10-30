import { readConstructionFacadePierPlan } from "../core/constructionFacadePier";
import { buildConstructionBevelledBox } from "./constructionBevelledBox";
import type { PrimitiveGeometry } from "./primitiveGeometry";

/** Front-local geometry: z=0 is the wall face and positive z projects outward. */
export function buildConstructionFacadePierGeometry(input: unknown): Array<{ floorIndex: number; edgeIndex: number; parts: PrimitiveGeometry[] }> {
  const plan = readConstructionFacadePierPlan(input), { projectionM, endHeightM } = plan.source;
  return plan.piers.map(pier => {
    const shaftBottom = pier.bottomM + endHeightM, shaftTop = pier.topM - endHeightM;
    const box = (width: number, bottom: number, top: number, depth: number) => buildConstructionBevelledBox({
      center: [pier.centerXM, (bottom + top) / 2, depth / 2 - 0.002], size: [width, top - bottom, depth],
      bevelM: Math.min(width, top - bottom, depth) * 0.06 });
    return { floorIndex: pier.floorIndex, edgeIndex: pier.edgeIndex, parts: [
      box(pier.endWidthM, pier.bottomM, shaftBottom, projectionM * 1.2),
      box(pier.shaftWidthM, shaftBottom, shaftTop, projectionM),
      box(pier.endWidthM, shaftTop, pier.topM, projectionM * 1.2)
    ] };
  });
}
