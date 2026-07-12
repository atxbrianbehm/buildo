import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import {
  buildCorniceRecipe,
  buildProfiledHorizontalTrimRecipe,
  buildProfiledRoofCapRecipe,
  buildProfiledVerticalTrimRecipe
} from "../components/profiledTrimBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-profiled-trim",
    sourceIntentHash: "intent-profiled-trim",
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
    variationPolicy: { trim: "family", cornice: "family" },
    locks: [],
    diagnostics: []
  };
}

describe("profiled trim builders", () => {
  it("builds validated profile-sweep recipes for belt courses, pilasters, cornices, and roof caps", () => {
    const spec = fixtureSpec();
    const recipes = [
      buildProfiledHorizontalTrimRecipe(spec),
      buildProfiledVerticalTrimRecipe(spec),
      buildCorniceRecipe(spec),
      buildProfiledRoofCapRecipe(spec)
    ];

    expect(recipes.map((recipe) => recipe.id)).toEqual([
      "recipe.trim.pressed-metal.horizontal",
      "recipe.trim.pressed-metal.vertical",
      "recipe.cornice.bracketed-metal.primary",
      "recipe.roof-cap.flat-membrane.profiled"
    ]);
    expect(recipes.map((recipe) => recipe.kind)).toEqual([
      "profileSweep",
      "profileSweep",
      "profileSweep",
      "profileSweep"
    ]);
    expect(recipes.map((recipe) => ComponentRecipeSchema.safeParse(recipe).success)).toEqual([true, true, true, true]);
  });

  it("declares profile ids, material slots, and low-detail fallbacks explicitly", () => {
    const spec = fixtureSpec();
    const horizontal = buildProfiledHorizontalTrimRecipe(spec);
    const vertical = buildProfiledVerticalTrimRecipe(spec);
    const cornice = buildCorniceRecipe(spec);
    const roofCap = buildProfiledRoofCapRecipe(spec);

    expect(horizontal.profileRecipeId).toBe("profile.trim.pressed-metal.belt-course");
    expect(horizontal.atlasSlotIds).toEqual(["trim.horizontal.primary"]);
    expect(horizontal.lowDetailRecipeId).toBe(horizontal.id);
    expect(vertical.profileRecipeId).toBe("profile.trim.pressed-metal.shallow-pilaster");
    expect(vertical.atlasSlotIds).toEqual(["trim.vertical.primary"]);
    expect(cornice.profileRecipeId).toMatch(/^profile\.cornice\.bracketed-metal\.(layered|restrained)$/);
    expect(cornice.parameterRanges.projectionM?.min).toBeGreaterThan(0);
    expect(cornice.parameterRanges.projectionM?.max).toBeGreaterThan(cornice.parameterRanges.projectionM?.min ?? 0);
    expect(roofCap.role).toBe("roofCap");
    expect(roofCap.atlasSlotIds).toEqual(["trim.horizontal.primary"]);
  });
});
