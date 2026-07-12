import { z } from "zod";
import { AtlasChannelSchema } from "../contracts/atlasManifest";
import { SchemaVersion010 } from "../contracts/shared";
import {
  CompletedFamilyPersistencePacketSchema,
  parseCompletedFamilyPersistencePacket,
  type CompletedFamilyPersistencePacket
} from "./completedFamilyPersistence";

export const COMPLETED_FAMILY_EXPORT_BUNDLE_TYPE = "completed-family-export";

const packetShape = CompletedFamilyPersistencePacketSchema.shape;
const artifactsShape = packetShape.artifacts.shape;
const atlasDebugExportShape = artifactsShape.debugExport.shape;

const CompletedFamilyExportChannelSchema = z.object({
  name: AtlasChannelSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  channelHash: z.string().min(1),
  pngDataUrl: z.string().min(1)
});

export const CompletedFamilyExportBundleSchema = z.object({
  schemaVersion: SchemaVersion010,
  bundleType: z.literal(COMPLETED_FAMILY_EXPORT_BUNDLE_TYPE),
  documentId: packetShape.documentId,
  runId: packetShape.runId,
  requestHash: packetShape.requestHash,
  contentHash: packetShape.contentHash,
  createdAt: packetShape.createdAt,
  fidelityMode: packetShape.fidelityMode,
  familyId: packetShape.familyId,
  buildingId: packetShape.buildingId,
  stylePackReference: packetShape.stylePackReference,
  spec: artifactsShape.spec,
  atlas: z.object({
    manifest: artifactsShape.atlasManifest,
    contentHash: artifactsShape.atlasContentHash,
    slotProvenance: artifactsShape.atlasSlotProvenance,
    channels: z.array(CompletedFamilyExportChannelSchema),
    diagnostics: atlasDebugExportShape.diagnostics
  }),
  componentCatalog: artifactsShape.componentCatalog,
  graph: artifactsShape.graph,
  provenance: packetShape.provenance,
  gltf: z
    .object({
      uri: z.string().min(1),
      mediaType: z.literal("model/gltf+json").or(z.literal("model/gltf-binary")),
      contentHash: z.string().min(1)
    })
    .optional()
});

export type CompletedFamilyExportBundle = z.infer<typeof CompletedFamilyExportBundleSchema>;

function orderedExportChannels(packet: CompletedFamilyPersistencePacket): CompletedFamilyExportBundle["atlas"]["channels"] {
  const channelsByName = new Map(packet.artifacts.debugExport.channels.map((channel) => [channel.name, channel]));

  return packet.artifacts.atlasManifest.channels.map((name) => {
    const channel = channelsByName.get(name);
    if (!channel) {
      throw new Error(`Missing ${name} atlas channel export for completed-family bundle.`);
    }

    return {
      name: channel.name,
      widthPx: channel.widthPx,
      heightPx: channel.heightPx,
      byteLength: channel.byteLength,
      channelHash: channel.channelHash,
      pngDataUrl: channel.pngDataUrl
    };
  });
}

export function parseCompletedFamilyExportBundle(input: unknown): CompletedFamilyExportBundle {
  const result = CompletedFamilyExportBundleSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid completed-family export bundle: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }

  return result.data;
}

export function createCompletedFamilyExportBundle(input: unknown): CompletedFamilyExportBundle {
  const packet = parseCompletedFamilyPersistencePacket(input);

  return parseCompletedFamilyExportBundle({
    schemaVersion: "0.1.0",
    bundleType: COMPLETED_FAMILY_EXPORT_BUNDLE_TYPE,
    documentId: packet.documentId,
    runId: packet.runId,
    requestHash: packet.requestHash,
    contentHash: packet.contentHash,
    createdAt: packet.createdAt,
    fidelityMode: packet.fidelityMode,
    familyId: packet.familyId,
    buildingId: packet.buildingId,
    stylePackReference: packet.stylePackReference,
    spec: packet.artifacts.spec,
    atlas: {
      manifest: packet.artifacts.atlasManifest,
      contentHash: packet.artifacts.atlasContentHash,
      slotProvenance: packet.artifacts.atlasSlotProvenance,
      channels: orderedExportChannels(packet),
      diagnostics: packet.artifacts.debugExport.diagnostics
    },
    componentCatalog: packet.artifacts.componentCatalog,
    graph: packet.artifacts.graph,
    provenance: packet.provenance
  });
}
