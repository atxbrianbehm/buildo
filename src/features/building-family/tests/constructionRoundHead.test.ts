import { describe, expect, it } from "vitest";
import { type ConstructionRoundHeadRequest } from "../contracts/constructionRoundHead";
import { readConstructionRoundHeadPlan, resolveConstructionRoundHead } from "../core/constructionRoundHead";

function request(): ConstructionRoundHeadRequest {
  return { schemaVersion: "0.1.0", kind: "construction-round-head-request",
    scope: { id: "building/a/front/floor/1/bay/2", face: "front", floorIndex: 1, bayIndex: 2, originM: [2, 4, -0.36], sizeM: [2.8, 3.4, 0.36] },
    parameters: { widthM: 1.4, heightM: 2.2, sillM: 0.6, frameWidthM: 0.08, revealDepthM: 0.14, masonryMarginM: 0.15 } };
}

describe("round-headed opening planning", () => {
  it("shares a semicircular spring line and concentric frame opening", () => {
    const plan = resolveConstructionRoundHead(request()), outer = plan.aperture, inner = plan.glazing;
    expect(outer.pointsM).toHaveLength(19); expect(inner.pointsM).toHaveLength(19);
    expect(outer.springY).toBeCloseTo(6.1); expect(inner.springY).toBe(outer.springY);
    expect(outer.radiusM).toBeCloseTo(0.7); expect(inner.radiusM).toBeCloseTo(0.62);
    expect(outer.pointsM[10][1]).toBeCloseTo(6.8);
    expect(inner.pointsM[10][1]).toBeCloseTo(6.72);
    expect(inner.pointsM[0][1] - outer.pointsM[0][1]).toBeCloseTo(0.08);
    for (let i = 2; i < 19; i++) {
      expect(Math.hypot(outer.pointsM[i][0] - 3.4, outer.pointsM[i][1] - outer.springY)).toBeCloseTo(outer.radiusM);
      expect(Math.hypot(inner.pointsM[i][0] - 3.4, inner.pointsM[i][1] - inner.springY)).toBeCloseTo(inner.radiusM);
    }
  });
  it("preserves identity, ownership and deterministic JSON replay", () => {
    const input = request(), plan = resolveConstructionRoundHead(input), saved = JSON.parse(JSON.stringify(plan));
    expect(plan.source.scope.id).toBe(input.scope.id);
    expect(readConstructionRoundHeadPlan(saved)).toEqual(plan);
    expect(resolveConstructionRoundHead(input)).toEqual(plan);
    plan.source.scope.originM[0] = 20;
    expect(input.scope.originM[0]).toBe(2);
    saved.aperture.pointsM[5][0] += 0.01;
    expect(() => readConstructionRoundHeadPlan(saved)).toThrow(/does not match/);
  });
  it("translates contours with the facade cell", () => {
    const input = request(), base = resolveConstructionRoundHead(input);
    input.scope.originM[0] += 8; input.scope.originM[1] += 2;
    const moved = resolveConstructionRoundHead(input);
    for (const name of ["aperture", "glazing"] as const) for (let i = 0; i < 19; i++) {
      expect(moved[name].pointsM[i][0] - base[name].pointsM[i][0]).toBeCloseTo(8);
      expect(moved[name].pointsM[i][1] - base[name].pointsM[i][1]).toBeCloseTo(2);
    }
  });
  it("rejects impossible fit, unsupported scopes and wall penetration", () => {
    const tooWide = request(); tooWide.parameters.widthM = 2.7;
    expect(() => resolveConstructionRoundHead(tooWide)).toThrow(/margins/);
    const tooTall = request(); tooTall.parameters.heightM = 3;
    expect(() => resolveConstructionRoundHead(tooTall)).toThrow(/margins/);
    const shallow = request(); shallow.parameters.revealDepthM = 0.36;
    expect(() => resolveConstructionRoundHead(shallow)).toThrow(/wall depth/);
    const headOnly = request(); headOnly.parameters.widthM = 2; headOnly.parameters.heightM = 1.05;
    expect(() => resolveConstructionRoundHead(headOnly)).toThrow(/spring line/);
    const side = request(); side.scope.face = "right";
    expect(() => resolveConstructionRoundHead(side)).toThrow(/front scope/);
    const ground = request(); ground.scope.floorIndex = 0;
    expect(() => resolveConstructionRoundHead(ground)).toThrow();
  });
  it("admits exact masonry margins and rejects the slightest excess", () => {
    const input = request(); input.parameters.widthM = input.scope.sizeM[0] - 2 * input.parameters.masonryMarginM;
    input.parameters.heightM = input.scope.sizeM[1] - input.parameters.sillM - input.parameters.masonryMarginM;
    expect(() => resolveConstructionRoundHead(input)).not.toThrow();
    input.parameters.widthM += 0.001;
    expect(() => resolveConstructionRoundHead(input)).toThrow(/margins/);
  });
  it("rejects malformed JSON, unknown fields, nonfinite values and wrong versions", () => {
    const invalid = request(); invalid.parameters.widthM = NaN;
    expect(() => resolveConstructionRoundHead(invalid)).toThrow();
    expect(() => resolveConstructionRoundHead({ ...request(), unexpected: true })).toThrow();
    expect(() => resolveConstructionRoundHead({ ...request(), schemaVersion: "0.2.0" })).toThrow();
    expect(() => resolveConstructionRoundHead({ ...request(), extra: undefined })).toThrow();
  });
});
