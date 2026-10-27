import { z } from "zod";
import { AtlasChannelSchema, AtlasManifestSchema, AtlasSlotSchema, type AtlasChannel, type AtlasSlot } from "../contracts/atlasManifest";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import {
  BuildingSurfaceBindingArtifactSchema, BuildingSurfaceTileArtifactSchema,
  SURFACE_TILE_ALGORITHM_V1, SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2,
  type BuildingSurfaceTileArtifact
} from "../contracts/surfaceComposition";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import { hashPackedAtlasContent, type PackedAtlas, type PackedAtlasChannels } from "./atlasPacker";
import type { PixelLayer } from "./providers/proceduralMaterialProvider";
import { ConstantSurfaceBaseAppearanceSchema } from "../contracts/surfaceBaseAppearance";
import { surfaceBaseRgba, verifyConstantSurfaceBaseAppearance } from "./surfaceBaseAppearance";

const names = AtlasChannelSchema.options;
const maxBytes = 128 * 1024 * 1024;
const typedPrototype = Object.getPrototypeOf(Uint8ClampedArray.prototype);
const nativeTag = Object.getOwnPropertyDescriptor(typedPrototype, Symbol.toStringTag)!.get!;
const nativeBytes = Object.getOwnPropertyDescriptor(typedPrototype, "byteLength")!.get!;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedPrototype, "buffer")!.get!;
const nativeArrayBufferBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;

export type BuildingSurfaceTileErrorCode =
  "surfaceTile.invalidInput" | "surfaceTile.invalidAtlas" | "surfaceTile.invalidBinding" |
  "surfaceTile.missingTarget" | "surfaceTile.sourcePinMismatch" | "surfaceTile.sourceHashMismatch" |
  "surfaceTile.bindingHashMismatch" | "surfaceTile.unsupportedScale" | "surfaceTile.unsupportedNormalMultiply" |
  "surfaceTile.invalidTile" | "surfaceTile.tileHashMismatch" | "surfaceTile.invalidBaseAppearance";
export class BuildingSurfaceTileError extends Error {
  readonly name = "BuildingSurfaceTileError";
  constructor(readonly code: BuildingSurfaceTileErrorCode, message: string) { super(message); }
}
function fail(code: BuildingSurfaceTileErrorCode, message: string): never {
  throw new BuildingSurfaceTileError(code, message);
}
function record(value: unknown): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length)
    fail("surfaceTile.invalidInput", "Expected a plain data record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(item => !item.enumerable || !("value" in item)))
    fail("surfaceTile.invalidInput", "Accessors and hidden properties are unsupported.");
  return descriptors;
}
function field(value: unknown, name: string): unknown {
  const descriptor = record(value)[name];
  if (!descriptor) fail("surfaceTile.invalidInput", "Missing field: " + name);
  return descriptor.value;
}
function exact(value: unknown, keys: string[]): void {
  if (Object.keys(record(value)).sort().join(",") !== [...keys].sort().join(","))
    fail("surfaceTile.invalidInput", "Unexpected record fields.");
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length)
    fail("surfaceTile.invalidInput", "Expected a plain dense array.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (length > 100_000 || Object.keys(descriptors).some(key => key !== "length" &&
      (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)))
    fail("surfaceTile.invalidInput", "Unsupported array bounds or properties.");
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail("surfaceTile.invalidInput", "Array holes/accessors are unsupported.");
    return descriptor.value;
  });
}
function json(value: unknown, optional: (path: Array<string | number>) => boolean = () => false): unknown {
  const issue = findBuildingDocumentJsonIssue(value, optional);
  if (issue) fail("surfaceTile.invalidInput", issue.message);
  return structuredClone(value);
}
function ownLayer(value: unknown, width: number, height: number): PixelLayer {
  exact(value, ["widthPx", "heightPx", "channels", "data"]);
  if (field(value, "widthPx") !== width || field(value, "heightPx") !== height || field(value, "channels") !== "rgba8")
    fail("surfaceTile.invalidAtlas", "Every channel must be aligned RGBA8 data.");
  const data = field(value, "data");
  try {
    if (!ArrayBuffer.isView(data) || nativeTag.call(data) !== "Uint8ClampedArray" ||
        nativeBytes.call(data) !== width * height * 4 ||
        nativeArrayBufferBytes.call(nativeBuffer.call(data)) < width * height * 4)
      fail("surfaceTile.invalidAtlas", "Expected available RGBA8 bytes backed by ArrayBuffer.");
  } catch (error) {
    if (error instanceof BuildingSurfaceTileError) throw error;
    fail("surfaceTile.invalidAtlas", "Channel bytes are unavailable.");
  }
  const owned = new Uint8ClampedArray(width * height * 4);
  owned.set(data as Uint8ClampedArray);
  return { widthPx: width, heightPx: height, channels: "rgba8", data: owned };
}
const provenanceSchema = z.array(z.object({
  slotId: z.string().min(1), sourceId: z.string().min(1), providerId: z.string().min(1),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()).max(4096);
const manifestSchema = AtlasManifestSchema.extend({ slots: z.array(AtlasSlotSchema.strict()).max(4096) }).strict();
function ownAtlas(value: unknown): PackedAtlas {
  exact(value, ["schemaVersion", "atlasId", "manifest", "channels", "slotProvenance", "contentHash", "diagnostics"]);
  const parsed = manifestSchema.safeParse(json(field(value, "manifest"), path =>
    path.length === 3 && path[0] === "slots" && typeof path[1] === "number" &&
    ["profileRecipeId", "metersPerTile", "artKitMaterialRoleId", "proceduralSource"].includes(String(path[2]))));
  const provenance = provenanceSchema.safeParse(json(field(value, "slotProvenance")));
  if (!parsed.success || !provenance.success) fail("surfaceTile.invalidAtlas", "Atlas metadata/provenance is invalid.");
  const manifest = parsed.data, contentHash = field(value, "contentHash");
  if (field(value, "schemaVersion") !== "0.1.0" || field(value, "atlasId") !== manifest.atlasId ||
      typeof contentHash !== "string" || !/^[a-f0-9]{64}$/.test(contentHash) ||
      manifest.widthPx > 8192 || manifest.heightPx > 8192 ||
      manifest.widthPx * manifest.heightPx * 4 * names.length > maxBytes ||
      manifest.channels.length !== names.length || names.some(name => !manifest.channels.includes(name)) ||
      new Set(manifest.channels).size !== names.length)
    fail("surfaceTile.invalidAtlas", "Atlas identity, dimensions or channel set is unsupported.");
  for (const diagnostic of array(field(value, "diagnostics"))) {
    const severity = field(diagnostic, "severity");
    if (!["info", "warning", "error"].includes(String(severity)) || severity === "error")
      fail("surfaceTile.invalidAtlas", "An atlas with errors cannot be composed.");
  }
  const slots = new Map(manifest.slots.map(slot => [slot.id, slot]));
  const provenanceBySlot = new Map(provenance.data.map(item => [item.slotId, item]));
  if (slots.size !== manifest.slots.length || provenanceBySlot.size !== provenance.data.length ||
      slots.size !== provenanceBySlot.size || slots.size === 0)
    fail("surfaceTile.invalidAtlas", "Every unique atlas slot needs exact provenance.");
  for (const slot of manifest.slots) {
    const rect = slot.rectPx, source = provenanceBySlot.get(slot.id);
    if (!source || source.sourceId !== slot.materialSourceId ||
        rect.x + rect.width > manifest.widthPx || rect.y + rect.height > manifest.heightPx)
      fail("surfaceTile.invalidAtlas", "Atlas slot bounds/source provenance do not match.");
  }
  for (let index = 0; index < manifest.slots.length; index++) for (const other of manifest.slots.slice(index + 1)) {
    const a = manifest.slots[index].rectPx, b = other.rectPx;
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
      fail("surfaceTile.invalidAtlas", "Source slot interiors cannot overlap.");
  }
  const rawChannels = field(value, "channels"); exact(rawChannels, names);
  const channels = Object.fromEntries(names.map(name =>
    [name, ownLayer(field(rawChannels, name), manifest.widthPx, manifest.heightPx)])) as unknown as PackedAtlasChannels;
  return { schemaVersion: "0.1.0", atlasId: manifest.atlasId, manifest, channels,
    slotProvenance: provenance.data, contentHash, diagnostics: [] };
}
function crop(layer: PixelLayer, slot: AtlasSlot): PixelLayer {
  const rect = slot.rectPx, data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const source = ((rect.y + y) * layer.widthPx + rect.x + x) * 4;
    data.set(layer.data.subarray(source, source + 4), (y * rect.width + x) * 4);
  }
  return { widthPx: rect.width, heightPx: rect.height, channels: "rgba8", data };
}
function sample(layer: PixelLayer, slot: AtlasSlot, u: number, v: number): number[] {
  const rect = slot.rectPx;
  const x = rect.x + Math.min(rect.width - 1, Math.floor((u - Math.floor(u)) * rect.width));
  const y = rect.y + Math.min(rect.height - 1, Math.floor((v - Math.floor(v)) * rect.height));
  const offset = (y * layer.widthPx + x) * 4;
  return [layer.data[offset], layer.data[offset + 1], layer.data[offset + 2], layer.data[offset + 3]];
}
const decode = (byte: number) => byte / 255 <= 0.04045 ? byte / 255 / 12.92 : ((byte / 255 + 0.055) / 1.055) ** 2.4;
const encode = (linear: number) => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));
function blendPixel(name: AtlasChannel, destination: Uint8ClampedArray, offset: number, source: number[],
  weight: number, blend: "replace" | "multiply"): void {
  if (weight === 0) return;
  if (name === "normal") {
    const old = [0, 1, 2].map(axis => destination[offset + axis] / 127.5 - 1);
    const next = old.map((value, axis) => value + (source[axis] / 127.5 - 1 - value) * weight);
    let length = Math.hypot(...next);
    if (length < 1e-12) { next.splice(0, 3, ...old); length = Math.hypot(...next); }
    if (length < 1e-12) { next.splice(0, 3, 0, 0, 1); length = 1; }
    for (let axis = 0; axis < 3; axis++) destination[offset + axis] = Math.round((next[axis] / length * 0.5 + 0.5) * 255);
    destination[offset + 3] = Math.round(destination[offset + 3] + (source[3] - destination[offset + 3]) * weight);
    return;
  }
  for (let component = 0; component < 4; component++) {
    const previous = destination[offset + component], incoming = source[component];
    if (name === "baseColor" && component < 3) {
      const a = decode(previous), b = decode(incoming), target = blend === "replace" ? b : a * b;
      destination[offset + component] = encode(a + (target - a) * weight);
    } else {
      const target = blend === "replace" ? incoming : previous * incoming / 255;
      destination[offset + component] = Math.round(previous + (target - previous) * weight);
    }
  }
}
function pixelHeader(tile: Pick<BuildingSurfaceTileArtifact, "schemaVersion" | "algorithmVersion" | "widthPx" | "heightPx" | "physicalSizeM" | "channelHashes">) {
  return { schemaVersion: tile.schemaVersion, algorithmVersion: tile.algorithmVersion, widthPx: tile.widthPx, heightPx: tile.heightPx,
    physicalSizeM: tile.physicalSizeM, channelHashes: tile.channelHashes };
}
function tileHeader(tile: Omit<BuildingSurfaceTileArtifact, "contentHash">) {
  return { schemaVersion: tile.schemaVersion, algorithmVersion: tile.algorithmVersion,
    ...("baseAppearanceRef" in tile ? { baseAppearanceRef: tile.baseAppearanceRef } : {}),
    geometryRef: tile.geometryRef, bindingRef: tile.bindingRef, sourceAtlas: tile.sourceAtlas,
    baseSlotId: tile.baseSlotId, recipeHash: tile.recipeHash, widthPx: tile.widthPx, heightPx: tile.heightPx,
    physicalSizeM: tile.physicalSizeM, channelHashes: tile.channelHashes, pixelContentHash: tile.pixelContentHash };
}
async function channelHashes(channels: PackedAtlasChannels): Promise<BuildingSurfaceTileArtifact["channelHashes"]> {
  return Object.fromEntries(await Promise.all(names.map(async name =>
    [name, await sha256Hex(new Uint8Array(channels[name].data))]))) as BuildingSurfaceTileArtifact["channelHashes"];
}
function requirePin(pin: { atlasContentHash: string; slotId: string }, atlas: PackedAtlas): AtlasSlot {
  const slot = atlas.manifest.slots.find(value => value.id === pin.slotId);
  if (!slot || pin.atlasContentHash !== atlas.contentHash)
    fail("surfaceTile.sourcePinMismatch", "The pinned source slot is unavailable.");
  return slot;
}

/**
 * Samples each layer/mask on the same pixel-centred physical repeat domain.
 * Masks and opacity alone define coverage. Base-color RGB blends in linear light;
 * alpha and ORM/height/opacity are scalar data. Replace normals are renormalized.
 * Normal multiply is explicitly unsupported. Noops preserve literal base bytes.
 */
export async function composeBuildingSurfaceTile(input: unknown): Promise<BuildingSurfaceTileArtifact> {
  const hasBase = Object.keys(record(input)).includes("baseAppearance");
  exact(input, ["artifact", "relativePath", "atlas", ...(hasBase ? ["baseAppearance"] : [])]);
  const parsedBase = hasBase ? ConstantSurfaceBaseAppearanceSchema.safeParse(field(input, "baseAppearance")) : undefined;
  if (parsedBase && !parsedBase.success) fail("surfaceTile.invalidBaseAppearance", "Surface base appearance is invalid.");
  const baseAppearance = parsedBase?.success ? parsedBase.data : undefined;
  const parsed = BuildingSurfaceBindingArtifactSchema.safeParse(field(input, "artifact"));
  if (!parsed.success) fail("surfaceTile.invalidBinding", "Surface binding artifact is invalid.");
  const artifact = parsed.data, relativePath = field(input, "relativePath");
  if (typeof relativePath !== "string") fail("surfaceTile.invalidInput", "An exact relative semantic path is required.");
  const binding = artifact.bindings.find(value => value.relativePath === relativePath);
  if (!binding) fail("surfaceTile.missingTarget", "No binding exists for the selected semantic element.");
  const atlas = ownAtlas(field(input, "atlas"));
  const base = requirePin(binding.baseSlot, atlas);
  if (base.role !== binding.role) fail("surfaceTile.sourcePinMismatch", "The base slot material role changed.");
  if (baseAppearance && (baseAppearance.slotId !== base.id || baseAppearance.role !== base.role))
    fail("surfaceTile.invalidBaseAppearance", "Surface base appearance does not match its target slot and role.");
  const schemaVersion: BuildingSurfaceTileArtifact["schemaVersion"] = baseAppearance ? "0.2.0" : "0.1.0";
  const algorithmVersion = baseAppearance ? SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2 : SURFACE_TILE_ALGORITHM_V1;
  const baseAppearanceRef = baseAppearance ? { schemaVersion: baseAppearance.schemaVersion, contentHash: baseAppearance.contentHash, slotId: baseAppearance.slotId } : undefined;
  const operations = binding.layers.map(layer => {
    const source = requirePin(layer.source, atlas);
    const mask = layer.mask.kind === "channel" ? requirePin(layer.mask.source, atlas) : null;
    if (layer.blend === "multiply" && layer.channels.includes("normal"))
      fail("surfaceTile.unsupportedNormalMultiply", "Normal maps support normalized replacement; multiply is unsupported.");
    const repeatX = base.physicalSizeM.width / layer.physicalSizeM.width;
    const repeatY = base.physicalSizeM.height / layer.physicalSizeM.height;
    if (![repeatX, repeatY].every(value => Number.isFinite(value) && value > 0 && value <= 1_000_000))
      fail("surfaceTile.unsupportedScale", "Physical scale exceeds supported repeat precision.");
    return { layer, source, mask, repeatX, repeatY };
  });
  // Every consumed header and binary plane is owned before the first await.
  const manifestHash = await hashCanonicalJson(atlas.manifest);
  if (baseAppearance) {
    try { await verifyConstantSurfaceBaseAppearance(baseAppearance); }
    catch { fail("surfaceTile.invalidBaseAppearance", "Surface base appearance does not match its content hash."); }
  }
  const actualAtlasHash = await hashPackedAtlasContent(atlas);
  if (actualAtlasHash !== atlas.contentHash) fail("surfaceTile.sourceHashMismatch", "Atlas pixels/provenance do not match their content pin.");
  const { contentHash: expectedBindingHash, ...bindingPayload } = artifact;
  if (await hashCanonicalJson(bindingPayload) !== expectedBindingHash)
    fail("surfaceTile.bindingHashMismatch", "Binding artifact content hash does not match its owned payload.");
  const recipeHash = await hashCanonicalJson({ algorithmVersion, baseSlot: binding.baseSlot,
    ...(baseAppearanceRef ? { baseAppearanceRef } : {}),
    layers: binding.layers, physicalSizeM: base.physicalSizeM, manifestHash });
  const widthPx = base.rectPx.width, heightPx = base.rectPx.height;
  const palette = baseAppearance ? surfaceBaseRgba(baseAppearance) : undefined;
  const channels = Object.fromEntries(names.map(name => {
    if (!palette) return [name, crop(atlas.channels[name], base)];
    const data = new Uint8ClampedArray(widthPx * heightPx * 4);
    for (let offset = 0; offset < data.length; offset += 4) data.set(palette[name], offset);
    return [name, { widthPx, heightPx, channels: "rgba8", data }];
  })) as unknown as PackedAtlasChannels;
  for (const { layer, source, mask, repeatX, repeatY } of operations) {
    for (let y = 0; y < heightPx; y++) for (let x = 0; x < widthPx; x++) {
      const u = (x + 0.5) / widthPx * repeatX, v = (y + 0.5) / heightPx * repeatY;
      const maskValue = layer.mask.kind === "constant" ? layer.mask.value :
        sample(atlas.channels[layer.mask.channel], mask!, u, v)[["r", "g", "b", "a"].indexOf(layer.mask.component)] / 255;
      const weight = maskValue * layer.opacity;
      if (weight === 0) continue;
      for (const name of layer.channels) blendPixel(name, channels[name].data, (y * widthPx + x) * 4,
        sample(atlas.channels[name], source, u, v), weight, layer.blend);
    }
  }
  const hashes = await channelHashes(channels);
  const pixelContentHash = await hashCanonicalJson(pixelHeader({ schemaVersion, algorithmVersion, widthPx, heightPx, physicalSizeM: base.physicalSizeM, channelHashes: hashes }));
  const payload = {
    schemaVersion, algorithmVersion, ...(baseAppearanceRef ? { baseAppearanceRef } : {}), geometryRef: artifact.geometryRef,
    bindingRef: { contentHash: artifact.contentHash, relativePath: binding.relativePath },
    sourceAtlas: { contentHash: atlas.contentHash, manifestHash }, baseSlotId: base.id, recipeHash,
    widthPx, heightPx, physicalSizeM: base.physicalSizeM, channels, channelHashes: hashes, pixelContentHash
  };
  const contentHash = await hashCanonicalJson(tileHeader(payload));
  return BuildingSurfaceTileArtifactSchema.parse({ ...payload, contentHash });
}

/** Own and verify an existing runtime tile before consuming/exporting its pixels. */
export async function verifyBuildingSurfaceTile(input: unknown): Promise<BuildingSurfaceTileArtifact> {
  const parsed = BuildingSurfaceTileArtifactSchema.safeParse(input);
  if (!parsed.success) fail("surfaceTile.invalidTile", "Surface tile metadata or binary channels are invalid.");
  const value = parsed.data;
  if (value.widthPx * value.heightPx * 4 * names.length > maxBytes)
    fail("surfaceTile.invalidTile", "Surface tile exceeds the supported binary budget.");
  const channels = Object.fromEntries(names.map(name =>
    [name, ownLayer(value.channels[name], value.widthPx, value.heightPx)])) as unknown as PackedAtlasChannels;
  const owned = { ...value, channels }, hashes = await channelHashes(channels);
  if (names.some(name => hashes[name] !== owned.channelHashes[name]) ||
      await hashCanonicalJson(pixelHeader(owned)) !== owned.pixelContentHash ||
      await hashCanonicalJson(tileHeader(owned)) !== owned.contentHash)
    fail("surfaceTile.tileHashMismatch", "Surface tile bytes/metadata do not match their content hashes.");
  return BuildingSurfaceTileArtifactSchema.parse(owned);
}


