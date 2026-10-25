import { requestRemoteMaterialImages } from "../state/remoteMaterialRouteClient";
import type { MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";

function sourceRequest(): MaterialSourceRequest {
  return {
    sourceId: "source.wall.primary",
    role: "wall",
    selectedFamily: "running-bond-brick",
    periodicity: "xy",
    physicalSizeM: { width: 18, height: 14 },
    seedPath: "atlas/source/wall.primary/running-bond-brick",
    promptVocabulary: ["running-bond-brick", "primary wall material"],
    widthPx: 256,
    heightPx: 256
  };
}

describe("remote material route client", () => {
  it("posts a schema-versioned request batch and preserves generated image artifacts", async () => {
    const fetchCalls: Array<{ input: string; init: RequestInit }> = [];
    const responseArtifact = {
      schemaVersion: "0.1.0",
      sourceId: "source.wall.primary",
      providerId: "openai-image",
      image: {
        format: "png",
        b64Json: "remote-png-b64"
      },
      revisedPrompt: "revised masonry overlay prompt",
      requestHash: "source-request-hash",
      contentHash: "source-content-hash",
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

    const result = await requestRemoteMaterialImages(
      { runId: "route-client-run", requests: [sourceRequest()] },
      {
        fetcher: async (input, init) => {
          fetchCalls.push({ input: String(input), init: init ?? {} });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "0.1.0",
              status: "generated",
              providerId: "openai-image",
              requestHash: "route-request-hash",
              acceptedRequestCount: 1,
              cacheStatus: "miss",
              artifacts: [responseArtifact],
              diagnostics: []
            })
          } as Response;
        }
      }
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].input).toBe("/api/building-material-provider");
    expect(fetchCalls[0].init.method).toBe("POST");
    expect(fetchCalls[0].init.headers).toEqual(
      expect.objectContaining({
        "content-type": "application/json"
      })
    );
    expect(JSON.parse(String(fetchCalls[0].init.body))).toEqual({
      schemaVersion: "0.1.0",
      runId: "route-client-run",
      outputFormat: "rgba8-layer-set",
      requests: [sourceRequest()]
    });
    expect(result).toEqual({
      schemaVersion: "0.1.0",
      status: "generated",
      providerId: "openai-image",
      requestHash: "route-request-hash",
      acceptedRequestCount: 1,
      cacheStatus: "miss",
      artifacts: [responseArtifact],
      diagnostics: []
    });
  });

  it("passes the caller abort signal into the hosted route fetch", async () => {
    const abortController = new AbortController();
    const fetchCalls: Array<{ input: string; init: RequestInit }> = [];

    await requestRemoteMaterialImages(
      { runId: "route-client-signal-run", requests: [sourceRequest()], signal: abortController.signal },
      {
        fetcher: async (input, init) => {
          fetchCalls.push({ input: String(input), init: init ?? {} });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "0.1.0",
              status: "fallback",
              providerId: "procedural",
              requestHash: "route-fallback-hash",
              acceptedRequestCount: 1,
              cacheStatus: "not-checked",
              diagnostics: []
            })
          } as Response;
        }
      }
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].init.signal).toBe(abortController.signal);
  });

  it("preserves route fallback diagnostics without image artifacts", async () => {
    const result = await requestRemoteMaterialImages(
      { runId: "route-client-fallback-run", requests: [sourceRequest()] },
      {
        fetcher: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "0.1.0",
              status: "fallback",
              providerId: "procedural",
              requestHash: "route-fallback-hash",
              acceptedRequestCount: 1,
              cacheStatus: "not-checked",
              diagnostics: [
                {
                  code: "remoteMaterialProvider.disabled",
                  message: "Remote material provider is disabled; procedural material generation should be used.",
                  severity: "warning"
                }
              ]
            })
          }) as Response
      }
    );

    expect(result).toEqual({
      schemaVersion: "0.1.0",
      status: "fallback",
      providerId: "procedural",
      requestHash: "route-fallback-hash",
      acceptedRequestCount: 1,
      cacheStatus: "not-checked",
      diagnostics: [
        {
          code: "remoteMaterialProvider.disabled",
          message: "Remote material provider is disabled; procedural material generation should be used.",
          severity: "warning"
        }
      ]
    });
  });

  it("preserves rejected route diagnostics for invalid remote request batches", async () => {
    const result = await requestRemoteMaterialImages(
      { runId: "route-client-rejected-run", requests: [sourceRequest()] },
      {
        fetcher: async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({
              schemaVersion: "0.1.0",
              status: "rejected",
              diagnostics: [
                {
                  code: "remoteMaterialProvider.unsupportedSource",
                  message: "Remote material generation is not approved for source.glass.primary.",
                  severity: "error",
                  path: "requests.0.sourceId",
                  received: "source.glass.primary"
                }
              ]
            })
          }) as Response
      }
    );

    expect(result).toEqual({
      schemaVersion: "0.1.0",
      status: "rejected",
      diagnostics: [
        {
          code: "remoteMaterialProvider.unsupportedSource",
          message: "Remote material generation is not approved for source.glass.primary.",
          severity: "error",
          path: "requests.0.sourceId",
          received: "source.glass.primary"
        }
      ]
    });
  });

  it("returns a sanitized fallback diagnostic when the route request fails", async () => {
    const result = await requestRemoteMaterialImages(
      { runId: "route-client-network-failure-run", requests: [sourceRequest()] },
      {
        fetcher: async () => {
          throw new Error("network denied for secret-test-token");
        }
      }
    );

    expect(result).toEqual({
      schemaVersion: "0.1.0",
      status: "fallback",
      providerId: "procedural",
      requestHash: "unavailable",
      acceptedRequestCount: 1,
      cacheStatus: "not-checked",
      diagnostics: [
        {
          code: "remoteMaterialRouteClient.requestFailed",
          message: "Remote material route request failed; procedural material generation should be used.",
          severity: "warning"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("secret-test-token");
  });

  it("returns a sanitized fallback diagnostic when the route response is malformed", async () => {
    const result = await requestRemoteMaterialImages(
      { runId: "route-client-invalid-response-run", requests: [sourceRequest()] },
      {
        fetcher: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "0.1.0",
              status: "generated",
              providerId: "openai-image",
              requestHash: "",
              acceptedRequestCount: 1,
              cacheStatus: "miss",
              artifacts: [],
              diagnostics: [],
              debug: "secret-test-token"
            })
          }) as Response
      }
    );

    expect(result).toEqual({
      schemaVersion: "0.1.0",
      status: "fallback",
      providerId: "procedural",
      requestHash: "unavailable",
      acceptedRequestCount: 1,
      cacheStatus: "not-checked",
      diagnostics: [
        {
          code: "remoteMaterialRouteClient.invalidResponse",
          message: "Remote material route returned an invalid response; procedural material generation should be used.",
          severity: "warning"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("secret-test-token");
  });
});
