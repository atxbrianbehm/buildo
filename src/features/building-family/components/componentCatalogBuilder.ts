import { z } from "zod";
import type { AtlasManifest } from "../contracts/atlasManifest";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { ComponentRecipeSchema, type ComponentRecipe } from "../contracts/componentRecipe";
import type { Diagnostic } from "../core/diagnostics";
import { hashCanonicalJson } from "../core/contentHash";
import {
  buildDoorRecipe,
  buildTrimRecipes,
  buildWallPanelRecipe,
  buildWindowFrameRecipe,
  buildWindowRecessRecipe
} from "./frameBuilder";
import { buildCorniceRecipe } from "./profileSweepBuilder";
import { buildRoofRecipe } from "./roofBuilder";

export const ComponentCatalogSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  catalogId: z.string(),
  familyId: z.string(),
  atlasId: z.string(),
  recipes: z.array(ComponentRecipeSchema),
  diagnostics: z.array(z.unknown())
});

export interface ComponentCatalog {
  schemaVersion: "0.1.0";
  catalogId: string;
  familyId: string;
  atlasId: string;
  recipes: ComponentRecipe[];
  diagnostics: Diagnostic[];
}

function unknownAtlasSlotDiagnostic(recipe: ComponentRecipe, slotId: string): Diagnostic {
  return {
    code: "componentCatalog.unknownAtlasSlot",
    message: `Component recipe ${recipe.id} references unknown atlas slot ${slotId}.`,
    severity: "error",
    path: `recipes.${recipe.id}.atlasSlotIds`,
    received: slotId
  };
}

function validateRecipeSlots(recipes: ComponentRecipe[], manifest: AtlasManifest): Diagnostic[] {
  const knownSlots = new Set(manifest.slots.map((slot) => slot.id));
  const diagnostics: Diagnostic[] = [];

  for (const recipe of recipes) {
    for (const slotId of recipe.atlasSlotIds) {
      if (!knownSlots.has(slotId)) {
        diagnostics.push(unknownAtlasSlotDiagnostic(recipe, slotId));
      }
    }
  }

  return diagnostics;
}

export async function buildComponentCatalog(
  spec: BuildingFamilySpec,
  manifest: AtlasManifest
): Promise<ComponentCatalog> {
  const recipes = [
    buildWallPanelRecipe(spec),
    buildWindowFrameRecipe(spec),
    buildWindowRecessRecipe(),
    buildDoorRecipe(spec),
    ...buildTrimRecipes(spec),
    buildCorniceRecipe(spec),
    buildRoofRecipe(spec)
  ];
  const diagnostics = validateRecipeSlots(recipes, manifest);
  const catalogId = `catalog-${(
    await hashCanonicalJson({
      familyId: spec.familyId,
      atlasId: manifest.atlasId,
      recipes
    })
  ).slice(0, 16)}`;

  return ComponentCatalogSchema.parse({
    schemaVersion: "0.1.0",
    catalogId,
    familyId: spec.familyId,
    atlasId: manifest.atlasId,
    recipes,
    diagnostics
  }) as ComponentCatalog;
}
