import type { AtlasChannel } from "../contracts/atlasManifest";
import { ConstantSurfaceBaseAppearanceSchema, ConstantSurfaceBasePayloadSchema, type ConstantSurfaceBaseAppearance } from "../contracts/surfaceBaseAppearance";
import { constructionFlatAppearances } from "../core/constructionAppearance";
import { hashCanonicalJson } from "../core/contentHash";

export async function createConstantSurfaceBaseAppearance(input: unknown): Promise<ConstantSurfaceBaseAppearance> {
  const owned = ConstantSurfaceBasePayloadSchema.parse(input);
  return ConstantSurfaceBaseAppearanceSchema.parse({ ...owned, contentHash: await hashCanonicalJson(owned) });
}
export async function verifyConstantSurfaceBaseAppearance(input: unknown): Promise<ConstantSurfaceBaseAppearance> {
  const owned = ConstantSurfaceBaseAppearanceSchema.parse(input), { contentHash, ...payload } = owned;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Surface base appearance does not match its content hash.");
  return owned;
}
/** Constant opaque material parameters encoded into the compositor's five aligned planes. */
export function surfaceBaseRgba(base: ConstantSurfaceBaseAppearance): Record<AtlasChannel, readonly number[]> {
  return { baseColor: [...base.colorSrgb, 255], normal: [128, 128, 255, 255],
    orm: [255, Math.round(base.roughness * 255), Math.round(base.metalness * 255), 255],
    height: [0, 0, 0, 255], opacity: [255, 255, 255, 255] };
}
export async function createConstructionSurfaceBases(): Promise<ConstantSurfaceBaseAppearance[]> {
  return Promise.all(constructionFlatAppearances.filter(value => value.role !== "glass").map(value => createConstantSurfaceBaseAppearance({
    schemaVersion: "0.1.0", kind: "constant-opaque-pbr-base", slotId: value.slotId, role: value.role,
    colorSrgb: [1, 3, 5].map(offset => Number.parseInt(value.color.slice(offset, offset + 2), 16)),
    roughness: value.roughness, metalness: value.metalness
  })));
}
