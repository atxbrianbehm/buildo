import { describe, expect, it } from "vitest";
import { ConstructionStorefrontRequestSchema, type ConstructionStorefrontRequest } from "../contracts/constructionStorefront";
import { readConstructionStorefrontPlan, resolveConstructionStorefront } from "../core/constructionStorefront";

function request(): ConstructionStorefrontRequest {
  return {
    schemaVersion: "0.1.0", kind: "construction-storefront-request",
    scope: { id: "building/study/front/floor/0/bay/0", face: "front", floorIndex: 0, bayIndex: 0, originM: [-5.6, 0, -0.36], sizeM: [2.8, 4, 0.36] },
    assembly: "display",
    parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 }
  };
}

describe("construction storefront aperture planning", () => {
  it("makes a wide display opening with real masonry margins, bulkhead and head band", () => {
    const input = request(), plan = resolveConstructionStorefront(input), a = plan.aperture;
    expect(a.widthM).toBeCloseTo(2.48);
    expect(a.leftM - input.scope.originM[0]).toBeCloseTo(0.16);
    expect(input.scope.originM[0] + input.scope.sizeM[0] - a.leftM - a.widthM).toBeCloseTo(0.16);
    expect(a.bottomM).toBe(0.55);
    expect(a.heightM).toBeCloseTo(3);
    expect(input.scope.sizeM[1] - a.bottomM - a.heightM).toBeCloseTo(0.45);
  });

  it("plans a grade-level entrance without lifting its threshold onto the display bulkhead", () => {
    const input = request(); input.assembly = "glazed-entrance";
    const plan = resolveConstructionStorefront(input);
    expect(plan.aperture.bottomM).toBe(0);
    expect(plan.aperture.widthM).toBe(1.22);
    expect(plan.aperture.heightM).toBeCloseTo(3.55);
    input.parameters.bulkheadHeightM = 1.2;
    expect(resolveConstructionStorefront(input).aperture).toEqual(plan.aperture);
  });

  it("partitions the framed interior with no overlap, gap or pane outside its aperture", () => {
    for (const assembly of ["display", "glazed-entrance"] as const) {
      const input = request(); input.assembly = assembly;
      const p = resolveConstructionStorefront(input), frame = input.parameters.frameWidthM;
      const parts = [p.lowerClearRegion, p.transomRail, p.transomClearRegion];
      expect(parts[0].bottomM).toBeCloseTo(p.aperture.bottomM + frame);
      expect(parts[0].bottomM + parts[0].heightM).toBe(parts[1].bottomM);
      expect(parts[1].bottomM + parts[1].heightM).toBe(parts[2].bottomM);
      expect(parts[2].bottomM + parts[2].heightM).toBeCloseTo(p.aperture.bottomM + p.aperture.heightM - frame);
      for (const part of parts) {
        expect(part.leftM).toBe(p.aperture.leftM + frame);
        expect(part.leftM + part.widthM).toBeCloseTo(p.aperture.leftM + p.aperture.widthM - frame);
        expect(part.widthM).toBeGreaterThan(0); expect(part.heightM).toBeGreaterThan(0);
      }
    }
  });

  it("keeps a common transom line between the display and entrance", () => {
    const input = request(), display = resolveConstructionStorefront(input);
    input.assembly = "glazed-entrance";
    const entrance = resolveConstructionStorefront(input);
    expect(entrance.transomRail.bottomM).toBe(display.transomRail.bottomM);
    expect(entrance.transomClearRegion.bottomM).toBe(display.transomClearRegion.bottomM);
    expect(entrance.transomClearRegion.heightM).toBe(display.transomClearRegion.heightM);
  });

  it("preserves identity, uses owned input and survives literal JSON continuation deterministically", () => {
    const input = request(), before = structuredClone(input), plan = resolveConstructionStorefront(input);
    expect(plan.source.scope).toEqual(input.scope);
    expect(resolveConstructionStorefront(input)).toEqual(plan);
    expect(readConstructionStorefrontPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    plan.source.scope.originM[0] = 999; plan.source.parameters.pierWidthM = 0.8;
    expect(input).toEqual(before);
    const saved = resolveConstructionStorefront(input), reopened = readConstructionStorefrontPlan(saved);
    reopened.source.scope.sizeM[0] = 5;
    expect(saved.source.scope.sizeM[0]).toBe(2.8);
  });

  it("moves every rectangle with an elevated/translated scope without changing its local fit", () => {
    const input = request(), original = resolveConstructionStorefront(input);
    input.scope.originM[0] += 12; input.scope.originM[1] += 0.4;
    const translated = resolveConstructionStorefront(input);
    for (const key of ["aperture", "lowerClearRegion", "transomRail", "transomClearRegion"] as const) {
      expect(translated[key].leftM - original[key].leftM).toBeCloseTo(12);
      expect(translated[key].bottomM - original[key].bottomM).toBeCloseTo(0.4);
      expect(translated[key].widthM).toBe(original[key].widthM);
      expect(translated[key].heightM).toBeCloseTo(original[key].heightM);
    }
  });

  it("responds independently to bay width, bulkhead, head, transom and recess parameters", () => {
    const input = request(), original = resolveConstructionStorefront(input);
    input.scope.sizeM[0] = 3.2;
    expect(resolveConstructionStorefront(input).aperture.widthM - original.aperture.widthM).toBeCloseTo(0.4);
    input.parameters.bulkheadHeightM += 0.1;
    expect(resolveConstructionStorefront(input).lowerClearRegion.heightM).toBeCloseTo(original.lowerClearRegion.heightM - 0.1);
    input.parameters.headHeightM += 0.1;
    expect(resolveConstructionStorefront(input).transomClearRegion.heightM).toBeCloseTo(original.transomClearRegion.heightM - 0.1);
    input.parameters.transomBaseM += 0.2;
    expect(resolveConstructionStorefront(input).transomRail.bottomM).toBeCloseTo(original.transomRail.bottomM + 0.2);
    input.parameters.recessM = 0.2;
    expect(resolveConstructionStorefront(input).source.parameters.recessM).toBe(0.2);
  });

  it.each(["rear", "left", "right"] as const)("refuses to rewrite the %s elevation", face => {
    const input = request(); input.scope.face = face;
    expect(() => resolveConstructionStorefront(input)).toThrow("front ground-floor");
  });
  it("refuses an upper floor rather than silently converting its window", () => {
    const input = request(); input.scope.floorIndex = 1;
    expect(() => resolveConstructionStorefront(input)).toThrow("front ground-floor");
  });

  it.each([
    ["narrow masonry", (input: ConstructionStorefrontRequest) => { input.scope.sizeM[0] = 0.55; }, "masonry piers"],
    ["wide entrance", (input: ConstructionStorefrontRequest) => { input.assembly = "glazed-entrance"; input.parameters.entranceWidthM = 2.5; }, "masonry piers"],
    ["deep recess", (input: ConstructionStorefrontRequest) => { input.parameters.recessM = 0.28; }, "wall depth"],
    ["short transom", (input: ConstructionStorefrontRequest) => { input.scope.sizeM[1] = 2.8; }, "150 mm"],
    ["raised bulkhead", (input: ConstructionStorefrontRequest) => { input.parameters.bulkheadHeightM = 1.2; input.parameters.transomBaseM = 1.9; input.parameters.frameWidthM = 0.2; }, null]
  ] as const)("validates %s without mutating the requested source", (_label, edit, message) => {
    const input = request(); edit(input); const before = structuredClone(input);
    if (message) expect(() => resolveConstructionStorefront(input)).toThrow(message);
    else expect(resolveConstructionStorefront(input).lowerClearRegion.heightM).toBeCloseTo(0.5);
    expect(input).toEqual(before);
  });

  it.each([NaN, Infinity, -Infinity, "0.16", null])("rejects malformed physical dimensions %s", value => {
    const input = request(); Object.assign(input.parameters, { pierWidthM: value });
    expect(ConstructionStorefrontRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects unsupported versions, assemblies and unknown serialized fields", () => {
    const input = request();
    for (const patch of [{ schemaVersion: "0.2.0" }, { assembly: "arched" }, { materials: {} }]) {
      expect(ConstructionStorefrontRequestSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("rejects accessor-bearing, cyclic and non-JSON input before invoking getters", () => {
    const input = request(); let getterCalls = 0;
    Object.defineProperty(input.parameters, "pierWidthM", { enumerable: true, get() { getterCalls++; return 0.16; } });
    expect(() => resolveConstructionStorefront(input)).toThrow(); expect(getterCalls).toBe(0);
    const cyclic = request(); Object.assign(cyclic, { self: cyclic });
    expect(() => resolveConstructionStorefront(cyclic)).toThrow();
    const hidden = request(); Object.defineProperty(hidden, "hidden", { value: 1 });
    expect(() => resolveConstructionStorefront(hidden)).toThrow();
  });
  it("rejects changed derived rectangles and source dimensions without silently repairing them", () => {
    for (const key of ["aperture", "lowerClearRegion", "transomRail", "transomClearRegion"] as const) {
      const plan = resolveConstructionStorefront(request()); plan[key].widthM += 0.01;
      expect(() => readConstructionStorefrontPlan(plan)).toThrow("do not match");
    }
    const plan = resolveConstructionStorefront(request()); plan.source.parameters.headHeightM = 0.5;
    expect(() => readConstructionStorefrontPlan(plan)).toThrow("do not match");
  });
});
