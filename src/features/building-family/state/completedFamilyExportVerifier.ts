import { z } from "zod";
import { compileBuilding } from "../compiler/buildingCompiler";
import { type AtlasChannel } from "../contracts/atlasManifest";
import { canonicalJson } from "../core/canonicalJson";
import { sha256Hex } from "../core/contentHash";
import {
  parseCompletedFamilyExportBundle,
  type CompletedFamilyExportBundle
} from "./completedFamilyExportBundle";

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const pngDataUrlPrefix = "data:image/png;base64,";
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type VerificationStatus = "passed" | "failed";

interface RgbaPixelLayer {
  widthPx: number;
  heightPx: number;
  channels: "rgba8";
  data: Uint8ClampedArray;
}

interface VerificationCheckInput {
  actual?: string;
  code: string;
  expected?: string;
  message: string;
  status: VerificationStatus;
}

export const CompletedFamilyExportVerificationCheckSchema = z.object({
  code: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  message: z.string().min(1),
  expected: z.string().optional(),
  actual: z.string().optional()
});

export const CompletedFamilyExportVerificationReportSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  verificationType: z.literal("completed-family-export-reproduction"),
  status: z.enum(["verified", "failed"]),
  documentId: z.string().min(1),
  runId: z.string().min(1),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  reproduced: z.object({
    familyId: z.string().min(1),
    buildingId: z.string().min(1),
    atlasId: z.string().min(1),
    atlasContentHash: z.string().min(1),
    componentCatalogId: z.string().min(1),
    graphId: z.string().min(1),
    sourceGraphHash: z.string().min(1),
    channelCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    drawCallCount: z.number().int().nonnegative(),
    semanticPathCount: z.number().int().nonnegative()
  }),
  checks: z.array(CompletedFamilyExportVerificationCheckSchema)
});

export type CompletedFamilyExportVerificationCheck = z.infer<
  typeof CompletedFamilyExportVerificationCheckSchema
>;
export type CompletedFamilyExportVerificationReport = z.infer<
  typeof CompletedFamilyExportVerificationReportSchema
>;

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function checkStatus(actual: string, expected: string): VerificationStatus {
  return actual === expected ? "passed" : "failed";
}

function addEqualityCheck(
  checks: VerificationCheckInput[],
  code: string,
  actual: string,
  expected: string,
  message: string
): void {
  checks.push({
    code,
    status: checkStatus(actual, expected),
    message,
    expected,
    actual
  });
}

function addCheck(
  checks: VerificationCheckInput[],
  code: string,
  status: VerificationStatus,
  message: string,
  values: { actual?: string; expected?: string } = {}
): void {
  checks.push({
    code,
    status,
    message,
    ...values
  });
}

function base64Value(character: string): number {
  const value = base64Alphabet.indexOf(character);
  if (value < 0) {
    throw new Error(`Invalid base64 character: ${character}`);
  }
  return value;
}

function decodeBase64(input: string): Uint8Array {
  const normalized = input.replace(/\s+/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Base64 payload length must be divisible by four.");
  }

  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const first = base64Value(normalized[index]);
    const second = base64Value(normalized[index + 1]);
    const third = normalized[index + 2] === "=" ? 0 : base64Value(normalized[index + 2]);
    const fourth = normalized[index + 3] === "=" ? 0 : base64Value(normalized[index + 3]);
    const triple = (first << 18) | (second << 12) | (third << 6) | fourth;
    output.push((triple >>> 16) & 255);
    if (normalized[index + 2] !== "=") {
      output.push((triple >>> 8) & 255);
    }
    if (normalized[index + 3] !== "=") {
      output.push(triple & 255);
    }
  }

  return new Uint8Array(output);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function textFromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function assertPngSignature(bytes: Uint8Array): void {
  if (bytes.byteLength < pngSignature.byteLength) {
    throw new Error("PNG payload is too short.");
  }
  for (let index = 0; index < pngSignature.byteLength; index += 1) {
    if (bytes[index] !== pngSignature[index]) {
      throw new Error("PNG signature mismatch.");
    }
  }
}

function inflateStoredZlib(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 6) {
    throw new Error("Zlib payload is too short.");
  }
  if (bytes[0] !== 0x78 || bytes[1] !== 0x01) {
    throw new Error("Only stored zlib streams are supported for completed-family exports.");
  }

  const chunks: Uint8Array[] = [];
  let offset = 2;
  let isFinal = false;
  while (!isFinal) {
    if (offset + 5 > bytes.byteLength) {
      throw new Error("Stored zlib block is incomplete.");
    }
    const header = bytes[offset];
    offset += 1;
    isFinal = (header & 1) === 1;
    if (((header >>> 1) & 3) !== 0) {
      throw new Error("Only uncompressed deflate blocks are supported.");
    }

    const length = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
    const inverseLength = (bytes[offset + 2] ?? 0) | ((bytes[offset + 3] ?? 0) << 8);
    offset += 4;
    if ((length ^ 0xffff) !== inverseLength) {
      throw new Error("Stored zlib block length check failed.");
    }
    if (offset + length > bytes.byteLength) {
      throw new Error("Stored zlib block data is incomplete.");
    }
    chunks.push(bytes.slice(offset, offset + length));
    offset += length;
  }

  if (offset + 4 > bytes.byteLength) {
    throw new Error("Stored zlib stream is missing its Adler-32 trailer.");
  }

  return concatBytes(chunks);
}

function decodePortablePngChannel(
  channel: CompletedFamilyExportBundle["atlas"]["channels"][number]
): RgbaPixelLayer {
  if (!channel.pngDataUrl.startsWith(pngDataUrlPrefix)) {
    throw new Error("Atlas channel is not a PNG data URL.");
  }

  const bytes = decodeBase64(channel.pngDataUrl.slice(pngDataUrlPrefix.length));
  assertPngSignature(bytes);

  let offset = pngSignature.byteLength;
  let widthPx = 0;
  let heightPx = 0;
  const idatChunks: Uint8Array[] = [];
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) {
      throw new Error("PNG chunk header is incomplete.");
    }
    const chunkLength = readUint32BigEndian(bytes, offset);
    const chunkType = textFromBytes(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd + 4 > bytes.byteLength) {
      throw new Error(`PNG ${chunkType} chunk is incomplete.`);
    }
    const chunkData = bytes.slice(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (chunkType === "IHDR") {
      if (chunkData.byteLength !== 13) {
        throw new Error("PNG IHDR chunk has an invalid length.");
      }
      widthPx = readUint32BigEndian(chunkData, 0);
      heightPx = readUint32BigEndian(chunkData, 4);
      if (chunkData[8] !== 8 || chunkData[9] !== 6 || chunkData[10] !== 0 || chunkData[11] !== 0 || chunkData[12] !== 0) {
        throw new Error("Only 8-bit RGBA PNG channels are supported.");
      }
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (widthPx !== channel.widthPx || heightPx !== channel.heightPx) {
    throw new Error("PNG dimensions do not match channel metadata.");
  }
  const scanlines = inflateStoredZlib(concatBytes(idatChunks));
  const rowLength = widthPx * 4;
  const expectedLength = (rowLength + 1) * heightPx;
  if (scanlines.byteLength !== expectedLength) {
    throw new Error("PNG scanline payload length does not match channel dimensions.");
  }

  const data = new Uint8ClampedArray(rowLength * heightPx);
  let inputOffset = 0;
  for (let row = 0; row < heightPx; row += 1) {
    if (scanlines[inputOffset] !== 0) {
      throw new Error("Only PNG filter type 0 is supported.");
    }
    inputOffset += 1;
    data.set(scanlines.slice(inputOffset, inputOffset + rowLength), row * rowLength);
    inputOffset += rowLength;
  }

  return {
    widthPx,
    heightPx,
    channels: "rgba8",
    data
  };
}

function channelPayload(name: string, layer: RgbaPixelLayer): Uint8Array {
  return concatBytes([
    new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`),
    new Uint8Array(layer.data)
  ]);
}

async function channelHash(name: string, layer: RgbaPixelLayer): Promise<string> {
  return sha256Hex(channelPayload(name, layer));
}

async function atlasContentHash(input: {
  channels: Partial<Record<AtlasChannel, RgbaPixelLayer>>;
  slotProvenance: CompletedFamilyExportBundle["atlas"]["slotProvenance"];
}): Promise<string> {
  const chunks: Uint8Array[] = [
    new TextEncoder().encode(canonicalJson({ schemaVersion: "0.1.0", slotProvenance: input.slotProvenance }))
  ];
  const channelNames = Object.keys(input.channels).sort() as AtlasChannel[];

  for (const name of channelNames) {
    const layer = input.channels[name];
    if (!layer) {
      continue;
    }
    chunks.push(channelPayload(name, layer));
  }

  return sha256Hex(concatBytes(chunks));
}

function formatList(values: string[]): string {
  return canonicalJson(values);
}

function statusFor(checks: VerificationCheckInput[]): "verified" | "failed" {
  return checks.every((check) => check.status === "passed") ? "verified" : "failed";
}

export async function verifyCompletedFamilyExportBundle(
  input: unknown
): Promise<CompletedFamilyExportVerificationReport> {
  const bundle = parseCompletedFamilyExportBundle(input);
  const checks: VerificationCheckInput[] = [];
  const decodedChannels: Partial<Record<AtlasChannel, RgbaPixelLayer>> = {};

  addEqualityCheck(
    checks,
    "atlas.channelSet",
    formatList(bundle.atlas.channels.map((channel) => channel.name)),
    formatList(bundle.atlas.manifest.channels),
    "Exported atlas channel order matches the manifest."
  );

  const manifestSlotIds = new Set(bundle.atlas.manifest.slots.map((slot) => slot.id));
  const provenanceSlotIds = new Set(bundle.atlas.slotProvenance.map((entry) => entry.slotId));
  addEqualityCheck(
    checks,
    "atlas.slotProvenance",
    String(Array.from(manifestSlotIds).every((slotId) => provenanceSlotIds.has(slotId))),
    "true",
    "Every manifest slot has portable provenance."
  );

  for (const channel of bundle.atlas.channels) {
    try {
      const layer = decodePortablePngChannel(channel);
      decodedChannels[channel.name] = layer;
      addEqualityCheck(
        checks,
        `atlas.channelHash.${channel.name}`,
        await channelHash(channel.name, layer),
        channel.channelHash,
        `${channel.name} PNG bytes reproduce the exported channel hash.`
      );
      addEqualityCheck(
        checks,
        `atlas.channelSize.${channel.name}`,
        `${layer.widthPx}x${layer.heightPx}:${layer.data.byteLength}`,
        `${bundle.atlas.manifest.widthPx}x${bundle.atlas.manifest.heightPx}:${channel.byteLength}`,
        `${channel.name} PNG dimensions match the manifest and byte length.`
      );
    } catch (error) {
      addCheck(
        checks,
        `atlas.channelHash.${channel.name}`,
        "failed",
        error instanceof Error ? error.message : `${channel.name} channel could not be decoded.`
      );
    }
  }

  const computedAtlasContentHash = await atlasContentHash({
    channels: decodedChannels,
    slotProvenance: bundle.atlas.slotProvenance
  });
  addEqualityCheck(
    checks,
    "atlas.contentHash",
    computedAtlasContentHash,
    bundle.atlas.contentHash,
    "Decoded portable atlas channels reproduce the packed atlas content hash."
  );

  const ir = await compileBuilding({
    spec: bundle.spec,
    catalog: bundle.componentCatalog,
    graph: bundle.graph,
    buildingId: bundle.buildingId
  });
  const firstVariant = bundle.provenance.variantStress.variants.find((variant) => variant.index === 0);
  const drawCallCount = ir.meshBatches.length + ir.instanceBatches.length;
  const semanticPathCount = ir.semanticIndex.length;

  addEqualityCheck(
    checks,
    "building.sourceGraphHash",
    ir.sourceGraphHash,
    firstVariant?.sourceGraphHash ?? "",
    "Compiling the exported graph reproduces the recorded source graph hash."
  );
  addEqualityCheck(
    checks,
    "building.metrics",
    canonicalJson({
      drawCallCount,
      instanceCount: ir.metrics.instanceCount,
      semanticPathCount,
      triangleCount: ir.metrics.triangleCount
    }),
    canonicalJson({
      drawCallCount: firstVariant?.drawCallCount ?? -1,
      instanceCount: firstVariant?.instanceCount ?? -1,
      semanticPathCount: firstVariant?.semanticPathCount ?? -1,
      triangleCount: firstVariant?.triangleCount ?? -1
    }),
    "Compiling the exported graph reproduces the recorded building metrics."
  );

  return CompletedFamilyExportVerificationReportSchema.parse({
    schemaVersion: "0.1.0",
    verificationType: "completed-family-export-reproduction",
    status: statusFor(checks),
    documentId: bundle.documentId,
    runId: bundle.runId,
    requestHash: bundle.requestHash,
    contentHash: bundle.contentHash,
    reproduced: {
      familyId: bundle.familyId,
      buildingId: ir.buildingId,
      atlasId: bundle.atlas.manifest.atlasId,
      atlasContentHash: computedAtlasContentHash,
      componentCatalogId: bundle.componentCatalog.catalogId,
      graphId: bundle.graph.graphId,
      sourceGraphHash: ir.sourceGraphHash,
      channelCount: bundle.atlas.channels.length,
      triangleCount: ir.metrics.triangleCount,
      instanceCount: ir.metrics.instanceCount,
      drawCallCount,
      semanticPathCount
    },
    checks
  });
}
