import { canonicalJson } from "../core/canonicalJson";
import { sha256Hex } from "../core/contentHash";
import type { AtlasChannel } from "../contracts/atlasManifest";
import type { PackedAtlas, PackedAtlasChannels } from "./atlasPacker";
import type { PixelLayer } from "./providers/proceduralMaterialProvider";

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const channelOrder: Array<keyof PackedAtlasChannels> = ["baseColor", "normal", "orm", "height", "opacity"];
type ByteArray = Uint8Array<ArrayBufferLike>;

export interface AtlasDebugChannelExport {
  name: AtlasChannel;
  widthPx: number;
  heightPx: number;
  byteLength: number;
  channelHash: string;
  pngDataUrl: string;
}

export interface AtlasDebugSlotOverlay {
  slotId: string;
  sourceId: string;
  role: string;
  rectPx: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  providerId: string;
  requestHash: string;
  contentHash: string;
}

export type AtlasProviderCacheStatus = "generated" | "cache-hit" | "cache-miss";

export interface AtlasDebugProviderDiagnostic {
  schemaVersion: "0.1.0";
  providerId: string;
  cacheStatus: AtlasProviderCacheStatus;
  sourceCount: number;
  slotCount: number;
  requestHashes: string[];
  contentHashes: string[];
  warningCount: number;
  errorCount: number;
  diagnostics: PackedAtlas["diagnostics"];
}

export interface AtlasDebugExport {
  schemaVersion: "0.1.0";
  atlasId: string;
  sourceContentHash: string;
  exportHash: string;
  channels: AtlasDebugChannelExport[];
  slotOverlays: AtlasDebugSlotOverlay[];
  providerDiagnostics: AtlasDebugProviderDiagnostic[];
  diagnostics: PackedAtlas["diagnostics"];
}

function uint32BigEndian(value: number): ByteArray {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concatBytes(chunks: ByteArray[]): ByteArray {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function crc32(bytes: ByteArray): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: ByteArray): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function makeChunk(type: string, data: ByteArray = new Uint8Array()): ByteArray {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concatBytes([typeBytes, data]);
  return concatBytes([uint32BigEndian(data.byteLength), typeBytes, data, uint32BigEndian(crc32(crcInput))]);
}

function scanlineBytes(layer: PixelLayer): ByteArray {
  const rowLength = layer.widthPx * 4;
  const bytes = new Uint8Array((rowLength + 1) * layer.heightPx);
  let outputOffset = 0;
  for (let y = 0; y < layer.heightPx; y += 1) {
    bytes[outputOffset] = 0;
    outputOffset += 1;
    bytes.set(layer.data.slice(y * rowLength, y * rowLength + rowLength), outputOffset);
    outputOffset += rowLength;
  }
  return bytes;
}

function uncompressedZlib(bytes: ByteArray): ByteArray {
  const blocks: ByteArray[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < bytes.byteLength; offset += 65535) {
    const length = Math.min(65535, bytes.byteLength - offset);
    const isFinal = offset + length >= bytes.byteLength;
    const header = new Uint8Array(5);
    header[0] = isFinal ? 1 : 0;
    header[1] = length & 255;
    header[2] = (length >>> 8) & 255;
    const inverse = 0xffff ^ length;
    header[3] = inverse & 255;
    header[4] = (inverse >>> 8) & 255;
    blocks.push(header, bytes.slice(offset, offset + length));
  }
  blocks.push(uint32BigEndian(adler32(bytes)));
  return concatBytes(blocks);
}

function encodePng(layer: PixelLayer): ByteArray {
  const ihdr = new Uint8Array(13);
  ihdr.set(uint32BigEndian(layer.widthPx), 0);
  ihdr.set(uint32BigEndian(layer.heightPx), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concatBytes([
    pngSignature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", uncompressedZlib(scanlineBytes(layer))),
    makeChunk("IEND")
  ]);
}

function base64(bytes: ByteArray): string {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += base64Alphabet[(triple >>> 18) & 63];
    output += base64Alphabet[(triple >>> 12) & 63];
    output += index + 1 < bytes.byteLength ? base64Alphabet[(triple >>> 6) & 63] : "=";
    output += index + 2 < bytes.byteLength ? base64Alphabet[triple & 63] : "=";
  }
  return output;
}

function channelPayload(name: string, layer: PixelLayer): ByteArray {
  const header = new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`);
  const data = new Uint8Array(layer.data.byteLength);
  data.set(layer.data);
  return concatBytes([header, data]);
}

function overlayFor(packedAtlas: PackedAtlas): AtlasDebugSlotOverlay[] {
  const provenanceBySlot = new Map(packedAtlas.slotProvenance.map((entry) => [entry.slotId, entry]));
  return packedAtlas.manifest.slots.map((slot) => {
    const provenance = provenanceBySlot.get(slot.id);
    if (!provenance) {
      throw new Error(`Missing slot provenance for ${slot.id}`);
    }
    return {
      slotId: slot.id,
      sourceId: slot.materialSourceId,
      role: slot.role,
      rectPx: slot.rectPx,
      providerId: provenance.providerId,
      requestHash: provenance.requestHash,
      contentHash: provenance.contentHash
    };
  });
}

interface ProviderDiagnosticBucket {
  providerId: string;
  slotIds: Set<string>;
  sourceIds: Set<string>;
  requestHashes: Set<string>;
  contentHashes: Set<string>;
}

function sortedValues(values: Set<string>): string[] {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function diagnosticsForProvider(
  diagnostics: PackedAtlas["diagnostics"],
  bucket: ProviderDiagnosticBucket
): PackedAtlas["diagnostics"] {
  const slotIds = sortedValues(bucket.slotIds);
  const sourceIds = sortedValues(bucket.sourceIds);
  return diagnostics.filter((diagnostic) => {
    const diagnosticText = `${diagnostic.code} ${diagnostic.message} ${diagnostic.path ?? ""} ${
      diagnostic.received === undefined ? "" : String(diagnostic.received)
    }`;
    return (
      diagnosticText.includes(bucket.providerId) ||
      slotIds.some((slotId) => diagnosticText.includes(slotId)) ||
      sourceIds.some((sourceId) => diagnosticText.includes(sourceId))
    );
  });
}

function providerDiagnosticsFor(packedAtlas: PackedAtlas): AtlasDebugProviderDiagnostic[] {
  const buckets = new Map<string, ProviderDiagnosticBucket>();

  for (const provenance of packedAtlas.slotProvenance) {
    const bucket = buckets.get(provenance.providerId) ?? {
      providerId: provenance.providerId,
      slotIds: new Set<string>(),
      sourceIds: new Set<string>(),
      requestHashes: new Set<string>(),
      contentHashes: new Set<string>()
    };
    bucket.slotIds.add(provenance.slotId);
    bucket.sourceIds.add(provenance.sourceId);
    bucket.requestHashes.add(provenance.requestHash);
    bucket.contentHashes.add(provenance.contentHash);
    buckets.set(provenance.providerId, bucket);
  }

  return Array.from(buckets.values())
    .sort((left, right) => left.providerId.localeCompare(right.providerId))
    .map((bucket): AtlasDebugProviderDiagnostic => {
      const diagnostics = diagnosticsForProvider(packedAtlas.diagnostics, bucket);
      return {
        schemaVersion: "0.1.0",
        providerId: bucket.providerId,
        cacheStatus: "generated",
        sourceCount: bucket.sourceIds.size,
        slotCount: bucket.slotIds.size,
        requestHashes: sortedValues(bucket.requestHashes),
        contentHashes: sortedValues(bucket.contentHashes),
        warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
        errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
        diagnostics
      };
    });
}

export async function createAtlasDebugExport(packedAtlas: PackedAtlas): Promise<AtlasDebugExport> {
  const channels = await Promise.all(
    channelOrder.map(async (name): Promise<AtlasDebugChannelExport> => {
      const layer = packedAtlas.channels[name];
      const pngBytes = encodePng(layer);
      return {
        name,
        widthPx: layer.widthPx,
        heightPx: layer.heightPx,
        byteLength: layer.data.byteLength,
        channelHash: await sha256Hex(channelPayload(name, layer)),
        pngDataUrl: `data:image/png;base64,${base64(pngBytes)}`
      };
    })
  );
  const slotOverlays = overlayFor(packedAtlas);
  const providerDiagnostics = providerDiagnosticsFor(packedAtlas);
  const exportHash = await sha256Hex(
    canonicalJson({
      schemaVersion: "0.1.0",
      atlasId: packedAtlas.atlasId,
      sourceContentHash: packedAtlas.contentHash,
      channelHashes: channels.map((channel) => [channel.name, channel.channelHash]),
      slotOverlays,
      providerDiagnostics,
      diagnostics: packedAtlas.diagnostics
    })
  );

  return {
    schemaVersion: "0.1.0",
    atlasId: packedAtlas.atlasId,
    sourceContentHash: packedAtlas.contentHash,
    exportHash,
    channels,
    slotOverlays,
    providerDiagnostics,
    diagnostics: packedAtlas.diagnostics
  };
}
