import type { RemoteMaterialSourceArtifact } from "./openAIImageMaterialProvider";

export interface RemoteMaterialArtifactCache {
  get(requestHash: string): RemoteMaterialSourceArtifact | undefined;
  set(artifact: RemoteMaterialSourceArtifact): void;
}

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

export const defaultRemoteMaterialArtifactCache = createInMemoryRemoteMaterialArtifactCache();
