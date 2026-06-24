import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery, type ComponentGallery } from "../compiler/componentGalleryBuilder";
import type { BuildingGraph } from "../contracts/buildingGraph";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { createAtlasDebugExport, type AtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import { ProceduralMaterialProvider, type MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import {
  createBuildingFamilyRuntime,
  type BuildingFamilyRuntime
} from "../renderer-three/familyRuntime";
import {
  detectRendererBackendSupport,
  type BuildingSceneRuntime,
  type RendererBackendSupport
} from "../renderer-three/buildingSceneAdapter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

const prompt = "four floors, 7 bays, brick, flat roof, ornate trim";
const seeds = {
  family: "family-seed",
  building: "building-seed",
  material: "material-seed",
  trim: "trim-seed"
};

export interface AssemblyHallMetrics {
  activeBackend: "webgl";
  preferredBackend: RendererBackendSupport["preferredBackend"];
  atlasContentHash: string;
  atlasChannelCount: number;
  buildingCount: number;
  componentCount: number;
  drawCallCount: number;
  instanceCount: number;
  triangleCount: number;
  textureCount: number;
}

export interface AssemblyHallFixture {
  schemaVersion: "0.1.0";
  prompt: string;
  spec: BuildingFamilySpec;
  catalog: ComponentCatalog;
  graph: BuildingGraph;
  ir: RuntimeBuildingIR;
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  componentGallery: ComponentGallery;
  backendSupport: RendererBackendSupport;
  familyRuntime: BuildingFamilyRuntime;
  buildingRuntime: BuildingSceneRuntime;
  metrics: AssemblyHallMetrics;
  provenanceEntryCount: number;
}

export async function createAssemblyHallFixture(): Promise<AssemblyHallFixture> {
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt,
    seeds,
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const atlasPlan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  const ir = await compileBuilding({ spec, catalog, graph, buildingId: `${spec.familyId}.fixture` });
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
  const backendSupport = await detectRendererBackendSupport();
  const familyRuntime = createBuildingFamilyRuntime({
    familyId: spec.familyId,
    packedAtlas,
    debugExport,
    backendSupport
  });
  const buildingRuntime = familyRuntime.createOrReplaceBuilding({
    catalog,
    componentGallery,
    ir
  });

  return {
    schemaVersion: "0.1.0",
    prompt,
    spec,
    catalog,
    graph,
    ir,
    packedAtlas,
    debugExport,
    componentGallery,
    backendSupport,
    familyRuntime,
    buildingRuntime,
    metrics: {
      activeBackend: "webgl",
      preferredBackend: backendSupport.preferredBackend,
      atlasContentHash: packedAtlas.contentHash,
      atlasChannelCount: debugExport.channels.length,
      buildingCount: familyRuntime.metrics.buildingCount,
      componentCount: componentGallery.entries.length,
      drawCallCount: familyRuntime.metrics.drawCallCount,
      instanceCount: familyRuntime.metrics.instanceCount,
      triangleCount: familyRuntime.metrics.triangleCount,
      textureCount: familyRuntime.metrics.textureCount
    },
    provenanceEntryCount:
      materialSources.length + packedAtlas.slotProvenance.length + debugExport.channels.length + 1
  };
}
