import {
  clampOpeningToGlazingBand,
  splitGroundStorefrontVertical
} from "../compiler/storefrontScopeSplit";
import { buildFacadeBayScopes, expandBayWallPrimitives } from "../compiler/facadeWallSubdivision";
import { buildFacadeSplitPlan } from "../compiler/facadeSplitPlan";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(groundHeight = 4.2): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-storefront-split",
    sourceIntentHash: "intent-storefront-split",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [groundHeight, 3.2, 3.2],
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

describe("storefrontScopeSplit", () => {
  it("splits ground floor into bulkhead + glazing + lintel covering full height", () => {
    const split = splitGroundStorefrontVertical(0, 4.2);
    expect(split.bulkheadHeightM).toBeGreaterThan(0.5);
    expect(split.lintelHeightM).toBeGreaterThan(0.2);
    expect(split.glazingHeightM).toBeGreaterThan(1.5);
    expect(split.bulkheadHeightM + split.glazingHeightM + split.lintelHeightM).toBeCloseTo(4.2, 5);
  });

  it("clamps door/window openings into the glazing band", () => {
    const split = splitGroundStorefrontVertical(0, 4.2);
    const door = clampOpeningToGlazingBand({ heightM: 3.5, centerYM: 2 }, split, "door");
    expect(door.heightM).toBeLessThanOrEqual(split.glazingHeightM);
    expect(door.centerYM - door.heightM / 2).toBeGreaterThanOrEqual(split.glazingBottomYM - 0.01);
    expect(door.centerYM + door.heightM / 2).toBeLessThanOrEqual(split.glazingTopYM + 0.01);
  });

  it("ground front bay with door expands bulkhead + piers + lintel pieces", () => {
    const spec = fixtureSpec();
    const doorBay = Math.floor(spec.facade.frontBayCount / 2);
    const scopes = buildFacadeBayScopes({
      spec,
      wallDepthM: 0.34,
      openings: [
        { facade: "front", floorIndex: 0, bayIndex: doorBay, widthM: 1.8, heightM: 2.8, kind: "door" }
      ],
      strictOpenings: true
    });
    const groundDoor = scopes.find(
      (scope) => scope.facade === "front" && scope.zone === "ground" && scope.bayIndex === doorBay
    );
    expect(groundDoor?.storefront).toBeDefined();
    expect(groundDoor?.opening?.kind).toBe("door");
    const pieces = expandBayWallPrimitives(groundDoor!);
    // bulkhead + lintel + left pier + right pier + reveal
    expect(pieces.length).toBeGreaterThanOrEqual(4);
  });

  it("ground front bay with window uses same storefront structure", () => {
    const scopes = buildFacadeBayScopes({
      spec: fixtureSpec(),
      wallDepthM: 0.34,
      openings: [{ facade: "front", floorIndex: 0, bayIndex: 0, widthM: 1.5, heightM: 2.2, kind: "window" }],
      strictOpenings: true
    });
    const groundWin = scopes.find(
      (scope) => scope.facade === "front" && scope.zone === "ground" && scope.bayIndex === 0
    );
    expect(groundWin?.storefront).toBeDefined();
    expect(groundWin?.opening?.kind).toBe("window");
    expect(expandBayWallPrimitives(groundWin!).length).toBeGreaterThanOrEqual(4);
  });

  it("upper body floors stay without storefront bands", () => {
    const scopes = buildFacadeBayScopes({
      spec: fixtureSpec(),
      wallDepthM: 0.34,
      defaultOpeningMode: "front-only"
    });
    const bodyFront = scopes.filter((scope) => scope.facade === "front" && scope.zone === "body");
    expect(bodyFront.length).toBeGreaterThan(0);
    expect(bodyFront.every((scope) => scope.storefront === undefined)).toBe(true);
  });

  it("split content hash changes when ground floor height changes", async () => {
    const low = await buildFacadeSplitPlan({
      spec: fixtureSpec(3.8),
      wallDepthM: 0.34,
      defaultOpeningMode: "front-only"
    });
    const high = await buildFacadeSplitPlan({
      spec: fixtureSpec(5.0),
      wallDepthM: 0.34,
      defaultOpeningMode: "front-only"
    });
    expect(low.contentHash).not.toBe(high.contentHash);
    const lowGround = low.scopes.find((s) => s.facade === "front" && s.zone === "ground");
    const highGround = high.scopes.find((s) => s.facade === "front" && s.zone === "ground");
    expect(lowGround?.storefront?.glazingHeightM).not.toBe(highGround?.storefront?.glazingHeightM);
  });
});
