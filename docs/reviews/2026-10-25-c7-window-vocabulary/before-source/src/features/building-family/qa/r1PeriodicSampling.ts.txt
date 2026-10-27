import { z } from "zod";
import { AtlasManifestSchema } from "../contracts/atlasManifest";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { PeriodicMasonryRasterDescriptorSchema, PrimaryWallSamplingProfileSchema } from "../materials/periodicMasonryRaster";
import type { MaterialSourceArtifact, MaterialSourceRequest, PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { R1AcceptanceCardSchema, R1SamplingReportSchema } from "./r1BaselineContracts";
import { R1MasonryCoverageBaselineSchema, verifyR1MasonryCoverageDelta } from "./r1MasonryCoverage";
import { R1MasonryGeometryCheckpointSchema } from "./r1MasonryAppearance";

const sha = z.string().regex(/^[a-f\d]{64}$/);
const fileHash = z.object({ file: z.string().min(1), sha256: sha }).strict();
const finite = z.number().finite();
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
const fail = (message: string): never => { throw new Error("R1 periodic sampling: " + message); };
const PRIMARY = "source.wall.primary";
const MODEL = "primary-authored-wall-periodic-area-v2";
const V1 = "primary-authored-wall-mortar-area-v1";
const ALGORITHM = "procedural-v0.1-typed-rgba";
const GEOMETRY = "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e";
const channels = ["baseColor", "normal", "orm", "height", "opacity"] as const;
const layers = ["baseColor", "height", "roughness", "metalness", "opacity"] as const;
const hashes = R1MasonryCoverageBaselineSchema.shape.channelHashes;
const provenance = z.object({ providerId: z.literal("procedural"), seedPath: z.string().min(1),
  promptVocabulary: z.array(z.string()), algorithm: z.string().min(1) }).strict();
const origin = z.object({ sourceId: z.string().min(1), providerId: z.literal("procedural"),
  widthPx: z.literal(32), heightPx: z.literal(32), requestHash: sha, contentHash: sha, provenance }).strict();
const request = z.object({ sourceId: z.string().min(1),
  role: z.enum(["wall", "roof", "glass", "frame", "door", "horizontalTrim", "verticalTrim", "ornament"]),
  selectedFamily: z.string().min(1), periodicity: z.enum(["none", "x", "xy"]),
  physicalSizeM: z.object({ width: finite.positive(), height: finite.positive() }).strict(),
  seedPath: z.string().min(1), promptVocabulary: z.array(z.string()), metersPerTile: finite.positive().optional(),
  artKitMaterialRoleId: z.string().optional(), proceduralSource: z.string().optional(),
  widthPx: z.literal(32), heightPx: z.literal(32), samplingProfile: PrimaryWallSamplingProfileSchema.optional() }).strict();
const sourceLayerHashes = R1MasonryCoverageBaselineSchema.shape.sourceLayerHashes;
const cost = z.object({ irTriangles: z.literal(11868), renderedTriangles: z.literal(61508),
  geometryBytes: z.literal(3444336), instanceCount: z.literal(118) }).strict();
const immutable = z.object({ identity: R1AcceptanceCardSchema.shape.identity.omit({ atlasContentHash: true }),
  controls: R1AcceptanceCardSchema.shape.controls, resolvedSpec: R1AcceptanceCardSchema.shape.resolvedSpec,
  materialAnchors: R1AcceptanceCardSchema.shape.materialAnchors, freeze: R1AcceptanceCardSchema.shape.freeze,
  geometryHash: z.literal(GEOMETRY), cost }).strict();

/** Validate dimensions and canonical base64 length before a Node caller decodes any bytes. */
const layerDTO = z.object({ widthPx: z.number().int().positive().max(4096), heightPx: z.number().int().positive().max(4096),
  channels: z.literal("rgba8"), arrayType: z.literal("Uint8ClampedArray"),
  dataBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), sha256: sha
}).strict().superRefine((value, context) => {
  const padding = value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const last = alphabet.indexOf(value.dataBase64.at(-padding - 1) ?? "");
  if (value.dataBase64.length / 4 * 3 - padding !== value.widthPx * value.heightPx * 4 ||
      (padding === 2 && last % 16 !== 0) || (padding === 1 && last % 4 !== 0)) {
    context.addIssue({ code: "custom", message: "RGBA base64 byte length differs from declared dimensions." });
  }
});
const layerDTOs = z.object({ baseColor: layerDTO, height: layerDTO.optional(), roughness: layerDTO.optional(),
  metalness: layerDTO.optional(), opacity: layerDTO.optional() }).strict();
const channelDTOs = z.object({ baseColor: layerDTO, normal: layerDTO, orm: layerDTO, height: layerDTO, opacity: layerDTO }).strict();
const slotProvenance = z.object({ slotId: z.string().min(1), sourceId: z.string().min(1), providerId: z.string().min(1),
  requestHash: sha, contentHash: sha }).strict();
export const R1PeriodicSamplingByteCheckpointSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-s8-pre-edit-material-byte-checkpoint"),
  packetId: z.literal("2026-10-14-r1-s8"), createdAt: z.iso.datetime(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/), trackedPatch: fileHash, priorPacket: fileHash, priorSourceProof: fileHash,
  baselineCard: fileHash, baselineMaterial: fileHash, sourceFingerprints: z.array(fileHash).length(47),
  identity: R1AcceptanceCardSchema.shape.identity, geometryHash: z.literal(GEOMETRY),
  sources: z.array(origin.extend({ request, layers: layerDTOs }).strict()).length(12),
  packedAtlas: z.object({ metadata: z.object({ schemaVersion: z.literal("0.1.0"), atlasId: z.string().min(1),
    manifest: AtlasManifestSchema, slotProvenance: z.array(slotProvenance), contentHash: sha,
    diagnostics: z.array(z.json()) }).strict(), channels: channelDTOs }).strict(),
  sourceLayerHashes, channelHashes: hashes, channelDataHashes: hashes
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const ids = value.sources.map((source) => source.sourceId);
  if (new Set(ids).size !== 12 || !same(ids, [...ids].sort()) ||
      !same(ids, value.sourceLayerHashes.map((source) => source.sourceId))) issue("Checkpoint sources must preserve 12 unique sorted origins.");
  if (new Set(value.sourceFingerprints.map((record) => record.file)).size !== 47) issue("Checkpoint source fingerprints must be unique.");
  if (value.sources.reduce((count, source) => count + Object.keys(source.layers).length, 0) !== 36) issue("The actual pre-edit checkpoint must retain all 36 source layers.");
  for (const source of value.sources) {
    if (source.request.sourceId !== source.sourceId || source.request.samplingProfile !== undefined) issue("Pre-edit requests must remain the actual no-profile S6 requests.");
    for (const layer of Object.values(source.layers)) if (layer && (layer.widthPx !== 32 || layer.heightPx !== 32)) issue("Checkpoint source RGBA dimensions changed.");
    const row = value.sourceLayerHashes.find((item) => item.sourceId === source.sourceId);
    for (const name of layers) if ((source.layers[name]?.sha256 ?? null) !== row?.[name]) issue("Checkpoint layer keys/hashes differ from frozen per-source records.");
  }
  for (const name of channels) {
    const layer = value.packedAtlas.channels[name];
    if (layer.widthPx !== 128 || layer.heightPx !== 128 || layer.sha256 !== value.channelDataHashes[name]) issue("Checkpoint atlas raw bytes/dimensions do not match their frozen hashes.");
  }
  if (value.identity.atlasContentHash !== value.packedAtlas.metadata.contentHash ||
      value.identity.atlasId !== value.packedAtlas.metadata.atlasId) issue("Checkpoint atlas metadata differs from the actual frozen identity.");
});
export type R1PeriodicSamplingByteCheckpoint = z.infer<typeof R1PeriodicSamplingByteCheckpointSchema>;

const mean = (width: number, height: number) => z.object({ widthPx: z.literal(width), heightPx: z.literal(height),
  sampleCount: z.literal(width * height), coverageSum: finite, coverageMean: finite.min(0).max(1) }).strict();
export const R1PeriodicSamplingDeltaSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-primary-wall-periodic-sampling-delta"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(),
  baseline: z.object({ s6Card: fileHash, s6Sampling: fileHash, s6Material: fileHash, beforeCheckpoint: fileHash,
    s7Report: fileHash, s7SourceProof: fileHash }).strict(),
  immutable, profile: PrimaryWallSamplingProfileSchema, rasterDescriptor: PeriodicMasonryRasterDescriptorSchema,
  selectedSourceId: z.literal(PRIMARY), legacySeedHash: sha,
  beforeRequests: z.array(request).length(12), afterRequests: z.array(request).length(12), controlledOrigins: z.array(origin).length(12),
  before: R1MasonryCoverageBaselineSchema, after: R1MasonryCoverageBaselineSchema, legacyReplay: R1MasonryCoverageBaselineSchema,
  coverageFieldMeans: z.object({ source: mean(32, 32), packed: mean(27, 37) }).strict(), humanReview: z.literal("pending")
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const ids = value.beforeRequests.map((item) => item.sourceId);
  if (new Set(ids).size !== 12 || !same(ids, value.afterRequests.map((item) => item.sourceId)) ||
      !same(ids, value.controlledOrigins.map((item) => item.sourceId))) issue("Requests and inherited controlled origins must retain 12 unique ordered sources.");
  for (const state of [value.before, value.after, value.legacyReplay]) if (!same(ids, state.sourceHashes.map((item) => item.sourceId)) ||
      !same(ids, state.sourceLayerHashes.map((item) => item.sourceId))) issue("All byte baselines must preserve source order.");
  const eligible = value.afterRequests.filter((item) => item.role === "wall" && item.artKitMaterialRoleId === "brick" && item.proceduralSource === "running-bond-brick");
  if (eligible.length !== 1 || eligible[0]?.sourceId !== PRIMARY || value.afterRequests.filter((item) => item.samplingProfile !== undefined).length !== 1) issue("Exactly the primary authored wall may select the new profile among 12 requests.");
  for (let index = 0; index < 12; index += 1) {
    const oldRequest = value.beforeRequests[index], nextRequest = value.afterRequests[index];
    const { samplingProfile: _profile, ...legacyRequest } = nextRequest;
    void _profile;
    if (oldRequest.samplingProfile !== undefined || !same(oldRequest, legacyRequest)) issue("Only the primary optional sampling profile may change request metadata.");
    const old = value.before.sourceHashes[index], next = value.after.sourceHashes[index];
    const oldLayers = value.before.sourceLayerHashes[index], nextLayers = value.after.sourceLayerHashes[index];
    const control = value.controlledOrigins[index];
    if (control.provenance.algorithm !== ALGORITHM || control.provenance.seedPath !== oldRequest.seedPath ||
        !same(control.provenance.promptVocabulary, oldRequest.promptVocabulary)) issue("Checker origins must retain original unversioned metadata.");
    if (old.sourceId !== PRIMARY && (!same(old, next) || !same(oldLayers, nextLayers) || !same(old, {
      sourceId: control.sourceId, providerId: control.providerId, requestHash: control.requestHash, contentHash: control.contentHash }))) issue("All 11 nonselected source identities/provenance/layers must remain exact.");
    if (old.sourceId === PRIMARY) {
      if (!same(nextRequest.samplingProfile, value.profile) || old.requestHash === next.requestHash || old.contentHash === next.contentHash ||
          control.requestHash !== value.legacySeedHash || old.requestHash === value.legacySeedHash) issue("New selected identity must remain separate from both S6 actual bytes and the inherited legacy grain/checker origin.");
      if (oldLayers.baseColor === nextLayers.baseColor || oldLayers.height === nextLayers.height || oldLayers.provenanceHash === nextLayers.provenanceHash ||
          oldLayers.roughness !== nextLayers.roughness || oldLayers.metalness !== nextLayers.metalness || oldLayers.opacity !== nextLayers.opacity) issue("Only selected color/height and versioned provenance may change at source level.");
      if (value.rasterDescriptor.seedPath !== oldRequest.seedPath || value.rasterDescriptor.legacyStochasticHash !== value.legacySeedHash ||
          !same(value.rasterDescriptor.samplingProfile, value.profile)) issue("The descriptor must bind the unchanged legacy stochastic seed and declared profile.");
    }
  }
  if (!same(value.legacyReplay, value.before)) issue("No-profile replay must preserve the complete S6 byte/encoded-channel baseline.");
  if (value.before.atlasContentHash === value.after.atlasContentHash) issue("The new material baseline must have new content identity.");
  for (const name of ["orm", "opacity"] as const) if (value.before.channelHashes[name] !== value.after.channelHashes[name] ||
      value.before.channelDataHashes[name] !== value.after.channelDataHashes[name]) issue("Full atlas ORM and opacity must remain exact.");
  for (const name of ["baseColor", "height", "normal"] as const) if (value.before.channelDataHashes[name] === value.after.channelDataHashes[name]) issue("Selected color/height/derived-normal atlas bytes must change.");
  for (const field of Object.values(value.coverageFieldMeans)) if (Math.abs(field.coverageSum - field.sampleCount * 0.2002) > 1e-9 ||
      Math.abs(field.coverageMean - 0.2002) > 1e-12) issue("Independent half-open area coverage must close at 20.02% in both raster domains.");
});
export type R1PeriodicSamplingDelta = z.infer<typeof R1PeriodicSamplingDeltaSchema>;
/** Shape validation; a capture allowance additionally reconstructs every actual buffer through the proof loader. */
export function verifyR1PeriodicSamplingDelta(input: unknown): R1PeriodicSamplingDelta {
  return R1PeriodicSamplingDeltaSchema.parse(input);
}

export interface R1PeriodicSamplingFrame {
  requests: readonly MaterialSourceRequest[]; sources: readonly MaterialSourceArtifact[]; packedAtlas: PackedAtlas;
  geometryCheckpoint: unknown;
}
export interface R1PeriodicSamplingOracleRaster {
  baseColor: PixelLayer; height: PixelLayer; coverage: Float64Array; coverageSum: number; coverageMean: number;
}
export interface R1PeriodicSamplingBuildInput {
  packetId: string; createdAt: string; baseline: R1PeriodicSamplingDelta["baseline"];
  s6Card: unknown; s6Sampling: unknown; s6Material: unknown; beforeCheckpoint: unknown;
  before: R1PeriodicSamplingFrame; after: R1PeriodicSamplingFrame; legacyReplay: R1PeriodicSamplingFrame;
  oracle: { rasterize(width: number, height: number): R1PeriodicSamplingOracleRaster };
}
const bytesSame = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((byte, index) => byte === b[index]);
function checkLayer(layer: PixelLayer, width: number, height: number): void {
  if (layer.widthPx !== width || layer.heightPx !== height || layer.channels !== "rgba8" || !ArrayBuffer.isView(layer.data) ||
      Object.prototype.toString.call(layer.data) !== "[object Uint8ClampedArray]" || layer.data.byteLength !== width * height * 4 ||
      layer.data.length !== width * height * 4) fail("Invalid actual typed RGBA dimensions/storage.");
}
function joined(parts: ArrayLike<number>[]): Uint8Array {
  const value = new Uint8Array(parts.reduce((count, part) => count + part.length, 0));
  let offset = 0; for (const part of parts) { value.set(part, offset); offset += part.length; } return value;
}
async function contentHash(source: MaterialSourceArtifact): Promise<string> {
  const parts = Object.keys(source.layers).sort().flatMap((name) => {
    const layer = source.layers[name as typeof layers[number]];
    return layer ? [new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`), layer.data] : [];
  });
  return hashCanonicalJson({ providerId: source.providerId, requestHash: source.requestHash, layerBytes: Array.from(joined(parts)),
    ...(source.rasterDescriptor !== undefined ? { rasterDescriptor: PeriodicMasonryRasterDescriptorSchema.parse(source.rasterDescriptor) } : {}) });
}
async function summarize(frame: R1PeriodicSamplingFrame): Promise<z.infer<typeof R1MasonryCoverageBaselineSchema>> {
  const raw = {} as Record<typeof channels[number], string>, encoded = { ...raw };
  for (const name of channels) {
    const layer = frame.packedAtlas.channels[name]; checkLayer(layer, 128, 128);
    raw[name] = await sha256Hex(new Uint8Array(layer.data));
    encoded[name] = await sha256Hex(joined([new TextEncoder().encode(`${name}:128x128:`), layer.data]));
  }
  const sourceLayers = [];
  for (const source of frame.sources) {
    const row: Record<string, string | null> = { sourceId: source.sourceId, provenanceHash: await hashCanonicalJson(source.provenance) };
    for (const name of layers) row[name] = source.layers[name] ? await sha256Hex(new Uint8Array(source.layers[name]!.data)) : null;
    sourceLayers.push(row);
  }
  return R1MasonryCoverageBaselineSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-coverage-material-baseline",
    atlasContentHash: frame.packedAtlas.contentHash,
    sourceHashes: frame.sources.map(({ sourceId, providerId, requestHash, contentHash: hash }) => ({ sourceId, providerId, requestHash, contentHash: hash })),
    sourceLayerHashes: sourceLayers, channelHashes: encoded, channelDataHashes: raw });
}
function bytesInROI(layer: PixelLayer, x: number, y: number, width: number, height: number): PixelLayer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) data.set(layer.data.subarray(((row + y) * layer.widthPx + x) * 4,
    ((row + y) * layer.widthPx + x + width) * 4), row * width * 4);
  return { widthPx: width, heightPx: height, channels: "rgba8", data };
}

/** Pure byte proof. The Node caller separately pins files, decodes DTO hashes, and binds the independent oracle implementation. */
export async function buildR1PeriodicSamplingDelta(input: R1PeriodicSamplingBuildInput): Promise<R1PeriodicSamplingDelta> {
  const card = R1AcceptanceCardSchema.parse(input.s6Card), sampling = R1SamplingReportSchema.parse(input.s6Sampling);
  if (!same(card.controls, sampling.controls) || card.pageErrors.length || sampling.pageErrors.length) fail("Frozen building/sampling controls or error evidence changed.");
  const s6 = verifyR1MasonryCoverageDelta(input.s6Material), checkpoint = R1PeriodicSamplingByteCheckpointSchema.parse(input.beforeCheckpoint);
  for (const key of ["controls", "resolvedSpec", "materialAnchors", "freeze"] as const) if (!same(card[key], s6.immutable[key])) fail("Frozen S6 controls/spec/anchors/cameras changed.");
  if (!same(checkpoint.baselineCard, input.baseline.s6Card) || !same(checkpoint.baselineMaterial, input.baseline.s6Material) ||
      !same(checkpoint.priorPacket, input.baseline.s7Report) || !same(checkpoint.priorSourceProof, input.baseline.s7SourceProof) ||
      !same(checkpoint.identity, card.identity) || checkpoint.sourceCommit !== card.source.commit || !same(checkpoint.identity, {
        ...s6.immutable.identity, atlasContentHash: s6.after.atlasContentHash })) fail("Pre-edit checkpoint must bind accepted S6/S7 identities and source authority.");
  const beforeRequests = z.array(request).length(12).parse(input.before.requests), afterRequests = z.array(request).length(12).parse(input.after.requests);
  if (!same(beforeRequests, checkpoint.sources.map((source) => source.request)) || !same(beforeRequests, input.legacyReplay.requests) ||
      !same(beforeRequests, s6.sourceRequests)) fail("Actual old requests/no-profile replay changed.");
  const primaryIndex = beforeRequests.findIndex((item) => item.sourceId === PRIMARY);
  if (primaryIndex < 0) fail("Primary request missing.");
  const primaryRequest = beforeRequests[primaryIndex];
  if (primaryRequest.periodicity !== "xy" || primaryRequest.metersPerTile !== 0.96 || !same(primaryRequest.physicalSizeM, { width: 0.96, height: 0.96 })) fail("Physical tile anchor changed.");
  const frames = [input.before, input.after, input.legacyReplay];
  for (let left = 0; left < 3; left += 1) for (let right = left + 1; right < 3; right += 1) {
    if (frames[left].packedAtlas === frames[right].packedAtlas) fail("Actual material frames may not reuse atlas objects.");
    for (let index = 0; index < 12; index += 1) {
      if (frames[left].sources[index] === frames[right].sources[index]) fail("Actual material frames may not reuse source artifacts.");
      for (const name of layers) {
        const a = frames[left].sources[index]?.layers[name], b = frames[right].sources[index]?.layers[name];
        if (a && b && a.data.buffer === b.data.buffer) fail("Actual material frames may not reuse source buffers.");
      }
    }
    for (const name of channels) if (frames[left].packedAtlas.channels[name].data.buffer === frames[right].packedAtlas.channels[name].data.buffer) fail("Actual material frames may not reuse atlas channel buffers.");
  }
  const retained = frames.flatMap((frame) => [...frame.sources.flatMap((source) => Object.values(source.layers)), ...Object.values(frame.packedAtlas.channels)]
    .filter((layer): layer is PixelLayer => Boolean(layer)).map((layer) => ({ layer, data: layer.data, bytes: layer.data.slice() })));
  const metadata = frames.map((frame) => canonicalJson({ requests: frame.requests, sources: frame.sources.map(({ layers: _layers, ...rest }) => { void _layers; return rest; }),
    atlas: { ...frame.packedAtlas, channels: undefined }, geometryCheckpoint: frame.geometryCheckpoint }));
  const summaries = [];
  for (const frame of frames) {
    const requests = frame === input.after ? afterRequests : beforeRequests;
    if (frame.sources.length !== 12 || !same(requests.map((item) => item.sourceId), frame.sources.map((item) => item.sourceId)) ||
        new Set(frame.sources.map((item) => item.sourceId)).size !== 12) fail("Actual source order/count changed.");
    if (!same(frame.packedAtlas.manifest, card.materialAnchors.atlasManifest) || frame.packedAtlas.atlasId !== card.identity.atlasId ||
        frame.packedAtlas.diagnostics.some((item) => item.severity === "error")) fail("Manifest, atlas identity or packing diagnostics changed.");
    for (let index = 0; index < 12; index += 1) {
      const source = frame.sources[index], sourceRequest = requests[index];
      const { layers: _layers, rasterDescriptor, ...sourceOrigin } = source; void _layers; origin.parse(sourceOrigin);
      if (Object.keys(source.layers).some((name) => !layers.includes(name as typeof layers[number]))) fail("Unknown actual source layer.");
      for (const layer of Object.values(source.layers)) if (layer) checkLayer(layer, 32, 32);
      const { samplingProfile: _profile, ...legacyRequest } = sourceRequest; void _profile;
      const stochasticHash = await hashCanonicalJson({ providerId: "procedural", request: legacyRequest });
      const selected = source.sourceId === PRIMARY, selectedAfter = selected && frame === input.after;
      const expectedHash = selected ? await hashCanonicalJson({ providerId: "procedural", request: sourceRequest,
        coverageProfile: selectedAfter ? MODEL : V1 }) : stochasticHash;
      if (source.requestHash !== expectedHash || source.contentHash !== await contentHash(source)) fail("Request/content hash does not bind actual profile/descriptor/pixels.");
      if (!same(source.provenance, { providerId: "procedural", seedPath: sourceRequest.seedPath, promptVocabulary: sourceRequest.promptVocabulary,
        algorithm: selected ? ALGORITHM + "/" + (selectedAfter ? MODEL : V1) : ALGORITHM })) fail("Source provenance changed beyond the selected profile.");
      if (selectedAfter) {
        const descriptor = PeriodicMasonryRasterDescriptorSchema.parse(rasterDescriptor);
        if (descriptor.legacyStochasticHash !== s6.legacySeedHash || descriptor.seedPath !== sourceRequest.seedPath ||
            !same(descriptor.samplingProfile, sourceRequest.samplingProfile)) fail("Selected descriptor reseeded the legacy grain or changed model.");
      } else if (rasterDescriptor !== undefined || sourceRequest.samplingProfile !== undefined) fail("No-profile/other-source descriptor changed.");
    }
    const repacked = await packAtlas({ manifest: frame.packedAtlas.manifest, materialSources: [...requests], diagnostics: [],
      profileRecipeIds: frame.packedAtlas.manifest.slots.flatMap((slot) => slot.profileRecipeId ? [slot.profileRecipeId] : []) }, [...frame.sources]);
    if (!same({ ...repacked, channels: undefined }, { ...frame.packedAtlas, channels: undefined })) fail("Packed metadata/content/provenance differs from fresh packing.");
    for (const name of channels) if (!bytesSame(repacked.channels[name].data, frame.packedAtlas.channels[name].data)) fail("Actual atlas bytes differ from fresh packing.");
    summaries.push(await summarize(frame));
  }
  const [before, after, legacyReplay] = summaries;
  if (!same(before, s6.after) || !same(before, legacyReplay) || !same(before.sourceLayerHashes, checkpoint.sourceLayerHashes) ||
      !same(before.channelHashes, checkpoint.channelHashes) || !same(before.channelDataHashes, checkpoint.channelDataHashes)) fail("Actual before/no-profile replay does not match every accepted S6 layer/channel hash.");
  for (const capture of sampling.captures.filter((row) => row.sourceName === "procedural")) if (
      !same(capture.snapshot.sourceHashes, before.sourceHashes) || !same(capture.snapshot.channelHashes, before.channelHashes) ||
      capture.snapshot.atlasContentHash !== before.atlasContentHash) fail("Frozen S6 sampling identities differ from before bytes.");
  const geometry = frames.map((frame) => R1MasonryGeometryCheckpointSchema.parse(frame.geometryCheckpoint));
  const pick = (value: typeof geometry[number]) => ({ geometryHash: value.geometryHash, sourceGraphHash: value.sourceGraphHash,
    irTriangles: value.irTriangles, renderedTriangles: value.renderedTriangles, geometryBytes: value.geometryBytes, instanceCount: value.instanceCount });
  for (let index = 0; index < 3; index += 1) if (!same(pick(geometry[index]), { geometryHash: s6.immutable.geometryHash,
    sourceGraphHash: card.identity.sourceGraphHash, ...s6.immutable.cost }) || !same(geometry[index].baseline, input.baseline.s6Card) ||
      geometry[index].atlasContentHash !== summaries[index].atlasContentHash || !same(geometry[index].atlasChannelDataHashes, summaries[index].channelDataHashes)) fail("Actual geometry/card/atlas checkpoint changed.");
  for (let index = 0; index < 12; index += 1) for (const name of layers) {
    if (index === primaryIndex && (name === "baseColor" || name === "height")) continue;
    const old = input.before.sources[index].layers[name], next = input.after.sources[index].layers[name];
    if (Boolean(old) !== Boolean(next) || (old && next && !bytesSame(old.data, next.data))) fail("Unaffected actual source bytes changed.");
  }
  const atlas = input.before.packedAtlas.manifest;
  const slot = atlas.slots.find((item) => item.materialSourceId === PRIMARY);
  if (!slot) return fail("Canonical selected atlas ROI/padding changed.");
  if (!same(slot.rectPx, { x: 4, y: 4, width: 27, height: 37 }) || atlas.widthPx !== 128 || atlas.heightPx !== 128 || atlas.paddingPx !== 4) fail("Canonical selected atlas ROI/padding changed.");
  const inPadded = (x: number, y: number, rect: typeof slot.rectPx) => x >= rect.x - atlas.paddingPx && x < rect.x + rect.width + atlas.paddingPx &&
    y >= rect.y - atlas.paddingPx && y < rect.y + rect.height + atlas.paddingPx;
  for (const name of channels) for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
    if (name === "orm" || name === "opacity" || !inPadded(x, y, slot.rectPx) ||
        atlas.slots.some((other) => other.materialSourceId !== PRIMARY && inPadded(x, y, other.rectPx))) {
      const offset = (y * 128 + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) if (input.before.packedAtlas.channels[name].data[offset + channel] !==
          input.after.packedAtlas.channels[name].data[offset + channel]) fail("Atlas bytes outside exclusive selected ROI/padding changed.");
    }
  }
  const sourceOracle = input.oracle.rasterize(32, 32), packedOracle = input.oracle.rasterize(27, 37);
  for (const [expected, actual, width, height] of [[sourceOracle, input.after.sources[primaryIndex].layers, 32, 32],
    [packedOracle, { baseColor: bytesInROI(input.after.packedAtlas.channels.baseColor, 4, 4, 27, 37),
      height: bytesInROI(input.after.packedAtlas.channels.height, 4, 4, 27, 37) }, 27, 37]] as const) {
    checkLayer(expected.baseColor, width, height); checkLayer(expected.height, width, height);
    if (!actual.height || !bytesSame(expected.baseColor.data, actual.baseColor.data) || !bytesSame(expected.height.data, actual.height.data)) fail("Selected source/ROI color and height differ from the independent periodic pixel-area oracle.");
    if (Object.prototype.toString.call(expected.coverage) !== "[object Float64Array]" || expected.coverage.length !== width * height ||
        [...expected.coverage].some((area) => !Number.isFinite(area) || area < 0 || area > 1) ||
        Math.abs(expected.coverage.reduce((sum, area) => sum + area, 0) - expected.coverageSum) > 1e-9 ||
        Math.abs(expected.coverageSum / (width * height) - expected.coverageMean) > 1e-12) fail("Independent coverage field arithmetic/storage is invalid.");
  }
  if (retained.some(({ layer, data, bytes }) => layer.data !== data || !bytesSame(data, bytes)) || frames.some((frame, index) =>
      canonicalJson({ requests: frame.requests, sources: frame.sources.map(({ layers: _layers, ...rest }) => { void _layers; return rest; }),
        atlas: { ...frame.packedAtlas, channels: undefined }, geometryCheckpoint: frame.geometryCheckpoint }) !== metadata[index])) fail("Proof mutated caller-owned source/atlas metadata or byte buffers.");
  const { atlasContentHash: _atlas, ...identity } = card.identity; void _atlas;
  const field = (oracle: R1PeriodicSamplingOracleRaster) => ({ widthPx: oracle.baseColor.widthPx, heightPx: oracle.baseColor.heightPx,
    sampleCount: oracle.coverage.length, coverageSum: oracle.coverageSum, coverageMean: oracle.coverageMean });
  const selected = input.after.sources[primaryIndex];
  return verifyR1PeriodicSamplingDelta({ schemaVersion: "0.1.0", packetKind: "buildo-r1-primary-wall-periodic-sampling-delta",
    packetId: input.packetId, createdAt: input.createdAt, baseline: input.baseline,
    immutable: { identity, controls: card.controls, resolvedSpec: card.resolvedSpec, materialAnchors: card.materialAnchors,
      freeze: card.freeze, geometryHash: checkpoint.geometryHash, cost: s6.immutable.cost },
    profile: afterRequests[primaryIndex].samplingProfile, rasterDescriptor: selected.rasterDescriptor, selectedSourceId: PRIMARY,
    legacySeedHash: s6.legacySeedHash, beforeRequests, afterRequests, controlledOrigins: s6.controlledOrigins, before, after, legacyReplay,
    coverageFieldMeans: { source: field(sourceOracle), packed: field(packedOracle) }, humanReview: "pending" });
}
