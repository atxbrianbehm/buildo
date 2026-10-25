import { vi } from "vitest";
import { AtlasChannelSchema, type AtlasManifest, type AtlasSlot } from "../contracts/atlasManifest";
import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import {
  BuildingSurfaceBindingArtifactSchema, BuildingSurfaceTileArtifactSchema,
  type BuildingSurfaceComposition, type BuildingSurfaceLayer
} from "../contracts/surfaceComposition";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { canonicalJson } from "../core/canonicalJson";
import * as hashes from "../core/contentHash";
import { createAtlasLabFixture } from "../materials/atlasLabFixture";
import { hashPackedAtlasContent, type PackedAtlas, type PackedAtlasChannels } from "../materials/atlasPacker";
import { ProceduralMaterialProvider, type PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import {
  composeBuildingSurfaceTile, verifyBuildingSurfaceTile, BuildingSurfaceTileError
} from "../materials/composeSurfaceTile";

function surfaceFixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-split-plan",
    sourceIntentHash: "intent-split-plan",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4.2, 3.2, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 5,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

const names = AtlasChannelSchema.options;
function stable(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength,
    bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
  return value;
}
function pixels(widthPx: number, heightPx: number, color: (x: number, y: number) => number[]): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let y = 0; y < heightPx; y++) for (let x = 0; x < widthPx; x++) data.set(color(x, y), (y * widthPx + x) * 4);
  return { widthPx, heightPx, channels: "rgba8", data };
}
function slot(id: string, role: AtlasSlot["role"], x: number, width: number): AtlasSlot {
  return { id, role, rectPx: { x, y: 0, width, height: 2 }, uvMode: "repeat", periodicity: "xy",
    physicalSizeM: { width: 2, height: 1 }, materialSourceId: id + "-source",
    compatibilityTags: [], generationPrompt: "tiny fixture", seedPath: "test/" + id };
}
async function tinyAtlas(): Promise<PackedAtlas> {
  const manifest: AtlasManifest = { schemaVersion: "0.1.0", atlasId: "tiny-atlas", widthPx: 6, heightPx: 2,
    paddingPx: 0, channels: [...names], slots: [slot("base", "frame", 0, 4), slot("paint", "wall", 4, 2)] };
  const channels: PackedAtlasChannels = {
    baseColor: pixels(6, 2, (x, y) => x < 4 ? [0, 0, 0, 255] :
      y === 0 ? x === 4 ? [255, 255, 255, 128] : [0, 0, 0, 64] :
        x === 4 ? [255, 0, 0, 200] : [0, 255, 0, 220]),
    normal: pixels(6, 2, x => x < 4 ? [128, 128, 255, 255] : x === 4 ? [255, 128, 128, 255] : [128, 255, 128, 255]),
    orm: pixels(6, 2, x => x < 4 ? [64, 96, 128, 255] : x === 4 ? [255, 64, 32, 255] : [128, 128, 128, 255]),
    height: pixels(6, 2, x => x < 4 ? [20, 20, 20, 255] : x === 4 ? [220, 220, 220, 255] : [60, 60, 60, 255]),
    opacity: pixels(6, 2, x => x < 4 ? [180, 180, 180, 255] : x === 4 ? [100, 100, 100, 255] : [200, 200, 200, 255])
  };
  const atlas: PackedAtlas = { schemaVersion: "0.1.0", atlasId: manifest.atlasId, manifest, channels,
    slotProvenance: manifest.slots.map((item, index) => ({ slotId: item.id, sourceId: item.materialSourceId,
      providerId: "test-hand-computable", requestHash: String(index + 1).repeat(64), contentHash: String(index + 3).repeat(64) })),
    contentHash: "", diagnostics: [] };
  atlas.contentHash = await hashPackedAtlasContent(atlas);
  return atlas;
}
function tinyIr(baseSlotId: string): RuntimeBuildingIR {
  const transforms = new Float32Array(32);
  for (let instance = 0; instance < 2; instance++) for (let axis = 0; axis < 4; axis++) transforms[instance * 16 + axis * 5] = 1;
  return RuntimeBuildingIRSchema.parse({ schemaVersion: "0.1.0", buildingId: "tiny-building", familyId: "tiny-family",
    sourceGraphHash: "c".repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    meshBatches: [], instanceBatches: [{ batchId: "instances.frame", recipeId: "test-frame", materialSlotId: baseSlotId, transforms, count: 2 }],
    semanticIndex: [0, 1].map(elementIndex => ({ semanticPath: "building/tiny-family/facade/front/floor/0/bay/" + elementIndex + "/opening/window",
      batchId: "instances.frame", elementIndex, stage: "openings" })),
    metrics: { vertexCount: 0, triangleCount: 0, instanceCount: 2 } });
}
function paint(overrides: Partial<BuildingSurfaceLayer> = {}): BuildingSurfaceLayer {
  return { id: "paint", target: { kind: "role", role: "frame" }, sourceId: "paint",
    mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 1,
    physicalSizeM: { width: 2, height: 1 }, channels: ["baseColor"], ...overrides };
}
async function context(atlas: PackedAtlas, layers: BuildingSurfaceLayer[] = [], ir = tinyIr("base")) {
  const base = atlas.manifest.slots.find(item => item.role === "frame")!, source = atlas.manifest.slots.find(item => item.role === "wall")!;
  const composition: BuildingSurfaceComposition = { schemaVersion: "0.1.0", documentId: "tile-document", revision: 1,
    sources: [{ id: "base", atlasContentHash: atlas.contentHash, slotId: base.id },
      { id: "paint", atlasContentHash: atlas.contentHash, slotId: source.id }], layers };
  const artifact = await resolveBuildingSurfaceBindings({ composition, ir, atlas: { manifest: atlas.manifest, contentHash: atlas.contentHash } });
  const relativePath = artifact.bindings.find(item => item.role === "frame")!.relativePath;
  return { artifact, relativePath, atlas };
}
function pixel(layer: PixelLayer, x: number, y = 0) {
  return Array.from(layer.data.subarray((y * layer.widthPx + x) * 4, (y * layer.widthPx + x + 1) * 4));
}
function independentCrop(layer: PixelLayer, rect: AtlasSlot["rectPx"]) {
  const result: number[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++)
    result.push(...Array.from(layer.data.subarray((y * layer.widthPx + x) * 4, (y * layer.widthPx + x + 1) * 4)));
  return result;
}
async function rejected(input: unknown, code: string) {
  await expect(composeBuildingSurfaceTile(input)).rejects.toMatchObject({ name: "BuildingSurfaceTileError", code });
}
async function refreshBinding(input: Awaited<ReturnType<typeof context>>) {
  const { contentHash: _old, ...payload } = input.artifact; void _old;
  input.artifact.contentHash = await hashes.hashCanonicalJson(payload);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("R4.P1 pure multichannel surface-tile composition", () => {
  it("copies a literal base tile across all channels, preserving input buffers and verifying the runtime artifact", async () => {
    const atlas = await tinyAtlas(), input = await context(atlas), before = stable(input);
    const tile = await composeBuildingSurfaceTile(input);
    expect(stable(input)).toStrictEqual(before);
    const base = atlas.manifest.slots[0];
    for (const name of names) {
      expect(Array.from(tile.channels[name].data)).toEqual(independentCrop(atlas.channels[name], base.rectPx));
      expect(tile.channels[name].widthPx).toBe(4); expect(tile.channels[name].heightPx).toBe(2);
      expect(tile.channels[name].data.buffer).not.toBe(atlas.channels[name].data.buffer);
    }
    expect(tile.geometryRef).toEqual(input.artifact.geometryRef); expect(tile.physicalSizeM).toEqual(base.physicalSizeM);
    expect(stable(await verifyBuildingSurfaceTile(tile))).toStrictEqual(stable(tile));
    expect(BuildingSurfaceTileArtifactSchema.safeParse(tile).success).toBe(true);
  });

  it("blends sRGB in linear light with explicit mask/opacity coverage and independent alpha", async () => {
    const atlas = await tinyAtlas(), input = await context(atlas, [paint({ opacity: 0.5 })]);
    const tile = await composeBuildingSurfaceTile(input);
    // Half white over black is 188 sRGB; source alpha128 is not an implicit mask.
    expect(pixel(tile.channels.baseColor, 0)).toEqual([188, 188, 188, 192]);
    expect(pixel(tile.channels.baseColor, 1)).toEqual([188, 188, 188, 192]);
    expect(pixel(tile.channels.baseColor, 2)).toEqual([0, 0, 0, 160]);
    expect(pixel(tile.channels.baseColor, 3)).toEqual([0, 0, 0, 160]);
    for (const name of names.filter(name => name !== "baseColor"))
      expect(Array.from(tile.channels[name].data)).toEqual(independentCrop(atlas.channels[name], atlas.manifest.slots[0].rectPx));
  });

  it("applies scalar ORM/height/opacity replacement independently across aligned channels", async () => {
    const input = await context(await tinyAtlas(), [paint({ opacity: 0.5, channels: ["orm", "height", "opacity"] })]);
    const tile = await composeBuildingSurfaceTile(input);
    expect(pixel(tile.channels.orm, 0)).toEqual([160, 80, 80, 255]);
    expect(pixel(tile.channels.height, 0)).toEqual([120, 120, 120, 255]);
    expect(pixel(tile.channels.opacity, 0)).toEqual([140, 140, 140, 255]);
    expect(pixel(tile.channels.orm, 2)).toEqual([96, 112, 128, 255]);
    expect(pixel(tile.channels.height, 2)).toEqual([40, 40, 40, 255]);
    expect(pixel(tile.channels.opacity, 2)).toEqual([190, 190, 190, 255]);
    expect(pixel(tile.channels.baseColor, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(tile.channels.normal, 0)).toEqual([128, 128, 255, 255]);
  });

  it("evaluates source-channel masks with the same physical coordinates as the layer source", async () => {
    const input = await context(await tinyAtlas(), [paint({
      channels: ["orm"], mask: { kind: "channel", sourceId: "paint", channel: "height", component: "r" }
    })]);
    const tile = await composeBuildingSurfaceTile(input);
    expect(pixel(tile.channels.orm, 0)).toEqual([229, 68, 45, 255]);
    expect(pixel(tile.channels.orm, 2)).toEqual([79, 104, 128, 255]);
    // The source height mask remains literal when it is not a selected output channel.
    expect(pixel(tile.channels.height, 0)).toEqual([20, 20, 20, 255]);
  });

  it("repeats nearest samples in pixel-centred physical space with all source/mask channels aligned", async () => {
    const input = await context(await tinyAtlas(), [paint({ physicalSizeM: { width: 1, height: 1 }, channels: ["baseColor", "height"] })]);
    const tile = await composeBuildingSurfaceTile(input);
    expect([0, 1, 2, 3].map(x => pixel(tile.channels.baseColor, x))).toEqual([
      [255, 255, 255, 128], [0, 0, 0, 64], [255, 255, 255, 128], [0, 0, 0, 64]
    ]);
    expect([0, 1, 2, 3].map(x => pixel(tile.channels.height, x)[0])).toEqual([220, 60, 220, 60]);
    expect([0, 1, 2, 3].map(x => pixel(tile.channels.baseColor, x, 1))).toEqual([
      [255, 0, 0, 200], [0, 255, 0, 220], [255, 0, 0, 200], [0, 255, 0, 220]
    ]);
  });

  it("preserves meaningful layer order and uses defined linear-color/scalar multiplication", async () => {
    const atlas = await tinyAtlas();
    atlas.channels.baseColor = pixels(6, 2, () => [128, 128, 128, 255]);
    atlas.contentHash = await hashPackedAtlasContent(atlas);
    const multiplied = await composeBuildingSurfaceTile(await context(atlas, [paint({ blend: "multiply", channels: ["baseColor", "orm"] })]));
    expect(pixel(multiplied.channels.baseColor, 0)).toEqual([61, 61, 61, 255]);
    expect(pixel(multiplied.channels.orm, 0)).toEqual([64, 24, 16, 255]);
    const first = paint({ id: "replace", sourceId: "paint", channels: ["height"] });
    const second = paint({ id: "multiply", sourceId: "paint", blend: "multiply", channels: ["height"] });
    const a = await composeBuildingSurfaceTile(await context(atlas, [first, second]));
    const b = await composeBuildingSurfaceTile(await context(atlas, [second, first]));
    expect(pixel(a.channels.height, 0)[0]).toBe(190);
    expect(pixel(b.channels.height, 0)[0]).toBe(220);
    expect(a.pixelContentHash).not.toBe(b.pixelContentHash);
  });

  it("renormalizes replaced normal vectors and explicitly rejects normal multiply", async () => {
    const atlas = await tinyAtlas();
    const tile = await composeBuildingSurfaceTile(await context(atlas, [paint({ opacity: 0.5, channels: ["normal"] })]));
    expect(pixel(tile.channels.normal, 0)).toEqual([218, 128, 218, 255]);
    expect(pixel(tile.channels.normal, 2)).toEqual([128, 218, 218, 255]);
    const vector = pixel(tile.channels.normal, 0).slice(0, 3).map(value => value / 127.5 - 1);
    expect(Math.abs(Math.hypot(...vector) - 1)).toBeLessThan(0.006);
    await rejected(await context(atlas, [paint({ blend: "multiply", channels: ["normal"] })]), "surfaceTile.unsupportedNormalMultiply");
  });

  it("keeps all literal bytes for zero-opacity/mask layers while still validating their references", async () => {
    const atlas = await tinyAtlas();
    atlas.channels.normal = pixels(6, 2, () => [5, 17, 27, 39]);
    atlas.contentHash = await hashPackedAtlasContent(atlas);
    for (const overrides of [{ opacity: 0 }, { mask: { kind: "constant" as const, value: 0 } }]) {
      const input = await context(atlas, [paint({ channels: [...names], ...overrides })]);
      const tile = await composeBuildingSurfaceTile(input);
      for (const name of names)
        expect(Array.from(tile.channels[name].data)).toEqual(independentCrop(atlas.channels[name], atlas.manifest.slots[0].rectPx));
      input.artifact.bindings.find(value => value.relativePath === input.relativePath)!.layers[0].source.slotId = "missing";
      await refreshBinding(input);
      await rejected(input, "surfaceTile.sourcePinMismatch");
    }
  });

  it("separates shared material pixel identity from selection and geometry-owner identity", async () => {
    const atlas = await tinyAtlas(), input = await context(atlas, [paint()]);
    const first = await composeBuildingSurfaceTile(input);
    const secondPath = input.artifact.bindings.find(value => value.relativePath !== input.relativePath)!.relativePath;
    const second = await composeBuildingSurfaceTile({ ...input, relativePath: secondPath });
    expect(second.pixelContentHash).toBe(first.pixelContentHash);
    expect(second.recipeHash).toBe(first.recipeHash); expect(second.contentHash).not.toBe(first.contentHash);
    input.artifact.geometryRef.sourceGraphHash = "d".repeat(64); input.artifact.revision++;
    await refreshBinding(input);
    const changedOwner = await composeBuildingSurfaceTile(input);
    expect(changedOwner.pixelContentHash).toBe(first.pixelContentHash);
    expect(changedOwner.recipeHash).toBe(first.recipeHash);
    expect(changedOwner.contentHash).not.toBe(first.contentHash);
  });

  it("verifies all source bytes/provenance and the complete binding payload rather than trusting their labels", async () => {
    const input = await context(await tinyAtlas(), [paint()]);
    const badPixels = structuredClone(input);
    badPixels.atlas.channels.height.data[badPixels.atlas.channels.height.data.length - 1] ^= 255;
    await rejected(badPixels, "surfaceTile.sourceHashMismatch");
    const badProvenance = structuredClone(input);
    badProvenance.atlas.slotProvenance[0].requestHash = "0".repeat(64);
    await rejected(badProvenance, "surfaceTile.sourceHashMismatch");
    const badBinding = structuredClone(input);
    badBinding.artifact.bindings.find(value => value.relativePath === input.relativePath)!.layers[0].opacity = 0.3;
    await rejected(badBinding, "surfaceTile.bindingHashMismatch");
    const newPin = structuredClone(input);
    newPin.atlas.channels.height.data[0] ^= 255;
    newPin.atlas.contentHash = await hashPackedAtlasContent(newPin.atlas);
    await rejected(newPin, "surfaceTile.sourcePinMismatch");
  });

  it("rejects malformed, misaligned, overlapping, unavailable and incomplete atlas data", async () => {
    const valid = await context(await tinyAtlas());
    const cases: Array<[unknown, string]> = [];
    const overlap = structuredClone(valid); overlap.atlas.manifest.slots[1].rectPx.x = 2;
    cases.push([overlap, "surfaceTile.invalidAtlas"]);
    const bounds = structuredClone(valid); bounds.atlas.manifest.slots[1].rectPx.y = 1;
    cases.push([bounds, "surfaceTile.invalidAtlas"]);
    const dimension = structuredClone(valid); dimension.atlas.channels.normal.widthPx = 3;
    cases.push([dimension, "surfaceTile.invalidAtlas"]);
    const bytes = structuredClone(valid);
    (bytes.atlas.channels.normal as unknown as { data: unknown }).data = new Uint8Array(48);
    cases.push([bytes, "surfaceTile.invalidAtlas"]);
    const channels = structuredClone(valid); channels.atlas.manifest.channels.pop();
    cases.push([channels, "surfaceTile.invalidAtlas"]);
    const provenance = structuredClone(valid); provenance.atlas.slotProvenance.pop();
    cases.push([provenance, "surfaceTile.invalidAtlas"]);
    const duplicate = structuredClone(valid); duplicate.atlas.manifest.slots.push({ ...duplicate.atlas.manifest.slots[0] });
    cases.push([duplicate, "surfaceTile.invalidAtlas"]);
    const error = structuredClone(valid);
    error.atlas.diagnostics.push({ code: "test", message: "Missing material", severity: "error" });
    cases.push([error, "surfaceTile.invalidAtlas"]);
    cases.push([{ ...valid, unknown: true }, "surfaceTile.invalidInput"]);
    if (typeof SharedArrayBuffer !== "undefined") {
      const shared = structuredClone(valid);
      shared.atlas.channels.normal.data = new Uint8ClampedArray(new SharedArrayBuffer(48));
      cases.push([shared, "surfaceTile.invalidAtlas"]);
    }
    for (const [value, code] of cases) await rejected(value, code);
  });

  it("does not execute metadata/data getters and owns aliased binary planes safely", async () => {
    const valid = await context(await tinyAtlas()), getter = vi.fn(() => { throw new Error("getter executed"); });
    const outer = { ...valid }; Object.defineProperty(outer, "artifact", { enumerable: true, get: getter });
    await rejected(outer, "surfaceTile.invalidInput");
    const atlasGetter = structuredClone(valid);
    Object.defineProperty(atlasGetter.atlas, "channels", { enumerable: true, get: getter });
    await rejected(atlasGetter, "surfaceTile.invalidInput");
    const dataGetter = structuredClone(valid);
    Object.defineProperty(dataGetter.atlas.channels.normal, "data", { enumerable: true, get: getter });
    await rejected(dataGetter, "surfaceTile.invalidInput");
    const bindingGetter = structuredClone(valid);
    Object.defineProperty(bindingGetter.artifact.bindings[0], "layers", { enumerable: true, get: getter });
    await rejected(bindingGetter, "surfaceTile.invalidBinding");
    const nativeBytes = structuredClone(valid);
    Object.defineProperty(nativeBytes.atlas.channels.normal.data, "byteLength", { get: getter });
    expect(stable(await composeBuildingSurfaceTile(nativeBytes))).toStrictEqual(stable(await composeBuildingSurfaceTile(valid)));
    expect(getter).not.toHaveBeenCalled();

    const aliasAtlas = await tinyAtlas();
    for (const name of names) aliasAtlas.channels[name] = aliasAtlas.channels.baseColor;
    aliasAtlas.contentHash = await hashPackedAtlasContent(aliasAtlas);
    const tile = await composeBuildingSurfaceTile(await context(aliasAtlas));
    expect(new Set(names.map(name => tile.channels[name].data.buffer)).size).toBe(5);
    const oldNormal = Array.from(tile.channels.normal.data);
    tile.channels.baseColor.data.fill(13);
    expect(Array.from(tile.channels.normal.data)).toEqual(oldNormal);
    expect(aliasAtlas.channels.baseColor.data[0]).toBe(0);
  });

  it("owns binding, metadata, provenance and all binary channels before an actual held hash await", async () => {
    const input = await context(await tinyAtlas(), [paint({ opacity: 0.5, channels: ["baseColor", "orm"] })]);
    const expected = await composeBuildingSurfaceTile(input);
    const real = hashes.hashCanonicalJson, ready = deferred(), release = deferred();
    const hash = vi.spyOn(hashes, "hashCanonicalJson").mockImplementationOnce(async value => {
      const actual = await real(value); ready.resolve(); await release.promise; return actual;
    });
    let pending: ReturnType<typeof composeBuildingSurfaceTile> | undefined;
    try {
      pending = composeBuildingSurfaceTile(input); await ready.promise;
      input.artifact.bindings.length = 0; input.artifact.geometryRef.buildingId = "new-owner";
      input.atlas.manifest.slots[0].rectPx.x = 99;
      input.atlas.slotProvenance[0].sourceId = "new-source";
      for (const name of names) input.atlas.channels[name].data.fill(255);
      release.resolve();
      expect(stable(await pending)).toStrictEqual(stable(expected));
    } finally { release.resolve(); await pending?.catch(() => undefined); hash.mockRestore(); }
  });

  it("independently verifies complete tile metadata/channel hashes and rejects corrupt runtime artifacts", async () => {
    const input = await context(await tinyAtlas(), [paint({ opacity: 0.5 })]);
    expect(BuildingSurfaceBindingArtifactSchema.safeParse(input.artifact).success).toBe(true);
    const tile = await composeBuildingSurfaceTile(input);
    for (const name of names) expect(tile.channelHashes[name]).toBe(await hashes.sha256Hex(new Uint8Array(tile.channels[name].data)));
    const { channels, contentHash, ...metadata } = tile;
    expect(channels.baseColor.widthPx).toBe(4);
    expect(contentHash).toBe(await hashes.hashCanonicalJson(metadata));
    expect(tile.pixelContentHash).toBe(await hashes.hashCanonicalJson({
      schemaVersion: "0.1.0", algorithmVersion: "surface-tile-linear-over-nearest-repeat-v1",
      widthPx: 4, heightPx: 2, physicalSizeM: { width: 2, height: 1 }, channelHashes: tile.channelHashes
    }));
    const damaged = structuredClone(tile); damaged.channels.baseColor.data[0] ^= 255;
    await expect(verifyBuildingSurfaceTile(damaged)).rejects.toMatchObject({ code: "surfaceTile.tileHashMismatch" });
    const changedOwner = structuredClone(tile); changedOwner.geometryRef.buildingId = "changed";
    await expect(verifyBuildingSurfaceTile(changedOwner)).rejects.toMatchObject({ code: "surfaceTile.tileHashMismatch" });
    const badHash = structuredClone(tile); badHash.pixelContentHash = "0".repeat(64);
    await expect(verifyBuildingSurfaceTile(badHash)).rejects.toMatchObject({ code: "surfaceTile.tileHashMismatch" });
    const malformed = { ...tile, channels: { ...tile.channels, normal: { ...tile.channels.normal, data: "invalid" } } };
    expect(() => BuildingSurfaceTileArtifactSchema.safeParse(malformed)).not.toThrow();
    expect(BuildingSurfaceTileArtifactSchema.safeParse(malformed).success).toBe(false);
    await expect(verifyBuildingSurfaceTile(malformed)).rejects.toMatchObject({ code: "surfaceTile.invalidTile" });
    const verified = await verifyBuildingSurfaceTile(tile);
    for (const name of names) expect(verified.channels[name].data.buffer).not.toBe(tile.channels[name].data.buffer);
  });

  it("composes actual packed procedural atlas pixels through actual compiler/P0 bindings without regeneration", async () => {
    const fixture = await createAtlasLabFixture(), atlas = fixture.packedAtlas, spec = surfaceFixtureSpec();
    const catalog = await buildComponentCatalog(spec, atlas.manifest), graph = await buildBuildingGraph(spec, catalog, { fidelityMode: "kit" });
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const ir = await compileBuilding({ spec, catalog, graph, fidelityMode: "kit", facadePlan });
    const frame = atlas.manifest.slots.find(value => value.role === "frame")!;
    const layer = paint({ opacity: 0.65, channels: ["baseColor", "orm"], physicalSizeM: { ...frame.physicalSizeM },
      mask: { kind: "channel", sourceId: "paint", channel: "height", component: "r" } });
    const input = await context(atlas, [layer], ir), before = stable({ atlas, ir, artifact: input.artifact });
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    try {
      const tile = await composeBuildingSurfaceTile(input);
      expect(stable({ atlas, ir, artifact: input.artifact })).toStrictEqual(before);
      expect(await hashPackedAtlasContent(atlas)).toBe(atlas.contentHash);
      const chunks = [new TextEncoder().encode(canonicalJson({ schemaVersion: "0.1.0", slotProvenance: atlas.slotProvenance }))];
      for (const name of [...names].sort()) {
        const data = atlas.channels[name];
        chunks.push(new TextEncoder().encode(name + ":" + data.widthPx + "x" + data.heightPx + ":"));
        chunks.push(new Uint8Array(data.data));
      }
      const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      expect(await hashes.sha256Hex(bytes)).toBe(atlas.contentHash);
      for (const name of ["normal", "height", "opacity"] as const)
        expect(Array.from(tile.channels[name].data)).toEqual(independentCrop(atlas.channels[name], frame.rectPx));
      expect(Array.from(tile.channels.baseColor.data)).not.toEqual(independentCrop(atlas.channels.baseColor, frame.rectPx));
      const source = atlas.manifest.slots.find(value => value.role === "wall")!;
      const sourceX = source.rectPx.x + Math.floor(0.5 / tile.widthPx * source.rectPx.width);
      const sourceY = source.rectPx.y + Math.floor(0.5 / tile.heightPx * source.rectPx.height);
      const incoming = pixel(atlas.channels.orm, sourceX, sourceY);
      const previous = pixel(atlas.channels.orm, frame.rectPx.x, frame.rectPx.y);
      const mask = pixel(atlas.channels.height, sourceX, sourceY)[0] / 255 * 0.65;
      expect(pixel(tile.channels.orm, 0)).toEqual(previous.map((value, component) => Math.round(value * (1 - mask) + incoming[component] * mask)));
      expect(tile.geometryRef).toEqual(input.artifact.geometryRef);
      expect(tile.sourceAtlas.contentHash).toBe(atlas.contentHash);
      expect(stable(await verifyBuildingSurfaceTile(tile))).toStrictEqual(stable(tile));
      expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled();
    } finally { generate.mockRestore(); interpret.mockRestore(); }
  }, 30_000);

  it("records layout identity separately from the legacy pixel/provenance content pin", async () => {
    const atlas = await tinyAtlas(), before = await composeBuildingSurfaceTile(await context(atlas));
    const moved = structuredClone(atlas);
    moved.manifest.slots[0].rectPx.x = 2; moved.manifest.slots[1].rectPx.x = 0;
    expect(await hashPackedAtlasContent(moved)).toBe(atlas.contentHash);
    const after = await composeBuildingSurfaceTile(await context(moved));
    expect(after.sourceAtlas.contentHash).toBe(before.sourceAtlas.contentHash);
    expect(after.sourceAtlas.manifestHash).not.toBe(before.sourceAtlas.manifestHash);
    expect(after.pixelContentHash).not.toBe(before.pixelContentHash);
  });

  it("diagnoses unsupported physical precision, missing targets and invalid binding metadata before output", async () => {
    const atlas = await tinyAtlas();
    await rejected(await context(atlas, [paint({ physicalSizeM: { width: Number.MIN_VALUE, height: 1 } })]), "surfaceTile.unsupportedScale");
    const input = await context(atlas, [paint()]);
    await rejected({ ...input, relativePath: "facade/front/absent" }, "surfaceTile.missingTarget");
    const invalid = structuredClone(input);
    invalid.artifact.bindings.find(value => value.relativePath === input.relativePath)!.layers[0].physicalSizeM.width = 0;
    await rejected(invalid, "surfaceTile.invalidBinding");
    const badSchema = { ...input, artifact: { ...input.artifact, schemaVersion: "9.0.0" } };
    await rejected(badSchema, "surfaceTile.invalidBinding");
    await rejected(await context(atlas, [paint({ opacity: 0, blend: "multiply", channels: ["normal"] })]), "surfaceTile.unsupportedNormalMultiply");
    expect(new BuildingSurfaceTileError("surfaceTile.missingTarget", "missing")).toBeInstanceOf(Error);
  });
});

