import { vi } from "vitest";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import {
  createBuildingSceneRuntime,
  detectRendererBackendSupport,
  disposeBuildingSceneRuntime
} from "../renderer-three/buildingSceneAdapter";
import { createAtlasMaterialRegistry } from "../renderer-three/buildingAtlasMaterialFactory";
import { createAtlasTextureSet, slotTextureWindow } from "../renderer-three/buildingAtlasTextureFactory";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import { ProceduralMaterialProvider, type MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureRuntimeInputs() {
  const prompt = "four floors, 7 bays, brick, flat roof, ornate trim";
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt,
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
  const atlasPlan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  const ir = await compileBuilding({ spec, catalog, graph });
  const materialRequests = atlasPlan.materialSources.map(
    (source): MaterialSourceRequest => ({
      ...source,
      widthPx: 32,
      heightPx: 32
    })
  );
  const provider = new ProceduralMaterialProvider();
  const materialSources = await Promise.all(
    materialRequests.map((request) => provider.generate(request, new AbortController().signal))
  );
  const packedAtlas = await packAtlas(atlasPlan, materialSources);
  const debugExport = await createAtlasDebugExport(packedAtlas);
  const componentGallery = await buildComponentGallery({ catalog, ir });
  return { catalog, ir, packedAtlas, debugExport, componentGallery };
}

describe("building scene adapter", () => {
  it("detects WebGPU support from the Three.js webgpu entrypoint while keeping WebGL fallback available", async () => {
    const support = await detectRendererBackendSupport();

    expect(support.threeRevision).toBe("184");
    expect(support.webgl.available).toBe(true);
    expect(support.webgl.importPath).toBe("three");
    expect(support.webgpu.available).toBe(true);
    expect(support.webgpu.importPath).toBe("three/webgpu");
    expect(support.preferredBackend).toBe("webgpu");
  });

  it("creates atlas-aware material registry entries keyed by atlas slots without uploading textures yet", async () => {
    const { packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const registry = createAtlasMaterialRegistry({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      debugExport
    });
    const wallMaterial = registry.getMaterial("wall.primary");
    const wallMaterialAgain = registry.getMaterial("wall.primary");

    expect(wallMaterial).toBe(wallMaterialAgain);
    expect(wallMaterial.userData).toMatchObject({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      atlasSlotId: "wall.primary",
      rendererBoundary: "building-family"
    });
    expect(registry.listMaterialSlotIds()).toContain("wall.primary");
    expect(registry.listMaterialSlotIds()).toContain("glass.primary");

    registry.dispose();
    expect(wallMaterial.userData.disposed).toBe(true);
  });

  it("converts RuntimeBuildingIR mesh batches into BufferGeometry meshes grouped by assembly stage", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const wallBatch = ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels")!;
    const sourceUvs = Array.from(wallBatch.uvs!);
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport,
        textureSet
      })
    });
    const wallObject = runtime.objectsByBatchId.get("mesh.wall-panels");
    const wallWindow = slotTextureWindow(textureSet, "wall.primary");
    const renderedUvs = Array.from(wallObject!.geometry.getAttribute("uv").array as ArrayLike<number>);
    const renderedU = renderedUvs.filter((_, index) => index % 2 === 0);
    const renderedV = renderedUvs.filter((_, index) => index % 2 === 1);

    expect(runtime.root.type).toBe("Group");
    expect(runtime.stageGroups.map((group) => group.stage)).toEqual(["massing", "facade", "openings", "trim", "roof"]);
    expect(wallObject?.type).toBe("Mesh");
    expect(wallObject?.userData).toMatchObject({
      batchId: "mesh.wall-panels",
      stage: "facade",
      materialSlotId: "wall.primary"
    });
    expect(wallObject?.parent?.userData.stage).toBe("facade");
    expect(wallObject?.geometry.getAttribute("position").count).toBe(wallBatch.positions!.length / 3);
    expect(wallObject?.geometry.getAttribute("normal").count).toBe(wallBatch.normals!.length / 3);
    expect(wallObject?.geometry.getAttribute("uv").count).toBe(wallBatch.uvs!.length / 2);
    expect(Math.min(...renderedU)).toBeCloseTo(wallWindow.uvRect.x);
    expect(Math.max(...renderedU)).toBeCloseTo(wallWindow.uvRect.x + wallWindow.uvRect.width);
    expect(Math.min(...renderedV)).toBeCloseTo(wallWindow.uvRect.y);
    expect(Math.max(...renderedV)).toBeCloseTo(wallWindow.uvRect.y + wallWindow.uvRect.height);
    expect(Array.from(wallBatch.uvs!)).toEqual(sourceUvs);
    expect(wallObject?.geometry.index?.count).toBe(wallBatch.indices!.length);
    expect(runtime.metrics.meshCount).toBe(ir.meshBatches.length);

    disposeBuildingSceneRuntime(runtime);
  });

  it("uses InstancedMesh for repeated component batches and applies compiler transforms", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const windowObject = runtime.objectsByBatchId.get("instances.window");
    const windowBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window")!;

    expect(windowObject?.isInstancedMesh).toBe(true);
    expect(windowObject?.instanceMatrix).toBeDefined();
    const matrixElements = Array.from(windowObject!.instanceMatrix!.array.slice(0, 16));
    expect(windowObject?.count).toBe(windowBatch.count);
    expect(matrixElements).toEqual(Array.from(windowBatch.transforms!.slice(0, 16)));
    expect(windowObject?.userData.recipeId).toBe("recipe.window.tall-arched.frame");
    expect(windowObject?.userData.materialSlotId).toBe("frame.primary");
    expect(runtime.metrics.instanceCount).toBe(ir.metrics.instanceCount);
    expect(runtime.objectsByBatchId.get("instances.window.glass")?.isInstancedMesh).toBe(true);
  });

  it("builds semantic lookup entries and links gallery entries to renderer objects", async () => {
    const { catalog, ir, packedAtlas, debugExport, componentGallery } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      componentGallery,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const windowPath = ir.semanticIndex.find(
      (entry) => entry.batchId === "instances.window" && entry.elementIndex === 0
    )?.semanticPath;
    expect(windowPath).toBeDefined();
    const lookup = runtime.semanticLookup.get(windowPath!);
    const windowGallery = runtime.galleryObjects.get("recipe.window.tall-arched.frame");

    expect(lookup).toMatchObject({
      semanticPath: windowPath,
      batchId: "instances.window",
      stage: "openings",
      elementIndex: 0
    });
    expect(lookup?.object.isInstancedMesh).toBe(true);
    expect(windowGallery?.object.isInstancedMesh).toBe(true);
    expect(windowGallery?.entry.sampleSemanticPath).toBe(windowPath);
  });

  it("disposes geometries and materials owned by the scene runtime", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const geometryDisposers = runtime.renderables.map((object) => vi.spyOn(object.geometry, "dispose"));
    const materialDisposers = runtime.materialRegistry
      .listMaterials()
      .map((material) => vi.spyOn(material, "dispose"));
    const result = disposeBuildingSceneRuntime(runtime);

    expect(result.geometriesDisposed).toBe(runtime.renderables.length);
    expect(result.materialsDisposed).toBe(materialDisposers.length);
    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(runtime.root.children).toHaveLength(0);
    expect(runtime.disposed).toBe(true);
  });
});
