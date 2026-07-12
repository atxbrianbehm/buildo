import { buildCorniceRecipe, resolveCorniceProfileRecipeId } from "../components/profiledTrimBuilder";
import { buildCorniceProfilePrimitives } from "../compiler/profiledTrimGeometry";
import {
  getProfileDefinition,
  late19cCorniceProfile,
  late19cRestrainedCorniceProfile,
  listProfileDefinitions,
  profileMaxProjectionM
} from "../compiler/profileLibrary";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(trimSeed: string): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-g7-profile",
    sourceIntentHash: "intent-g7-profile",
    stylePackId: "late-19c-commercial-demo",
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: trimSeed
    },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4, 3.2, 3.2],
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

describe("G7 alternate cornice profile", () => {
  it("registers restrained cornice profile and style-pack aliases", () => {
    expect(getProfileDefinition(late19cRestrainedCorniceProfile.id)).toBeDefined();
    expect(getProfileDefinition("profile.cornice.bracketed-metal.restrained")).toBe(
      late19cRestrainedCorniceProfile
    );
    expect(getProfileDefinition("profile.cornice.bracketed-metal.layered")).toBe(late19cCorniceProfile);
    expect(listProfileDefinitions().some((profile) => profile.id.includes("restrained"))).toBe(true);
  });

  it("selects profile id from trim seed without forking expanders", () => {
    const a = resolveCorniceProfileRecipeId(fixtureSpec("trim-seed-a"));
    const b = resolveCorniceProfileRecipeId(fixtureSpec("trim-seed-b"));
    const c = resolveCorniceProfileRecipeId(fixtureSpec("trim-seed-a"));
    expect(a).toBe(c);
    expect(a).toMatch(/^profile\.cornice\.bracketed-metal\.(layered|restrained)$/);
    // Different seeds often diverge; if not, both are still valid ids.
    expect([a, b].every((id) => id.includes("layered") || id.includes("restrained"))).toBe(true);
  });

  it("restrained cornice expands to shallower projection and fewer primitives than layered", () => {
    const layeredRecipe = {
      ...buildCorniceRecipe(fixtureSpec("trim-layered")),
      profileRecipeId: "profile.cornice.late19c.layered"
    };
    const restrainedRecipe = {
      ...buildCorniceRecipe(fixtureSpec("trim-restrained")),
      profileRecipeId: "profile.cornice.late19c.restrained"
    };
    const layered = buildCorniceProfilePrimitives(fixtureSpec("trim-layered"), layeredRecipe);
    const restrained = buildCorniceProfilePrimitives(fixtureSpec("trim-restrained"), restrainedRecipe);
    expect(profileMaxProjectionM(late19cRestrainedCorniceProfile)).toBeLessThan(
      profileMaxProjectionM(late19cCorniceProfile)
    );
    expect(restrained.length).toBeLessThan(layered.length);
  });
});
