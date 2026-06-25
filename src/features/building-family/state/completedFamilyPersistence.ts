import { z } from "zod";
import { ComponentCatalogSchema } from "../components/componentCatalogBuilder";
import { ComponentGallerySchema } from "../compiler/componentGalleryBuilder";
import { AtlasChannelSchema, AtlasManifestSchema } from "../contracts/atlasManifest";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { BuildingGraphSchema } from "../contracts/buildingGraph";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { AssemblyStageSchema, SchemaVersion010 } from "../contracts/shared";
import { hashCanonicalJson } from "../core/contentHash";
import { DiagnosticSchema } from "../core/diagnostics";
import { parseCachedArtifactEntry, type CachedArtifactEntry } from "../materials/artifactCache";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";
import type { PackedAtlasChannels } from "../materials/atlasPacker";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";

export const COMPLETED_FAMILY_ARTIFACT_TYPE = "completed-family";

function isTypedArrayTag(value: unknown, tag: string): boolean {
  return Object.prototype.toString.call(value) === `[object ${tag}]`;
}

const Float32ArraySchema = z.custom<Float32Array<ArrayBuffer>>((value) => isTypedArrayTag(value, "Float32Array"));
const Uint8ClampedArraySchema = z.custom<Uint8ClampedArray<ArrayBuffer>>((value) =>
  isTypedArrayTag(value, "Uint8ClampedArray")
);
const Uint16ArraySchema = z.custom<Uint16Array<ArrayBuffer>>((value) => isTypedArrayTag(value, "Uint16Array"));
const Uint32ArraySchema = z.custom<Uint32Array<ArrayBuffer>>((value) => isTypedArrayTag(value, "Uint32Array"));

const PixelLayerSchema = z.object({
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  channels: z.literal("rgba8"),
  data: Uint8ClampedArraySchema
});

const PackedAtlasChannelsSchema = z.object({
  baseColor: PixelLayerSchema,
  normal: PixelLayerSchema,
  orm: PixelLayerSchema,
  height: PixelLayerSchema,
  opacity: PixelLayerSchema
});

const PackedAtlasSlotProvenanceSchema = z.object({
  slotId: z.string(),
  sourceId: z.string(),
  providerId: z.string(),
  requestHash: z.string(),
  contentHash: z.string()
});

const AtlasDebugChannelExportSchema = z.object({
  name: AtlasChannelSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  channelHash: z.string().min(1),
  pngDataUrl: z.string().min(1)
});

const AtlasDebugSlotOverlaySchema = z.object({
  slotId: z.string(),
  sourceId: z.string(),
  role: z.string(),
  rectPx: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  providerId: z.string(),
  requestHash: z.string(),
  contentHash: z.string()
});

const AtlasDebugProviderDiagnosticSchema = z.object({
  schemaVersion: SchemaVersion010,
  providerId: z.string(),
  cacheStatus: z.enum(["generated", "cache-hit", "cache-miss"]),
  sourceCount: z.number().int().nonnegative(),
  slotCount: z.number().int().nonnegative(),
  requestHashes: z.array(z.string()),
  contentHashes: z.array(z.string()),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  diagnostics: z.array(DiagnosticSchema)
});

const AtlasDebugExportSchema = z.object({
  schemaVersion: SchemaVersion010,
  atlasId: z.string(),
  sourceContentHash: z.string(),
  exportHash: z.string(),
  channels: z.array(AtlasDebugChannelExportSchema),
  slotOverlays: z.array(AtlasDebugSlotOverlaySchema),
  providerDiagnostics: z.array(AtlasDebugProviderDiagnosticSchema),
  diagnostics: z.array(DiagnosticSchema)
});

const StylePackReferenceSchema = z.object({
  schemaVersion: SchemaVersion010,
  stylePackId: z.string().min(1),
  sourceIntentHash: z.string().min(1)
});

const PromptTraceSchema = z.object({
  schemaVersion: SchemaVersion010,
  interpreterProvider: z.literal("local-rule"),
  psgPresetId: z.literal("late19cCommercialDemo"),
  stylePackId: z.string().min(1),
  traceId: z.string().min(1),
  psgOutputs: z.array(
    z.object({
      nodeId: z.string(),
      value: z.string()
    })
  ),
  evaluatedVariables: z.array(
    z.object({
      name: z.string(),
      value: z.string().or(z.number()).or(z.boolean()).nullable()
    })
  ),
  interpreterOverrides: z.array(
    z.object({
      name: z.string(),
      value: z.string().or(z.number())
    })
  ),
  requestedControls: z.array(
    z.object({
      name: z.string(),
      value: z.string().or(z.number())
    })
  ),
  psgTrace: z.array(
    z.object({
      nodeId: z.string(),
      nodeType: z.string(),
      semanticPath: z.string(),
      inputValues: z.array(z.unknown()),
      outputValue: z.unknown(),
      selectedChoiceIndex: z.number().int().nonnegative().optional(),
      seed: z.string()
    })
  ),
  diagnostics: z.array(DiagnosticSchema)
});

const VariantStressVariantSchema = z.object({
  index: z.number().int().nonnegative(),
  buildingSeed: z.string().min(1),
  buildingId: z.string().min(1),
  sourceGraphHash: z.string().min(1),
  drawCallCount: z.number().int().nonnegative(),
  instanceCount: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  semanticPathCount: z.number().int().nonnegative()
});

const VariantStressSchema = z.object({
  schemaVersion: SchemaVersion010,
  variantCount: z.number().int().nonnegative(),
  sharedFamilyId: z.string().min(1),
  sharedAtlasId: z.string().min(1),
  sharedAtlasContentHash: z.string().min(1),
  sharedCatalogId: z.string().min(1),
  sharedSourceGraphHash: z.string().min(1),
  aggregate: z.object({
    drawCallCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    semanticPathCount: z.number().int().nonnegative()
  }),
  variants: z.array(VariantStressVariantSchema)
});

const RemoteMaterialRouteSummarySchema = z.object({
  schemaVersion: SchemaVersion010,
  status: z.enum(["generated", "fallback", "rejected"]),
  providerId: z.string().optional(),
  requestHash: z.string().optional(),
  acceptedRequestCount: z.number().int().nonnegative().optional(),
  cacheStatus: z.string().optional()
});

const AppliedRemoteMaterialSourceSummarySchema = z.object({
  sourceId: z.string().min(1),
  providerId: z.string().min(1),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  revisedPrompt: z.string().optional()
});

const RemoteMaterialApplicationSchema = z.object({
  schemaVersion: SchemaVersion010,
  route: RemoteMaterialRouteSummarySchema,
  remoteSources: z.array(AppliedRemoteMaterialSourceSummarySchema),
  diagnostics: z.array(DiagnosticSchema)
});

const CompletedFamilyArtifactsSchema = z.object({
  spec: BuildingFamilySpecSchema,
  atlasManifest: AtlasManifestSchema,
  atlasChannels: PackedAtlasChannelsSchema,
  atlasContentHash: z.string().min(1),
  atlasSlotProvenance: z.array(PackedAtlasSlotProvenanceSchema),
  componentCatalog: ComponentCatalogSchema,
  graph: BuildingGraphSchema,
  runtimeIr: z.object({
    schemaVersion: SchemaVersion010,
    buildingId: z.string(),
    familyId: z.string(),
    sourceGraphHash: z.string(),
    bounds: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()])
    }),
    meshBatches: z.array(
      z.object({
        batchId: z.string(),
        role: z.string(),
        positions: Float32ArraySchema.optional(),
        normals: Float32ArraySchema.optional(),
        uvs: Float32ArraySchema.optional(),
        indices: Uint32ArraySchema.or(Uint16ArraySchema).optional(),
        materialSlotId: z.string().optional()
      })
    ),
    instanceBatches: z.array(
      z.object({
        batchId: z.string(),
        recipeId: z.string(),
        materialSlotId: z.string(),
        transforms: Float32ArraySchema.optional(),
        count: z.number().int().nonnegative()
      })
    ),
    semanticIndex: z.array(
      z.object({
        semanticPath: z.string(),
        batchId: z.string(),
        elementIndex: z.number().int().nonnegative().optional(),
        stage: AssemblyStageSchema
      })
    ),
    metrics: z.object({
      vertexCount: z.number().int().nonnegative(),
      triangleCount: z.number().int().nonnegative(),
      instanceCount: z.number().int().nonnegative()
    })
  }) satisfies z.ZodType<RuntimeBuildingIR>,
  componentGallery: ComponentGallerySchema,
  debugExport: AtlasDebugExportSchema
});

const CompletedFamilyProvenanceSchema = z.object({
  promptTrace: PromptTraceSchema,
  variantStress: VariantStressSchema,
  remoteMaterialApplication: RemoteMaterialApplicationSchema.optional(),
  provenanceEntryCount: z.number().int().nonnegative()
});

export const CompletedFamilyPersistencePacketSchema = z.object({
  schemaVersion: SchemaVersion010,
  documentId: z.string().min(1),
  runId: z.string().min(1),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  createdAt: z.string().min(1),
  prompt: z.string().min(1).optional(),
  familyId: z.string().min(1),
  buildingId: z.string().min(1),
  stylePackReference: StylePackReferenceSchema,
  artifacts: CompletedFamilyArtifactsSchema,
  provenance: CompletedFamilyProvenanceSchema
});

export type CompletedFamilyPersistencePacket = z.infer<typeof CompletedFamilyPersistencePacketSchema>;
export type CompletedFamilyPersistenceCacheEntry = CachedArtifactEntry<CompletedFamilyPersistencePacket>;

export interface CreateCompletedFamilyPersistencePacketInput {
  documentId: string;
  runId: string;
  requestHash: string;
  fixture: AssemblyHallFixture;
  createdAt?: string;
}

export interface CompletedFamilyPersistenceCacheEntryOptions {
  createdAt?: string;
}

function stylePackReferenceFor(fixture: AssemblyHallFixture): z.infer<typeof StylePackReferenceSchema> {
  return {
    schemaVersion: "0.1.0",
    stylePackId: fixture.spec.stylePackId,
    sourceIntentHash: fixture.spec.sourceIntentHash
  };
}

async function completedFamilyContentHash(input: {
  fixture: AssemblyHallFixture;
  stylePackReference: z.infer<typeof StylePackReferenceSchema>;
}): Promise<string> {
  return hashCanonicalJson({
    schemaVersion: "0.1.0",
    prompt: input.fixture.prompt,
    familyId: input.fixture.spec.familyId,
    buildingId: input.fixture.ir.buildingId,
    stylePackReference: input.stylePackReference,
    atlasId: input.fixture.packedAtlas.atlasId,
    atlasContentHash: input.fixture.packedAtlas.contentHash,
    atlasSlotProvenance: input.fixture.packedAtlas.slotProvenance,
    componentCatalogId: input.fixture.catalog.catalogId,
    graphId: input.fixture.graph.graphId,
    runtimeIrSourceGraphHash: input.fixture.ir.sourceGraphHash,
    componentGalleryId: input.fixture.componentGallery.galleryId,
    debugExportHash: input.fixture.debugExport.exportHash,
    promptTraceId: input.fixture.promptTrace.traceId,
    variantCount: input.fixture.variantStress.variantCount,
    remoteMaterialRequestHash: input.fixture.remoteMaterialApplication?.route.requestHash,
    provenanceEntryCount: input.fixture.provenanceEntryCount
  });
}

function dependenciesFor(packet: CompletedFamilyPersistencePacket): string[] {
  return [
    packet.familyId,
    packet.artifacts.atlasManifest.atlasId,
    packet.artifacts.atlasContentHash,
    packet.artifacts.componentCatalog.catalogId,
    packet.artifacts.graph.graphId,
    packet.artifacts.runtimeIr.sourceGraphHash,
    packet.buildingId
  ];
}

export function parseCompletedFamilyPersistencePacket(input: unknown): CompletedFamilyPersistencePacket {
  const result = CompletedFamilyPersistencePacketSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid completed-family persistence packet: ${result.error.issues
        .map((issue) => issue.message)
        .join(", ")}`
    );
  }
  return result.data;
}

export async function createCompletedFamilyPersistencePacket(
  input: CreateCompletedFamilyPersistencePacketInput
): Promise<CompletedFamilyPersistencePacket> {
  const stylePackReference = stylePackReferenceFor(input.fixture);
  const contentHash = await completedFamilyContentHash({
    fixture: input.fixture,
    stylePackReference
  });

  return parseCompletedFamilyPersistencePacket({
    schemaVersion: "0.1.0",
    documentId: input.documentId,
    runId: input.runId,
    requestHash: input.requestHash,
    contentHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
    prompt: input.fixture.prompt,
    familyId: input.fixture.spec.familyId,
    buildingId: input.fixture.ir.buildingId,
    stylePackReference,
    artifacts: {
      spec: input.fixture.spec,
      atlasManifest: input.fixture.packedAtlas.manifest,
      atlasChannels: input.fixture.packedAtlas.channels as PackedAtlasChannels,
      atlasContentHash: input.fixture.packedAtlas.contentHash,
      atlasSlotProvenance: input.fixture.packedAtlas.slotProvenance,
      componentCatalog: input.fixture.catalog,
      graph: input.fixture.graph,
      runtimeIr: input.fixture.ir,
      componentGallery: input.fixture.componentGallery,
      debugExport: input.fixture.debugExport as AtlasDebugExport
    },
    provenance: {
      promptTrace: input.fixture.promptTrace,
      variantStress: input.fixture.variantStress,
      remoteMaterialApplication: input.fixture.remoteMaterialApplication,
      provenanceEntryCount: input.fixture.provenanceEntryCount
    }
  });
}

export function completedFamilyPersistenceCacheEntry(
  packet: CompletedFamilyPersistencePacket,
  options: CompletedFamilyPersistenceCacheEntryOptions = {}
): CompletedFamilyPersistenceCacheEntry {
  return parseCachedArtifactEntry<CompletedFamilyPersistencePacket>({
    schemaVersion: "0.1.0",
    artifactType: COMPLETED_FAMILY_ARTIFACT_TYPE,
    requestHash: packet.requestHash,
    contentHash: packet.contentHash,
    dependencies: dependenciesFor(packet),
    createdAt: options.createdAt ?? packet.createdAt,
    artifact: packet
  });
}
