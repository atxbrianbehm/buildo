import { describe, expect, it } from "vitest";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { readConstructionStorefrontSign, resolveConstructionStorefrontSign } from "../core/constructionStorefrontSign";
import { buildConstructionStorefrontSignGeometry } from "../compiler/constructionStorefrontSignGeometry";

const storefront = () => resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly: "display",
  scope: { id: "front/0/1", face: "front", floorIndex: 0, bayIndex: 1, originM: [1, 0, -0.36], sizeM: [2.8, 4, 0.36] },
  parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
const request = () => ({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-request", storefront: storefront(), heightM: 0.3, projectionM: 0.08, frameWidthM: 0.035, awningPresent: false });

describe("procedural storefront sign study", () => {
  it("owns and replays a sign fitted inside the head band", () => {
    const input = request(), original = structuredClone(input), plan = resolveConstructionStorefrontSign(input);
    expect(readConstructionStorefrontSign(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    const bandBottom = input.storefront.aperture.bottomM + input.storefront.aperture.heightM;
    expect(plan.bottomM).toBeGreaterThan(bandBottom);
    expect(plan.bottomM + input.heightM).toBeLessThan(bandBottom + input.storefront.source.parameters.headHeightM);
    expect(plan.widthM).toBeCloseTo(2.64); plan.source.heightM = 0.2; expect(input).toEqual(original);
  });
  it("rejects invalid fit, unplanned awning interaction and tampered source", () => {
    expect(() => resolveConstructionStorefrontSign({ ...request(), heightM: 0.4 })).toThrow(/head band/);
    expect(() => resolveConstructionStorefrontSign({ ...request(), heightM: 0.16, frameWidthM: 0.08 })).toThrow(/inset panel/);
    expect(() => resolveConstructionStorefrontSign({ ...request(), awningPresent: true })).toThrow(/shared clearance/);
    const plan = resolveConstructionStorefrontSign(request()); plan.widthM += 0.01;
    expect(() => readConstructionStorefrontSign(plan)).toThrow(/do not match/);
  });
  it("builds a closed panel and four framed rails with finite geometry", () => {
    const plan = resolveConstructionStorefrontSign(request()), geometry = buildConstructionStorefrontSignGeometry(plan);
    expect(geometry.frame).toHaveLength(4);
    expect(geometry.panel.bounds.max[0] - geometry.panel.bounds.min[0]).toBeCloseTo(plan.widthM);
    expect(geometry.panel.bounds.max[1] - geometry.panel.bounds.min[1]).toBeCloseTo(plan.source.heightM);
    for (const mesh of [geometry.panel, ...geometry.frame]) {
      expect(mesh.indices).toHaveLength(36); expect(mesh.positions.every(Number.isFinite)).toBe(true);
      expect(mesh.uvs.length).toBe(mesh.positions.length / 3 * 2);
      for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
    }
    expect(buildConstructionStorefrontSignGeometry(plan)).toEqual(geometry);
  });
});
