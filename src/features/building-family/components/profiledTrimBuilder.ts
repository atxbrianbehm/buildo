import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { createSeedTree } from "../core/seedTree";
import { makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";

/** Seed-driven cornice profile id (G7) — expanders resolve geometry by lookup only. */
export function resolveCorniceProfileRecipeId(spec: BuildingFamilySpec): string {
  const family = spec.selectedFamilies.cornice;
  const seedTree = createSeedTree(spec.seeds.trim).fork(`profile/cornice/${family}`);
  // ~35% restrained so sample variety is visible without dominating the demo.
  const restrained = seedTree.float01("density") < 0.35;
  return restrained
    ? `profile.cornice.${family}.restrained`
    : `profile.cornice.${family}.layered`;
}

export function buildProfiledHorizontalTrimRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.trim.${spec.selectedFamilies.trim}.horizontal`,
    kind: "profileSweep",
    role: "horizontalTrim",
    dimensionsM: { width: spec.massing.widthM, height: 0.34, depth: 0.2 },
    atlasSlotIds: ["trim.horizontal.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId: `profile.trim.${spec.selectedFamilies.trim}.belt-course`,
    parameterRanges: {
      projectionM: { min: 0.1, max: 0.28 },
      capHeightM: { min: 0.05, max: 0.12 }
    }
  });
}

export function buildProfiledVerticalTrimRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.trim.${spec.selectedFamilies.trim}.vertical`,
    kind: "profileSweep",
    role: "verticalTrim",
    dimensionsM: {
      width: 0.42,
      height: typicalFloorHeight(spec.massing.floorHeightsM),
      depth: 0.28
    },
    atlasSlotIds: ["trim.vertical.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId: `profile.trim.${spec.selectedFamilies.trim}.shallow-pilaster`,
    parameterRanges: {
      projectionM: { min: 0.12, max: 0.28 },
      plinthHeightM: { min: 0.28, max: 0.52 }
    }
  });
}

export function buildCorniceRecipe(spec: BuildingFamilySpec) {
  const profileRecipeId = resolveCorniceProfileRecipeId(spec);
  const restrained = profileRecipeId.includes("restrained");
  return makeComponentRecipe({
    id: `recipe.cornice.${spec.selectedFamilies.cornice}.primary`,
    kind: "profileSweep",
    role: "cornice",
    dimensionsM: {
      width: spec.massing.widthM,
      height: spec.facade.corniceHeightM * (restrained ? 0.85 : 1),
      depth: restrained ? 0.42 : 0.62
    },
    atlasSlotIds: ["cornice.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.cornice ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId,
    parameterRanges: {
      projectionM: restrained ? { min: 0.12, max: 0.32 } : { min: 0.24, max: 0.68 },
      bracketSpacingM: { min: 0.6, max: 1.4 },
      crownHeightM: restrained ? { min: 0.1, max: 0.22 } : { min: 0.18, max: 0.4 }
    }
  });
}

export function buildProfiledRoofCapRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.roof-cap.${spec.selectedFamilies.roof}.profiled`,
    kind: "profileSweep",
    role: "roofCap",
    dimensionsM: { width: spec.massing.widthM, height: 0.22, depth: 0.34 },
    atlasSlotIds: ["trim.horizontal.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.roof ?? "family",
    attachmentPlane: "massing.top",
    profileRecipeId: "profile.roof-cap.late19c.parapet",
    parameterRanges: {
      projectionM: { min: 0.08, max: 0.22 }
    }
  });
}

export function buildTrimRecipes(spec: BuildingFamilySpec) {
  return [buildProfiledHorizontalTrimRecipe(spec), buildProfiledVerticalTrimRecipe(spec)];
}
