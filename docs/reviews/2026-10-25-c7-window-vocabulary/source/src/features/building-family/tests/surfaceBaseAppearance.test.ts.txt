import { AtlasChannelSchema, type AtlasManifest, type AtlasSlot } from "../contracts/atlasManifest";
import { RuntimeBuildingIRSchema } from "../contracts/runtimeBuildingIR";
import { BuildingSurfaceTileArtifactSchema, type BuildingSurfaceComposition, type BuildingSurfaceLayer } from "../contracts/surfaceComposition";
import { ConstantSurfaceBaseAppearanceSchema } from "../contracts/surfaceBaseAppearance";
import { hashPackedAtlasContent, type PackedAtlas, type PackedAtlasChannels } from "../materials/atlasPacker";
import { composeBuildingSurfaceTile, verifyBuildingSurfaceTile } from "../materials/composeSurfaceTile";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { createConstantSurfaceBaseAppearance, createConstructionSurfaceBases, surfaceBaseRgba, verifyConstantSurfaceBaseAppearance } from "../materials/surfaceBaseAppearance";

const names = AtlasChannelSchema.options;
const payload = () => ({ schemaVersion: "0.1.0", kind: "constant-opaque-pbr-base", slotId: "base", role: "frame",
  colorSrgb: [221, 215, 200], roughness: 0.58, metalness: 0 });
function slot(id: string, role: AtlasSlot["role"], x: number): AtlasSlot {
  return { id, role, rectPx: { x, y: 0, width: 2, height: 1 }, uvMode: "stretch", periodicity: "none",
    physicalSizeM: { width: 1, height: 1 }, materialSourceId: id, compatibilityTags: [], generationPrompt: "test", seedPath: "test/" + id };
}
async function atlas(): Promise<PackedAtlas> {
  const manifest: AtlasManifest = { schemaVersion: "0.1.0", atlasId: "constant-base-test", widthPx: 4, heightPx: 1,
    paddingPx: 0, channels: [...names], slots: [slot("base", "frame", 0), slot("paint", "wall", 2)] };
  const source = { baseColor: [255, 255, 255, 255], normal: [128, 128, 255, 255], orm: [255, 64, 128, 255], height: [20, 20, 20, 255], opacity: [180, 180, 180, 255] };
  const channels = Object.fromEntries(names.map(name => [name, { widthPx: 4, heightPx: 1, channels: "rgba8",
    data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, ...source[name], ...source[name]]) }])) as unknown as PackedAtlasChannels;
  const value: PackedAtlas = { schemaVersion: "0.1.0", atlasId: manifest.atlasId, manifest, channels,
    contentHash: "0".repeat(64), diagnostics: [], slotProvenance: manifest.slots.map((value, index) => ({ slotId: value.id,
      sourceId: value.id, providerId: "hand-computable-test", requestHash: String(index + 1).repeat(64), contentHash: String(index + 3).repeat(64) })) };
  value.contentHash = await hashPackedAtlasContent(value); return value;
}
const ir = RuntimeBuildingIRSchema.parse({ schemaVersion: "0.1.0", buildingId: "tiny-building", familyId: "tiny-family", sourceGraphHash: "tiny-geometry",
  bounds: { min: [0, 0, 0], max: [2, 2, 1] }, meshBatches: [], instanceBatches: [{ batchId: "frame-batch", recipeId: "window", materialSlotId: "base", count: 2 }],
  semanticIndex: [0, 1].map(elementIndex => ({ semanticPath: "building/tiny-family/node/window/facade/floor/0/bay/" + elementIndex + "/frame", batchId: "frame-batch", elementIndex, stage: "openings" })),
  metrics: { vertexCount: 0, triangleCount: 0, instanceCount: 2 } });
function layer(opacity: number): BuildingSurfaceLayer {
  return { id: "paint", target: { kind: "role", role: "frame" }, sourceId: "paint", mask: { kind: "constant", value: 1 },
    blend: "replace", opacity, physicalSizeM: { width: 1, height: 1 }, channels: [...names] };
}
async function input(layers: BuildingSurfaceLayer[] = []) {
  const source = await atlas(), composition: BuildingSurfaceComposition = { schemaVersion: "0.1.0", documentId: "base-test", revision: 0,
    sources: [{ id: "paint", atlasContentHash: source.contentHash, slotId: "paint" }], layers };
  const artifact = await resolveBuildingSurfaceBindings({ composition, ir, atlas: source });
  return { artifact, relativePath: artifact.bindings[0].relativePath, atlas: source };
}
const firstPixel = (data: Uint8ClampedArray) => [...data.subarray(0, 4)];

it("owns and hashes a strict opaque PBR base before awaits, with no accessor reads", async () => {
  const mutable = payload(), pending = createConstantSurfaceBaseAppearance(mutable); mutable.colorSrgb[0] = 0;
  const base = await pending; expect(base.colorSrgb).toEqual([221, 215, 200]); expect(await verifyConstantSurfaceBaseAppearance(base)).toEqual(base);
  await expect(verifyConstantSurfaceBaseAppearance({ ...base, roughness: 0.2 })).rejects.toThrow("content hash");
  let reads = 0; const unsafe = payload(); Object.defineProperty(unsafe, "colorSrgb", { enumerable: true, get() { reads++; return [1, 2, 3]; } });
  await expect(createConstantSurfaceBaseAppearance(unsafe)).rejects.toThrow(); expect(reads).toBe(0);
  expect(ConstantSurfaceBaseAppearanceSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  await expect(createConstantSurfaceBaseAppearance({ ...payload(), roughness: Infinity })).rejects.toThrow();
  await expect(createConstantSurfaceBaseAppearance({ ...payload(), colorSrgb: [256, 0, 0] })).rejects.toThrow();
});

it("derives the accepted frame/trim preset once without making glass an opaque finish base", async () => {
  const values = await createConstructionSurfaceBases(); expect(values.map(value => value.slotId)).toEqual(["frame.primary", "trim.horizontal.primary"]);
  expect(values[0].colorSrgb).toEqual([221, 215, 200]); expect(values[0].roughness).toBe(0.58); expect(values[0].metalness).toBe(0);
  expect(values[1].colorSrgb).toEqual([188, 179, 161]); expect(values[1].roughness).toBe(0.86);
  expect(await createConstructionSurfaceBases()).toEqual(values);
});

it("retains the legacy tile version and literal raw base when no appearance is supplied", async () => {
  const tile = await composeBuildingSurfaceTile(await input());
  expect(tile.schemaVersion).toBe("0.1.0"); expect(tile.algorithmVersion).toBe("surface-tile-linear-over-nearest-repeat-v1");
  expect("baseAppearanceRef" in tile).toBe(false); expect(firstPixel(tile.channels.baseColor.data)).toEqual([0, 0, 0, 255]);
  expect(await verifyBuildingSurfaceTile(tile)).toEqual(tile);
});

it.each(["empty", "zero"])("starts from literal accepted paint for an %s composition", async kind => {
  const base = await createConstantSurfaceBaseAppearance(payload()), context = await input(kind === "zero" ? [layer(0)] : []);
  const before = [...context.atlas.channels.baseColor.data], tile = await composeBuildingSurfaceTile({ ...context, baseAppearance: base });
  if (tile.schemaVersion !== "0.2.0") throw new Error("Expected explicit constant-base tile version.");
  expect(tile.baseAppearanceRef).toEqual({ schemaVersion: "0.1.0", contentHash: base.contentHash, slotId: "base" });
  for (const name of names) expect(firstPixel(tile.channels[name].data)).toEqual(surfaceBaseRgba(base)[name]);
  expect([...context.atlas.channels.baseColor.data]).toEqual(before); expect(await verifyBuildingSurfaceTile(tile)).toEqual(tile);
});

it("blends positive layers from painted PBR parameters rather than hidden raw black pixels", async () => {
  const base = await createConstantSurfaceBaseAppearance(payload()), context = await input([layer(0.5)]);
  const tile = await composeBuildingSurfaceTile({ ...context, baseAppearance: base });
  expect(firstPixel(tile.channels.baseColor.data)).toEqual([239, 236, 230, 255]);
  expect(firstPixel(tile.channels.orm.data)).toEqual([255, 106, 64, 255]);
  expect(firstPixel(tile.channels.height.data)).toEqual([10, 10, 10, 255]);
  expect(firstPixel(tile.channels.opacity.data)).toEqual([218, 218, 218, 255]);
  const legacy = await composeBuildingSurfaceTile(context); expect(firstPixel(legacy.channels.baseColor.data)).toEqual([188, 188, 188, 255]);
  expect(tile.recipeHash).not.toBe(legacy.recipeHash); expect(tile.pixelContentHash).not.toBe(legacy.pixelContentHash);
});

it("owns appearance input before validation yields and verifies all versioned output pins", async () => {
  const context = await input(), base = await createConstantSurfaceBaseAppearance(payload());
  const pending = composeBuildingSurfaceTile({ ...context, baseAppearance: base }); base.colorSrgb[0] = 0;
  const tile = await pending; expect(firstPixel(tile.channels.baseColor.data)).toEqual([221, 215, 200, 255]);
  const changed = structuredClone(tile); changed.channels.orm.data[0]--;
  await expect(verifyBuildingSurfaceTile(changed)).rejects.toThrow("hash");
  expect(BuildingSurfaceTileArtifactSchema.safeParse({ ...tile, schemaVersion: "0.1.0" }).success).toBe(false);
  expect(BuildingSurfaceTileArtifactSchema.safeParse({ ...tile, algorithmVersion: "surface-tile-linear-over-nearest-repeat-v1" }).success).toBe(false);
  if (tile.schemaVersion === "0.2.0") expect(BuildingSurfaceTileArtifactSchema.safeParse({ ...tile,
    baseAppearanceRef: { ...tile.baseAppearanceRef, slotId: "other-slot" } }).success).toBe(false);
});

it("rejects mismatched slots, roles and unverified base hashes", async () => {
  const context = await input(), base = await createConstantSurfaceBaseAppearance(payload());
  for (const appearance of [await createConstantSurfaceBaseAppearance({ ...payload(), slotId: "missing" }),
    await createConstantSurfaceBaseAppearance({ ...payload(), role: "horizontalTrim" }), { ...base, contentHash: "0".repeat(64) }])
    await expect(composeBuildingSurfaceTile({ ...context, baseAppearance: appearance })).rejects.toMatchObject({ code: "surfaceTile.invalidBaseAppearance" });
});
