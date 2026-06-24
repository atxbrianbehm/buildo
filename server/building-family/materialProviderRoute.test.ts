// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OpenAIImageTransportRequest } from "./openAIImageMaterialProvider";
import { approvedRemoteMaterialSourceIds, handleMaterialProviderRequest } from "./materialProviderRoute";

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
  } = {}
): Promise<Response> {
  return handleMaterialProviderRequest(
    new Request("http://127.0.0.1/api/building-material-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
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
        cacheStatus: "not-checked",
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
