import { readConstructionSignAwningSupports } from "../core/constructionSignAwningSupports";
import { resolveConstructionAwning } from "../core/constructionAwning";
import { resolveConstructionAwningSupports } from "../core/constructionAwningSupports";
import { buildConstructionSignAwningArrangementGeometry } from "./constructionSignAwningArrangementGeometry";
import { buildConstructionAwningSupportGeometry } from "./constructionAwningSupportGeometry";
import type { PrimitiveGeometry } from "./primitiveGeometry";

/** Preserve original rod shape while moving the rods and canopy together in bay-local space. */
export function buildConstructionSignAwningSupportGeometry(input: unknown) {
  const plan = readConstructionSignAwningSupports(input), arrangement = plan.source.arrangement, source = arrangement.source;
  const awning = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: source.storefront, ...source.awning });
  const support = resolveConstructionAwningSupports({ schemaVersion: "0.1.0", kind: "construction-awning-support-request", awning, anchorRiseM: plan.source.anchorRiseM, thicknessM: plan.source.thicknessM });
  const move = (part: PrimitiveGeometry, x: number, y: number): PrimitiveGeometry => ({ ...part,
    positions: part.positions.map((value, index) => index % 3 === 0 ? value + x : index % 3 === 1 ? value + y : value),
    bounds: { min: [part.bounds.min[0] + x, part.bounds.min[1] + y, part.bounds.min[2]], max: [part.bounds.max[0] + x, part.bounds.max[1] + y, part.bounds.max[2]] } });
  const base = buildConstructionSignAwningArrangementGeometry(arrangement), extra = plan.awningShiftYM - arrangement.awningShiftYM;
  const x = awning.centerAlongM - source.storefront.source.scope.originM[0];
  return { sign: base.sign, awning: { roof: move(base.awning.roof, 0, extra), valance: move(base.awning.valance, 0, extra) },
    rods: buildConstructionAwningSupportGeometry(support).map(part => move(part, x, plan.awningShiftYM)) };
}
