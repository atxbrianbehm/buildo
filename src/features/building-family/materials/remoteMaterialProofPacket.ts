import { z } from "zod";
import { DiagnosticSchema, type Diagnostic } from "../core/diagnostics";
import { SchemaVersion010 } from "../contracts/shared";
import type { AtlasDebugExport } from "./atlasDebugExport";
import type { PackedAtlas } from "./atlasPacker";

export const REMOTE_MATERIAL_PROOF_PACKET_KIND = "dynamic-building-family-remote-material-proof";

const RemoteMaterialProofRouteSchema = z.object({
  schemaVersion: SchemaVersion010,
  status: z.literal("generated"),
  providerId: z.literal("openai-image"),
  requestHash: z.string().min(1),
  acceptedRequestCount: z.number().int().positive(),
  cacheStatus: z.enum(["hit", "miss", "partial"])
});

const RemoteMaterialProofSourceSchema = z.object({
  sourceId: z.string().min(1),
  providerId: z.literal("openai-image"),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  revisedPrompt: z.string().optional()
});

export const RemoteMaterialProofPacketSchema = z.object({
  schemaVersion: SchemaVersion010,
  proofKind: z.literal(REMOTE_MATERIAL_PROOF_PACKET_KIND),
  createdAt: z.string().min(1),
  atlas: z.object({
    atlasId: z.string().min(1),
    contentHash: z.string().min(1),
    debugExportHash: z.string().min(1),
    channelCount: z.number().int().positive(),
    providerIds: z.array(z.string().min(1))
  }),
  route: RemoteMaterialProofRouteSchema,
  remoteSources: z.array(RemoteMaterialProofSourceSchema).min(1),
  diagnostics: z.array(DiagnosticSchema),
  evidence: z.object({
    generatedSourceCount: z.number().int().positive(),
    revisedPromptCount: z.number().int().nonnegative(),
    diagnosticCount: z.number().int().nonnegative()
  }),
  knownLimitations: z.array(z.string().min(1))
});

export type RemoteMaterialProofPacket = z.infer<typeof RemoteMaterialProofPacketSchema>;

export interface RemoteMaterialProofApplicationInput {
  route: {
    schemaVersion: "0.1.0";
    status: string;
    providerId?: string;
    requestHash?: string;
    acceptedRequestCount?: number;
    cacheStatus?: string;
  };
  remoteSources: Array<{
    sourceId: string;
    providerId: string;
    requestHash: string;
    contentHash: string;
    revisedPrompt?: string;
  }>;
  diagnostics: Diagnostic[];
}

export interface CreateRemoteMaterialProofPacketInput {
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  remoteMaterialApplication: RemoteMaterialProofApplicationInput;
  now?: () => Date;
}

function requireGeneratedRoute(
  remoteMaterialApplication: RemoteMaterialProofApplicationInput
): RemoteMaterialProofPacket["route"] {
  const route = remoteMaterialApplication.route;
  if (
    route.status !== "generated" ||
    route.providerId !== "openai-image" ||
    !route.requestHash ||
    !route.acceptedRequestCount ||
    (route.cacheStatus !== "hit" && route.cacheStatus !== "miss" && route.cacheStatus !== "partial")
  ) {
    throw new Error("Remote material proof packet requires generated remote material output.");
  }

  return {
    schemaVersion: route.schemaVersion,
    status: route.status,
    providerId: route.providerId,
    requestHash: route.requestHash,
    acceptedRequestCount: route.acceptedRequestCount,
    cacheStatus: route.cacheStatus
  };
}

function redactProviderSecrets(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-provider-secret]");
}

function sanitizeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse({
    ...diagnostic,
    message: redactProviderSecrets(diagnostic.message),
    received: typeof diagnostic.received === "string" ? redactProviderSecrets(diagnostic.received) : diagnostic.received
  });
}

function providerIds(debugExport: AtlasDebugExport): string[] {
  return debugExport.providerDiagnostics
    .map((provider) => provider.providerId)
    .sort((left, right) => left.localeCompare(right));
}

export function parseRemoteMaterialProofPacket(input: unknown): RemoteMaterialProofPacket {
  const result = RemoteMaterialProofPacketSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid remote material proof packet: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }

  return result.data;
}

export function createRemoteMaterialProofPacket(
  input: CreateRemoteMaterialProofPacketInput
): RemoteMaterialProofPacket {
  const route = requireGeneratedRoute(input.remoteMaterialApplication);
  const remoteSources = input.remoteMaterialApplication.remoteSources.filter(
    (source) => source.providerId === "openai-image"
  );
  if (remoteSources.length === 0) {
    throw new Error("Remote material proof packet requires generated remote material output.");
  }

  const diagnostics = input.remoteMaterialApplication.diagnostics.map(sanitizeDiagnostic);

  return parseRemoteMaterialProofPacket({
    schemaVersion: "0.1.0",
    proofKind: REMOTE_MATERIAL_PROOF_PACKET_KIND,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    atlas: {
      atlasId: input.packedAtlas.atlasId,
      contentHash: input.packedAtlas.contentHash,
      debugExportHash: input.debugExport.exportHash,
      channelCount: input.debugExport.channels.length,
      providerIds: providerIds(input.debugExport)
    },
    route,
    remoteSources,
    diagnostics,
    evidence: {
      generatedSourceCount: remoteSources.length,
      revisedPromptCount: remoteSources.filter((source) => source.revisedPrompt !== undefined).length,
      diagnosticCount: diagnostics.length
    },
    knownLimitations: [
      "Provider secrets and raw remote image bytes are intentionally omitted from the proof packet.",
      "The proof packet records route and atlas evidence; retain the matching completed-family export for full reproduction."
    ]
  });
}
