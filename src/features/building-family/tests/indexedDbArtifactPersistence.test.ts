import {
  createIndexedDbArtifactPersistence,
  indexedDbArtifactCacheKey
} from "../materials/indexedDbArtifactPersistence";
import type { CachedArtifactEntry } from "../materials/artifactCache";

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
  constructor(private readonly records: Map<string, unknown>) {}

  put(record: { key: string; entry: unknown }): FakeIdbRequest<string> {
    const request = new FakeIdbRequest<string>();
    this.records.set(record.key, structuredClone(record));
    request.succeed(record.key);
    return request;
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
  error: Error | null = null;

  constructor(private readonly store: FakeObjectStore) {
    queueMicrotask(() => this.oncomplete?.());
  }

  objectStore(): FakeObjectStore {
    return this.store;
  }
}

class FakeDatabase {
  readonly records = new Map<string, unknown>();
  readonly objectStoreNames = {
    contains: () => this.created
  };
  private created = false;

  createObjectStore(): FakeObjectStore {
    this.created = true;
    return new FakeObjectStore(this.records);
  }

  transaction(): FakeTransaction {
    this.created = true;
    return new FakeTransaction(new FakeObjectStore(this.records));
  }
}

class FakeOpenRequest extends FakeIdbRequest<FakeDatabase> {
  onupgradeneeded: (() => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly database = new FakeDatabase();

  open(): FakeOpenRequest {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      request.result = this.database;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
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
