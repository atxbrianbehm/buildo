import { readConstructionStorefrontSign } from "../core/constructionStorefrontSign";
import { buildBoxPrimitive } from "./primitiveGeometry";

/** Closed panel and frame boxes in bay-local coordinates; materials and lettering are separate. */
export function buildConstructionStorefrontSignGeometry(input: unknown) {
  const plan = readConstructionStorefrontSign(input), { heightM: height, projectionM: depth, frameWidthM: frame } = plan.source;
  const x = plan.centerAlongM - plan.source.storefront.source.scope.originM[0], y = plan.bottomM - plan.source.storefront.source.scope.originM[1];
  const panel = buildBoxPrimitive({ center: [x, y + height / 2, depth / 2], size: [plan.widthM, height, depth] });
  const rail = (cx: number, cy: number, width: number, tall: number) => buildBoxPrimitive({ center: [cx, cy, depth + 0.01], size: [width, tall, 0.04] });
  return { panel, frame: [rail(x, y + frame / 2, plan.widthM, frame), rail(x, y + height - frame / 2, plan.widthM, frame),
    rail(x - plan.widthM / 2 + frame / 2, y + height / 2, frame, height - 2 * frame),
    rail(x + plan.widthM / 2 - frame / 2, y + height / 2, frame, height - 2 * frame)] };
}
