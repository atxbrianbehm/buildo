import { z } from "zod";
import { AtlasChannelSchema } from "../contracts/atlasManifest";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import {
  BuildingSurfaceBindingArtifactSchema, BuildingSurfaceBindingSchema, BuildingSurfaceCompositionSchema,
  BuildingSurfaceRoleSchema, type BuildingResolvedSurfaceLayer, type BuildingSurfaceBindingArtifact
} from "../contracts/surfaceComposition";
import { hashCanonicalJson } from "../core/contentHash";

export type BuildingSurfaceBindingErrorCode =
  "surface.invalidInput" | "surface.invalidComposition" | "surface.invalidContext" |
  "surface.ambiguousTarget" | "surface.missingTarget" | "surface.unsupportedTarget" |
  "surface.roleMismatch" | "surface.missingSource" | "surface.missingChannel";
export class BuildingSurfaceBindingError extends Error {
  readonly name = "BuildingSurfaceBindingError";
  constructor(readonly code: BuildingSurfaceBindingErrorCode, message: string) { super(message); }
}
function fail(code: BuildingSurfaceBindingErrorCode, message: string): never {
  throw new BuildingSurfaceBindingError(code, message);
}

/** Read only data descriptors. Runtime geometry buffers are never traversed or copied. */
function record(value: unknown): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length) fail("surface.invalidInput", "Expected a plain data record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(item => !item.enumerable || !("value" in item)))
    fail("surface.invalidInput", "Accessors and hidden properties are unsupported.");
  return descriptors;
}
function field(value: unknown, key: string, optional = false): unknown {
  const descriptor = record(value)[key];
  if (!descriptor && !optional) fail("surface.invalidInput", "Missing field: " + key);
  return descriptor?.value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length) fail("surface.invalidInput", "Expected a plain dense array.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (!Number.isSafeInteger(length) || length > 100_000 ||
      Object.keys(descriptors).some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)))
    fail("surface.invalidInput", "Array exceeds supported bounds or has extra properties.");
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail("surface.invalidInput", "Array holes and accessors are unsupported.");
    return descriptor.value;
  });
}
const id = z.string().min(1).max(512), index = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const contextSchema = z.object({
  geometryRef: z.object({ buildingId: id, familyId: id, sourceGraphHash: id }).strict(),
  atlas: z.object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    channels: z.array(AtlasChannelSchema).min(1).max(5),
    slots: z.array(z.object({ id, role: BuildingSurfaceRoleSchema }).strict()).max(4096)
  }).strict(),
  batches: z.array(z.object({
    batchId: id, kind: z.enum(["mesh", "instance"]), slotId: id,
    count: index.nullable()
  }).strict()).max(100_000),
  entries: z.array(z.object({ semanticPath: id, batchId: id, elementIndex: index.nullable() }).strict()).max(100_000)
}).strict();
function captureContext(input: unknown) {
  const ir = field(input, "ir"), atlas = field(input, "atlas"), manifest = field(atlas, "manifest");
  const projection = {
    geometryRef: {
      buildingId: field(ir, "buildingId"), familyId: field(ir, "familyId"), sourceGraphHash: field(ir, "sourceGraphHash")
    },
    atlas: {
      contentHash: field(atlas, "contentHash"), channels: array(field(manifest, "channels")),
      slots: array(field(manifest, "slots")).map(slot => ({ id: field(slot, "id"), role: field(slot, "role") }))
    },
    batches: [
      ...array(field(ir, "meshBatches")).map(batch => ({
        batchId: field(batch, "batchId"), kind: "mesh", slotId: field(batch, "materialSlotId", true) ?? "utility.mask", count: null
      })),
      ...array(field(ir, "instanceBatches")).map(batch => ({
        batchId: field(batch, "batchId"), kind: "instance", slotId: field(batch, "materialSlotId"), count: field(batch, "count")
      }))
    ],
    entries: array(field(ir, "semanticIndex")).map(entry => ({
      semanticPath: field(entry, "semanticPath"), batchId: field(entry, "batchId"),
      elementIndex: field(entry, "elementIndex", true) ?? null
    }))
  };
  const parsed = contextSchema.safeParse(projection);
  if (!parsed.success) fail("surface.invalidContext", "Semantic/material metadata is invalid.");
  return parsed.data;
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/**
 * Shared role/slot layers execute in document order, then local element layers in
 * document order. Local targeting supports exact instances or a mesh batch with one
 * semantic owner. Mesh piece
 * indices have no face ranges and are never promoted into local material scopes.
 * The declared atlas pin is checked; this stage does not decode or hash its pixels.
 */
export async function resolveBuildingSurfaceBindings(input: {
  composition: unknown;
  ir: RuntimeBuildingIR;
  atlas: { manifest: unknown; contentHash: string };
}): Promise<BuildingSurfaceBindingArtifact> {
  const envelope = record(input);
  if (Object.keys(envelope).sort().join(",") !== "atlas,composition,ir")
    fail("surface.invalidInput", "Expected composition, IR and pinned atlas metadata.");
  const parsed = BuildingSurfaceCompositionSchema.safeParse(field(input, "composition"));
  if (!parsed.success) fail("surface.invalidComposition", "Surface composition is invalid.");
  const composition = parsed.data, context = captureContext(input);
  composition.sources.sort((a, b) => compare(a.id, b.id));
  for (const layer of composition.layers) layer.channels.sort((a, b) =>
    AtlasChannelSchema.options.indexOf(a) - AtlasChannelSchema.options.indexOf(b));
  const slots = new Map(context.atlas.slots.map(slot => [slot.id, slot]));
  if (slots.size !== context.atlas.slots.length || new Set(context.atlas.channels).size !== context.atlas.channels.length)
    fail("surface.invalidContext", "Atlas slots and channels must be unique.");
  const batches = new Map(context.batches.map(batch => [batch.batchId, batch]));
  if (batches.size !== context.batches.length) fail("surface.ambiguousTarget", "Batch ids must be unique.");
  const sources = new Map(composition.sources.map(source => [source.id, source]));
  for (const source of composition.sources) {
    if (source.atlasContentHash !== context.atlas.contentHash || !slots.has(source.slotId))
      fail("surface.missingSource", "Pinned source slot is unavailable: " + source.id);
  }
  const paths = new Set<string>(), addresses = new Set<string>(), prefix = "building/" + context.geometryRef.familyId + "/";
  const bindings = context.entries.map(entry => {
    const batch = batches.get(entry.batchId);
    if (!batch || !slots.has(batch.slotId) || !entry.semanticPath.startsWith(prefix))
      fail("surface.invalidContext", "Semantic entry has no matching batch, material slot or family.");
    if (batch.kind === "instance" && (entry.elementIndex === null || entry.elementIndex >= batch.count!))
      fail("surface.ambiguousTarget", "An instance requires an in-range exact element index.");
    const relativePath = entry.semanticPath.slice(prefix.length);
    const address = JSON.stringify([batch.kind, batch.batchId, entry.elementIndex]);
    if (paths.has(relativePath) || addresses.has(address)) fail("surface.ambiguousTarget", "Semantic paths and addresses must be unique.");
    paths.add(relativePath); addresses.add(address);
    const binding = BuildingSurfaceBindingSchema.safeParse({
      relativePath, kind: batch.kind, batchId: batch.batchId, elementIndex: entry.elementIndex,
      coverage: batch.kind === "instance" ? "instance" :
        context.entries.filter(value => value.batchId === batch.batchId).length === 1 ? "whole-mesh" : "mesh-piece",
      role: slots.get(batch.slotId)!.role,
      baseSlot: { atlasContentHash: context.atlas.contentHash, slotId: batch.slotId }, layers: []
    });
    if (!binding.success) fail("surface.invalidContext", "Unsupported semantic binding address.");
    return binding.data;
  }).sort((a, b) => compare(a.relativePath, b.relativePath));
  for (const batch of context.batches) {
    const owned = bindings.filter(binding => binding.batchId === batch.batchId);
    if ((batch.kind === "instance" && owned.length !== batch.count) ||
        (batch.kind === "mesh" && owned.length === 0))
      fail("surface.invalidContext", "Every rendered batch/instance must have complete semantic coverage.");
  }
  const resolved = new Map<string, BuildingResolvedSurfaceLayer>();
  for (const layer of composition.layers) {
    if (layer.channels.some(channel => !context.atlas.channels.includes(channel)) ||
        (layer.mask.kind === "channel" && !context.atlas.channels.includes(layer.mask.channel)))
      fail("surface.missingChannel", "A requested source or mask channel is unavailable.");
    const source = sources.get(layer.sourceId)!;
    const pinned = { atlasContentHash: source.atlasContentHash, slotId: source.slotId };
    const mask = layer.mask.kind === "constant" ? { ...layer.mask } : {
      kind: "channel" as const,
      source: {
        atlasContentHash: sources.get(layer.mask.sourceId)!.atlasContentHash,
        slotId: sources.get(layer.mask.sourceId)!.slotId
      }, channel: layer.mask.channel, component: layer.mask.component
    };
    resolved.set(layer.id, {
      id: layer.id, source: pinned, mask, blend: layer.blend, opacity: layer.opacity,
      physicalSizeM: { ...layer.physicalSizeM }, channels: [...layer.channels]
    });
    const target = layer.target;
    const matches = bindings.filter(binding => target.kind === "role" ? binding.role === target.role :
      target.kind === "slot" ? binding.baseSlot.slotId === target.slotId : binding.relativePath === target.relativePath);
    if (!matches.length) fail("surface.missingTarget", "Surface layer has no current semantic target: " + layer.id);
    if (target.kind === "element") {
      if (matches.length !== 1) fail("surface.ambiguousTarget", "Local target is ambiguous.");
      if (matches[0].coverage === "mesh-piece")
        fail("surface.unsupportedTarget", "Local mesh pieces require stable face ranges; only a whole single-owner mesh can bind locally.");
      if (matches[0].role !== target.expectedRole) fail("surface.roleMismatch", "Local target no longer has its expected material role.");
    }
    for (const binding of matches) if (target.kind !== "element") binding.layers.push(resolved.get(layer.id)!);
  }
  // Local layers follow all shared defaults, without reordering either category.
  for (const layer of composition.layers) {
    const target = layer.target;
    if (target.kind === "element")
      bindings.find(binding => binding.relativePath === target.relativePath)!.layers.push(resolved.get(layer.id)!);
  }
  // All consumed input has been owned and validated before the first await.
  const compositionHash = await hashCanonicalJson(composition);
  const payload = {
    schemaVersion: "0.1.0" as const, resolverVersion: "semantic-surface-bindings-v1" as const,
    documentId: composition.documentId, revision: composition.revision,
    geometryRef: context.geometryRef, compositionHash, bindings
  };
  const contentHash = await hashCanonicalJson(payload);
  return BuildingSurfaceBindingArtifactSchema.parse({ ...payload, contentHash });
}

