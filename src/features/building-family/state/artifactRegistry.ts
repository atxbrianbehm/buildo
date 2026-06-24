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
}

export class BuildingArtifactRegistry {
  private readonly now: () => string;
  private readonly artifacts = new Map<string, BuildingArtifactRecord<unknown>>();

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

  dispose(artifactId: string): boolean {
    const record = this.artifacts.get(artifactId);
    if (!record) {
      return false;
    }

    record.dispose?.();
    this.artifacts.delete(artifactId);
    return true;
  }

  clear(): void {
    for (const artifactId of Array.from(this.artifacts.keys())) {
      this.dispose(artifactId);
    }
  }
}
