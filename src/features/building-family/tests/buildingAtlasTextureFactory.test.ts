import { NoColorSpace, SRGBColorSpace } from "three";
import { createAtlasLabFixture } from "../materials/atlasLabFixture";
import {
  createAtlasTextureSet,
  slotTextureWindow,
  type AtlasChannelTextureName
} from "../renderer-three/buildingAtlasTextureFactory";
import { createAtlasMaterialRegistry } from "../renderer-three/buildingAtlasMaterialFactory";

describe("building atlas texture factory", () => {
  it("creates DataTexture channels from the exact packed atlas channel data", async () => {
    const { packedAtlas, debugExport } = await createAtlasLabFixture();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const channelNames: AtlasChannelTextureName[] = ["baseColor", "normal", "orm", "height", "opacity"];

    expect(textureSet.atlasId).toBe(packedAtlas.atlasId);
    expect(textureSet.contentHash).toBe(packedAtlas.contentHash);
    expect(textureSet.channelHashes).toEqual(
      Object.fromEntries(debugExport.channels.map((channel) => [channel.name, channel.channelHash]))
    );

    for (const name of channelNames) {
      const texture = textureSet.textures[name];
      const layer = packedAtlas.channels[name];
      expect(texture.isDataTexture).toBe(true);
      expect(texture.image.width).toBe(layer.widthPx);
      expect(texture.image.height).toBe(layer.heightPx);
      const textureData = texture.image.data as Uint8Array;
      expect(Array.from(textureData.slice(0, 24))).toEqual(Array.from(layer.data.slice(0, 24)));
      expect(texture.userData).toMatchObject({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        channel: name,
        channelHash: textureSet.channelHashes[name],
        rendererBoundary: "building-family"
      });
    }

    expect(textureSet.textures.baseColor.colorSpace).toBe(SRGBColorSpace);
    expect(textureSet.textures.normal.colorSpace).toBe(NoColorSpace);
  });

  it("derives normalized atlas slot texture windows from the manifest", async () => {
    const { packedAtlas, debugExport } = await createAtlasLabFixture();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const wallSlot = packedAtlas.manifest.slots.find((slot) => slot.id === "wall.primary")!;
    const window = slotTextureWindow(textureSet, "wall.primary");

    expect(window).toEqual({
      slotId: "wall.primary",
      rectPx: wallSlot.rectPx,
      uvMode: wallSlot.uvMode,
      periodicity: wallSlot.periodicity,
      physicalSizeM: wallSlot.physicalSizeM,
      uvRect: {
        x: wallSlot.rectPx.x / packedAtlas.manifest.widthPx,
        y: wallSlot.rectPx.y / packedAtlas.manifest.heightPx,
        width: wallSlot.rectPx.width / packedAtlas.manifest.widthPx,
        height: wallSlot.rectPx.height / packedAtlas.manifest.heightPx
      }
    });
  });

  it("wires atlas textures and slot sampling metadata into materials", async () => {
    const { packedAtlas, debugExport } = await createAtlasLabFixture();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const registry = createAtlasMaterialRegistry({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      debugExport,
      textureSet
    });
    const material = registry.getMaterial("glass.primary");
    const glassWindow = slotTextureWindow(textureSet, "glass.primary");

    expect(material.map).toBe(textureSet.textures.baseColor);
    expect(material.normalMap).toBe(textureSet.textures.normal);
    expect(material.roughnessMap).toBe(textureSet.textures.orm);
    expect(material.metalnessMap).toBe(textureSet.textures.orm);
    expect(material.alphaMap).toBe(textureSet.textures.opacity);
    expect(material.transparent).toBe(true);
    expect(material.userData).toMatchObject({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      atlasSlotId: "glass.primary",
      atlasSlot: glassWindow,
      channelHashes: textureSet.channelHashes,
      rendererBoundary: "building-family"
    });
  });

  it("disposes atlas channel textures exactly once", async () => {
    const { packedAtlas, debugExport } = await createAtlasLabFixture();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const registry = createAtlasMaterialRegistry({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      debugExport,
      textureSet
    });
    const material = registry.getMaterial("wall.primary");
    const disposeCalls: string[] = [];

    for (const texture of Object.values(textureSet.textures)) {
      const originalDispose = texture.dispose.bind(texture);
      texture.dispose = () => {
        disposeCalls.push(texture.name);
        originalDispose();
      };
    }

    registry.dispose();
    registry.dispose();

    expect(material.userData.disposed).toBe(true);
    expect(textureSet.disposed).toBe(true);
    expect(disposeCalls.sort()).toEqual(
      ["atlas.baseColor", "atlas.height", "atlas.normal", "atlas.opacity", "atlas.orm"].sort()
    );
  });
});
