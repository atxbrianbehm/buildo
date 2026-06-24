import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleMaterialProviderRequest, type MaterialProviderRouteOptions } from "./materialProviderRoute";

export const materialProviderRoutePath = "/api/building-material-provider";

export interface MaterialProviderVitePluginOptions {
  routeOptions?: MaterialProviderRouteOptions;
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result.set(name, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        result.append(name, entry);
      }
    }
  }
  return result;
}

async function readIncomingBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function requestUrl(request: IncomingMessage): string {
  const host = request.headers.host ?? "127.0.0.1";
  return new URL(request.url ?? materialProviderRoutePath, `http://${host}`).toString();
}

function canCarryBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export async function handleViteMaterialProviderRequest(
  incomingRequest: IncomingMessage,
  serverResponse: ServerResponse,
  options: MaterialProviderVitePluginOptions = {}
): Promise<void> {
  const method = incomingRequest.method ?? "GET";
  const body = await readIncomingBody(incomingRequest);
  const routeRequest = new Request(requestUrl(incomingRequest), {
    method,
    headers: headersFromIncoming(incomingRequest.headers),
    body: body.byteLength > 0 && canCarryBody(method) ? body : undefined
  });
  const routeResponse = await handleMaterialProviderRequest(routeRequest, options.routeOptions);
  const responseBody = Buffer.from(await routeResponse.arrayBuffer());

  serverResponse.statusCode = routeResponse.status;
  routeResponse.headers.forEach((value, name) => {
    serverResponse.setHeader(name, value);
  });
  serverResponse.end(responseBody);
}

export function createMaterialProviderVitePlugin(
  options: MaterialProviderVitePluginOptions = {}
): Plugin {
  return {
    name: "buildo-material-provider-route",
    configureServer(server) {
      server.middlewares.use(materialProviderRoutePath, (request, response, next) => {
        handleViteMaterialProviderRequest(request, response, options).catch(next);
      });
    }
  };
}
