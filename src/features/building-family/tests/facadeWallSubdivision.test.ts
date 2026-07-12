import { buildFacadeBayScopes, expandBayWallPrimitives } from "../compiler/facadeWallSubdivision";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-wall-split",
    sourceIntentHash: "intent-wall-split",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4.2, 3.2, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 5,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

describe("facadeWallSubdivision", () => {
  it("splits facades into floor×bay scopes with ground/body zones", () => {
    const spec = fixtureSpec();
    const scopes = buildFacadeBayScopes({ spec, wallDepthM: 0.34 });
    const front = scopes.filter((scope) => scope.facade === "front");
    expect(front).toHaveLength(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(front.every((scope) => scope.floorIndex === 0 || scope.zone === "body" || scope.zone === "ground")).toBe(
      true
    );
    expect(front.filter((scope) => scope.zone === "ground")).toHaveLength(spec.facade.frontBayCount);
    expect(front.some((scope) => scope.opening !== undefined)).toBe(true);
  });

  it("expands a bay with an opening into pier/sill/head pieces instead of one slab", () => {
    const scopes = buildFacadeBayScopes({
      spec: fixtureSpec(),
      wallDepthM: 0.34,
      openings: [{ facade: "front", floorIndex: 1, bayIndex: 2, widthM: 1.4, heightM: 2.2 }]
    });
    const target = scopes.find(
      (scope) => scope.facade === "front" && scope.floorIndex === 1 && scope.bayIndex === 2
    );
    expect(target?.opening).toBeDefined();
    const pieces = expandBayWallPrimitives(target!);
    // Left pier, right pier, sill, head, reveal ≥ 4 pieces
    expect(pieces.length).toBeGreaterThanOrEqual(4);
    const solidBay = scopes.find(
      (scope) => scope.facade === "rear" && scope.floorIndex === 0 && scope.bayIndex === 0
    );
    expect(expandBayWallPrimitives(solidBay!).length).toBe(1);
  });
});
