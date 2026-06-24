import type { GenerationStage } from "../contracts/generationRun";
import { hashCanonicalJson } from "../core/contentHash";
import { computeBuildingInvalidation, type BuildingInvalidation } from "../core/invalidation";
import {
  createAssemblyHallFixture,
  type AssemblyHallFixture,
  type CreateAssemblyHallFixtureInput,
  type ReusableAssemblyHallArtifacts
} from "../ui/assemblyHallFixture";
import type { BuildingArtifactRegistry } from "./artifactRegistry";
import { defaultBuildingPromptControls, type BuildingPromptControls, type BuildingStoreApi } from "./buildingStore";
import {
  requestRemoteMaterialImages,
  type RemoteMaterialRouteResult
} from "./remoteMaterialRouteClient";
import {
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket as defaultCreateCompletedFamilyPersistencePacket,
  type CompletedFamilyPersistenceCacheEntry,
  type CompletedFamilyPersistencePacket,
  type CreateCompletedFamilyPersistencePacketInput
} from "./completedFamilyPersistence";

export interface CompletedFamilyPersistenceWriter {
  put(entry: CompletedFamilyPersistenceCacheEntry): Promise<void>;
}

export interface BuildingRunControllerOptions {
  store: BuildingStoreApi;
  registry: BuildingArtifactRegistry;
  createFixture?: (input: CreateAssemblyHallFixtureInput & { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  createCompletedFamilyPersistencePacket?: (
    input: CreateCompletedFamilyPersistencePacketInput
  ) => Promise<CompletedFamilyPersistencePacket>;
  createRunId?: () => string;
  completedFamilyPersistence?: CompletedFamilyPersistenceWriter;
  nowMs?: () => number;
  remoteMaterial?: CreateAssemblyHallFixtureInput["remoteMaterial"];
}

export interface StartDemoRunResult {
  runId: string;
  artifactId?: string;
  fixture?: AssemblyHallFixture;
  stale: boolean;
}

interface ActiveRun {
  abortController: AbortController;
  runId: string;
}

const demoStageSequence: GenerationStage[] = [
  "evaluatingPsg",
  "normalizingSpec",
  "planningAtlas",
  "generatingMaterialSources",
  "compositingChannels",
  "packingAtlas",
  "buildingComponentCatalog",
  "buildingGraph",
  "compilingGeometry",
  "uploadingGpuResources"
];

function defaultRunId(): string {
  const bytes = new Uint32Array(2);
  globalThis.crypto.getRandomValues(bytes);
  return `building-run-${bytes[0].toString(16)}${bytes[1].toString(16)}`;
}

function disposeFixture(fixture: AssemblyHallFixture): void {
  fixture.familyRuntime.dispose();
}

function artifactIdForFixture(fixture: AssemblyHallFixture): string {
  return `assembly-hall-fixture:${fixture.ir.buildingId}:${fixture.packedAtlas.contentHash}`;
}

export class BuildingRunController {
  private readonly store: BuildingStoreApi;
  private readonly registry: BuildingArtifactRegistry;
  private readonly createFixture: (input: CreateAssemblyHallFixtureInput & { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  private readonly createCompletedFamilyPersistencePacket: (
    input: CreateCompletedFamilyPersistencePacketInput
  ) => Promise<CompletedFamilyPersistencePacket>;
  private readonly createRunId: () => string;
  private readonly completedFamilyPersistence: CompletedFamilyPersistenceWriter | undefined;
  private readonly nowMs: () => number;
  private readonly remoteMaterial: CreateAssemblyHallFixtureInput["remoteMaterial"];
  private activeRun: ActiveRun | undefined;
  private lastCompletedFixture: AssemblyHallFixture | undefined;
  private lastCompletedPrompt: BuildingPromptControls | undefined;

  constructor(options: BuildingRunControllerOptions) {
    this.store = options.store;
    this.registry = options.registry;
    this.createFixture = options.createFixture ?? createAssemblyHallFixture;
    this.createCompletedFamilyPersistencePacket =
      options.createCompletedFamilyPersistencePacket ?? defaultCreateCompletedFamilyPersistencePacket;
    this.createRunId = options.createRunId ?? defaultRunId;
    this.completedFamilyPersistence = options.completedFamilyPersistence;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.remoteMaterial = options.remoteMaterial;
  }

  async startDemoRun(prompt: BuildingPromptControls = defaultBuildingPromptControls): Promise<StartDemoRunResult> {
    this.cancelActiveRun();

    const runId = this.createRunId();
    const abortController = new AbortController();
    this.activeRun = { runId, abortController };
    const invalidation = this.lastCompletedPrompt
      ? computeBuildingInvalidation(this.lastCompletedPrompt, prompt)
      : computeBuildingInvalidation(prompt, prompt);
    const reusableArtifacts = this.reusableArtifactsFor(invalidation);
    const requestHashPromise = hashCanonicalJson({
      schemaVersion: "0.1.0",
      runKind: "late19c-commercial-demo",
      prompt
    });
    const startedAtMs = this.nowMs();
    this.store.getState().beginRun({
      runId,
      event: {
        stage: "resolvingPrompt",
        startedAtMs
      }
    });

    try {
      const remoteMaterial =
        reusableArtifacts.packedAtlas || !prompt.remoteMaterialEnabled
          ? undefined
          : this.remoteMaterialForRun(runId);
      const fixturePromise = this.createFixture({
        runId,
        signal: abortController.signal,
        promptControls: prompt,
        reusableArtifacts,
        ...(remoteMaterial ? { remoteMaterial } : {})
      });
      const [requestHash, fixture] = await Promise.all([requestHashPromise, fixturePromise]);
      if (abortController.signal.aborted || this.activeRun?.runId !== runId) {
        disposeFixture(fixture);
        return { runId, stale: true };
      }

      this.appendCompletedStageEvents(runId, fixture, invalidation, reusableArtifacts);
      const artifactId = artifactIdForFixture(fixture);
      this.registerFixtureArtifacts(fixture, requestHash);
      const metadata = this.registry.register({
        artifactId,
        artifactType: "assembly-hall-fixture",
        requestHash,
        contentHash: fixture.packedAtlas.contentHash,
        dependencies: [fixture.ir.sourceGraphHash],
        artifact: fixture,
        dispose: () => disposeFixture(fixture)
      });
      this.store.getState().registerArtifact(metadata);
      await this.persistCompletedFamily({
        fixture,
        requestHash,
        runId
      });
      this.store.getState().completeRun({
        runId,
        artifactId,
        event: {
          stage: "complete",
          startedAtMs: this.nowMs(),
          endedAtMs: this.nowMs(),
          outputArtifactId: artifactId
        }
      });
      this.lastCompletedPrompt = clonePrompt(prompt);
      this.lastCompletedFixture = fixture;
      this.store.getState().commitPromptControls(prompt);
      if (this.activeRun?.runId === runId) {
        this.activeRun = undefined;
      }
      return { runId, artifactId, fixture, stale: false };
    } catch (error) {
      if (abortController.signal.aborted) {
        return { runId, stale: true };
      }

      const message = error instanceof Error ? error.message : "Building run failed";
      this.store.getState().failRun({
        runId,
        message,
        event: {
          stage: "failed",
          startedAtMs: this.nowMs(),
          endedAtMs: this.nowMs(),
          error: {
            message
          }
        }
      });
      throw error;
    }
  }

  cancelActiveRun(): void {
    const activeRun = this.activeRun;
    if (!activeRun || activeRun.abortController.signal.aborted) {
      return;
    }

    activeRun.abortController.abort();
    this.store.getState().cancelRun({
      runId: activeRun.runId,
      event: {
        stage: "cancelled",
        startedAtMs: this.nowMs(),
        endedAtMs: this.nowMs()
      }
    });
    this.activeRun = undefined;
  }

  dispose(): void {
    this.cancelActiveRun();
    this.registry.clear();
  }

  private appendInstantEvent(
    runId: string,
    stage: GenerationStage,
    details: { outputArtifactId?: string; cacheHit?: boolean } = {}
  ): void {
    const startedAtMs = this.nowMs();
    this.store.getState().appendRunEvent(runId, {
      stage,
      startedAtMs,
      endedAtMs: this.nowMs(),
      ...details
    });
  }

  private remoteMaterialForRun(runId: string): CreateAssemblyHallFixtureInput["remoteMaterial"] {
    if (!this.remoteMaterial) {
      return undefined;
    }

    const requestRemoteImages = this.remoteMaterial.requestRemoteImages ?? requestRemoteMaterialImages;
    return {
      ...this.remoteMaterial,
      requestRemoteImages: async (input) => {
        const startedAtMs = this.nowMs();
        this.store.getState().appendRunEvent(runId, {
          stage: "generatingMaterialSources",
          startedAtMs,
          provider: "remote-material-route"
        });

        try {
          const result = await requestRemoteImages(input);
          const diagnostic = result.diagnostics[0];
          this.store.getState().appendRunEvent(runId, {
            stage: "generatingMaterialSources",
            startedAtMs,
            endedAtMs: this.nowMs(),
            provider: remoteMaterialProviderLabel(result),
            cacheHit: remoteMaterialCacheHit(result),
            ...(diagnostic
              ? {
                  error: {
                    message: diagnostic.message,
                    code: diagnostic.code
                  }
                }
              : {})
          });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Remote material provider failed.";
          this.store.getState().appendRunEvent(runId, {
            stage: "generatingMaterialSources",
            startedAtMs,
            endedAtMs: this.nowMs(),
            provider: "remote-material-route",
            error: {
              message
            }
          });
          throw error;
        }
      }
    };
  }

  private async persistCompletedFamily(input: {
    fixture: AssemblyHallFixture;
    requestHash: string;
    runId: string;
  }): Promise<void> {
    if (!this.completedFamilyPersistence) {
      return;
    }

    try {
      const packet = await this.createCompletedFamilyPersistencePacket({
        documentId: this.store.getState().selection.documentId,
        runId: input.runId,
        requestHash: input.requestHash,
        fixture: input.fixture
      });
      await this.completedFamilyPersistence.put(completedFamilyPersistenceCacheEntry(packet));
    } catch {
      return;
    }
  }

  private reusableArtifactsFor(invalidation: BuildingInvalidation): ReusableAssemblyHallArtifacts {
    if (!this.lastCompletedFixture) {
      return {};
    }

    return {
      ...(invalidation.reusableArtifacts.packedAtlas
        ? {
            packedAtlas: this.lastCompletedFixture.packedAtlas,
            debugExport: this.lastCompletedFixture.debugExport
          }
        : {}),
      ...(invalidation.reusableArtifacts.componentCatalog
        ? {
            catalog: this.lastCompletedFixture.catalog
          }
        : {})
    };
  }

  private appendCompletedStageEvents(
    runId: string,
    fixture: AssemblyHallFixture,
    invalidation: BuildingInvalidation,
    reusableArtifacts: ReusableAssemblyHallArtifacts
  ): void {
    const eventDetails: Partial<Record<GenerationStage, { outputArtifactId?: string; cacheHit?: boolean }>> = {
      normalizingSpec: {
        outputArtifactId: specArtifactId(fixture),
        cacheHit: false
      },
      planningAtlas: {
        outputArtifactId: atlasManifestArtifactId(fixture),
        cacheHit: Boolean(reusableArtifacts.packedAtlas)
      },
      generatingMaterialSources: {
        outputArtifactId: materialSourcesArtifactId(fixture),
        cacheHit: invalidation.reusableArtifacts.materialSources && Boolean(this.lastCompletedFixture)
      },
      compositingChannels: {
        outputArtifactId: packedAtlasArtifactId(fixture),
        cacheHit: Boolean(reusableArtifacts.packedAtlas)
      },
      packingAtlas: {
        outputArtifactId: packedAtlasArtifactId(fixture),
        cacheHit: Boolean(reusableArtifacts.packedAtlas)
      },
      buildingComponentCatalog: {
        outputArtifactId: componentCatalogArtifactId(fixture),
        cacheHit: Boolean(reusableArtifacts.catalog)
      },
      buildingGraph: {
        outputArtifactId: buildingGraphArtifactId(fixture),
        cacheHit: false
      },
      compilingGeometry: {
        outputArtifactId: runtimeIrArtifactId(fixture),
        cacheHit: false
      },
      uploadingGpuResources: {
        outputArtifactId: gpuSceneArtifactId(fixture),
        cacheHit: false
      }
    };

    for (const stage of demoStageSequence) {
      this.appendInstantEvent(runId, stage, eventDetails[stage]);
    }
  }

  private registerFixtureArtifacts(fixture: AssemblyHallFixture, requestHash: string): void {
    this.registerArtifactIfAbsent({
      artifactId: specArtifactId(fixture),
      artifactType: "building-family-spec",
      requestHash,
      contentHash: fixture.spec.sourceIntentHash,
      artifact: fixture.spec
    });
    this.registerArtifactIfAbsent({
      artifactId: atlasManifestArtifactId(fixture),
      artifactType: "atlas-manifest",
      requestHash,
      contentHash: fixture.packedAtlas.manifest.atlasId,
      artifact: fixture.packedAtlas.manifest
    });
    this.registerArtifactIfAbsent({
      artifactId: materialSourcesArtifactId(fixture),
      artifactType: "material-source",
      requestHash,
      contentHash: fixture.packedAtlas.contentHash,
      artifact: fixture.packedAtlas.slotProvenance
    });
    this.registerArtifactIfAbsent({
      artifactId: packedAtlasArtifactId(fixture),
      artifactType: "atlas-channel",
      requestHash,
      contentHash: fixture.packedAtlas.contentHash,
      artifact: fixture.packedAtlas
    });
    this.registerArtifactIfAbsent({
      artifactId: componentCatalogArtifactId(fixture),
      artifactType: "component-catalog",
      requestHash,
      contentHash: fixture.catalog.catalogId,
      artifact: fixture.catalog
    });
    this.registerArtifactIfAbsent({
      artifactId: buildingGraphArtifactId(fixture),
      artifactType: "building-graph",
      requestHash,
      contentHash: fixture.ir.sourceGraphHash,
      artifact: fixture.graph
    });
    this.registerArtifactIfAbsent({
      artifactId: runtimeIrArtifactId(fixture),
      artifactType: "runtime-building-ir",
      requestHash,
      contentHash: fixture.ir.sourceGraphHash,
      artifact: fixture.ir
    });
  }

  private registerArtifactIfAbsent(input: Parameters<BuildingArtifactRegistry["register"]>[0]): void {
    const metadata = this.registry.getMetadata(input.artifactId) ?? this.registry.register(input);
    this.store.getState().registerArtifact(metadata);
  }
}

function clonePrompt(prompt: BuildingPromptControls): BuildingPromptControls {
  return {
    ...prompt,
    seeds: {
      ...prompt.seeds
    }
  };
}

function specArtifactId(fixture: AssemblyHallFixture): string {
  return `building-family-spec:${fixture.spec.familyId}:${fixture.spec.sourceIntentHash}`;
}

function atlasManifestArtifactId(fixture: AssemblyHallFixture): string {
  return `atlas-manifest:${fixture.packedAtlas.manifest.atlasId}`;
}

function materialSourcesArtifactId(fixture: AssemblyHallFixture): string {
  return `material-sources:${fixture.packedAtlas.atlasId}:${fixture.packedAtlas.contentHash}`;
}

function packedAtlasArtifactId(fixture: AssemblyHallFixture): string {
  return `packed-atlas:${fixture.packedAtlas.atlasId}:${fixture.packedAtlas.contentHash}`;
}

function componentCatalogArtifactId(fixture: AssemblyHallFixture): string {
  return `component-catalog:${fixture.catalog.catalogId}`;
}

function buildingGraphArtifactId(fixture: AssemblyHallFixture): string {
  return `building-graph:${fixture.graph.graphId}`;
}

function runtimeIrArtifactId(fixture: AssemblyHallFixture): string {
  return `runtime-building-ir:${fixture.ir.buildingId}:${fixture.ir.sourceGraphHash}`;
}

function gpuSceneArtifactId(fixture: AssemblyHallFixture): string {
  return `gpu-scene:${fixture.ir.buildingId}:${fixture.packedAtlas.contentHash}`;
}

function remoteMaterialProviderLabel(result: RemoteMaterialRouteResult): string {
  return result.status === "rejected" ? "remote-material-route" : result.providerId;
}

function remoteMaterialCacheHit(result: RemoteMaterialRouteResult): boolean | undefined {
  if (result.status !== "generated") {
    return undefined;
  }

  return result.cacheStatus === "hit";
}
