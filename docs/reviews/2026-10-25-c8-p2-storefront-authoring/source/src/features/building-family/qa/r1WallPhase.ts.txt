import { z } from "zod";
import { canonicalJson } from "../core/canonicalJson";
import { R1AcceptanceCardSchema, R1BuildingSnapshotSchema, R1SamplingReportSchema } from "./r1BaselineContracts";
import { R1_MASONRY_FLAT_LINEAR_COLOR, R1MasonryGeometryCheckpointSchema, R1MasonryWallStateSchema, type R1MasonryWallState } from "./r1MasonryAppearance";
import { R1PeriodicSamplingDeltaSchema } from "./r1PeriodicSampling";

type Vec2 = [number, number];
type Vec3 = [number, number, number];
export type WallPhaseFacade = "front" | "rear" | "left" | "right";
export const R1_WALL_PHASE_FLOAT32_TOLERANCE_M = 0.00002;
export const R1_WALL_PHASE_SOURCE_BASELINE_SHA256 = "6bcab4595019b871e999ce4515b309cc2a232af40d6ba485760b54ed2947834b";
export const R1_WALL_PHASE_CONDITIONS = ["production", "local-base-color-only", "shared-base-color-only", "local-flat-no-shadow", "shared-flat-no-shadow", "restored-production"] as const;
export const R1_WALL_PHASE_PRESETS = [
  { requestedBackend: "webgpu", viewName: "rear", lightingName: "ordinary" },
  { requestedBackend: "webgpu", viewName: "right", lightingName: "ordinary" },
  { requestedBackend: "webgl", viewName: "three-quarter", lightingName: "ordinary" }
] as const;
export const R1_WALL_PHASE_SOURCE_EXCEPTIONS = ["scripts/diagnostics/r1-building-capture.mjs", "scripts/diagnostics/r1-baseline-browser.mjs"] as const;
export const R1_WALL_PHASE_NEW_SOURCE_FILES = ["src/features/building-family/qa/r1WallPhase.ts", "src/features/building-family/tests/r1WallPhase.test.ts",
  "scripts/diagnostics/r1-wall-phase-browser.mjs", "scripts/diagnostics/r1-wall-phase-attribution.mjs", "scripts/capture-r1-wall-phase.mjs"] as const;

const finite = z.number().finite(), count = z.number().int().nonnegative().safe();
const sha = z.string().regex(/^[a-f\d]{64}$/);
const fileHash = z.object({ file: z.string().min(1), sha256: sha }).strict();
const vec2 = z.tuple([finite, finite]), vec3 = z.tuple([finite, finite, finite]);
const facade = z.enum(["front", "rear", "left", "right"]);
const phase = z.enum(["local", "shared"]);
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
const close = (a: number, b: number, tolerance = R1_WALL_PHASE_FLOAT32_TOLERANCE_M): boolean => Math.abs(a - b) <= tolerance;
const closeVector = (a: readonly number[], b: readonly number[], tolerance = R1_WALL_PHASE_FLOAT32_TOLERANCE_M): boolean => a.length === b.length && a.every((value, index) => close(value, b[index], tolerance));
const fail = (message: string): never => { throw new Error("R1 wall phase: " + message); };
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const matrix = z.array(finite).length(16).refine((m) => m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1, "A finite column-major affine matrix is required.");
const bounds = z.object({ min: vec3, max: vec3 }).strict().refine((b) => b.max.every((value, index) => value > b.min[index]), "Facade bounds must be ordered and nonempty.");

function multiply(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[column * 4 + k], 0);
  });
}
function inverse(input: readonly number[]): number[] {
  const m = matrix.parse(input);
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) fail("Singular or unsafe placement matrix.");
  const values = [(e * i - f * h), (f * g - d * i), (d * h - e * g), 0,
    (c * h - b * i), (a * i - c * g), (b * g - a * h), 0,
    (b * f - c * e), (c * d - a * f), (a * e - b * d), 0].map((value) => value / determinant);
  values.push(...[0, 1, 2].map((row) => -(values[row] * m[12] + values[4 + row] * m[13] + values[8 + row] * m[14])), 1);
  if (!values.every(Number.isFinite)) fail("Unsafe inverse placement matrix.");
  return values;
}
function pointByMatrix(m: readonly number[], p: readonly number[]): Vec3 {
  return [0, 1, 2].map((row) => m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row]) as Vec3;
}

/** Building-local metres remove the whole root pose/scale. This mathematical
 * helper supports instance composition; the live S9 treatment rejects instances. */
export function projectWallPhasePoint(input: {
  sourcePoint: Vec3; sourceNormal: Vec3; rootMatrixWorld: readonly number[];
  objectMatrixWorld: readonly number[]; instanceMatrix?: readonly number[];
}): { buildingPoint: Vec3; buildingNormal: Vec3; relativeMatrix: number[] } {
  const p = vec3.parse(input.sourcePoint), n = vec3.parse(input.sourceNormal);
  const relativeMatrix = multiply(multiply(inverse(input.rootMatrixWorld), matrix.parse(input.objectMatrixWorld)), matrix.parse(input.instanceMatrix ?? identityMatrix));
  const inv = inverse(relativeMatrix);
  const transformed = [0, 1, 2].map((axis) => inv[axis * 4] * n[0] + inv[axis * 4 + 1] * n[1] + inv[axis * 4 + 2] * n[2]);
  const length = Math.hypot(...transformed);
  if (!Number.isFinite(length) || length === 0) fail("A nonzero finite normal is required.");
  const buildingPoint = pointByMatrix(relativeMatrix, p);
  if (!buildingPoint.every(Number.isFinite)) fail("Unsafe placed point.");
  return { buildingPoint, buildingNormal: transformed.map((value) => value / length) as Vec3, relativeMatrix };
}

const normals: Record<WallPhaseFacade, Vec3> = { front: [0, 0, -1], rear: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0] };
/** Literal handed facade frames. Selecting ownership/cap faces is the caller's
 * responsibility; this rejects a selected point outside its outward plane. */
export function deriveSharedWallPhaseUv(input: {
  buildingPoint: Vec3; buildingNormal: Vec3; facade: WallPhaseFacade;
  bounds: { min: Vec3; max: Vec3 }; groundYM: number;
}): Vec2 {
  const p = vec3.parse(input.buildingPoint), n = vec3.parse(input.buildingNormal);
  const frame = facade.parse(input.facade), b = bounds.parse(input.bounds);
  finite.parse(input.groundYM);
  const axis = frame === "front" || frame === "rear" ? 2 : 0;
  const exterior = frame === "front" || frame === "left" ? b.min[axis] : b.max[axis];
  if (!close(p[axis], exterior) || !closeVector(n, normals[frame], 1e-6) ||
      p.some((value, index) => value < b.min[index] - R1_WALL_PHASE_FLOAT32_TOLERANCE_M || value > b.max[index] + R1_WALL_PHASE_FLOAT32_TOLERANCE_M)) {
    fail("Selected face is not on its declared outward facade plane.");
  }
  const u = frame === "rear" ? p[0] - b.min[0] : frame === "front" ? b.max[0] - p[0] : frame === "right" ? b.max[2] - p[2] : p[2] - b.min[2];
  const v = p[1] - input.groundYM;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return fail("Facade phase subtraction overflowed.");
  return [u, v];
}

/** Negative phases belong to mathematical goldens; canonical facade anchors
 * produce nonnegative coordinates. No first/last texel equality is assumed. */
export function wallPhaseTileCoordinate(metres: number, tileSizeM = 0.96): { tile: number; phase: number } {
  finite.parse(metres); finite.positive().parse(tileSizeM);
  const value = metres / tileSizeM, tile = Math.floor(value);
  if (!Number.isSafeInteger(tile)) fail("Unsafe tile coordinate.");
  return { tile, phase: value - tile };
}

export const R1WallPhaseSourceBaselineSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-s9-pre-edit-source-baseline"),
  packetId: z.literal("2026-10-14-r1-s9"), createdAt: z.iso.datetime(), sourceCommit: z.string().regex(/^[a-f\d]{40}$/),
  baseline: fileHash, executionHelper: fileHash, trackedPatch: fileHash, allSourceFiles: z.array(fileHash).length(238),
  sourceStability: z.object({ algorithm: z.literal("sha256-utf8-ordinal-posix-file-colon-sha256-lf"), fileCount: z.literal(238), sha256: sha }).strict(),
  protectedArtifacts: z.literal(26), protectedDiagnosticSources: z.literal(55), humanReview: z.literal("pending"), scope: z.string().min(1)
}).strict().refine((value) => new Set(value.allSourceFiles.map((row) => row.file)).size === 238, "Pre-edit source paths must be unique.");

const phaseModel = z.object({ phaseSpace: z.literal("building-local-metres"), bounds, groundYM: finite, rootMatrixWorld: matrix, objectMatrixWorld: matrix }).strict();
const sourceFace = z.object({ elementIndex: count.max(264), faceIndex: count.max(5), semanticPath: z.string().min(1),
  ownedFacade: facade, facade: facade.nullable(), selected: z.boolean(), sourceVertexIndices: z.array(count.max(6359)).length(4),
  buildingPositions: z.array(vec3).length(4), buildingNormal: vec3,
  originalMetreUvs: z.array(vec2).length(4), sharedMetreUvs: z.array(vec2).length(4) }).strict();

export const R1WallPhaseAllocationLedgerSchema = z.object({
  buffers: z.array(z.object({ id: z.string().min(1), byteLength: count.positive() }).strict()).min(1),
  active: z.array(z.string()), retainedOriginal: z.array(z.string()), owned: z.array(z.string()), temporary: z.array(z.string()), auxiliary: z.array(z.string()), peak: z.array(z.string()),
  activeBytes: count, retainedOriginalBytes: count, ownedBytes: count, temporaryBytes: count, auxiliaryBytes: count, peakBytes: count
}).strict().superRefine((value, context) => {
  const table = new Map(value.buffers.map((row) => [row.id, row.byteLength]));
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (table.size !== value.buffers.length) issue("Allocation IDs must represent unique actual backing buffers.");
  for (const [role, bytes] of [["active", "activeBytes"], ["retainedOriginal", "retainedOriginalBytes"], ["owned", "ownedBytes"], ["temporary", "temporaryBytes"], ["auxiliary", "auxiliaryBytes"], ["peak", "peakBytes"]] as const) {
    const ids = value[role];
    if (new Set(ids).size !== ids.length || ids.some((id) => !table.has(id)) || value[bytes] !== ids.reduce((sum, id) => sum + (table.get(id) ?? 0), 0)) issue("Allocation role IDs/byte sums must agree with actual unique buffers.");
  }
  const current = [...new Set([...value.active, ...value.retainedOriginal, ...value.owned, ...value.temporary, ...value.auxiliary])];
  if (value.peakBytes < current.reduce((sum, id) => sum + (table.get(id) ?? 0), 0)) issue("Measured construction peak cannot be smaller than the currently retained unique union.");
});

const geometryState = z.object({ phase, geometryHash: sha, selectedGeometryHash: sha, originalIrHash: sha,
  protectedGeometryHash: sha, instanceTransformsHash: sha, protectedUvHash: sha,
  selectedVertexCount: count.positive(), selectedIndexCount: count.positive(), selectedTriangleCount: count.positive(), totalRenderedTriangles: count.positive(),
  selectedSurfaceAreaM2: finite.positive(), selectedBounds: bounds,
  normalAreaDistribution: z.array(z.object({ normal: vec3, areaM2: finite.positive() }).strict()).min(1), minimumWindingNormalDot: finite.min(-1).max(1)
}).strict().refine((value) => value.selectedIndexCount === 3 * value.selectedTriangleCount && value.totalRenderedTriangles >= value.selectedTriangleCount, "Actual indexed triangle costs must agree.");
export const R1WallPhaseStateSchema = geometryState.safeExtend({ allocationLedger: R1WallPhaseAllocationLedgerSchema });
const triangleWitness = z.object({ id: z.string().min(1), phase, elementIndex: count.max(264), faceIndex: count.max(5), facade,
  positionsM: z.array(vec3).length(3), normals: z.array(vec3).length(3), metreUvs: z.array(vec2).length(3), atlasUvs: z.array(vec2).length(3),
  tile: z.tuple([count, count]), barycentric: z.tuple([finite, finite, finite]), buildingPoint: vec3, interpolatedAtlasUv: vec2 }).strict();
const continuitySide = z.object({ elementIndex: count.max(264), faceIndex: count.max(5), localMetreUv: vec2,
  sharedMetreUv: vec2, sharedTriangleWitnessId: z.string().min(1) }).strict();
const caseFields = { requestedBackend: z.enum(["webgpu", "webgl"]), viewName: z.enum(["rear", "right", "three-quarter"]), lightingName: z.literal("ordinary"), condition: z.enum(R1_WALL_PHASE_CONDITIONS) };
const pixelProfile = z.object({ ...caseFields, screenshot: fileHash, axis: z.enum(["x", "y"]), fixedPx: count, firstPx: count,
  rgba: z.array(count.max(255)).min(8) }).strict().refine((value) => value.rgba.length % 4 === 0, "Pixel profile must contain whole RGBA pixels.");
const rgba = z.tuple([count.max(255), count.max(255), count.max(255), count.max(255)]);
const pixelMappingSide = z.object({ triangleWitnessId: z.string().min(1), atlasPixel: z.tuple([count, count]), roiPixel: z.tuple([count, count]),
  transformedAtlasUv: vec2, textureTransform: z.object({ matrix: z.array(finite).length(9), flipY: z.boolean(), wrapS: z.union([z.literal(1000), z.literal(1001), z.literal(1002)]), wrapT: z.union([z.literal(1000), z.literal(1001), z.literal(1002)]) }).strict(),
  baseColorRgba: rgba, presentedRgba: rgba }).strict();

export const R1WallPhaseEvidenceSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-phase-attribution"), baselinePacketId: z.literal("2026-10-14-r1-s8"),
  sourceGraphHash: sha, atlasContentHash: sha, originalGeometryHash: sha, sourceGeometryHash: sha, originalIrHash: sha,
  protectedGeometryHash: sha, instanceTransformsHash: sha, protectedUvHash: sha, phaseModel,
  target: z.object({ batchId: z.literal("mesh.wall-panels"), objectKind: z.literal("Mesh"), instanceCount: z.literal(0),
    sourcePrimitiveCount: z.literal(265), sourceVertexCount: z.literal(6360), sourceTriangleCount: z.literal(3180) }).strict(),
  sourceFaces: z.array(sourceFace).length(1590), geometryStates: z.array(geometryState).length(2),
  triangleWitnesses: z.array(triangleWitness).min(4),
  continuityPairs: z.array(z.object({ id: z.string().min(1), facade, buildingPoint: vec3, first: continuitySide, second: continuitySide }).strict()).min(2),
  wrapWitnesses: z.array(z.object({ id: z.string().min(1), firstTriangleWitnessId: z.string(), secondTriangleWitnessId: z.string(), periodOffset: z.tuple([z.number().int().safe(), z.number().int().safe()]) }).strict()).min(2),
  pixelProfiles: z.array(pixelProfile).min(12), captureCosts: z.array(z.object({ caseKey: z.string().min(1), allocationLedger: R1WallPhaseAllocationLedgerSchema }).strict()).length(18),
  pixelMappings: z.array(z.object({ requestedBackend: z.enum(["webgpu", "webgl"]), viewName: z.enum(["rear", "right", "three-quarter"]), lightingName: z.literal("ordinary"), pixel: z.tuple([count, count]),
    local: pixelMappingSide, shared: pixelMappingSide, flatNoShadow: z.object({ localRgba: rgba, sharedRgba: rgba }).strict() }).strict()).min(2),
  historicalBoundarySelections: z.array(z.object({ id: z.string().min(1), requestedBackend: z.literal("webgpu"), viewName: z.enum(["rear", "right"]), lightingName: z.literal("ordinary"),
    sides: z.array(z.object({ pixel: z.tuple([count, count]), elementIndex: count.max(264), faceIndex: count.max(5), ownedFacade: facade, selected: z.boolean(), buildingPoint: vec3, buildingNormal: vec3 }).strict()).length(2), bothSelected: z.boolean() }).strict()).length(2),
  limitations: z.array(z.string().min(1)).min(1)
}).strict();
export type R1WallPhaseEvidence = z.infer<typeof R1WallPhaseEvidenceSchema>;

const screenshot = fileHash.extend({ widthPx: count.positive(), heightPx: count.positive() }).strict();
const materialLabel = z.object({ batchId: z.string().min(1), materialName: z.string(), materialType: z.string(),
  materialSlotId: z.string().nullable().optional(), atlasSlotId: z.string().nullable().optional(), atlasContentHash: sha.nullable().optional() }).strict();
const resources = z.object({ ownedGeometryCreated: count, ownedGeometryDisposed: count, ownedGeometryLive: count,
  temporaryGeometryCreated: count, temporaryGeometryDisposed: count, temporaryGeometryLive: count }).strict().refine((value) =>
  value.ownedGeometryCreated - value.ownedGeometryDisposed === value.ownedGeometryLive && value.temporaryGeometryCreated - value.temporaryGeometryDisposed === value.temporaryGeometryLive,
"Owned/temporary resource lifetime arithmetic must agree.");
export const R1WallPhaseRuntimeCostSchema = z.object({ activeSceneTriangleCount: count, selectedSurfaceAreaM2: finite.positive(), selectedBounds: bounds,
  normalAreaDistribution: geometryState.shape.normalAreaDistribution, minimumWindingNormalDot: finite.min(-1).max(1),
  activeSceneUniqueBufferBytes: count, activeSceneGeometryBufferBytes: count, activeInstanceMatrixBufferBytes: count,
  retainedOriginalBufferBytes: count, temporarySourceBufferBytes: count, guardSnapshotBufferBytes: count, ownedReplacementBufferBytes: count, peakUnionBufferBytes: count,
  preparationTimeMs: finite.nonnegative(), constructionTimeMs: finite.nonnegative(), sourceVertexCount: z.literal(6360), sourceTriangleCount: z.literal(3180),
  renderedVertexCount: count, renderedTriangleCount: count,
  scope: z.literal("Scene, instance, retained-original, guard and replacement ArrayBuffers; excludes report transport, JavaScript objects and GPU allocations.") }).strict();
const runtime = z.object({ references: z.object({ selectedOriginalGeometryAttached: z.boolean(), originalSelectedAttributeReferencesIntact: z.boolean(),
  originalSelectedArrayReferencesIntact: z.boolean(), originalSelectedBufferReferencesIntact: z.boolean(), originalSelectedBytesIntact: z.boolean(), protectedGeometryReferencesIntact: z.boolean(), irReferencesIntact: z.boolean() }).strict(),
  resources, cost: R1WallPhaseRuntimeCostSchema, submittedFrameCount: count.positive(), actualBackend: z.enum(["webgpu", "webgl"]), backendCounters: z.object({ available: z.boolean(), scope: z.literal("renderer.info sampled counters"),
    render: z.record(z.string(), z.union([finite, z.boolean()])), memory: z.record(z.string(), z.union([finite, z.boolean()])) }).strict() }).strict();
export const R1WallPhaseReportSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-phase-discriminator"), packetId: z.string().min(1), createdAt: z.iso.datetime(),
  source: R1AcceptanceCardSchema.shape.source.extend({ diagnosticFiles: z.array(fileHash).min(1) }).strict(),
  baseline: fileHash, baselineSampling: fileHash, materialBaseline: fileHash, sourceBaseline: fileHash, phaseEvidence: fileHash,
  controls: R1AcceptanceCardSchema.shape.controls, resolvedSpec: R1AcceptanceCardSchema.shape.resolvedSpec,
  identity: R1AcceptanceCardSchema.shape.identity, materialAnchors: R1AcceptanceCardSchema.shape.materialAnchors, freeze: R1AcceptanceCardSchema.shape.freeze,
  geometryCheckpoint: R1MasonryGeometryCheckpointSchema,
  captures: z.array(z.object({ ...caseFields, screenshot, snapshot: R1BuildingSnapshotSchema.extend({ materials: z.array(materialLabel).min(1) }).strict(),
    wallState: R1MasonryWallStateSchema, phaseState: R1WallPhaseStateSchema, runtime }).strict()).length(18),
  pageErrors: z.array(z.string()).length(0), humanReview: z.literal("pending"), limitations: z.array(z.string().min(1)).min(1)
}).strict();
export type R1WallPhaseReport = z.infer<typeof R1WallPhaseReportSchema>;

export function wallPhaseCaseKey(row: { requestedBackend: string; viewName: string; lightingName: string; condition: string }): string {
  return `${row.requestedBackend}/${row.viewName}/${row.lightingName}/${row.condition}`;
}
function expectedPhase(condition: R1WallPhaseReport["captures"][number]["condition"]): "local" | "shared" { return condition.startsWith("shared-") ? "shared" : "local"; }
function materialCondition(condition: R1WallPhaseReport["captures"][number]["condition"]): R1MasonryWallState["condition"] {
  return condition.includes("base-color-only") ? "base-color-only" : condition.includes("flat-no-shadow") ? "flat-no-shadow" : condition === "restored-production" ? "restored-production" : "production";
}
function barycentric(values: readonly (readonly number[])[], weights: readonly number[]): number[] {
  return values[0].map((_, axis) => values.reduce((sum, value, index) => sum + value[axis] * weights[index], 0));
}
function unique(values: readonly string[], name: string): void { if (new Set(values).size !== values.length) fail(`Duplicate ${name}.`); }
function cross(a: readonly number[], b: readonly number[]): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function subtract(a: readonly number[], b: readonly number[]): Vec3 { return a.map((value, index) => value - b[index]) as Vec3; }
function originalFaceUv(face: z.infer<typeof sourceFace>, point: readonly number[]): Vec2 {
  const axes = Math.abs(face.buildingNormal[2]) > 0.9 ? [0, 1] : Math.abs(face.buildingNormal[0]) > 0.9 ? [2, 1] : [0, 2];
  const [a, b, c] = face.buildingPositions;
  const p = point[axes[0]] - a[axes[0]], q = point[axes[1]] - a[axes[1]];
  const x = b[axes[0]] - a[axes[0]], y = b[axes[1]] - a[axes[1]], u = c[axes[0]] - a[axes[0]], v = c[axes[1]] - a[axes[1]];
  const determinant = x * v - y * u;
  if (Math.abs(determinant) < 1e-14) return fail("Source face affine basis is degenerate.");
  const first = (p * v - q * u) / determinant, second = (x * q - y * p) / determinant;
  return [0, 1].map((axis) => face.originalMetreUvs[0][axis] + first * (face.originalMetreUvs[1][axis] - face.originalMetreUvs[0][axis]) + second * (face.originalMetreUvs[2][axis] - face.originalMetreUvs[0][axis])) as Vec2;
}

/** Serialized evidence binding is not a substitute for the producer's direct
 * reference/disposal guards and independent fresh-buffer reconstruction. */
export function verifyR1WallPhaseEvidence(input: { evidence: unknown; baseline: unknown; materialBaseline: unknown }): R1WallPhaseEvidence {
  const evidence = R1WallPhaseEvidenceSchema.parse(input.evidence), baseline = R1AcceptanceCardSchema.parse(input.baseline);
  const material = R1PeriodicSamplingDeltaSchema.parse(input.materialBaseline);
  if (baseline.packetId !== "2026-10-14-r1-s8" || evidence.sourceGraphHash !== baseline.identity.sourceGraphHash ||
      evidence.atlasContentHash !== baseline.identity.atlasContentHash || evidence.originalGeometryHash !== material.immutable.geometryHash ||
      material.after.atlasContentHash !== evidence.atlasContentHash) fail("Evidence is not bound to accepted S8 geometry/material identity.");
  unique(evidence.sourceFaces.map((face) => `${face.elementIndex}/${face.faceIndex}`), "source faces");
  const paths = new Map<number, string>();
  for (const face of evidence.sourceFaces) {
    const owner = `${face.semanticPath}/${face.ownedFacade}`;
    const prior = paths.get(face.elementIndex); if (prior && prior !== owner) fail("Source face semantic ownership changed."); paths.set(face.elementIndex, owner);
    const offset = face.elementIndex * 24 + face.faceIndex * 4;
    if (!same(face.sourceVertexIndices, [offset, offset + 1, offset + 2, offset + 3])) fail("Source face vertex ownership changed.");
    if (!face.selected) { if (face.facade !== null || !same(face.originalMetreUvs, face.sharedMetreUvs)) fail("Protected cap/reveal/interior metre UV changed."); continue; }
    if (face.facade !== face.ownedFacade) fail("Selected face must belong to its declared compiler facade.");
    for (let index = 0; index < 4; index += 1) {
      const expected = deriveSharedWallPhaseUv({ buildingPoint: face.buildingPositions[index], buildingNormal: face.buildingNormal,
        facade: face.ownedFacade, ...evidence.phaseModel });
      if (!closeVector(face.sharedMetreUvs[index], expected) || expected.some((value) => value < -R1_WALL_PHASE_FLOAT32_TOLERANCE_M)) fail("Shared source face does not match the declared placed facade frame.");
    }
  }
  if (paths.size !== 265 || ["front", "rear", "left", "right"].some((name) => !evidence.sourceFaces.some((face) => face.selected && face.facade === name))) fail("Canonical source selection must cover all four actual facade owners.");
  for (let elementIndex = 0; elementIndex < 265; elementIndex += 1) if (evidence.sourceFaces.filter((face) => face.elementIndex === elementIndex && face.selected).length !== 1) fail("Exactly one owned exterior face per canonical source box is required.");
  const sourceAreaByNormal = new Map<string, { normal: Vec3; areaM2: number }>();
  let sourceArea = 0, edgeChainLength = 0;
  for (const face of evidence.sourceFaces) {
    const area = Math.hypot(...cross(subtract(face.buildingPositions[1], face.buildingPositions[0]), subtract(face.buildingPositions[2], face.buildingPositions[0])));
    if (!Number.isFinite(area) || area <= 0) fail("Source face must have real nonzero area.");
    sourceArea += area;
    for (let index = 0; index < 4; index += 1) edgeChainLength += Math.hypot(...subtract(face.buildingPositions[index], face.buildingPositions[(index + 1) % 4]));
    const key = face.buildingNormal.map((value) => Math.round(value * 1e6)).join(",");
    const bucket = sourceAreaByNormal.get(key) ?? { normal: face.buildingNormal, areaM2: 0 }; bucket.areaM2 += area; sourceAreaByNormal.set(key, bucket);
  }
  const sourceBounds = { min: [0, 1, 2].map((axis) => Math.min(...evidence.sourceFaces.flatMap((face) => face.buildingPositions.map((p) => p[axis])))), max: [0, 1, 2].map((axis) => Math.max(...evidence.sourceFaces.flatMap((face) => face.buildingPositions.map((p) => p[axis])))) };
  if (!closeVector(evidence.phaseModel.bounds.min, sourceBounds.min) || !closeVector(evidence.phaseModel.bounds.max, sourceBounds.max) || !close(evidence.phaseModel.groundYM, sourceBounds.min[1])) fail("Declared facade bounds/ground anchor must match the immutable placed source extent.");
  unique(evidence.geometryStates.map((state) => state.phase), "geometry phases");
  for (const state of evidence.geometryStates) {
    for (const key of ["originalIrHash", "protectedGeometryHash", "instanceTransformsHash", "protectedUvHash"] as const) if (state[key] !== evidence[key]) fail(`Protected ${key} changed.`);
    if (state.phase === "local" && (state.geometryHash !== evidence.originalGeometryHash || state.totalRenderedTriangles !== material.immutable.cost.renderedTriangles)) fail("Local geometry must equal actual accepted S8 buffers/cost.");
    // A metre boundary uncertainty times the source quad edge-chain length,
    // plus the second-order triangle term, is an explicit Float32 area bound.
    const areaTolerance = R1_WALL_PHASE_FLOAT32_TOLERANCE_M * edgeChainLength + 4 * R1_WALL_PHASE_FLOAT32_TOLERANCE_M ** 2 * (state.selectedTriangleCount + 3180);
    const normalKeys = state.normalAreaDistribution.map((row) => row.normal.map((value) => Math.round(value * 1e6)).join(","));
    unique(normalKeys, "normal area directions");
    if (!close(state.selectedSurfaceAreaM2, sourceArea, areaTolerance) || !closeVector(state.selectedBounds.min, sourceBounds.min) || !closeVector(state.selectedBounds.max, sourceBounds.max) ||
        state.minimumWindingNormalDot < 1 - 1e-6 || normalKeys.length !== sourceAreaByNormal.size ||
        state.normalAreaDistribution.some((row, index) => !sourceAreaByNormal.has(normalKeys[index]) || !close(row.areaM2, sourceAreaByNormal.get(normalKeys[index])!.areaM2, areaTolerance)) ||
        !close(state.normalAreaDistribution.reduce((sum, row) => sum + row.areaM2, 0), state.selectedSurfaceAreaM2, areaTolerance)) fail("Submitted surface coverage/bounds/outward normals changed beyond Float32 clipping uncertainty.");
  }
  const local = evidence.geometryStates.find((state) => state.phase === "local"), shared = evidence.geometryStates.find((state) => state.phase === "shared");
  if (!local || !shared || local.selectedGeometryHash === shared.selectedGeometryHash || local.geometryHash === shared.geometryHash) fail("Shared phase must have actual different submitted UV buffers.");
  const wallSlot = baseline.materialAnchors.atlasManifest.slots.find((slot) => slot.id === "wall.primary");
  if (!wallSlot) return fail("Frozen primary wall slot missing.");
  const atlas = baseline.materialAnchors.atlasManifest, rect = { x: wallSlot.rectPx.x / atlas.widthPx, y: wallSlot.rectPx.y / atlas.heightPx, width: wallSlot.rectPx.width / atlas.widthPx, height: wallSlot.rectPx.height / atlas.heightPx };
  unique(evidence.triangleWitnesses.map((row) => row.id), "triangle witnesses");
  const triangles = new Map(evidence.triangleWitnesses.map((row) => [row.id, row]));
  for (const triangle of evidence.triangleWitnesses) {
    const face = evidence.sourceFaces.find((row) => row.elementIndex === triangle.elementIndex && row.faceIndex === triangle.faceIndex);
    if (!face) return fail("Triangle witness source face missing.");
    if (!face.selected || face.facade !== triangle.facade || triangle.barycentric.some((weight) => weight < 0 || weight > 1) || !close(triangle.barycentric.reduce((sum, value) => sum + value, 0), 1, 1e-12)) fail("Triangle witness/source face/barycentric mapping invalid.");
    for (let vertex = 0; vertex < 3; vertex += 1) {
      if (!closeVector(triangle.normals[vertex], face.buildingNormal, 1e-6)) fail("Submitted triangle normal changed.");
      if (triangle.positionsM[vertex].some((value, axis) => value < Math.min(...face.buildingPositions.map((p) => p[axis])) - R1_WALL_PHASE_FLOAT32_TOLERANCE_M || value > Math.max(...face.buildingPositions.map((p) => p[axis])) + R1_WALL_PHASE_FLOAT32_TOLERANCE_M)) fail("Submitted triangle left its actual source face bounds.");
      if (triangle.phase === "shared") {
        const expected = deriveSharedWallPhaseUv({ buildingPoint: triangle.positionsM[vertex], buildingNormal: triangle.normals[vertex], facade: triangle.facade, ...evidence.phaseModel });
        if (!closeVector(triangle.metreUvs[vertex], expected)) fail("Submitted shared metre UV is not the placed affine frame.");
      } else if (!closeVector(triangle.metreUvs[vertex], originalFaceUv(face, triangle.positionsM[vertex]))) fail("Submitted local metre UV changed from the original source face.");
      const expected = triangle.metreUvs[vertex].map((value, axis) => {
        const tileSize = axis ? wallSlot.physicalSizeM.height : wallSlot.physicalSizeM.width;
        const chart = value / tileSize - triangle.tile[axis];
        if (chart < -R1_WALL_PHASE_FLOAT32_TOLERANCE_M || chart > 1 + R1_WALL_PHASE_FLOAT32_TOLERANCE_M) fail("Submitted triangle crosses a tile without a separate clipped chart.");
        return (axis ? rect.y : rect.x) + chart * (axis ? rect.height : rect.width);
      });
      if (!closeVector(triangle.atlasUvs[vertex], expected, 1e-6)) fail("Submitted atlas UV does not interpolate its own clipped tile chart.");
    }
    if (!closeVector(triangle.buildingPoint, barycentric(triangle.positionsM, triangle.barycentric)) ||
        !closeVector(triangle.interpolatedAtlasUv, barycentric(triangle.atlasUvs, triangle.barycentric), 1e-6)) fail("Actual submitted triangle interpolation does not reach the witness point.");
    const winding = cross(subtract(triangle.positionsM[1], triangle.positionsM[0]), subtract(triangle.positionsM[2], triangle.positionsM[0]));
    if (winding.reduce((sum, value, axis) => sum + value * normals[triangle.facade][axis], 0) <= 1e-14) fail("Submitted witness triangle is degenerate or has reversed outward winding.");
  }
  unique(evidence.continuityPairs.map((row) => row.id), "continuity pairs");
  for (const pair of evidence.continuityPairs) {
    if (pair.first.elementIndex === pair.second.elementIndex) fail("Continuity requires distinct actual source pieces.");
    for (const side of [pair.first, pair.second]) {
      const triangle = triangles.get(side.sharedTriangleWitnessId);
      if (!triangle || triangle.phase !== "shared" || triangle.facade !== pair.facade || triangle.elementIndex !== side.elementIndex || triangle.faceIndex !== side.faceIndex ||
          !closeVector(pair.buildingPoint, triangle.buildingPoint) || !closeVector(side.sharedMetreUv, barycentric(triangle.metreUvs, triangle.barycentric))) fail("Continuity pair is not backed by its actual submitted triangle at the same point.");
      const expected = deriveSharedWallPhaseUv({ buildingPoint: pair.buildingPoint, buildingNormal: normals[pair.facade], facade: pair.facade, ...evidence.phaseModel });
      if (!closeVector(side.sharedMetreUv, expected)) fail("Shared same-point values must match the literal facade frame.");
      const source = evidence.sourceFaces.find((face) => face.elementIndex === side.elementIndex && face.faceIndex === side.faceIndex);
      if (!source || !closeVector(side.localMetreUv, originalFaceUv(source, pair.buildingPoint))) fail("Recorded local reset is not the actual source face interpolation.");
    }
  }
  if (["rear", "right"].some((name) => !evidence.continuityPairs.some((pair) => pair.facade === name))) fail("Real rear and right shared-point boundaries are required.");
  unique(evidence.wrapWitnesses.map((row) => row.id), "wrap witnesses");
  for (const wrap of evidence.wrapWitnesses) {
    const first = triangles.get(wrap.firstTriangleWitnessId), second = triangles.get(wrap.secondTriangleWitnessId);
    if (!first || !second) return fail("Genuine wrap triangle endpoint missing.");
    if (first.id === second.id || first.phase !== "shared" || second.phase !== "shared" || first.facade !== second.facade || wrap.periodOffset.every((value) => value === 0)) fail("Genuine wrap requires distinct real shared triangle points and a nonzero period.");
    const a = barycentric(first.metreUvs, first.barycentric), b = barycentric(second.metreUvs, second.barycentric);
    if (a.some((value, axis) => !close(b[axis] - value, wrap.periodOffset[axis] * (axis ? wallSlot.physicalSizeM.height : wallSlot.physicalSizeM.width)))) fail("Wrap must be an actual complete U/V period in the placed field.");
  }
  if (![0, 1].every((axis) => evidence.wrapWitnesses.some((row) => row.periodOffset[axis] !== 0))) fail("Actual canonical U and height wrap witnesses are required.");
  unique(evidence.captureCosts.map((row) => row.caseKey), "capture costs");
  unique(evidence.historicalBoundarySelections.map((row) => row.viewName), "historical boundary elevations");
  for (const historical of evidence.historicalBoundarySelections) {
    const expectedPixels = historical.viewName === "rear" ? [[697, 590], [698, 590]] : [[742, 590], [743, 590]];
    if (!same(historical.sides.map((side) => side.pixel), expectedPixels) || historical.bothSelected !== historical.sides.every((side) => side.selected)) fail("Historical boundary pixel labels/selection conjunction changed.");
    for (const side of historical.sides) {
      const face = evidence.sourceFaces.find((row) => row.elementIndex === side.elementIndex && row.faceIndex === side.faceIndex);
      if (!face || side.ownedFacade !== face.ownedFacade || side.selected !== face.selected || !closeVector(side.buildingNormal, face.buildingNormal, 1e-6) ||
          side.buildingPoint.some((value, axis) => value < Math.min(...face.buildingPositions.map((p) => p[axis])) - R1_WALL_PHASE_FLOAT32_TOLERANCE_M || value > Math.max(...face.buildingPositions.map((p) => p[axis])) + R1_WALL_PHASE_FLOAT32_TOLERANCE_M)) fail("Historical boundary must bind the actual owned exterior or protected cap face.");
    }
  }
  return evidence;
}

function expectedWallState(production: R1MasonryWallState, condition: R1MasonryWallState["condition"], geometryHash: string): R1MasonryWallState {
  const result = structuredClone(production); result.condition = condition; result.geometryHash = geometryHash;
  for (const material of result.wallMaterials) {
    if (condition === "base-color-only" || condition === "flat-no-shadow") {
      material.maps.normal = material.maps.roughness = material.maps.metalness = null;
      material.roughness = 0.82; material.metalness = 0;
    }
    if (condition === "flat-no-shadow") { material.maps.baseColor = null; material.color = [...R1_MASONRY_FLAT_LINEAR_COLOR]; }
  }
  if (condition === "flat-no-shadow") result.wallRenderables.forEach((renderable) => { renderable.receiveShadow = false; });
  return result;
}

export function verifyR1WallPhaseReport(input: {
  report: unknown; baseline: { report: unknown; sha256: string }; sampling: { report: unknown; sha256: string };
  material: { report: unknown; sha256: string }; sourceBaseline: { report: unknown; sha256: string }; evidence: { report: unknown; sha256: string };
}): R1WallPhaseReport {
  const report = R1WallPhaseReportSchema.parse(input.report), baseline = R1AcceptanceCardSchema.parse(input.baseline.report);
  const sampling = R1SamplingReportSchema.parse(input.sampling.report), material = R1PeriodicSamplingDeltaSchema.parse(input.material.report);
  const ledger = R1WallPhaseSourceBaselineSchema.parse(input.sourceBaseline.report);
  const evidence = verifyR1WallPhaseEvidence({ evidence: input.evidence.report, baseline, materialBaseline: material });
  if (input.sourceBaseline.sha256 !== R1_WALL_PHASE_SOURCE_BASELINE_SHA256) fail("The actual approved pre-edit ledger SHA changed.");
  for (const [pointer, supplied] of [["baseline", input.baseline], ["baselineSampling", input.sampling], ["materialBaseline", input.material], ["sourceBaseline", input.sourceBaseline], ["phaseEvidence", input.evidence]] as const) {
    if (report[pointer].sha256 !== sha.parse(supplied.sha256)) fail(`Hash-bound ${pointer} changed.`);
  }
  for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"] as const) if (!same(report[key], baseline[key])) fail(`Frozen ${key} changed.`);
  if (report.source.replayCard && !same(report.source.replayCard, report.baseline)) fail("Replay provenance must reference accepted S8.");
  if (baseline.packetId !== "2026-10-14-r1-s8" || report.source.commit !== baseline.source.commit || ledger.sourceCommit !== baseline.source.commit || ledger.trackedPatch.sha256 !== baseline.source.trackedDiffSha256) fail("Source ledger does not bind accepted S8.");
  unique(report.source.diagnosticFiles.map((row) => row.file), "source fingerprints");
  const expectedSourcePaths = [...baseline.source.diagnosticFiles.map((row) => row.file), ...R1_WALL_PHASE_NEW_SOURCE_FILES].sort();
  if (baseline.source.diagnosticFiles.length !== 55 || !same(report.source.diagnosticFiles.map((row) => row.file).sort(), expectedSourcePaths) || R1_WALL_PHASE_NEW_SOURCE_FILES.some((file) => ledger.allSourceFiles.some((row) => row.file === file))) fail("Exactly the prior55 plus declared5 diagnostic source paths are required.");
  for (const old of baseline.source.diagnosticFiles) {
    const frozen = ledger.allSourceFiles.find((row) => row.file === old.file), current = report.source.diagnosticFiles.find((row) => row.file === old.file);
    if (!frozen || frozen.sha256 !== old.sha256 || !current || (!(R1_WALL_PHASE_SOURCE_EXCEPTIONS as readonly string[]).includes(old.file) && current.sha256 !== old.sha256)) fail(`Protected source fingerprint missing or changed: ${old.file}.`);
  }
  const { atlasContentHash: _hash, ...identityWithoutAtlas } = baseline.identity; void _hash;
  for (const key of ["controls", "resolvedSpec", "materialAnchors", "freeze"] as const) if (!same(material.immutable[key], baseline[key])) fail("Accepted material baseline frozen fields changed.");
  if (!same(material.immutable.identity, identityWithoutAtlas) || material.after.atlasContentHash !== baseline.identity.atlasContentHash ||
      !same(report.geometryCheckpoint.baseline, report.baseline) || report.geometryCheckpoint.geometryHash !== evidence.originalGeometryHash ||
      report.geometryCheckpoint.sourceGraphHash !== baseline.identity.sourceGraphHash || report.geometryCheckpoint.atlasContentHash !== baseline.identity.atlasContentHash ||
      !same(report.geometryCheckpoint.atlasChannelDataHashes, material.after.channelDataHashes)) fail("Accepted material/geometry/raw channels changed.");
  if (!same({ irTriangles: report.geometryCheckpoint.irTriangles, renderedTriangles: report.geometryCheckpoint.renderedTriangles, geometryBytes: report.geometryCheckpoint.geometryBytes, instanceCount: report.geometryCheckpoint.instanceCount }, material.immutable.cost)) fail("All accepted geometry checkpoint counts/costs must remain exact.");
  if (baseline.pageErrors.length || sampling.pageErrors.length || !same(sampling.controls, baseline.controls) || sampling.source.commit !== baseline.source.commit || sampling.source.trackedDiffSha256 !== baseline.source.trackedDiffSha256) fail("Accepted sampling controls/source/errors changed.");
  const procedural = sampling.captures.filter((row) => row.sourceName === "procedural");
  if (procedural.length !== 2 || procedural.some((row) => row.snapshot.atlasContentHash !== baseline.identity.atlasContentHash || row.snapshot.atlasId !== baseline.identity.atlasId || !same(row.snapshot.sourceHashes, material.after.sourceHashes) || !same(row.snapshot.channelHashes, material.after.channelHashes))) fail("Accepted sampling source/atlas/channel identity changed.");
  const expectedCases = R1_WALL_PHASE_PRESETS.flatMap((preset) => R1_WALL_PHASE_CONDITIONS.map((condition) => wallPhaseCaseKey({ ...preset, condition })));
  const cases = report.captures.map(wallPhaseCaseKey); unique(cases, "capture cases"); unique(report.captures.map((row) => row.screenshot.file), "capture filenames");
  if (expectedCases.some((key) => !cases.includes(key)) || evidence.captureCosts.some((row) => !cases.includes(row.caseKey))) fail("Exactly the eighteen frozen phase cases/costs are required.");
  const wallSlots = new Set(baseline.materialAnchors.atlasManifest.slots.filter((slot) => slot.role === "wall").map((slot) => slot.id));
  const nonWallHash = report.captures[0].wallState.nonWallStateHash;
  for (const preset of R1_WALL_PHASE_PRESETS) {
    const rows = R1_WALL_PHASE_CONDITIONS.map((condition) => report.captures.find((row) => wallPhaseCaseKey(row) === wallPhaseCaseKey({ ...preset, condition })));
    if (rows.some((row) => !row)) return fail("Missing phase case.");
    const production = rows[0]!;
    const original = baseline.captures.find((row) => row.snapshot.actualBackend === preset.requestedBackend && row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName && row.snapshot.canvas.presentationMode === "textured");
    if (!original) return fail("Matching actual S8 capture missing.");
    const labels = z.array(materialLabel).parse(original.snapshot.materials).filter((label) => label.materialSlotId && wallSlots.has(label.materialSlotId));
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (row.snapshot.actualBackend !== row.requestedBackend || row.snapshot.canvas.backend !== row.requestedBackend || row.snapshot.fallbackReason != null ||
          row.runtime.actualBackend !== row.requestedBackend || row.runtime.submittedFrameCount !== row.snapshot.frameCount ||
          row.snapshot.viewName !== row.viewName || row.snapshot.lightingName !== row.lightingName || row.screenshot.widthPx !== row.snapshot.canvas.width || row.screenshot.heightPx !== row.snapshot.canvas.height ||
          (index > 0 && row.snapshot.frameCount <= rows[index - 1]!.snapshot.frameCount)) fail("Actual backend/canvas/submitted advancing frames must agree.");
      const { frameCount: _currentFrame, ...currentSnapshot } = row.snapshot, { frameCount: _oldFrame, ...frozenSnapshot } = original.snapshot; void _currentFrame; void _oldFrame;
      if (!same(currentSnapshot, frozenSnapshot)) fail("Every frozen snapshot field except submitted frameCount must remain exact.");
      if ((row.condition === "production" || row.condition === "restored-production") && row.screenshot.sha256 !== original.screenshot.sha256) fail("Actual production/restoration PNG must equal S8.");
      const { allocationLedger, ...state } = row.phaseState;
      const expected = evidence.geometryStates.find((candidate) => candidate.phase === expectedPhase(row.condition));
      if (!expected || !same(state, expected) || row.wallState.geometryHash !== state.geometryHash || row.wallState.nonWallStateHash !== nonWallHash) fail("Submitted phase geometry/protected state changed.");
      if (row.runtime.references.selectedOriginalGeometryAttached !== (state.phase === "local") || Object.entries(row.runtime.references).some(([key, value]) => key !== "selectedOriginalGeometryAttached" && !value) ||
          row.runtime.resources.ownedGeometryLive !== (state.phase === "local" ? 0 : 1) || row.runtime.resources.temporaryGeometryLive !== 0) fail("Actual producer reference/byte guards and phase-owned resource states must hold.");
      const cost = row.runtime.cost;
      if (cost.activeSceneTriangleCount !== state.totalRenderedTriangles || cost.renderedVertexCount !== state.selectedVertexCount || cost.renderedTriangleCount !== state.selectedTriangleCount ||
          cost.activeSceneUniqueBufferBytes !== allocationLedger.activeBytes || cost.activeSceneGeometryBufferBytes + cost.activeInstanceMatrixBufferBytes !== cost.activeSceneUniqueBufferBytes ||
          cost.activeInstanceMatrixBufferBytes !== report.geometryCheckpoint.instanceCount * 16 * 4 || (state.phase === "local" && cost.activeSceneGeometryBufferBytes !== report.geometryCheckpoint.geometryBytes) ||
          cost.retainedOriginalBufferBytes !== allocationLedger.retainedOriginalBytes || cost.guardSnapshotBufferBytes !== allocationLedger.auxiliaryBytes || cost.ownedReplacementBufferBytes !== allocationLedger.ownedBytes || cost.peakUnionBufferBytes !== allocationLedger.peakBytes ||
          !same({ selectedSurfaceAreaM2: cost.selectedSurfaceAreaM2, selectedBounds: cost.selectedBounds, normalAreaDistribution: cost.normalAreaDistribution, minimumWindingNormalDot: cost.minimumWindingNormalDot },
            { selectedSurfaceAreaM2: state.selectedSurfaceAreaM2, selectedBounds: state.selectedBounds, normalAreaDistribution: state.normalAreaDistribution, minimumWindingNormalDot: state.minimumWindingNormalDot })) fail("Actual construction/allocation/surface costs do not match their declared scopes and submitted geometry.");
      if (!same(evidence.captureCosts.find((cost) => cost.caseKey === wallPhaseCaseKey(row))?.allocationLedger, allocationLedger)) fail("Actual capture allocation history does not match hash-bound evidence.");
      const expectedMaterial = expectedWallState(production.wallState, materialCondition(row.condition), state.geometryHash);
      const actualMaterial = structuredClone(row.wallState);
      if (row.condition.includes("flat-no-shadow")) {
        for (let m = 0; m < actualMaterial.wallMaterials.length; m += 1) if (!closeVector(actualMaterial.wallMaterials[m].color, expectedMaterial.wallMaterials[m]?.color ?? [], 1e-6)) fail("Flat color changed.");
      }
      const comparable = (value: R1MasonryWallState) => ({ ...value, wallMaterials: value.wallMaterials.map((m) => ({ ...m, color: row.condition.includes("flat-no-shadow") ? [] : m.color })) });
      if (!same(comparable(actualMaterial), comparable(expectedMaterial))) fail("Only declared material/receive-shadow treatment may change.");
      if (!same(row.wallState.wallMaterials.map((item) => item.slotId).sort(), [...new Set(labels.map((label) => label.materialSlotId))].sort()) ||
          !same(row.wallState.wallRenderables.map((item) => item.batchId).sort(), labels.map((label) => label.batchId).sort())) fail("Actual wall material/renderable targets changed.");
      if (row.condition === "production" || row.condition === "restored-production") for (const m of row.wallState.wallMaterials) {
        const raw = material.after.channelDataHashes;
        if (m.maps.baseColor !== raw.baseColor || m.maps.normal !== raw.normal || m.maps.roughness !== raw.orm || m.maps.metalness !== raw.orm || (m.maps.opacity !== null && m.maps.opacity !== raw.opacity)) fail("Production map hashes must bind raw texture bytes.");
      }
    }
    if (rows[1]!.screenshot.sha256 === rows[2]!.screenshot.sha256) fail("Actual local/shared mapped pixels must differ.");
  }
  for (const profile of evidence.pixelProfiles) {
    const row = report.captures.find((capture) => wallPhaseCaseKey(capture) === wallPhaseCaseKey(profile));
    if (!row || !same(profile.screenshot, { file: row.screenshot.file, sha256: row.screenshot.sha256 }) ||
        profile.firstPx + profile.rgba.length / 4 > (profile.axis === "x" ? row.screenshot.widthPx : row.screenshot.heightPx) ||
        profile.fixedPx >= (profile.axis === "x" ? row.screenshot.heightPx : row.screenshot.widthPx)) fail("Actual pixel profile must bind the matching PNG/canvas.");
  }
  const profilePixel = (mapping: R1WallPhaseEvidence["pixelMappings"][number], condition: R1WallPhaseReport["captures"][number]["condition"]): number[] => {
    const profile = evidence.pixelProfiles.find((row) => wallPhaseCaseKey(row) === wallPhaseCaseKey({ ...mapping, condition }) &&
      row.fixedPx === mapping.pixel[row.axis === "x" ? 1 : 0] && mapping.pixel[row.axis === "x" ? 0 : 1] >= row.firstPx && mapping.pixel[row.axis === "x" ? 0 : 1] < row.firstPx + row.rgba.length / 4);
    if (!profile) return fail("Mapped presented pixel lacks the corresponding actual PNG profile.");
    const offset = (mapping.pixel[profile.axis === "x" ? 0 : 1] - profile.firstPx) * 4;
    return profile.rgba.slice(offset, offset + 4);
  };
  const triangles = new Map(evidence.triangleWitnesses.map((row) => [row.id, row]));
  const slot = baseline.materialAnchors.atlasManifest.slots.find((row) => row.id === "wall.primary");
  if (!slot) return fail("Primary sample slot missing.");
  const atlas = baseline.materialAnchors.atlasManifest;
  const changedMappedViews = new Set<string>();
  for (const mapping of evidence.pixelMappings) {
    const localTriangle = triangles.get(mapping.local.triangleWitnessId), sharedTriangle = triangles.get(mapping.shared.triangleWitnessId);
    if (!localTriangle || !sharedTriangle || localTriangle.phase !== "local" || sharedTriangle.phase !== "shared" || localTriangle.elementIndex !== sharedTriangle.elementIndex || localTriangle.faceIndex !== sharedTriangle.faceIndex || !closeVector(localTriangle.buildingPoint, sharedTriangle.buildingPoint)) fail("Mapped local/shared pixel must raycast the same actual source face point.");
    for (const key of ["local", "shared"] as const) {
      const sample = mapping[key], triangle = triangles.get(sample.triangleWitnessId);
      if (!triangle) return fail("Mapped submitted triangle missing.");
      const [u, v] = triangle.interpolatedAtlasUv, m = sample.textureTransform.matrix;
      const transformed = [m[0] * u + m[3] * v + m[6], m[1] * u + m[4] * v + m[7]];
      for (let axis = 0; axis < 2; axis += 1) {
        const mode = axis ? sample.textureTransform.wrapT : sample.textureTransform.wrapS;
        if (transformed[axis] < 0 || transformed[axis] > 1) transformed[axis] = mode === 1000 ? transformed[axis] - Math.floor(transformed[axis]) : mode === 1001 ? Math.max(0, Math.min(1, transformed[axis])) : Math.abs(Math.floor(transformed[axis]) % 2) === 1 ? Math.ceil(transformed[axis]) - transformed[axis] : transformed[axis] - Math.floor(transformed[axis]);
      }
      if (sample.textureTransform.flipY) transformed[1] = 1 - transformed[1];
      const pixel = transformed.map((value, axis) => Math.max(0, Math.min((axis ? atlas.heightPx : atlas.widthPx) - 1, Math.floor(value * (axis ? atlas.heightPx : atlas.widthPx)))));
      if (!closeVector(sample.transformedAtlasUv, transformed, 1e-6) || !same(sample.atlasPixel, pixel) || !same(sample.roiPixel, [pixel[0] - slot.rectPx.x, pixel[1] - slot.rectPx.y]) || sample.roiPixel[0] >= slot.rectPx.width || sample.roiPixel[1] >= slot.rectPx.height || !same(sample.presentedRgba, profilePixel(mapping, key === "local" ? "local-base-color-only" : "shared-base-color-only"))) fail("Actual ROI/PNG pixel is not linked to submitted transformed atlas UV.");
    }
    if (!same(mapping.flatNoShadow.localRgba, profilePixel(mapping, "local-flat-no-shadow")) || !same(mapping.flatNoShadow.sharedRgba, profilePixel(mapping, "shared-flat-no-shadow"))) fail("Flat pair pixel observation changed.");
    if (mapping.requestedBackend === "webgpu" && !same(mapping.local.baseColorRgba.slice(0, 3), mapping.shared.baseColorRgba.slice(0, 3)) && !same(mapping.local.presentedRgba.slice(0, 3), mapping.shared.presentedRgba.slice(0, 3))) changedMappedViews.add(mapping.viewName);
  }
  if (["rear", "right"].some((view) => !changedMappedViews.has(view))) fail("Actual rear/right mapped source color and presented RGB must change with phase.");
  return report;
}
