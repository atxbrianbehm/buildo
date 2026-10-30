import { describe, expect, it } from "vitest";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { readConstructionSignAwningArrangement, resolveConstructionSignAwningArrangement } from "../core/constructionSignAwningArrangement";
import { buildConstructionSignAwningArrangementGeometry } from "../compiler/constructionSignAwningArrangementGeometry";

const storefront = () => resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly: "display",
  scope: { id: "front/0/1", face: "front", floorIndex: 0, bayIndex: 1, originM: [1, 0, -0.36], sizeM: [2.8, 4, 0.36] },
  parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
const request = () => ({ schemaVersion: "0.1.0", kind: "construction-sign-awning-arrangement-request", storefront: storefront(),
  sign: { heightM: 0.3, projectionM: 0.08, frameWidthM: 0.035 }, awning: { projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, gapM: 0.04 });

describe("sign and awning arrangement study", () => {
  it("owns and replays a joint plan with enough ground clearance", () => {
    const input = request(), before = structuredClone(input), plan = resolveConstructionSignAwningArrangement(input);
    expect(plan.awningShiftYM).toBeLessThan(0); expect(plan.lowerEdgeYM).toBeGreaterThanOrEqual(2.05);
    expect(readConstructionSignAwningArrangement(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    plan.source.sign.heightM = 0.2; expect(input).toEqual(before);
  });
  it("constructs separate surfaces with a physical gap in one bay", () => {
    const plan = resolveConstructionSignAwningArrangement(request()), result = buildConstructionSignAwningArrangementGeometry(plan);
    expect(result.sign.panel.bounds.min[1] - result.awning.roof.bounds.max[1]).toBeGreaterThanOrEqual(plan.source.gapM);
    expect(result.awning.valance.bounds.min[1]).toBeCloseTo(plan.lowerEdgeYM);
    expect(result.sign.panel.bounds.min[0]).toBeLessThan(result.awning.roof.bounds.max[0]);
    expect(result.sign.panel.bounds.max[0]).toBeGreaterThan(result.awning.roof.bounds.min[0]);
    expect(result.sign.frame).toHaveLength(4);
    for (const mesh of [result.sign.panel, ...result.sign.frame, result.awning.roof, result.awning.valance]) expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(buildConstructionSignAwningArrangementGeometry(plan)).toEqual(result);
  });
  it("rejects insufficient clearance and altered plans", () => {
    const low = request(); low.storefront = resolveConstructionStorefront({ ...low.storefront.source, scope: { ...low.storefront.source.scope, sizeM: [2.8, 3.2, 0.36] } });
    expect(() => resolveConstructionSignAwningArrangement({ ...low, gapM: 0.15 })).toThrow(/ground clearance/);
    const plan = resolveConstructionSignAwningArrangement(request()); plan.awningShiftYM += 0.01;
    expect(() => readConstructionSignAwningArrangement(plan)).toThrow(/does not match/);
  });
});
