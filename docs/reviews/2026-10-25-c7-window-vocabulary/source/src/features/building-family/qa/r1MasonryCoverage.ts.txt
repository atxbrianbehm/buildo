import { z } from "zod";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import { createSeedTree } from "../core/seedTree";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import type { MaterialSourceArtifact, MaterialSourceRequest, PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { R1AcceptanceCardSchema, R1SamplingReportSchema } from "./r1BaselineContracts";
import { R1MasonryGeometryCheckpointSchema, verifyR1MasonryAppearance } from "./r1MasonryAppearance";

const sha = z.string().regex(/^[a-f\d]{64}$/);
const fileHash = z.object({ file: z.string().min(1), sha256: sha }).strict();
const finite = z.number().finite();
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
const fail = (message: string): never => { throw new Error("R1 masonry coverage: " + message); };
const PROFILE = "primary-authored-wall-mortar-area-v1";
const LEGACY_ALGORITHM = "procedural-v0.1-typed-rgba";
const PRIMARY = "source.wall.primary";
const channelNames = ["baseColor", "normal", "orm", "height", "opacity"] as const;
const layerNames = ["baseColor", "height", "roughness", "metalness", "opacity"] as const;
const channelHashes = z.object({ baseColor: sha, normal: sha, orm: sha, height: sha, opacity: sha }).strict();
const provenance = z.object({ providerId: z.literal("procedural"), seedPath: z.string().min(1),
  promptVocabulary: z.array(z.string()), algorithm: z.string().min(1) }).strict();
const origin = z.object({ sourceId: z.string().min(1), providerId: z.literal("procedural"),
  widthPx: z.number().int().positive(), heightPx: z.number().int().positive(),
  requestHash: sha, contentHash: sha, provenance }).strict();
const sourceHash = origin.pick({ sourceId: true, providerId: true, requestHash: true, contentHash: true });
const layerHashes = z.object({ sourceId: z.string().min(1), baseColor: sha,
  height: sha.nullable(), roughness: sha.nullable(), metalness: sha.nullable(), opacity: sha.nullable(),
  provenanceHash: sha }).strict();
const request = z.object({
  sourceId: z.string().min(1), role: z.enum(["wall", "roof", "glass", "frame", "door", "horizontalTrim", "verticalTrim", "ornament"]),
  selectedFamily: z.string().min(1), periodicity: z.enum(["none", "x", "xy"]),
  physicalSizeM: z.object({ width: finite.positive(), height: finite.positive() }).strict(),
  seedPath: z.string().min(1), promptVocabulary: z.array(z.string()),
  metersPerTile: finite.positive().optional(), artKitMaterialRoleId: z.string().optional(),
  proceduralSource: z.string().optional(), widthPx: z.number().int().positive(), heightPx: z.number().int().positive()
}).strict();
const cost = z.object({ irTriangles: z.literal(11868), renderedTriangles: z.literal(61508),
  geometryBytes: z.literal(3444336), instanceCount: z.literal(118) }).strict();
const immutable = z.object({
  identity: R1AcceptanceCardSchema.shape.identity.omit({ atlasContentHash: true }),
  controls: R1AcceptanceCardSchema.shape.controls, resolvedSpec: R1AcceptanceCardSchema.shape.resolvedSpec,
  materialAnchors: R1AcceptanceCardSchema.shape.materialAnchors, freeze: R1AcceptanceCardSchema.shape.freeze,
  geometryHash: sha, cost
}).strict();
const producerCheckpoint = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-primary-wall-producer-source-checkpoint"),
  createdAt: z.iso.datetime(), baseline: fileHash,
  source: z.object({ commit: z.string().regex(/^[a-f\d]{40}$/), trackedDiffSha256: sha }).strict(),
  producer: z.object({
    file: z.literal("src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
    sha256: z.literal("51cc87c0f78f2d9cc77d0ffb734288fc248195955dde4f2547cd4dfb9361d620"),
    byteLength: z.literal(13391), snapshot: fileHash
  }).strict(), scope: z.string().min(1)
}).strict();

export const R1MasonryCoverageBaselineSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-masonry-coverage-material-baseline"),
  atlasContentHash: sha, sourceHashes: z.array(sourceHash).length(12),
  sourceLayerHashes: z.array(layerHashes).length(12), channelHashes, channelDataHashes: channelHashes
}).strict();
const means = z.object({
  source: z.object({ widthPx: z.literal(32), heightPx: z.literal(32), sampleCount: z.literal(1024),
    legacyBinary: finite.min(0).max(1), subpixel: finite.min(0).max(1) }).strict(),
  packed: z.object({ widthPx: z.literal(27), heightPx: z.literal(37), sampleCount: z.literal(999),
    legacyBinary: finite.min(0).max(1), subpixel: finite.min(0).max(1) }).strict()
}).strict();
export const R1MasonryCoverageDeltaSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-primary-wall-material-delta"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(),
  baseline: z.object({ s4Card: fileHash, s4Sampling: fileHash, s5Report: fileHash,
    producerCheckpoint: fileHash, producerSnapshot: fileHash }).strict(),
  producerBefore: producerCheckpoint.shape.producer,
  immutable, profile: z.literal(PROFILE), selectedSourceId: z.literal(PRIMARY), legacySeedHash: sha,
  sourceRequests: z.array(request).length(12), controlledOrigins: z.array(origin).length(12),
  before: R1MasonryCoverageBaselineSchema, after: R1MasonryCoverageBaselineSchema,
  coverageFieldMeans: means, humanReview: z.literal("pending")
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const ids = value.sourceRequests.map((item) => item.sourceId);
  const eligible = value.sourceRequests.filter((item) => item.role === "wall" &&
    item.artKitMaterialRoleId === "brick" && item.proceduralSource === "running-bond-brick");
  if (new Set(ids).size !== 12 || eligible.length !== 1 || eligible[0]?.sourceId !== PRIMARY) issue("Exactly the primary authored wall/brick source must be eligible among 12 unique requests.");
  if (!same(ids, value.controlledOrigins.map((item) => item.sourceId))) issue("Controlled origins must retain exact original source order.");
  for (const state of [value.before, value.after]) {
    if (!same(ids, state.sourceHashes.map((item) => item.sourceId)) ||
        !same(ids, state.sourceLayerHashes.map((item) => item.sourceId))) issue("All material baseline rows must retain source order.");
  }
  for (let index = 0; index < 12; index += 1) {
    const old = value.before.sourceHashes[index];
    const next = value.after.sourceHashes[index];
    const oldLayers = value.before.sourceLayerHashes[index];
    const nextLayers = value.after.sourceLayerHashes[index];
    const sourceOrigin = value.controlledOrigins[index];
    const sourceRequest = value.sourceRequests[index];
    if (sourceOrigin.widthPx !== sourceRequest.widthPx || sourceOrigin.heightPx !== sourceRequest.heightPx ||
        sourceOrigin.provenance.algorithm !== LEGACY_ALGORITHM || sourceOrigin.provenance.seedPath !== sourceRequest.seedPath ||
        !same(sourceOrigin.provenance.promptVocabulary, sourceRequest.promptVocabulary)) {
      issue("Controlled origins must preserve original dimensions, seed path, vocabulary and unversioned provenance.");
    }
    if (!same(old, { sourceId: sourceOrigin.sourceId, providerId: sourceOrigin.providerId,
      requestHash: sourceOrigin.requestHash, contentHash: sourceOrigin.contentHash })) issue("Controlled source origins must use old request/content identity.");
    if (old.sourceId !== PRIMARY && (!same(old, next) || !same(oldLayers, nextLayers))) issue("Every nonselected source identity, provenance and layer hash must remain exact.");
    if (old.sourceId === PRIMARY) {
      if (value.legacySeedHash !== old.requestHash || next.requestHash === old.requestHash || next.contentHash === old.contentHash) issue("Selected artifact identity must version independently of its unchanged legacy seed.");
      if (oldLayers.baseColor === nextLayers.baseColor || oldLayers.height === nextLayers.height ||
          oldLayers.provenanceHash === nextLayers.provenanceHash || oldLayers.roughness !== nextLayers.roughness ||
          oldLayers.metalness !== nextLayers.metalness || oldLayers.opacity !== nextLayers.opacity) issue("Only selected color/height and versioned provenance may change at source level.");
    }
  }
  for (const channel of ["orm", "opacity"] as const) {
    if (value.before.channelHashes[channel] !== value.after.channelHashes[channel] ||
        value.before.channelDataHashes[channel] !== value.after.channelDataHashes[channel]) issue("Full atlas ORM and opacity bytes must stay exact.");
  }
  for (const channel of ["baseColor", "height", "normal"] as const) {
    if (value.before.channelDataHashes[channel] === value.after.channelDataHashes[channel]) issue("Selected color/height and derived normal must produce new atlas bytes.");
  }
  if (value.before.atlasContentHash === value.after.atlasContentHash ||
      !same(value.baseline.producerSnapshot, value.producerBefore.snapshot) ||
      value.producerBefore.sha256 !== value.producerBefore.snapshot.sha256) issue("New material baseline and exact pre-edit producer snapshot are required.");
  const expected = [0.4921875, 0.22432265625, 503 / 999, 0.22732132132132132];
  const measured = [value.coverageFieldMeans.source.legacyBinary, value.coverageFieldMeans.source.subpixel,
    value.coverageFieldMeans.packed.legacyBinary, value.coverageFieldMeans.packed.subpixel];
  if (measured.some((item, index) => Math.abs(item - expected[index]) > 1e-12)) issue("Independently reconstructed canonical coverage means must match the frozen source/nearest-pack model.");
});
export type R1MasonryCoverageDelta = z.infer<typeof R1MasonryCoverageDeltaSchema>;

/** Serialized evidence validation only; actual byte proof is performed by the builder. */
export function verifyR1MasonryCoverageDelta(input: unknown): R1MasonryCoverageDelta {
  return R1MasonryCoverageDeltaSchema.parse(input);
}

/** Independent geometric oracle: clip disjoint mortar rectangles to the unit pixel box. */
export function referenceBrickMortarCoveragePx(x: number, y: number, brickWidth: number, brickHeight: number): number {
  if (![x, y, brickWidth, brickHeight].every(Number.isFinite) || brickWidth <= 0 || brickHeight <= 0) fail("Invalid coverage box.");
  const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
  const thickness = brickHeight * 0.14;
  let area = 0;
  for (let row = Math.floor(y / brickHeight); row <= Math.floor((y + 1) / brickHeight); row += 1) {
    // Translate first: adding a thin strip to a large global coordinate and
    // subtracting that coordinate again can move a 0.5 height-byte rounding tie.
    const rowStart = row * brickHeight - y;
    const rowHeight = overlap(0, 1, rowStart, rowStart + brickHeight);
    const bedHeight = overlap(0, 1, rowStart, rowStart + thickness);
    const shift = row % 2 === 0 ? 0 : brickWidth / 2;
    let jointWidth = 0;
    for (let column = Math.floor((x + shift) / brickWidth); column <= Math.floor((x + 1 + shift) / brickWidth); column += 1) {
      const jointStart = column * brickWidth - shift - x;
      jointWidth += overlap(0, 1, jointStart, jointStart + thickness);
    }
    area += bedHeight + (rowHeight - bedHeight) * jointWidth;
  }
  return Math.max(0, Math.min(1, area));
}

interface CoverageFrame {
  requests: readonly MaterialSourceRequest[];
  sources: readonly MaterialSourceArtifact[];
  packedAtlas: PackedAtlas;
  geometryCheckpoint: unknown;
  debugExport?: unknown;
}
export interface R1MasonryCoverageBuildInput {
  packetId: string;
  createdAt: string;
  baseline: R1MasonryCoverageDelta["baseline"];
  s4Card: unknown;
  s4Sampling: unknown;
  s5Report: unknown;
  producerCheckpoint: unknown;
  before: CoverageFrame;
  after: CoverageFrame;
}
const bytesSame = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);
function checkLayer(layer: PixelLayer, width: number, height: number): void {
  if (layer.widthPx !== width || layer.heightPx !== height || layer.channels !== "rgba8" ||
      !ArrayBuffer.isView(layer.data) || Object.prototype.toString.call(layer.data) !== "[object Uint8ClampedArray]" ||
      layer.data.length !== width * height * 4 || layer.data.byteLength !== width * height * 4) fail("Invalid actual RGBA dimensions or storage.");
}
function concatBytes(parts: ArrayLike<number>[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
async function encodedHash(name: string, layer: PixelLayer): Promise<string> {
  return sha256Hex(concatBytes([new TextEncoder().encode(name + ":" + layer.widthPx + "x" + layer.heightPx + ":"), layer.data]));
}
async function artifactContentHash(artifact: MaterialSourceArtifact): Promise<string> {
  const parts = Object.keys(artifact.layers).sort().flatMap((name) => {
    const layer = artifact.layers[name as keyof MaterialSourceArtifact["layers"]];
    return layer ? [new TextEncoder().encode(name + ":" + layer.widthPx + "x" + layer.heightPx + ":"), layer.data] : [];
  });
  return hashCanonicalJson({ providerId: artifact.providerId, requestHash: artifact.requestHash, layerBytes: Array.from(concatBytes(parts)) });
}
async function summarize(frame: CoverageFrame): Promise<z.infer<typeof R1MasonryCoverageBaselineSchema>> {
  const raw = {} as Record<typeof channelNames[number], string>;
  const encoded = {} as Record<typeof channelNames[number], string>;
  for (const name of channelNames) {
    const layer = frame.packedAtlas.channels[name];
    checkLayer(layer, frame.packedAtlas.manifest.widthPx, frame.packedAtlas.manifest.heightPx);
    raw[name] = await sha256Hex(new Uint8Array(layer.data));
    encoded[name] = await encodedHash(name, layer);
  }
  const hashes = [];
  for (const artifact of frame.sources) {
    const values: Record<string, string | null> = { sourceId: artifact.sourceId, provenanceHash: await hashCanonicalJson(artifact.provenance) };
    for (const name of layerNames) values[name] = artifact.layers[name] ? await sha256Hex(new Uint8Array(artifact.layers[name]!.data)) : null;
    hashes.push(values);
  }
  return R1MasonryCoverageBaselineSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-coverage-material-baseline",
    atlasContentHash: frame.packedAtlas.contentHash,
    sourceHashes: frame.sources.map((item) => ({ sourceId: item.sourceId, providerId: item.providerId, requestHash: item.requestHash, contentHash: item.contentHash })),
    sourceLayerHashes: hashes, channelHashes: encoded, channelDataHashes: raw
  });
}
function linear(byte: number): number { const value = byte / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }
function encoded(value: number): number { return Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)); }
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
function checkSelectedPixels(source: MaterialSourceArtifact, sourceRequest: MaterialSourceRequest, legacyHash: string): number[] {
  const seed = createSeedTree(sourceRequest.seedPath + "/" + legacyHash);
  const coverage: number[] = [];
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    const sx = x % 31, sy = y % 31;
    const fraction = referenceBrickMortarCoveragePx(sx, sy, 6, 3);
    coverage.push(fraction);
    const grain = seed.float01("brick-grain/" + sx + "/" + sy) * 22 - 8;
    const brick = [byte(132 + grain), byte(45 + grain * 0.3), byte(32 + grain * 0.2)];
    const mortar = [byte(176 + grain), byte(163 + grain), byte(145 + grain)];
    const rgba = brick.map((value, index) => encoded(linear(value) * (1 - fraction) + linear(mortar[index]) * fraction));
    rgba.push(255);
    const h = byte(byte(154 + seed.float01("brick-height/" + sx + "/" + sy) * 28) * (1 - fraction) + 82 * fraction);
    const offset = (y * 32 + x) * 4;
    if (rgba.some((value, index) => source.layers.baseColor.data[offset + index] !== value) ||
        [h, h, h, 255].some((value, index) => source.layers.height?.data[offset + index] !== value)) {
      fail("Selected color/height must use the same exact area coverage, frozen palette and legacy noise at (" + x + "," + y +
        "), area=" + fraction.toPrecision(17) + ", expectedColor=" + rgba.join(",") +
        ", actualColor=" + Array.from(source.layers.baseColor.data.slice(offset, offset + 4)).join(",") +
        ", expectedHeight=" + h + ", actualHeight=" + source.layers.height?.data[offset] +
        ", brickHeightByte=" + byte(154 + seed.float01("brick-height/" + sx + "/" + sy) * 28));
    }
  }
  return coverage;
}

/** Pure actual-buffer proof; filesystem hashes and checkpoint bytes are independently verified by callers. */
export async function buildR1MasonryCoverageDelta(input: R1MasonryCoverageBuildInput): Promise<R1MasonryCoverageDelta> {
  const card = R1AcceptanceCardSchema.parse(input.s4Card);
  const s5 = verifyR1MasonryAppearance(input.s5Report, card, input.baseline.s4Card.sha256,
    { report: input.s4Sampling, sha256: input.baseline.s4Sampling.sha256 });
  const checkpoint = producerCheckpoint.parse(input.producerCheckpoint);
  if (!same(checkpoint.baseline, input.baseline.s5Report) ||
      !same(checkpoint.producer.snapshot, input.baseline.producerSnapshot) ||
      checkpoint.source.commit !== s5.source.commit || checkpoint.source.trackedDiffSha256 !== s5.source.trackedDiffSha256) fail("Producer freeze must bind accepted S5 source/patch and exact snapshot.");
  const beforeRequests = z.array(request).length(12).parse(input.before.requests);
  if (!same(input.before.requests, input.after.requests)) fail("Any source request metadata change is outside this repair.");
  const primaryIndex = beforeRequests.findIndex((item) => item.sourceId === PRIMARY);
  if (primaryIndex < 0) fail("Primary request missing.");
  const primaryRequest = beforeRequests[primaryIndex];
  if (primaryRequest.widthPx !== 32 || primaryRequest.heightPx !== 32 ||
      primaryRequest.periodicity !== "xy" || primaryRequest.metersPerTile !== 0.96 ||
      !same(primaryRequest.physicalSizeM, { width: 0.96, height: 0.96 })) fail("Canonical source dimensions/anchor/periodicity changed.");
  for (const frame of [input.before, input.after]) {
    if (frame.sources.length !== 12 || !same(frame.requests.map((item) => item.sourceId), frame.sources.map((item) => item.sourceId))) fail("Actual source order/count changed.");
    if (!same(frame.packedAtlas.manifest, card.materialAnchors.atlasManifest) ||
        frame.packedAtlas.atlasId !== card.identity.atlasId) fail("Atlas manifest, slot packing or atlas ID changed.");
    for (let index = 0; index < 12; index += 1) {
      const source = frame.sources[index], sourceRequest = beforeRequests[index];
      const { layers: _layers, ...sourceOrigin } = source;
      void _layers;
      origin.parse(sourceOrigin);
      if (Object.keys(source.layers).some((name) => !layerNames.includes(name as typeof layerNames[number]))) fail("Unknown source layer outside the repair.");
      if (source.widthPx !== sourceRequest.widthPx || source.heightPx !== sourceRequest.heightPx) fail("Source dimensions changed.");
      for (const name of layerNames) if (source.layers[name]) checkLayer(source.layers[name]!, source.widthPx, source.heightPx);
      const legacyHash = await hashCanonicalJson({ providerId: "procedural", request: sourceRequest });
      const selectedAfter = frame === input.after && source.sourceId === PRIMARY;
      const expectedHash = selectedAfter ? await hashCanonicalJson({ providerId: "procedural", request: sourceRequest, coverageProfile: PROFILE }) : legacyHash;
      if (source.requestHash !== expectedHash || source.contentHash !== await artifactContentHash(source)) fail("Actual request/content identity does not match emitted bytes and selected profile.");
      const expectedProvenance = { providerId: "procedural", seedPath: sourceRequest.seedPath,
        promptVocabulary: sourceRequest.promptVocabulary, algorithm: selectedAfter ? LEGACY_ALGORITHM + "/" + PROFILE : LEGACY_ALGORITHM };
      if (!same(source.provenance, expectedProvenance)) fail("Provenance changed beyond the selected versioned algorithm.");
    }
    const plan = { manifest: frame.packedAtlas.manifest, materialSources: [...frame.requests],
      profileRecipeIds: frame.packedAtlas.manifest.slots.flatMap((slot) => slot.profileRecipeId ? [slot.profileRecipeId] : []), diagnostics: [] };
    const repacked = await packAtlas(plan, [...frame.sources]);
    if (repacked.contentHash !== frame.packedAtlas.contentHash ||
        !same(repacked.slotProvenance, frame.packedAtlas.slotProvenance)) fail("Packed content/provenance does not match actual sources.");
    for (const name of channelNames) if (!bytesSame(repacked.channels[name].data, frame.packedAtlas.channels[name].data)) fail("Packed channel bytes do not match actual unchanged packer.");
  }
  const beforeGeometry = R1MasonryGeometryCheckpointSchema.parse(input.before.geometryCheckpoint);
  const afterGeometry = R1MasonryGeometryCheckpointSchema.parse(input.after.geometryCheckpoint);
  const pickGeometry = (value: typeof beforeGeometry) => ({ geometryHash: value.geometryHash, sourceGraphHash: value.sourceGraphHash,
    irTriangles: value.irTriangles, renderedTriangles: value.renderedTriangles, geometryBytes: value.geometryBytes, instanceCount: value.instanceCount });
  if (!same(pickGeometry(beforeGeometry), pickGeometry(afterGeometry)) ||
      !same(pickGeometry(beforeGeometry), pickGeometry(s5.geometryCheckpoint))) fail("Actual geometry/hash/cost changed.");
  const before = await summarize(input.before), after = await summarize(input.after);
  const sampling = R1SamplingReportSchema.parse(input.s4Sampling);
  const keyed = (items: readonly { sourceId: string }[]) => [...items].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
  for (const capture of sampling.captures.filter((item) => item.sourceName === "procedural")) {
    const origins = capture.snapshot.sourceHashes;
    if (origins.length !== 12 || new Set(origins.map((item) => item.sourceId)).size !== 12 ||
        !same(keyed(before.sourceHashes), keyed(origins))) fail("Every before source request/content origin must match the exact frozen S4/S5 output.");
  }
  if (before.atlasContentHash !== s5.identity.atlasContentHash ||
      !same(before.channelDataHashes, s5.geometryCheckpoint.atlasChannelDataHashes) ||
      before.sourceLayerHashes[primaryIndex].baseColor !== s5.brickSourceModel.sourceBaseColorSha256) fail("Before bytes do not match the independently frozen S5 material.");
  for (const [frame, summary, geometry] of [[input.before, before, beforeGeometry], [input.after, after, afterGeometry]] as const) {
    if (geometry.atlasContentHash !== summary.atlasContentHash || !same(geometry.atlasChannelDataHashes, summary.channelDataHashes) ||
        geometry.sourceGraphHash !== card.identity.sourceGraphHash || !same(geometry.baseline, input.baseline.s4Card)) fail("Fixture checkpoint must bind its own actual atlas and frozen graph/card.");
    if (frame.packedAtlas.diagnostics.some((item) => item.severity === "error")) fail("Packed atlas has error diagnostics.");
  }
  for (let index = 0; index < 12; index += 1) {
    const old = input.before.sources[index], next = input.after.sources[index];
    for (const name of layerNames) {
      if (old.sourceId === PRIMARY && (name === "baseColor" || name === "height")) continue;
      const left = old.layers[name], right = next.layers[name];
      if (Boolean(left) !== Boolean(right) || (left && right && !bytesSame(left.data, right.data))) fail("Unaffected actual source bytes changed.");
    }
  }
  const slot = card.materialAnchors.atlasManifest.slots.find((item) => item.materialSourceId === PRIMARY)!;
  if (!same(slot.rectPx, { x: 4, y: 4, width: 27, height: 37 })) fail("Canonical primary ROI changed.");
  const atlas = input.before.packedAtlas.manifest;
  const inPadded = (x: number, y: number, rect: typeof slot.rectPx) => x >= rect.x - atlas.paddingPx &&
    x < rect.x + rect.width + atlas.paddingPx && y >= rect.y - atlas.paddingPx && y < rect.y + rect.height + atlas.paddingPx;
  for (const name of channelNames) for (let y = 0; y < atlas.heightPx; y += 1) for (let x = 0; x < atlas.widthPx; x += 1) {
    const protectedPixel = name === "orm" || name === "opacity" || !inPadded(x, y, slot.rectPx) ||
      atlas.slots.some((item) => item.materialSourceId !== PRIMARY && inPadded(x, y, item.rectPx));
    if (protectedPixel) {
      const offset = (y * atlas.widthPx + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) if (input.before.packedAtlas.channels[name].data[offset + channel] !==
        input.after.packedAtlas.channels[name].data[offset + channel]) fail("Atlas bytes outside exclusive primary ROI/padding changed.");
    }
  }
  const legacySeedHash = before.sourceHashes[primaryIndex].requestHash;
  const field = checkSelectedPixels(input.after.sources[primaryIndex], primaryRequest, legacySeedHash);
  const binary = Array.from({ length: 1024 }, (_, index) => {
    const x = (index % 32) % 31, y = Math.floor(index / 32) % 31;
    return y % 3 < 1 || (x + (Math.floor(y / 3) % 2 ? 3 : 0)) % 6 < 1 ? 1 : 0;
  });
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampled = (values: number[]) => Array.from({ length: 999 }, (_, index) =>
    values[Math.floor(Math.floor(index / 27) * 32 / 37) * 32 + Math.floor((index % 27) * 32 / 27)]);
  const { atlasContentHash: _atlasContentHash, ...identity } = card.identity;
  void _atlasContentHash;
  return verifyR1MasonryCoverageDelta({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-primary-wall-material-delta", packetId: input.packetId, createdAt: input.createdAt,
    baseline: input.baseline, producerBefore: checkpoint.producer,
    immutable: { identity, controls: card.controls, resolvedSpec: card.resolvedSpec, materialAnchors: card.materialAnchors,
      freeze: card.freeze, geometryHash: beforeGeometry.geometryHash,
      cost: { irTriangles: beforeGeometry.irTriangles, renderedTriangles: beforeGeometry.renderedTriangles,
        geometryBytes: beforeGeometry.geometryBytes, instanceCount: beforeGeometry.instanceCount } },
    profile: PROFILE, selectedSourceId: PRIMARY, legacySeedHash, sourceRequests: beforeRequests,
    controlledOrigins: input.before.sources.map(({ layers: _layers, ...value }) => { void _layers; return value; }), before, after,
    coverageFieldMeans: {
      source: { widthPx: 32, heightPx: 32, sampleCount: 1024, legacyBinary: mean(binary), subpixel: mean(field) },
      packed: { widthPx: 27, heightPx: 37, sampleCount: 999, legacyBinary: mean(sampled(binary)), subpixel: mean(sampled(field)) }
    }, humanReview: "pending"
  });
}
