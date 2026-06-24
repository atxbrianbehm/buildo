import { z } from "zod";
import { hashCanonicalJson } from "../../src/features/building-family/core/contentHash";
import type { Diagnostic } from "../../src/features/building-family/core/diagnostics";
import {
  OpenAIImageMaterialProvider,
  type OpenAIImageTransport,
  type RemoteMaterialSourceArtifact
} from "./openAIImageMaterialProvider";
import {
  defaultRemoteMaterialArtifactCache,
  type RemoteMaterialArtifactCache
} from "./remoteMaterialArtifactCache";

const maxRemoteRequestCount = 4;
const maxRemoteSourceDimensionPx = 1024;
const maxPromptVocabularyChars = 640;
const defaultRemoteMaterialTimeoutMs = 30_000;

const AtlasMaterialRoleSchema = z.enum([
  "wall",
  "roof",
  "glass",
  "frame",
  "door",
  "horizontalTrim",
  "verticalTrim",
  "ornament"
]);

const MaterialSourceRequestSchema = z.object({
  sourceId: z.string().min(1),
  role: AtlasMaterialRoleSchema,
  selectedFamily: z.string().min(1).max(160),
  periodicity: z.enum(["none", "x", "xy"]),
  physicalSizeM: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  seedPath: z.string().min(1).max(240),
  promptVocabulary: z.array(z.string().min(1).max(160)).min(1).max(16),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive()
});

const MaterialProviderRoutePayloadSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  runId: z.string().min(1).max(160),
  outputFormat: z.literal("rgba8-layer-set"),
  requests: z.array(MaterialSourceRequestSchema).min(1)
});

type MaterialProviderRoutePayload = z.infer<typeof MaterialProviderRoutePayloadSchema>;

type MaterialSourceRequest = MaterialProviderRoutePayload["requests"][number];

type MaterialProviderRouteEnv = Record<string, string | undefined>;

export interface MaterialProviderRouteOptions {
  env?: MaterialProviderRouteEnv;
  openAITransport?: OpenAIImageTransport;
  remoteMaterialCache?: RemoteMaterialArtifactCache;
  remoteMaterialTimeoutMs?: number;
}

export const approvedRemoteMaterialSourceRoles = {
  "source.wall.primary": "wall",
  "source.wall.secondary": "wall",
  "source.roof.primary": "roof",
  "source.frame.primary": "frame",
  "source.door.primary": "door",
  "source.trim.horizontal.primary": "horizontalTrim",
  "source.trim.horizontal.secondary": "horizontalTrim",
  "source.trim.vertical.primary": "verticalTrim",
  "source.cornice.primary": "horizontalTrim",
  "source.ornament.primary": "ornament"
} as const;

export const approvedRemoteMaterialSourceIds = Object.keys(approvedRemoteMaterialSourceRoles).sort();

interface RejectedRouteBody {
  schemaVersion: "0.1.0";
  status: "rejected";
  diagnostics: Diagnostic[];
}

interface FallbackRouteBody {
  schemaVersion: "0.1.0";
  status: "fallback";
  providerId: "procedural";
  requestHash: string;
  acceptedRequestCount: number;
  cacheStatus: "not-checked";
  diagnostics: Diagnostic[];
}

interface GeneratedRouteBody {
  schemaVersion: "0.1.0";
  status: "generated";
  providerId: "openai-image";
  requestHash: string;
  acceptedRequestCount: number;
  cacheStatus: "hit" | "miss" | "partial";
  artifacts: RemoteMaterialSourceArtifact[];
  diagnostics: [];
}

type MaterialProviderRouteBody = RejectedRouteBody | FallbackRouteBody | GeneratedRouteBody;

function jsonResponse(status: number, body: MaterialProviderRouteBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function invalidPayloadDiagnostic(error: z.ZodError): Diagnostic {
  return {
    code: "remoteMaterialProvider.invalidPayload",
    message: "Material provider route received an invalid request payload.",
    severity: "error",
    path: error.issues[0]?.path.join("."),
    received: error.issues[0]?.message
  };
}

function methodNotAllowedDiagnostic(method: string): Diagnostic {
  return {
    code: "remoteMaterialProvider.methodNotAllowed",
    message: "Material provider route only accepts POST requests.",
    severity: "error",
    received: method,
    allowedValues: ["POST"]
  };
}

function sourceRoleFor(sourceId: string): MaterialSourceRequest["role"] | undefined {
  return approvedRemoteMaterialSourceRoles[sourceId as keyof typeof approvedRemoteMaterialSourceRoles];
}

function validateRequestBatch(payload: MaterialProviderRoutePayload): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (payload.requests.length > maxRemoteRequestCount) {
    diagnostics.push({
      code: "remoteMaterialProvider.tooManyRequests",
      message: `Remote material generation accepts at most ${maxRemoteRequestCount} source requests per family.`,
      severity: "error",
      path: "requests",
      received: payload.requests.length,
      allowedValues: [`1-${maxRemoteRequestCount}`]
    });
  }

  payload.requests.forEach((request, index) => {
    const approvedRole = sourceRoleFor(request.sourceId);
    if (!approvedRole || approvedRole !== request.role) {
      diagnostics.push({
        code: "remoteMaterialProvider.unsupportedSource",
        message: `Remote material generation is not approved for ${request.sourceId}.`,
        severity: "error",
        path: `requests.${index}.sourceId`,
        received: request.sourceId,
        allowedValues: approvedRemoteMaterialSourceIds
      });
    }

    for (const dimension of ["widthPx", "heightPx"] as const) {
      if (request[dimension] > maxRemoteSourceDimensionPx) {
        diagnostics.push({
          code: "remoteMaterialProvider.oversizedRequest",
          message: `Remote material source ${dimension} must be ${maxRemoteSourceDimensionPx}px or smaller.`,
          severity: "error",
          path: `requests.${index}.${dimension}`,
          received: request[dimension],
          allowedValues: [`1-${maxRemoteSourceDimensionPx}`]
        });
      }
    }

    const promptLength = request.promptVocabulary.join(" ").length;
    if (promptLength > maxPromptVocabularyChars) {
      diagnostics.push({
        code: "remoteMaterialProvider.promptTooLong",
        message: `Remote material source prompt vocabulary must stay within ${maxPromptVocabularyChars} characters.`,
        severity: "error",
        path: `requests.${index}.promptVocabulary`,
        received: promptLength,
        allowedValues: [`1-${maxPromptVocabularyChars}`]
      });
    }
  });

  return diagnostics;
}

function fallbackDiagnostic(env: MaterialProviderRouteEnv): Diagnostic {
  if (env.BUILDING_MATERIAL_PROVIDER !== "openai") {
    return {
      code: "remoteMaterialProvider.disabled",
      message: "Remote material provider is disabled; procedural material generation should be used.",
      severity: "warning",
      path: "BUILDING_MATERIAL_PROVIDER",
      received: env.BUILDING_MATERIAL_PROVIDER ?? "unset",
      allowedValues: ["openai"]
    };
  }

  if (!env.OPENAI_API_KEY || !env.OPENAI_IMAGE_MODEL) {
    return {
      code: "remoteMaterialProvider.missingConfig",
      message: "OpenAI material provider requires server-only API key and image model configuration.",
      severity: "warning",
      allowedValues: ["OPENAI_API_KEY", "OPENAI_IMAGE_MODEL"]
    };
  }

  return {
    code: "remoteMaterialProvider.openaiFailed",
    message: "OpenAI material provider failed; procedural material generation should be used.",
    severity: "warning"
  };
}

function openAITimeoutDiagnostic(timeoutMs: number): Diagnostic {
  return {
    code: "remoteMaterialProvider.openaiTimedOut",
    message: "OpenAI material provider timed out; procedural material generation should be used.",
    severity: "warning",
    received: timeoutMs,
    path: "remoteMaterialTimeoutMs"
  };
}

async function parseJsonPayload(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function rejected(status: number, diagnostics: Diagnostic[]): Response {
  return jsonResponse(status, {
    schemaVersion: "0.1.0",
    status: "rejected",
    diagnostics
  });
}

function fallbackResponse(
  requestHash: string,
  acceptedRequestCount: number,
  diagnostics: Diagnostic[]
): Response {
  return jsonResponse(200, {
    schemaVersion: "0.1.0",
    status: "fallback",
    providerId: "procedural",
    requestHash,
    acceptedRequestCount,
    cacheStatus: "not-checked",
    diagnostics
  });
}

class RemoteMaterialProviderTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super("Remote material provider timed out.");
  }
}

function configuredRemoteMaterialTimeoutMs(options: MaterialProviderRouteOptions): number {
  if (typeof options.remoteMaterialTimeoutMs === "number") {
    return Math.max(0, options.remoteMaterialTimeoutMs);
  }

  return defaultRemoteMaterialTimeoutMs;
}

async function generateWithTimeout(
  provider: OpenAIImageMaterialProvider,
  sourceRequest: MaterialSourceRequest,
  requestSignal: AbortSignal,
  timeoutMs: number
): Promise<RemoteMaterialSourceArtifact> {
  const providerAbortController = new AbortController();
  const abortProvider = () => providerAbortController.abort();
  if (requestSignal.aborted) {
    abortProvider();
  } else {
    requestSignal.addEventListener("abort", abortProvider, { once: true });
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      providerAbortController.abort();
      reject(new RemoteMaterialProviderTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([provider.generate(sourceRequest, providerAbortController.signal), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    requestSignal.removeEventListener("abort", abortProvider);
  }
}

export async function handleMaterialProviderRequest(
  request: Request,
  options: MaterialProviderRouteOptions = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return rejected(405, [methodNotAllowedDiagnostic(request.method)]);
  }

  const payloadResult = MaterialProviderRoutePayloadSchema.safeParse(await parseJsonPayload(request));
  if (!payloadResult.success) {
    return rejected(400, [invalidPayloadDiagnostic(payloadResult.error)]);
  }

  const validationDiagnostics = validateRequestBatch(payloadResult.data);
  if (validationDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return rejected(400, validationDiagnostics);
  }

  const env = options.env ?? process.env;
  const requestHash = await hashCanonicalJson({
    schemaVersion: "0.1.0",
    route: "building-material-provider",
    runId: payloadResult.data.runId,
    outputFormat: payloadResult.data.outputFormat,
    requests: payloadResult.data.requests
  });

  if (
    env.BUILDING_MATERIAL_PROVIDER !== "openai" ||
    !env.OPENAI_API_KEY ||
    !env.OPENAI_IMAGE_MODEL
  ) {
    return fallbackResponse(requestHash, payloadResult.data.requests.length, [fallbackDiagnostic(env)]);
  }

  const provider = new OpenAIImageMaterialProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_IMAGE_MODEL,
    transport: options.openAITransport
  });
  const remoteMaterialCache = options.remoteMaterialCache ?? defaultRemoteMaterialArtifactCache;
  const remoteMaterialTimeoutMs = configuredRemoteMaterialTimeoutMs(options);

  try {
    const artifacts: RemoteMaterialSourceArtifact[] = [];
    let cacheHitCount = 0;

    for (const sourceRequest of payloadResult.data.requests) {
      const sourceRequestHash = await provider.requestHashFor(sourceRequest);
      const cachedArtifact = remoteMaterialCache.get(sourceRequestHash);
      if (cachedArtifact) {
        artifacts.push(cachedArtifact);
        cacheHitCount += 1;
        continue;
      }

      const artifact = await generateWithTimeout(provider, sourceRequest, request.signal, remoteMaterialTimeoutMs);
      remoteMaterialCache.set(artifact);
      artifacts.push(artifact);
    }
    const cacheStatus =
      cacheHitCount === artifacts.length ? "hit" : cacheHitCount > 0 ? "partial" : "miss";

    return jsonResponse(200, {
      schemaVersion: "0.1.0",
      status: "generated",
      providerId: "openai-image",
      requestHash,
      acceptedRequestCount: payloadResult.data.requests.length,
      cacheStatus,
      artifacts,
      diagnostics: []
    });
  } catch (error) {
    if (error instanceof RemoteMaterialProviderTimeoutError) {
      return fallbackResponse(requestHash, payloadResult.data.requests.length, [
        openAITimeoutDiagnostic(error.timeoutMs)
      ]);
    }

    return fallbackResponse(requestHash, payloadResult.data.requests.length, [fallbackDiagnostic(env)]);
  }
}
