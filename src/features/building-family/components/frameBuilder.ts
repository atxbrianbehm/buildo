import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { bayWidth, makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";
import {
  buildDoorGlassRecipe,
  buildDoorRecipe,
  buildWindowFrameRecipe,
  buildWindowGlassRecipe,
  buildWindowRecessRecipe
} from "./openingAssemblyBuilder";

export function buildWallPanelRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: "recipe.wall.panel.primary",
    kind: "panel",
    role: "wall",
    dimensionsM: {
      width: bayWidth(spec.massing.widthM, spec.facade.frontBayCount),
      height: typicalFloorHeight(spec.massing.floorHeightsM),
      // Thicker wall mass so openings recess read against a real depth.
      depth: 0.34
    },
    atlasSlotIds: ["wall.primary"],
    uvBehavior: "repeat",
    variationScope: spec.variationPolicy.wall ?? "family",
    attachmentPlane: "facade.front",
    parameterRanges: {
      revealDepthM: { min: 0.04, max: 0.18 }
    }
  });
}

export {
  buildDoorGlassRecipe,
  buildDoorRecipe,
  buildWindowFrameRecipe,
  buildWindowGlassRecipe,
  buildWindowRecessRecipe
};

export { buildTrimRecipes } from "./profiledTrimBuilder";
