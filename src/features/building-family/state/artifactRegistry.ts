import { z } from "zod";

export const BuildingArtifactTypeSchema = z.enum([
  "psg-evaluation",
  "building-intent",
  "building-family-spec",
  "atlas-manifest",
  "material-source",
  "atlas-channel",
  "component-catalog",
  "building-graph",
  "runtime-building-ir",
  "assembly-hall-fixture"
]);

export const BuildingArtifactMetadataSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  artifactId: z.string().min(1),
  artifactType: BuildingArtifactTypeSchema,
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  dependencies: z.array(z.string()),
  createdAt: z.string().min(1)
});

export type BuildingArtifactType = z.infer<typeof BuildingArtifactTypeSchema>;
export type BuildingArtifactMetadata = z.infer<typeof BuildingArtifactMetadataSchema>;

export interface RegisterBuildingArtifactInput<T> {
  artifactId: string;
  artifactType: BuildingArtifactType;
  requestHash: string;
  contentHash: string;
  dependencies?: string[];
  artifact: T;
  dispose?: () => void;
}

export interface BuildingArtifactRegistryOptions {
  now?: () => string;
}

interface BuildingArtifactRecord<T> {
  metadata: BuildingArtifactMetadata;
  artifact: T;
  dispose?: () => void;
  owner?: OwnedArtifacts;
}

export interface PreparedBuildingArtifactOwner {
  readonly metadata: readonly BuildingArtifactMetadata[];
}

interface OwnedArtifacts {
  handle: PreparedBuildingArtifactOwner;
  records: Map<string, BuildingArtifactRecord<unknown>>;
  dispose: () => void;
  leases: number;
  published: boolean;
  retired: boolean;
  disposed: boolean;
}

export class BuildingArtifactRegistry {
  private readonly now: () => string;
  private artifacts = new Map<string, BuildingArtifactRecord<unknown>>();
  private readonly owners = new Set<OwnedArtifacts>();
  private readonly ownerHandles = new WeakMap<PreparedBuildingArtifactOwner, OwnedArtifacts>();

  constructor(options: BuildingArtifactRegistryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  register<T>(input: RegisterBuildingArtifactInput<T>): BuildingArtifactMetadata {
    if (this.artifacts.has(input.artifactId)) {
      throw new Error(`Building artifact already registered: ${input.artifactId}`);
    }

    const metadata = BuildingArtifactMetadataSchema.parse({
      schemaVersion: "0.1.0",
      artifactId: input.artifactId,
      artifactType: input.artifactType,
      requestHash: input.requestHash,
      contentHash: input.contentHash,
      dependencies: input.dependencies ?? [],
      createdAt: this.now()
    });
    this.artifacts.set(input.artifactId, {
      metadata,
      artifact: input.artifact,
      dispose: input.dispose
    });
    return metadata;
  }

  get<T>(artifactId: string): T | undefined {
    return this.artifacts.get(artifactId)?.artifact as T | undefined;
  }

  getMetadata(artifactId: string): BuildingArtifactMetadata | undefined {
    return this.artifacts.get(artifactId)?.metadata;
  }

  listMetadata(): BuildingArtifactMetadata[] {
    return Array.from(this.artifacts.values()).map((record) => record.metadata);
  }

  prepareOwnedArtifacts(input: {
    artifacts: ReadonlyArray<Omit<RegisterBuildingArtifactInput<unknown>, "dispose">>;
    dispose: () => void;
  }): PreparedBuildingArtifactOwner {
    const records = new Map<string, BuildingArtifactRecord<unknown>>();
    for (const artifact of input.artifacts) {
      if (records.has(artifact.artifactId)) throw new Error(`Duplicate owned artifact: ${artifact.artifactId}`);
      const metadata = BuildingArtifactMetadataSchema.parse({
        schemaVersion: "0.1.0",
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        requestHash: artifact.requestHash,
        contentHash: artifact.contentHash,
        dependencies: [...(artifact.dependencies ?? [])],
        createdAt: this.now()
      });
      Object.freeze(metadata.dependencies);
      Object.freeze(metadata);
      records.set(metadata.artifactId, { metadata, artifact: artifact.artifact });
    }
    if (!records.size) throw new Error("An artifact owner requires at least one artifact.");
    const handle = Object.freeze({ metadata: Object.freeze(Array.from(records.values(), (record) => record.metadata)) });
    const owner: OwnedArtifacts = { handle, records, dispose: input.dispose, leases: 0, published: false, retired: false, disposed: false };
    for (const record of records.values()) record.owner = owner;
    this.owners.add(owner);
    this.ownerHandles.set(handle, owner);
    return handle;
  }

  publishOwnedArtifacts(handle: PreparedBuildingArtifactOwner, previous?: PreparedBuildingArtifactOwner, beforePublish?: () => void): void {
    const owner = this.ownerFor(handle);
    const prior = previous ? this.ownerFor(previous) : undefined;
    if (owner.retired || owner.disposed || owner.published) throw new Error("Artifact owner cannot be published again.");
    const next = new Map(this.artifacts);
    for (const [id, record] of next) if (record.owner === prior && prior) next.delete(id);
    for (const [id, record] of owner.records) {
      if (next.has(id)) throw new Error(`Building artifact already registered: ${id}`);
      next.set(id, record);
    }
    // A prepared view may switch reversibly only after every alias is validated.
    beforePublish?.();
    // No user code remains between the view switch and visible alias replacement.
    this.artifacts = next;
    owner.published = true;
  }

  acquireOwnerLease(handle: PreparedBuildingArtifactOwner): () => void {
    const owner = this.ownerFor(handle);
    if (owner.disposed || (owner.retired && owner.leases === 0)) throw new Error("Artifact owner is no longer available to a viewer.");
    owner.leases += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      owner.leases -= 1;
      this.disposeRetiredOwner(owner);
    };
  }

  retireOwnedArtifacts(handle: PreparedBuildingArtifactOwner): void {
    const owner = this.ownerFor(handle);
    if (owner.retired) return;
    owner.retired = true;
    for (const [id, record] of this.artifacts) if (record.owner === owner) this.artifacts.delete(id);
    this.disposeRetiredOwner(owner);
  }

  private ownerFor(handle: PreparedBuildingArtifactOwner): OwnedArtifacts {
    const owner = this.ownerHandles.get(handle);
    if (!owner) throw new Error("Artifact owner does not belong to this registry.");
    return owner;
  }

  private disposeRetiredOwner(owner: OwnedArtifacts): void {
    if (!owner.retired || owner.leases || owner.disposed) return;
    owner.disposed = true;
    this.owners.delete(owner);
    owner.dispose();
  }

  dispose(artifactId: string): boolean {
    const record = this.artifacts.get(artifactId);
    if (!record) {
      return false;
    }
    if (record.owner) {
      this.retireOwnedArtifacts(record.owner.handle);
      return true;
    }
    this.artifacts.delete(artifactId);
    record.dispose?.();
    return true;
  }

  clear(): void {
    const standalone = Array.from(this.artifacts.values()).filter((record) => !record.owner);
    this.artifacts.clear();
    let failure: unknown;
    for (const owner of Array.from(this.owners)) {
      try { this.retireOwnedArtifacts(owner.handle); } catch (error) { failure ??= error; }
    }
    for (const record of standalone) {
      try { record.dispose?.(); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  }
}
