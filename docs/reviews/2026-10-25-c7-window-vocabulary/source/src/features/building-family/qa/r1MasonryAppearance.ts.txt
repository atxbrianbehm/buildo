import { z } from "zod";
import { canonicalJson } from "../core/canonicalJson";
import { R1AcceptanceCardSchema, R1BuildingSnapshotSchema, R1SamplingReportSchema } from "./r1BaselineContracts";

const finite = z.number().finite();
const sha256 = z.string().regex(/^[a-f\d]{64}$/);
const fileHash = z.object({ file: z.string().min(1), sha256 }).strict();
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
const close = (left: number, right: number, tolerance = 1e-12): boolean => Math.abs(left - right) <= tolerance;

export const R1_MASONRY_CONDITIONS = [
  "production", "normal-off", "base-color-only", "flat", "flat-no-shadow", "restored-production"
] as const;
export const R1_MASONRY_PRESETS = [
  { requestedBackend: "webgpu", viewName: "front", lightingName: "ordinary" },
  { requestedBackend: "webgpu", viewName: "three-quarter", lightingName: "ordinary" },
  { requestedBackend: "webgpu", viewName: "right", lightingName: "ordinary" },
  { requestedBackend: "webgpu", viewName: "three-quarter", lightingName: "raking" },
  { requestedBackend: "webgl", viewName: "three-quarter", lightingName: "ordinary" }
] as const;
export const R1_MASONRY_DIAGNOSTIC_SOURCE_EXCEPTIONS = [
  "scripts/diagnostics/r1-building-capture.mjs", "scripts/diagnostics/r1-baseline-browser.mjs"
] as const;

function linearChannel(byte: number): number {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
export const R1_MASONRY_FLAT_LINEAR_COLOR = Object.freeze([linearChannel(132), linearChannel(45), linearChannel(32)] as const);

const channelDataHashes = z.object({ baseColor: sha256, normal: sha256, orm: sha256, height: sha256, opacity: sha256 }).strict();

export const R1MasonryGeometryCheckpointSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-masonry-geometry-checkpoint"),
  baseline: fileHash, sourceGraphHash: sha256, atlasContentHash: sha256, geometryHash: sha256,
  atlasChannelDataHashes: channelDataHashes,
  irTriangles: z.literal(11868), renderedTriangles: z.literal(61508),
  geometryBytes: z.literal(3444336), instanceCount: z.literal(118)
}).strict();

const maps = z.object({ baseColor: sha256.nullable(), normal: sha256.nullable(),
  roughness: sha256.nullable(), metalness: sha256.nullable(), opacity: sha256.nullable() }).strict();
export const R1MasonryWallStateSchema = z.object({
  condition: z.enum(R1_MASONRY_CONDITIONS), geometryHash: sha256, nonWallStateHash: sha256,
  wallMaterials: z.array(z.object({
    slotId: z.string().min(1), maps, color: z.tuple([finite, finite, finite]),
    roughness: finite.min(0).max(1), metalness: finite.min(0).max(1),
    normalScale: z.tuple([finite, finite]), otherPropertiesHash: sha256
  }).strict()).min(1),
  wallRenderables: z.array(z.object({
    batchId: z.string().min(1), receiveShadow: z.boolean(), castShadow: z.boolean()
  }).strict()).min(1)
}).strict().superRefine((value, context) => {
  if (new Set(value.wallMaterials.map((material) => material.slotId)).size !== value.wallMaterials.length ||
      new Set(value.wallRenderables.map((renderable) => renderable.batchId)).size !== value.wallRenderables.length) {
    context.addIssue({ code: "custom", message: "Wall material slots and actual renderable names must be unique." });
  }
});
export type R1MasonryWallState = z.infer<typeof R1MasonryWallStateSchema>;

export const R1MasonryBrickSourceModelSchema = z.object({
  sourceId: z.literal("source.wall.primary"), sourceWidthPx: z.literal(32), sourceHeightPx: z.literal(32),
  sourceContentHash: sha256, sourceRequestHash: sha256, sourceBaseColorSha256: sha256,
  physicalSizeM: z.object({ width: finite.positive(), height: finite.positive() }).strict(),
  nominalCourseHeightM: z.literal(0.075), nominalCoursesPerTile: finite.positive(),
  brickWidthPx: z.literal(6), brickHeightPx: z.literal(3), mortarPx: z.literal(1),
  quantizedCourseHeightM: finite.positive(), quantizedMortarHeightM: finite.positive(),
  mortarPixelCount: z.number().int().positive(), totalPixelCount: z.number().int().positive(),
  mortarPixelFraction: finite.positive().lt(1),
  packedRectPx: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
    width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  packedMortarPixelCount: z.number().int().positive(), packedTotalPixelCount: z.number().int().positive(),
  packedMortarPixelFraction: finite.positive().lt(1)
}).strict().superRefine((value, context) => {
  if (!close(value.nominalCoursesPerTile, value.physicalSizeM.height / value.nominalCourseHeightM) ||
      !close(value.quantizedCourseHeightM, value.physicalSizeM.height * value.brickHeightPx / value.sourceHeightPx) ||
      !close(value.quantizedMortarHeightM, value.physicalSizeM.height * value.mortarPx / value.sourceHeightPx) ||
      value.totalPixelCount !== value.sourceWidthPx * value.sourceHeightPx ||
      value.packedTotalPixelCount !== value.packedRectPx.width * value.packedRectPx.height ||
      value.mortarPixelCount >= value.totalPixelCount || value.packedMortarPixelCount >= value.packedTotalPixelCount ||
      !close(value.mortarPixelFraction, value.mortarPixelCount / value.totalPixelCount) ||
      !close(value.packedMortarPixelFraction, value.packedMortarPixelCount / value.packedTotalPixelCount)) {
    context.addIssue({ code: "custom", message: "Brick quantization dimensions, counts and fractions must agree arithmetically." });
  }
});

const materialLabel = z.object({
  batchId: z.string().min(1), materialName: z.string(), materialType: z.string(),
  materialSlotId: z.string().nullable().optional(), atlasSlotId: z.string().nullable().optional(), atlasContentHash: sha256.nullable().optional()
}).strict();
const capture = z.object({
  requestedBackend: z.enum(["webgpu", "webgl"]), viewName: z.enum(["front", "three-quarter", "right"]),
  lightingName: z.enum(["ordinary", "raking"]), condition: z.enum(R1_MASONRY_CONDITIONS),
  screenshot: z.object({ file: z.string().min(1), sha256, widthPx: z.number().int().positive(), heightPx: z.number().int().positive() }).strict(),
  snapshot: R1BuildingSnapshotSchema.extend({ materials: z.array(materialLabel).min(1) }).strict(), wallState: R1MasonryWallStateSchema
}).strict();

function presetKey(value: { requestedBackend: string; viewName: string; lightingName: string }): string {
  return `${value.requestedBackend}/${value.viewName}/${value.lightingName}`;
}

function expectedState(production: R1MasonryWallState, condition: R1MasonryWallState["condition"]): R1MasonryWallState {
  const expected = structuredClone(production);
  expected.condition = condition;
  for (const material of expected.wallMaterials) {
    if (condition !== "production" && condition !== "restored-production") material.maps.normal = null;
    if (["base-color-only", "flat", "flat-no-shadow"].includes(condition)) {
      material.maps.roughness = null;
      material.maps.metalness = null;
      material.roughness = 0.82;
      material.metalness = 0;
    }
    if (condition === "flat" || condition === "flat-no-shadow") {
      material.maps.baseColor = null;
      material.color = [...R1_MASONRY_FLAT_LINEAR_COLOR];
      material.roughness = 0.82;
      material.metalness = 0;
    }
  }
  if (condition === "flat-no-shadow") for (const renderable of expected.wallRenderables) renderable.receiveShadow = false;
  return expected;
}

function stateMatches(actual: R1MasonryWallState, expected: R1MasonryWallState): boolean {
  if (actual.condition !== "flat" && actual.condition !== "flat-no-shadow") return same(actual, expected);
  return actual.wallMaterials.length === expected.wallMaterials.length &&
    actual.wallMaterials.every((material, index) => material.color.every((value, channel) =>
      close(value, expected.wallMaterials[index].color[channel], 1e-6))) &&
    same({ ...actual, wallMaterials: actual.wallMaterials.map((material) => ({ ...material, color: [] })) },
      { ...expected, wallMaterials: expected.wallMaterials.map((material) => ({ ...material, color: [] })) });
}

export const R1MasonryAppearanceReportSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-masonry-appearance-discriminator"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(),
  source: R1AcceptanceCardSchema.shape.source.extend({ diagnosticFiles: z.array(fileHash).min(1) }).strict(),
  baseline: fileHash, baselineSampling: fileHash,
  controls: R1AcceptanceCardSchema.shape.controls, resolvedSpec: R1AcceptanceCardSchema.shape.resolvedSpec,
  identity: R1AcceptanceCardSchema.shape.identity, materialAnchors: R1AcceptanceCardSchema.shape.materialAnchors,
  freeze: R1AcceptanceCardSchema.shape.freeze, geometryCheckpoint: R1MasonryGeometryCheckpointSchema,
  brickSourceModel: R1MasonryBrickSourceModelSchema, captures: z.array(capture).length(30),
  pageErrors: z.array(z.string()).length(0), humanReview: z.literal("pending"), limitations: z.array(z.string().min(1)).min(1)
}).strict().superRefine((value, context) => {
  const expectedCases = R1_MASONRY_PRESETS.flatMap((preset) => R1_MASONRY_CONDITIONS.map((condition) => `${presetKey(preset)}/${condition}`));
  const cases = value.captures.map((row) => `${presetKey(row)}/${row.condition}`);
  if (new Set(cases).size !== 30 || expectedCases.some((key) => !cases.includes(key))) {
    context.addIssue({ code: "custom", message: "Exactly all 30 distinct masonry preset/condition cases are required." });
  }
  if (new Set(value.captures.map((row) => row.screenshot.file)).size !== 30 ||
      new Set(value.source.diagnosticFiles.map((row) => row.file)).size !== value.source.diagnosticFiles.length) {
    context.addIssue({ code: "custom", message: "Capture filenames and source fingerprint paths must be unique." });
  }
  if (!same(value.baseline, value.geometryCheckpoint.baseline) ||
      value.identity.sourceGraphHash !== value.geometryCheckpoint.sourceGraphHash ||
      value.identity.atlasContentHash !== value.geometryCheckpoint.atlasContentHash) {
    context.addIssue({ code: "custom", message: "The independent geometry checkpoint must reference this S4 card/graph/atlas." });
  }
  const nonWallStateHash = value.captures[0]?.wallState.nonWallStateHash;
  for (const [index, row] of value.captures.entries()) {
    const snapshot = row.snapshot;
    if (snapshot.actualBackend !== row.requestedBackend || snapshot.canvas.backend !== row.requestedBackend ||
        snapshot.viewName !== row.viewName || snapshot.lightingName !== row.lightingName ||
        snapshot.canvas.presentationMode !== "textured" || snapshot.fallbackReason != null || row.wallState.condition !== row.condition ||
        row.screenshot.widthPx !== snapshot.canvas.width || row.screenshot.heightPx !== snapshot.canvas.height ||
        !close(snapshot.camera.aspect, snapshot.canvas.width / snapshot.canvas.height, 1e-6) ||
        !close(snapshot.canvas.cssWidth * snapshot.canvas.devicePixelRatio, snapshot.canvas.width, 1e-6) ||
        !close(snapshot.canvas.cssHeight * snapshot.canvas.devicePixelRatio, snapshot.canvas.height, 1e-6)) {
      context.addIssue({ code: "custom", path: ["captures", index], message: "Capture labels, actual backend, presentation and canvas dimensions must agree." });
    }
    if (row.wallState.geometryHash !== value.geometryCheckpoint.geometryHash || row.wallState.nonWallStateHash !== nonWallStateHash) {
      context.addIssue({ code: "custom", path: ["captures", index], message: "Geometry must match the pre-treatment checkpoint and non-wall state must remain unchanged." });
    }
  }
  for (const preset of R1_MASONRY_PRESETS) {
    const rows = value.captures.filter((row) => presetKey(row) === presetKey(preset));
    const production = rows.find((row) => row.condition === "production");
    if (!production) continue;
    const sequence = R1_MASONRY_CONDITIONS.map((condition) => rows.find((row) => row.condition === condition));
    for (let index = 1; index < sequence.length; index += 1) {
      const previous = sequence[index - 1];
      const current = sequence[index];
      if (previous && current && current.snapshot.frameCount <= previous.snapshot.frameCount) {
        context.addIssue({ code: "custom", path: ["captures", value.captures.indexOf(current), "snapshot", "frameCount"],
          message: `Submitted frame counts must strictly advance through treatments: ${presetKey(preset)}/${current.condition}.` });
      }
    }
    const flat = rows.find((row) => row.condition === "flat");
    const baseColorOnly = rows.find((row) => row.condition === "base-color-only");
    if (flat && baseColorOnly && (flat.screenshot.sha256 === production.screenshot.sha256 || flat.screenshot.sha256 === baseColorOnly.screenshot.sha256)) {
      context.addIssue({ code: "custom", path: ["captures", value.captures.indexOf(flat), "screenshot", "sha256"],
        message: `Flat pixels must differ from production and base-color-only: ${presetKey(preset)}.` });
    }
    for (const row of rows) {
      if (!stateMatches(row.wallState, expectedState(production.wallState, row.condition))) {
        context.addIssue({ code: "custom", message: `Only the named wall treatment may change state: ${presetKey(row)}/${row.condition}.` });
      }
    }
  }
});
export type R1MasonryAppearanceReport = z.infer<typeof R1MasonryAppearanceReportSchema>;

/** Pure evidence validation; callers supply independently read/hash-checked baseline files. */
export function verifyR1MasonryAppearance(
  input: unknown, baselineInput: unknown, baselineCardSha256: string,
  baselineSamplingInput: { report: unknown; sha256: string }
): R1MasonryAppearanceReport {
  const report = R1MasonryAppearanceReportSchema.parse(input);
  const baseline = R1AcceptanceCardSchema.parse(baselineInput);
  const sampling = R1SamplingReportSchema.parse(baselineSamplingInput.report);
  const fail = (message: string): never => { throw new Error(`R1 masonry appearance: ${message}`); };
  if (report.baseline.sha256 !== sha256.parse(baselineCardSha256) ||
      report.baselineSampling.sha256 !== sha256.parse(baselineSamplingInput.sha256)) fail("Baseline file hashes changed.");
  for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"] as const) {
    if (!same(report[key], baseline[key])) fail(`Frozen ${key} changed.`);
  }
  if (report.source.commit !== baseline.source.commit || report.source.trackedDiffSha256 !== baseline.source.trackedDiffSha256) {
    fail("Source commit or tracked patch changed.");
  }
  for (const old of baseline.source.diagnosticFiles) {
    const current = report.source.diagnosticFiles.find((row) => row.file === old.file);
    if (!current || (!R1_MASONRY_DIAGNOSTIC_SOURCE_EXCEPTIONS.some((file) => file === old.file) && current.sha256 !== old.sha256)) {
      fail(`Frozen source fingerprint changed or missing: ${old.file}.`);
    }
  }
  if (report.source.replayCard && !same(report.source.replayCard, report.baseline)) fail("Source replay card does not reference S4.");
  if (sampling.pageErrors.length || !same(sampling.controls, baseline.controls)) fail("Baseline sampling errors or controls mismatch.");
  const procedural = sampling.captures.filter((row) => row.sourceName === "procedural");
  if (procedural.some((row) => row.snapshot.atlasContentHash !== baseline.identity.atlasContentHash || row.snapshot.atlasId !== baseline.identity.atlasId)) {
    fail("Baseline sampling atlas identity changed.");
  }
  const model = report.brickSourceModel;
  const slot = baseline.materialAnchors.atlasManifest.slots.find((row) => row.materialSourceId === model.sourceId && row.role === "wall");
  if (!slot || !same(slot.physicalSizeM, model.physicalSizeM) || !same(slot.rectPx, model.packedRectPx)) fail("Brick model wall slot size or packed ROI changed.");
  for (const row of procedural) {
    const sources = row.snapshot.sourceHashes.filter((source) => source.sourceId === model.sourceId);
    if (sources.length !== 1 || sources[0].providerId !== "procedural" || sources[0].requestHash !== model.sourceRequestHash ||
        sources[0].contentHash !== model.sourceContentHash) fail("Brick model does not match the retained procedural wall source.");
  }
  const wallSlotIds = new Set(baseline.materialAnchors.atlasManifest.slots.filter((row) => row.role === "wall").map((row) => row.id));
  for (const row of report.captures) {
    const original = baseline.captures.find((candidate) => candidate.snapshot.actualBackend === row.requestedBackend &&
      candidate.snapshot.viewName === row.viewName && candidate.snapshot.lightingName === row.lightingName &&
      candidate.snapshot.canvas.presentationMode === "textured");
    if (!original) fail("No matching frozen S4 capture.");
    for (const key of ["camera", "key", "fill", "canvas", "materials"] as const) {
      if (!same(row.snapshot[key], original!.snapshot[key])) fail(`Frozen ${key} changed for ${presetKey(row)}.`);
    }
    if ((row.condition === "production" || row.condition === "restored-production") && row.screenshot.sha256 !== original!.screenshot.sha256) {
      fail(`Production/restoration PNG does not match S4: ${presetKey(row)}.`);
    }
    const labels = z.array(materialLabel).parse(original!.snapshot.materials);
    const wallLabels = labels.filter((label) => label.materialSlotId && wallSlotIds.has(label.materialSlotId));
    const expectedSlots = [...new Set(wallLabels.map((label) => label.materialSlotId!))].sort();
    const expectedRenderables = wallLabels.map((label) => label.batchId!).sort();
    if (!same(row.wallState.wallMaterials.map((material) => material.slotId).sort(), expectedSlots) ||
        !same(row.wallState.wallRenderables.map((renderable) => renderable.batchId).sort(), expectedRenderables)) {
      fail("Diagnostic wall targets do not match the actual S4 wall renderables/materials.");
    }
    if (row.condition === "production" || row.condition === "restored-production") {
      const raw = report.geometryCheckpoint.atlasChannelDataHashes;
      for (const material of row.wallState.wallMaterials) {
        if (material.maps.baseColor !== raw.baseColor || material.maps.normal !== raw.normal ||
            material.maps.roughness !== raw.orm || material.maps.metalness !== raw.orm ||
            (material.maps.opacity !== null && material.maps.opacity !== raw.opacity)) {
          fail("Production maps do not match the independently frozen raw atlas texture bytes.");
        }
      }
    }
  }
  return report;
}
