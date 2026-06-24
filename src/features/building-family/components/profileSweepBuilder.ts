import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { makeComponentRecipe } from "./primitiveBuilders";

export function buildCorniceRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.cornice.${spec.selectedFamilies.cornice}.primary`,
    kind: "profileSweep",
    role: "cornice",
    dimensionsM: {
      width: spec.massing.widthM,
      height: spec.facade.corniceHeightM,
      depth: 0.42
    },
    atlasSlotIds: ["cornice.primary"],
    profileRecipeId: `profile.cornice.${spec.selectedFamilies.cornice}.primary`,
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.cornice ?? "family",
    attachmentPlane: "facade.front",
    parameterRanges: {
      projectionM: { min: 0.18, max: 0.52 },
      bracketSpacingM: { min: 0.6, max: 1.4 }
    }
  });
}
