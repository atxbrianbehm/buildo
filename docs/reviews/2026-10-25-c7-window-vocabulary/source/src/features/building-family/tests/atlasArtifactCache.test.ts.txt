import { InMemoryArtifactCache } from "../materials/artifactCache";

describe("InMemoryArtifactCache", () => {
  it("stores schema-versioned artifacts by request hash and content hash", () => {
    const cache = new InMemoryArtifactCache<{ label: string }>({
      now: () => "2026-06-24T00:00:00.000Z"
    });
    const entry = cache.put({
      artifactType: "packedAtlas",
      requestHash: "request-a",
      contentHash: "content-a",
      dependencies: ["source-a", "source-b"],
      artifact: { label: "atlas-a" }
    });

    expect(entry.schemaVersion).toBe("0.1.0");
    expect(entry.createdAt).toBe("2026-06-24T00:00:00.000Z");
    expect(entry.dependencies).toEqual(["source-a", "source-b"]);
    expect(cache.get("packedAtlas", "request-a")?.artifact).toEqual({ label: "atlas-a" });
    expect(cache.getByContentHash("content-a")?.requestHash).toBe("request-a");
    expect(cache.list().map((cached) => cached.contentHash)).toEqual(["content-a"]);
  });

  it("returns cache hits without recomputing the artifact factory", async () => {
    const cache = new InMemoryArtifactCache<{ value: number }>({
      now: () => "2026-06-24T00:00:00.000Z"
    });
    let calls = 0;

    const first = await cache.getOrCreate(
      {
        artifactType: "materialSource",
        requestHash: "material-request"
      },
      async () => {
        calls += 1;
        return {
          contentHash: "material-content",
          dependencies: [],
          artifact: { value: 7 }
        };
      }
    );
    const second = await cache.getOrCreate(
      {
        artifactType: "materialSource",
        requestHash: "material-request"
      },
      async () => {
        calls += 1;
        return {
          contentHash: "other-content",
          dependencies: [],
          artifact: { value: 9 }
        };
      }
    );

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.entry.artifact).toEqual({ value: 7 });
    expect(calls).toBe(1);
  });

  it("validates restored cache entry metadata before accepting serialized artifacts", () => {
    const cache = InMemoryArtifactCache.restore([
      {
        schemaVersion: "0.1.0",
        artifactType: "atlasDebugExport",
        requestHash: "export-request",
        contentHash: "export-content",
        dependencies: ["atlas-content"],
        createdAt: "2026-06-24T00:00:00.000Z",
        artifact: { channelCount: 5 }
      }
    ]);

    expect(cache.get("atlasDebugExport", "export-request")?.artifact).toEqual({ channelCount: 5 });
    expect(() =>
      InMemoryArtifactCache.restore([
        {
          schemaVersion: "9.9.9",
          artifactType: "atlasDebugExport",
          requestHash: "export-request",
          contentHash: "export-content",
          dependencies: [],
          createdAt: "2026-06-24T00:00:00.000Z",
          artifact: {}
        }
      ])
    ).toThrow(/Invalid cached artifact/);
  });
});
