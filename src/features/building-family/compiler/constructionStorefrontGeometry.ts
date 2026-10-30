import type { ConstructionStorefrontPlan } from "../contracts/constructionStorefront";
import { readConstructionStorefrontPlan } from "../core/constructionStorefront";
import { buildBoxPrimitive, type PrimitiveGeometry } from "./primitiveGeometry";
import { buildConstructionTimberRail as timberRail } from "./bayWindowGeometry";
import { readConstructionStorefrontDivision } from "../core/constructionStorefrontDivision";
import type { ConstructionStorefrontDivisionPlan } from "../contracts/constructionStorefrontDivision";

/** Boxes use physical metres on every face, including pane edges and leaf panels. */
function box(center: [number, number, number], size: [number, number, number]): PrimitiveGeometry {
  const geometry = buildBoxPrimitive({ center, size });
  for (let i = 0; i < geometry.positions.length / 3; i++) {
    const p = i * 3, nx = Math.abs(geometry.normals[p]), ny = Math.abs(geometry.normals[p + 1]);
    geometry.uvs[i * 2] = nx > 0.9 ? geometry.positions[p + 2] - geometry.bounds.min[2] : geometry.positions[p] - geometry.bounds.min[0];
    geometry.uvs[i * 2 + 1] = ny > 0.9 ? geometry.positions[p + 2] - geometry.bounds.min[2] : geometry.positions[p + 1] - geometry.bounds.min[1];
  }
  return geometry;
}

/** Shared prototypes are centered on the aperture X and the floor-base Y. */
export function buildConstructionStorefrontGeometry(input: ConstructionStorefrontPlan, thresholdProjectionM = 0.15) {
  const plan = readConstructionStorefrontPlan(input), p = plan.source.parameters;
  if (!Number.isFinite(thresholdProjectionM) || thresholdProjectionM < 0.02 || thresholdProjectionM > 0.4) {
    throw new Error("Storefront threshold projection is outside its supported range.");
  }
  const { aperture: a } = plan, baseY = plan.source.scope.originM[1];
  const centerX = a.leftM + a.widthM / 2;
  const frame: PrimitiveGeometry[] = [], glass: PrimitiveGeometry[] = [], leaf: PrimitiveGeometry[] = [], hardware: PrimitiveGeometry[] = [];
  const bottom = a.bottomM - baseY, top = bottom + a.heightM, z = -p.recessM - 0.04, t = p.frameWidthM;
  const ring = [
    timberRail(a.heightM, t, 0.08, [-(a.widthM - t) / 2, bottom + a.heightM / 2, z], true, true),
    timberRail(a.heightM, t, 0.08, [(a.widthM - t) / 2, bottom + a.heightM / 2, z], true, true),
    timberRail(a.widthM - t * 2, t, 0.08, [0, bottom + t / 2, z], false, true),
    timberRail(a.widthM - t * 2, t, 0.08, [0, top - t / 2, z], false, true)
  ];
  frame.push(...(plan.source.assembly === "display" ? ring : [ring[0], ring[1], ring[3]]));
  const rail = plan.transomRail;
  frame.push(timberRail(rail.widthM, rail.heightM, 0.08, [0, rail.bottomM - baseY + rail.heightM / 2, z], false, true));
  const pane = (region: ConstructionStorefrontPlan["lowerClearRegion"]) => box(
    [region.leftM + region.widthM / 2 - centerX, region.bottomM + region.heightM / 2 - baseY, -p.recessM - 0.055],
    [region.widthM, region.heightM, 0.006]);
  glass.push(pane(plan.transomClearRegion));
  if (plan.source.assembly === "display") glass.push(pane(plan.lowerClearRegion));
  else {
    const leafWidth = a.widthM - t * 2 - 0.012, leafBottom = 0.035, leafTop = rail.bottomM - baseY - 0.012;
    const stile = Math.min(0.11, t * 1.4), leafZ = -p.recessM - 0.022, clearWidth = leafWidth - stile * 2, kickTop = 0.45;
    if (clearWidth < 0.035 || leafTop - stile <= kickTop + stile / 2) throw new Error("The glazed door leaf does not fit its storefront opening.");
    leaf.push(timberRail(leafTop - leafBottom, stile, 0.045, [-(leafWidth - stile) / 2, (leafBottom + leafTop) / 2, leafZ], true, true),
      timberRail(leafTop - leafBottom, stile, 0.045, [(leafWidth - stile) / 2, (leafBottom + leafTop) / 2, leafZ], true, true));
    for (const y of [leafBottom + stile / 2, kickTop, leafTop - stile / 2]) leaf.push(timberRail(clearWidth, stile, 0.045, [0, y, leafZ], false, true));
    const panelBottom = leafBottom + stile, panelTop = kickTop - stile / 2;
    leaf.push(box([0, (panelBottom + panelTop) / 2, leafZ - 0.014], [clearWidth, panelTop - panelBottom, 0.018]));
    leaf.push(timberRail(panelTop - panelBottom, 0.018, 0.025, [-clearWidth / 2 + 0.009, (panelTop + panelBottom) / 2, leafZ - 0.002], true, true),
      timberRail(panelTop - panelBottom, 0.018, 0.025, [clearWidth / 2 - 0.009, (panelTop + panelBottom) / 2, leafZ - 0.002], true, true));
    for (const y of [panelBottom + 0.009, panelTop - 0.009]) leaf.push(timberRail(clearWidth - 0.036, 0.018, 0.025, [0, y, leafZ - 0.002], false, true));
    const glassBottom = kickTop + stile / 2, glassTop = leafTop - stile;
    glass.push(box([0, (glassBottom + glassTop) / 2, leafZ - 0.014], [clearWidth, glassTop - glassBottom, 0.006]));
    const pullX = leafWidth / 2 - stile * 0.7;
    hardware.push(box([pullX, 1.1, -p.recessM + 0.025], [0.022, 0.2, 0.024]),
      ...[1.025, 1.175].map(y => box([pullX, y, -p.recessM + 0.003], [0.025, 0.025, 0.045])));
  }
  // Seat the display cap on the bulkhead instead of burying its thickness in it.
  // A top at `bottom` coincides with the exposed masonry reveal and z-fights.
  const trim = [box([0, plan.source.assembly === "display" ? bottom + 0.015 : 0.015, -p.recessM / 2 + thresholdProjectionM / 2],
    [a.widthM + 0.08, 0.03, p.recessM + thresholdProjectionM])];
  // The header bounds must remain entirely inside the authored aperture.
  if (top <= bottom || !frame.length) throw new Error("Storefront frame is empty.");
  return { frame, glass, leaf, hardware, trim };
}

/** Build individual display/transom panes and structural mullions from one replayed plan. */
export function buildConstructionDividedStorefrontGeometry(input: ConstructionStorefrontDivisionPlan, thresholdProjectionM = 0.15) {
  const plan = readConstructionStorefrontDivision(input), storefront = plan.source.storefront;
  const base = buildConstructionStorefrontGeometry(storefront, thresholdProjectionM), p = storefront.source.parameters;
  const centerX = storefront.aperture.leftM + storefront.aperture.widthM / 2, baseY = storefront.source.scope.originM[1];
  const pane = (region: typeof storefront.transomClearRegion) => box(
    [region.leftM + region.widthM / 2 - centerX, region.bottomM + region.heightM / 2 - baseY, -p.recessM - 0.055],
    [region.widthM, region.heightM, 0.006]);
  const mullion = (region: typeof storefront.transomClearRegion) => timberRail(region.heightM, region.widthM, 0.08,
    [region.leftM + region.widthM / 2 - centerX, region.bottomM + region.heightM / 2 - baseY, -p.recessM - 0.04], true, true);
  return { ...base, frame: [...base.frame, ...plan.transom.mullions.map(mullion), ...(plan.display?.mullions.map(mullion) ?? [])],
    glass: [...plan.transom.panes.map(pane), ...(plan.display ? plan.display.panes.map(pane) : base.glass.slice(1))] };
}
