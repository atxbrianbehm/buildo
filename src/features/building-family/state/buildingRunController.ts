import type { GenerationStage } from "../contracts/generationRun";
import { hashCanonicalJson } from "../core/contentHash";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";
import type { BuildingArtifactRegistry } from "./artifactRegistry";
import { defaultBuildingPromptControls, type BuildingPromptControls, type BuildingStoreApi } from "./buildingStore";

export interface BuildingRunControllerOptions {
  store: BuildingStoreApi;
  registry: BuildingArtifactRegistry;
  createFixture?: (input: { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  createRunId?: () => string;
  nowMs?: () => number;
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
  private readonly createFixture: (input: { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  private readonly createRunId: () => string;
  private readonly nowMs: () => number;
  private activeRun: ActiveRun | undefined;

  constructor(options: BuildingRunControllerOptions) {
    this.store = options.store;
    this.registry = options.registry;
    this.createFixture = options.createFixture ?? createAssemblyHallFixture;
    this.createRunId = options.createRunId ?? defaultRunId;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  async startDemoRun(prompt: BuildingPromptControls = defaultBuildingPromptControls): Promise<StartDemoRunResult> {
    this.cancelActiveRun();

    const runId = this.createRunId();
    const abortController = new AbortController();
    this.activeRun = { runId, abortController };
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

    for (const stage of demoStageSequence) {
      this.appendInstantEvent(runId, stage);
    }

    try {
      const fixturePromise = this.createFixture({ runId, signal: abortController.signal });
      const [requestHash, fixture] = await Promise.all([requestHashPromise, fixturePromise]);
      if (abortController.signal.aborted || this.activeRun?.runId !== runId) {
        disposeFixture(fixture);
        return { runId, stale: true };
      }

      const artifactId = artifactIdForFixture(fixture);
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

  private appendInstantEvent(runId: string, stage: GenerationStage): void {
    const startedAtMs = this.nowMs();
    this.store.getState().appendRunEvent(runId, {
      stage,
      startedAtMs,
      endedAtMs: this.nowMs()
    });
  }
}
