import {
  applyRemoteMaterialRouteOverlays,
  type RemoteMaterialImageRequester
} from "../state/remoteMaterialApplicationCoordinator";
import type { RemoteMaterialImageArtifact } from "../materials/remoteMaterialImageBridge";
import type {
  MaterialSourceArtifact,
  MaterialSourceRequest,
  PixelLayer
} from "../materials/providers/proceduralMaterialProvider";

function makeLayer(
  widthPx: number,
  heightPx: number,
  rgba: [number, number, number, number]
): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { widthPx, heightPx, channels: "rgba8", data };
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const index = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(index, index + 4));
}

function sourceRequest(): MaterialSourceRequest {
  return {
    sourceId: "source.wall.primary",
    role: "wall",
    selectedFamily: "running-bond-brick",
    periodicity: "xy",
    physicalSizeM: { width: 18, height: 14 },
    seedPath: "atlas/source/wall.primary/running-bond-brick",
    promptVocabulary: ["running-bond-brick", "primary wall material"],
    widthPx: 4,
    heightPx: 2
  };
}

function proceduralArtifact(): MaterialSourceArtifact {
  return {
    sourceId: "source.wall.primary",
    providerId: "procedural",
    widthPx: 4,
    heightPx: 2,
    layers: {
      baseColor: makeLayer(4, 2, [100, 100, 100, 255]),
      height: makeLayer(4, 2, [80, 80, 80, 255]),
      roughness: makeLayer(4, 2, [190, 190, 190, 255])
    },
    requestHash: "procedural-request-hash",
    contentHash: "procedural-content-hash",
    provenance: {
      providerId: "procedural",
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      promptVocabulary: ["running-bond-brick"],
      algorithm: "test-procedural"
    }
  };
}

function remoteArtifact(): RemoteMaterialImageArtifact {
  return {
    schemaVersion: "0.1.0",
    sourceId: "source.wall.primary",
    providerId: "openai-image",
    image: {
      format: "png",
      b64Json: "remote-png-b64"
    },
    revisedPrompt: "revised masonry overlay prompt",
    requestHash: "remote-source-request-hash",
    contentHash: "remote-source-content-hash",
    provenance: {
      providerId: "openai-image",
      model: "gpt-image-test",
      endpoint: "https://api.openai.com/v1/images/generations",
      prompt: "remote masonry prompt",
      promptVocabulary: ["running-bond-brick", "patina"],
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      outputFormat: "png",
      quality: "low"
    }
  };
}

describe("remote material application coordinator", () => {
  it("composites generated remote image artifacts over procedural material sources", async () => {
    const routeCalls: Array<{ runId: string; requests: MaterialSourceRequest[] }> = [];
    const requestRemoteImages: RemoteMaterialImageRequester = async (input) => {
      routeCalls.push(input);
      return {
        schemaVersion: "0.1.0",
        status: "generated",
        providerId: "openai-image",
        requestHash: "route-request-hash",
        acceptedRequestCount: 1,
        cacheStatus: "miss",
        artifacts: [remoteArtifact()],
        diagnostics: []
      };
    };

    const result = await applyRemoteMaterialRouteOverlays({
      runId: "remote-application-run",
      requests: [sourceRequest()],
      proceduralArtifacts: [proceduralArtifact()],
      requestRemoteImages,
      decodePngLayer: async (input) => {
        expect(input).toEqual({
          b64Json: "remote-png-b64",
          widthPx: 4,
          heightPx: 2
        });
        return makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128]);
      }
    });

    expect(routeCalls).toEqual([{ runId: "remote-application-run", requests: [sourceRequest()] }]);
    expect(result.diagnostics).toEqual([]);
    expect(result.route).toEqual(
      expect.objectContaining({
        status: "generated",
        providerId: "openai-image",
        requestHash: "route-request-hash",
        cacheStatus: "miss",
        acceptedRequestCount: 1
      })
    );
    expect(result.remoteSources).toEqual([
      {
        sourceId: "source.wall.primary",
        providerId: "openai-image",
        requestHash: "remote-source-request-hash",
        contentHash: "remote-source-content-hash",
        revisedPrompt: "revised masonry overlay prompt"
      }
    ]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].providerId).toBe("procedural+remote-overlay");
    expect(pixel(result.artifacts[0].layers.baseColor, 0, 0)).toEqual([150, 75, 50, 255]);
    expect(result.artifacts[0].layers.height?.data).toEqual(proceduralArtifact().layers.height?.data);
    expect(result.artifacts[0].layers.roughness?.data).toEqual(proceduralArtifact().layers.roughness?.data);
  });

  it("keeps procedural artifacts and records diagnostics when the route falls back", async () => {
    let decodeCallCount = 0;
    const routeDiagnostic = {
      code: "remoteMaterialProvider.disabled",
      message: "Remote material provider is disabled; procedural material generation should be used.",
      severity: "warning" as const
    };

    const result = await applyRemoteMaterialRouteOverlays({
      runId: "remote-application-fallback-run",
      requests: [sourceRequest()],
      proceduralArtifacts: [proceduralArtifact()],
      requestRemoteImages: async () => ({
        schemaVersion: "0.1.0",
        status: "fallback",
        providerId: "procedural",
        requestHash: "fallback-route-hash",
        acceptedRequestCount: 1,
        cacheStatus: "not-checked",
        diagnostics: [routeDiagnostic]
      }),
      decodePngLayer: async (input) => {
        decodeCallCount += 1;
        return makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128]);
      }
    });

    expect(decodeCallCount).toBe(0);
    expect(result.artifacts).toEqual([proceduralArtifact()]);
    expect(result.remoteSources).toEqual([]);
    expect(result.diagnostics).toEqual([routeDiagnostic]);
    expect(result.route).toEqual({
      schemaVersion: "0.1.0",
      status: "fallback",
      providerId: "procedural",
      requestHash: "fallback-route-hash",
      acceptedRequestCount: 1,
      cacheStatus: "not-checked"
    });
  });

  it("forwards the caller abort signal to the remote image requester", async () => {
    const abortController = new AbortController();
    const routeCalls: Array<{ runId: string; requests: MaterialSourceRequest[]; signal?: AbortSignal }> = [];

    await applyRemoteMaterialRouteOverlays({
      runId: "remote-application-signal-run",
      requests: [sourceRequest()],
      proceduralArtifacts: [proceduralArtifact()],
      signal: abortController.signal,
      requestRemoteImages: async (input) => {
        routeCalls.push(input);
        return {
          schemaVersion: "0.1.0",
          status: "fallback",
          providerId: "procedural",
          requestHash: "fallback-route-hash",
          acceptedRequestCount: 1,
          cacheStatus: "not-checked",
          diagnostics: []
        };
      },
      decodePngLayer: async (input) => makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128])
    });

    expect(routeCalls).toEqual([
      {
        runId: "remote-application-signal-run",
        requests: [sourceRequest()],
        signal: abortController.signal
      }
    ]);
  });

  it("records a diagnostic when a generated route response omits a requested source", async () => {
    const result = await applyRemoteMaterialRouteOverlays({
      runId: "remote-application-missing-source-run",
      requests: [sourceRequest()],
      proceduralArtifacts: [proceduralArtifact()],
      requestRemoteImages: async () => ({
        schemaVersion: "0.1.0",
        status: "generated",
        providerId: "openai-image",
        requestHash: "route-request-hash",
        acceptedRequestCount: 1,
        cacheStatus: "miss",
        artifacts: [],
        diagnostics: []
      }),
      decodePngLayer: async (input) => makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128])
    });

    expect(result.artifacts).toEqual([proceduralArtifact()]);
    expect(result.remoteSources).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialApplicationCoordinator.missingRemoteArtifact",
        severity: "warning",
        path: "sources.source.wall.primary"
      })
    );
  });
});
