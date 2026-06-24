import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery, type ComponentGallery } from "../compiler/componentGalleryBuilder";
import type { BuildingGraph } from "../contracts/buildingGraph";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { hashCanonicalJson } from "../core/contentHash";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { createAtlasDebugExport, type AtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import {
  ProceduralMaterialProvider,
  type MaterialGenerationProvider,
  type MaterialSourceRequest
} from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import {
  createBuildingFamilyRuntime,
  type BuildingFamilyRuntime
} from "../renderer-three/familyRuntime";
import type { AssemblyRendererBackend } from "../renderer-three/assemblyRendererFactory";
import {
  detectRendererBackendSupport,
  type BuildingSceneRuntime,
  type RendererBackendSupport
} from "../renderer-three/buildingSceneAdapter";
import type { BuildingPromptControls } from "../state/buildingStore";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

const defaultFixturePromptControls: BuildingPromptControls = {
  prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
  psgPresetId: "late19cCommercialDemo",
  stylePackId: "late-19c-commercial-demo",
  floorCount: 4,
  bayCount: 7,
  roofType: "flat",
  trimDensity: "ornate",
  seeds: {
    family: "family-seed",
    building: "building-seed",
    material: "material-seed",
    trim: "trim-seed"
  }
};

export interface AssemblyHallMetrics {
  activeBackend: AssemblyRendererBackend | "pending";
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

export interface ReusableAssemblyHallArtifacts {
  catalog?: ComponentCatalog;
  debugExport?: AtlasDebugExport;
  packedAtlas?: PackedAtlas;
}

export interface CreateAssemblyHallFixtureInput {
  runId?: string;
  signal?: AbortSignal;
  promptControls?: BuildingPromptControls;
  reusableArtifacts?: ReusableAssemblyHallArtifacts;
  materialProvider?: MaterialGenerationProvider;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Assembly Hall fixture generation aborted");
  }
}

async function buildingIdFor(spec: BuildingFamilySpec, controls: BuildingPromptControls): Promise<string> {
  const hash = await hashCanonicalJson({
    familyId: spec.familyId,
    buildingSeed: controls.seeds.building,
    floorCount: spec.massing.floorCount,
    bayCount: spec.facade.frontBayCount
  });
  return `${spec.familyId}.building-${hash.slice(0, 12)}`;
}

export async function createAssemblyHallFixture(
  input: CreateAssemblyHallFixtureInput = {}
): Promise<AssemblyHallFixture> {
  const controls = input.promptControls ?? defaultFixturePromptControls;
  const fallbackAbortController = input.signal ? undefined : new AbortController();
  const signal = input.signal ?? fallbackAbortController!.signal;
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  throwIfAborted(signal);
  const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt: controls.prompt });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt: controls.prompt,
    seeds: controls.seeds,
    evaluation,
    promptOverrides: {
      ...promptResult.overrides,
      stylePackId: controls.stylePackId,
      floorCount: controls.floorCount,
      bayCount: controls.bayCount,
      roofType: controls.roofType,
      trimDensity: controls.trimDensity
    }
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  throwIfAborted(signal);
  const atlasPlan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalog = input.reusableArtifacts?.catalog ?? (await buildComponentCatalog(spec, atlasPlan.manifest));
  const graph = await buildBuildingGraph(spec, catalog);
  const ir = await compileBuilding({ spec, catalog, graph, buildingId: await buildingIdFor(spec, controls) });
  let generatedMaterialSourceCount = 0;
  let packedAtlas = input.reusableArtifacts?.packedAtlas;
  if (!packedAtlas) {
    const materialRequests = atlasPlan.materialSources.map(
      (source): MaterialSourceRequest => ({
        ...source,
        widthPx: 32,
        heightPx: 32
      })
    );
    const provider = input.materialProvider ?? new ProceduralMaterialProvider();
    const materialSources = await Promise.all(materialRequests.map((request) => provider.generate(request, signal)));
    generatedMaterialSourceCount = materialSources.length;
    packedAtlas = await packAtlas(atlasPlan, materialSources);
  }
  const debugExport = input.reusableArtifacts?.debugExport ?? (await createAtlasDebugExport(packedAtlas));
  const componentGallery = await buildComponentGallery({ catalog, ir });
  throwIfAborted(signal);
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
    prompt: controls.prompt,
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
      activeBackend: "pending",
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
      (generatedMaterialSourceCount || packedAtlas.slotProvenance.length) +
      packedAtlas.slotProvenance.length +
      debugExport.channels.length +
      1
  };
}
