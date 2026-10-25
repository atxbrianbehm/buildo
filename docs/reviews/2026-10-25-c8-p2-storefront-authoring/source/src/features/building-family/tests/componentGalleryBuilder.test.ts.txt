import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import {
  buildComponentGallery,
  ComponentGallerySchema,
  type ComponentGallery
} from "../compiler/componentGalleryBuilder";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureGalleryInputs() {
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim"
  });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: "trim-seed"
    },
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const atlasPlan = await planAtlas(spec);
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  const ir = await compileBuilding({ spec, catalog, graph });
  return { spec, catalog, ir };
}

function containsTypedArray(value: unknown): boolean {
  if (ArrayBuffer.isView(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsTypedArray);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(containsTypedArray);
  }
  return false;
}

describe("buildComponentGallery", () => {
  it("builds a deterministic schema-valid Component Forge gallery from compiled IR and catalog recipes", async () => {
    const { spec, catalog, ir } = await fixtureGalleryInputs();
    const first = await buildComponentGallery({ catalog, ir });
    const second = await buildComponentGallery({ catalog, ir });

    expect(ComponentGallerySchema.safeParse(first).success).toBe(true);
    expect(first).toEqual(second);
    expect(first.galleryId).toMatch(/^component-gallery-/);
    expect(first.familyId).toBe(spec.familyId);
    expect(first.buildingId).toBe(ir.buildingId);
    expect(first.sourceGraphHash).toBe(ir.sourceGraphHash);
    expect(first.entries).toHaveLength(catalog.recipes.length);
    expect(first.entries.map((entry) => entry.recipeId)).toEqual(catalog.recipes.map((recipe) => recipe.id));
    expect(first.entries.map((entry) => `${entry.grid.row}:${entry.grid.column}`)).toEqual(
      catalog.recipes.map((_, index) => `${Math.floor(index / 4)}:${index % 4}`)
    );
  });

  it("summarizes emitted mesh and instance components without copying typed-array buffers into gallery data", async () => {
    const { ir, catalog } = await fixtureGalleryInputs();
    const gallery = await buildComponentGallery({ catalog, ir });
    const wallPanel = gallery.entries.find((entry) => entry.recipeId === "recipe.wall.panel.primary");
    const windowFrame = gallery.entries.find((entry) => entry.recipeId === "recipe.window.tall-arched.frame");
    const roof = gallery.entries.find((entry) => entry.role === "roof");
    const wallBatch = ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels")!;
    const wallEntries = ir.semanticIndex.filter((entry) => entry.batchId === wallBatch.batchId);

    expect(containsTypedArray(gallery)).toBe(false);
    expect(wallPanel).toMatchObject({
      source: "meshBatch",
      batchId: "mesh.wall-panels",
      stage: "facade",
      materialSlotId: "wall.primary",
      sampleSemanticPath: expect.stringContaining("/facade/wall/subdivided/piece/")
    });
    expect(wallEntries.length).toBeGreaterThan(0);
    expect(wallPanel?.sampleSemanticPath).toBe(wallEntries[0].semanticPath);
    expect(wallPanel?.sampleElementIndex).toBe(wallEntries[0].elementIndex);
    expect(wallPanel?.metrics.elementCount).toBe(wallEntries.length);
    expect(wallPanel?.metrics.vertexCount).toBe(wallBatch.positions!.length / 3);
    expect(wallPanel?.metrics.triangleCount).toBe(wallBatch.indices!.length / 3);
    expect(windowFrame).toMatchObject({
      source: "instanceBatch",
      batchId: "instances.window",
      stage: "openings",
      materialSlotId: "frame.primary",
      sampleSemanticPath: expect.stringContaining("/opening/")
    });
    expect(windowFrame?.metrics.instanceCount).toBe(
      ir.instanceBatches.find((batch) => batch.batchId === "instances.window")!.count
    );
    expect(roof?.metrics.triangleCount).toBeGreaterThan(0);
  });

  it("reports emitted opening pockets and retains recipe-only diagnostics when their matching IR batch is absent", async () => {
    const { ir, catalog } = await fixtureGalleryInputs();
    const gallery = await buildComponentGallery({ catalog, ir });
    const opening = gallery.entries.find((entry) => entry.role === "opening");

    expect(opening).toMatchObject({
      source: "meshBatch",
      stage: "openings",
      batchId: "mesh.opening-pockets",
      sampleSemanticPath: expect.stringContaining("/opening-pocket/")
    });
    const openingCount = ir.instanceBatches
      .filter((batch) => batch.batchId === "instances.window" || batch.batchId === "instances.door")
      .reduce((count, batch) => count + batch.count, 0);
    expect(openingCount).toBeGreaterThan(0);
    expect(opening?.metrics.elementCount).toBe(openingCount);
    expect(opening?.metrics.vertexCount).toBeGreaterThan(0);
    expect(opening?.metrics.triangleCount).toBeGreaterThan(0);
    expect(gallery.diagnostics).not.toContainEqual(
      expect.objectContaining({ received: opening?.recipeId })
    );

    const withoutOpeningPockets = {
      ...ir,
      meshBatches: ir.meshBatches.filter((batch) => batch.batchId !== "mesh.opening-pockets"),
      semanticIndex: ir.semanticIndex.filter((entry) => entry.batchId !== "mesh.opening-pockets")
    };
    const incompleteGallery = await buildComponentGallery({ catalog, ir: withoutOpeningPockets });
    expect(incompleteGallery.entries.find((entry) => entry.role === "opening")).toMatchObject({
      source: "recipeOnly",
      stage: "openings",
      batchId: undefined,
      sampleSemanticPath: undefined,
      metrics: { vertexCount: 0, triangleCount: 0, instanceCount: 0, elementCount: 0 }
    });
    // The base plinth and belt share horizontalTrim; isolate the belt source so
    // this checks its lineage without treating the gallery's first role match as a belt.
    const otherHorizontalTrimBatchIds = new Set(
      ir.meshBatches
        .filter((batch) => batch.role === "horizontalTrim" && batch.batchId !== "mesh.belt-course")
        .map((batch) => batch.batchId)
    );
    const beltGallery = await buildComponentGallery({
      catalog,
      ir: {
        ...ir,
        meshBatches: ir.meshBatches.filter((batch) => !otherHorizontalTrimBatchIds.has(batch.batchId)),
        semanticIndex: ir.semanticIndex.filter((entry) => !otherHorizontalTrimBatchIds.has(entry.batchId))
      }
    });
    const beltCourse = beltGallery.entries.find((entry) => entry.role === "horizontalTrim");
    expect(beltCourse).toMatchObject({
      source: "meshBatch",
      batchId: "mesh.belt-course",
      label: "Belt course / horizontal trim",
      stage: "trim"
    });
    expect(incompleteGallery.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "componentGallery.recipeOnly",
        severity: "warning",
        received: "recipe.opening.window.recess"
      })
    );
  });

  it("preserves anchors, dimensions, atlas slots, and stage metadata needed by Component Forge controls", async () => {
    const { spec, ir, catalog } = await fixtureGalleryInputs();
    const gallery: ComponentGallery = await buildComponentGallery({ catalog, ir });
    const cornice = gallery.entries.find((entry) => entry.role === "cornice");
    const verticalTrim = gallery.entries.find((entry) => entry.role === "verticalTrim");
    const windowFrame = gallery.entries.find((entry) => entry.role === "window");

    expect(cornice).toMatchObject({
      label: "Cornice",
      recipeKind: "profileSweep",
      atlasSlotIds: ["cornice.primary"],
      profileRecipeId: expect.stringMatching(/^profile\.cornice\..+\.layered$/),
      dimensionsM: expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
        depth: expect.any(Number)
      }),
      anchorIds: ["origin"],
      stage: "trim"
    });
    expect(verticalTrim).toMatchObject({
      label: "Pilaster / vertical trim",
      source: "meshBatch",
      batchId: "mesh.vertical-pilasters",
      atlasSlotIds: ["trim.vertical.primary"],
      sampleSemanticPath: expect.stringContaining("/facade/front/bay-edge/")
    });
    const pilasterEntries = ir.semanticIndex.filter((entry) => entry.batchId === "mesh.vertical-pilasters");
    const pilasterEdges = new Set(
      pilasterEntries.map((entry) => entry.semanticPath.match(/\/bay-edge\/(\d+)\/pilaster\//)?.[1])
    );
    expect(pilasterEdges.has(undefined)).toBe(false);
    expect(pilasterEdges.size).toBe(spec.facade.frontBayCount + 1);
    expect(verticalTrim?.metrics.elementCount).toBe(pilasterEntries.length);
    expect(verticalTrim?.metrics.instanceCount).toBe(0);
    expect(verticalTrim?.metrics.vertexCount).toBeGreaterThan(0);
    expect(verticalTrim?.metrics.triangleCount).toBeGreaterThan(0);
    // V3 deepened the opening assembly; the gallery must retain that recipe depth.
    expect(windowFrame?.dimensionsM.depth).toBeGreaterThanOrEqual(0.55);
    expect(windowFrame?.dimensionsM).toEqual(catalog.recipes.find((recipe) => recipe.role === "window")?.dimensionsM);
    expect(windowFrame?.anchorIds).toEqual(expect.arrayContaining(["origin", "sill-center", "lintel-center"]));
    expect(gallery.entries.every((entry) => entry.atlasSlotIds.length > 0)).toBe(true);
    expect(gallery.entries.every((entry) => entry.dimensionsM.width > 0 && entry.dimensionsM.height > 0)).toBe(true);
  });
});
