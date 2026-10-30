import { describe, expect, it } from "vitest";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { readConstructionAwning, resolveConstructionAwning } from "../core/constructionAwning";
import { buildConstructionAwningGeometry } from "../compiler/constructionAwningGeometry";

const storefront = (assembly: "display" | "glazed-entrance" = "display") => resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly,
  scope: { id: "front/0/1", face: "front", floorIndex: 0, bayIndex: 1, originM: [1, 0, -0.36], sizeM: [2.8, 4, 0.36] },
  parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
const request = () => ({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: storefront(), projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 });

describe("procedural storefront awning", () => {
  it("owns a deterministic bay-fitted plan for display and entrance scopes", () => {
    for (const assembly of ["display", "glazed-entrance"] as const) {
      const input = { ...request(), storefront: storefront(assembly) }, saved = structuredClone(input), plan = resolveConstructionAwning(input);
      expect(readConstructionAwning(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
      expect(plan.centerAlongM - plan.widthM / 2).toBeGreaterThanOrEqual(input.storefront.source.scope.originM[0] + 0.04);
      expect(plan.centerAlongM + plan.widthM / 2).toBeLessThanOrEqual(input.storefront.source.scope.originM[0] + 2.8 - 0.04);
      expect(plan.lowerEdgeYM).toBeGreaterThanOrEqual(2.05); plan.source.projectionM = 1.5; expect(input).toEqual(saved);
    }
  });
  it("rejects insufficient clearance, stale source and tampered derived dimensions", () => {
    const plan = resolveConstructionAwning(request()); plan.widthM += 0.01; expect(() => readConstructionAwning(plan)).toThrow(/do not match/);
    const input = request(); input.storefront.aperture.widthM += 0.01; expect(() => resolveConstructionAwning(input)).toThrow(/do not match/);
    const low = request(); low.dropM = 1.2; low.valanceHeightM = 0.4; low.storefront = resolveConstructionStorefront({ ...low.storefront.source,
      scope: { ...low.storefront.source.scope, sizeM: [2.8, 2.5, 0.36] }, parameters: { ...low.storefront.source.parameters, headHeightM: 0.15, transomBaseM: 1.9 } });
    expect(() => resolveConstructionAwning(low)).toThrow(/ground clearance/);
  });
  it("constructs closed sloping canopy and hanging valance in physical coordinates", () => {
    const plan = resolveConstructionAwning(request()), { roof, valance } = buildConstructionAwningGeometry(plan);
    expect(roof.bounds.max[0] - roof.bounds.min[0]).toBeCloseTo(plan.widthM);
    expect(roof.bounds.max[2] - roof.bounds.min[2]).toBeGreaterThan(plan.source.projectionM);
    expect(valance.bounds.min[1]).toBeCloseTo(plan.lowerEdgeYM); expect(valance.bounds.max[1]).toBeCloseTo(plan.frontYM);
    for (const mesh of [roof, valance]) {
      expect(mesh.indices).toHaveLength(36); expect(mesh.positions.every(Number.isFinite)).toBe(true);
      expect(mesh.uvs.length).toBe(mesh.positions.length / 3 * 2);
      for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const v = mesh.indices.slice(i, i + 3).map(index => mesh.positions.slice(index * 3, index * 3 + 3));
        const ab = v[1].map((x, j) => x - v[0][j]), ac = v[2].map((x, j) => x - v[0][j]);
        const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
        expect(cross.reduce((sum, x, j) => sum + x * mesh.normals[mesh.indices[i] * 3 + j], 0)).toBeGreaterThan(0);
      }
    }
  });
});
