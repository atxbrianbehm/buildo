import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";

export function buildCornerQuoinRecipe(spec: BuildingFamilySpec) {
  const height = typicalFloorHeight(spec.massing.floorHeightsM);
  return makeComponentRecipe({
    id: `recipe.quoin.${spec.selectedFamilies.trim}.corner`,
    kind: "boxAssembly",
    role: "cornerQuoin",
    dimensionsM: { width: 0.42, height, depth: 0.42 },
    atlasSlotIds: ["trim.vertical.primary"],
    uvBehavior: "stretch",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.corner",
    parameterRanges: {
      courseHeightM: { min: 0.2, max: 0.36 },
      projectionM: { min: 0.04, max: 0.12 }
    }
  });
}
