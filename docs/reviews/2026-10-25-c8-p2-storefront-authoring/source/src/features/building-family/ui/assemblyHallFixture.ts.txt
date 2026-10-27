import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery, type ComponentGallery } from "../compiler/componentGalleryBuilder";
import { buildFacadeSplitPlan, type FacadeSplitPlan } from "../compiler/facadeSplitPlan";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import type { BuildingGraph } from "../contracts/buildingGraph";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import {
  buildingCompositionKey,
  withBuildingSeedVariation
} from "../core/buildingSeedVariation";
import { hashCanonicalJson } from "../core/contentHash";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { buildWindowFrameRecipe, buildWindowGlassRecipe } from "../components/frameBuilder";
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
import { parseCompletedFamilyPersistencePacket } from "../state/completedFamilyPersistence";
import {
  captureBuildingSourceControls, captureBuildingSourceSnapshot, createBuildingSourceSnapshot,
  resolveBuildingSourceSnapshot, type BuildingSourceSnapshot
} from "../state/buildingSourceFile";
import { canonicalJson } from "../core/canonicalJson";
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
  detailLevel: "high",
  fidelityMode: "kit",
  roofType: "flat",
  trimDensity: "ornate",
  windowFamily: "tall-arched",
  corniceFamily: "bracketed-metal",
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
  /** Structural composition key used to prove building seeds are not near-clones. */
  compositionKey?: string;
  frontBayCount?: number;
  depthM?: number;
  windowFamily?: string;
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
  sourceSnapshot?: BuildingSourceSnapshot;
  fidelityMode: BuildingPromptControls["fidelityMode"];
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
  sourceSnapshot?: BuildingSourceSnapshot;
  sourceIdentity?: { documentId: string; revision: number };
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
  ir: RuntimeBuildingIR,
  spec: BuildingFamilySpec
): AssemblyHallVariantStressVariant {
  return {
    index,
    buildingSeed,
    buildingId: ir.buildingId,
    sourceGraphHash: ir.sourceGraphHash,
    compositionKey: buildingCompositionKey(spec),
    frontBayCount: spec.facade.frontBayCount,
    depthM: spec.massing.depthM,
    windowFamily: spec.selectedFamilies.window,
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
  const fidelityMode = input.controls.fidelityMode ?? "kit";
  const detailLevel = input.controls.detailLevel ?? "high";
  const variants = await Promise.all(
    Array.from({ length: 16 }, async (_, index) => {
      throwIfAborted(input.signal);
      const buildingSeed = variantBuildingSeed(input.controls.seeds.building, index);
      if (index === 0) {
        return stressVariantForIr(index, buildingSeed, input.ir, input.spec);
      }

      // Re-derive building-scoped massing/opening families, then replan + recompile.
      // Catalog is rebuilt when window family changes so recipes match the seed.
      const variantSpec = withBuildingSeedVariation(input.spec, buildingSeed, stylePack);
      const variantCatalog = await buildComponentCatalog(variantSpec, input.packedAtlas.manifest);
      const variantGraph = await buildBuildingGraph(variantSpec, variantCatalog, { fidelityMode });
      const variantIr = await compileBuilding({
        spec: variantSpec,
        catalog: variantCatalog,
        graph: variantGraph,
        buildingId: await buildingIdForSeed(variantSpec, buildingSeed),
        detailLevel,
        fidelityMode
      });
      return stressVariantForIr(index, buildingSeed, variantIr, variantSpec);
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
      { name: "detailLevel", value: input.controls.detailLevel ?? "high" },
      { name: "fidelityMode", value: input.controls.fidelityMode ?? "kit" },
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

/** Reconstruct unedited aperture authority from captured source, never rendered float buffers. */
export async function buildAssemblyHallSourceWindowSplit(input: {
  sourceSnapshot: unknown; catalog: ComponentCatalog;
}): Promise<FacadeSplitPlan> {
  const source = captureBuildingSourceSnapshot(input.sourceSnapshot);
  const catalog = structuredClone(input.catalog);
  const { spec } = await resolveBuildingSourceSnapshot(source);
  const wall = catalog.recipes.find(recipe => recipe.role === "wall");
  if (!wall) throw Object.assign(new Error("The accepted catalog has no wall recipe."), { code: "building.sourceFileInvalid" });
  const facadePlan = source.compilation.fidelityMode === "kit"
    ? planFacadeModules({ spec, kit: late19cApartmentKit })
    : undefined;
  return buildFacadeSplitPlan({
    spec, wallDepthM: Math.max(0.02, wall.dimensionsM.depth), facadePlan,
    kit: facadePlan ? late19cApartmentKit : undefined, defaultOpeningMode: "front-only"
  });
}

export async function createAssemblyHallFixture(
  input: CreateAssemblyHallFixtureInput = {}
): Promise<AssemblyHallFixture> {
  const suppliedSource = input.sourceSnapshot ? captureBuildingSourceSnapshot(input.sourceSnapshot) : undefined;
  const controls = suppliedSource
    ? captureBuildingSourceControls(input.promptControls ?? suppliedSource.controlsView)
    : structuredClone(input.promptControls ?? defaultFixturePromptControls);
  const sourceIdentity = { documentId: input.sourceIdentity?.documentId ?? "assembly-hall-window", revision: input.sourceIdentity?.revision ?? 0 };
  const reusableArtifacts = input.reusableArtifacts ? { ...input.reusableArtifacts } : undefined;
  const fallbackAbortController = input.signal ? undefined : new AbortController();
  const signal = input.signal ?? fallbackAbortController!.signal;
  const explicitWindowFamily = controls.windowFamily;
  let spec: AssemblyHallFixture["spec"];
  let promptTrace: AssemblyHallPromptTrace;
  let sourceSnapshot: BuildingSourceSnapshot | undefined;
  throwIfAborted(signal);
  if (suppliedSource) {
    if (canonicalJson(controls) !== canonicalJson(suppliedSource.controlsView) || !reusableArtifacts?.packedAtlas || !reusableArtifacts.debugExport) {
      throw Object.assign(new Error("Opening source requires its exact controls view and saved material artifacts."), { code: "building.sourceFileInvalid" });
    }
    const resolved = await resolveBuildingSourceSnapshot(suppliedSource);
    spec = resolved.spec;
    sourceSnapshot = resolved.sourceSnapshot;
    promptTrace = {
      schemaVersion: "0.1.0", interpreterProvider: "local-rule", psgPresetId: controls.psgPresetId,
      stylePackId: spec.stylePackId, traceId: sourceSnapshot.intent.psg.traceId, psgOutputs: [],
      evaluatedVariables: Object.entries(sourceSnapshot.intent.psg.evaluatedVariables)
        .filter((entry): entry is [string, string | number | boolean | null] => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1]))
        .map(([name, value]) => ({ name, value })).sort((left, right) => left.name.localeCompare(right.name)),
      interpreterOverrides: [],
      requestedControls: [
        { name: "floorCount", value: controls.floorCount }, { name: "bayCount", value: controls.bayCount },
        { name: "windowFamily", value: controls.windowFamily }, { name: "detailLevel", value: controls.detailLevel },
        { name: "fidelityMode", value: controls.fidelityMode }
      ],
      psgTrace: [],
      diagnostics: [{ code: "building.sourceOpened", severity: "info", message: "Compiled captured source " + sourceSnapshot.document.documentId + " revision " + sourceSnapshot.document.revision + "; PSG and prompt interpretation were not re-executed." }, ...spec.diagnostics.map(({ code, message, severity }) => ({ code, message, severity }))]
    };
  } else {
    const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
    const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt: controls.prompt });
    const adapted = adaptPsgEvaluationToBuildingIntent({
      prompt: controls.prompt, seeds: controls.seeds, evaluation,
      locks: controls.lockedComponentKeys.map((componentKey) => ({
        semanticPath: "component/" + componentKey, scope: "building", lockedValue: { componentKey }, reason: "Component Forge local lock"
      })),
      promptOverrides: {
        ...promptResult.overrides, stylePackId: controls.stylePackId, floorCount: controls.floorCount,
        bayCount: controls.bayCount, roofType: controls.roofType, trimDensity: controls.trimDensity,
        windowFamily: controls.windowFamily, corniceFamily: controls.corniceFamily
      }
    });
    if (explicitWindowFamily === undefined) {
      // Preserve the historical untyped absent-choice boundary without inventing a saved source.
      spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
    } else {
      try {
        const resolved = await createBuildingSourceSnapshot({ ...sourceIdentity, controls, intent: adapted.intent, stylePack });
        spec = resolved.spec;
        sourceSnapshot = resolved.sourceSnapshot;
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error("Cannot resolve explicit window family: " + explicitWindowFamily), { code: "building.documentResolutionRejected" });
      }
    }
    promptTrace = promptTraceFor({ adapted, controls, evaluation, promptResult, spec });
  }
  throwIfAborted(signal);
  const fidelityMode = controls.fidelityMode ?? "kit";
  const atlasPlan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalogManifest = explicitWindowFamily === undefined
    ? atlasPlan.manifest
    : reusableArtifacts?.packedAtlas?.manifest ?? atlasPlan.manifest;
  let reusedCatalog = reusableArtifacts?.catalog;
  if (explicitWindowFamily !== undefined && reusedCatalog) {
    const expectedWindowFrame = buildWindowFrameRecipe(spec);
    const expectedWindowGlass = buildWindowGlassRecipe(spec);
    const reusedWindowFrame = reusedCatalog.recipes.find((recipe) => recipe.id === expectedWindowFrame.id);
    const reusedWindowGlass = reusedCatalog.recipes.find((recipe) => recipe.id === expectedWindowGlass.id);
    // Preserve established structural reuse; check the selected window's recipe lineage only.
    const compatibleWindowCatalog =
      reusedCatalog.atlasId === catalogManifest.atlasId &&
      reusedWindowFrame?.kind === expectedWindowFrame.kind &&
      reusedWindowFrame.role === expectedWindowFrame.role &&
      reusedWindowFrame.profileRecipeId === expectedWindowFrame.profileRecipeId &&
      reusedWindowFrame.subcomponentRecipeIds?.includes(expectedWindowGlass.id) === true &&
      reusedWindowGlass?.kind === expectedWindowGlass.kind &&
      reusedWindowGlass.role === expectedWindowGlass.role;
    if (!compatibleWindowCatalog) reusedCatalog = undefined;
  }
  const catalog = reusedCatalog ?? (await buildComponentCatalog(spec, catalogManifest));
  const graph = await buildBuildingGraph(spec, catalog, { fidelityMode });
  const ir = await compileBuilding({
    spec,
    catalog,
    graph,
    buildingId: await buildingIdFor(spec, controls),
    detailLevel: controls.detailLevel ?? "high",
    fidelityMode,
    ...(sourceSnapshot?.schemaVersion === "0.4.0" ? { windowWidthOverrides: sourceSnapshot.windowWidthOverrides } : {}),
    ...(sourceSnapshot?.schemaVersion === "0.5.0" ? { windowWidthBatch: sourceSnapshot.windowWidthBatch } : {})
  });
  let generatedMaterialSourceCount = 0;
  let packedAtlas = reusableArtifacts?.packedAtlas;
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
  const debugExport = reusableArtifacts?.debugExport ?? (await createAtlasDebugExport(packedAtlas));
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
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
    fidelityMode,
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

export class CompletedFamilyReplayProfileError extends Error {
  readonly code = "building.completedReplayProfileUnresolved";

  constructor(message: string) {
    super(message);
    this.name = "CompletedFamilyReplayProfileError";
  }
}

export async function restoreAssemblyHallFixtureFromCompletedFamilyPacket(input: unknown): Promise<AssemblyHallFixture> {
  // Own the validated packet, including every typed buffer, before the first await.
  const packet = structuredClone(parseCompletedFamilyPersistencePacket(input));
  const fidelityMode = packet.fidelityMode;
  if (fidelityMode === undefined) {
    throw new CompletedFamilyReplayProfileError("This saved building is missing its original building mode. The saved copy has been retained.");
  }
  // These legacy graph receipts admit a detail profile; they are not compiler-content identities.
  const [highHash, lowHash] = await Promise.all([
    hashCanonicalJson(packet.artifacts.graph),
    hashCanonicalJson({ graph: packet.artifacts.graph, detailLevel: "low" })
  ]);
  const matches: Array<"high" | "low"> = [];
  if (packet.artifacts.runtimeIr.sourceGraphHash === highHash) matches.push("high");
  if (packet.artifacts.runtimeIr.sourceGraphHash === lowHash) matches.push("low");
  if (matches.length !== 1) {
    throw new CompletedFamilyReplayProfileError("This saved building's detail settings could not be verified. The saved copy has been retained.");
  }
  const ir = await compileBuilding({
    spec: packet.artifacts.spec,
    catalog: packet.artifacts.componentCatalog,
    graph: packet.artifacts.graph,
    buildingId: packet.artifacts.runtimeIr.buildingId,
    detailLevel: matches[0]!,
    fidelityMode
  });
  const componentGallery = await buildComponentGallery({ catalog: packet.artifacts.componentCatalog, ir });
  const packedAtlas: PackedAtlas = {
    schemaVersion: "0.1.0",
    atlasId: packet.artifacts.atlasManifest.atlasId,
    manifest: packet.artifacts.atlasManifest,
    channels: packet.artifacts.atlasChannels,
    slotProvenance: packet.artifacts.atlasSlotProvenance,
    contentHash: packet.artifacts.atlasContentHash,
    diagnostics: packet.artifacts.debugExport.diagnostics
  };
  const backendSupport = await detectRendererBackendSupport();
  const familyRuntime = createBuildingFamilyRuntime({
    familyId: packet.familyId,
    packedAtlas,
    debugExport: packet.artifacts.debugExport,
    backendSupport
  });
  let transferred = false;
  try {
    const buildingRuntime = familyRuntime.createOrReplaceBuilding({
      catalog: packet.artifacts.componentCatalog,
      componentGallery,
      ir
    });
    const fixture: AssemblyHallFixture = {
      schemaVersion: "0.1.0",
      prompt: packet.prompt ?? "Restored completed family",
      fidelityMode,
      promptTrace: packet.provenance.promptTrace,
      spec: packet.artifacts.spec,
      catalog: packet.artifacts.componentCatalog,
      graph: packet.artifacts.graph,
      ir,
      packedAtlas,
      debugExport: packet.artifacts.debugExport,
      componentGallery,
      variantStress: packet.provenance.variantStress,
      remoteMaterialApplication: packet.provenance.remoteMaterialApplication,
      backendSupport,
      familyRuntime,
      buildingRuntime,
      metrics: {
        activeBackend: "pending",
        preferredBackend: backendSupport.preferredBackend,
        atlasContentHash: packedAtlas.contentHash,
        atlasChannelCount: packet.artifacts.debugExport.channels.length,
        buildingCount: familyRuntime.metrics.buildingCount,
        componentCount: componentGallery.entries.length,
        drawCallCount: familyRuntime.metrics.drawCallCount,
        instanceCount: familyRuntime.metrics.instanceCount,
        triangleCount: familyRuntime.metrics.triangleCount,
        textureCount: familyRuntime.metrics.textureCount
      },
      provenanceEntryCount: packet.provenance.provenanceEntryCount
    };
    transferred = true;
    return fixture;
  } finally {
    if (!transferred) familyRuntime.dispose();
  }
}
