import {
  createIndexedDbArtifactPersistence,
  indexedDbArtifactCacheKey
} from "../materials/indexedDbArtifactPersistence";
import type { CachedArtifactEntry } from "../materials/artifactCache";

interface FakeIndexedDbOptions {
  deferOpen?: boolean;
  manualTransactions?: boolean;
  throwAt?: "transaction" | "objectStore" | "put";
  failure?: Error;
  abortFailure?: Error;
}

interface FakeRecord {
  key: string;
  entry: unknown;
}

class FakeIdbRequest<T = unknown> {
  error: Error | null = null;
  result: T | undefined;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }
}

class FakeObjectStore {
  constructor(private readonly records: Map<string, unknown>, private readonly transaction?: FakeTransaction) {}

  put(record: FakeRecord): FakeIdbRequest<string> {
    if (!this.transaction) throw new Error("A write requires a transaction.");
    return this.transaction.enqueue(record);
  }

  get(key: string): FakeIdbRequest<unknown> {
    const request = new FakeIdbRequest<unknown>();
    request.succeed(structuredClone(this.records.get(key)));
    return request;
  }

  getAll(): FakeIdbRequest<unknown[]> {
    const request = new FakeIdbRequest<unknown[]>();
    request.succeed(Array.from(this.records.values()).map((record) => structuredClone(record)));
    return request;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;
  abortCalls = 0;
  readonly requests: FakeIdbRequest<string>[] = [];
  readonly written: Promise<void>;
  private notifyWritten!: () => void;
  private readonly staged = new Map<string, FakeRecord>();
  private state: "active" | "complete" | "aborted" = "active";

  constructor(private readonly records: Map<string, unknown>, private readonly options: FakeIndexedDbOptions) {
    this.written = new Promise(resolve => { this.notifyWritten = resolve; });
  }

  objectStore(): FakeObjectStore {
    if (this.options.throwAt === "objectStore") throw this.options.failure;
    return new FakeObjectStore(this.records, this);
  }

  enqueue(record: FakeRecord): FakeIdbRequest<string> {
    if (this.options.throwAt === "put") throw this.options.failure;
    const request = new FakeIdbRequest<string>();
    request.result = record.key;
    this.staged.set(record.key, structuredClone(record));
    this.requests.push(request);
    this.notifyWritten();
    if (!this.options.manualTransactions) {
      queueMicrotask(() => {
        this.succeedPut();
        queueMicrotask(() => this.commit());
      });
    }
    return request;
  }

  succeedPut(): void {
    for (const request of this.requests) request.onsuccess?.();
  }

  failPut(error: Error | null): void {
    const request = this.requests[0];
    if (!request) throw new Error("Expected a pending put request.");
    request.error = error;
    request.onerror?.();
    this.fail("abort", error);
  }

  commit(): void {
    if (this.state !== "active") return;
    this.state = "complete";
    for (const [key, value] of this.staged) this.records.set(key, value);
    this.staged.clear();
    this.oncomplete?.();
  }

  fail(kind: "abort" | "error", error: Error | null): void {
    if (this.state !== "active") return;
    this.state = "aborted";
    this.error = error;
    this.staged.clear();
    if (kind === "abort") this.onabort?.();
    else this.onerror?.();
  }

  abort(): void {
    this.abortCalls += 1;
    this.fail("abort", null);
    if (this.options.abortFailure) throw this.options.abortFailure;
  }
}

class FakeDatabase {
  readonly records = new Map<string, unknown>();
  readonly transactions: FakeTransaction[] = [];
  readonly objectStoreNames = { contains: () => this.created };
  private created = false;
  private consumedTransactions = 0;
  private readonly transactionWaiters: Array<(value: FakeTransaction) => void> = [];

  constructor(private readonly options: FakeIndexedDbOptions) {}

  createObjectStore(): FakeObjectStore {
    this.created = true;
    return new FakeObjectStore(this.records);
  }

  transaction(): FakeTransaction {
    if (this.options.throwAt === "transaction") throw this.options.failure;
    this.created = true;
    const transaction = new FakeTransaction(this.records, this.options);
    this.transactions.push(transaction);
    this.transactionWaiters.shift()?.(transaction);
    return transaction;
  }

  nextTransaction(): Promise<FakeTransaction> {
    const existing = this.transactions[this.consumedTransactions++];
    return existing ? Promise.resolve(existing) : new Promise(resolve => this.transactionWaiters.push(resolve));
  }
}

class FakeOpenRequest extends FakeIdbRequest<FakeDatabase> {
  onupgradeneeded: (() => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly database: FakeDatabase;
  openCalls = 0;
  private pendingOpen: FakeOpenRequest | undefined;

  constructor(private readonly options: FakeIndexedDbOptions = {}) {
    this.database = new FakeDatabase(options);
  }

  open(): FakeOpenRequest {
    this.openCalls += 1;
    const request = new FakeOpenRequest();
    this.pendingOpen = request;
    if (!this.options.deferOpen) queueMicrotask(() => this.finishOpen());
    return request;
  }

  finishOpen(): void {
    const request = this.pendingOpen;
    if (!request) throw new Error("Expected an open request.");
    this.pendingOpen = undefined;
    request.result = this.database;
    request.onupgradeneeded?.();
    request.onsuccess?.();
  }
}

function cachedEntry(): CachedArtifactEntry<{ label: string }> {
  return {
    schemaVersion: "0.1.0",
    artifactType: "packedAtlas",
    requestHash: "request-a",
    contentHash: "content-a",
    dependencies: ["source-a"],
    createdAt: "2026-06-24T00:00:00.000Z",
    artifact: { label: "atlas-a" }
  };
}

describe("IndexedDB artifact persistence", () => {
  it("keys cached artifacts by schema version, artifact type, and request hash", () => {
    expect(indexedDbArtifactCacheKey(cachedEntry())).toBe("0.1.0:packedAtlas:request-a");
  });

  it("stores and restores schema-versioned cached artifacts", async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });

    await store.put(cachedEntry());

    expect(await store.get("packedAtlas", "request-a")).toEqual(cachedEntry());
    expect((await store.list()).map((entry) => entry.contentHash)).toEqual(["content-a"]);
  });
});


describe("R3.P7 IndexedDB write ownership and commit acknowledgement", () => {
  it("captures the entire caller entry before a deferred database open without freezing the caller", async () => {
    const indexedDb = new FakeIndexedDbFactory({ deferOpen: true, manualTransactions: true });
    const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
    const pixels = new Uint8Array([91, 1, 2, 3, 92]).subarray(1, 4);
    const entry = { ...cachedEntry(), artifact: { label: "captured", nested: { value: "before" }, pixels } };
    const pending = store.put(entry);
    expect(indexedDb.openCalls).toBe(1);
    expect(indexedDb.database.transactions).toHaveLength(0);
    entry.artifactType = "changed-type";
    entry.requestHash = "changed-request";
    entry.contentHash = "changed-content";
    entry.createdAt = "changed-date";
    entry.dependencies.push("changed-dependency");
    entry.artifact.label = "changed";
    entry.artifact.nested.value = "after";
    pixels.fill(255);
    expect(Object.isFrozen(entry)).toBe(false);
    expect(Object.isFrozen(entry.dependencies)).toBe(false);
    expect(Object.isFrozen(entry.artifact.nested)).toBe(false);

    indexedDb.finishOpen();
    const transaction = await indexedDb.database.nextTransaction();
    await transaction.written;
    transaction.succeedPut();
    transaction.commit();
    await pending;
    const restored = await store.get<typeof entry.artifact>("packedAtlas", "request-a");
    expect(restored).toMatchObject({ ...cachedEntry(), artifact: { label: "captured", nested: { value: "before" } } });
    expect(restored?.artifact.pixels).not.toBe(pixels);
    expect(restored?.artifact.pixels.byteOffset).toBe(1);
    expect(Array.from(restored!.artifact.pixels)).toEqual([1, 2, 3]);
    expect(indexedDb.database.records.has("0.1.0:changed-type:changed-request")).toBe(false);
    expect(entry.artifact.nested.value).toBe("after");
    expect(Array.from(pixels)).toEqual([255, 255, 255]);
  });

  it("acknowledges only transaction completion and keeps concurrent acknowledgements independent", async () => {
    const indexedDb = new FakeIndexedDbFactory({ manualTransactions: true });
    const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
    const settled: string[] = [];
    const first = store.put(cachedEntry()).then(() => { settled.push("first"); });
    const secondEntry = { ...cachedEntry(), requestHash: "request-b" };
    const second = store.put(secondEntry).then(() => { settled.push("second"); });
    const firstTransaction = await indexedDb.database.nextTransaction();
    const secondTransaction = await indexedDb.database.nextTransaction();
    await Promise.all([firstTransaction.written, secondTransaction.written]);
    firstTransaction.succeedPut();
    secondTransaction.succeedPut();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toEqual([]);
    expect(indexedDb.database.records.size).toBe(0);
    secondTransaction.commit();
    await second;
    expect(settled).toEqual(["second"]);
    expect(indexedDb.database.records.has(indexedDbArtifactCacheKey(secondEntry))).toBe(true);
    expect(indexedDb.database.records.has(indexedDbArtifactCacheKey(cachedEntry()))).toBe(false);
    firstTransaction.commit();
    await first;
    expect(settled).toEqual(["second", "first"]);
    expect(await store.get("packedAtlas", "request-a")).toEqual(cachedEntry());
  });

  it("rejects late transaction aborts and errors after request success without replacing committed records", async () => {
    for (const kind of ["abort", "error"] as const) {
      for (const hasError of [true, false]) {
        const indexedDb = new FakeIndexedDbFactory({ manualTransactions: true });
        const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
        const previous = cachedEntry(), key = indexedDbArtifactCacheKey(previous);
        indexedDb.database.records.set(key, structuredClone({ key, entry: previous }));
        const nativeError = hasError ? new Error("late " + kind) : null;
        let settled = false;
        const outcome = store.put({ ...previous, contentHash: "uncommitted-content", artifact: { label: "uncommitted" } })
          .then(() => { settled = true; return undefined; }, error => { settled = true; return error as Error; });
        const transaction = await indexedDb.database.nextTransaction();
        await transaction.written;
        transaction.succeedPut();
        await Promise.resolve();
        await Promise.resolve();
        expect(settled).toBe(false);
        transaction.fail(kind, nativeError);
        const failure = await outcome;
        if (nativeError) expect(failure).toBe(nativeError);
        else expect(failure).toMatchObject({ message: kind === "abort" ? "IndexedDB artifact transaction aborted." : "IndexedDB artifact transaction failed." });
        transaction.commit();
        expect(await store.get("packedAtlas", "request-a")).toEqual(previous);
      }
    }
  });

  it("rejects a failed request with its own error before the automatic abort and preserves the prior record", async () => {
    for (const nativeError of [new Error("put request rejected"), null]) {
      const indexedDb = new FakeIndexedDbFactory({ manualTransactions: true });
      const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
      const previous = cachedEntry(), key = indexedDbArtifactCacheKey(previous);
      indexedDb.database.records.set(key, structuredClone({ key, entry: previous }));
      const outcome = store.put({ ...previous, contentHash: "uncommitted" }).then(() => undefined, error => error as Error);
      const transaction = await indexedDb.database.nextTransaction();
      await transaction.written;
      transaction.failPut(nativeError);
      const failure = await outcome;
      if (nativeError) expect(failure).toBe(nativeError);
      else expect(failure).toMatchObject({ message: "IndexedDB artifact request failed." });
      transaction.commit();
      expect(await store.get("packedAtlas", "request-a")).toEqual(previous);
    }
  });

  it("rejects synchronous transaction, store and put failures without orphaning a completion promise", async () => {
    for (const throwAt of ["transaction", "objectStore", "put"] as const) {
      const failure = new Error("synchronous " + throwAt), abortFailure = new Error("abort cleanup failure");
      const indexedDb = new FakeIndexedDbFactory({ manualTransactions: true, throwAt, failure, abortFailure });
      const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
      let settlements = 0;
      const outcome = store.put(cachedEntry()).then(() => { settlements += 1; return undefined; }, error => { settlements += 1; return error; });
      expect(await outcome).toBe(failure);
      expect(indexedDb.database.records.size).toBe(0);
      expect(indexedDb.database.transactions).toHaveLength(throwAt === "transaction" ? 0 : 1);
      const transaction = indexedDb.database.transactions[0];
      if (transaction) {
        expect(transaction.abortCalls).toBe(1);
        transaction.error = new Error("late transaction event");
        transaction.onerror?.();
        transaction.onabort?.();
        transaction.oncomplete?.();
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(settlements).toBe(1);
    }
  });

  it("rejects an uncloneable artifact before opening the database or creating a transaction", async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createIndexedDbArtifactPersistence({ indexedDb: indexedDb as unknown as IDBFactory });
    const entry = { ...cachedEntry(), artifact: { label: "caller", unsupported: () => "caller" } };
    await expect(store.put(entry)).rejects.toMatchObject({ name: "DataCloneError" });
    expect(indexedDb.openCalls).toBe(0);
    expect(indexedDb.database.transactions).toHaveLength(0);
    expect(Object.isFrozen(entry)).toBe(false);
    expect(entry.artifact.unsupported()).toBe("caller");
  });
});
