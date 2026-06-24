import { z } from "zod";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { AssemblyStageSchema, SchemaVersion010 } from "../contracts/shared";
import { DiagnosticSchema, type Diagnostic } from "../core/diagnostics";
import { hashCanonicalJson } from "../core/contentHash";

const RecipeDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().nonnegative()
});

export const ComponentGalleryEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.enum(["meshBatch", "instanceBatch", "recipeOnly"]),
  role: z.string(),
  recipeId: z.string(),
  recipeKind: z.string(),
  profileRecipeId: z.string().optional(),
  stage: AssemblyStageSchema,
  batchId: z.string().optional(),
  materialSlotId: z.string().optional(),
  atlasSlotIds: z.array(z.string()),
  dimensionsM: RecipeDimensionsSchema,
  anchorIds: z.array(z.string()),
  sampleSemanticPath: z.string().optional(),
  sampleElementIndex: z.number().int().nonnegative().optional(),
  metrics: z.object({
    vertexCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    elementCount: z.number().int().nonnegative()
  }),
  grid: z.object({
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative()
  })
});

export const ComponentGallerySchema = z.object({
  schemaVersion: SchemaVersion010,
  galleryId: z.string(),
  familyId: z.string(),
  buildingId: z.string(),
  sourceGraphHash: z.string(),
  entries: z.array(ComponentGalleryEntrySchema),
  diagnostics: z.array(DiagnosticSchema)
});

export type ComponentGalleryEntry = z.infer<typeof ComponentGalleryEntrySchema>;
export type ComponentGallery = z.infer<typeof ComponentGallerySchema>;

export interface BuildComponentGalleryInput {
  catalog: ComponentCatalog;
  ir: RuntimeBuildingIR;
}

interface RecipeSourceSummary {
  source: ComponentGalleryEntry["source"];
  batchId?: string;
  materialSlotId?: string;
  stage?: ComponentGalleryEntry["stage"];
  sampleSemanticPath?: string;
  sampleElementIndex?: number;
  metrics: ComponentGalleryEntry["metrics"];
}

function labelForRole(role: string): string {
  const labels: Record<string, string> = {
    wall: "Wall panel",
    window: "Window frame",
    opening: "Window recess",
    door: "Storefront door",
    horizontalTrim: "Belt course / horizontal trim",
    verticalTrim: "Pilaster / vertical trim",
    cornice: "Cornice",
    roof: "Roof"
  };
  return labels[role] ?? role;
}

function fallbackStageForRole(role: string): ComponentGalleryEntry["stage"] {
  if (role === "wall") {
    return "facade";
  }
  if (role === "window" || role === "door" || role === "opening") {
    return "openings";
  }
  if (role === "roof") {
    return "roof";
  }
  return "trim";
}

function semanticSummary(ir: RuntimeBuildingIR, batchId: string) {
  const matches = ir.semanticIndex.filter((entry) => entry.batchId === batchId);
  return {
    first: matches[0],
    count: matches.length
  };
}

function meshBatchSummary(ir: RuntimeBuildingIR, recipe: ComponentRecipe): RecipeSourceSummary | undefined {
  const batch = ir.meshBatches.find((candidate) => candidate.role === recipe.role);
  if (!batch) {
    return undefined;
  }

  const semantic = semanticSummary(ir, batch.batchId);
  return {
    source: "meshBatch",
    batchId: batch.batchId,
    materialSlotId: batch.materialSlotId,
    stage: semantic.first?.stage ?? fallbackStageForRole(recipe.role),
    sampleSemanticPath: semantic.first?.semanticPath,
    sampleElementIndex: semantic.first?.elementIndex,
    metrics: {
      vertexCount: batch.positions ? batch.positions.length / 3 : 0,
      triangleCount: batch.indices ? batch.indices.length / 3 : 0,
      instanceCount: 0,
      elementCount: semantic.count
    }
  };
}

function instanceBatchSummary(ir: RuntimeBuildingIR, recipe: ComponentRecipe): RecipeSourceSummary | undefined {
  const batch = ir.instanceBatches.find((candidate) => candidate.recipeId === recipe.id);
  if (!batch) {
    return undefined;
  }

  const semantic = semanticSummary(ir, batch.batchId);
  return {
    source: "instanceBatch",
    batchId: batch.batchId,
    materialSlotId: batch.materialSlotId,
    stage: semantic.first?.stage ?? fallbackStageForRole(recipe.role),
    sampleSemanticPath: semantic.first?.semanticPath,
    sampleElementIndex: semantic.first?.elementIndex,
    metrics: {
      vertexCount: 0,
      triangleCount: 0,
      instanceCount: batch.count,
      elementCount: semantic.count
    }
  };
}

function recipeOnlySummary(recipe: ComponentRecipe): RecipeSourceSummary {
  return {
    source: "recipeOnly",
    stage: fallbackStageForRole(recipe.role),
    metrics: {
      vertexCount: 0,
      triangleCount: 0,
      instanceCount: 0,
      elementCount: 0
    }
  };
}

function recipeSourceSummary(ir: RuntimeBuildingIR, recipe: ComponentRecipe): RecipeSourceSummary {
  return instanceBatchSummary(ir, recipe) ?? meshBatchSummary(ir, recipe) ?? recipeOnlySummary(recipe);
}

function recipeOnlyDiagnostic(recipe: ComponentRecipe): Diagnostic {
  return {
    code: "componentGallery.recipeOnly",
    message: `Component recipe ${recipe.id} is present in the catalog but has no emitted IR batch in the current compiler output.`,
    severity: "warning",
    path: "entries",
    received: recipe.id
  };
}

function buildEntry(
  recipe: ComponentRecipe,
  sourceSummary: RecipeSourceSummary,
  index: number
): ComponentGalleryEntry {
  return {
    id: `component-gallery.${recipe.id}`,
    label: labelForRole(recipe.role),
    source: sourceSummary.source,
    role: recipe.role,
    recipeId: recipe.id,
    recipeKind: recipe.kind,
    profileRecipeId: recipe.profileRecipeId,
    stage: sourceSummary.stage ?? fallbackStageForRole(recipe.role),
    batchId: sourceSummary.batchId,
    materialSlotId: sourceSummary.materialSlotId,
    atlasSlotIds: recipe.atlasSlotIds,
    dimensionsM: recipe.dimensionsM,
    anchorIds: recipe.anchors.map((anchor) => anchor.id),
    sampleSemanticPath: sourceSummary.sampleSemanticPath,
    sampleElementIndex: sourceSummary.sampleElementIndex,
    metrics: sourceSummary.metrics,
    grid: {
      row: Math.floor(index / 4),
      column: index % 4
    }
  };
}

export async function buildComponentGallery(input: BuildComponentGalleryInput): Promise<ComponentGallery> {
  const entries = input.catalog.recipes.map((recipe, index) => buildEntry(recipe, recipeSourceSummary(input.ir, recipe), index));
  const diagnostics = entries
    .filter((entry) => entry.source === "recipeOnly")
    .map((entry) => input.catalog.recipes.find((recipe) => recipe.id === entry.recipeId))
    .filter((recipe): recipe is ComponentRecipe => recipe !== undefined)
    .map(recipeOnlyDiagnostic);
  const galleryId = `component-gallery-${(
    await hashCanonicalJson({
      catalogId: input.catalog.catalogId,
      buildingId: input.ir.buildingId,
      sourceGraphHash: input.ir.sourceGraphHash,
      entries: entries.map((entry) => ({
        recipeId: entry.recipeId,
        source: entry.source,
        batchId: entry.batchId,
        sampleSemanticPath: entry.sampleSemanticPath
      }))
    })
  ).slice(0, 16)}`;

  return ComponentGallerySchema.parse({
    schemaVersion: "0.1.0",
    galleryId,
    familyId: input.catalog.familyId,
    buildingId: input.ir.buildingId,
    sourceGraphHash: input.ir.sourceGraphHash,
    entries,
    diagnostics
  });
}
