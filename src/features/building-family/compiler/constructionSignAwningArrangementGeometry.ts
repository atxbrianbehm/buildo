import { readConstructionSignAwningArrangement } from "../core/constructionSignAwningArrangement";
import { resolveConstructionStorefrontSign } from "../core/constructionStorefrontSign";
import { resolveConstructionAwning } from "../core/constructionAwning";
import { buildConstructionStorefrontSignGeometry } from "./constructionStorefrontSignGeometry";
import { buildConstructionAwningGeometry } from "./constructionAwningGeometry";
import type { PrimitiveGeometry } from "./primitiveGeometry";

/** Bay-local geometry; sign and canopy retain their own material surfaces. */
export function buildConstructionSignAwningArrangementGeometry(input: unknown) {
  const plan = readConstructionSignAwningArrangement(input), source = plan.source;
  const sign = resolveConstructionStorefrontSign({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-request", storefront: source.storefront, ...source.sign, awningPresent: false });
  const awning = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: source.storefront, ...source.awning });
  const x = awning.centerAlongM - source.storefront.source.scope.originM[0];
  const move = (part: PrimitiveGeometry): PrimitiveGeometry => ({ ...part, positions: part.positions.map((value, index) => index % 3 === 0 ? value + x : index % 3 === 1 ? value + plan.awningShiftYM : value),
    bounds: { min: [part.bounds.min[0] + x, part.bounds.min[1] + plan.awningShiftYM, part.bounds.min[2]], max: [part.bounds.max[0] + x, part.bounds.max[1] + plan.awningShiftYM, part.bounds.max[2]] } });
  const canopy = buildConstructionAwningGeometry(awning);
  return { sign: buildConstructionStorefrontSignGeometry(sign), awning: { roof: move(canopy.roof), valance: move(canopy.valance) } };
}
