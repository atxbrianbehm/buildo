import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { bayWidth, makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";

export function buildWallPanelRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: "recipe.wall.panel.primary",
    kind: "panel",
    role: "wall",
    dimensionsM: {
      width: bayWidth(spec.massing.widthM, spec.facade.frontBayCount),
      height: typicalFloorHeight(spec.massing.floorHeightsM),
      depth: 0.24
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

export function buildWindowFrameRecipe(spec: BuildingFamilySpec) {
  const ranges = spec.componentParameters;
  const width = typeof ranges.windowWidthM === "number" ? ranges.windowWidthM : 1.35;
  const height = typeof ranges.windowHeightM === "number" ? ranges.windowHeightM : 2.45;

  return makeComponentRecipe({
    id: `recipe.window.${spec.selectedFamilies.window}.frame`,
    kind: "frame",
    role: "window",
    dimensionsM: { width, height, depth: 0.18 },
    atlasSlotIds: ["glass.primary", "frame.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.window ?? "building",
    attachmentPlane: "facade.opening",
    parameterRanges: {
      mullionDepthM: { min: 0.04, max: 0.12 },
      insetM: { min: 0.04, max: 0.2 }
    }
  });
}

export function buildWindowRecessRecipe() {
  return makeComponentRecipe({
    id: "recipe.opening.window.recess",
    kind: "recess",
    role: "opening",
    dimensionsM: { width: 1.55, height: 2.65, depth: 0.26 },
    atlasSlotIds: ["wall.primary"],
    uvBehavior: "stretch",
    variationScope: "building",
    attachmentPlane: "facade.front",
    subcomponentRecipeIds: ["recipe.window.tall-arched.frame"],
    parameterRanges: {
      recessDepthM: { min: 0.08, max: 0.32 }
    }
  });
}

export function buildDoorRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.door.${spec.selectedFamilies.door}`,
    kind: "frame",
    role: "door",
    dimensionsM: { width: 2.2, height: spec.massing.floorHeightsM[0] * 0.78, depth: 0.22 },
    atlasSlotIds: ["door.primary", "frame.primary"],
    uvBehavior: "stretch",
    variationScope: spec.variationPolicy.door ?? "building",
    attachmentPlane: "facade.opening",
    parameterRanges: {
      insetM: { min: 0.08, max: 0.28 }
    }
  });
}

export function buildTrimRecipes(spec: BuildingFamilySpec) {
  return [
    makeComponentRecipe({
      id: `recipe.trim.${spec.selectedFamilies.trim}.horizontal`,
      kind: "profileSweep",
      role: "horizontalTrim",
      dimensionsM: { width: spec.massing.widthM, height: 0.34, depth: 0.16 },
      atlasSlotIds: ["trim.horizontal.primary"],
      uvBehavior: "cap-repeat-cap",
      variationScope: spec.variationPolicy.trim ?? "family",
      attachmentPlane: "facade.front",
      parameterRanges: {
        projectionM: { min: 0.08, max: 0.24 }
      }
    }),
    makeComponentRecipe({
      id: `recipe.trim.${spec.selectedFamilies.trim}.vertical`,
      kind: "profileSweep",
      role: "verticalTrim",
      dimensionsM: { width: 0.34, height: typicalFloorHeight(spec.massing.floorHeightsM), depth: 0.14 },
      atlasSlotIds: ["trim.vertical.primary"],
      uvBehavior: "cap-repeat-cap",
      variationScope: spec.variationPolicy.trim ?? "family",
      attachmentPlane: "facade.front",
      parameterRanges: {
        projectionM: { min: 0.06, max: 0.18 }
      }
    })
  ];
}
