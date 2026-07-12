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

    expect(containsTypedArray(gallery)).toBe(false);
    expect(wallPanel).toMatchObject({
      source: "meshBatch",
      batchId: "mesh.wall-panels",
      stage: "facade",
      materialSlotId: "wall.primary",
      sampleSemanticPath: expect.stringContaining("/wall/panel")
    });
    expect(wallPanel?.metrics.elementCount).toBe(
      ir.semanticIndex.filter((entry) => entry.batchId === "mesh.wall-panels").length
    );
    expect(wallPanel?.metrics.vertexCount).toBe(ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels")!.positions!.length / 3);
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

  it("keeps recipe-only entries with diagnostics when the current compiler has not emitted a matching IR batch yet", async () => {
    const { ir, catalog } = await fixtureGalleryInputs();
    const gallery = await buildComponentGallery({ catalog, ir });
    const opening = gallery.entries.find((entry) => entry.role === "opening");
    const beltCourse = gallery.entries.find((entry) => entry.role === "horizontalTrim");

    expect(opening).toMatchObject({
      source: "recipeOnly",
      stage: "openings",
      batchId: undefined,
      sampleSemanticPath: undefined
    });
    // Belt courses are emitted as high-detail mesh batches after profiled-trim work.
    expect(beltCourse).toMatchObject({
      source: "meshBatch",
      batchId: "mesh.belt-course",
      label: "Belt course / horizontal trim",
      stage: "trim"
    });
    expect(gallery.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "componentGallery.recipeOnly",
        severity: "warning",
        received: "recipe.opening.window.recess"
      })
    );
  });

  it("preserves anchors, dimensions, atlas slots, and stage metadata needed by Component Forge controls", async () => {
    const { ir, catalog } = await fixtureGalleryInputs();
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
      source: "instanceBatch",
      atlasSlotIds: ["trim.vertical.primary"],
      metrics: expect.objectContaining({
        instanceCount: 8
      })
    });
    expect(windowFrame?.dimensionsM.depth).toBeGreaterThanOrEqual(0.28);
    expect(windowFrame?.anchorIds).toEqual(expect.arrayContaining(["origin", "sill-center", "lintel-center"]));
    expect(gallery.entries.every((entry) => entry.atlasSlotIds.length > 0)).toBe(true);
    expect(gallery.entries.every((entry) => entry.dimensionsM.width > 0 && entry.dimensionsM.height > 0)).toBe(true);
  });
});
