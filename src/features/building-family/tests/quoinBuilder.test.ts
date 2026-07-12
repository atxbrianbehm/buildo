import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import { buildCornerQuoinRecipe } from "../components/quoinBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-quoin",
    sourceIntentHash: "intent-quoin",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 20,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4, 3, 3],
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

describe("buildCornerQuoinRecipe", () => {
  it("builds a validated corner quoin recipe", () => {
    const recipe = buildCornerQuoinRecipe(fixtureSpec());
    expect(ComponentRecipeSchema.safeParse(recipe).success).toBe(true);
    expect(recipe.role).toBe("cornerQuoin");
    expect(recipe.kind).toBe("boxAssembly");
    expect(recipe.atlasSlotIds).toEqual(["trim.vertical.primary"]);
  });
});
