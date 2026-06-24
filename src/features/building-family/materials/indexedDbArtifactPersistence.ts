import { z } from "zod";
import {
  CachedArtifactEntrySchema,
  parseCachedArtifactEntry,
  type CachedArtifactEntry
} from "./artifactCache";

const defaultDatabaseName = "buildo-building-family-artifacts";
const defaultStoreName = "cachedArtifacts";
const defaultSchemaVersion = "0.1.0";

const IndexedDbArtifactRecordSchema = z.object({
  key: z.string().min(1),
  entry: CachedArtifactEntrySchema
});

interface IndexedDbArtifactRecord<T = unknown> {
  key: string;
  entry: CachedArtifactEntry<T>;
}

export interface IndexedDbArtifactPersistenceOptions {
  databaseName?: string;
  storeName?: string;
  indexedDb?: IDBFactory;
}

export interface IndexedDbArtifactPersistence {
  put<T>(entry: CachedArtifactEntry<T>): Promise<void>;
  get<T>(
    artifactType: string,
    requestHash: string,
    schemaVersion?: CachedArtifactEntry["schemaVersion"]
  ): Promise<CachedArtifactEntry<T> | undefined>;
  list<T>(): Promise<Array<CachedArtifactEntry<T>>>;
}

export function indexedDbArtifactCacheKey(input: Pick<CachedArtifactEntry, "schemaVersion" | "artifactType" | "requestHash">): string {
  return `${input.schemaVersion}:${input.artifactType}:${input.requestHash}`;
}

function indexedDbFactory(options: IndexedDbArtifactPersistenceOptions): IDBFactory {
  const factory = options.indexedDb ?? globalThis.indexedDB;
  if (!factory) {
    throw new Error("IndexedDB artifact persistence requires a browser indexedDB implementation.");
  }

  return factory;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB artifact request failed."));
  });
}

function parseRecord<T>(record: unknown): IndexedDbArtifactRecord<T> | undefined {
  if (record === undefined) {
    return undefined;
  }

  const result = IndexedDbArtifactRecordSchema.safeParse(record);
  if (!result.success) {
    throw new Error(`Invalid persisted artifact record: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return {
    key: result.data.key,
    entry: parseCachedArtifactEntry<T>(result.data.entry)
  };
}

export function createIndexedDbArtifactPersistence(
  options: IndexedDbArtifactPersistenceOptions = {}
): IndexedDbArtifactPersistence {
  const databaseName = options.databaseName ?? defaultDatabaseName;
  const storeName = options.storeName ?? defaultStoreName;
  const factory = indexedDbFactory(options);
  let databasePromise: Promise<IDBDatabase> | undefined;

  function openDatabase(): Promise<IDBDatabase> {
    databasePromise ??= new Promise((resolve, reject) => {
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB artifact database failed to open."));
    });
    return databasePromise;
  }

  async function objectStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await openDatabase();
    return database.transaction(storeName, mode).objectStore(storeName);
  }

  return {
    async put(entry) {
      const store = await objectStore("readwrite");
      await requestToPromise(
        store.put({
          key: indexedDbArtifactCacheKey(entry),
          entry: structuredClone(entry)
        })
      );
    },
    async get<T>(
      artifactType: string,
      requestHash: string,
      schemaVersion: CachedArtifactEntry["schemaVersion"] = defaultSchemaVersion
    ) {
      const store = await objectStore("readonly");
      const record = parseRecord<T>(await requestToPromise(store.get(`${schemaVersion}:${artifactType}:${requestHash}`)));
      return record?.entry;
    },
    async list<T>() {
      const store = await objectStore("readonly");
      const records = await requestToPromise(store.getAll());
      return records
        .map((record) => parseRecord<T>(record)?.entry)
        .filter((entry): entry is CachedArtifactEntry<T> => entry !== undefined)
        .sort((left, right) => indexedDbArtifactCacheKey(left).localeCompare(indexedDbArtifactCacheKey(right)));
    }
  };
}
