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
import type { Diagnostic } from "../core/diagnostics";
import {
  ProceduralMaterialProvider,
  type MaterialGenerationProvider,
  type MaterialSourceRequest
} from "../materials/providers/proceduralMaterialProvider";
import type { PngLayerDecoder } from "../materials/remoteMaterialImageBridge";
import type { RemoteMaterialOverlayOptions } from "../materials/remoteMaterialOverlay";
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
import {
  applyRemoteMaterialRouteOverlays,
  type AppliedRemoteMaterialSourceSummary,
  type RemoteMaterialApplicationRouteSummary,
  type RemoteMaterialImageRequester
} from "../state/remoteMaterialApplicationCoordinator";
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
  remoteMaterialEnabled: false,
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

export interface AssemblyHallVariantStressVariant {
  index: number;
  buildingSeed: string;
  buildingId: string;
  sourceGraphHash: string;
  drawCallCount: number;
  instanceCount: number;
  triangleCount: number;
  semanticPathCount: number;
}

export interface AssemblyHallVariantStress {
  schemaVersion: "0.1.0";
  variantCount: number;
  sharedFamilyId: string;
  sharedAtlasId: string;
  sharedAtlasContentHash: string;
  sharedCatalogId: string;
  sharedSourceGraphHash: string;
  aggregate: {
    drawCallCount: number;
    instanceCount: number;
    triangleCount: number;
    semanticPathCount: number;
  };
  variants: AssemblyHallVariantStressVariant[];
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

export interface AssemblyHallRemoteMaterialApplication {
  schemaVersion: "0.1.0";
  route: RemoteMaterialApplicationRouteSummary;
  remoteSources: AppliedRemoteMaterialSourceSummary[];
  diagnostics: Diagnostic[];
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
  variantStress: AssemblyHallVariantStress;
  remoteMaterialApplication?: AssemblyHallRemoteMaterialApplication;
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
  remoteMaterial?: {
    decodePngLayer: PngLayerDecoder;
    requestRemoteImages?: RemoteMaterialImageRequester;
    selectRequests?: (requests: MaterialSourceRequest[]) => MaterialSourceRequest[];
    overlayOptions?: RemoteMaterialOverlayOptions;
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Assembly Hall fixture generation aborted");
  }
}

async function buildingIdFor(spec: BuildingFamilySpec, controls: BuildingPromptControls): Promise<string> {
  return buildingIdForSeed(spec, controls.seeds.building);
}

async function buildingIdForSeed(spec: BuildingFamilySpec, buildingSeed: string): Promise<string> {
  const hash = await hashCanonicalJson({
    familyId: spec.familyId,
    buildingSeed,
    floorCount: spec.massing.floorCount,
    bayCount: spec.facade.frontBayCount
  });
  return `${spec.familyId}.building-${hash.slice(0, 12)}`;
}

function variantBuildingSeed(baseSeed: string, index: number): string {
  return index === 0 ? baseSeed : `${baseSeed}-variant-${index.toString().padStart(2, "0")}`;
}

function stressVariantForIr(
  index: number,
  buildingSeed: string,
  ir: RuntimeBuildingIR
): AssemblyHallVariantStressVariant {
  return {
    index,
    buildingSeed,
    buildingId: ir.buildingId,
    sourceGraphHash: ir.sourceGraphHash,
    drawCallCount: ir.meshBatches.length + ir.instanceBatches.length,
    instanceCount: ir.metrics.instanceCount,
    triangleCount: ir.metrics.triangleCount,
    semanticPathCount: ir.semanticIndex.length
  };
}

async function createVariantStressSummary(input: {
  catalog: ComponentCatalog;
  controls: BuildingPromptControls;
  graph: BuildingGraph;
  ir: RuntimeBuildingIR;
  packedAtlas: PackedAtlas;
  signal: AbortSignal;
  spec: BuildingFamilySpec;
}): Promise<AssemblyHallVariantStress> {
  const variants = await Promise.all(
    Array.from({ length: 16 }, async (_, index) => {
      throwIfAborted(input.signal);
      const buildingSeed = variantBuildingSeed(input.controls.seeds.building, index);
      if (index === 0) {
        return stressVariantForIr(index, buildingSeed, input.ir);
      }

      const variantIr = await compileBuilding({
        spec: input.spec,
        catalog: input.catalog,
        graph: input.graph,
        buildingId: await buildingIdForSeed(input.spec, buildingSeed)
      });
      return stressVariantForIr(index, buildingSeed, variantIr);
    })
  );
  throwIfAborted(input.signal);

  return {
    schemaVersion: "0.1.0",
    variantCount: variants.length,
    sharedFamilyId: input.spec.familyId,
    sharedAtlasId: input.packedAtlas.atlasId,
    sharedAtlasContentHash: input.packedAtlas.contentHash,
    sharedCatalogId: input.catalog.catalogId,
    sharedSourceGraphHash: input.ir.sourceGraphHash,
    aggregate: {
      drawCallCount: variants.reduce((total, variant) => total + variant.drawCallCount, 0),
      instanceCount: variants.reduce((total, variant) => total + variant.instanceCount, 0),
      triangleCount: variants.reduce((total, variant) => total + variant.triangleCount, 0),
      semanticPathCount: variants.reduce((total, variant) => total + variant.semanticPathCount, 0)
    },
    variants
  };
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

const defaultRemoteMaterialSourceIds = new Set([
  "source.wall.primary",
  "source.wall.secondary",
  "source.roof.primary",
  "source.frame.primary",
  "source.door.primary",
  "source.trim.horizontal.primary",
  "source.trim.horizontal.secondary",
  "source.trim.vertical.primary",
  "source.cornice.primary",
  "source.ornament.primary"
]);

function defaultRemoteMaterialRequests(requests: MaterialSourceRequest[]): MaterialSourceRequest[] {
  return requests
    .filter((request) => defaultRemoteMaterialSourceIds.has(request.sourceId))
    .slice(0, 4);
}

function routeRunId(inputRunId: string | undefined, spec: BuildingFamilySpec): string {
  return inputRunId ?? `assembly-hall-fixture:${spec.familyId}`;
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
  let remoteMaterialApplication: AssemblyHallRemoteMaterialApplication | undefined;
  if (!packedAtlas) {
    const materialRequests = atlasPlan.materialSources.map(
      (source): MaterialSourceRequest => ({
        ...source,
        widthPx: 32,
        heightPx: 32
      })
    );
    const provider = input.materialProvider ?? new ProceduralMaterialProvider();
    let materialSources = await Promise.all(materialRequests.map((request) => provider.generate(request, signal)));
    generatedMaterialSourceCount = materialSources.length;
    if (input.remoteMaterial) {
      const remoteRequests = (input.remoteMaterial.selectRequests ?? defaultRemoteMaterialRequests)(materialRequests);
      if (remoteRequests.length > 0) {
        const application = await applyRemoteMaterialRouteOverlays({
          runId: routeRunId(input.runId, spec),
          requests: remoteRequests,
          proceduralArtifacts: materialSources,
          decodePngLayer: input.remoteMaterial.decodePngLayer,
          signal,
          requestRemoteImages: input.remoteMaterial.requestRemoteImages,
          overlayOptions: input.remoteMaterial.overlayOptions
        });
        materialSources = application.artifacts;
        remoteMaterialApplication = {
          schemaVersion: "0.1.0",
          route: application.route,
          remoteSources: application.remoteSources,
          diagnostics: application.diagnostics
        };
      }
    }
    packedAtlas = await packAtlas(atlasPlan, materialSources);
    if (remoteMaterialApplication?.diagnostics.length) {
      packedAtlas = {
        ...packedAtlas,
        diagnostics: [...packedAtlas.diagnostics, ...remoteMaterialApplication.diagnostics]
      };
    }
  }
  const debugExport = input.reusableArtifacts?.debugExport ?? (await createAtlasDebugExport(packedAtlas));
  const componentGallery = await buildComponentGallery({ catalog, ir });
  const variantStress = await createVariantStressSummary({
    catalog,
    controls,
    graph,
    ir,
    packedAtlas,
    signal,
    spec
  });
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
    variantStress,
    remoteMaterialApplication,
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
      (remoteMaterialApplication?.remoteSources.length ?? 0) +
      debugExport.channels.length +
      1
  };
}
