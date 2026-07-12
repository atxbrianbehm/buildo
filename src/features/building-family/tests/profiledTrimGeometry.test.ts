import {
  buildCorniceProfilePrimitives,
  buildCornerQuoinPrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildProfiledRunPrimitives,
  buildRoofCapPrimitives
} from "../compiler/profiledTrimGeometry";
import { buildCorniceRecipe, buildProfiledHorizontalTrimRecipe, buildProfiledRoofCapRecipe } from "../components/profiledTrimBuilder";
import { buildCornerQuoinRecipe } from "../components/quoinBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-profiled-geometry",
    sourceIntentHash: "intent-profiled-geometry",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 28,
      depthM: 18,
      floorCount: 4,
      floorHeightsM: [4, 3, 3, 3],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 7,
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

describe("profiled trim geometry", () => {
  it("builds multi-layer cornice, belt, roof-cap, and quoin primitives with normals", () => {
    const spec = fixtureSpec();
    const cornice = buildCorniceProfilePrimitives(spec, buildCorniceRecipe(spec));
    const belt = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec));
    const roofCap = buildRoofCapPrimitives(spec, buildProfiledRoofCapRecipe(spec));
    const quoins = buildCornerQuoinPrimitives(spec, buildCornerQuoinRecipe(spec));
    const stacked = buildProfiledRunPrimitives({
      id: "test-run",
      center: [0, 1, 0],
      size: [2, 1, 0.4],
      layers: [
        { id: "a", offsetM: [0, 0, 0], sizeM: [2, 0.5, 0.3] },
        { id: "b", offsetM: [0, 0.3, 0.05], sizeM: [2.1, 0.2, 0.35] }
      ]
    });

    expect(cornice.length).toBeGreaterThanOrEqual(2);
    expect(belt.length).toBeGreaterThanOrEqual(2);
    expect(roofCap.length).toBeGreaterThanOrEqual(2);
    expect(quoins.length).toBeGreaterThan(2);
    expect(stacked).toHaveLength(2);

    for (const primitive of [...cornice, ...belt, ...roofCap, ...quoins, ...stacked]) {
      expect(primitive.positions.length).toBeGreaterThan(0);
      expect(primitive.normals.length).toBe(primitive.positions.length);
      expect(primitive.indices.length % 3).toBe(0);
      expect(primitive.bounds.min[1]).toBeLessThan(primitive.bounds.max[1]);
    }
  });
});
