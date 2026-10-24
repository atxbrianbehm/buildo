import type { GenerationRunEvent, GenerationStage } from "../contracts/generationRun";
import { hashCanonicalJson } from "../core/contentHash";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import { createBuildingSurfaceSourceFile } from "./buildingSurfaceSourceFile";
import { restoreBuildingSurfaceSourceFile } from "./buildingSurfaceSourceRestore";
import { prepareBuildingSurfaceRuntime } from "../renderer-three/surfaceMaterialRuntime";
import { captureBuildingSourceSnapshot, createBuildingSourceFile, deriveBuildingSourceBayEdit, deriveBuildingSourceFloorEdit, deriveBuildingSourceRoofEdit, deriveBuildingSourceWindowEdit, deriveBuildingSourceWindowWidthEdit, deriveBuildingSourceWindowWidthBatchEdit, parseBuildingSourceFile, withBuildingSourceRevision, type BuildingSourceSnapshot } from "./buildingSourceFile";
import { BuildingWindowWidthOverrideSchema, BuildingWindowFloorWidthOverrideSchema, BuildingWindowBayWidthOverrideSchema, findBuildingDocumentJsonIssue, type BuildingWindowWidthOverride, type BuildingWindowFloorWidthOverride, type BuildingWindowBayWidthOverride } from "../contracts/buildingDocument";
import { applyWindowWidthOverride as applySplitWindowWidthOverride, applyWindowFloorWidthOverride as applySplitWindowFloorWidthOverride, applyWindowBayWidthOverride as applySplitWindowBayWidthOverride, BuildingWindowWidthOverrideError, resolveWindowOpeningFromSlotAddress } from "../compiler/facadeSplitPlan";
import { canonicalJson } from "../core/canonicalJson";
import { computeBuildingInvalidation, type BuildingInvalidation } from "../core/invalidation";
import { parseCachedArtifactEntry, type CachedArtifactEntry } from "../materials/artifactCache";
import {
  createAssemblyHallFixture,
  buildAssemblyHallSourceWindowSplit,
  type AssemblyHallFixture,
  type CreateAssemblyHallFixtureInput,
  type ReusableAssemblyHallArtifacts
} from "../ui/assemblyHallFixture";
import type { BuildingArtifactRegistry, PreparedBuildingArtifactOwner, RegisterBuildingArtifactInput } from "./artifactRegistry";
import { defaultBuildingPromptControls, type BuildingPromptControls, type BuildingStoreApi } from "./buildingStore";
import {
  requestRemoteMaterialImages,
  type RemoteMaterialRouteResult
} from "./remoteMaterialRouteClient";
import {
  COMPLETED_FAMILY_ARTIFACT_TYPE,
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket as defaultCreateCompletedFamilyPersistencePacket,
  parseCompletedFamilyPersistencePacket,
  type CompletedFamilyPersistenceCacheEntry,
  type CompletedFamilyPersistencePacket,
  type CreateCompletedFamilyPersistencePacketInput
} from "./completedFamilyPersistence";
import {
  BuildingSourceCheckpointError,
  createBuildingSourceCheckpoint,
  parseBuildingSourceCheckpoint,
  type BuildingSourceCheckpoint
} from "./buildingSourceCheckpoint";

export interface CompletedFamilyPersistenceWriter {
  put(entry: CompletedFamilyPersistenceCacheEntry): Promise<void>;
}

export interface CompletedFamilyPersistenceStore extends CompletedFamilyPersistenceWriter {
  list?(): Promise<Array<CachedArtifactEntry<unknown>>>;
  get?<T>(artifactType: string, requestHash: string, schemaVersion?: CachedArtifactEntry["schemaVersion"]): Promise<CachedArtifactEntry<T> | undefined>;
}

export class BuildingSourceCheckpointRecoveryError extends Error {
  readonly code = "building.sourceCheckpointRecoveryFailed";

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BuildingSourceCheckpointRecoveryError";
  }
}

/** A retained reference to an already-held exclusive document writer. */
export interface ExclusiveBuildingSourceCheckpointWriter {
  readonly exclusive: true;
  readonly documentId: string;
  put(record: BuildingSourceCheckpoint): Promise<void>;
  release(): void;
}

export interface BuildingSourceCheckpointStatus {
  readonly documentId: string;
  readonly publication: number;
  readonly runId: string;
  readonly kind: "source" | "source-unavailable";
  readonly sourceContentHash?: string;
  readonly revision?: number;
  readonly state: "pending" | "saved" | "failed";
  readonly checkpointContentHash?: string;
  readonly error?: BuildingSourceCheckpointError;
}

export interface BuildingRunControllerOptions {
  store: BuildingStoreApi;
  registry: BuildingArtifactRegistry;
  createFixture?: (input: CreateAssemblyHallFixtureInput & { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  createCompletedFamilyPersistencePacket?: (
    input: CreateCompletedFamilyPersistencePacketInput
  ) => Promise<CompletedFamilyPersistencePacket>;
  createRunId?: () => string;
  completedFamilyPersistence?: CompletedFamilyPersistenceStore;
  nowMs?: () => number;
  remoteMaterial?: CreateAssemblyHallFixtureInput["remoteMaterial"];
  restoreCompletedFamilyFixture?: (packet: CompletedFamilyPersistencePacket) => Promise<AssemblyHallFixture>;
  /** Synchronously retain an existing lease; do not acquire locks or change store/controller state here. */
  retainSourceCheckpointWriter?: (documentId: string) => ExclusiveBuildingSourceCheckpointWriter | undefined;
  onSourceCheckpointStatus?: (status: BuildingSourceCheckpointStatus) => void;
}

export interface PreparedBuildingFixtureView {
  commit(): () => void;
  discard(): void;
}

export type BuildingFixtureViewerPreparer = (
  fixture: AssemblyHallFixture, context: { signal: AbortSignal }
) => Promise<PreparedBuildingFixtureView>;

interface RegisteredFixtureViewer { prepare: BuildingFixtureViewerPreparer }

export interface StartDemoRunResult {
  runId: string;
  artifactId?: string;
  fixture?: AssemblyHallFixture;
  stale: boolean;
}

export interface BuildingWindowWidthHistoryRequest {
  expectedSourceContentHash: string;
  expectedRevision: number;
}

export interface BuildingWindowWidthHistoryState {
  readonly undoCount: number;
  readonly redoCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface WindowWidthHistoryEntry {
  before: BuildingWindowWidthOverride[];
  after: BuildingWindowWidthOverride[];
}

interface WindowWidthHistory {
  documentId: string;
  sourceContentHash: string;
  revision: number;
  runId: string;
  entries: readonly WindowWidthHistoryEntry[];
  cursor: number;
}

interface WindowWidthHistoryCommit {
  kind: "new" | "undo" | "redo";
  history: WindowWidthHistory | undefined;
  before: BuildingWindowWidthOverride[];
  after: BuildingWindowWidthOverride[];
}

interface ActiveRun {
  abortController: AbortController;
  runId: string;
  documentId: string;
  started: boolean;
  draftAtStart: BuildingPromptControls;
  checkpointRecovery?: true;
}

interface PublishedSourceBaseline {
  fixture: AssemblyHallFixture;
  reference: BuildingSourceSnapshot;
  source: BuildingSourceSnapshot;
}

interface AcceptedSourceGuard {
  fixture: AssemblyHallFixture;
  owner: PreparedBuildingArtifactOwner;
  baseline: PublishedSourceBaseline;
  sourceReference: BuildingSourceSnapshot;
  source: BuildingSourceSnapshot;
  runId: string;
  documentEpoch: number;
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
  return `assembly-hall-fixture:${fixture.ir.buildingId}:${fixture.ir.sourceGraphHash}:${fixture.packedAtlas.contentHash}`;
}

export class BuildingRunController {
  private readonly store: BuildingStoreApi;
  private readonly registry: BuildingArtifactRegistry;
  private readonly createFixture: (input: CreateAssemblyHallFixtureInput & { runId: string; signal: AbortSignal }) => Promise<AssemblyHallFixture>;
  private readonly createCompletedFamilyPersistencePacket: (
    input: CreateCompletedFamilyPersistencePacketInput
  ) => Promise<CompletedFamilyPersistencePacket>;
  private readonly createRunId: () => string;
  private readonly completedFamilyPersistence: CompletedFamilyPersistenceStore | undefined;
  private readonly nowMs: () => number;
  private readonly remoteMaterial: CreateAssemblyHallFixtureInput["remoteMaterial"];
  private readonly restoreCompletedFamilyFixture:
    | ((packet: CompletedFamilyPersistencePacket) => Promise<AssemblyHallFixture>)
    | undefined;
  private activeRun: ActiveRun | undefined;
  private operationEpoch = 0;
  private windowWidthPreflightTicket = 0;
  private windowWidthDocumentEpoch = 0;
  private windowWidthHistory: WindowWidthHistory | undefined;
  private readonly unsubscribeWindowWidthHistory: () => void;
  private lastCompletedFixture: AssemblyHallFixture | undefined;
  private lastCompletedRunId: string | undefined;
  private publishedSource: PublishedSourceBaseline | undefined;
  private lastCompletedPrompt: BuildingPromptControls | undefined;
  private currentFixtureOwner: PreparedBuildingArtifactOwner | undefined;
  private fixtureViewer: RegisteredFixtureViewer | undefined;
  private readonly fixtureViewerWaiters = new Set<() => void>();
  private readonly fixtureOwners = new WeakMap<AssemblyHallFixture, PreparedBuildingArtifactOwner>();
  private readonly disposedFixtures = new WeakSet<AssemblyHallFixture>();
  private readonly surfaceSources = new WeakMap<AssemblyHallFixture, {
    readonly composition: BuildingSurfaceComposition;
    dispose(): void;
  }>();
  private restoredReceipt: {
    owner: PreparedBuildingArtifactOwner; requestHash: string;
    packedAtlas: AssemblyHallFixture["packedAtlas"]; debugExport: AssemblyHallFixture["debugExport"]; catalog: AssemblyHallFixture["catalog"];
    atlasId: string; atlasContentHash: string; catalogId: string;
  } | undefined;
  private readonly retainSourceCheckpointWriter: BuildingRunControllerOptions["retainSourceCheckpointWriter"];
  private readonly onSourceCheckpointStatus: BuildingRunControllerOptions["onSourceCheckpointStatus"];
  private readonly sourceCheckpointStatuses = new Map<string, BuildingSourceCheckpointStatus>();
  private sourceCheckpointPublication = 0;
  private sourceCheckpointTail: Promise<void> = Promise.resolve();
  private sourceCheckpointDisposed = false;

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
    this.restoreCompletedFamilyFixture = options.restoreCompletedFamilyFixture;
    this.retainSourceCheckpointWriter = options.retainSourceCheckpointWriter;
    this.onSourceCheckpointStatus = options.onSourceCheckpointStatus;
    let documentId = this.store.getState().selection.documentId;
    this.unsubscribeWindowWidthHistory = this.store.subscribe((state) => {
      if (state.selection.documentId === documentId) return;
      documentId = state.selection.documentId;
      this.windowWidthDocumentEpoch += 1;
      this.windowWidthPreflightTicket += 1;
      this.windowWidthHistory = undefined;
    });
  }

  getSourceCheckpointStatus(documentId: string): BuildingSourceCheckpointStatus | undefined {
    const status = this.sourceCheckpointStatuses.get(documentId);
    return status ? Object.freeze({ ...status }) : undefined;
  }

  /** Wait for publications accepted before this call; failures are reported through status. */
  drainSourceCheckpoints(): Promise<void> {
    return this.sourceCheckpointTail;
  }

  async startDemoRun(inputPrompt: BuildingPromptControls = defaultBuildingPromptControls): Promise<StartDemoRunResult> {
    const prompt = clonePrompt(inputPrompt);
    const operation = this.beginOperation(this.createRunId());
    this.beginStoreRun(operation);
    let requestHashPromise = buildingRequestHash(prompt);
    void requestHashPromise.catch(() => undefined);
    try {
      const invalidation = this.lastCompletedPrompt ? computeBuildingInvalidation(this.lastCompletedPrompt, prompt) : computeBuildingInvalidation(prompt, prompt);
      const acceptedSource = this.lastCompletedFixture?.sourceSnapshot;
      const committedControls = this.store.getState().controls;
      let reusableSource: BuildingSourceSnapshot | undefined;
      let sourceEdit: "window" | "floor" | "bay" | "roof" | undefined;
      let unsupportedSourceEdit = false;
      if (acceptedSource && acceptedSource.document.documentId === operation.documentId) {
        const acceptedControls = canonicalJson(acceptedSource.controlsView);
        if (this.lastCompletedPrompt && committedControls.baselineStatus === 'known' && committedControls.committedPrompt &&
            canonicalJson(this.lastCompletedPrompt) === acceptedControls &&
            canonicalJson(committedControls.committedPrompt) === acceptedControls) {
          if (canonicalJson({ ...prompt, windowFamily: acceptedSource.controlsView.windowFamily }) === acceptedControls) {
            reusableSource = acceptedSource;
            sourceEdit = "window";
          } else if (canonicalJson({ ...prompt, floorCount: acceptedSource.controlsView.floorCount }) === acceptedControls) {
            reusableSource = acceptedSource;
            sourceEdit = "floor";
          } else if (canonicalJson({ ...prompt, bayCount: acceptedSource.controlsView.bayCount }) === acceptedControls) {
            reusableSource = acceptedSource;
            sourceEdit = "bay";
          } else if (canonicalJson({ ...prompt, roofType: acceptedSource.controlsView.roofType }) === acceptedControls) {
            reusableSource = acceptedSource;
            sourceEdit = "roof";
          }
        }
        unsupportedSourceEdit = acceptedSource.schemaVersion !== "0.1.0" && reusableSource === undefined;
      }
      let expectedSourceSnapshot: BuildingSourceSnapshot | undefined;
      const create = (reusableArtifacts: ReusableAssemblyHallArtifacts) => {
        if (this.lastCompletedFixture && this.surfaceSources.has(this.lastCompletedFixture) &&
            acceptedSource?.document.documentId === operation.documentId && !reusableSource) {
          return Promise.reject(Object.assign(new Error("This surface source supports one roof, bay, floor or window-family edit at a time. Open another source document to replace its composition."), {
            code: "building.sourceEditUnsupported"
          }));
        }
        if (unsupportedSourceEdit) {
          return Promise.reject(Object.assign(new Error("This source supports one roof-type, bay-count, floor-count or window-family edit at a time; its accepted control baseline must remain available."), {
            code: "building.sourceEditUnsupported"
          }));
        }
        const remoteMaterial = reusableArtifacts.packedAtlas || !prompt.remoteMaterialEnabled ? undefined : this.remoteMaterialForRun(operation);
        const createCandidate = (sourceSnapshot?: BuildingSourceSnapshot) => {
          expectedSourceSnapshot = sourceSnapshot;
          if (sourceSnapshot) {
            requestHashPromise = buildingRequestHash(prompt, sourceSnapshot);
            void requestHashPromise.catch(() => undefined);
          }
          return this.createFixture({
            runId: operation.runId, signal: operation.abortController.signal, promptControls: clonePrompt(prompt),
            sourceIdentity: { documentId: operation.documentId, revision: 0 }, reusableArtifacts,
            ...(sourceSnapshot ? { sourceSnapshot } : {}), ...(remoteMaterial ? { remoteMaterial } : {})
          });
        };
        if (reusableSource && ((sourceEdit === "window" && prompt.windowFamily !== reusableSource.controlsView.windowFamily) ||
            (sourceEdit === "floor" && prompt.floorCount !== reusableSource.controlsView.floorCount) ||
            (sourceEdit === "bay" && prompt.bayCount !== reusableSource.controlsView.bayCount) ||
            (sourceEdit === "roof" && prompt.roofType !== reusableSource.controlsView.roofType))) {
          const derived = sourceEdit === "roof"
            ? deriveBuildingSourceRoofEdit({ sourceSnapshot: reusableSource, roofType: prompt.roofType })
            : sourceEdit === "bay"
              ? deriveBuildingSourceBayEdit({ sourceSnapshot: reusableSource, bayCount: prompt.bayCount })
            : sourceEdit === "floor"
              ? deriveBuildingSourceFloorEdit({ sourceSnapshot: reusableSource, floorCount: prompt.floorCount })
              : deriveBuildingSourceWindowEdit({ sourceSnapshot: reusableSource, windowFamily: prompt.windowFamily });
          return derived.then((sourceSnapshot) => {
            if (!this.isCurrent(operation)) throw Object.assign(new Error('Building source edit was superseded.'), { name: 'AbortError' });
            return createCandidate(sourceSnapshot);
          });
        }
        return createCandidate(reusableSource);
      };
      if (this.lastCompletedFixture && !this.lastCompletedPrompt) {
        const requestHash = await requestHashPromise;
        if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
        const reusableArtifacts = this.reusableArtifactsFor(invalidation, requestHash);
        const fixture = await create(reusableArtifacts);
        return await this.activateFixture({ operation, fixture, requestHash, prompt, invalidation, reusableArtifacts, expectedSourceSnapshot });
      }
      const reusableArtifacts = this.reusableArtifactsFor(invalidation, "");
      const fixture = await create(reusableArtifacts);
      let requestHash: string;
      try { requestHash = await requestHashPromise; }
      catch (error) { this.disposeFixtureOnce(fixture); throw error; }
      return await this.activateFixture({ operation, fixture, requestHash, prompt, invalidation, reusableArtifacts, expectedSourceSnapshot });
    } catch (error) { return this.failOperation(operation, error, "Building run failed"); }
  }

  async applyWindowWidthOverride(input: {
    expectedSourceContentHash: string; expectedRevision: number; directive: unknown;
  }): Promise<StartDemoRunResult> {
    // Validate the entire envelope before reading or cloning caller-controlled fields.
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw sourceEditConflict("The local edit must identify the accepted source and revision.");
    }
    const issue = findBuildingDocumentJsonIssue(input);
    if (issue?.path[0] === "directive") throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The local window width directive is invalid.");
    if (issue || Object.keys(input).sort().join(",") !== "directive,expectedRevision,expectedSourceContentHash" ||
        typeof input.expectedSourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSourceContentHash) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw sourceEditConflict("The local edit must identify the accepted source and revision.");
    }
    const request = structuredClone(input);
    const parsed = BuildingWindowWidthOverrideSchema.safeParse(request.directive);
    if (!parsed.success) throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The local window width directive is invalid.");
    return this.applyWindowWidthTransaction(request, { kind: "new", directive: parsed.data });
  }

  async applyWindowFloorWidthOverride(input: {
    expectedSourceContentHash: string; expectedRevision: number; directive: unknown;
  }): Promise<StartDemoRunResult> {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw sourceEditConflict("The floor edit must identify the accepted source and revision.");
    }
    const issue = findBuildingDocumentJsonIssue(input);
    if (issue?.path[0] === "directive") throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The facade-floor width directive is invalid.");
    if (issue || Object.keys(input).sort().join(",") !== "directive,expectedRevision,expectedSourceContentHash" ||
        typeof input.expectedSourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSourceContentHash) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw sourceEditConflict("The floor edit must identify the accepted source and revision.");
    }
    const request = structuredClone(input);
    const parsed = BuildingWindowFloorWidthOverrideSchema.safeParse(request.directive);
    if (!parsed.success) throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The facade-floor width directive is invalid.");
    return this.applyWindowWidthTransaction(request, { kind: "floor", directive: parsed.data });
  }

  async applyWindowBayWidthOverride(input: {
    expectedSourceContentHash: string; expectedRevision: number; directive: unknown;
  }): Promise<StartDemoRunResult> {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw sourceEditConflict("The bay edit must identify the accepted source and revision.");
    }
    const issue = findBuildingDocumentJsonIssue(input);
    if (issue?.path[0] === "directive") throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The facade-bay width directive is invalid.");
    if (issue || Object.keys(input).sort().join(",") !== "directive,expectedRevision,expectedSourceContentHash" ||
        typeof input.expectedSourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSourceContentHash) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw sourceEditConflict("The bay edit must identify the accepted source and revision.");
    }
    const request = structuredClone(input);
    const parsed = BuildingWindowBayWidthOverrideSchema.safeParse(request.directive);
    if (!parsed.success) throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "The facade-bay width directive is invalid.");
    return this.applyWindowWidthTransaction(request, { kind: "bay", directive: parsed.data });
  }

  getWindowWidthHistoryState(): BuildingWindowWidthHistoryState {
    const history = this.currentWindowWidthHistory();
    const undoCount = history?.cursor ?? 0;
    const redoCount = history ? history.entries.length - history.cursor : 0;
    return Object.freeze({ undoCount, redoCount, canUndo: undoCount > 0, canRedo: redoCount > 0 });
  }

  undoWindowWidthOverride(input: BuildingWindowWidthHistoryRequest): Promise<StartDemoRunResult> {
    return this.replayWindowWidthHistory(input, "undo");
  }

  redoWindowWidthOverride(input: BuildingWindowWidthHistoryRequest): Promise<StartDemoRunResult> {
    return this.replayWindowWidthHistory(input, "redo");
  }

  private async replayWindowWidthHistory(input: BuildingWindowWidthHistoryRequest, kind: "undo" | "redo"): Promise<StartDemoRunResult> {
    if (input === null || typeof input !== "object" || Array.isArray(input) || findBuildingDocumentJsonIssue(input) ||
        Object.keys(input).sort().join(",") !== "expectedRevision,expectedSourceContentHash" ||
        typeof input.expectedSourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSourceContentHash) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw sourceEditConflict("The width history command must identify the accepted source and revision.");
    }
    const request = structuredClone(input), history = this.currentWindowWidthHistory();
    const entry = history?.entries[kind === "undo" ? history.cursor - 1 : history.cursor];
    if (!history || !entry) throw sourceEditConflict("There is no accepted window width edit to " + kind + " for this document.");
    const target = structuredClone(kind === "undo" ? entry.before : entry.after);
    return this.applyWindowWidthTransaction(request, { kind, history, target });
  }

  private currentWindowWidthHistory(): WindowWidthHistory | undefined {
    const history = this.windowWidthHistory, fixture = this.lastCompletedFixture, owner = this.currentFixtureOwner, baseline = this.publishedSource;
    if (!history || this.sourceCheckpointDisposed || !fixture || !owner || !baseline || baseline.fixture !== fixture ||
        history.documentId !== this.store.getState().selection.documentId || history.sourceContentHash !== baseline.source.sourceContentHash ||
        history.revision !== baseline.source.document.revision || history.runId !== this.lastCompletedRunId ||
        this.registry.get(artifactIdForFixture(fixture)) !== fixture) return undefined;
    try {
      this.assertAcceptedSource({ fixture, owner, baseline, sourceReference: baseline.reference, source: baseline.source,
        runId: history.runId, documentEpoch: this.windowWidthDocumentEpoch });
      return history;
    } catch { return undefined; }
  }

  private publishWindowWidthHistory(change: WindowWidthHistoryCommit | undefined, source: BuildingSourceSnapshot | undefined, runId: string): void {
    if (!change || !source) { this.windowWidthHistory = undefined; return; }
    let entries: readonly WindowWidthHistoryEntry[], cursor: number;
    if (change.kind === "new") {
      entries = [...(change.history?.entries.slice(0, change.history.cursor) ?? []), { before: change.before, after: change.after }].slice(-32);
      cursor = entries.length;
    } else {
      entries = change.history!.entries;
      cursor = change.history!.cursor + (change.kind === "undo" ? -1 : 1);
    }
    this.windowWidthHistory = { documentId: source.document.documentId, sourceContentHash: source.sourceContentHash,
      revision: source.document.revision, runId, entries, cursor };
  }

  private async applyWindowWidthTransaction(request: BuildingWindowWidthHistoryRequest, command:
    { kind: "new"; directive: BuildingWindowWidthOverride } |
    { kind: "floor"; directive: BuildingWindowFloorWidthOverride } |
    { kind: "bay"; directive: BuildingWindowBayWidthOverride } |
    { kind: "undo" | "redo"; history: WindowWidthHistory; target: BuildingWindowWidthOverride[] }
  ): Promise<StartDemoRunResult> {
    const fixture = this.lastCompletedFixture;
    const owner = this.currentFixtureOwner;
    const baseline = this.publishedSource;
    if (!fixture || !owner || !baseline || baseline.fixture !== fixture || fixture.sourceSnapshot !== baseline.reference || !this.lastCompletedRunId ||
        baseline.source.sourceContentHash !== request.expectedSourceContentHash || baseline.source.document.revision !== request.expectedRevision) {
      throw sourceEditConflict("The local edit does not match the accepted source revision.");
    }
    const guard: AcceptedSourceGuard = {
      fixture, owner, baseline, sourceReference: baseline.reference, source: baseline.source, runId: this.lastCompletedRunId,
      documentEpoch: this.windowWidthDocumentEpoch
    };
    this.assertAcceptedSource(guard);
    if (this.registry.get(artifactIdForFixture(fixture)) !== fixture) throw sourceEditConflict("The accepted width source owner has been retired.");
    const ticket = ++this.windowWidthPreflightTicket;
    const unchanged = (): StartDemoRunResult => ({ runId: guard.runId, artifactId: artifactIdForFixture(fixture), fixture, stale: false });
    const batchSource = guard.source.schemaVersion === "0.5.0";
    const previous = guard.source.schemaVersion === "0.5.0" ? guard.source.windowWidthBatch.directives
      : guard.source.schemaVersion === "0.4.0" ? guard.source.windowWidthOverrides : [];
    const history = this.currentWindowWidthHistory();
    if ((command.kind === "undo" || command.kind === "redo") && history !== command.history) throw sourceEditConflict("The accepted width history changed before replay.");
    if (!batchSource && command.kind === "new" && canonicalJson(previous) === canonicalJson([command.directive])) return unchanged();
    const epoch = this.operationEpoch;
    const release = this.registry.acquireOwnerLease(owner);
    let operation: ActiveRun | undefined;
    const stale = (): StartDemoRunResult => ({ runId: operation?.runId ?? guard.runId, stale: true });
    try {
      const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: guard.source, catalog: fixture.catalog });
      if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
      this.assertAcceptedSource(guard);
      let windowWidthOverrides: BuildingWindowWidthOverride[];
      if (batchSource || command.kind === "floor" || command.kind === "bay") {
        if (command.kind === "floor") {
          const { facade, floorIndex } = command.directive;
          const floor = await applySplitWindowFloorWidthOverride(base, command.directive);
          if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
          this.assertAcceptedSource(guard);
          // P13 returns changes from the unedited base; replace this floor's authority and preserve every outside member.
          windowWidthOverrides = [
            ...previous.filter(directive => directive.address.facade !== facade ||
              directive.address.floorIndex !== floorIndex),
            ...floor.directives
          ];
        } else if (command.kind === "bay") {
          const { facade, bayIndex } = command.directive;
          const bay = await applySplitWindowBayWidthOverride(base, command.directive);
          if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
          this.assertAcceptedSource(guard);
          // P17 returns changes from the unedited base; preserve authority outside this facade/bay stack.
          windowWidthOverrides = [
            ...previous.filter(directive => directive.address.facade !== facade ||
              directive.address.bayIndex !== bayIndex),
            ...bay.directives
          ];
        } else if (command.kind === "new") {
          const address = canonicalJson(command.directive.address);
          const opening = resolveWindowOpeningFromSlotAddress(base, command.directive.address);
          windowWidthOverrides = previous.filter(directive => canonicalJson(directive.address) !== address);
          if (command.directive.widthM !== opening.sizeM[0]) windowWidthOverrides.push(command.directive);
        } else {
          windowWidthOverrides = structuredClone(command.target);
        }
        const validations = new Map<string, BuildingWindowWidthOverride>();
        for (const directive of windowWidthOverrides) validations.set(canonicalJson(directive.address), directive);
        for (const removed of previous) {
          const address = canonicalJson(removed.address);
          if (validations.has(address)) continue;
          const opening = resolveWindowOpeningFromSlotAddress(base, removed.address);
          validations.set(address, { ...removed, widthM: opening.sizeM[0] });
        }
        // An absent equal-base target is still validated, while replay retains explicit equal-base members.
        if (command.kind === "new") validations.set(canonicalJson(command.directive.address), command.directive);
        for (const directive of validations.values()) {
          await applySplitWindowWidthOverride(base, directive);
          if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
          this.assertAcceptedSource(guard);
        }
      } else {
        const target = command.kind === "new" ? command.directive : command.target[0];
        const removed = !target ? previous[0] : undefined;
        if (!target && !removed) return unchanged();
        const address = target?.address ?? removed!.address;
        const opening = resolveWindowOpeningFromSlotAddress(base, address);
        const directive = target ?? { ...removed!, widthM: opening.sizeM[0] };
        // Validate against the unedited aperture, allowing replacement of an earlier narrower width.
        await applySplitWindowWidthOverride(base, directive);
        if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
        this.assertAcceptedSource(guard);
        const sameAddress = previous[0] && canonicalJson(previous[0].address) === canonicalJson(directive.address);
        if (directive.widthM === opening.sizeM[0] && !sameAddress) return unchanged();
        windowWidthOverrides = directive.widthM === opening.sizeM[0] ? [] : [directive];
      }
      const sourceSnapshot = batchSource || command.kind === "floor" || command.kind === "bay"
        ? await deriveBuildingSourceWindowWidthBatchEdit({ sourceSnapshot: guard.source,
          windowWidthBatch: { schemaVersion: "0.1.0", directives: windowWidthOverrides } })
        : await deriveBuildingSourceWindowWidthEdit({ sourceSnapshot: guard.source, windowWidthOverrides });
      if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
      this.assertAcceptedSource(guard);
      if (sourceSnapshot.sourceContentHash === guard.source.sourceContentHash) return unchanged();
      const acceptedWidths = sourceSnapshot.schemaVersion === "0.5.0" ? sourceSnapshot.windowWidthBatch.directives : windowWidthOverrides;
      const historyCommit: WindowWidthHistoryCommit = { kind: command.kind === "floor" || command.kind === "bay" ? "new" : command.kind, history,
        before: structuredClone(previous), after: structuredClone(acceptedWidths) };
      operation = this.beginOperation(this.createRunId());
      this.beginStoreRun(operation);
      if (!this.isCurrent(operation)) return stale();
      this.assertAcceptedSource(guard);
      const prompt = clonePrompt(sourceSnapshot.controlsView);
      const reusableArtifacts = { packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport, catalog: fixture.catalog };
      const requestHashPromise = buildingRequestHash(prompt, sourceSnapshot);
      let fixturePromise: Promise<AssemblyHallFixture>;
      try {
        fixturePromise = this.createFixture({ runId: operation.runId, signal: operation.abortController.signal,
          sourceSnapshot, promptControls: clonePrompt(prompt), reusableArtifacts });
      } catch (error) { void requestHashPromise.catch(() => undefined); throw error; }
      const [hashed, created] = await Promise.allSettled([requestHashPromise, fixturePromise]);
      if (created.status === "rejected") throw created.reason;
      if (hashed.status === "rejected") { this.disposeFixtureOnce(created.value); throw hashed.reason; }
      return await this.activateFixture({ operation, fixture: created.value, requestHash: hashed.value, prompt,
        reusableArtifacts, expectedSourceSnapshot: sourceSnapshot, acceptedSourceGuard: guard, windowWidthHistoryCommit: historyCommit });
    } catch (error) {
      if (operation) return this.failOperation(operation, error, "Local window width edit failed");
      if (this.operationEpoch !== epoch || this.windowWidthPreflightTicket !== ticket) return stale();
      throw error;
    } finally { release(); }
  }

  private assertAcceptedSource(guard: AcceptedSourceGuard): void {
    const state = this.store.getState();
    if (this.lastCompletedFixture !== guard.fixture || this.currentFixtureOwner !== guard.owner ||
        this.windowWidthDocumentEpoch !== guard.documentEpoch ||
        this.publishedSource !== guard.baseline ||
        this.fixtureOwners.get(guard.fixture) !== guard.owner || guard.fixture.sourceSnapshot !== guard.sourceReference ||
        guard.sourceReference.sourceContentHash !== guard.source.sourceContentHash ||
        guard.sourceReference.document.revision !== guard.source.document.revision ||
        canonicalJson(guard.sourceReference) !== canonicalJson(guard.source) ||
        state.selection.documentId !== guard.source.document.documentId ||
        state.controls.baselineStatus !== "known" || !state.controls.committedPrompt || !this.lastCompletedPrompt ||
        canonicalJson(state.controls.committedPrompt) !== canonicalJson(guard.source.controlsView) ||
        canonicalJson(this.lastCompletedPrompt) !== canonicalJson(guard.source.controlsView)) {
      throw sourceEditConflict("The accepted source owner or control baseline changed before the local edit could be committed.");
    }
  }

  /** The legacy codec captures all spans now; composition is private immutable authority. */
  private captureFixtureSourceFile(fixture: AssemblyHallFixture, sourceSnapshot: BuildingSourceSnapshot) {
    const composition = this.surfaceSources.get(fixture)?.composition;
    const base = createBuildingSourceFile({ sourceSnapshot, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
    return base.then(async baseFile => composition ? await createBuildingSurfaceSourceFile({ baseFile, composition }) : baseFile);
  }

  async exportSourceFile(): Promise<{ fileName: string; contents: string; documentId: string; revision: number }> {
    const fixture = this.lastCompletedFixture;
    if (!fixture?.sourceSnapshot) throw Object.assign(new Error("Source unavailable for this completed artifact."), { code: "building.sourceUnavailable" });
    const sourceSnapshot = fixture.sourceSnapshot;
    const release = this.acquireFixtureViewerLease(fixture);
    try {
      const file = await this.captureFixtureSourceFile(fixture, sourceSnapshot);
      const { documentId, revision } = sourceSnapshot.document;
      return { fileName: documentId.replace(/[^a-zA-Z0-9._-]/g, "-") + "-building-source.json", contents: JSON.stringify(file, null, 2), documentId, revision };
    } finally { release(); }
  }

  async openSourceFile(input: { readText: () => Promise<string> }): Promise<StartDemoRunResult> {
    const readText = input.readText;
    const operation = this.beginOperation(this.createRunId());
    this.beginStoreRun(operation);
    try {
      const serialized = await readText();
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      let decoded: unknown;
      try { decoded = JSON.parse(serialized) as unknown; }
      catch { throw Object.assign(new Error("Invalid building source JSON."), { code: "building.sourceFileInvalid" }); }
      if (decoded && typeof decoded === "object" && "schemaVersion" in decoded && decoded.schemaVersion === "0.6.0") {
        const restored = await restoreBuildingSurfaceSourceFile(decoded, { signal: operation.abortController.signal });
        const fixture = restored.fixture;
        this.surfaceSources.set(fixture, { composition: restored.file.composition, dispose: restored.dispose });
        if (!this.isCurrent(operation)) { this.disposeFixtureOnce(fixture); return { runId: operation.runId, stale: true }; }
        const sourceSnapshot = fixture.sourceSnapshot!;
        const prompt = clonePrompt(sourceSnapshot.controlsView);
        let requestHash: string;
        try { requestHash = await buildingRequestHash(prompt, sourceSnapshot); }
        catch (error) { this.disposeFixtureOnce(fixture); throw error; }
        return await this.activateFixture({ operation, fixture, requestHash, prompt,
          reusableArtifacts: { packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport },
          targetDocumentId: sourceSnapshot.document.documentId, expectedSourceSnapshot: sourceSnapshot });
      }
      const parsed = await parseBuildingSourceFile(decoded);
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      const prompt = clonePrompt(parsed.sourceSnapshot.controlsView);
      const reusableArtifacts = { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport };
      const requestHashPromise = buildingRequestHash(prompt, parsed.sourceSnapshot);
      let fixturePromise: Promise<AssemblyHallFixture>;
      try {
        fixturePromise = this.createFixture({ runId: operation.runId, signal: operation.abortController.signal, sourceSnapshot: parsed.sourceSnapshot, promptControls: clonePrompt(prompt), reusableArtifacts });
      } catch (error) { void requestHashPromise.catch(() => undefined); throw error; }
      const [hashed, created] = await Promise.allSettled([requestHashPromise, fixturePromise]);
      if (created.status === "rejected") throw created.reason;
      if (hashed.status === "rejected") { this.disposeFixtureOnce(created.value); throw hashed.reason; }
      return await this.activateFixture({ operation, fixture: created.value, requestHash: hashed.value, prompt, reusableArtifacts, targetDocumentId: parsed.sourceSnapshot.document.documentId, expectedSourceSnapshot: parsed.sourceSnapshot });
    } catch (error) { return this.failOperation(operation, error, "Building source open failed"); }
  }

  async restoreLatestCompletedFamily(documentId: string = this.store.getState().selection.documentId): Promise<StartDemoRunResult | undefined> {
    if (!this.restoreCompletedFamilyFixture) return undefined;
    const operation = this.beginOperation(this.createRunId(), documentId);
    try {
      const selected = await this.latestCompletedFamilyEntryForDocument(documentId);
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      const entry = selected ? structuredClone(selected) : undefined;
      if (!entry) { this.activeRun = undefined; return undefined; }
      if (entry.requestHash !== entry.artifact.requestHash || entry.contentHash !== entry.artifact.contentHash) throw new Error("Completed-family cache metadata does not match its packet.");
      operation.runId = entry.artifact.runId;
      this.beginStoreRun(operation);
      return await this.restoreForOperation(operation, entry.artifact, false);
    } catch (error) { return this.failOperation(operation, error, "Completed family restore failed"); }
  }

  async restoreCompletedFamilyPacket(inputPacket: CompletedFamilyPersistencePacket): Promise<StartDemoRunResult> {
    if (!this.restoreCompletedFamilyFixture) throw new Error("Completed family restore adapter is not configured.");
    // Own metadata and typed views before adapters, store callbacks or awaits.
    const packet = structuredClone(inputPacket);
    const operation = this.beginOperation(packet.runId);
    this.beginStoreRun(operation);
    try { return await this.restoreForOperation(operation, packet, true); }
    catch (error) { return this.failOperation(operation, error, "Completed family import failed"); }
  }

  async restoreSourceUnavailableCheckpoint(input: unknown): Promise<StartDemoRunResult> {
    // P8 owns the complete marker synchronously. Observe both outcomes before
    // reserving an operation, whose cancellation callbacks may run caller code.
    const captured = parseBuildingSourceCheckpoint(input).then(
      record => ({ ok: true as const, record }),
      cause => ({ ok: false as const, cause })
    );
    let operation: ActiveRun | undefined;
    try {
      if (this.sourceCheckpointDisposed) throw new Error("The checkpoint recovery controller is disposed.");
      operation = this.beginOperation(this.createRunId());
      operation.checkpointRecovery = true;
      const capture = await captured;
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      if (!capture.ok) throw capture.cause;
      const checkpoint = capture.record;
      if (checkpoint.kind !== "source-unavailable" || checkpoint.documentId !== operation.documentId) {
        throw new Error("The completed-view checkpoint does not match the selected document.");
      }
      const persistence = this.completedFamilyPersistence;
      const get = persistence?.get;
      if (typeof get !== "function" || !this.restoreCompletedFamilyFixture) {
        throw new Error("Exact completed-view checkpoint recovery is unavailable.");
      }
      const ref = checkpoint.completedFamilyRef;
      const stored = await get.call(persistence, COMPLETED_FAMILY_ARTIFACT_TYPE, ref.requestHash, "0.1.0");
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      if (stored === undefined) throw new Error("The checkpoint's exact completed view is missing.");
      const entry = structuredClone(parseCachedArtifactEntry(stored));
      const packet = parseCompletedFamilyPersistencePacket(entry.artifact);
      if (entry.artifactType !== COMPLETED_FAMILY_ARTIFACT_TYPE ||
          entry.requestHash !== ref.requestHash || entry.contentHash !== ref.contentHash ||
          canonicalJson(entry.dependencies) !== canonicalJson(completedFamilyPersistenceCacheEntry(packet).dependencies) ||
          packet.documentId !== checkpoint.documentId || packet.runId !== ref.runId ||
          packet.createdAt !== ref.createdAt || packet.requestHash !== ref.requestHash || packet.contentHash !== ref.contentHash) {
        throw new Error("The checkpoint's completed-view identity could not be verified.");
      }
      operation.runId = packet.runId;
      this.beginStoreRun(operation);
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      return await this.restoreForOperation(operation, packet, false);
    } catch (cause) {
      const error = cause instanceof BuildingSourceCheckpointRecoveryError ? cause : new BuildingSourceCheckpointRecoveryError(
        "This saved completed view could not be restored. Its checkpoint and cached copy have been retained.", cause
      );
      if (operation) return this.failOperation(operation, error, error.message);
      throw error;
    }
  }

  private async restoreForOperation(operation: ActiveRun, packet: CompletedFamilyPersistencePacket, persistPacket: boolean): Promise<StartDemoRunResult> {
    const fixture = await this.restoreCompletedFamilyFixture!(packet);
    return this.activateFixture({ operation, fixture, requestHash: packet.requestHash, packet, persistPacket });
  }

  acquireFixtureViewerLease(fixture: AssemblyHallFixture): () => void {
    const owner = this.fixtureOwners.get(fixture);
    if (!owner) throw new Error("Fixture is not owned by this controller.");
    return this.registry.acquireOwnerLease(owner);
  }

  registerFixtureViewer(prepare: BuildingFixtureViewerPreparer): () => void {
    const provider = { prepare };
    this.fixtureViewer = provider;
    this.notifyFixtureViewerChanged();
    let unregistered = false;
    return () => {
      if (unregistered) return;
      unregistered = true;
      if (this.fixtureViewer !== provider) return;
      this.fixtureViewer = undefined;
      this.notifyFixtureViewerChanged();
    };
  }

  private notifyFixtureViewerChanged(): void {
    for (const wake of Array.from(this.fixtureViewerWaiters)) wake();
  }

  private discardFixtureView(view: PreparedBuildingFixtureView | undefined): void {
    try { view?.discard(); } catch { /* Candidate cleanup cannot replace another active view. */ }
  }

  private async prepareFixtureViewer(operation: ActiveRun, fixture: AssemblyHallFixture): Promise<{
    provider?: RegisteredFixtureViewer; view?: PreparedBuildingFixtureView; cancel?: () => void;
  }> {
    while (this.isCurrent(operation)) {
      const provider = this.fixtureViewer;
      if (!provider) return {};
      const abort = new AbortController();
      let wake!: () => void;
      const changed = new Promise<void>((resolve) => { wake = () => { abort.abort(); resolve(); }; });
      this.fixtureViewerWaiters.add(wake);
      operation.abortController.signal.addEventListener("abort", wake, { once: true });
      const unwatch = () => {
        this.fixtureViewerWaiters.delete(wake);
        operation.abortController.signal.removeEventListener("abort", wake);
      };
      let work: Promise<PreparedBuildingFixtureView>;
      try { work = Promise.resolve(provider.prepare(fixture, { signal: abort.signal })); }
      catch (error) {
        unwatch(); abort.abort();
        if (!this.isCurrent(operation)) return {};
        if (provider !== this.fixtureViewer) continue;
        throw error;
      }
      const outcome = await Promise.race([
        work.then((view) => ({ kind: "view" as const, view }), (error: unknown) => ({ kind: "error" as const, error })),
        changed.then(() => ({ kind: "changed" as const }))
      ]);
      unwatch();
      if (outcome.kind === "changed" || !this.isCurrent(operation) || provider !== this.fixtureViewer) {
        abort.abort();
        if (outcome.kind === "view") this.discardFixtureView(outcome.view);
        else void work.then((view) => this.discardFixtureView(view), () => undefined);
        if (!this.isCurrent(operation)) return {};
        continue;
      }
      if (outcome.kind === "error") { abort.abort(); throw outcome.error; }
      return { provider, view: outcome.view, cancel: () => abort.abort() };
    }
    return {};
  }

  private beginOperation(runId: string, documentId = this.store.getState().selection.documentId): ActiveRun {
    this.cancelActiveRun();
    const operation: ActiveRun = { runId, documentId, abortController: new AbortController(), started: false, draftAtStart: clonePrompt(this.store.getState().prompt) };
    this.activeRun = operation;
    return operation;
  }

  private beginStoreRun(operation: ActiveRun): void {
    operation.started = true;
    this.store.getState().beginRun({ runId: operation.runId, event: { stage: "resolvingPrompt", startedAtMs: this.nowMs() } });
  }

  private isCurrent(operation: ActiveRun): boolean {
    return this.activeRun === operation && !operation.abortController.signal.aborted &&
      (!operation.checkpointRecovery || this.store.getState().selection.documentId === operation.documentId);
  }

  private failOperation(operation: ActiveRun, error: unknown, fallback: string): StartDemoRunResult {
    if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
    this.activeRun = undefined;
    if (operation.started) {
      const message = error instanceof Error ? error.message : fallback;
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
      this.store.getState().failRun({ runId: operation.runId, message, event: { stage: "failed", startedAtMs: this.nowMs(), endedAtMs: this.nowMs(), error: { message, ...(code ? { code } : {}) } } });
    }
    throw error;
  }

  private updateSourceCheckpointStatus(status: BuildingSourceCheckpointStatus): void {
    const previous = this.sourceCheckpointStatuses.get(status.documentId);
    if (previous && previous.publication > status.publication) return;
    const owned = Object.freeze({ ...status });
    this.sourceCheckpointStatuses.set(owned.documentId, owned);
    const notify = this.onSourceCheckpointStatus;
    if (!notify || this.sourceCheckpointDisposed) return;
    // No caller notification can reenter the store's publication callback.
    queueMicrotask(() => {
      if (this.sourceCheckpointDisposed ||
          this.sourceCheckpointStatuses.get(owned.documentId)?.publication !== owned.publication) return;
      try { notify(Object.freeze({ ...owned })); } catch { /* Status observers cannot change an accepted publication. */ }
    });
  }

  private scheduleSourceCheckpoint(input: {
    owner: PreparedBuildingArtifactOwner;
    fixture: AssemblyHallFixture;
    source?: BuildingSourceSnapshot;
    documentId: string;
    runId: string;
    packet?: CompletedFamilyPersistencePacket;
    explicitImport: boolean;
  }): void {
    const retain = this.retainSourceCheckpointWriter;
    if (!retain || this.sourceCheckpointDisposed || (input.packet && !input.explicitImport)) return;
    // An explicit completed import is unavailable-source authority even when an
    // injected replay adapter happens to attach a source snapshot.
    const source = input.packet && input.explicitImport ? undefined : input.source;
    const identity = {
      documentId: input.documentId,
      publication: ++this.sourceCheckpointPublication,
      runId: input.runId,
      kind: source ? "source" as const : "source-unavailable" as const,
      ...(source ? { sourceContentHash: source.sourceContentHash, revision: source.document.revision } : {})
    };
    type CaptureResult = { ok: true; payload: unknown } | { ok: false; cause: unknown };
    let settleCapture!: (result: CaptureResult) => void;
    const captured = new Promise<CaptureResult>((resolve) => { settleCapture = resolve; });
    let write: ((record: BuildingSourceCheckpoint) => Promise<void>) | undefined;
    let releaseWriter: (() => void) | undefined;
    let retentionFailure: { cause: unknown } | undefined;

    // Reserve order before capture or external retention. Captures may finish out of order.
    this.sourceCheckpointTail = this.sourceCheckpointTail.catch(() => undefined).then(async () => {
      try {
        const result = await captured;
        if (!result.ok) throw result.cause;
        if (retentionFailure) throw retentionFailure.cause;
        if (!write) throw new Error("An exclusive source checkpoint writer is unavailable for this document.");
        const record = await createBuildingSourceCheckpoint(result.payload);
        await write(record);
        this.updateSourceCheckpointStatus({ ...identity, state: "saved", checkpointContentHash: record.contentHash });
      } catch (cause) {
        this.updateSourceCheckpointStatus({
          ...identity,
          state: "failed",
          error: new BuildingSourceCheckpointError(
            "building.sourceCheckpointWriteFailed",
            "The current building is kept, but its source checkpoint could not be saved.",
            cause
          )
        });
      } finally {
        try { releaseWriter?.(); } catch { /* Lease cleanup cannot replace the capture or durable write result. */ }
      }
    });
    this.updateSourceCheckpointStatus({ ...identity, state: "pending" });

    let payload: Promise<unknown>;
    try {
      const createdAt = new Date().toISOString();
      if (source) {
        const releaseOwner = this.registry.acquireOwnerLease(input.owner);
        try {
          // The actual codec owns source, material metadata and all five raw spans
          // synchronously before returning its first-await promise.
          const file = this.captureFixtureSourceFile(input.fixture, source);
          payload = file.then((sourceFile) => ({
            schemaVersion: "0.1.0", kind: "source", documentId: input.documentId, createdAt, sourceFile
          }));
        } finally {
          try { releaseOwner(); } catch { /* Owned capture no longer needs the GPU fixture. */ }
        }
      } else {
        const packet = input.packet;
        if (!input.explicitImport || !packet || packet.documentId !== input.documentId) {
          throw new Error("The accepted building has no matching portable source or completed-import identity.");
        }
        payload = Promise.resolve({
          schemaVersion: "0.1.0", kind: "source-unavailable", documentId: input.documentId, createdAt,
          reason: "completed-family-import",
          completedFamilyRef: {
            runId: packet.runId, createdAt: packet.createdAt, requestHash: packet.requestHash, contentHash: packet.contentHash
          }
        });
      }
    } catch (cause) {
      settleCapture({ ok: false, cause });
      return;
    }
    // Attach both handlers now, even when this job must wait behind an earlier write.
    void payload.then(
      (value) => settleCapture({ ok: true, payload: value }),
      (cause) => settleCapture({ ok: false, cause })
    );
    try {
      const writer = retain(input.documentId);
      if (!writer) throw new Error("An exclusive source checkpoint writer is unavailable for this document.");
      const release = writer.release;
      if (typeof release === "function") {
        let released = false;
        releaseWriter = () => {
          if (released) return;
          released = true;
          release.call(writer);
        };
      }
      const put = writer.put;
      if (writer.exclusive !== true || writer.documentId !== input.documentId || typeof put !== "function" || !releaseWriter) {
        throw new Error("The retained source checkpoint writer is not an exclusive capability for this document.");
      }
      write = (value) => put.call(writer, value);
    } catch (cause) {
      retentionFailure = { cause };
    }
  }

  private async activateFixture(input: { operation: ActiveRun; fixture: AssemblyHallFixture; requestHash: string; prompt?: BuildingPromptControls; invalidation?: BuildingInvalidation; reusableArtifacts?: ReusableAssemblyHallArtifacts; packet?: CompletedFamilyPersistencePacket; persistPacket?: boolean; targetDocumentId?: string; expectedSourceSnapshot?: BuildingSourceSnapshot; acceptedSourceGuard?: AcceptedSourceGuard; windowWidthHistoryCommit?: WindowWidthHistoryCommit }): Promise<StartDemoRunResult> {
    const { operation, fixture } = input;
    let { requestHash } = input;
    let owner: PreparedBuildingArtifactOwner | undefined;
    let previous: PreparedBuildingArtifactOwner | undefined;
    let view: PreparedBuildingFixtureView | undefined;
    let cancelView: (() => void) | undefined;
    let finalizeOld: (() => void) | undefined;
    let published = false;
    try {
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
      if (operation.checkpointRecovery && fixture.sourceSnapshot) throw new Error("A completed-view checkpoint cannot provide editable source authority.");
      if (this.fixtureOwners.has(fixture)) throw new Error("A completed candidate must have a distinct fixture owner.");
      if (input.expectedSourceSnapshot && (!fixture.sourceSnapshot || canonicalJson(fixture.sourceSnapshot) !== canonicalJson(input.expectedSourceSnapshot))) throw Object.assign(new Error("Compiled candidate does not match its captured source."), { code: "building.sourceFileInvalid" });
      if (fixture.sourceSnapshot) {
        const expectedDocumentId = input.targetDocumentId ?? operation.documentId;
        if (fixture.sourceSnapshot.document.documentId !== expectedDocumentId) throw new Error("Candidate source document identity does not match its operation.");
        if (input.targetDocumentId === undefined) {
          const before = this.lastCompletedFixture?.sourceSnapshot;
          const revision = before && before.document.documentId === expectedDocumentId ? before.document.revision + (before.sourceContentHash === fixture.sourceSnapshot.sourceContentHash ? 0 : 1) : 0;
          fixture.sourceSnapshot = withBuildingSourceRevision(fixture.sourceSnapshot, revision);
        }
      }
      const inheritedSurface = this.lastCompletedFixture ? this.surfaceSources.get(this.lastCompletedFixture) : undefined;
      if (!this.surfaceSources.has(fixture) && inheritedSurface && input.targetDocumentId === undefined &&
          fixture.sourceSnapshot && fixture.sourceSnapshot.document.documentId === this.lastCompletedFixture?.sourceSnapshot?.document.documentId) {
        if (!input.expectedSourceSnapshot) throw sourceEditConflict("Surface layers require a compatible captured structural source.");
        const composition = Object.freeze({ ...inheritedSurface.composition,
          documentId: fixture.sourceSnapshot.document.documentId, revision: fixture.sourceSnapshot.document.revision });
        const surfaceRuntime = await prepareBuildingSurfaceRuntime({ composition, ir: fixture.ir, atlas: fixture.packedAtlas });
        try {
          operation.abortController.signal.throwIfAborted();
          fixture.buildingRuntime = fixture.familyRuntime.createOrReplaceBuilding({
            ir: fixture.ir, catalog: fixture.catalog, componentGallery: fixture.componentGallery, surfaceRuntime
          });
          fixture.metrics = { ...fixture.metrics, drawCallCount: fixture.familyRuntime.metrics.drawCallCount,
            textureCount: fixture.familyRuntime.metrics.textureCount };
          this.surfaceSources.set(fixture, { composition, dispose() {
            try { fixture.familyRuntime.dispose(); } finally { surfaceRuntime.dispose(); }
          } });
        } catch (error) { surfaceRuntime.dispose(); throw error; }
      }
      const surface = this.surfaceSources.get(fixture);
      if (surface) requestHash = await hashCanonicalJson({ schemaVersion: "0.1.0",
        runKind: "building-surface-source", structuralRequestHash: requestHash, composition: surface.composition });
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      const candidateSourceReference = fixture.sourceSnapshot;
      const candidateSource = candidateSourceReference ? captureBuildingSourceSnapshot(candidateSourceReference) : undefined;
      const assertCandidateSource = () => {
        if (fixture.sourceSnapshot !== candidateSourceReference ||
            (candidateSourceReference && canonicalJson(candidateSourceReference) !== canonicalJson(candidateSource))) {
          throw Object.assign(new Error("Compiled candidate source changed before publication."), { code: "building.sourceFileInvalid" });
        }
      };
      if (input.packet) this.validateRestoredFixture(input.packet, fixture);
      owner = this.registry.prepareOwnedArtifacts({ artifacts: this.fixtureArtifactInputs(fixture, requestHash), dispose: () => this.disposeFixtureOnce(fixture) });
      // A staged viewer can lease this exact candidate before any visible alias changes.
      this.fixtureOwners.set(fixture, owner);
      if (input.packet) { if (input.persistPacket) await this.persistCompletedFamilyPacket(operation, input.packet); }
      else await this.persistCompletedFamily({ operation, fixture, requestHash, documentId: input.targetDocumentId });
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
      assertCandidateSource();
      if (input.invalidation) this.appendCompletedStageEvents(operation.runId, fixture, input.invalidation, input.reusableArtifacts ?? {});
      if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
      const prepared = owner;
      const artifactId = artifactIdForFixture(fixture);
      const fixtureMetadata = prepared.metadata.find((entry) => entry.artifactId === artifactId);
      if (!fixtureMetadata) throw new Error("Prepared fixture metadata is missing.");
      while (this.isCurrent(operation)) {
        const ready = await this.prepareFixtureViewer(operation, fixture);
        view = ready.view;
        cancelView = ready.cancel;
        finalizeOld = undefined;
        if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
        if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
        assertCandidateSource();
        if (ready.provider !== this.fixtureViewer) { cancelView?.(); this.discardFixtureView(view); view = undefined; cancelView = undefined; continue; }
        previous = this.currentFixtureOwner;
        try {
          const accepted = this.store.getState().publishCompletedFixture({
            runId: operation.runId, artifactId, metadata: prepared.metadata, replacedArtifactIds: previous?.metadata.map((entry) => entry.artifactId) ?? [],
            event: { stage: "complete", startedAtMs: this.nowMs(), endedAtMs: this.nowMs(), outputArtifactId: artifactId },
            prompt: input.prompt, draftAtStart: operation.draftAtStart, targetDocumentId: input.targetDocumentId,
            publishArtifacts: () => {
              if (!this.isCurrent(operation) || ready.provider !== this.fixtureViewer) throw new Error("Fixture viewer changed before publication.");
              if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
              assertCandidateSource();
              this.registry.publishOwnedArtifacts(prepared, previous, () => {
                if (!this.isCurrent(operation) || ready.provider !== this.fixtureViewer) throw new Error("Fixture viewer changed before commit.");
                if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
                assertCandidateSource();
                finalizeOld = view?.commit();
                if (!this.isCurrent(operation) || ready.provider !== this.fixtureViewer) throw new Error("Fixture viewer changed during commit.");
                if (input.acceptedSourceGuard) this.assertAcceptedSource(input.acceptedSourceGuard);
                assertCandidateSource();
              });
              this.currentFixtureOwner = prepared;
              this.lastCompletedFixture = fixture;
              this.lastCompletedRunId = operation.runId;
              this.publishedSource = candidateSourceReference && candidateSource
                ? { fixture, reference: candidateSourceReference, source: candidateSource }
                : undefined;
              this.lastCompletedPrompt = input.prompt ? clonePrompt(input.prompt) : undefined;
              this.restoredReceipt = input.packet ? { owner: prepared, requestHash: input.packet.requestHash, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport, catalog: fixture.catalog, atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash, catalogId: fixture.catalog.catalogId } : undefined;
              published = true;
              this.activeRun = undefined;
              this.publishWindowWidthHistory(input.windowWidthHistoryCommit, candidateSource, operation.runId);
              this.scheduleSourceCheckpoint({
                owner: prepared, fixture, source: candidateSource,
                documentId: input.targetDocumentId ?? operation.documentId, runId: operation.runId,
                packet: input.packet, explicitImport: input.persistPacket === true
              });
            }
          });
          return accepted ? { runId: operation.runId, artifactId, fixture, stale: false } : { runId: operation.runId, stale: true };
        } catch (error) {
          // Zustand assigns state before notifying observers. A notification error
          // must not roll back or report failure for an already accepted owner.
          if (published && this.store.getState().artifacts.byId[artifactId] === fixtureMetadata) return { runId: operation.runId, artifactId, fixture, stale: false };
          if (published) throw error;
          cancelView?.();
          this.discardFixtureView(view); view = undefined; cancelView = undefined; finalizeOld = undefined;
          if (!this.isCurrent(operation)) return { runId: operation.runId, stale: true };
          if (ready.provider !== this.fixtureViewer) continue;
          throw error;
        }
      }
      return { runId: operation.runId, stale: true };
    } finally {
      if (published) {
        try { finalizeOld?.(); } catch { /* Old view cleanup cannot invalidate the committed candidate. */ }
        if (previous) this.retireOwner(previous);
      } else {
        cancelView?.();
        this.discardFixtureView(view);
        if (owner) {
          if (this.fixtureOwners.get(fixture) === owner) this.fixtureOwners.delete(fixture);
          this.retireOwner(owner);
        } else if (!this.fixtureOwners.has(fixture)) this.disposeFixtureOnce(fixture);
      }
    }
  }

  private validateRestoredFixture(packet: CompletedFamilyPersistencePacket, fixture: AssemblyHallFixture): void {
    const pairs = [[packet.familyId, fixture.spec.familyId], [packet.buildingId, fixture.ir.buildingId], [packet.artifacts.atlasManifest.atlasId, fixture.packedAtlas.atlasId], [packet.artifacts.atlasContentHash, fixture.packedAtlas.contentHash], [packet.artifacts.componentCatalog.catalogId, fixture.catalog.catalogId], [packet.artifacts.graph.graphId, fixture.graph.graphId], [packet.artifacts.runtimeIr.sourceGraphHash, fixture.ir.sourceGraphHash]];
    if (pairs.some(([saved, actual]) => saved !== actual)) throw new Error("Restored fixture does not match its saved artifact metadata.");
  }

  private disposeFixtureOnce(fixture: AssemblyHallFixture): void {
    if (this.disposedFixtures.has(fixture)) return;
    this.disposedFixtures.add(fixture);
    const surface = this.surfaceSources.get(fixture);
    this.surfaceSources.delete(fixture);
    if (surface) surface.dispose();
    else disposeFixture(fixture);
  }

  private retireOwner(owner: PreparedBuildingArtifactOwner): void {
    try { this.registry.retireOwnedArtifacts(owner); } catch { /* Cleanup cannot roll back a published replacement. */ }
  }

  cancelActiveRun(): void {
    this.operationEpoch += 1;
    const operation = this.activeRun;
    if (!operation) return;
    this.activeRun = undefined;
    operation.abortController.abort();
    if (operation.started) this.store.getState().cancelRun({ runId: operation.runId, event: { stage: "cancelled", startedAtMs: this.nowMs(), endedAtMs: this.nowMs() } });
  }

  dispose(): void {
    if (!this.sourceCheckpointDisposed) this.unsubscribeWindowWidthHistory();
    this.sourceCheckpointDisposed = true;
    this.windowWidthHistory = undefined;
    this.cancelActiveRun();
    this.fixtureViewer = undefined;
    this.notifyFixtureViewerChanged();
    this.currentFixtureOwner = undefined;
    this.lastCompletedFixture = undefined;
    this.lastCompletedRunId = undefined;
    this.publishedSource = undefined;
    this.lastCompletedPrompt = undefined;
    this.restoredReceipt = undefined;
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

  private remoteMaterialForRun(operation: ActiveRun): CreateAssemblyHallFixtureInput["remoteMaterial"] {
    const runId = operation.runId;
    const appendEvent = (event: GenerationRunEvent) => {
      if (this.isCurrent(operation)) this.store.getState().appendRunEvent(runId, event);
    };
    if (!this.remoteMaterial) {
      return undefined;
    }

    const requestRemoteImages = this.remoteMaterial.requestRemoteImages ?? requestRemoteMaterialImages;
    return {
      ...this.remoteMaterial,
      requestRemoteImages: async (input) => {
        if (!this.isCurrent(operation)) throw new Error("Material operation is no longer current.");
        const startedAtMs = this.nowMs();
        appendEvent({
          stage: "generatingMaterialSources",
          startedAtMs,
          provider: "remote-material-route"
        });

        try {
          const result = await requestRemoteImages(input);
          const diagnostic = result.diagnostics[0];
          appendEvent({
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
          appendEvent({
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

  private async persistCompletedFamily(input: { operation: ActiveRun; fixture: AssemblyHallFixture; requestHash: string; documentId?: string }): Promise<void> {
    if (!this.completedFamilyPersistence || !this.isCurrent(input.operation)) return;
    // The legacy completed-view format cannot retain composition authority.
    // Source checkpoints are the durable recovery path for these fixtures.
    if (this.surfaceSources.has(input.fixture)) return;
    if ((input.fixture.sourceSnapshot?.schemaVersion === "0.4.0" && input.fixture.sourceSnapshot.windowWidthOverrides.length > 0) ||
        (input.fixture.sourceSnapshot?.schemaVersion === "0.5.0" && input.fixture.sourceSnapshot.windowWidthBatch.directives.length > 0)) return;
    try {
      const packet = await this.createCompletedFamilyPersistencePacket({ documentId: input.documentId ?? input.operation.documentId, runId: input.operation.runId, requestHash: input.requestHash, fixture: input.fixture });
      if (!this.isCurrent(input.operation)) return;
      await this.completedFamilyPersistence.put(completedFamilyPersistenceCacheEntry(packet));
      if (!this.isCurrent(input.operation)) return;
    } catch { /* Best effort; activation still performs a final ownership guard. */ }
  }

  private async persistCompletedFamilyPacket(operation: ActiveRun, packet: CompletedFamilyPersistencePacket): Promise<void> {
    if (!this.completedFamilyPersistence || !this.isCurrent(operation)) return;
    try {
      await this.completedFamilyPersistence.put(completedFamilyPersistenceCacheEntry(packet));
      if (!this.isCurrent(operation)) return;
    } catch { /* Packet persistence does not change the runtime owner. */ }
  }

  private async latestCompletedFamilyEntryForDocument(documentId: string): Promise<CompletedFamilyPersistenceCacheEntry | undefined> {
    const entries = await this.completedFamilyPersistence?.list?.();
    return entries?.filter((entry): entry is CompletedFamilyPersistenceCacheEntry => entry.artifactType === COMPLETED_FAMILY_ARTIFACT_TYPE)
      .filter((entry) => entry.artifact.documentId === documentId)
      .sort((left, right) => right.artifact.createdAt.localeCompare(left.artifact.createdAt))[0];
  }

  private reusableArtifactsFor(invalidation: BuildingInvalidation, requestHash: string): ReusableAssemblyHallArtifacts {
    if (!this.lastCompletedFixture) return {};
    if (!this.lastCompletedPrompt) {
      const receipt = this.restoredReceipt;
      const fixture = this.lastCompletedFixture;
      if (!receipt || receipt.owner !== this.currentFixtureOwner || receipt.requestHash !== requestHash ||
        receipt.packedAtlas !== fixture.packedAtlas || receipt.debugExport !== fixture.debugExport || receipt.catalog !== fixture.catalog ||
        receipt.atlasId !== fixture.packedAtlas.atlasId || receipt.atlasContentHash !== fixture.packedAtlas.contentHash || receipt.catalogId !== fixture.catalog.catalogId) {
        throw Object.assign(new Error("Restored material reuse provenance is unresolved for this request. The current scene and material artifacts are retained."), { code: "building.restoredReuseProvenanceUnresolved" });
      }
      return { packedAtlas: receipt.packedAtlas, debugExport: receipt.debugExport, catalog: receipt.catalog };
    }
    return {
      ...(invalidation.reusableArtifacts.packedAtlas ? { packedAtlas: this.lastCompletedFixture.packedAtlas, debugExport: this.lastCompletedFixture.debugExport } : {}),
      ...(invalidation.reusableArtifacts.componentCatalog ? { catalog: this.lastCompletedFixture.catalog } : {})
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

  private fixtureArtifactInputs(fixture: AssemblyHallFixture, requestHash: string): Array<Omit<RegisterBuildingArtifactInput<unknown>, "dispose">> {
    return [
      { artifactId: specArtifactId(fixture), artifactType: "building-family-spec", requestHash, contentHash: fixture.spec.sourceIntentHash, artifact: fixture.spec },
      { artifactId: atlasManifestArtifactId(fixture), artifactType: "atlas-manifest", requestHash, contentHash: fixture.packedAtlas.manifest.atlasId, artifact: fixture.packedAtlas.manifest },
      { artifactId: materialSourcesArtifactId(fixture), artifactType: "material-source", requestHash, contentHash: fixture.packedAtlas.contentHash, artifact: fixture.packedAtlas.slotProvenance },
      { artifactId: packedAtlasArtifactId(fixture), artifactType: "atlas-channel", requestHash, contentHash: fixture.packedAtlas.contentHash, artifact: fixture.packedAtlas },
      { artifactId: componentCatalogArtifactId(fixture), artifactType: "component-catalog", requestHash, contentHash: fixture.catalog.catalogId, artifact: fixture.catalog },
      { artifactId: buildingGraphArtifactId(fixture), artifactType: "building-graph", requestHash, contentHash: fixture.ir.sourceGraphHash, artifact: fixture.graph },
      { artifactId: runtimeIrArtifactId(fixture), artifactType: "runtime-building-ir", requestHash, contentHash: fixture.ir.sourceGraphHash, artifact: fixture.ir },
      { artifactId: artifactIdForFixture(fixture), artifactType: "assembly-hall-fixture", requestHash, contentHash: fixture.packedAtlas.contentHash, dependencies: [fixture.ir.sourceGraphHash], artifact: fixture }
    ];
  }

}

function clonePrompt(prompt: BuildingPromptControls): BuildingPromptControls {
  return {
    ...prompt,
    seeds: {
      ...prompt.seeds
    },
    lockedComponentKeys: [...prompt.lockedComponentKeys]
  };
}

function sourceEditConflict(message: string): Error {
  return Object.assign(new Error(message), { code: "building.sourceEditConflict" });
}

function buildingRequestHash(prompt: BuildingPromptControls, source?: BuildingSourceSnapshot): Promise<string> {
  return hashCanonicalJson({ schemaVersion: "0.1.0", runKind: "late19c-commercial-demo", prompt,
    ...(source ? { sourceContentHash: source.sourceContentHash } : {}) });
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
