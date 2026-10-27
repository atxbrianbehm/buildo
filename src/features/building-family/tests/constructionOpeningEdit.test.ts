import { describe, expect, it } from "vitest";
import { type ConstructionOpeningWidthRequest } from "../contracts/constructionOpeningEdit";
import { constructionOpeningTargetFromSelection, readConstructionOpeningWidthPlan, resolveConstructionOpeningWidth } from "../core/constructionOpeningEdit";

function request(): ConstructionOpeningWidthRequest {
  return { schemaVersion: "0.1.0", kind: "construction-opening-width-request",
    target: { documentId: "study", storeysNodeId: "storeys", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 2 },
    widthM: 1.8, frameWidthM: 0.055,
    scope: { id: "storeys/floor/1/bay/2", face: "front", floorIndex: 1, bayIndex: 2,
      originM: [0, 4, -0.36], sizeM: [2.8, 3.2, 0.36],
      opening: { kind: "window", widthM: 1.3, heightM: 1.9, centerAlongM: 1.4, centerYM: 5.75 } } };
}

describe("selected upper-front opening width contract", () => {
  it("widens one addressed aperture while retaining height, centre and source", () => {
    const input = request(), before = structuredClone(input), plan = resolveConstructionOpeningWidth(input);
    expect(plan.opening).toEqual({ ...input.scope.opening, widthM: 1.8 });
    expect(plan.leftPierM).toBeCloseTo(0.5); expect(plan.rightPierM).toBeCloseTo(0.5);
    expect(input).toEqual(before); expect(plan.source.target).toEqual(input.target);
  });
  it("retains asymmetric masonry rather than recentering the selected opening", () => {
    const input = request(); input.scope.opening.centerAlongM = 1.1;
    const plan = resolveConstructionOpeningWidth(input);
    expect(plan.opening.centerAlongM).toBe(1.1);
    expect(plan.leftPierM).toBeCloseTo(0.2); expect(plan.rightPierM).toBeCloseTo(0.8);
  });
  it("allows narrowing and idempotent absolute widths", () => {
    const input = request(); input.widthM = 0.9;
    expect(resolveConstructionOpeningWidth(input).opening.widthM).toBe(0.9);
    input.widthM = input.scope.opening.widthM;
    expect(resolveConstructionOpeningWidth(input).opening).toEqual(input.scope.opening);
  });
  it("moves with translated scopes without changing local geometry", () => {
    const input = request(), before = resolveConstructionOpeningWidth(input);
    input.scope.originM[0] += 10; input.scope.opening.centerAlongM += 10;
    input.scope.originM[1] += 20; input.scope.opening.centerYM += 20;
    const after = resolveConstructionOpeningWidth(input);
    expect(after.leftPierM).toBeCloseTo(before.leftPierM); expect(after.rightPierM).toBeCloseTo(before.rightPierM);
    expect(after.opening.centerYM - before.opening.centerYM).toBe(20);
  });
  it.each([0.1, 2.7, 4])("rejects width %s rather than clamping or moving the opening", widthM => {
    const input = request(); input.widthM = widthM;
    expect(() => resolveConstructionOpeningWidth(input)).toThrow(/piers|frame/);
  });
  it("admits exactly 80 mm piers despite arithmetic roundoff and rejects a physical overrun", () => {
    const input = request(); input.widthM = 2.64;
    expect(resolveConstructionOpeningWidth(input).leftPierM).toBeCloseTo(0.08, 12);
    input.scope.originM[0] += 990; input.scope.opening.centerAlongM += 990;
    expect(resolveConstructionOpeningWidth(input).rightPierM).toBeCloseTo(0.08, 10);
    input.widthM += 1e-8;
    expect(() => resolveConstructionOpeningWidth(input)).toThrow(/piers/);
  });
  it.each(["id", "floorIndex", "bayIndex"] as const)("rejects a stale scope %s", key => {
    const input = request();
    if (key === "id") input.scope.id = "storeys/floor/1/bay/3"; else input.scope[key]++;
    expect(() => resolveConstructionOpeningWidth(input)).toThrow(/exact structural scope/);
  });
  it("rejects a source opening outside its cell or without room for a frame", () => {
    for (const patch of [{ centerAlongM: 0.4 }, { centerYM: 4.1 }, { centerYM: 7 }, { heightM: 0.1 }, { widthM: 0.1 }]) {
      const input = request(); Object.assign(input.scope.opening, patch);
      expect(() => resolveConstructionOpeningWidth(input)).toThrow(/source opening/);
    }
  });
  it("owns input and readback data and round-trips exactly", () => {
    const input = request(), plan = resolveConstructionOpeningWidth(input);
    expect(resolveConstructionOpeningWidth(JSON.parse(JSON.stringify(input)))).toEqual(plan);
    const saved = JSON.parse(JSON.stringify(plan)), reopened = readConstructionOpeningWidthPlan(saved);
    reopened.source.target.bayIndex = 9; reopened.source.scope.originM[0] = 99;
    expect(saved).toEqual(plan); plan.source.scope.opening.widthM = 3;
    expect(input.scope.opening.widthM).toBe(1.3);
  });
  it.each(["opening", "leftPierM", "rightPierM"] as const)("rejects tampered derived %s", key => {
    const plan = resolveConstructionOpeningWidth(request());
    if (key === "opening") plan.opening.widthM += 0.1; else plan[key] += 0.1;
    expect(() => readConstructionOpeningWidthPlan(plan)).toThrow(/does not match/);
  });
  it("admits only finite versioned JSON and rejects unknown fields and unsupported targets", () => {
    for (const patch of [{ schemaVersion: "0.2.0" }, { widthM: NaN }, { widthM: Infinity }, { widthM: -1 }, { widthM: 0 }, { extra: true }]) {
      expect(() => resolveConstructionOpeningWidth({ ...request(), ...patch })).toThrow();
    }
    for (const patch of [{ face: "rear" }, { floorIndex: 0 }, { floorIndex: 12 }, { bayIndex: 20 }, { bayIndex: 1.5 }, { documentId: "study/other" }]) {
      expect(() => resolveConstructionOpeningWidth({ ...request(), target: { ...request().target, ...patch } })).toThrow();
    }
    let getterCalls = 0;
    const getter = Object.defineProperty(request(), "widthM", { get() { getterCalls++; throw new Error("GETTER_EXECUTED"); } });
    expect(() => resolveConstructionOpeningWidth(getter)).toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
    const cyclic = { ...request(), cycle: {} }; cyclic.cycle = cyclic;
    expect(() => resolveConstructionOpeningWidth(cyclic)).toThrow();
  });
  it("decodes the exact canonical frame address into a stable structural target", () => {
    expect(constructionOpeningTargetFromSelection({ documentId: "study", storeysNodeId: "storeys", windowNodeId: "window",
      semanticPath: "building/study/node/window/storeys/floor/1/bay/2/frame" })).toEqual(request().target);
  });
  it.each([
    "building/other/node/window/storeys/floor/1/bay/2/frame",
    "building/study/node/door/storeys/floor/1/bay/2/frame",
    "building/study/node/window/storeys/rear/floor/1/bay/2/frame",
    "building/study/node/window/storeys/floor/0/bay/2/frame",
    "building/study/node/window/storeys/floor/1/bay/2/glass",
    "building/study/node/window/storeys/floor/01/bay/2/frame",
    "building/study/node/window/storeys/floor/1/bay/02/frame",
    "building/study/node/window/storeys/floor/1/bay/20/frame",
    "building/study/node/window/storeys/floor/1/bay/2/frame/extra"
  ])("rejects an unsupported or noncanonical selection %s", semanticPath => {
    expect(() => constructionOpeningTargetFromSelection({ documentId: "study", storeysNodeId: "storeys", windowNodeId: "window", semanticPath })).toThrow();
  });
});
