import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import { makeComponentRecipe } from "./primitiveBuilders";

export function isArchedWindowFamily(windowFamily: string): boolean {
  return /arch/i.test(windowFamily);
}

function windowOuterSize(spec: BuildingFamilySpec): { width: number; height: number } {
  const ranges = spec.componentParameters;
  const width = typeof ranges.windowWidthM === "number" ? ranges.windowWidthM : 1.35;
  const height = typeof ranges.windowHeightM === "number" ? ranges.windowHeightM : 2.45;
  return { width, height };
}

export function buildWindowFrameRecipe(spec: BuildingFamilySpec): ComponentRecipe {
  const { width, height } = windowOuterSize(spec);
  const arched = isArchedWindowFamily(spec.selectedFamilies.window);

  return makeComponentRecipe({
    id: `recipe.window.${spec.selectedFamilies.window}.frame`,
    kind: "frame",
    role: "window",
    dimensionsM: { width, height: arched ? height + 0.18 : height, depth: 0.32 },
    atlasSlotIds: ["frame.primary", "glass.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.window ?? "building",
    attachmentPlane: "facade.opening",
    profileRecipeId: arched
      ? `profile.window.${spec.selectedFamilies.window}.arched-assembly`
      : `profile.window.${spec.selectedFamilies.window}.rect-assembly`,
    anchors: [
      { id: "origin", position: [0, 0, 0], normal: [0, 0, 1] },
      { id: "sill-center", position: [0, -height / 2, 0.08], normal: [0, 1, 0] },
      { id: "lintel-center", position: [0, height / 2, 0.04], normal: [0, -1, 0] },
      { id: "glass-plane", position: [0, 0, -0.04], normal: [0, 0, 1] }
    ],
    subcomponentRecipeIds: [`recipe.window.${spec.selectedFamilies.window}.glass`],
    parameterRanges: {
      mullionDepthM: { min: 0.04, max: 0.12 },
      mullionCountX: { min: 1, max: 2 },
      mullionCountY: { min: 1, max: 2 },
      insetM: { min: 0.04, max: 0.2 },
      recessDepthM: { min: 0.1, max: 0.28 },
      sillProjectionM: { min: 0.06, max: 0.16 },
      frameThicknessM: { min: 0.06, max: 0.12 }
    }
  });
}

export function buildWindowGlassRecipe(spec: BuildingFamilySpec): ComponentRecipe {
  const { width, height } = windowOuterSize(spec);
  return makeComponentRecipe({
    id: `recipe.window.${spec.selectedFamilies.window}.glass`,
    kind: "panel",
    role: "windowGlass",
    dimensionsM: {
      width: Math.max(0.2, width * 0.78),
      height: Math.max(0.2, height * 0.72),
      depth: 0.02
    },
    atlasSlotIds: ["glass.primary"],
    uvBehavior: "stretch",
    variationScope: spec.variationPolicy.window ?? "building",
    attachmentPlane: "facade.opening",
    anchors: [{ id: "origin", position: [0, 0, 0], normal: [0, 0, 1] }],
    parameterRanges: {
      insetM: { min: 0.04, max: 0.12 }
    }
  });
}

export function buildWindowRecessRecipe(spec: BuildingFamilySpec): ComponentRecipe {
  const frame = buildWindowFrameRecipe(spec);
  return makeComponentRecipe({
    id: "recipe.opening.window.recess",
    kind: "recess",
    role: "opening",
    dimensionsM: {
      width: frame.dimensionsM.width + 0.2,
      height: frame.dimensionsM.height + 0.2,
      depth: 0.3
    },
    atlasSlotIds: ["wall.primary"],
    uvBehavior: "stretch",
    variationScope: "building",
    attachmentPlane: "facade.front",
    subcomponentRecipeIds: [frame.id],
    anchors: [
      { id: "origin", position: [0, 0, 0], normal: [0, 0, 1] },
      { id: "opening-pocket", position: [0, 0, -0.1], normal: [0, 0, 1] }
    ],
    parameterRanges: {
      recessDepthM: { min: 0.1, max: 0.32 }
    }
  });
}

export function buildDoorRecipe(spec: BuildingFamilySpec): ComponentRecipe {
  const height = spec.massing.floorHeightsM[0] * 0.78;
  return makeComponentRecipe({
    id: `recipe.door.${spec.selectedFamilies.door}`,
    kind: "frame",
    role: "door",
    dimensionsM: { width: 2.2, height, depth: 0.36 },
    atlasSlotIds: ["door.primary", "frame.primary", "glass.primary"],
    uvBehavior: "stretch",
    variationScope: spec.variationPolicy.door ?? "building",
    attachmentPlane: "facade.opening",
    profileRecipeId: `profile.door.${spec.selectedFamilies.door}.storefront`,
    anchors: [
      { id: "origin", position: [0, 0, 0], normal: [0, 0, 1] },
      { id: "threshold", position: [0, -height / 2, 0.06], normal: [0, 1, 0] },
      { id: "transom-center", position: [0, height * 0.28, -0.02], normal: [0, 0, 1] }
    ],
    subcomponentRecipeIds: [`recipe.door.${spec.selectedFamilies.door}.glass`],
    parameterRanges: {
      insetM: { min: 0.08, max: 0.28 },
      recessDepthM: { min: 0.12, max: 0.34 },
      frameThicknessM: { min: 0.08, max: 0.14 },
      transomHeightM: { min: 0.35, max: 0.55 },
      leafInsetM: { min: 0.04, max: 0.1 }
    }
  });
}

export function buildDoorGlassRecipe(spec: BuildingFamilySpec): ComponentRecipe {
  const door = buildDoorRecipe(spec);
  const transomHeight = 0.45;
  return makeComponentRecipe({
    id: `recipe.door.${spec.selectedFamilies.door}.glass`,
    kind: "panel",
    role: "doorGlass",
    dimensionsM: {
      width: door.dimensionsM.width * 0.72,
      height: transomHeight,
      depth: 0.02
    },
    atlasSlotIds: ["glass.primary"],
    uvBehavior: "stretch",
    variationScope: spec.variationPolicy.door ?? "building",
    attachmentPlane: "facade.opening",
    anchors: [{ id: "origin", position: [0, 0, 0], normal: [0, 0, 1] }],
    parameterRanges: {
      transomHeightM: { min: 0.35, max: 0.55 }
    }
  });
}
