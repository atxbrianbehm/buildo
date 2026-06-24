import { z } from "zod";
import { DiagnosticSchema } from "../core/diagnostics";
import type { MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { RemoteMaterialImageArtifactSchema } from "../materials/remoteMaterialImageBridge";

const remoteMaterialRouteEndpoint = "/api/building-material-provider";

const GeneratedRemoteMaterialRouteResultSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  status: z.literal("generated"),
  providerId: z.literal("openai-image"),
  requestHash: z.string().min(1),
  acceptedRequestCount: z.number().int().nonnegative(),
  cacheStatus: z.enum(["hit", "miss", "partial"]),
  artifacts: z.array(RemoteMaterialImageArtifactSchema),
  diagnostics: z.array(DiagnosticSchema)
});

const FallbackRemoteMaterialRouteResultSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  status: z.literal("fallback"),
  providerId: z.literal("procedural"),
  requestHash: z.string().min(1),
  acceptedRequestCount: z.number().int().nonnegative(),
  cacheStatus: z.literal("not-checked"),
  diagnostics: z.array(DiagnosticSchema)
});

const RejectedRemoteMaterialRouteResultSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  status: z.literal("rejected"),
  diagnostics: z.array(DiagnosticSchema)
});

const RemoteMaterialRouteResultSchema = z.discriminatedUnion("status", [
  GeneratedRemoteMaterialRouteResultSchema,
  FallbackRemoteMaterialRouteResultSchema,
  RejectedRemoteMaterialRouteResultSchema
]);

export type GeneratedRemoteMaterialRouteResult = z.infer<
  typeof GeneratedRemoteMaterialRouteResultSchema
>;

export type FallbackRemoteMaterialRouteResult = z.infer<
  typeof FallbackRemoteMaterialRouteResultSchema
>;

export type RejectedRemoteMaterialRouteResult = z.infer<
  typeof RejectedRemoteMaterialRouteResultSchema
>;

export type RemoteMaterialRouteResult = z.infer<typeof RemoteMaterialRouteResultSchema>;

export type RemoteMaterialRouteFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface RequestRemoteMaterialImagesInput {
  runId: string;
  requests: MaterialSourceRequest[];
}

export interface RequestRemoteMaterialImagesOptions {
  endpoint?: string;
  fetcher?: RemoteMaterialRouteFetch;
}

function clientFallbackResult(
  acceptedRequestCount: number,
  code: string,
  message: string
): FallbackRemoteMaterialRouteResult {
  return {
    schemaVersion: "0.1.0",
    status: "fallback",
    providerId: "procedural",
    requestHash: "unavailable",
    acceptedRequestCount,
    cacheStatus: "not-checked",
    diagnostics: [
      {
        code,
        message,
        severity: "warning"
      }
    ]
  };
}

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Remote material route client requires fetch.");
  }

  return globalThis.fetch(input, init);
}

export async function requestRemoteMaterialImages(
  input: RequestRemoteMaterialImagesInput,
  options: RequestRemoteMaterialImagesOptions = {}
): Promise<RemoteMaterialRouteResult> {
  const fetcher = options.fetcher ?? defaultFetch;
  let body: unknown;
  try {
    const response = await fetcher(options.endpoint ?? remoteMaterialRouteEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: "0.1.0",
        runId: input.runId,
        outputFormat: "rgba8-layer-set",
        requests: input.requests
      })
    });
    body = await response.json();
  } catch {
    return clientFallbackResult(
      input.requests.length,
      "remoteMaterialRouteClient.requestFailed",
      "Remote material route request failed; procedural material generation should be used."
    );
  }

  const routeResult = RemoteMaterialRouteResultSchema.safeParse(body);
  if (!routeResult.success) {
    return clientFallbackResult(
      input.requests.length,
      "remoteMaterialRouteClient.invalidResponse",
      "Remote material route returned an invalid response; procedural material generation should be used."
    );
  }

  return routeResult.data;
}
