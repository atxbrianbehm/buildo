import { z } from "zod";
import { canonicalJson } from "../core/canonicalJson";
import { R1AcceptanceCardSchema, R1BuildingSnapshotSchema, R1SamplingReportSchema } from "./r1BaselineContracts";
import {
  R1_MASONRY_CONDITIONS, R1_MASONRY_FLAT_LINEAR_COLOR,
  R1MasonryGeometryCheckpointSchema, R1MasonryWallStateSchema, type R1MasonryWallState
} from "./r1MasonryAppearance";
import { R1MasonryCoverageDeltaSchema } from "./r1MasonryCoverage";

const sha256 = z.string().regex(/^[a-f\d]{64}$/);
const fileHash = z.object({ file: z.string().min(1), sha256 }).strict();
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
const close = (left: number, right: number, tolerance = 1e-12): boolean => Math.abs(left - right) <= tolerance;
const acceptedGeometryHash = "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e";

export const R1_WALL_SEAM_PRESETS = [
  { requestedBackend: "webgpu", viewName: "rear", lightingName: "raking" },
  { requestedBackend: "webgpu", viewName: "right", lightingName: "raking" },
  { requestedBackend: "webgl", viewName: "three-quarter", lightingName: "ordinary" }
] as const;

const materialLabel = z.object({
  batchId: z.string().min(1), materialName: z.string(), materialType: z.string(),
  materialSlotId: z.string().nullable().optional(), atlasSlotId: z.string().nullable().optional(), atlasContentHash: sha256.nullable().optional()
}).strict();
const capture = z.object({
  requestedBackend: z.enum(["webgpu", "webgl"]), viewName: z.enum(["rear", "right", "three-quarter"]),
  lightingName: z.enum(["ordinary", "raking"]), condition: z.enum(R1_MASONRY_CONDITIONS),
  screenshot: z.object({ file: z.string().min(1), sha256, widthPx: z.number().int().positive(), heightPx: z.number().int().positive() }).strict(),
  snapshot: R1BuildingSnapshotSchema.extend({ materials: z.array(materialLabel).min(1) }).strict(),
  wallState: R1MasonryWallStateSchema
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
    }
  }
  if (condition === "flat-no-shadow") for (const renderable of expected.wallRenderables) renderable.receiveShadow = false;
  return expected;
}

function stateMatches(actual: R1MasonryWallState, expected: R1MasonryWallState): boolean {
  if (actual.condition !== "flat" && actual.condition !== "flat-no-shadow") return same(actual, expected);
  // Three.js stores the standard sRGB transfer in linear floats. Only that
  // conversion gets the inherited 1e-6 comparison; every other state byte/hash
  // and scalar stays exact.
  return actual.wallMaterials.length === expected.wallMaterials.length &&
    actual.wallMaterials.every((material, index) => material.color.every((value, channel) =>
      close(value, expected.wallMaterials[index].color[channel], 1e-6))) &&
    same({ ...actual, wallMaterials: actual.wallMaterials.map((material) => ({ ...material, color: [] })) },
      { ...expected, wallMaterials: expected.wallMaterials.map((material) => ({ ...material, color: [] })) });
}

export const R1WallSeamReportSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-seam-discriminator"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(),
  source: R1AcceptanceCardSchema.shape.source.extend({ diagnosticFiles: z.array(fileHash).min(1) }).strict(),
  baseline: fileHash, baselineSampling: fileHash, materialBaseline: fileHash, attributionEvidence: fileHash,
  controls: R1AcceptanceCardSchema.shape.controls, resolvedSpec: R1AcceptanceCardSchema.shape.resolvedSpec,
  identity: R1AcceptanceCardSchema.shape.identity, materialAnchors: R1AcceptanceCardSchema.shape.materialAnchors,
  freeze: R1AcceptanceCardSchema.shape.freeze,
  geometryCheckpoint: R1MasonryGeometryCheckpointSchema.extend({ geometryHash: z.literal(acceptedGeometryHash) }),
  captures: z.array(capture).length(18), pageErrors: z.array(z.string()).length(0),
  humanReview: z.literal("pending"), limitations: z.array(z.string().min(1)).min(1)
}).strict().superRefine((value, context) => {
  const expectedCases = R1_WALL_SEAM_PRESETS.flatMap((preset) => R1_MASONRY_CONDITIONS.map((condition) => `${presetKey(preset)}/${condition}`));
  const cases = value.captures.map((row) => `${presetKey(row)}/${row.condition}`);
  if (new Set(cases).size !== 18 || expectedCases.some((key) => !cases.includes(key))) {
    context.addIssue({ code: "custom", message: "Exactly all 18 distinct wall-seam preset/condition cases are required." });
  }
  if (new Set(value.captures.map((row) => row.screenshot.file)).size !== 18 ||
      new Set(value.source.diagnosticFiles.map((row) => row.file)).size !== value.source.diagnosticFiles.length) {
    context.addIssue({ code: "custom", message: "Capture filenames and source fingerprint paths must be unique." });
  }
  if (!same(value.baseline, value.geometryCheckpoint.baseline) ||
      value.identity.sourceGraphHash !== value.geometryCheckpoint.sourceGraphHash ||
      value.identity.atlasContentHash !== value.geometryCheckpoint.atlasContentHash) {
    context.addIssue({ code: "custom", message: "The independent geometry checkpoint must reference this S6 card/graph/atlas." });
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
  for (const preset of R1_WALL_SEAM_PRESETS) {
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
export type R1WallSeamReport = z.infer<typeof R1WallSeamReportSchema>;

/** Pure serialized validation; callers independently read/hash-check files and
 * validate the actual source/geometry/pixel-ray attribution evidence. */
export function verifyR1WallSeamReport(
  input: unknown, baselineInput: unknown, baselineCardSha256: string,
  baselineSamplingInput: { report: unknown; sha256: string },
  materialBaselineInput: { report: unknown; sha256: string }
): R1WallSeamReport {
  const report = R1WallSeamReportSchema.parse(input);
  const baseline = R1AcceptanceCardSchema.parse(baselineInput);
  const sampling = R1SamplingReportSchema.parse(baselineSamplingInput.report);
  const material = R1MasonryCoverageDeltaSchema.parse(materialBaselineInput.report);
  const fail = (message: string): never => { throw new Error(`R1 wall seams: ${message}`); };
  if (report.baseline.sha256 !== sha256.parse(baselineCardSha256) ||
      report.baselineSampling.sha256 !== sha256.parse(baselineSamplingInput.sha256) ||
      report.materialBaseline.sha256 !== sha256.parse(materialBaselineInput.sha256)) fail("Baseline file hashes changed.");
  for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"] as const) {
    if (!same(report[key], baseline[key])) fail(`Frozen ${key} changed.`);
  }
  if (report.source.commit !== baseline.source.commit || report.source.trackedDiffSha256 !== baseline.source.trackedDiffSha256) {
    fail("Source commit or tracked patch changed.");
  }
  for (const old of baseline.source.diagnosticFiles) {
    const current = report.source.diagnosticFiles.find((row) => row.file === old.file);
    if (!current || current.sha256 !== old.sha256) fail(`Frozen source fingerprint changed or missing: ${old.file}.`);
  }
  if (report.source.replayCard && !same(report.source.replayCard, report.baseline)) fail("Source replay card does not reference S6.");
  if (baseline.pageErrors.length || sampling.pageErrors.length || !same(sampling.controls, baseline.controls)) {
    fail("Baseline sampling errors or controls mismatch.");
  }
  if (sampling.source.commit !== baseline.source.commit || sampling.source.trackedDiffSha256 !== baseline.source.trackedDiffSha256 ||
      new Set(sampling.source.diagnosticFiles.map((row) => row.file)).size !== sampling.source.diagnosticFiles.length ||
      baseline.source.diagnosticFiles.some((old) => !sampling.source.diagnosticFiles.some((row) => row.file === old.file && row.sha256 === old.sha256))) {
    fail("Baseline sampling source/graph fingerprints changed.");
  }
  const { atlasContentHash: ignoredAtlasHash, ...identityWithoutAtlasHash } = baseline.identity;
  void ignoredAtlasHash;
  if (material.after.atlasContentHash !== baseline.identity.atlasContentHash ||
      !same(material.immutable.identity, identityWithoutAtlasHash) ||
      !same(material.immutable.controls, baseline.controls) || !same(material.immutable.resolvedSpec, baseline.resolvedSpec) ||
      !same(material.immutable.materialAnchors, baseline.materialAnchors) || !same(material.immutable.freeze, baseline.freeze) ||
      material.immutable.geometryHash !== report.geometryCheckpoint.geometryHash ||
      !same(material.after.channelDataHashes, report.geometryCheckpoint.atlasChannelDataHashes)) {
    fail("Accepted S6 material baseline graph/geometry/anchors/raw channel hashes changed.");
  }
  const procedural = sampling.captures.filter((row) => row.sourceName === "procedural");
  if (procedural.length !== 2 || procedural.some((row) =>
    row.snapshot.atlasContentHash !== baseline.identity.atlasContentHash || row.snapshot.atlasId !== baseline.identity.atlasId ||
    !same(row.snapshot.sourceHashes, material.after.sourceHashes) || !same(row.snapshot.channelHashes, material.after.channelHashes))) {
    fail("Baseline procedural sampling atlas/source/channel identity changed.");
  }
  const wallSlotIds = new Set(baseline.materialAnchors.atlasManifest.slots.filter((row) => row.role === "wall").map((row) => row.id));
  for (const row of report.captures) {
    const original = baseline.captures.find((candidate) => candidate.snapshot.actualBackend === row.requestedBackend &&
      candidate.snapshot.viewName === row.viewName && candidate.snapshot.lightingName === row.lightingName &&
      candidate.snapshot.canvas.presentationMode === "textured");
    if (!original) fail("No matching frozen S6 capture.");
    for (const key of ["camera", "key", "fill", "canvas", "materials"] as const) {
      if (!same(row.snapshot[key], original!.snapshot[key])) fail(`Frozen ${key} changed for ${presetKey(row)}.`);
    }
    if ((row.condition === "production" || row.condition === "restored-production") && row.screenshot.sha256 !== original!.screenshot.sha256) {
      fail(`Production/restoration PNG does not match S6: ${presetKey(row)}.`);
    }
    const labels = z.array(materialLabel).parse(original!.snapshot.materials);
    const wallLabels = labels.filter((label) => label.materialSlotId && wallSlotIds.has(label.materialSlotId));
    const expectedSlots = [...new Set(wallLabels.map((label) => label.materialSlotId!))].sort();
    const expectedRenderables = wallLabels.map((label) => label.batchId).sort();
    if (!same(row.wallState.wallMaterials.map((item) => item.slotId).sort(), expectedSlots) ||
        !same(row.wallState.wallRenderables.map((item) => item.batchId).sort(), expectedRenderables)) {
      fail("Diagnostic wall targets do not match the actual S6 wall renderables/materials.");
    }
    if (row.condition === "production" || row.condition === "restored-production") {
      const raw = report.geometryCheckpoint.atlasChannelDataHashes;
      for (const item of row.wallState.wallMaterials) {
        if (item.maps.baseColor !== raw.baseColor || item.maps.normal !== raw.normal ||
            item.maps.roughness !== raw.orm || item.maps.metalness !== raw.orm ||
            (item.maps.opacity !== null && item.maps.opacity !== raw.opacity)) {
          fail("Production maps do not match the accepted raw atlas texture bytes.");
        }
      }
    }
  }
  return report;
}
