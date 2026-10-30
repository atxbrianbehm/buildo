import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { resolveConstructionAwning } from "../core/constructionAwning";
import { readConstructionAwningSupports, resolveConstructionAwningSupports } from "../core/constructionAwningSupports";
import { buildConstructionAwningSupportGeometry } from "../compiler/constructionAwningSupportGeometry";

const storefront = resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly: "display",
  scope: { id: "front/0/1", face: "front", floorIndex: 0, bayIndex: 1, originM: [1, 0, -0.36], sizeM: [2.8, 4, 0.36] },
  parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
const awning = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 });
const request = () => ({ schemaVersion: "0.1.0", kind: "construction-awning-support-request", awning, anchorRiseM: 0.15, thicknessM: 0.03 });

it("plans and builds a deterministic pair of rods anchored above the canopy", () => {
  const input = request(), before = structuredClone(input), plan = resolveConstructionAwningSupports(input);
  expect(readConstructionAwningSupports(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  expect(plan.rods[0].wall[0]).toBeCloseTo(-plan.rods[1].wall[0]);
  for (const rod of plan.rods) { expect(rod.wall[1]).toBeGreaterThan(awning.mountYM); expect(rod.canopy[2]).toBeLessThan(awning.source.projectionM); }
  const meshes = buildConstructionAwningSupportGeometry(plan); expect(meshes).toHaveLength(2);
  for (const mesh of meshes) { expect(mesh.indices).toHaveLength(36); expect(mesh.positions.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const vertices = mesh.indices.slice(i, i + 3).map(index => mesh.positions.slice(index * 3, index * 3 + 3));
      const ab = vertices[1].map((x, j) => x - vertices[0][j]), ac = vertices[2].map((x, j) => x - vertices[0][j]);
      const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
      expect(cross.reduce((sum, x, j) => sum + x * mesh.normals[mesh.indices[i] * 3 + j], 0)).toBeGreaterThan(0);
    }
  }
  plan.source.anchorRiseM = 0.4; expect(input).toEqual(before);
});
it("rejects tampering and anchors outside the storey", () => {
  const plan = resolveConstructionAwningSupports(request()); plan.rods[0].wall[1] += 0.1;
  expect(() => readConstructionAwningSupports(plan)).toThrow(/do not match/);
  expect(() => resolveConstructionAwningSupports({ ...request(), anchorRiseM: 0.6 })).toThrow(/anchors need room/);
});
