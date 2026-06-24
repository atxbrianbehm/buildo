import { z } from "zod";

export const CachedArtifactEntrySchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  artifactType: z.string().min(1),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  dependencies: z.array(z.string()),
  createdAt: z.string().min(1),
  artifact: z.unknown()
});

export type CachedArtifactEntry<T = unknown> = Omit<z.infer<typeof CachedArtifactEntrySchema>, "artifact"> & {
  artifact: T;
};

export interface ArtifactCacheOptions {
  now?: () => string;
}

export interface PutArtifactInput<T> {
  artifactType: string;
  requestHash: string;
  contentHash: string;
  dependencies?: string[];
  artifact: T;
}

export interface GetOrCreateArtifactInput {
  artifactType: string;
  requestHash: string;
}

export interface ArtifactFactoryResult<T> {
  contentHash: string;
  dependencies?: string[];
  artifact: T;
}

export interface GetOrCreateArtifactResult<T> {
  cacheHit: boolean;
  entry: CachedArtifactEntry<T>;
}

function cacheKey(artifactType: string, requestHash: string): string {
  return `${artifactType}:${requestHash}`;
}

export function parseCachedArtifactEntry<T>(entry: unknown): CachedArtifactEntry<T> {
  const result = CachedArtifactEntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`Invalid cached artifact: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  return result.data as CachedArtifactEntry<T>;
}

export class InMemoryArtifactCache<T = unknown> {
  private readonly now: () => string;
  private readonly byRequestHash = new Map<string, CachedArtifactEntry<T>>();
  private readonly byContentHash = new Map<string, CachedArtifactEntry<T>>();

  constructor(options: ArtifactCacheOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  static restore<T = unknown>(entries: unknown[], options: ArtifactCacheOptions = {}): InMemoryArtifactCache<T> {
    const cache = new InMemoryArtifactCache<T>(options);
    for (const entry of entries) {
      cache.index(parseCachedArtifactEntry<T>(entry));
    }
    return cache;
  }

  put(input: PutArtifactInput<T>): CachedArtifactEntry<T> {
    const entry = parseCachedArtifactEntry<T>({
      schemaVersion: "0.1.0",
      artifactType: input.artifactType,
      requestHash: input.requestHash,
      contentHash: input.contentHash,
      dependencies: input.dependencies ?? [],
      createdAt: this.now(),
      artifact: input.artifact
    });
    this.index(entry);
    return entry;
  }

  get(artifactType: string, requestHash: string): CachedArtifactEntry<T> | undefined {
    return this.byRequestHash.get(cacheKey(artifactType, requestHash));
  }

  getByContentHash(contentHash: string): CachedArtifactEntry<T> | undefined {
    return this.byContentHash.get(contentHash);
  }

  list(): CachedArtifactEntry<T>[] {
    return Array.from(this.byRequestHash.values());
  }

  async getOrCreate(
    input: GetOrCreateArtifactInput,
    factory: () => Promise<ArtifactFactoryResult<T>>
  ): Promise<GetOrCreateArtifactResult<T>> {
    const existing = this.get(input.artifactType, input.requestHash);
    if (existing) {
      return { cacheHit: true, entry: existing };
    }

    const result = await factory();
    const entry = this.put({
      artifactType: input.artifactType,
      requestHash: input.requestHash,
      contentHash: result.contentHash,
      dependencies: result.dependencies,
      artifact: result.artifact
    });
    return { cacheHit: false, entry };
  }

  private index(entry: CachedArtifactEntry<T>): void {
    this.byRequestHash.set(cacheKey(entry.artifactType, entry.requestHash), entry);
    this.byContentHash.set(entry.contentHash, entry);
  }
}
