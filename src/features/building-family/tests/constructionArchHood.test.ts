import { resolveConstructionRoundHead } from "../core/constructionRoundHead";
import { resolveConstructionArchHood, readConstructionArchHoodPlan } from "../core/constructionArchHood";
import { buildConstructionArchHood } from "../compiler/constructionArchHoodGeometry";

function request() {
  const opening = resolveConstructionRoundHead({ schemaVersion: "0.1.0", kind: "construction-round-head-request",
    scope: { id: "building/demo/front/floor/1/bay/0", face: "front", floorIndex: 1, bayIndex: 0, originM: [2, 4, -0.36], sizeM: [2.8, 3.4, 0.36] },
    parameters: { widthM: 1.4, heightM: 2.2, sillM: 0.6, frameWidthM: 0.08, revealDepthM: 0.14, masonryMarginM: 0.15 } });
  return { schemaVersion: "0.1.0", kind: "construction-arch-hood-request", opening, bandM: 0.1, projectionM: 0.07, jointM: 0.012, keystoneRiseM: 0.04, stoneCount: 9 };
}

it("builds separate closed stones with real joints, a raised keystone and finite metre-space UVs", () => {
  const input = request(), plan = resolveConstructionArchHood(input), meshes = buildConstructionArchHood(plan);
  expect(meshes).toHaveLength(9); expect(plan.stones.filter(stone => stone.keystone)).toHaveLength(1);
  expect(plan.stones[4].outerRadiusM).toBeGreaterThan(plan.stones[3].outerRadiusM);
  for (let i = 0; i < plan.stones.length - 1; i++) expect(plan.stones[i].endRad).toBeLessThan(plan.stones[i + 1].startRad);
  for (const [stoneIndex, mesh] of meshes.entries()) {
    expect(mesh.positions.every(Number.isFinite)).toBe(true); expect(mesh.uvs.every(Number.isFinite)).toBe(true);
    expect(mesh.uvs.length).toBe(mesh.positions.length / 3 * 2); expect(mesh.bounds.min[2]).toBeCloseTo(0.002);
    expect(mesh.bounds.max[2]).toBeCloseTo(input.projectionM + (stoneIndex === 4 ? input.keystoneRiseM / 2 : 0));
    for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
    const edges = new Map<string, number>(), vertex = (index: number) => mesh.positions.slice(index * 3, index * 3 + 3).map(value => value.toFixed(8)).join(",");
    for (let i = 0; i < mesh.indices.length; i += 3) for (let j = 0; j < 3; j++) {
      const key = [vertex(mesh.indices[i + j]), vertex(mesh.indices[i + (j + 1) % 3])].sort().join("|"); edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
  }
  expect(readConstructionArchHoodPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  expect(resolveConstructionArchHood(input)).toEqual(plan);
});

it("rejects inadequate masonry clearance, altered plans and unsupported counts", () => {
  const input = request(), plan = resolveConstructionArchHood(input);
  const cramped = structuredClone(input); cramped.bandM = 0.25; cramped.keystoneRiseM = 0.1;
  cramped.opening.source.scope.sizeM[1] = 2.9; // An altered source plan must not be silently accepted.
  expect(() => resolveConstructionArchHood(cramped)).toThrow();
  const tooTall = structuredClone(input); tooTall.bandM = 0.25; tooTall.keystoneRiseM = 0.1;
  tooTall.opening = resolveConstructionRoundHead({ ...input.opening.source, scope: { ...input.opening.source.scope, sizeM: [2.8, 3, 0.36] } });
  expect(() => resolveConstructionArchHood(tooTall)).toThrow(/clearance/);
  const altered = structuredClone(plan); altered.stones[0].endRad += 0.01;
  expect(() => buildConstructionArchHood(altered)).toThrow(/does not match/);
  expect(() => resolveConstructionArchHood({ ...input, stoneCount: 8 })).toThrow();
});

it("keeps the inside of every faceted stone outside a wide aperture", () => {
  const input = request();
  input.opening = resolveConstructionRoundHead({ ...input.opening.source, scope: { ...input.opening.source.scope, sizeM: [5.8, 5, 0.36] },
    parameters: { ...input.opening.source.parameters, widthM: 5, heightM: 3.2 } });
  input.stoneCount = 5; const plan = resolveConstructionArchHood(input);
  for (const stone of plan.stones) expect(plan.innerRadiusM * Math.cos((stone.endRad - stone.startRad) / 8)).toBeGreaterThan(input.opening.aperture.radiusM);
});
