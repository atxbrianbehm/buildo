import type { ExclusiveBuildingSourceCheckpointWriter } from "./buildingRunController";
import {
  BuildingSourceCheckpointError,
  createBuildingSourceCheckpointPersistence,
  parseBuildingSourceCheckpoint,
  type BuildingSourceCheckpointPersistence
} from "./buildingSourceCheckpoint";

export const BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX = "buildo-building-source-checkpoint:";

export interface BuildingSourceCheckpointWriterOptions {
  documentId: string;
  locks?: Pick<LockManager, "request">;
  createPersistence?: () => Pick<BuildingSourceCheckpointPersistence, "put">;
}

export interface BuildingSourceCheckpointWriterSession {
  readonly documentId: string;
  retain(documentId: string): ExclusiveBuildingSourceCheckpointWriter | undefined;
  close(): Promise<void>;
}

function writeFailed(cause: unknown): BuildingSourceCheckpointError {
  return new BuildingSourceCheckpointError(
    "building.sourceCheckpointWriteFailed",
    "The source checkpoint writer could not complete its exclusive work.",
    cause
  );
}

/** Holds one nonblocking, cooperative document lock; it does not schedule publications or activate recovery. */
export async function acquireBuildingSourceCheckpointWriter(
  options: BuildingSourceCheckpointWriterOptions
): Promise<BuildingSourceCheckpointWriterSession | undefined> {
  let documentId: string;
  let locks: Pick<LockManager, "request">;
  let request: LockManager["request"];
  let createPersistence: () => Pick<BuildingSourceCheckpointPersistence, "put">;
  try {
    documentId = options.documentId;
    if (typeof documentId !== "string" || documentId.length === 0) throw new Error("A source checkpoint writer requires a document identity.");
    const manager = options.locks ?? globalThis.navigator?.locks;
    createPersistence = options.createPersistence ?? createBuildingSourceCheckpointPersistence;
    if (!manager) return undefined;
    const method = manager.request;
    if (typeof method !== "function") return undefined;
    locks = manager;
    request = method;
  } catch (cause) {
    throw writeFailed(cause);
  }

  type Acquisition =
    | { state: "acquired"; session: BuildingSourceCheckpointWriterSession }
    | { state: "unavailable" }
    | { state: "failed"; cause: unknown };
  type RequestOutcome = { ok: true } | { ok: false; cause: unknown };
  let finishAcquisition!: (result: Acquisition) => void;
  const readiness = new Promise<Acquisition>((resolve) => { finishAcquisition = resolve; });
  let acquisitionFinished = false;
  const ready = (result: Acquisition) => {
    if (acquisitionFinished) return;
    acquisitionFinished = true;
    finishAcquisition(result);
  };
  let finishRequest!: (result: RequestOutcome) => void;
  const requestOutcome = new Promise<RequestOutcome>((resolve) => { finishRequest = resolve; });
  let finishQuiescence!: () => void;
  const quiescence = new Promise<void>((resolve) => { finishQuiescence = resolve; });
  let quiescent = false;
  let held = false;
  let rootClosed = false;
  let retained = 0;
  let activePuts = 0;
  let requestReturned = false;
  let requestSettled = false;
  let loss: { cause: unknown } | undefined;
  let session: BuildingSourceCheckpointWriterSession | undefined;

  const releaseWhenQuiescent = () => {
    if (!quiescent && rootClosed && retained === 0 && activePuts === 0) {
      quiescent = true;
      finishQuiescence();
    }
  };
  const settled = (outcome: RequestOutcome) => {
    if (requestSettled) return;
    requestSettled = true;
    if (!outcome.ok || !quiescent) {
      loss = { cause: outcome.ok ? new Error("The source checkpoint lock ended before the session was closed.") : outcome.cause };
    }
    held = false;
    finishRequest(outcome);
    if (!acquisitionFinished) {
      ready({ state: "failed", cause: loss ? loss.cause : new Error("The source checkpoint lock request ended without a grant.") });
      rootClosed = true;
      releaseWhenQuiescent();
    }
  };
  const noLongerHeld = () => loss ? loss.cause : new Error("The source checkpoint writer is no longer held.");

  const granted = (lock: Lock | null): Promise<void> => {
    if (requestSettled) return Promise.resolve();
    if (lock === null) {
      rootClosed = true;
      releaseWhenQuiescent();
      ready({ state: "unavailable" });
      return quiescence;
    }
    try {
      const name = BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX + JSON.stringify(documentId);
      if (!lock || lock.name !== name || lock.mode !== "exclusive") throw new Error("The granted source checkpoint lock has the wrong identity or mode.");
      // No persistence factory is evaluated until this exact exclusive grant.
      const persistence = createPersistence();
      const put = persistence?.put;
      if (typeof put !== "function") throw new Error("The source checkpoint persistence writer is unavailable.");
      held = true;
      let closePromise: Promise<void> | undefined;
      const close = (): Promise<void> => {
        rootClosed = true;
        releaseWhenQuiescent();
        if (!closePromise) {
          closePromise = (async () => {
            await quiescence;
            const outcome = await requestOutcome;
            if (loss) throw writeFailed(loss.cause);
            if (!outcome.ok) throw writeFailed(outcome.cause);
          })();
          // The public promise still rejects for awaiters; no background orphan is created.
          void closePromise.catch(() => undefined);
        }
        return closePromise;
      };
      const retain = (requestedDocumentId: string): ExclusiveBuildingSourceCheckpointWriter | undefined => {
        if (rootClosed || !held || requestedDocumentId !== documentId) return undefined;
        retained += 1;
        let released = false;
        return Object.freeze({
          exclusive: true as const,
          documentId,
          async put(input: unknown): Promise<void> {
            const admitted = held && !released;
            if (admitted) activePuts += 1;
            try {
              // The actual parser owns the complete unknown record before this first await.
              const record = await parseBuildingSourceCheckpoint(input);
              if (!admitted) throw writeFailed(loss ? loss.cause : new Error("The source checkpoint writer capability has been released."));
              if (!held) throw writeFailed(noLongerHeld());
              if (record.documentId !== documentId) throw writeFailed(new Error("The source checkpoint record belongs to another document."));
              // An admitted call may finish after capability.release(); that release
              // blocks only new calls, while activePuts holds the lock through acknowledgement.
              try { await put.call(persistence, record); }
              catch (cause) { throw writeFailed(cause); }
              // Unexpected native loss cannot undo delegated I/O; it may have committed.
              // Reject conservatively rather than claim an exclusive acknowledgement.
              if (!held) throw writeFailed(noLongerHeld());
            } finally {
              if (admitted) {
                activePuts -= 1;
                releaseWhenQuiescent();
              }
            }
          },
          release(): void {
            if (released) return;
            released = true;
            retained -= 1;
            releaseWhenQuiescent();
          }
        });
      };
      session = Object.freeze({ documentId, retain, close });
      if (requestReturned) ready({ state: "acquired", session });
      return quiescence;
    } catch (cause) {
      held = false;
      rootClosed = true;
      releaseWhenQuiescent();
      ready({ state: "failed", cause });
      return quiescence;
    }
  };

  try {
    const nativeRequest = request.call(
      locks,
      BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX + JSON.stringify(documentId),
      { mode: "exclusive", ifAvailable: true },
      granted
    );
    requestReturned = true;
    // Both native outcomes are observed immediately, independently of session readiness.
    void Promise.resolve(nativeRequest).then(
      () => settled({ ok: true }),
      (cause) => settled({ ok: false, cause })
    );
    if (session && held && !requestSettled) ready({ state: "acquired", session });
  } catch (cause) {
    settled({ ok: false, cause });
  }

  const acquisition = await readiness;
  if (acquisition.state === "failed") throw writeFailed(acquisition.cause);
  if (acquisition.state !== "acquired") return undefined;
  // Observe native settlement queued alongside the grant before delivering authority.
  await Promise.resolve();
  if (!held || requestSettled || loss) {
    rootClosed = true;
    releaseWhenQuiescent();
    throw writeFailed(noLongerHeld());
  }
  return acquisition.session;
}
