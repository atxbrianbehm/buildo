import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { R1AcceptanceCardSchema, R1SamplingReportSchema } from "../qa/r1BaselineContracts";
import {
  R1_MASONRY_CONDITIONS, R1_MASONRY_PRESETS, R1MasonryAppearanceReportSchema,
  R1MasonryGeometryCheckpointSchema, verifyR1MasonryAppearance,
  type R1MasonryAppearanceReport, type R1MasonryWallState
} from "../qa/r1MasonryAppearance";

const baselineFile = "docs/reviews/2026-10-14-r1-s4/acceptance-card.json";
const samplingFile = "docs/reviews/2026-10-14-r1-s4/sampling-report.json";
const baselineBytes = readFileSync(path.resolve(baselineFile));
const samplingBytes = readFileSync(path.resolve(samplingFile));
const hash = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const baseline = R1AcceptanceCardSchema.parse(JSON.parse(baselineBytes.toString("utf8")));
const sampling = R1SamplingReportSchema.parse(JSON.parse(samplingBytes.toString("utf8")));
const baselineRef = { file: baselineFile, sha256: hash(baselineBytes) };
const samplingRef = { file: samplingFile, sha256: hash(samplingBytes) };
const raw = { baseColor: hash("raw color"), normal: hash("raw normal"), orm: hash("raw orm"),
  height: hash("raw height"), opacity: hash("raw opacity") };
const labels = z.array(z.object({ batchId: z.string(), materialSlotId: z.string().nullable().optional() }).passthrough());

// Pixel counts and live-state hashes below are explicit synthetic contract inputs.
// The independently validated S4 controls, labels, source records and PNG hashes
// remain real; this fixture cannot establish new rendered appearance acceptance.
function makeReport(): R1MasonryAppearanceReport {
  const source = structuredClone(baseline.source);
  source.replayCard = { ...baselineRef };
  const wallSlots = new Set(baseline.materialAnchors.atlasManifest.slots.filter((slot) => slot.role === "wall").map((slot) => slot.id));
  const slot = baseline.materialAnchors.atlasManifest.slots.find((item) => item.id === "wall.primary")!;
  const wallSource = sampling.captures.find((capture) => capture.sourceName === "procedural")!.snapshot.sourceHashes
    .find((item) => item.sourceId === "source.wall.primary")!;
  const captures = R1_MASONRY_PRESETS.flatMap((preset) => {
    const original = baseline.captures.find((capture) => capture.snapshot.actualBackend === preset.requestedBackend &&
      capture.snapshot.viewName === preset.viewName && capture.snapshot.lightingName === preset.lightingName &&
      capture.snapshot.canvas.presentationMode === "textured")!;
    const wallLabels = labels.parse(original.snapshot.materials).filter((label) => label.materialSlotId && wallSlots.has(label.materialSlotId));
    const materialSlots = [...new Set(wallLabels.map((label) => label.materialSlotId!))].sort();
    return R1_MASONRY_CONDITIONS.map((condition, conditionIndex) => {
      const state: R1MasonryWallState = {
        condition, geometryHash: hash("independent pre-treatment geometry"), nonWallStateHash: hash("unchanged non-wall state"),
        wallMaterials: materialSlots.map((slotId) => ({ slotId,
          maps: { baseColor: raw.baseColor, normal: raw.normal, roughness: raw.orm, metalness: raw.orm, opacity: raw.opacity },
          color: [1, 1, 1], roughness: 0.7, metalness: 0.03, normalScale: [0.6, 0.6], otherPropertiesHash: hash(`other ${slotId}`)
        })),
        wallRenderables: wallLabels.map((label) => ({ batchId: label.batchId, receiveShadow: true, castShadow: true }))
      };
      for (const material of state.wallMaterials) {
        if (!["production", "restored-production"].includes(condition)) material.maps.normal = null;
        if (["base-color-only", "flat", "flat-no-shadow"].includes(condition)) {
          material.maps.roughness = material.maps.metalness = null;
          material.roughness = 0.82;
          material.metalness = 0;
        }
        if (condition === "flat" || condition === "flat-no-shadow") {
          material.maps.baseColor = null;
          // Independent standard sRGB transfer for authored #842d20.
          material.color = [132, 45, 32].map((byte) => ((byte / 255 + 0.055) / 1.055) ** 2.4) as [number, number, number];
          material.roughness = 0.82;
          material.metalness = 0;
        }
      }
      if (condition === "flat-no-shadow") state.wallRenderables.forEach((renderable) => { renderable.receiveShadow = false; });
      const snapshot = structuredClone(original.snapshot);
      snapshot.frameCount += 12 + conditionIndex;
      return { ...preset, condition, wallState: state, snapshot,
        screenshot: { ...original.screenshot, file: `${preset.requestedBackend}-${preset.viewName}-${preset.lightingName}-${condition}.png`,
          sha256: condition === "production" || condition === "restored-production" ? original.screenshot.sha256 : hash(condition) }
      };
    });
  });
  return R1MasonryAppearanceReportSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-appearance-discriminator", packetId: "synthetic-contract-fixture",
    createdAt: "2026-10-14T20:00:00.000Z", source, baseline: baselineRef, baselineSampling: samplingRef,
    controls: structuredClone(baseline.controls), resolvedSpec: structuredClone(baseline.resolvedSpec), identity: structuredClone(baseline.identity),
    materialAnchors: structuredClone(baseline.materialAnchors), freeze: structuredClone(baseline.freeze),
    geometryCheckpoint: { schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: baselineRef,
      sourceGraphHash: baseline.identity.sourceGraphHash, atlasContentHash: baseline.identity.atlasContentHash,
      geometryHash: hash("independent pre-treatment geometry"), atlasChannelDataHashes: raw,
      irTriangles: 11868, renderedTriangles: 61508, geometryBytes: 3444336, instanceCount: 118 },
    brickSourceModel: { sourceId: wallSource.sourceId, sourceWidthPx: 32, sourceHeightPx: 32,
      sourceContentHash: wallSource.contentHash, sourceRequestHash: wallSource.requestHash, sourceBaseColorSha256: hash("source RGBA"),
      physicalSizeM: structuredClone(slot.physicalSizeM), nominalCourseHeightM: 0.075, nominalCoursesPerTile: 12.8,
      brickWidthPx: 6, brickHeightPx: 3, mortarPx: 1, quantizedCourseHeightM: 0.09, quantizedMortarHeightM: 0.03,
      mortarPixelCount: 256, totalPixelCount: 1024, mortarPixelFraction: 0.25, packedRectPx: structuredClone(slot.rectPx),
      packedMortarPixelCount: 300, packedTotalPixelCount: 999, packedMortarPixelFraction: 300 / 999 },
    captures, pageErrors: [], humanReview: "pending",
    limitations: ["Synthetic contract inputs; source/nearest-pack quantization is not rendered building density.",
      "Map hashes cover raw texture bytes; S4 sampling channel hashes use encoded channel payloads."]
  });
}

const verify = (report: unknown) => verifyR1MasonryAppearance(report, baseline, baselineRef.sha256, { report: sampling, sha256: samplingRef.sha256 });
const treatment = (report: R1MasonryAppearanceReport, condition: R1MasonryWallState["condition"]) => report.captures.find((row) => row.condition === condition)!;

describe("R1 masonry appearance discriminator contracts", () => {
  it("accepts the complete matrix bound to real S4 source, presets, PNGs and independently frozen raw geometry/atlas hashes", () => {
    const report = makeReport();
    expect(verify(report).captures).toHaveLength(30);
    expect(report.brickSourceModel.quantizedCourseHeightM).toBe(0.09);
    expect(report.brickSourceModel.quantizedMortarHeightM).toBe(0.03);
  });

  it.each(["schemaVersion", "packetKind"] as const)("rejects an unsupported %s", (key) => {
    const report = makeReport();
    Object.assign(report, { [key]: "unsupported" });
    expect(() => verify(report)).toThrow();
  });

  it("rejects missing or duplicated cases even when the capture array still has thirty entries", () => {
    const missing = makeReport(); missing.captures.pop();
    const duplicate = makeReport(); duplicate.captures[29] = { ...duplicate.captures[0], screenshot: { ...duplicate.captures[0].screenshot, file: "duplicate.png" } };
    expect(() => verify(missing)).toThrow();
    expect(() => verify(duplicate)).toThrow(/30 distinct/);
  });

  it("rejects reused screenshot files and unknown capture fields", () => {
    const duplicate = makeReport(); duplicate.captures[1].screenshot.file = duplicate.captures[0].screenshot.file;
    const extra = makeReport(); Object.assign(extra.captures[0], { backendClaimWithoutEvidence: true });
    expect(() => verify(duplicate)).toThrow(/filenames/);
    expect(() => verify(extra)).toThrow();
  });

  it.each(["production", "restored-production"] as const)("requires the %s PNG to match S4", (condition) => {
    const report = makeReport(); treatment(report, condition).screenshot.sha256 = hash("different pixels");
    expect(() => verify(report)).toThrow(/PNG does not match S4/);
  });

  it.each(R1_MASONRY_PRESETS)("rejects stale constant submitted frames for $requestedBackend/$viewName/$lightingName", (preset) => {
    const report = makeReport();
    const rows = report.captures.filter((row) => row.requestedBackend === preset.requestedBackend &&
      row.viewName === preset.viewName && row.lightingName === preset.lightingName);
    rows.forEach((row) => { row.snapshot.frameCount = rows[0].snapshot.frameCount; });
    expect(() => verify(report)).toThrow(/strictly advance/);
  });

  it("rejects a backwards treatment frame even when capture array order is rearranged", () => {
    const report = makeReport();
    treatment(report, "normal-off").snapshot.frameCount = treatment(report, "production").snapshot.frameCount - 1;
    report.captures.reverse();
    expect(() => verify(report)).toThrow(/strictly advance/);
  });

  it.each(R1_MASONRY_PRESETS.flatMap((preset) => (["production", "base-color-only"] as const).map((reference) => ({ ...preset, reference }))))(
    "rejects flat pixels unchanged from $reference for $requestedBackend/$viewName/$lightingName", (preset) => {
      const report = makeReport();
      const rows = report.captures.filter((row) => row.requestedBackend === preset.requestedBackend &&
        row.viewName === preset.viewName && row.lightingName === preset.lightingName);
      rows.find((row) => row.condition === "flat")!.screenshot.sha256 = rows.find((row) => row.condition === preset.reference)!.screenshot.sha256;
      expect(() => verify(report)).toThrow(/Flat pixels must differ/);
    }
  );

  it("permits negligible normal/ORM/shadow pixel changes when frames advance and flat pixels prove the visible intervention", () => {
    const report = makeReport();
    for (const preset of R1_MASONRY_PRESETS) {
      const rows = report.captures.filter((row) => row.requestedBackend === preset.requestedBackend &&
        row.viewName === preset.viewName && row.lightingName === preset.lightingName);
      const productionHash = rows.find((row) => row.condition === "production")!.screenshot.sha256;
      rows.find((row) => row.condition === "normal-off")!.screenshot.sha256 = productionHash;
      rows.find((row) => row.condition === "base-color-only")!.screenshot.sha256 = productionHash;
      rows.find((row) => row.condition === "flat-no-shadow")!.screenshot.sha256 = rows.find((row) => row.condition === "flat")!.screenshot.sha256;
    }
    expect(() => verify(report)).not.toThrow();
  });

  it("rejects a coordinated change to all live geometry hashes against the independent checkpoint", () => {
    const report = makeReport(); report.captures.forEach((row) => { row.wallState.geometryHash = hash("mutually changed geometry"); });
    expect(() => verify(report)).toThrow(/pre-treatment checkpoint/);
  });

  it.each(["irTriangles", "renderedTriangles", "geometryBytes", "instanceCount"] as const)("rejects changed S4 checkpoint %s", (key) => {
    const report = makeReport(); Object.assign(report.geometryCheckpoint, { [key]: report.geometryCheckpoint[key] + 1 });
    expect(R1MasonryGeometryCheckpointSchema.safeParse(report.geometryCheckpoint).success).toBe(false);
  });

  it("rejects non-wall drift and cast-shadow changes in treatments", () => {
    const nonWall = makeReport(); treatment(nonWall, "normal-off").wallState.nonWallStateHash = hash("changed frames");
    const cast = makeReport(); treatment(cast, "flat-no-shadow").wallState.wallRenderables[0].castShadow = false;
    expect(() => verify(nonWall)).toThrow(/non-wall state/);
    expect(() => verify(cast)).toThrow(/named wall treatment/);
  });

  it("rejects a normal-off treatment that retains normals or removes another map", () => {
    const normal = makeReport(); treatment(normal, "normal-off").wallState.wallMaterials[0].maps.normal = raw.normal;
    const roughness = makeReport(); treatment(roughness, "normal-off").wallState.wallMaterials[0].maps.roughness = null;
    expect(() => verify(normal)).toThrow(/named wall treatment/);
    expect(() => verify(roughness)).toThrow(/named wall treatment/);
  });

  it("requires base-color-only to remove both ORM maps while retaining opacity", () => {
    const orm = makeReport(); treatment(orm, "base-color-only").wallState.wallMaterials[0].maps.metalness = raw.orm;
    const opacity = makeReport(); treatment(opacity, "base-color-only").wallState.wallMaterials[0].maps.opacity = null;
    expect(() => verify(orm)).toThrow(/named wall treatment/);
    expect(() => verify(opacity)).toThrow(/named wall treatment/);
  });

  it("sets base-color-only roughness/metalness explicitly instead of inheriting production scalars", () => {
    const roughness = makeReport(); treatment(roughness, "base-color-only").wallState.wallMaterials[0].roughness = 0.7;
    const metalness = makeReport(); treatment(metalness, "base-color-only").wallState.wallMaterials[0].metalness = 0.03;
    for (const report of [roughness, metalness]) expect(() => verify(report)).toThrow(/named wall treatment/);
  });

  it("requires flat source color in linear RGB, roughness 0.82 and metalness zero", () => {
    for (const change of [
      (material: R1MasonryWallState["wallMaterials"][number]) => { material.color = [132 / 255, 45 / 255, 32 / 255]; },
      (material: R1MasonryWallState["wallMaterials"][number]) => { material.roughness = 0.7; },
      (material: R1MasonryWallState["wallMaterials"][number]) => { material.metalness = 0.1; }
    ]) {
      const report = makeReport(); change(treatment(report, "flat").wallState.wallMaterials[0]);
      expect(() => verify(report)).toThrow(/named wall treatment/);
    }
  });

  it("keeps normalScale and all other material state exact, including after restoration", () => {
    const scale = makeReport(); treatment(scale, "flat").wallState.wallMaterials[0].normalScale[0] = 0.7;
    const other = makeReport(); treatment(other, "normal-off").wallState.wallMaterials[0].otherPropertiesHash = hash("opacity or sampling drift");
    const restore = makeReport(); treatment(restore, "restored-production").wallState.wallMaterials[0].color[0] = 0.9;
    for (const report of [scale, other, restore]) expect(() => verify(report)).toThrow(/named wall treatment/);
  });

  it("binds production maps to raw texture bytes rather than old encoded channel hashes", () => {
    const report = makeReport();
    const encoded = sampling.captures.find((row) => row.sourceName === "procedural")!.snapshot.channelHashes;
    for (const row of report.captures) {
      if (row.condition === "production" || row.condition === "restored-production") row.wallState.wallMaterials[0].maps.baseColor = encoded.baseColor;
      else if (row.condition === "normal-off" || row.condition === "base-color-only") row.wallState.wallMaterials[0].maps.baseColor = encoded.baseColor;
    }
    expect(() => verify(report)).toThrow(/raw atlas texture bytes/);
  });

  it("rejects missing, extra or duplicated wall targets", () => {
    const missing = makeReport(); missing.captures.forEach((row) => { row.wallState.wallRenderables.pop(); });
    const extra = makeReport(); extra.captures.forEach((row) => { row.wallState.wallRenderables.push({ batchId: "instances.frames", receiveShadow: row.condition !== "flat-no-shadow", castShadow: true }); });
    const duplicate = makeReport(); duplicate.captures[0].wallState.wallMaterials.push(structuredClone(duplicate.captures[0].wallState.wallMaterials[0]));
    expect(() => verify(missing)).toThrow();
    expect(() => verify(extra)).toThrow();
    expect(() => verify(duplicate)).toThrow(/unique/);
  });

  it.each(["camera", "key", "fill", "canvas", "materials"] as const)("rejects frozen snapshot %s drift", (key) => {
    const report = makeReport(); const snapshot = report.captures[0].snapshot;
    if (key === "camera") snapshot.camera.up[0] += 0.01;
    if (key === "key") snapshot.key.target[0] += 0.01;
    if (key === "fill") snapshot.fill.intensity += 0.01;
    if (key === "canvas") { snapshot.canvas.cssWidth /= 2; snapshot.canvas.devicePixelRatio *= 2; snapshot.canvas.cssHeight /= 2; }
    if (key === "materials") snapshot.materials[0].materialName = "changed label";
    expect(() => verify(report)).toThrow();
  });

  it("accepts nullable label IDs as JSON data while still rejecting changes from their frozen values", () => {
    const report = makeReport();
    Object.assign(report.captures[0].snapshot.materials[0], { materialSlotId: null, atlasSlotId: null, atlasContentHash: null });
    expect(R1MasonryAppearanceReportSchema.safeParse(report).success).toBe(true);
    expect(() => verify(report)).toThrow(/Frozen materials changed/);
  });

  it("rejects backend fallback, mislabeled presentation and PNG/canvas size disagreement", () => {
    const fallback = makeReport(); fallback.captures[0].snapshot.fallbackReason = "WebGPU unavailable";
    const backend = makeReport(); backend.captures[0].snapshot.actualBackend = "webgl";
    const clay = makeReport(); clay.captures[0].snapshot.canvas.presentationMode = "clay";
    const size = makeReport(); size.captures[0].screenshot.widthPx += 1;
    for (const report of [fallback, backend, clay, size]) expect(() => verify(report)).toThrow();
  });

  it("allows a fresh mount to restart its positive frame counter without weakening frozen camera or PNG checks", () => {
    const report = makeReport(); report.captures.forEach((row) => { row.snapshot.frameCount = R1_MASONRY_CONDITIONS.indexOf(row.condition) + 1; });
    expect(() => verify(report)).not.toThrow();
    report.captures[0].snapshot.frameCount = 0;
    expect(() => verify(report)).toThrow();
  });

  it("rejects changed baseline hashes and coordinated frozen input drift", () => {
    const cardHash = makeReport(); cardHash.baseline.sha256 = hash("old card"); cardHash.geometryCheckpoint.baseline.sha256 = cardHash.baseline.sha256;
    const samplingHash = makeReport(); samplingHash.baselineSampling.sha256 = hash("old sampling");
    const identity = makeReport(); identity.identity.catalogId = "changed";
    const freeze = makeReport(); freeze.freeze.views[0].position[0] += 1;
    for (const report of [cardHash, samplingHash, identity, freeze]) expect(() => verify(report)).toThrow();
  });

  it("allows only the two named archived diagnostic source changes and requires all original fingerprints", () => {
    const permitted = makeReport(); permitted.source.diagnosticFiles.find((row) => row.file === "scripts/diagnostics/r1-building-capture.mjs")!.sha256 = hash("new diagnostic exports");
    expect(() => verify(permitted)).not.toThrow();
    const unrelated = makeReport(); unrelated.source.diagnosticFiles.find((row) => row.file.endsWith("buildingCompiler.ts"))!.sha256 = hash("changed compiler");
    const missing = makeReport(); missing.source.diagnosticFiles = missing.source.diagnosticFiles.filter((row) => !row.file.endsWith("r1-building-capture.mjs"));
    const duplicate = makeReport(); duplicate.source.diagnosticFiles.push(structuredClone(duplicate.source.diagnosticFiles[0]));
    expect(() => verify(unrelated)).toThrow(/source fingerprint/);
    expect(() => verify(missing)).toThrow(/source fingerprint/);
    expect(() => verify(duplicate)).toThrow(/fingerprint paths/);
  });

  it.each(["nominalCoursesPerTile", "quantizedCourseHeightM", "quantizedMortarHeightM", "mortarPixelFraction", "packedMortarPixelFraction"] as const)("rejects inconsistent quantization %s", (key) => {
    const report = makeReport(); report.brickSourceModel[key] += 0.01;
    expect(() => verify(report)).toThrow(/arithmetically/);
  });

  it("rejects changed wall source, physical tile or packed ROI even with internally consistent counts", () => {
    const source = makeReport(); source.brickSourceModel.sourceContentHash = hash("new source");
    const roi = makeReport(); roi.brickSourceModel.packedRectPx.x += 1;
    const physical = makeReport(); physical.brickSourceModel.physicalSizeM.width = 1.2;
    for (const report of [source, roi, physical]) expect(() => verify(report)).toThrow();
  });

  it("rejects nonfinite state, page errors, acceptance claims and missing limitations", () => {
    const nan = makeReport(); nan.captures[0].wallState.wallMaterials[0].normalScale[0] = NaN;
    const errors = makeReport(); errors.pageErrors.push("shader compile error");
    const accepted = makeReport(); Object.assign(accepted, { humanReview: "pass" });
    const limitations = makeReport(); limitations.limitations = [];
    for (const report of [nan, errors, accepted, limitations]) expect(() => verify(report)).toThrow();
  });

  it("does not mutate the report, independent checkpoint or frozen baseline inputs", () => {
    const report = makeReport(); const before = JSON.stringify(report);
    const freezeDeep = (value: unknown): void => {
      if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freezeDeep); }
    };
    freezeDeep(report);
    freezeDeep(baseline);
    freezeDeep(sampling);
    expect(() => verify(report)).not.toThrow();
    expect(JSON.stringify(report)).toBe(before);
  });
});
