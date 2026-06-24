// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenAIImageTransportRequest } from "./openAIImageMaterialProvider";
import { approvedRemoteMaterialSourceIds, handleMaterialProviderRequest } from "./materialProviderRoute";
import { createInMemoryRemoteMaterialArtifactCache, type RemoteMaterialArtifactCache } from "./remoteMaterialArtifactCache";

const validPayload = {
  schemaVersion: "0.1.0",
  runId: "building-run-route-test",
  outputFormat: "rgba8-layer-set",
  requests: [
    {
      sourceId: "source.wall.primary",
      role: "wall",
      selectedFamily: "running-bond-brick",
      periodicity: "xy",
      physicalSizeM: { width: 18, height: 14 },
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      promptVocabulary: ["running-bond-brick", "primary wall material"],
      widthPx: 256,
      heightPx: 256
    }
  ]
};

function encodedPng(label: string): string {
  return Buffer.from(`png:${label}`).toString("base64");
}

function routeRequest(
  body: unknown,
  env: Record<string, string | undefined> = {},
  options: {
    openAITransport?: (request: OpenAIImageTransportRequest, signal: AbortSignal) => Promise<unknown>;
    remoteMaterialCache?: RemoteMaterialArtifactCache;
    remoteMaterialTimeoutMs?: number;
    remoteMaterialConcurrencyLimit?: number;
    remoteMaterialRetryCount?: number;
    signal?: AbortSignal;
  } = {}
): Promise<Response> {
  return handleMaterialProviderRequest(
    new Request("http://127.0.0.1/api/building-material-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal
    }),
    { env, ...options }
  );
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe("material provider route", () => {
  it("returns a procedural fallback diagnostic when the remote provider is not configured", async () => {
    const response = await routeRequest(validPayload);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        schemaVersion: "0.1.0",
        status: "fallback",
        providerId: "procedural",
        acceptedRequestCount: 1,
        cacheStatus: "not-checked"
      })
    );
    expect(body).toEqual(
      expect.objectContaining({
        requestHash: expect.any(String),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.disabled",
            severity: "warning"
          })
        ])
      })
    );
  });

  it("rejects unsupported remote source roles before provider execution", async () => {
    expect(approvedRemoteMaterialSourceIds).not.toContain("source.glass.primary");

    const response = await routeRequest({
      ...validPayload,
      requests: [
        {
          ...validPayload.requests[0],
          sourceId: "source.glass.primary",
          role: "glass",
          promptVocabulary: ["wavy glass"]
        }
      ]
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        status: "rejected",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.unsupportedSource",
            path: "requests.0.sourceId",
            received: "source.glass.primary"
          })
        ])
      })
    );
  });

  it("rejects oversized remote batches and source dimensions", async () => {
    const tooManyRequests = Array.from({ length: 5 }, (_, index) => ({
      ...validPayload.requests[0],
      sourceId: index === 1 ? "source.roof.primary" : validPayload.requests[0].sourceId,
      role: index === 1 ? "roof" : validPayload.requests[0].role
    }));
    const tooManyResponse = await routeRequest({ ...validPayload, requests: tooManyRequests });
    const tooManyBody = await readJson(tooManyResponse);

    expect(tooManyResponse.status).toBe(400);
    expect(tooManyBody).toEqual(
      expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.tooManyRequests",
            received: 5
          })
        ])
      })
    );

    const oversizedResponse = await routeRequest({
      ...validPayload,
      requests: [{ ...validPayload.requests[0], widthPx: 2048 }]
    });
    const oversizedBody = await readJson(oversizedResponse);

    expect(oversizedResponse.status).toBe(400);
    expect(oversizedBody).toEqual(
      expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.oversizedRequest",
            path: "requests.0.widthPx",
            received: 2048
          })
        ])
      })
    );
  });

  it("rejects unsupported remote output formats", async () => {
    const response = await routeRequest({ ...validPayload, outputFormat: "jpeg" });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.invalidPayload",
            path: "outputFormat"
          })
        ])
      })
    );
  });

  it("never echoes server provider secrets in route responses", async () => {
    const transportRequests: OpenAIImageTransportRequest[] = [];
    const response = await routeRequest(
      validPayload,
      {
        BUILDING_MATERIAL_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-buildo-secret-test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-test"
      },
      {
        remoteMaterialCache: createInMemoryRemoteMaterialArtifactCache(),
        openAITransport: async (request) => {
          transportRequests.push(request);
          return {
            data: [
              {
                b64_json: encodedPng("route-wall"),
                revised_prompt: "remote revised masonry prompt"
              }
            ]
          };
        }
      }
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toEqual(
      expect.objectContaining({
        schemaVersion: "0.1.0",
        status: "generated",
        providerId: "openai-image",
        acceptedRequestCount: 1,
        cacheStatus: "miss",
        diagnostics: [],
        artifacts: [
          expect.objectContaining({
            sourceId: "source.wall.primary",
            providerId: "openai-image",
            revisedPrompt: "remote revised masonry prompt",
            requestHash: expect.any(String),
            contentHash: expect.any(String),
            image: {
              format: "png",
              b64Json: encodedPng("route-wall")
            }
          })
        ]
      })
    );
    expect(transportRequests).toHaveLength(1);
    expect(transportRequests[0].body).toEqual(
      expect.objectContaining({
        model: "gpt-image-test",
        output_format: "png",
        prompt: expect.stringContaining("running-bond-brick")
      })
    );
  });

  it("falls back without echoing provider secrets when OpenAI transport fails", async () => {
    const response = await routeRequest(
      validPayload,
      {
        BUILDING_MATERIAL_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-buildo-secret-test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-test"
      },
      {
        remoteMaterialCache: createInMemoryRemoteMaterialArtifactCache(),
        openAITransport: async () => {
          throw new Error("network denied for sk-buildo-secret-test-key");
        }
      }
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toEqual(
      expect.objectContaining({
        status: "fallback",
        providerId: "procedural",
        requestHash: expect.any(String),
        acceptedRequestCount: 1,
        cacheStatus: "not-checked",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.openaiFailed",
            severity: "warning"
          })
        ])
      })
    );
  });

  it("returns cached remote artifacts for repeated request hashes without calling OpenAI again", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    const env = {
      BUILDING_MATERIAL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-buildo-secret-test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-test"
    };
    let transportCallCount = 0;

    const firstResponse = await routeRequest(validPayload, env, {
      remoteMaterialCache: cache,
      openAITransport: async () => {
        transportCallCount += 1;
        return {
          data: [
            {
              b64_json: encodedPng("cached-wall"),
              revised_prompt: "cached remote prompt"
            }
          ]
        };
      }
    });
    const secondResponse = await routeRequest(validPayload, env, {
      remoteMaterialCache: cache,
      openAITransport: async () => {
        transportCallCount += 1;
        return {
          data: [
            {
              b64_json: encodedPng("unexpected-second-wall"),
              revised_prompt: "unexpected second prompt"
            }
          ]
        };
      }
    });

    const firstBody = (await readJson(firstResponse)) as {
      artifacts: Array<{ requestHash: string; contentHash: string }>;
    };
    const secondBodyText = await secondResponse.text();
    const secondBody = JSON.parse(secondBodyText) as {
      artifacts: Array<{ requestHash: string; contentHash: string }>;
    };

    expect(transportCallCount).toBe(1);
    expect(firstBody).toEqual(
      expect.objectContaining({
        status: "generated",
        cacheStatus: "miss",
        artifacts: [
          expect.objectContaining({
            requestHash: expect.any(String),
            image: {
              format: "png",
              b64Json: encodedPng("cached-wall")
            }
          })
        ]
      })
    );
    expect(secondBodyText).not.toContain("sk-buildo-secret-test-key");
    expect(secondBody).toEqual(
      expect.objectContaining({
        status: "generated",
        cacheStatus: "hit",
        artifacts: [
          expect.objectContaining({
            image: {
              format: "png",
              b64Json: encodedPng("cached-wall")
            },
            revisedPrompt: "cached remote prompt"
          })
        ]
      })
    );
    expect(secondBody.artifacts[0].requestHash).toBe(firstBody.artifacts[0].requestHash);
    expect(secondBody.artifacts[0].contentHash).toBe(firstBody.artifacts[0].contentHash);
  });

  it("uses the configured durable remote cache path across route instances", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "buildo-route-remote-cache-"));
    const cacheFile = join(cacheDir, "remote-material-cache.json");
    const env = {
      BUILDING_MATERIAL_PROVIDER: "openai",
      BUILDING_REMOTE_MATERIAL_CACHE_FILE: cacheFile,
      OPENAI_API_KEY: "sk-buildo-secret-test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-test"
    };
    let transportCallCount = 0;

    try {
      const firstResponse = await routeRequest(validPayload, env, {
        openAITransport: async () => {
          transportCallCount += 1;
          return {
            data: [
              {
                b64_json: encodedPng("durable-wall"),
                revised_prompt: "durable cached prompt"
              }
            ]
          };
        }
      });
      const secondResponse = await routeRequest(validPayload, env, {
        openAITransport: async () => {
          transportCallCount += 1;
          return {
            data: [
              {
                b64_json: encodedPng("unexpected-durable-wall"),
                revised_prompt: "unexpected durable prompt"
              }
            ]
          };
        }
      });
      const firstBody = (await readJson(firstResponse)) as {
        artifacts: Array<{ requestHash: string; contentHash: string }>;
      };
      const secondBody = (await readJson(secondResponse)) as {
        cacheStatus: string;
        artifacts: Array<{ requestHash: string; contentHash: string; revisedPrompt?: string }>;
      };

      expect(transportCallCount).toBe(1);
      expect(existsSync(cacheFile)).toBe(true);
      expect(firstBody).toEqual(expect.objectContaining({ status: "generated", cacheStatus: "miss" }));
      expect(secondBody).toEqual(expect.objectContaining({ status: "generated", cacheStatus: "hit" }));
      expect(secondBody.artifacts[0].requestHash).toBe(firstBody.artifacts[0].requestHash);
      expect(secondBody.artifacts[0].contentHash).toBe(firstBody.artifacts[0].contentHash);
      expect(secondBody.artifacts[0].revisedPrompt).toBe("durable cached prompt");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("falls back and aborts provider work when OpenAI material generation times out", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    let receivedSignal: AbortSignal | undefined;
    const response = await routeRequest(
      validPayload,
      {
        BUILDING_MATERIAL_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-buildo-secret-test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-test"
      },
      {
        remoteMaterialCache: cache,
        remoteMaterialTimeoutMs: 0,
        openAITransport: async (_request, signal) => {
          receivedSignal = signal;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { data: [{ b64_json: encodedPng("late-wall") }] };
        }
      }
    );
    const bodyText = await response.text();

    expect(receivedSignal?.aborted).toBe(true);
    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toEqual(
      expect.objectContaining({
        status: "fallback",
        providerId: "procedural",
        cacheStatus: "not-checked",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.openaiTimedOut",
            severity: "warning"
          })
        ])
      })
    );
  });

  it("does not cache a timed-out remote artifact when the upstream transport finishes later", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    const env = {
      BUILDING_MATERIAL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-buildo-secret-test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-test"
    };

    await routeRequest(validPayload, env, {
      remoteMaterialCache: cache,
      remoteMaterialTimeoutMs: 0,
      openAITransport: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: [{ b64_json: encodedPng("late-wall") }] };
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const response = await routeRequest(validPayload, env, {
      remoteMaterialCache: cache,
      openAITransport: async () => ({ data: [{ b64_json: encodedPng("fresh-wall") }] })
    });
    const body = await readJson(response);

    expect(body).toEqual(
      expect.objectContaining({
        status: "generated",
        cacheStatus: "miss",
        artifacts: [
          expect.objectContaining({
            image: {
              format: "png",
              b64Json: encodedPng("fresh-wall")
            }
          })
        ]
      })
    );
  });

  it("returns a cancellation diagnostic without retrying or caching aborted provider work", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    const requestAbortController = new AbortController();
    const env = {
      BUILDING_MATERIAL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-buildo-secret-test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-test"
    };
    let transportCallCount = 0;
    let receivedProviderSignal: AbortSignal | undefined;

    const cancelledResponse = await routeRequest(validPayload, env, {
      signal: requestAbortController.signal,
      remoteMaterialCache: cache,
      remoteMaterialRetryCount: 3,
      openAITransport: async (_request, signal) => {
        transportCallCount += 1;
        receivedProviderSignal = signal;
        requestAbortController.abort();
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("transport aborted with sk-buildo-secret-test-key");
      }
    });
    const cancelledBodyText = await cancelledResponse.text();

    expect(receivedProviderSignal?.aborted).toBe(true);
    expect(transportCallCount).toBe(1);
    expect(cancelledBodyText).not.toContain("sk-buildo-secret-test-key");
    expect(JSON.parse(cancelledBodyText)).toEqual(
      expect.objectContaining({
        status: "fallback",
        providerId: "procedural",
        cacheStatus: "not-checked",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.cancelled",
            severity: "warning"
          })
        ])
      })
    );

    const freshResponse = await routeRequest(validPayload, env, {
      remoteMaterialCache: cache,
      openAITransport: async () => ({ data: [{ b64_json: encodedPng("fresh-after-cancel") }] })
    });
    const freshBody = await readJson(freshResponse);

    expect(freshBody).toEqual(
      expect.objectContaining({
        status: "generated",
        cacheStatus: "miss",
        artifacts: [
          expect.objectContaining({
            image: {
              format: "png",
              b64Json: encodedPng("fresh-after-cancel")
            }
          })
        ]
      })
    );
  });

  it("limits concurrent OpenAI cache misses while preserving artifact order", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    const payload = {
      ...validPayload,
      requests: [
        validPayload.requests[0],
        {
          ...validPayload.requests[0],
          sourceId: "source.roof.primary",
          role: "roof",
          selectedFamily: "standing-seam-roof",
          seedPath: "atlas/source/roof.primary/standing-seam-roof",
          promptVocabulary: ["standing-seam-roof", "weathered metal roof material"]
        },
        {
          ...validPayload.requests[0],
          sourceId: "source.frame.primary",
          role: "frame",
          selectedFamily: "painted-wood-frame",
          seedPath: "atlas/source/frame.primary/painted-wood-frame",
          promptVocabulary: ["painted-wood-frame", "painted storefront frame material"]
        }
      ]
    };
    let activeTransportCount = 0;
    let maxActiveTransportCount = 0;

    const response = await routeRequest(
      payload,
      {
        BUILDING_MATERIAL_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-buildo-secret-test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-test"
      },
      {
        remoteMaterialCache: cache,
        remoteMaterialConcurrencyLimit: 2,
        openAITransport: async (request) => {
          activeTransportCount += 1;
          maxActiveTransportCount = Math.max(maxActiveTransportCount, activeTransportCount);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeTransportCount -= 1;

          const prompt = request.body.prompt;
          const sourceId = prompt.includes("source.roof.primary")
            ? "source.roof.primary"
            : prompt.includes("source.frame.primary")
              ? "source.frame.primary"
              : "source.wall.primary";
          return { data: [{ b64_json: encodedPng(sourceId) }] };
        }
      }
    );
    const body = (await readJson(response)) as {
      artifacts: Array<{ sourceId: string }>;
    };

    expect(response.status).toBe(200);
    expect(maxActiveTransportCount).toBe(2);
    expect(body).toEqual(
      expect.objectContaining({
        status: "generated",
        cacheStatus: "miss"
      })
    );
    expect(body.artifacts.map((artifact) => artifact.sourceId)).toEqual(
      payload.requests.map((request) => request.sourceId)
    );
  });

  it("retries a transient OpenAI material failure before falling back", async () => {
    const cache = createInMemoryRemoteMaterialArtifactCache();
    let transportCallCount = 0;

    const response = await routeRequest(
      validPayload,
      {
        BUILDING_MATERIAL_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-buildo-secret-test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-test"
      },
      {
        remoteMaterialCache: cache,
        remoteMaterialRetryCount: 1,
        openAITransport: async () => {
          transportCallCount += 1;
          if (transportCallCount === 1) {
            throw new Error("temporary failure for sk-buildo-secret-test-key");
          }
          return {
            data: [
              {
                b64_json: encodedPng("retried-wall"),
                revised_prompt: "retried remote prompt"
              }
            ]
          };
        }
      }
    );
    const bodyText = await response.text();

    expect(transportCallCount).toBe(2);
    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
    expect(response.status).toBe(200);
    expect(JSON.parse(bodyText)).toEqual(
      expect.objectContaining({
        status: "generated",
        providerId: "openai-image",
        cacheStatus: "miss",
        diagnostics: [],
        artifacts: [
          expect.objectContaining({
            image: {
              format: "png",
              b64Json: encodedPng("retried-wall")
            },
            revisedPrompt: "retried remote prompt"
          })
        ]
      })
    );
  });

  it("rejects non-POST requests without reading a provider key", async () => {
    const response = await handleMaterialProviderRequest(
      new Request("http://127.0.0.1/api/building-material-provider", { method: "GET" }),
      { env: { OPENAI_API_KEY: "sk-buildo-secret-test-key" } }
    );
    const bodyText = await response.text();

    expect(response.status).toBe(405);
    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
  });
});
