import { describe, expect, it, vi } from "vitest";
import type { CachedArtifactEntry } from "../materials/artifactCache";
import {
  BuildingSourceCheckpointError,
  createBuildingSourceCheckpoint,
  createBuildingSourceCheckpointPersistence,
  type BuildingSourceCheckpoint
} from "../state/buildingSourceCheckpoint";
import * as checkpointCodec from "../state/buildingSourceCheckpoint";
import {
  BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX,
  acquireBuildingSourceCheckpointWriter,
  type BuildingSourceCheckpointWriterOptions,
  type BuildingSourceCheckpointWriterSession
} from "../state/buildingSourceCheckpointWriter";
import type { ExclusiveBuildingSourceCheckpointWriter } from "../state/buildingRunController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

interface ControlledAttempt {
  readonly name: string;
  readonly options: LockOptions;
  readonly callbackDone: Promise<void>;
  callbackFinished: boolean;
  requestFinished: boolean;
  grant(): void;
  settleRequest(): Promise<void>;
  rejectRequest(cause: unknown): void;
}

class ControlledLocks implements Pick<LockManager, "request"> {
  readonly attempts: ControlledAttempt[] = [];
  throwOnRequest: unknown;
  onRequest?: (attempt: ControlledAttempt) => void;
  private readonly held = new Map<string, ControlledAttempt>();
  private readonly waiting: Array<(attempt: ControlledAttempt) => void> = [];
  private nextIndex = 0;

  request<T>(name: string, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  request<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  request<T>(name: string, optionsOrCallback: LockOptions | LockGrantedCallback<T>, suppliedCallback?: LockGrantedCallback<T>): Promise<Awaited<T>> {
    if (this.throwOnRequest !== undefined) throw this.throwOnRequest;
    const options: LockOptions = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : suppliedCallback;
    if (!callback) throw new Error("Expected the installed LockGrantedCallback overload.");
    const requested = deferred<Awaited<T>>(), done = deferred<void>();
    let granted = false;
    let outcome: { ok: true; value: Awaited<T> } | { ok: false; cause: unknown } | undefined;
    const finishCallback = () => {
      attempt.callbackFinished = true;
      if (this.held.get(name) === attempt) this.held.delete(name);
      done.resolve();
    };
    const attempt: ControlledAttempt = {
      name, options: { ...options }, callbackDone: done.promise, callbackFinished: false, requestFinished: false,
      grant: () => {
        if (granted) throw new Error("A request callback can run only once.");
        granted = true;
        const lock: Lock | null = this.held.has(name) ? null : { name, mode: options.mode ?? "exclusive" };
        if (lock) this.held.set(name, attempt);
        let result: T;
        try { result = callback(lock); }
        catch (cause) { outcome = { ok: false, cause }; finishCallback(); return; }
        void Promise.resolve(result).then(
          value => { outcome = { ok: true, value }; finishCallback(); },
          cause => { outcome = { ok: false, cause }; finishCallback(); }
        );
      },
      settleRequest: async () => {
        if (attempt.requestFinished) return;
        await done.promise;
        if (attempt.requestFinished) return;
        attempt.requestFinished = true;
        if (!outcome) throw new Error("Expected a completed native callback.");
        if (outcome.ok) requested.resolve(outcome.value);
        else requested.reject(outcome.cause);
      },
      rejectRequest: cause => {
        if (attempt.requestFinished) return;
        attempt.requestFinished = true;
        if (this.held.get(name) === attempt) this.held.delete(name);
        requested.reject(cause);
      }
    };
    this.attempts.push(attempt); this.waiting.shift()?.(attempt);
    this.onRequest?.(attempt);
    return requested.promise;
  }

  next(): Promise<ControlledAttempt> {
    const existing = this.attempts[this.nextIndex++];
    return existing ? Promise.resolve(existing) : new Promise(resolve => this.waiting.push(resolve));
  }
}

async function marker(documentId: string): Promise<BuildingSourceCheckpoint> {
  return createBuildingSourceCheckpoint({
    schemaVersion: "0.1.0", kind: "source-unavailable", documentId,
    createdAt: "2026-10-15T12:00:00.000Z", reason: "completed-family-import",
    completedFamilyRef: { runId: "writer-test-run", createdAt: "2026-10-15T11:00:00.000Z",
      requestHash: "writer-test-request", contentHash: "writer-test-content" }
  });
}

function storage(gate: Promise<void> = Promise.resolve()) {
  const entries: CachedArtifactEntry[] = [];
  let failure: unknown;
  const io = {
    get: async <T,>(): Promise<CachedArtifactEntry<T> | undefined> => undefined,
    put: vi.fn(async (entry: CachedArtifactEntry) => {
      await gate;
      if (failure !== undefined) throw failure;
      entries.push(structuredClone(entry));
    })
  };
  const factory = vi.fn(() => createBuildingSourceCheckpointPersistence({ persistence: io }));
  return { entries, io, factory, failWith: (cause: unknown) => { failure = cause; } };
}

async function writeFailure(operation: Promise<unknown>, cause?: unknown): Promise<BuildingSourceCheckpointError> {
  const failure = await operation.then(() => undefined, error => error);
  expect(failure).toMatchObject({ name: "BuildingSourceCheckpointError", code: "building.sourceCheckpointWriteFailed" });
  if (!(failure instanceof BuildingSourceCheckpointError)) throw new Error("Expected the public checkpoint writer error.");
  if (cause !== undefined) expect(failure.cause).toBe(cause);
  return failure;
}

async function finish(session: BuildingSourceCheckpointWriterSession, attempt: ControlledAttempt,
  capabilities: ExclusiveBuildingSourceCheckpointWriter[] = []): Promise<void> {
  const closing = session.close();
  for (const capability of capabilities) capability.release();
  await attempt.callbackDone;
  await attempt.settleRequest();
  await closing;
}

describe("R3.P10 exclusive checkpoint writer sessions", () => {
  it("uses the installed nonblocking exclusive request protocol, isolates documents and constructs storage only after a grant", async () => {
    const locks = new ControlledLocks(), firstStore = storage(), busyStore = storage(), otherStore = storage();
    const documentId = 'checkpoint "A"';
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: firstStore.factory });
    const first = await locks.next();
    expect(first.name).toBe('buildo-building-source-checkpoint:' + JSON.stringify(documentId));
    expect(BUILDING_SOURCE_CHECKPOINT_LOCK_PREFIX).toBe("buildo-building-source-checkpoint:");
    expect(first.options).toEqual({ mode: "exclusive", ifAvailable: true });
    expect(Object.hasOwn(first.options, "signal")).toBe(false); expect(Object.hasOwn(first.options, "steal")).toBe(false);
    expect(firstStore.factory).not.toHaveBeenCalled();
    first.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected the granted session.");
    let other: BuildingSourceCheckpointWriterSession | undefined, otherAttempt: ControlledAttempt | undefined;
    try {
      expect(session.documentId).toBe(documentId); expect(firstStore.factory).toHaveBeenCalledTimes(1);
      expect(first.callbackFinished).toBe(false); expect(first.requestFinished).toBe(false);
      const busy = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: busyStore.factory });
      const unavailable = await locks.next(); unavailable.grant();
      await unavailable.callbackDone; await unavailable.settleRequest();
      expect(await busy).toBeUndefined(); expect(busyStore.factory).not.toHaveBeenCalled();
      const otherDocument = documentId + ":other";
      const acquiringOther = acquireBuildingSourceCheckpointWriter({ documentId: otherDocument, locks, createPersistence: otherStore.factory });
      otherAttempt = await locks.next(); otherAttempt.grant(); other = await acquiringOther;
      expect(other?.documentId).toBe(otherDocument); expect(otherAttempt.name).not.toBe(first.name);
      expect(otherStore.factory).toHaveBeenCalledTimes(1);
      expect(firstStore.io.put).not.toHaveBeenCalled(); expect(busyStore.io.put).not.toHaveBeenCalled(); expect(otherStore.io.put).not.toHaveBeenCalled();
    } finally {
      if (other && otherAttempt) await finish(other, otherAttempt);
      await finish(session, first);
    }
  });

  it("returns no writer for unsupported locks and preserves native or factory acquisition failures without touching storage", async () => {
    const current = Object.getOwnPropertyDescriptor(navigator, "locks"), unused = storage();
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try {
      expect(await acquireBuildingSourceCheckpointWriter({ documentId: "unsupported", createPersistence: unused.factory })).toBeUndefined();
      expect(unused.factory).not.toHaveBeenCalled();
    } finally {
      if (current) Object.defineProperty(navigator, "locks", current); else Reflect.deleteProperty(navigator, "locks");
    }
    const invalidLocks = new ControlledLocks();
    await writeFailure(acquireBuildingSourceCheckpointWriter({ documentId: "", locks: invalidLocks, createPersistence: unused.factory }));
    expect(invalidLocks.attempts).toHaveLength(0); expect(unused.factory).not.toHaveBeenCalled();
    const thrown = new Error("native request threw"), throwingLocks = new ControlledLocks(); throwingLocks.throwOnRequest = thrown;
    await writeFailure(acquireBuildingSourceCheckpointWriter({ documentId: "native-throw", locks: throwingLocks, createPersistence: unused.factory }), thrown);
    const rejectingLocks = new ControlledLocks(), rejected = new Error("native request rejected");
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId: "native-reject", locks: rejectingLocks, createPersistence: unused.factory });
    const request = await rejectingLocks.next(), failure = writeFailure(acquiring, rejected);
    request.rejectRequest(rejected); await failure;
    expect(unused.factory).not.toHaveBeenCalled(); expect(unused.io.put).not.toHaveBeenCalled();
    const factoryLocks = new ControlledLocks(), factoryCause = new Error("storage factory failed");
    const factory = vi.fn(() => { throw factoryCause; });
    const constructing = acquireBuildingSourceCheckpointWriter({ documentId: "factory-reject", locks: factoryLocks, createPersistence: factory });
    const granted = await factoryLocks.next(), failedFactory = writeFailure(constructing, factoryCause);
    expect(factory).not.toHaveBeenCalled(); granted.grant(); await granted.callbackDone; await granted.settleRequest(); await failedFactory;
    expect(factory).toHaveBeenCalledTimes(1); expect(unused.io.put).not.toHaveBeenCalled();
  });

  it("captures trusted option getters and port references once before the grant without freezing or rereading the caller", async () => {
    const locks = new ControlledLocks(), otherLocks = new ControlledLocks(), firstStore = storage(), lateStore = storage();
    let documentId = "captured-options", selectedLocks = locks, selectedFactory = firstStore.factory;
    const reads = { documentId: 0, locks: 0, createPersistence: 0 };
    const options: BuildingSourceCheckpointWriterOptions = {
      get documentId() { reads.documentId += 1; return documentId; },
      get locks() { reads.locks += 1; return selectedLocks; },
      get createPersistence() { reads.createPersistence += 1; return selectedFactory; }
    };
    const acquiring = acquireBuildingSourceCheckpointWriter(options), attempt = await locks.next();
    documentId = "late-options"; selectedLocks = otherLocks; selectedFactory = lateStore.factory;
    attempt.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected the captured option session.");
    try {
      expect(session.documentId).toBe("captured-options");
      expect(reads).toEqual({ documentId: 1, locks: 1, createPersistence: 1 });
      expect(firstStore.factory).toHaveBeenCalledTimes(1); expect(lateStore.factory).not.toHaveBeenCalled(); expect(otherLocks.attempts).toHaveLength(0);
      expect(Object.isFrozen(options)).toBe(false); expect(options.documentId).toBe("late-options");
    } finally { await finish(session, attempt); }
    expect(reads).toEqual({ documentId: 2, locks: 1, createPersistence: 1 });
    for (const field of ["documentId", "locks", "createPersistence"] as const) {
      const cause = new Error("option getter failed " + field), invalidOptions = { documentId: "throwing-options", locks, createPersistence: firstStore.factory };
      Object.defineProperty(invalidOptions, field, { enumerable: true, get: () => { throw cause; } });
      await writeFailure(acquireBuildingSourceCheckpointWriter(invalidOptions), cause);
    }
    expect(firstStore.factory).toHaveBeenCalledTimes(1);
    expect(locks.attempts).toHaveLength(1);
  });

  it("closes new retention while existing capabilities remain usable, and waits for both references and the real request settlement", async () => {
    const locks = new ControlledLocks(), disk = storage(), documentId = "close-with-retains";
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: disk.factory });
    const attempt = await locks.next(); attempt.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected granted session.");
    const first = session.retain(documentId), second = session.retain(documentId);
    if (!first || !second) throw new Error("Expected retained matching capabilities.");
    let closed = false;
    const closing = session.close(); void closing.then(() => { closed = true; });
    try {
      expect(session.close()).toBe(closing); expect(session.retain(documentId)).toBeUndefined(); expect(session.retain("foreign-document")).toBeUndefined();
      expect(first.exclusive).toBe(true); expect(first.documentId).toBe(documentId);
      const record = await marker(documentId); await second.put(record);
      expect(disk.io.put).toHaveBeenCalledTimes(1); expect(disk.entries[0].artifact).toEqual(record);
      first.release(); first.release(); await Promise.resolve();
      expect(attempt.callbackFinished).toBe(false); expect(closed).toBe(false);
      second.release(); second.release(); await attempt.callbackDone;
      expect(attempt.callbackFinished).toBe(true); expect(attempt.requestFinished).toBe(false); expect(closed).toBe(false);
      await attempt.settleRequest(); await closing;
      expect(closed).toBe(true); expect(session.close()).toBe(closing);
    } finally { first.release(); second.release(); await finish(session, attempt); }
  });


  it("owns a record before its first parse await and keeps an early-released call admitted through the real P8 acknowledgement", async () => {
    const locks = new ControlledLocks(), releaseIo = deferred<void>(), disk = storage(releaseIo.promise), documentId = "early-release";
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: disk.factory });
    const attempt = await locks.next(); attempt.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected granted session.");
    const capability = session.retain(documentId);
    if (!capability) throw new Error("Expected retained capability.");
    const expected = await marker(documentId);
    if (expected.kind !== "source-unavailable") throw new Error("Expected a real P8 marker record.");
    const caller: typeof expected = JSON.parse(JSON.stringify(expected));
    const parsedReady = deferred<BuildingSourceCheckpoint>(), releaseParse = deferred<void>();
    const originalParse = checkpointCodec.parseBuildingSourceCheckpoint;
    const parser = vi.spyOn(checkpointCodec, "parseBuildingSourceCheckpoint").mockImplementationOnce(input => {
      const owned = originalParse(input);
      return owned.then(record => { parsedReady.resolve(record); return releaseParse.promise.then(() => record); });
    });
    const putting = capability.put(caller);
    caller.documentId = "late-caller"; caller.completedFamilyRef.runId = "late-run"; caller.contentHash = "0".repeat(64);
    capability.release();
    let closed = false;
    const closing = session.close(); void closing.then(() => { closed = true; });
    try {
      expect(await parsedReady.promise).toEqual(expected);
      expect(Object.isFrozen(caller)).toBe(false); expect(Object.isFrozen(caller.completedFamilyRef)).toBe(false);
      await writeFailure(capability.put(expected));
      expect(disk.io.put).not.toHaveBeenCalled(); expect(attempt.callbackFinished).toBe(false); expect(closed).toBe(false);
      releaseParse.resolve();
      await vi.waitFor(() => expect(disk.io.put).toHaveBeenCalledTimes(1));
      expect(attempt.callbackFinished).toBe(false); expect(closed).toBe(false);
      releaseIo.resolve(); await putting; await attempt.callbackDone;
      expect(disk.entries).toHaveLength(1); expect(disk.entries[0].artifact).toEqual(expected);
      expect(caller.documentId).toBe("late-caller"); expect(caller.completedFamilyRef.runId).toBe("late-run");
      expect(attempt.requestFinished).toBe(false); expect(closed).toBe(false);
      await attempt.settleRequest(); await closing;
      expect(closed).toBe(true); expect(session.close()).toBe(closing);
    } finally {
      releaseParse.resolve(); releaseIo.resolve(); capability.release();
      await putting.catch(() => undefined); await finish(session, attempt); parser.mockRestore();
    }
  });

  it("preserves actual P8 parse errors and rejects foreign-document or released-capability use before storage", async () => {
    const locks = new ControlledLocks(), disk = storage(), documentId = "record-admission";
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: disk.factory });
    const attempt = await locks.next(); attempt.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected granted session.");
    const capability = session.retain(documentId);
    if (!capability) throw new Error("Expected retained capability.");
    let replacement: ExclusiveBuildingSourceCheckpointWriter | undefined;
    const originalParse = checkpointCodec.parseBuildingSourceCheckpoint;
    let actualParseError: unknown;
    const parser = vi.spyOn(checkpointCodec, "parseBuildingSourceCheckpoint").mockImplementationOnce(input => originalParse(input).catch(cause => {
      actualParseError = cause; throw cause;
    }));
    try {
      const record = await marker(documentId);
      const invalid = { ...record, contentHash: "0".repeat(64) };
      const rejected = await capability.put(invalid).then(() => undefined, cause => cause);
      expect(rejected).toBe(actualParseError);
      expect(rejected).toMatchObject({ name: "BuildingSourceCheckpointError", code: "building.sourceCheckpointInvalid" });
      parser.mockRestore();
      await writeFailure(capability.put(await marker("foreign-document")));
      expect(session.retain("foreign-document")).toBeUndefined();
      let getterCalls = 0;
      const accessor = { ...record };
      Object.defineProperty(accessor, "documentId", { enumerable: true, get: () => { getterCalls += 1; return documentId; } });
      await expect(capability.put(accessor)).rejects.toMatchObject({ code: "building.sourceCheckpointInvalid" });
      expect(getterCalls).toBe(0); expect(disk.io.put).not.toHaveBeenCalled();
      capability.release(); capability.release();
      await writeFailure(capability.put(record));
      expect(disk.io.put).not.toHaveBeenCalled();
      replacement = session.retain(documentId);
      if (!replacement) throw new Error("Failed admission must not destroy a still-held root session.");
      await replacement.put(record);
      expect(disk.io.put).toHaveBeenCalledTimes(1); expect(disk.entries[0].artifact).toEqual(record);
    } finally { parser.mockRestore(); capability.release(); replacement?.release(); await finish(session, attempt); }
  });

  it("wraps the exact real P8 storage failure without orphaning the held session or preventing a later acknowledgement", async () => {
    const locks = new ControlledLocks(), disk = storage(), documentId = "storage-failure";
    const nativeCause = new Error("native storage acknowledgement failed");
    disk.failWith(nativeCause);
    const originalFactory = disk.factory.getMockImplementation();
    if (!originalFactory) throw new Error("Expected actual P8 persistence factory.");
    let p8Failure: unknown;
    disk.factory.mockImplementation(() => {
      const persistence = originalFactory(), actualPut = persistence.put;
      return { ...persistence, put: async (record: unknown) => {
        try { await actualPut.call(persistence, record); }
        catch (cause) { p8Failure = cause; throw cause; }
      } };
    });
    const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: disk.factory });
    const attempt = await locks.next(); attempt.grant(); const session = await acquiring;
    if (!session) throw new Error("Expected granted session.");
    const capability = session.retain(documentId);
    if (!capability) throw new Error("Expected retained capability.");
    try {
      const record = await marker(documentId), failure = await writeFailure(capability.put(record));
      expect(failure.cause).toBe(p8Failure);
      expect(p8Failure).toMatchObject({ code: "building.sourceCheckpointWriteFailed" });
      if (!(p8Failure instanceof BuildingSourceCheckpointError)) throw new Error("Expected actual P8 I/O failure.");
      expect(p8Failure.cause).toBe(nativeCause);
      expect(disk.entries).toHaveLength(0); expect(attempt.callbackFinished).toBe(false);
      disk.failWith(undefined); await capability.put(record);
      expect(disk.io.put).toHaveBeenCalledTimes(2); expect(disk.entries).toHaveLength(1);
      expect(disk.entries[0].artifact).toEqual(record);
    } finally { capability.release(); await finish(session, attempt); }
  });

  it("denies future work after native loss, drains pre-delegation and delegated puts, and reports an ambiguous acknowledged commit honestly", async () => {
    for (const phase of ["parse", "io"] as const) {
      const locks = new ControlledLocks(), releaseIo = deferred<void>(), releaseParse = deferred<void>(), parsedReady = deferred<BuildingSourceCheckpoint>();
      const disk = storage(releaseIo.promise), documentId = "native-loss-" + phase, nativeCause = new Error("native lock lost during " + phase);
      const acquiring = acquireBuildingSourceCheckpointWriter({ documentId, locks, createPersistence: disk.factory });
      const attempt = await locks.next(); attempt.grant(); const session = await acquiring;
      if (!session) throw new Error("Expected granted session.");
      const capability = session.retain(documentId);
      if (!capability) throw new Error("Expected retained capability.");
      const originalParse = checkpointCodec.parseBuildingSourceCheckpoint;
      const parser = phase === "parse" ? vi.spyOn(checkpointCodec, "parseBuildingSourceCheckpoint").mockImplementationOnce(input => {
        const owned = originalParse(input);
        return owned.then(record => { parsedReady.resolve(record); return releaseParse.promise.then(() => record); });
      }) : undefined;
      const record = await marker(documentId), putting = capability.put(record);
      const putFailure = writeFailure(putting, nativeCause);
      try {
        if (phase === "parse") await parsedReady.promise;
        else await vi.waitFor(() => expect(disk.io.put).toHaveBeenCalledTimes(1));
        attempt.rejectRequest(nativeCause);
        await Promise.resolve(); await Promise.resolve();
        const denied = session.retain(documentId);
        try { expect(denied).toBeUndefined(); } finally { denied?.release(); }
        await writeFailure(capability.put(record), nativeCause);
        capability.release();
        let closed = false;
        const closing = writeFailure(session.close(), nativeCause).then(failure => { closed = true; return failure; });
        await Promise.resolve(); await Promise.resolve();
        expect(closed).toBe(false); expect(attempt.callbackFinished).toBe(false);
        if (phase === "parse") { expect(disk.io.put).not.toHaveBeenCalled(); releaseParse.resolve(); }
        else releaseIo.resolve();
        await putFailure; await attempt.callbackDone; await closing;
        expect(closed).toBe(true); expect(attempt.requestFinished).toBe(true);
        if (phase === "parse") {
          expect(disk.io.put).not.toHaveBeenCalled(); expect(disk.entries).toHaveLength(0);
        } else {
          // Native loss cannot undo I/O that was already delegated. The public
          // failure reports uncertainty even though this controlled I/O committed.
          expect(disk.entries).toHaveLength(1); expect(disk.entries[0].artifact).toEqual(record);
        }
      } finally {
        releaseParse.resolve(); releaseIo.resolve(); capability.release();
        const closing = session.close().catch(() => undefined);
        await putting.catch(() => undefined); await putFailure.catch(() => undefined);
        await attempt.callbackDone; await attempt.settleRequest(); await closing; parser?.mockRestore();
      }
    }
  });

  it("rejects native loss at acquisition delivery and quiesces grants without returning a dead session", async () => {
    for (const timing of ["inside-request", "after-request"] as const) {
      const locks = new ControlledLocks(), disk = storage(), nativeCause = new Error("native acquisition loss " + timing);
      if (timing === "inside-request") {
        locks.onRequest = attempt => { attempt.grant(); attempt.rejectRequest(nativeCause); };
      }
      const acquiring = acquireBuildingSourceCheckpointWriter({ documentId: "delivery-" + timing, locks, createPersistence: disk.factory });
      const attempt = locks.attempts[0];
      if (!attempt) throw new Error("Expected the native request to start synchronously.");
      if (timing === "after-request") { attempt.grant(); attempt.rejectRequest(nativeCause); }
      let delivered: BuildingSourceCheckpointWriterSession | undefined;
      const delivery = acquiring.then(session => { delivered = session; return session; });
      try {
        await writeFailure(delivery, nativeCause);
        expect(delivered).toBeUndefined();
        expect(disk.factory).toHaveBeenCalledTimes(1); expect(disk.io.put).not.toHaveBeenCalled();
        expect(attempt.requestFinished).toBe(true);
        await vi.waitFor(() => expect(attempt.callbackFinished).toBe(true));
        await attempt.callbackDone;
      } finally {
        // A wrongly delivered session still has a public cleanup path, so a
        // failed delivery assertion does not strand the controlled callback.
        if (delivered) await finish(delivered, attempt);
        else if (attempt.callbackFinished) { await attempt.callbackDone; await attempt.settleRequest(); }
      }
    }
  });
});
