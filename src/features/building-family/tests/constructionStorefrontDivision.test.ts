import { describe, expect, it } from "vitest";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { readConstructionStorefrontDivision, resolveConstructionStorefrontDivision } from "../core/constructionStorefrontDivision";
import { buildConstructionDividedStorefrontGeometry, buildConstructionStorefrontGeometry } from "../compiler/constructionStorefrontGeometry";

function storefront(assembly: "display" | "glazed-entrance" = "display", width = 2.8) {
  return resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly,
    scope: { id: "facade/floor/0/bay/0", face: "front", floorIndex: 0, bayIndex: 0, originM: [-width/2, 0, -0.36], sizeM: [width, 4, 0.36] },
    parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
}
const request = (assembly: "display" | "glazed-entrance" = "display") => ({ schemaVersion: "0.1.0", kind: "construction-storefront-division-request",
  storefront: storefront(assembly), displayLights: 1, transomLights: 1 });

describe("divided storefront geometry", () => {
  it.each(["display", "glazed-entrance"] as const)("keeps the single-light %s geometry exactly", assembly => {
    const input = request(assembly), plan = resolveConstructionStorefrontDivision(input);
    expect(buildConstructionDividedStorefrontGeometry(plan)).toEqual(buildConstructionStorefrontGeometry(input.storefront));
    expect(readConstructionStorefrontDivision(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
  it("builds separate lower and transom panes with real frame mullions", () => {
    const input = request(); input.displayLights = 2; input.transomLights = 3;
    const plan = resolveConstructionStorefrontDivision(input), base = buildConstructionStorefrontGeometry(input.storefront), geometry = buildConstructionDividedStorefrontGeometry(plan);
    expect(plan.display?.panes).toHaveLength(2); expect(plan.display?.mullions).toHaveLength(1);
    expect(plan.transom.panes).toHaveLength(3); expect(plan.transom.mullions).toHaveLength(2);
    expect(geometry.frame).toHaveLength(base.frame.length + 3); expect(geometry.glass).toHaveLength(5);
    for (const division of [plan.transom, plan.display!]) {
      const total = [...division.panes, ...division.mullions].reduce((sum, region) => sum + region.widthM, 0);
      const original = division === plan.transom ? input.storefront.transomClearRegion : input.storefront.lowerClearRegion;
      expect(total).toBeCloseTo(original.widthM, 9);
      for (const mullion of division.mullions) for (const pane of division.panes)
        expect(Math.min(mullion.leftM + mullion.widthM, pane.leftM + pane.widthM) - Math.max(mullion.leftM, pane.leftM)).toBeLessThanOrEqual(1e-9);
    }
    for (const part of [...geometry.frame, ...geometry.glass]) {
      expect(part.positions.every(Number.isFinite)).toBe(true); expect(part.indices.length).toBeGreaterThan(0);
      expect(part.uvs).toHaveLength(part.positions.length / 3 * 2);
    }
    expect(geometry.trim).toEqual(base.trim);
  });
  it("divides entrance transoms without replacing the door, hardware or door glazing", () => {
    const input = request("glazed-entrance"); input.transomLights = 3;
    const plan = resolveConstructionStorefrontDivision(input), base = buildConstructionStorefrontGeometry(input.storefront), geometry = buildConstructionDividedStorefrontGeometry(plan);
    expect(plan.display).toBeNull(); expect(geometry.glass).toHaveLength(4);
    expect(geometry.glass.at(-1)).toEqual(base.glass.at(-1)); expect(geometry.leaf).toEqual(base.leaf); expect(geometry.hardware).toEqual(base.hardware);
  });
  it("rejects narrow panes, an entrance display split and altered plans", () => {
    const input = request(); input.storefront = storefront("display", 0.8); input.transomLights = 3;
    expect(() => resolveConstructionStorefrontDivision(input)).toThrow(/150 mm/);
    const entrance = request("glazed-entrance"); entrance.displayLights = 2;
    expect(() => resolveConstructionStorefrontDivision(entrance)).toThrow(/entrance leaf/);
    const plan = resolveConstructionStorefrontDivision(request()); plan.transom.panes[0].widthM += 0.01;
    expect(() => buildConstructionDividedStorefrontGeometry(plan)).toThrow(/do not match/);
  });
});
