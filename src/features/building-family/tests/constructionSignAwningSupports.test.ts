import { describe, expect, it } from "vitest";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { resolveConstructionSignAwningArrangement } from "../core/constructionSignAwningArrangement";
import { readConstructionSignAwningSupports, resolveConstructionSignAwningSupports } from "../core/constructionSignAwningSupports";
import { buildConstructionSignAwningSupportGeometry } from "../compiler/constructionSignAwningSupportGeometry";

const request = () => {
  const storefront = resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly: "display",
    scope: { id: "front/0/1", face: "front", floorIndex: 0, bayIndex: 1, originM: [1, 0, -0.36], sizeM: [2.8, 4, 0.36] },
    parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
  const arrangement = resolveConstructionSignAwningArrangement({ schemaVersion: "0.1.0", kind: "construction-sign-awning-arrangement-request", storefront,
    sign: { heightM: 0.3, projectionM: 0.08, frameWidthM: 0.035 }, awning: { projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, gapM: 0.04 });
  return { schemaVersion: "0.1.0", kind: "construction-sign-awning-support-request", arrangement, anchorRiseM: 0.15, thicknessM: 0.03 };
};

describe("sign and awning support study", () => {
  it("keeps both rods below the sign and moves them with the canopy", () => {
    const input = request(), original = structuredClone(input), plan = resolveConstructionSignAwningSupports(input), geometry = buildConstructionSignAwningSupportGeometry(plan);
    expect(readConstructionSignAwningSupports(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(plan.awningShiftYM).toBeLessThan(input.arrangement.awningShiftYM); expect(plan.lowerEdgeYM).toBeGreaterThanOrEqual(2.05);
    expect(plan.anchorBottomYM).toBeGreaterThanOrEqual(input.arrangement.source.storefront.aperture.bottomM + input.arrangement.source.storefront.aperture.heightM);
    expect(geometry.rods).toHaveLength(2);
    for (const rod of geometry.rods) expect(geometry.sign.panel.bounds.min[1] - rod.bounds.max[1]).toBeGreaterThanOrEqual(input.arrangement.source.gapM);
    expect(geometry.awning.valance.bounds.min[1]).toBeCloseTo(plan.lowerEdgeYM);
    expect(buildConstructionSignAwningSupportGeometry(plan)).toEqual(geometry); expect(input).toEqual(original);
  });
  it("rejects unsupported clearance and tampered plans", () => {
    const input = request(); expect(() => resolveConstructionSignAwningSupports({ ...input, anchorRiseM: 0.6 })).toThrow(/ground clearance|storefront storey/);
    const wideGap = resolveConstructionSignAwningArrangement({ ...input.arrangement.source, gapM: 0.1 });
    expect(() => resolveConstructionSignAwningSupports({ ...input, arrangement: wideGap })).toThrow(/storefront opening/);
    const plan = resolveConstructionSignAwningSupports(input); plan.anchorTopYM += 0.01;
    expect(() => readConstructionSignAwningSupports(plan)).toThrow(/do not match/);
  });
});
