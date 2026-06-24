import { ClampToEdgeWrapping, DataTexture, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import type { AtlasSlot } from "../contracts/atlasManifest";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";
import type { PackedAtlas, PackedAtlasChannels } from "../materials/atlasPacker";
import type { PixelLayer } from "../materials/providers/proceduralMaterialProvider";

export type AtlasChannelTextureName = keyof PackedAtlasChannels;

export interface AtlasChannelHashMap {
  baseColor: string;
  normal: string;
  orm: string;
  height: string;
  opacity: string;
}

export interface AtlasTextureSet {
  atlasId: string;
  contentHash: string;
  textures: Record<AtlasChannelTextureName, DataTexture>;
  channelHashes: AtlasChannelHashMap;
  slots: Map<string, AtlasSlot>;
  disposed: boolean;
  dispose(): void;
}

export interface AtlasTextureSetInput {
  packedAtlas: PackedAtlas;
  debugExport?: AtlasDebugExport;
}

export interface AtlasSlotTextureWindow {
  slotId: string;
  rectPx: AtlasSlot["rectPx"];
  uvMode: AtlasSlot["uvMode"];
  periodicity: AtlasSlot["periodicity"];
  physicalSizeM: AtlasSlot["physicalSizeM"];
  uvRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const channelNames: AtlasChannelTextureName[] = ["baseColor", "normal", "orm", "height", "opacity"];

function channelHashesFrom(debugExport: AtlasDebugExport | undefined): AtlasChannelHashMap {
  const hashes = Object.fromEntries(debugExport?.channels.map((channel) => [channel.name, channel.channelHash]) ?? []);
  return {
    baseColor: hashes.baseColor ?? "",
    normal: hashes.normal ?? "",
    orm: hashes.orm ?? "",
    height: hashes.height ?? "",
    opacity: hashes.opacity ?? ""
  };
}

function textureData(layer: PixelLayer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(layer.data) as Uint8Array<ArrayBuffer>;
}

function createChannelTexture(
  name: AtlasChannelTextureName,
  layer: PixelLayer,
  input: AtlasTextureSetInput,
  channelHash: string
): DataTexture {
  const texture = new DataTexture(textureData(layer), layer.widthPx, layer.heightPx, RGBAFormat, UnsignedByteType);
  texture.name = `atlas.${name}`;
  texture.colorSpace = name === "baseColor" ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.userData = {
    atlasId: input.packedAtlas.atlasId,
    atlasContentHash: input.packedAtlas.contentHash,
    channel: name,
    channelHash,
    rendererBoundary: "building-family"
  };
  return texture;
}

export function createAtlasTextureSet(input: AtlasTextureSetInput): AtlasTextureSet {
  const channelHashes = channelHashesFrom(input.debugExport);
  const textures = Object.fromEntries(
    channelNames.map((name) => [
      name,
      createChannelTexture(name, input.packedAtlas.channels[name], input, channelHashes[name])
    ])
  ) as Record<AtlasChannelTextureName, DataTexture>;
  const slots = new Map(input.packedAtlas.manifest.slots.map((slot) => [slot.id, slot]));
  const textureSet: AtlasTextureSet = {
    atlasId: input.packedAtlas.atlasId,
    contentHash: input.packedAtlas.contentHash,
    textures,
    channelHashes,
    slots,
    disposed: false,
    dispose: () => {
      if (textureSet.disposed) {
        return;
      }

      for (const texture of Object.values(textureSet.textures)) {
        texture.dispose();
        texture.userData.disposed = true;
      }
      textureSet.disposed = true;
    }
  };

  return textureSet;
}

export function slotTextureWindow(textureSet: AtlasTextureSet, slotId: string): AtlasSlotTextureWindow {
  const slot = textureSet.slots.get(slotId);
  if (!slot) {
    throw new Error(`Atlas texture set ${textureSet.atlasId} does not contain slot ${slotId}.`);
  }

  const baseColor = textureSet.textures.baseColor;
  return {
    slotId,
    rectPx: slot.rectPx,
    uvMode: slot.uvMode,
    periodicity: slot.periodicity,
    physicalSizeM: slot.physicalSizeM,
    uvRect: {
      x: slot.rectPx.x / baseColor.image.width,
      y: slot.rectPx.y / baseColor.image.height,
      width: slot.rectPx.width / baseColor.image.width,
      height: slot.rectPx.height / baseColor.image.height
    }
  };
}
