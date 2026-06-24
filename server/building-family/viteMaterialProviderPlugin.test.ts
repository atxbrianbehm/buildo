// @vitest-environment node
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { describe, expect, it } from "vitest";
import { createMaterialProviderVitePlugin } from "./viteMaterialProviderPlugin";

const validPayload = {
  schemaVersion: "0.1.0",
  runId: "vite-material-provider-route-test",
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

type RegisteredMiddleware = {
  path: string;
  handler: (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;
};

function registeredMiddleware(plugin: Plugin): RegisteredMiddleware {
  let registered: RegisteredMiddleware | undefined;
  const configureServer = plugin.configureServer;
  if (typeof configureServer !== "function") {
    throw new Error("Expected material provider plugin to expose configureServer.");
  }

  (configureServer as (server: ViteDevServer) => void)({
    middlewares: {
      use(path: string, handler: RegisteredMiddleware["handler"]) {
        registered = { path, handler };
      }
    }
  } as unknown as ViteDevServer);

  if (!registered) {
    throw new Error("Expected material provider plugin to register middleware.");
  }
  return registered;
}

function requestFromPayload(payload: unknown): IncomingMessage {
  const request = Readable.from([JSON.stringify(payload)]) as IncomingMessage;
  request.method = "POST";
  request.url = "/api/building-material-provider";
  request.headers = {
    "content-type": "application/json",
    host: "127.0.0.1:5173"
  };
  return request;
}

function responseRecorder(): {
  response: ServerResponse;
  headers: Record<string, string | number | readonly string[]>;
  done: Promise<string>;
} {
  const headers: Record<string, string | number | readonly string[]> = {};
  let resolveBody!: (body: string) => void;
  const chunks: string[] = [];
  const done = new Promise<string>((resolve) => {
    resolveBody = resolve;
  });

  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = value;
      return response;
    },
    end(chunk?: unknown) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      }
      resolveBody(chunks.join(""));
      return response;
    }
  } as unknown as ServerResponse;

  return { response, headers, done };
}

describe("Vite material provider plugin", () => {
  it("hosts the material provider route through Vite middleware", async () => {
    const middleware = registeredMiddleware(
      createMaterialProviderVitePlugin({
        routeOptions: {
          env: {}
        }
      })
    );
    const recorder = responseRecorder();
    const nextErrors: unknown[] = [];

    middleware.handler(requestFromPayload(validPayload), recorder.response, (error) => {
      nextErrors.push(error);
    });
    const bodyText = await recorder.done;
    const body = JSON.parse(bodyText);

    expect(middleware.path).toBe("/api/building-material-provider");
    expect(nextErrors).toEqual([]);
    expect(recorder.response.statusCode).toBe(200);
    expect(recorder.headers["content-type"]).toBe("application/json");
    expect(body).toEqual(
      expect.objectContaining({
        schemaVersion: "0.1.0",
        status: "fallback",
        providerId: "procedural",
        acceptedRequestCount: 1,
        cacheStatus: "not-checked",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "remoteMaterialProvider.disabled",
            severity: "warning"
          })
        ])
      })
    );
  });
});
