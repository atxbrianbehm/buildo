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
import type { PsgEvaluationResult } from "../../prompt-spaghetti/contracts/psgDocument";
import type { PromptInterpretationResult } from "../psg/localRulePromptInterpreter";
import type { AdaptPsgEvaluationResult } from "../psg/psgBuildingIntentAdapter";

const defaultFixturePromptControls: BuildingPromptControls = {
  prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
  psgPresetId: "late19cCommercialDemo",
  stylePackId: "late-19c-commercial-demo",
  floorCount: 4,
  bayCount: 7,
  roofType: "flat",
  trimDensity: "ornate",
  lockedComponentKeys: [],
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

export interface AssemblyHallPromptTrace {
  schemaVersion: "0.1.0";
  interpreterProvider: PromptInterpretationResult["provider"];
  psgPresetId: BuildingPromptControls["psgPresetId"];
  stylePackId: string;
  traceId: string;
  psgOutputs: PsgEvaluationResult["outputs"];
  evaluatedVariables: Array<{
    name: string;
    value: string | number | boolean | null;
  }>;
  interpreterOverrides: Array<{
    name: string;
    value: string | number;
  }>;
  requestedControls: Array<{
    name: string;
    value: string | number;
  }>;
  psgTrace: PsgEvaluationResult["trace"];
  diagnostics: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "error";
  }>;
}

export interface AssemblyHallFixture {
  schemaVersion: "0.1.0";
  prompt: string;
  promptTrace: AssemblyHallPromptTrace;
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

function promptTraceFor(input: {
  adapted: AdaptPsgEvaluationResult;
  controls: BuildingPromptControls;
  evaluation: PsgEvaluationResult;
  promptResult: PromptInterpretationResult;
  spec: BuildingFamilySpec;
}): AssemblyHallPromptTrace {
  return {
    schemaVersion: "0.1.0",
    interpreterProvider: input.promptResult.provider,
    psgPresetId: input.controls.psgPresetId,
    stylePackId: input.spec.stylePackId,
    traceId: input.adapted.intent.psg.traceId,
    psgOutputs: input.evaluation.outputs,
    evaluatedVariables: Object.entries(input.evaluation.variables)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    interpreterOverrides: Object.entries(input.promptResult.overrides)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    requestedControls: [
      { name: "floorCount", value: input.controls.floorCount },
      { name: "bayCount", value: input.controls.bayCount },
      { name: "roofType", value: input.controls.roofType },
      { name: "trimDensity", value: input.controls.trimDensity },
      { name: "stylePackId", value: input.controls.stylePackId },
      { name: "familySeed", value: input.controls.seeds.family },
      { name: "buildingSeed", value: input.controls.seeds.building },
      { name: "materialSeed", value: input.controls.seeds.material },
      { name: "trimSeed", value: input.controls.seeds.trim }
    ],
    psgTrace: input.evaluation.trace,
    diagnostics: [
      ...input.promptResult.diagnostics,
      ...input.adapted.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity
      })),
      ...input.spec.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity
      }))
    ]
  };
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
    locks: controls.lockedComponentKeys.map((componentKey) => ({
      semanticPath: `component/${componentKey}`,
      scope: "building",
      lockedValue: {
        componentKey
      },
      reason: "Component Forge local lock"
    })),
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
  const promptTrace = promptTraceFor({ adapted, controls, evaluation, promptResult, spec });
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
    promptTrace,
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
