import { AtlasManifestSchema, type AtlasManifest, type AtlasSlot } from "../contracts/atlasManifest";
import type { Diagnostic } from "../core/diagnostics";
import { sha256Hex } from "../core/contentHash";
import { canonicalJson } from "../core/canonicalJson";
import type { AtlasPlan } from "./atlasPlanner";
import { validateAtlasPlan } from "./atlasPlanner";
import { normalFromHeight } from "./normalFromHeight";
import { blendPeriodicEdges } from "./periodicBlend";
import type { MaterialSourceArtifact, PixelLayer } from "./providers/proceduralMaterialProvider";

export interface PackedAtlasChannels {
  baseColor: PixelLayer;
  normal: PixelLayer;
  orm: PixelLayer;
  height: PixelLayer;
  opacity: PixelLayer;
}

export interface PackedAtlasSlotProvenance {
  slotId: string;
  sourceId: string;
  providerId: string;
  requestHash: string;
  contentHash: string;
}

export interface PackedAtlas {
  schemaVersion: "0.1.0";
  atlasId: string;
  manifest: AtlasManifest;
  channels: PackedAtlasChannels;
  slotProvenance: PackedAtlasSlotProvenance[];
  contentHash: string;
  diagnostics: Diagnostic[];
}

function pixelOffset(layer: PixelLayer, x: number, y: number): number {
  return (y * layer.widthPx + x) * 4;
}

function makeLayer(widthPx: number, heightPx: number, rgba: [number, number, number, number]): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { widthPx, heightPx, channels: "rgba8", data };
}

function solidSourceLayer(widthPx: number, heightPx: number, value: number, alpha = 255): PixelLayer {
  return makeLayer(widthPx, heightPx, [value, value, value, alpha]);
}

function readPixel(layer: PixelLayer, x: number, y: number): [number, number, number, number] {
  const offset = pixelOffset(layer, x, y);
  return [layer.data[offset], layer.data[offset + 1], layer.data[offset + 2], layer.data[offset + 3]];
}

function writePixel(layer: PixelLayer, x: number, y: number, rgba: [number, number, number, number]): void {
  const offset = pixelOffset(layer, x, y);
  layer.data[offset] = rgba[0];
  layer.data[offset + 1] = rgba[1];
  layer.data[offset + 2] = rgba[2];
  layer.data[offset + 3] = rgba[3];
}

function copyPixel(source: PixelLayer, sourceX: number, sourceY: number, target: PixelLayer, targetX: number, targetY: number): void {
  writePixel(target, targetX, targetY, readPixel(source, sourceX, sourceY));
}

function sourceCoordinate(targetOffset: number, targetSize: number, sourceSize: number): number {
  if (targetSize <= 1 || sourceSize <= 1) {
    return 0;
  }
  return Math.min(sourceSize - 1, Math.floor((targetOffset / targetSize) * sourceSize));
}

function atlasChannelsFor(manifest: AtlasManifest): PackedAtlasChannels {
  return {
    baseColor: makeLayer(manifest.widthPx, manifest.heightPx, [0, 0, 0, 0]),
    normal: makeLayer(manifest.widthPx, manifest.heightPx, [128, 128, 255, 255]),
    orm: makeLayer(manifest.widthPx, manifest.heightPx, [255, 128, 0, 255]),
    height: makeLayer(manifest.widthPx, manifest.heightPx, [128, 128, 128, 255]),
    opacity: makeLayer(manifest.widthPx, manifest.heightPx, [255, 255, 255, 255])
  };
}

function opacityFromBaseColor(baseColor: PixelLayer): PixelLayer {
  const data = new Uint8ClampedArray(baseColor.widthPx * baseColor.heightPx * 4);
  for (let y = 0; y < baseColor.heightPx; y += 1) {
    for (let x = 0; x < baseColor.widthPx; x += 1) {
      const alpha = baseColor.data[pixelOffset(baseColor, x, y) + 3];
      const offset = pixelOffset({ ...baseColor, data }, x, y);
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = alpha;
    }
  }
  return { widthPx: baseColor.widthPx, heightPx: baseColor.heightPx, channels: "rgba8", data };
}

function packOrm(roughness: PixelLayer, metalness: PixelLayer): PixelLayer {
  const data = new Uint8ClampedArray(roughness.widthPx * roughness.heightPx * 4);
  for (let y = 0; y < roughness.heightPx; y += 1) {
    for (let x = 0; x < roughness.widthPx; x += 1) {
      const offset = pixelOffset(roughness, x, y);
      data[offset] = 255;
      data[offset + 1] = roughness.data[offset];
      data[offset + 2] = metalness.data[pixelOffset(metalness, x, y)];
      data[offset + 3] = 255;
    }
  }
  return { widthPx: roughness.widthPx, heightPx: roughness.heightPx, channels: "rgba8", data };
}

function assertLayerDimensions(artifact: MaterialSourceArtifact, layer: PixelLayer, layerName: string): Diagnostic | undefined {
  if (layer.widthPx === artifact.widthPx && layer.heightPx === artifact.heightPx) {
    return undefined;
  }

  return {
    code: "atlasPacker.layerDimensionMismatch",
    message: `Material source ${artifact.sourceId} layer ${layerName} does not match artifact dimensions.`,
    severity: "error",
    path: `sources.${artifact.sourceId}.layers.${layerName}`,
    received: `${layer.widthPx}x${layer.heightPx}`
  };
}

function sourceLayersFor(slot: AtlasSlot, artifact: MaterialSourceArtifact): {
  channels: PackedAtlasChannels;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  for (const [name, layer] of Object.entries(artifact.layers)) {
    if (!layer) {
      continue;
    }
    const diagnostic = assertLayerDimensions(artifact, layer, name);
    if (diagnostic) {
      diagnostics.push(diagnostic);
    }
  }

  const baseColor = blendPeriodicEdges(artifact.layers.baseColor, slot.periodicity);
  const height = blendPeriodicEdges(
    artifact.layers.height ?? solidSourceLayer(artifact.widthPx, artifact.heightPx, 128),
    slot.periodicity
  );
  const roughness = blendPeriodicEdges(
    artifact.layers.roughness ?? solidSourceLayer(artifact.widthPx, artifact.heightPx, 128),
    slot.periodicity
  );
  const metalness = blendPeriodicEdges(
    artifact.layers.metalness ?? solidSourceLayer(artifact.widthPx, artifact.heightPx, 0),
    slot.periodicity
  );
  const opacity = blendPeriodicEdges(artifact.layers.opacity ?? opacityFromBaseColor(baseColor), slot.periodicity);
  const normal = normalFromHeight(height, {
    wrapX: slot.periodicity === "x" || slot.periodicity === "xy",
    wrapY: slot.periodicity === "xy"
  });

  return {
    channels: {
      baseColor,
      normal,
      orm: packOrm(roughness, metalness),
      height,
      opacity
    },
    diagnostics
  };
}

function compositeLayer(target: PixelLayer, source: PixelLayer, rect: AtlasSlot["rectPx"]): void {
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      copyPixel(
        source,
        sourceCoordinate(x, rect.width, source.widthPx),
        sourceCoordinate(y, rect.height, source.heightPx),
        target,
        rect.x + x,
        rect.y + y
      );
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dilateLayer(layer: PixelLayer, rect: AtlasSlot["rectPx"], paddingPx: number): void {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;

  for (let y = rect.y; y <= bottom; y += 1) {
    for (let distance = 1; distance <= paddingPx; distance += 1) {
      if (rect.x - distance >= 0) {
        copyPixel(layer, rect.x, y, layer, rect.x - distance, y);
      }
      if (right + distance < layer.widthPx) {
        copyPixel(layer, right, y, layer, right + distance, y);
      }
    }
  }

  for (let x = rect.x - paddingPx; x <= right + paddingPx; x += 1) {
    const sourceX = clamp(x, rect.x, right);
    for (let distance = 1; distance <= paddingPx; distance += 1) {
      if (rect.y - distance >= 0) {
        copyPixel(layer, sourceX, rect.y, layer, clamp(x, 0, layer.widthPx - 1), rect.y - distance);
      }
      if (bottom + distance < layer.heightPx) {
        copyPixel(layer, sourceX, bottom, layer, clamp(x, 0, layer.widthPx - 1), bottom + distance);
      }
    }
  }
}

function compositeSlot(target: PackedAtlasChannels, slot: AtlasSlot, source: PackedAtlasChannels, paddingPx: number): void {
  compositeLayer(target.baseColor, source.baseColor, slot.rectPx);
  compositeLayer(target.normal, source.normal, slot.rectPx);
  compositeLayer(target.orm, source.orm, slot.rectPx);
  compositeLayer(target.height, source.height, slot.rectPx);
  compositeLayer(target.opacity, source.opacity, slot.rectPx);

  dilateLayer(target.baseColor, slot.rectPx, paddingPx);
  dilateLayer(target.normal, slot.rectPx, paddingPx);
  dilateLayer(target.orm, slot.rectPx, paddingPx);
  dilateLayer(target.height, slot.rectPx, paddingPx);
  dilateLayer(target.opacity, slot.rectPx, paddingPx);
}

function channelBytes(channels: PackedAtlasChannels, slotProvenance: PackedAtlasSlotProvenance[]): Uint8Array {
  const chunks: Uint8Array[] = [
    new TextEncoder().encode(canonicalJson({ schemaVersion: "0.1.0", slotProvenance }))
  ];
  let total = chunks[0].byteLength;
  const channelNames = Object.keys(channels).sort() as Array<keyof PackedAtlasChannels>;

  for (const name of channelNames) {
    const layer = channels[name];
    const header = new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`);
    const bytes = new Uint8Array(layer.data.byteLength);
    bytes.set(layer.data);
    chunks.push(header, bytes);
    total += header.byteLength + bytes.byteLength;
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function packAtlas(plan: AtlasPlan, artifacts: MaterialSourceArtifact[]): Promise<PackedAtlas> {
  const manifest = AtlasManifestSchema.parse(plan.manifest);
  const diagnostics: Diagnostic[] = [...plan.diagnostics, ...validateAtlasPlan(plan)];
  const artifactsBySource = new Map(artifacts.map((artifact) => [artifact.sourceId, artifact]));
  const channels = atlasChannelsFor(manifest);
  const slotProvenance: PackedAtlasSlotProvenance[] = [];

  for (const slot of manifest.slots) {
    const artifact = artifactsBySource.get(slot.materialSourceId);
    if (!artifact) {
      diagnostics.push({
        code: "atlasPacker.missingMaterialSource",
        message: `Atlas slot ${slot.id} references missing material source ${slot.materialSourceId}.`,
        severity: "error",
        path: `slots.${slot.id}.materialSourceId`,
        received: slot.materialSourceId
      });
      continue;
    }

    const source = sourceLayersFor(slot, artifact);
    diagnostics.push(...source.diagnostics);
    compositeSlot(channels, slot, source.channels, manifest.paddingPx);
    slotProvenance.push({
      slotId: slot.id,
      sourceId: artifact.sourceId,
      providerId: artifact.providerId,
      requestHash: artifact.requestHash,
      contentHash: artifact.contentHash
    });
  }

  const contentHash = await sha256Hex(channelBytes(channels, slotProvenance));

  return {
    schemaVersion: "0.1.0",
    atlasId: manifest.atlasId,
    manifest,
    channels,
    slotProvenance,
    contentHash,
    diagnostics
  };
}
