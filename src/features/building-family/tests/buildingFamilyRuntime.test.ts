import { vi } from "vitest";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import { ProceduralMaterialProvider, type MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import {
  createBuildingFamilyRuntime
} from "../renderer-three/familyRuntime";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function familyRuntimeFixture() {
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
  const ir = await compileBuilding({ spec, catalog, graph, buildingId: "fixture-building" });
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

  return {
    catalog,
    componentGallery,
    debugExport,
    graph,
    ir,
    packedAtlas,
    spec
  };
}

describe("building family runtime", () => {
  it("creates a shared atlas-backed family runtime for building scene runtimes", async () => {
    const { catalog, componentGallery, debugExport, ir, packedAtlas } = await familyRuntimeFixture();
    const family = createBuildingFamilyRuntime({
      familyId: ir.familyId,
      packedAtlas,
      debugExport
    });
    const building = family.createOrReplaceBuilding({ catalog, componentGallery, ir });
    const wallObject = building.objectsByBatchId.get("mesh.wall-panels")!;

    expect(family.root.name).toBe(`building-family-runtime.${ir.familyId}`);
    expect(family.root.children).toContain(building.root);
    expect(building.materialRegistry).toBe(family.materialRegistry);
    expect(wallObject.material.map).toBe(family.textureSet.textures.baseColor);
    expect(wallObject.material.userData.channelHashes).toEqual(family.textureSet.channelHashes);
    expect(family.metrics).toMatchObject({
      buildingCount: 1,
      meshCount: ir.meshBatches.length,
      instanceBatchCount: ir.instanceBatches.length,
      instanceCount: ir.metrics.instanceCount,
      triangleCount: ir.metrics.triangleCount,
      drawCallCount: building.renderables.length,
      textureCount: 5
    });
  });

  it("supports sixteen building runtimes from one shared family atlas", async () => {
    const { catalog, debugExport, graph, packedAtlas, spec } = await familyRuntimeFixture();
    const family = createBuildingFamilyRuntime({
      familyId: spec.familyId,
      packedAtlas,
      debugExport
    });
    const runtimes = await Promise.all(
      Array.from({ length: 16 }, async (_, index) => {
        const ir = await compileBuilding({
          spec,
          catalog,
          graph,
          buildingId: `fixture-building-${index.toString().padStart(2, "0")}`
        });
        return family.createOrReplaceBuilding({ catalog, ir });
      })
    );
    const wallMaterials = new Set(
      runtimes.map((runtime) => runtime.objectsByBatchId.get("mesh.wall-panels")!.material)
    );

    expect(family.listBuildingIds()).toHaveLength(16);
    expect(family.root.children).toHaveLength(16);
    expect(wallMaterials.size).toBe(1);
    expect(family.textureSet.disposed).toBe(false);
    expect(family.metrics.buildingCount).toBe(16);
    expect(family.metrics.drawCallCount).toBe(
      runtimes.reduce((total, runtime) => total + runtime.renderables.length, 0)
    );
  });

  it("replaces a building runtime by disposing old geometry while keeping shared atlas resources", async () => {
    const { catalog, debugExport, ir, packedAtlas } = await familyRuntimeFixture();
    const family = createBuildingFamilyRuntime({
      familyId: ir.familyId,
      packedAtlas,
      debugExport
    });
    const first = family.createOrReplaceBuilding({ catalog, ir });
    const geometryDisposers = first.renderables.map((object) => vi.spyOn(object.geometry, "dispose"));
    const firstWallMaterial = first.objectsByBatchId.get("mesh.wall-panels")!.material;
    const replacementIr = {
      ...ir,
      sourceGraphHash: `${ir.sourceGraphHash}.replacement`
    };
    const second = family.createOrReplaceBuilding({ catalog, ir: replacementIr });

    expect(second).not.toBe(first);
    expect(first.disposed).toBe(true);
    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(family.root.children).toEqual([second.root]);
    expect(family.textureSet.disposed).toBe(false);
    expect(firstWallMaterial.userData.disposed).toBeUndefined();
    expect(second.objectsByBatchId.get("mesh.wall-panels")!.material).toBe(firstWallMaterial);
  });

  it("disposes building geometries and shared atlas resources exactly once", async () => {
    const { catalog, debugExport, graph, packedAtlas, spec } = await familyRuntimeFixture();
    const family = createBuildingFamilyRuntime({
      familyId: spec.familyId,
      packedAtlas,
      debugExport
    });
    const firstIr = await compileBuilding({ spec, catalog, graph, buildingId: "fixture-building-a" });
    const secondIr = await compileBuilding({ spec, catalog, graph, buildingId: "fixture-building-b" });
    const first = family.createOrReplaceBuilding({ catalog, ir: firstIr });
    const second = family.createOrReplaceBuilding({ catalog, ir: secondIr });
    const geometryDisposers = [...first.renderables, ...second.renderables].map((object) =>
      vi.spyOn(object.geometry, "dispose")
    );
    const textureDisposers = Object.values(family.textureSet.textures).map((texture) =>
      vi.spyOn(texture, "dispose")
    );
    const materialDisposers = family.materialRegistry.listMaterials().map((material) =>
      vi.spyOn(material, "dispose")
    );

    family.dispose();
    family.dispose();

    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(textureDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(family.disposed).toBe(true);
    expect(family.textureSet.disposed).toBe(true);
    expect(family.root.children).toHaveLength(0);
    expect(family.metrics.buildingCount).toBe(0);
  });
});
