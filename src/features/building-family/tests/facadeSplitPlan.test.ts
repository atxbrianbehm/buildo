import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildFacadeSplitPlan, wallPrimitivesFromSplitPlan } from "../compiler/facadeSplitPlan";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-split-plan",
    sourceIntentHash: "intent-split-plan",
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

describe("facadeSplitPlan", () => {
  it("builds a hash-stable split where openings match kit plan bays only", async () => {
    const spec = fixtureSpec();
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const first = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });
    const second = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.openings.length).toBeGreaterThan(0);
    expect(first.openings.some((opening) => opening.kind === "door")).toBe(true);
    expect(first.openings.every((opening) => opening.centerM.every((value) => Number.isFinite(value)))).toBe(
      true
    );

    const kitOpeningCells = new Set(
      facadePlan.placements
        .filter((placement) => placement.layer === "opening")
        .map((placement) => `${placement.facade}:${placement.floorIndex}:${placement.bayIndex}`)
    );
    for (const opening of first.openings) {
      expect(kitOpeningCells.has(`${opening.facade}:${opening.floorIndex}:${opening.bayIndex}`)).toBe(true);
    }
  });

  it("emits wall pieces only around split openings (not a default front grid)", async () => {
    const spec = fixtureSpec();
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const split = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });
    const solidScopes = split.scopes.filter((scope) => !scope.opening);
    const openScopes = split.scopes.filter((scope) => scope.opening);
    expect(openScopes.length).toBe(split.openings.length);
    expect(solidScopes.length).toBeGreaterThan(0);

    const walls = wallPrimitivesFromSplitPlan(split);
    // Subdivided walls produce many more pieces than bay count.
    expect(walls.length).toBeGreaterThan(split.scopes.length);
  });
});
