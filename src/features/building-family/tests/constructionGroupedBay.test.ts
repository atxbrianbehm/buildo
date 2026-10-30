import { describe, expect, it } from "vitest";
import { readConstructionGroupedBay, resolveConstructionGroupedBay } from "../core/constructionGroupedBay";

function request() { return { schemaVersion: "0.1.0", kind: "construction-grouped-bay-request", scope: {
  id: "facade/front/floor/1/bay/2", face: "front", floorIndex: 1, bayIndex: 2, originM: [2, 4, -0.4], sizeM: [4, 3.5, 0.4] },
  parameters: { memberCount: 2, memberWidthM: 1, heightM: 2, sillM: 0.5, pierWidthM: 0.2, frameWidthM: 0.08, recessM: 0.1 } }; }

describe("grouped upper bay planning", () => {
  it("centers two separate apertures with a masonry pier and stable member identities", () => {
    const plan = resolveConstructionGroupedBay(request());
    expect(plan.members.map(x => x.id)).toEqual(["facade/front/floor/1/bay/2/opening/0", "facade/front/floor/1/bay/2/opening/1"]);
    expect(plan.members[0].centerAlongM).toBeCloseTo(3.4); expect(plan.members[1].centerAlongM).toBeCloseTo(4.6);
    expect(plan.members[1].centerAlongM - plan.members[0].centerAlongM - 1).toBeCloseTo(0.2);
    expect(plan.members[0].centerYM).toBe(5.5);
    expect(readConstructionGroupedBay(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
  it("plans three apertures without changing identity through width edits", () => {
    const input = request(); input.parameters.memberCount = 3; input.parameters.memberWidthM = 0.8;
    const before = resolveConstructionGroupedBay(input); input.parameters.memberWidthM = 0.7;
    const after = resolveConstructionGroupedBay(input);
    expect(before.members.map(x => x.id)).toEqual(after.members.map(x => x.id));
    expect(after.members[2].centerAlongM - after.members[0].centerAlongM).toBeCloseTo(1.8);
  });
  it.each([
    ["outer masonry", (x: ReturnType<typeof request>) => { x.parameters.memberWidthM = 2; }],
    ["pier", (x: ReturnType<typeof request>) => { x.parameters.pierWidthM = 0.01; }],
    ["height", (x: ReturnType<typeof request>) => { x.parameters.heightM = 3.1; }],
    ["frame", (x: ReturnType<typeof request>) => { x.parameters.frameWidthM = 0.3; }],
    ["recess", (x: ReturnType<typeof request>) => { x.parameters.recessM = 0.35; }],
    ["ground floor", (x: ReturnType<typeof request>) => { x.scope.floorIndex = 0; }]
  ])("rejects invalid %s", (_label, mutate) => { const input = request(); mutate(input); expect(() => resolveConstructionGroupedBay(input)).toThrow(); });
  it("owns its source and rejects edited plans", () => {
    const input = request(), plan = resolveConstructionGroupedBay(input); input.scope.id = "changed";
    expect(plan.source.scope.id).toBe("facade/front/floor/1/bay/2");
    plan.members[0].centerAlongM += 0.1;
    expect(() => readConstructionGroupedBay(plan)).toThrow("does not match");
  });
});
