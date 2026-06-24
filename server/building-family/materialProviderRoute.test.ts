// @vitest-environment node
import { describe, expect, it } from "vitest";
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

function routeRequest(body: unknown, env: Record<string, string | undefined> = {}): Promise<Response> {
  return handleMaterialProviderRequest(
    new Request("http://127.0.0.1/api/building-material-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    { env }
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
    const response = await routeRequest(validPayload, {
      BUILDING_MATERIAL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-buildo-secret-test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-test"
    });
    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as { diagnostics: Array<{ code: string }> };

    expect(bodyText).not.toContain("sk-buildo-secret-test-key");
    expect(response.status).toBe(200);
    expect(body.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialProvider.openaiNotImplemented"
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
