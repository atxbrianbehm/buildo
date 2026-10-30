import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import { ConstructionAwningFabricArtifactSchema } from "../contracts/constructionAwningFabric";
import { readConstructionAwningFabric } from "../materials/constructionAwningFabric";

/** Own a supplemental fabric separately from the building atlas. UVs are in metres. */
export async function prepareConstructionAwningFabricRuntime(input: unknown) {
  const owned = structuredClone(ConstructionAwningFabricArtifactSchema.parse(input));
  const fabric = await readConstructionAwningFabric(owned);
  const bytes = new Uint8Array(fabric.baseColorRgbaHex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(fabric.baseColorRgbaHex.slice(i * 2, i * 2 + 2), 16);
  const texture = new DataTexture(bytes, fabric.widthPx, fabric.heightPx, RGBAFormat, UnsignedByteType);
  texture.name = `awning-fabric.${fabric.contentHash}`;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / fabric.source.physicalSizeM[0], 1 / fabric.source.physicalSizeM[1]);
  texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.flipY = false; texture.needsUpdate = true;
  const material = new MeshStandardMaterial({ color: "#ffffff", map: texture, roughness: fabric.roughness, metalness: fabric.metalness });
  material.name = `awning-fabric.${fabric.contentHash}`;
  material.userData = { rendererBoundary: "building-family", fabricContentHash: fabric.contentHash };
  let closed = false, freed = false, leases = 0;
  function free() {
    if (!closed || leases !== 0 || freed) return;
    freed = true; material.dispose(); texture.dispose();
  }
  return {
    contentHash: fabric.contentHash,
    get disposed() { return closed; },
    acquire() {
      if (closed) throw new Error("Awning fabric runtime is closed.");
      leases++; let released = false;
      return {
        get material() { if (released) throw new Error("Awning fabric lease is released."); return material; },
        release() { if (!released) { released = true; leases--; free(); } }
      };
    },
    dispose() { closed = true; free(); }
  };
}
