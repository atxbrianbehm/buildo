import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import {
  buildDoorGlassRecipe,
  buildDoorRecipe,
  buildWindowFrameRecipe,
  buildWindowGlassRecipe,
  buildWindowRecessRecipe,
  isArchedWindowFamily
} from "../components/openingAssemblyBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(windowFamily = "tall-arched"): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-openings",
    sourceIntentHash: "intent-openings",
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
      window: windowFamily,
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

describe("openingAssemblyBuilder", () => {
  it("detects arched window families", () => {
    expect(isArchedWindowFamily("tall-arched")).toBe(true);
    expect(isArchedWindowFamily("tall-rectangular")).toBe(false);
  });

  it("builds deep window/door recipes with shared material roles and anchors", () => {
    const arched = fixtureSpec("tall-arched");
    const rect = fixtureSpec("tall-rectangular");
    const windowFrame = buildWindowFrameRecipe(arched);
    const windowGlass = buildWindowGlassRecipe(arched);
    const recess = buildWindowRecessRecipe(arched);
    const door = buildDoorRecipe(arched);
    const doorGlass = buildDoorGlassRecipe(arched);
    const rectFrame = buildWindowFrameRecipe(rect);

    for (const recipe of [windowFrame, windowGlass, recess, door, doorGlass, rectFrame]) {
      expect(ComponentRecipeSchema.safeParse(recipe).success).toBe(true);
    }

    expect(windowFrame.dimensionsM.depth).toBeGreaterThanOrEqual(0.28);
    expect(door.dimensionsM.depth).toBeGreaterThanOrEqual(0.3);
    expect(windowFrame.atlasSlotIds).toEqual(expect.arrayContaining(["frame.primary", "glass.primary"]));
    expect(windowGlass.atlasSlotIds).toEqual(["glass.primary"]);
    expect(windowFrame.anchors.map((anchor) => anchor.id)).toEqual(
      expect.arrayContaining(["origin", "sill-center", "lintel-center", "glass-plane"])
    );
    expect(windowFrame.parameterRanges.recessDepthM).toBeDefined();
    expect(windowFrame.parameterRanges.mullionCountX).toBeDefined();
    expect(windowFrame.profileRecipeId).toContain("arched");
    expect(rectFrame.profileRecipeId).toContain("rect");
    expect(recess.subcomponentRecipeIds).toContain(windowFrame.id);
  });
});
