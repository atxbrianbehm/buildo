import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { RemoteMaterialSourceArtifact } from "./openAIImageMaterialProvider";

export interface RemoteMaterialArtifactCache {
  get(requestHash: string): RemoteMaterialSourceArtifact | undefined;
  set(artifact: RemoteMaterialSourceArtifact): void;
}

export interface DurableRemoteMaterialArtifactCacheOptions {
  filePath: string;
}

const RemoteMaterialSourceArtifactSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  sourceId: z.string().min(1),
  providerId: z.literal("openai-image"),
  image: z.object({
    format: z.literal("png"),
    b64Json: z.string().min(1)
  }),
  revisedPrompt: z.string().optional(),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  provenance: z.object({
    providerId: z.literal("openai-image"),
    model: z.string().min(1),
    endpoint: z.literal("https://api.openai.com/v1/images/generations"),
    prompt: z.string().min(1),
    promptVocabulary: z.array(z.string().min(1)),
    seedPath: z.string().min(1),
    outputFormat: z.literal("png"),
    quality: z.literal("low")
  })
});

const RemoteMaterialArtifactCacheSnapshotSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  artifacts: z.array(RemoteMaterialSourceArtifactSchema)
});

function cloneArtifact(artifact: RemoteMaterialSourceArtifact): RemoteMaterialSourceArtifact {
  return structuredClone(artifact);
}

export function createInMemoryRemoteMaterialArtifactCache(): RemoteMaterialArtifactCache {
  const artifactsByRequestHash = new Map<string, RemoteMaterialSourceArtifact>();

  return {
    get(requestHash) {
      const artifact = artifactsByRequestHash.get(requestHash);
      return artifact ? cloneArtifact(artifact) : undefined;
    },
    set(artifact) {
      artifactsByRequestHash.set(artifact.requestHash, cloneArtifact(artifact));
    }
  };
}

function readDurableArtifacts(filePath: string): RemoteMaterialSourceArtifact[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = RemoteMaterialArtifactCacheSnapshotSchema.safeParse(
      JSON.parse(readFileSync(filePath, "utf8"))
    );
    return parsed.success ? parsed.data.artifacts.map(cloneArtifact) : [];
  } catch {
    return [];
  }
}

function writeDurableArtifacts(
  filePath: string,
  artifactsByRequestHash: Map<string, RemoteMaterialSourceArtifact>
): void {
  const artifacts = [...artifactsByRequestHash.values()]
    .sort((left, right) => left.requestHash.localeCompare(right.requestHash))
    .map(cloneArtifact);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: "0.1.0",
        artifacts
      },
      null,
      2
    )
  );
}

export function createDurableRemoteMaterialArtifactCache(
  options: DurableRemoteMaterialArtifactCacheOptions
): RemoteMaterialArtifactCache {
  const artifactsByRequestHash = new Map<string, RemoteMaterialSourceArtifact>();
  for (const artifact of readDurableArtifacts(options.filePath)) {
    artifactsByRequestHash.set(artifact.requestHash, cloneArtifact(artifact));
  }

  return {
    get(requestHash) {
      const artifact = artifactsByRequestHash.get(requestHash);
      return artifact ? cloneArtifact(artifact) : undefined;
    },
    set(artifact) {
      artifactsByRequestHash.set(artifact.requestHash, cloneArtifact(artifact));
      writeDurableArtifacts(options.filePath, artifactsByRequestHash);
    }
  };
}

export const defaultRemoteMaterialArtifactCache = createInMemoryRemoteMaterialArtifactCache();
