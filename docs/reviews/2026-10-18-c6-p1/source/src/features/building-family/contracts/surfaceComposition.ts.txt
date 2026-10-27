import { z } from "zod";
import { AtlasChannelSchema, AtlasSlotSchema } from "./atlasManifest";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { SchemaVersion010 } from "./shared";

const identifier = z.string().min(1).max(512).refine(value => value.trim() === value, "Identifiers cannot have surrounding whitespace.");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const unit = z.number().finite().min(0).max(1);
const physicalSize = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
}).strict();
const relativePath = identifier.refine(value =>
  !value.startsWith("building/") && /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) &&
  value.split("/").every(part => part !== "." && part !== ".."),
"Use a relative semantic path without a generated building/family prefix.");
const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

export const BuildingSurfaceRoleSchema = AtlasSlotSchema.shape.role;
export const BuildingSurfaceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: BuildingSurfaceRoleSchema }).strict(),
  z.object({ kind: z.literal("slot"), slotId: identifier }).strict(),
  z.object({
    kind: z.literal("element"), relativePath, expectedRole: BuildingSurfaceRoleSchema
  }).strict()
]);

/** Sources are pinned existing atlas slots. Pixel generation is a separate stage. */
export const BuildingSurfaceSourceSchema = z.object({
  id: identifier, atlasContentHash: hash, slotId: identifier
}).strict();
export const BuildingSurfaceMaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), value: unit }).strict(),
  z.object({
    kind: z.literal("channel"), sourceId: identifier, channel: AtlasChannelSchema,
    component: z.enum(["r", "g", "b", "a"])
  }).strict()
]);
const channels = z.array(AtlasChannelSchema).min(1).max(5).refine(
  values => new Set(values).size === values.length, "Channels must be unique."
);

/** Ordered layer instructions; resolving bindings does not evaluate pixels. */
export const BuildingSurfaceLayerSchema = z.object({
  id: identifier, target: BuildingSurfaceTargetSchema, sourceId: identifier,
  mask: BuildingSurfaceMaskSchema, blend: z.enum(["replace", "multiply"]),
  opacity: unit, physicalSizeM: physicalSize, channels
}).strict();

const composition = z.object({
  schemaVersion: SchemaVersion010, documentId: identifier,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sources: z.array(BuildingSurfaceSourceSchema).max(1024),
  layers: z.array(BuildingSurfaceLayerSchema).max(4096)
}).strict().superRefine((value, context) => {
  const sources = new Set<string>(), layers = new Set<string>();
  value.sources.forEach((source, index) => {
    if (sources.has(source.id)) context.addIssue({
      code: "custom", path: ["sources", index, "id"], message: "Source ids must be unique."
    });
    sources.add(source.id);
  });
  value.layers.forEach((layer, index) => {
    if (layers.has(layer.id)) context.addIssue({
      code: "custom", path: ["layers", index, "id"], message: "Layer ids must be unique."
    });
    layers.add(layer.id);
    if (!sources.has(layer.sourceId)) context.addIssue({
      code: "custom", path: ["layers", index, "sourceId"], message: "Layer source is missing."
    });
    if (layer.mask.kind === "channel" && !sources.has(layer.mask.sourceId)) context.addIssue({
      code: "custom", path: ["layers", index, "mask", "sourceId"], message: "Mask source is missing."
    });
  });
});
export const BuildingSurfaceCompositionSchema = json.pipe(composition);
export type BuildingSurfaceComposition = z.infer<typeof BuildingSurfaceCompositionSchema>;
export type BuildingSurfaceLayer = z.infer<typeof BuildingSurfaceLayerSchema>;
export type BuildingSurfaceRole = z.infer<typeof BuildingSurfaceRoleSchema>;

const pinnedSlot = z.object({ atlasContentHash: hash, slotId: identifier }).strict();
const resolvedMask = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), value: unit }).strict(),
  z.object({
    kind: z.literal("channel"), source: pinnedSlot, channel: AtlasChannelSchema,
    component: z.enum(["r", "g", "b", "a"])
  }).strict()
]);
export const BuildingResolvedSurfaceLayerSchema = z.object({
  id: identifier, source: pinnedSlot, mask: resolvedMask,
  blend: z.enum(["replace", "multiply"]), opacity: unit,
  physicalSizeM: physicalSize, channels
}).strict();
export const BuildingSurfaceBindingSchema = z.object({
  relativePath, kind: z.enum(["mesh", "instance"]), batchId: identifier,
  coverage: z.enum(["instance", "whole-mesh", "mesh-piece"]),
  elementIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  role: BuildingSurfaceRoleSchema, baseSlot: pinnedSlot,
  layers: z.array(BuildingResolvedSurfaceLayerSchema).max(4096)
}).strict().superRefine((value, context) => {
  if ((value.kind === "instance" && (value.elementIndex === null || value.coverage !== "instance")) ||
      (value.kind === "mesh" && value.coverage === "instance")) context.addIssue({
    code: "custom", path: ["elementIndex"], message: "Binding coverage must agree with its kind and exact instance index."
  });
  if (new Set(value.layers.map(layer => layer.id)).size !== value.layers.length) context.addIssue({
    code: "custom", path: ["layers"], message: "A binding cannot repeat a layer."
  });
});
const artifact = z.object({
  schemaVersion: SchemaVersion010,
  resolverVersion: z.literal("semantic-surface-bindings-v1"),
  documentId: identifier, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  geometryRef: z.object({ buildingId: identifier, familyId: identifier, sourceGraphHash: identifier }).strict(),
  compositionHash: hash, contentHash: hash,
  bindings: z.array(BuildingSurfaceBindingSchema).max(100_000)
}).strict().superRefine((value, context) => {
  const paths = new Set<string>(), addresses = new Set<string>();
  value.bindings.forEach((binding, index) => {
    const address = JSON.stringify([binding.kind, binding.batchId, binding.elementIndex]);
    if (paths.has(binding.relativePath) || addresses.has(address)) context.addIssue({
      code: "custom", path: ["bindings", index], message: "Surface bindings must have unambiguous paths and addresses."
    });
    paths.add(binding.relativePath); addresses.add(address);
  });
});
export const BuildingSurfaceBindingArtifactSchema = json.pipe(artifact);
export type BuildingSurfaceBindingArtifact = z.infer<typeof BuildingSurfaceBindingArtifactSchema>;
export type BuildingSurfaceBinding = z.infer<typeof BuildingSurfaceBindingSchema>;
export type BuildingResolvedSurfaceLayer = z.infer<typeof BuildingResolvedSurfaceLayerSchema>;


/** Runtime RGBA tile data uses the same binary convention as PackedAtlas/IR. */
const surfaceTypedArrayPrototype = Object.getPrototypeOf(Uint8ClampedArray.prototype);
const surfaceTypedTag = Object.getOwnPropertyDescriptor(surfaceTypedArrayPrototype, Symbol.toStringTag)!.get!;
const surfaceTypedLength = Object.getOwnPropertyDescriptor(surfaceTypedArrayPrototype, "byteLength")!.get!;
const surfaceTypedBuffer = Object.getOwnPropertyDescriptor(surfaceTypedArrayPrototype, "buffer")!.get!;
const surfaceBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;

function surfaceRgbaBytes(value: unknown): value is Uint8ClampedArray {
  try {
    return ArrayBuffer.isView(value) && surfaceTypedTag.call(value) === "Uint8ClampedArray" &&
      Number.isSafeInteger(surfaceBufferLength.call(surfaceTypedBuffer.call(value)));
  } catch { return false; }
}
function surfaceBinaryIssue(input: unknown): boolean {
  const ancestors = new Set<object>();
  let visited = 0;
  function visit(value: unknown, depth: number): boolean {
    if (++visited > 100_000 || depth > 128) return true;
    if (value === null || typeof value === "string" || typeof value === "boolean") return false;
    if (typeof value === "number") return !Number.isFinite(value);
    if (ArrayBuffer.isView(value)) return !surfaceRgbaBytes(value);
    if (!value || typeof value !== "object" || ancestors.has(value)) return true;
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if ((array && prototype !== Array.prototype) ||
        (!array && prototype !== Object.prototype && prototype !== null) ||
        Object.getOwnPropertySymbols(value).length) return true;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    ancestors.add(value);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
        if (!Number.isSafeInteger(length) || length > 100_000 ||
            Object.keys(descriptors).some(key => key !== "length" &&
              (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) return true;
        for (let index = 0; index < length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || visit(descriptor.value, depth + 1)) return true;
        }
      } else for (const descriptor of Object.values(descriptors))
        if (!descriptor.enumerable || !("value" in descriptor) || visit(descriptor.value, depth + 1)) return true;
      return false;
    } finally { ancestors.delete(value); }
  }
  return visit(input, 0);
}
const surfaceBinaryBoundary = z.unknown().superRefine((value, context) => {
  if (surfaceBinaryIssue(value)) context.addIssue({ code: "custom", message: "Expected owned finite metadata and RGBA8 binary planes without accessors or cycles." });
});
export const BuildingSurfacePixelLayerSchema = z.object({
  widthPx: z.number().int().positive().max(8192),
  heightPx: z.number().int().positive().max(8192),
  channels: z.literal("rgba8"),
  data: z.custom<Uint8ClampedArray>(surfaceRgbaBytes, "Expected an available Uint8ClampedArray backed by ArrayBuffer.")
}).strict().superRefine((layer, context) => {
  if (!surfaceRgbaBytes(layer.data)) return;
  if (layer.widthPx * layer.heightPx > 16_777_216 ||
      surfaceTypedLength.call(layer.data) !== layer.widthPx * layer.heightPx * 4) context.addIssue({
    code: "custom", path: ["data"], message: "RGBA byte length must match bounded pixel dimensions."
  });
});
const surfaceTileChannels = z.object({
  baseColor: BuildingSurfacePixelLayerSchema,
  normal: BuildingSurfacePixelLayerSchema,
  orm: BuildingSurfacePixelLayerSchema,
  height: BuildingSurfacePixelLayerSchema,
  opacity: BuildingSurfacePixelLayerSchema
}).strict();
const surfaceTileHashes = z.object({
  baseColor: hash, normal: hash, orm: hash, height: hash, opacity: hash
}).strict();
export const SURFACE_TILE_ALGORITHM_V1 = "surface-tile-linear-over-nearest-repeat-v1" as const;
export const SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2 = "surface-tile-linear-over-nearest-repeat-constant-base-v2" as const;
const surfaceTileFields = {
  geometryRef: z.object({ buildingId: identifier, familyId: identifier, sourceGraphHash: identifier }).strict(),
  bindingRef: z.object({ contentHash: hash, relativePath }).strict(),
  sourceAtlas: z.object({ contentHash: hash, manifestHash: hash }).strict(),
  baseSlotId: identifier, recipeHash: hash,
  widthPx: z.number().int().positive().max(8192),
  heightPx: z.number().int().positive().max(8192),
  physicalSizeM: physicalSize,
  channels: surfaceTileChannels,
  channelHashes: surfaceTileHashes,
  pixelContentHash: hash, contentHash: hash
};
const surfaceTile = z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: SchemaVersion010, algorithmVersion: z.literal(SURFACE_TILE_ALGORITHM_V1), ...surfaceTileFields }).strict(),
  z.object({ schemaVersion: z.literal("0.2.0"), algorithmVersion: z.literal(SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2),
    baseAppearanceRef: z.object({ schemaVersion: SchemaVersion010, contentHash: hash, slotId: identifier }).strict(), ...surfaceTileFields }).strict()
]).superRefine((tile, context) => {
  if (tile.schemaVersion === "0.2.0" && tile.baseAppearanceRef.slotId !== tile.baseSlotId)
    context.addIssue({ code: "custom", path: ["baseAppearanceRef", "slotId"], message: "Base appearance reference must identify the tile's base slot." });
  for (const name of AtlasChannelSchema.options) {
    const layer = tile.channels[name];
    if (layer.widthPx !== tile.widthPx || layer.heightPx !== tile.heightPx) context.addIssue({
      code: "custom", path: ["channels", name], message: "All five tile channels must align."
    });
  }
});
export const BuildingSurfaceTileArtifactSchema = surfaceBinaryBoundary.pipe(surfaceTile);
export type BuildingSurfaceTileArtifact = z.infer<typeof BuildingSurfaceTileArtifactSchema>;
