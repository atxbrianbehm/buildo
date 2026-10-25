import {
  expandOpeningFromSlot,
  expandProfileRun,
  KIT_HIGH_DETAIL_MESH_BATCH_IDS,
  listProfileDefinitions
} from "../compiler/expanders";
import { buildWindowFrameRecipe } from "../components/openingAssemblyBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-expanders",
    sourceIntentHash: "intent-expanders",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 20,
      depthM: 14,
      floorCount: 2,
      floorHeightsM: [4, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 4,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.28,
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

describe("expanders (G6)", () => {
  it("documents a stable kit high-detail mesh batch id list", () => {
    expect(KIT_HIGH_DETAIL_MESH_BATCH_IDS).toContain("mesh.wall-panels");
    expect(KIT_HIGH_DETAIL_MESH_BATCH_IDS).toContain("mesh.opening-pockets");
    expect(KIT_HIGH_DETAIL_MESH_BATCH_IDS).toContain("mesh.storefront-hierarchy");
    expect(new Set(KIT_HIGH_DETAIL_MESH_BATCH_IDS).size).toBe(KIT_HIGH_DETAIL_MESH_BATCH_IDS.length);
  });

  it("expandOpeningFromSlot returns binding + frame primitives from one slot", () => {
    const recipe = buildWindowFrameRecipe(fixtureSpec());
    const { binding, framePrimitives } = expandOpeningFromSlot({
      placement: {
        facade: "front",
        floorIndex: 1,
        bayIndex: 1,
        kind: "window",
        semanticPath: "building/test/opening/window",
        centerM: [0, 5, -7],
        sizeM: [1.5, 2.2, 0.2]
      },
      wallDepthM: 0.34,
      recipeWidthM: recipe.dimensionsM.width,
      recipeHeightM: recipe.dimensionsM.height,
      recipeDepthM: recipe.dimensionsM.depth,
      recipe
    });
    expect(binding.frameOuterSizeM[0]).toBeLessThan(1.5);
    expect(framePrimitives.length).toBeGreaterThan(4);
  });

  it("expandProfileRun looks up profiles by id without style conditionals", () => {
    const ids = listProfileDefinitions().map((profile) => profile.id);
    expect(ids.length).toBeGreaterThan(0);
    const first = ids[0]!;
    const { profile, primitives } = expandProfileRun({
      profileId: first,
      center: [0, 10, -8],
      runLengthM: 12,
      densifySteps: 2
    });
    expect(profile.id).toContain(first);
    expect(primitives.length).toBeGreaterThan(0);
  });
});
