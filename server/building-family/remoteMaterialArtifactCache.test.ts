// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteMaterialSourceArtifact } from "./openAIImageMaterialProvider";
import { createDurableRemoteMaterialArtifactCache } from "./remoteMaterialArtifactCache";

const tempDirs: string[] = [];

function tempCacheFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "buildo-remote-material-cache-"));
  tempDirs.push(dir);
  return join(dir, "remote-material-cache.json");
}

function artifactFixture(overrides: Partial<RemoteMaterialSourceArtifact> = {}): RemoteMaterialSourceArtifact {
  return {
    schemaVersion: "0.1.0",
    sourceId: "source.wall.primary",
    providerId: "openai-image",
    image: {
      format: "png",
      b64Json: Buffer.from("png:durable-cache").toString("base64")
    },
    revisedPrompt: "durable cached masonry prompt",
    requestHash: "request-hash-durable",
    contentHash: "content-hash-durable",
    provenance: {
      providerId: "openai-image",
      model: "gpt-image-test",
      endpoint: "https://api.openai.com/v1/images/generations",
      prompt: "Generate masonry detail.",
      promptVocabulary: ["masonry", "patina"],
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      outputFormat: "png",
      quality: "low"
    },
    ...overrides
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("durable remote material artifact cache", () => {
  it("persists schema-versioned artifacts and restores them in a new cache instance", () => {
    const filePath = tempCacheFile();
    const artifact = artifactFixture();
    const cache = createDurableRemoteMaterialArtifactCache({ filePath });

    cache.set(artifact);
    artifact.image.b64Json = "mutated-after-set";

    expect(existsSync(filePath)).toBe(true);
    const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as {
      schemaVersion: string;
      artifacts: RemoteMaterialSourceArtifact[];
    };
    expect(snapshot.schemaVersion).toBe("0.1.0");
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0].image.b64Json).not.toBe("mutated-after-set");

    const restoredCache = createDurableRemoteMaterialArtifactCache({ filePath });
    const restoredArtifact = restoredCache.get(artifact.requestHash);

    expect(restoredArtifact).toEqual(snapshot.artifacts[0]);
    restoredArtifact!.image.b64Json = "mutated-after-get";
    expect(restoredCache.get(artifact.requestHash)?.image.b64Json).toBe(snapshot.artifacts[0].image.b64Json);
  });

  it("ignores invalid persisted snapshots and rewrites a valid snapshot on the next set", () => {
    const filePath = tempCacheFile();
    writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: "0.1.0",
        artifacts: [{ schemaVersion: "0.1.0", requestHash: "invalid-artifact" }]
      })
    );

    const cache = createDurableRemoteMaterialArtifactCache({ filePath });
    expect(cache.get("invalid-artifact")).toBeUndefined();

    const artifact = artifactFixture({ requestHash: "request-hash-rewritten" });
    cache.set(artifact);

    const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as { artifacts: RemoteMaterialSourceArtifact[] };
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0].requestHash).toBe("request-hash-rewritten");
  });
});
