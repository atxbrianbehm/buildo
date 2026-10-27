import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { R1AcceptanceCardSchema, R1SamplingReportSchema } from "../qa/r1BaselineContracts";
import { R1_MASONRY_CONDITIONS, type R1MasonryWallState } from "../qa/r1MasonryAppearance";
import { R1MasonryCoverageDeltaSchema } from "../qa/r1MasonryCoverage";
import { R1_WALL_SEAM_PRESETS, R1WallSeamReportSchema, verifyR1WallSeamReport, type R1WallSeamReport } from "../qa/r1WallSeams";

const directory = "docs/reviews/2026-10-14-r1-s6-verified/";
const hash = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
function readEvidence(file: string) {
  const bytes = readFileSync(path.resolve(directory + file));
  return { input: JSON.parse(bytes.toString("utf8")) as unknown, ref: { file: directory + file, sha256: hash(bytes) } };
}
const cardFile = readEvidence("acceptance-card.json");
const samplingFile = readEvidence("sampling-report.json");
const materialFile = readEvidence("material-baseline-delta.json");
const baseline = R1AcceptanceCardSchema.parse(cardFile.input);
const sampling = R1SamplingReportSchema.parse(samplingFile.input);
const material = R1MasonryCoverageDeltaSchema.parse(materialFile.input);
const raw = material.after.channelDataHashes;
const labels = z.array(z.object({ batchId: z.string(), materialSlotId: z.string().nullable().optional() }).passthrough());

// Only live-state/attribution hashes and treatment PNG hashes below are explicit
// synthetic contract inputs. S6 controls, source fingerprints, actual material
// hashes, geometry hash/counts and production PNG hashes are durable real files.
// This fixture cannot establish new rendered diagnostic or human acceptance.
function makeReport(): R1WallSeamReport {
  const source = structuredClone(baseline.source);
  source.replayCard = { ...cardFile.ref };
  source.diagnosticFiles.push({ file: "src/features/building-family/qa/r1WallSeams.ts", sha256: hash("synthetic new QA fingerprint") });
  const wallSlots = new Set(baseline.materialAnchors.atlasManifest.slots.filter((slot) => slot.role === "wall").map((slot) => slot.id));
  const captures = R1_WALL_SEAM_PRESETS.flatMap((preset) => {
    const original = baseline.captures.find((row) => row.snapshot.actualBackend === preset.requestedBackend &&
      row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName && row.snapshot.canvas.presentationMode === "textured")!;
    const wallLabels = labels.parse(original.snapshot.materials).filter((label) => label.materialSlotId && wallSlots.has(label.materialSlotId));
    const slotIds = [...new Set(wallLabels.map((label) => label.materialSlotId!))].sort();
    return R1_MASONRY_CONDITIONS.map((condition, index) => {
      const state: R1MasonryWallState = {
        condition, geometryHash: material.immutable.geometryHash, nonWallStateHash: hash("synthetic unchanged non-wall state"),
        wallMaterials: slotIds.map((slotId) => ({ slotId,
          maps: { baseColor: raw.baseColor, normal: raw.normal, roughness: raw.orm, metalness: raw.orm, opacity: raw.opacity },
          color: [1, 1, 1], roughness: 0.7, metalness: 0.03, normalScale: [0.6, 0.6], otherPropertiesHash: hash(`synthetic other ${slotId}`)
        })),
        wallRenderables: wallLabels.map((label) => ({ batchId: label.batchId, receiveShadow: true, castShadow: true }))
      };
      for (const item of state.wallMaterials) {
        if (condition !== "production" && condition !== "restored-production") item.maps.normal = null;
        if (["base-color-only", "flat", "flat-no-shadow"].includes(condition)) {
          item.maps.roughness = item.maps.metalness = null;
          item.roughness = 0.82;
          item.metalness = 0;
        }
        if (condition === "flat" || condition === "flat-no-shadow") {
          item.maps.baseColor = null;
          // Independent standard sRGB transfer for authored #842d20.
          item.color = [132, 45, 32].map((byte) => ((byte / 255 + 0.055) / 1.055) ** 2.4) as [number, number, number];
        }
      }
      if (condition === "flat-no-shadow") state.wallRenderables.forEach((item) => { item.receiveShadow = false; });
      const snapshot = structuredClone(original.snapshot);
      snapshot.frameCount = index + 1;
      return { ...preset, condition, wallState: state, snapshot,
        screenshot: { ...original.screenshot, file: `${preset.requestedBackend}-${preset.viewName}-${preset.lightingName}-${condition}.png`,
          sha256: condition === "production" || condition === "restored-production" ? original.screenshot.sha256 : hash(`synthetic ${condition}`) }
      };
    });
  });
  return R1WallSeamReportSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-seam-discriminator", packetId: "synthetic-contract-fixture",
    createdAt: "2026-10-14T20:00:00.000Z", source, baseline: cardFile.ref, baselineSampling: samplingFile.ref,
    materialBaseline: materialFile.ref, attributionEvidence: { file: "synthetic-attribution.json", sha256: hash("synthetic attribution evidence") },
    controls: structuredClone(baseline.controls), resolvedSpec: structuredClone(baseline.resolvedSpec), identity: structuredClone(baseline.identity),
    materialAnchors: structuredClone(baseline.materialAnchors), freeze: structuredClone(baseline.freeze),
    geometryCheckpoint: { schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: cardFile.ref,
      sourceGraphHash: baseline.identity.sourceGraphHash, atlasContentHash: baseline.identity.atlasContentHash,
      geometryHash: material.immutable.geometryHash, atlasChannelDataHashes: raw,
      irTriangles: 11868, renderedTriangles: 61508, geometryBytes: 3444336, instanceCount: 118 },
    captures, pageErrors: [], humanReview: "pending",
    limitations: ["Synthetic treatment/live-state hashes validate contracts only; actual pixels/rays require separately validated attribution evidence."]
  });
}

const verify = (report: unknown, sampleInput: unknown = sampling, materialInput: unknown = material) => verifyR1WallSeamReport(
  report, baseline, cardFile.ref.sha256, { report: sampleInput, sha256: samplingFile.ref.sha256 }, { report: materialInput, sha256: materialFile.ref.sha256 }
);
const treatment = (report: R1WallSeamReport, condition: R1MasonryWallState["condition"]) => report.captures.find((row) => row.condition === condition)!;

describe("R1 rear/right wall-seam discriminator contracts", () => {
  it("binds exactly eighteen cases to real S6 controls, source, geometry, material channels and production PNGs", () => {
    const report = makeReport();
    expect(verify(report).captures).toHaveLength(18);
    expect(report.geometryCheckpoint.geometryHash).toBe("4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e");
    expect(R1_WALL_SEAM_PRESETS).toEqual([
      { requestedBackend: "webgpu", viewName: "rear", lightingName: "raking" },
      { requestedBackend: "webgpu", viewName: "right", lightingName: "raking" },
      { requestedBackend: "webgl", viewName: "three-quarter", lightingName: "ordinary" }
    ]);
  });

  it.each(["schemaVersion", "packetKind"] as const)("rejects unsupported %s", (key) => {
    const report = makeReport(); Object.assign(report, { [key]: "unsupported" });
    expect(() => verify(report)).toThrow();
  });

  it("requires versioned evidence references and rejects old brickSourceModel or unknown capture fields", () => {
    const attribution = makeReport(); Object.assign(attribution, { attributionEvidence: undefined });
    const materialRef = makeReport(); materialRef.materialBaseline.sha256 = "invalid";
    const obsolete = makeReport(); Object.assign(obsolete, { brickSourceModel: {} });
    const unknown = makeReport(); Object.assign(unknown.captures[0], { unsupportedClaim: true });
    for (const report of [attribution, materialRef, obsolete, unknown]) expect(() => verify(report)).toThrow();
  });

  it("rejects missing/duplicated labels, substituted presets and reused screenshot files", () => {
    const missing = makeReport(); missing.captures.pop();
    const duplicate = makeReport(); duplicate.captures[17] = structuredClone(duplicate.captures[0]); duplicate.captures[17].screenshot.file = "different.png";
    const substitute = makeReport(); substitute.captures[0].lightingName = "ordinary";
    const filename = makeReport(); filename.captures[1].screenshot.file = filename.captures[0].screenshot.file;
    expect(() => verify(missing)).toThrow();
    expect(() => verify(duplicate)).toThrow(/18 distinct/);
    expect(() => verify(substitute)).toThrow(/18 distinct/);
    expect(() => verify(filename)).toThrow(/filenames/);
  });

  it.each(["production", "restored-production"] as const)("requires %s PNGs to match the corresponding accepted S6 view", (condition) => {
    const report = makeReport(); treatment(report, condition).screenshot.sha256 = hash("different pixels");
    expect(() => verify(report)).toThrow(/PNG does not match S6/);
  });

  it.each(R1_WALL_SEAM_PRESETS)("rejects stale counters for $requestedBackend/$viewName/$lightingName", (preset) => {
    const report = makeReport();
    report.captures.filter((row) => row.requestedBackend === preset.requestedBackend && row.viewName === preset.viewName && row.lightingName === preset.lightingName)
      .forEach((row) => { row.snapshot.frameCount = 1; });
    expect(() => verify(report)).toThrow(/strictly advance/);
  });

  it("checks named treatment order independently of capture-array order and accepts fresh positive mount counters", () => {
    const report = makeReport(); report.captures.reverse();
    expect(() => verify(report)).not.toThrow();
    treatment(report, "normal-off").snapshot.frameCount = treatment(report, "production").snapshot.frameCount - 1;
    expect(() => verify(report)).toThrow();
  });

  it.each(R1_WALL_SEAM_PRESETS.flatMap((preset) => (["production", "base-color-only"] as const).map((reference) => ({ ...preset, reference }))))(
    "requires flat visible pixels to differ from $reference for $requestedBackend/$viewName/$lightingName", (preset) => {
      const report = makeReport(); const rows = report.captures.filter((row) => row.requestedBackend === preset.requestedBackend && row.viewName === preset.viewName);
      rows.find((row) => row.condition === "flat")!.screenshot.sha256 = rows.find((row) => row.condition === preset.reference)!.screenshot.sha256;
      expect(() => verify(report)).toThrow(/Flat pixels must differ/);
    }
  );

  it("does not require a visible normal/ORM/shadow difference when submitted frames and flat pixels prove treatment", () => {
    const report = makeReport();
    for (const preset of R1_WALL_SEAM_PRESETS) {
      const rows = report.captures.filter((row) => row.requestedBackend === preset.requestedBackend && row.viewName === preset.viewName);
      const productionHash = rows.find((row) => row.condition === "production")!.screenshot.sha256;
      rows.find((row) => row.condition === "normal-off")!.screenshot.sha256 = productionHash;
      rows.find((row) => row.condition === "base-color-only")!.screenshot.sha256 = productionHash;
      rows.find((row) => row.condition === "flat-no-shadow")!.screenshot.sha256 = rows.find((row) => row.condition === "flat")!.screenshot.sha256;
    }
    expect(() => verify(report)).not.toThrow();
  });

  it.each(["irTriangles", "renderedTriangles", "geometryBytes", "instanceCount"] as const)("rejects changed checkpoint %s", (key) => {
    const report = makeReport(); Object.assign(report.geometryCheckpoint, { [key]: report.geometryCheckpoint[key] + 1 });
    expect(() => verify(report)).toThrow();
  });

  it("rejects a coordinated geometry change in all rows and the independent checkpoint", () => {
    const report = makeReport(); const wrong = hash("coordinated changed geometry");
    Object.assign(report.geometryCheckpoint, { geometryHash: wrong }); report.captures.forEach((row) => { row.wallState.geometryHash = wrong; });
    expect(() => verify(report)).toThrow();
  });

  it("rejects per-row geometry and non-wall drift", () => {
    const geometry = makeReport(); treatment(geometry, "normal-off").wallState.geometryHash = hash("changed geometry");
    const nonWall = makeReport(); treatment(nonWall, "flat").wallState.nonWallStateHash = hash("changed frames");
    for (const report of [geometry, nonWall]) expect(() => verify(report)).toThrow(/pre-treatment checkpoint|non-wall state/);
  });

  it("rejects normal-off retaining normals or changing base color/ORM/opacity", () => {
    for (const map of ["normal", "baseColor", "roughness", "metalness", "opacity"] as const) {
      const report = makeReport(); treatment(report, "normal-off").wallState.wallMaterials[0].maps[map] = map === "normal" ? raw.normal : null;
      expect(() => verify(report)).toThrow(/named wall treatment/);
    }
  });

  it("requires both ORM maps removed and exact flat/base-color-only scalars while retaining opacity", () => {
    for (const condition of ["base-color-only", "flat", "flat-no-shadow"] as const) {
      for (const mutate of [
        (item: R1MasonryWallState["wallMaterials"][number]) => { item.maps.metalness = raw.orm; },
        (item: R1MasonryWallState["wallMaterials"][number]) => { item.roughness = 0.7; },
        (item: R1MasonryWallState["wallMaterials"][number]) => { item.metalness = 0.03; },
        (item: R1MasonryWallState["wallMaterials"][number]) => { item.maps.opacity = null; }
      ]) {
        const report = makeReport(); mutate(treatment(report, condition).wallState.wallMaterials[0]);
        expect(() => verify(report)).toThrow(/named wall treatment/);
      }
    }
  });

  it("requires authored flat linear RGB and keeps normalScale, other properties, casting and restoration exact", () => {
    const color = makeReport(); treatment(color, "flat").wallState.wallMaterials[0].color = [132 / 255, 45 / 255, 32 / 255];
    const scale = makeReport(); treatment(scale, "flat").wallState.wallMaterials[0].normalScale[0] += 0.1;
    const other = makeReport(); treatment(other, "normal-off").wallState.wallMaterials[0].otherPropertiesHash = hash("changed opacity or texture flags");
    const cast = makeReport(); treatment(cast, "flat-no-shadow").wallState.wallRenderables[0].castShadow = false;
    const restored = makeReport(); treatment(restored, "restored-production").wallState.wallMaterials[0].color[0] = 0.9;
    const receive = makeReport(); treatment(receive, "flat-no-shadow").wallState.wallRenderables[0].receiveShadow = true;
    for (const report of [color, scale, other, cast, restored, receive]) expect(() => verify(report)).toThrow(/named wall treatment/);
  });

  it("binds all production maps to accepted raw atlas bytes and rejects coordinated raw-hash forgery", () => {
    const encoded = makeReport();
    for (const row of encoded.captures) if (row.wallState.wallMaterials[0].maps.baseColor !== null) row.wallState.wallMaterials[0].maps.baseColor = material.after.channelHashes.baseColor;
    const coordinated = makeReport(); const wrong = hash("coordinated fake raw atlas");
    coordinated.geometryCheckpoint.atlasChannelDataHashes.baseColor = wrong;
    for (const row of coordinated.captures) if (row.wallState.wallMaterials[0].maps.baseColor !== null) row.wallState.wallMaterials[0].maps.baseColor = wrong;
    expect(() => verify(encoded)).toThrow(/raw atlas texture bytes/);
    expect(() => verify(coordinated)).toThrow(/raw channel hashes/);
  });

  it("rejects missing, extra or duplicate material/renderable targets, including a storefront trim target", () => {
    const missing = makeReport(); missing.captures.forEach((row) => { row.wallState.wallRenderables.pop(); });
    const extra = makeReport(); extra.captures.forEach((row) => { row.wallState.wallRenderables.push({ batchId: "instances.frames", receiveShadow: row.condition !== "flat-no-shadow", castShadow: true }); });
    const duplicate = makeReport(); duplicate.captures[0].wallState.wallMaterials.push(structuredClone(duplicate.captures[0].wallState.wallMaterials[0]));
    const trim = makeReport(); trim.captures.forEach((row) => { row.wallState.wallMaterials[0].slotId = "trim.horizontal.primary"; });
    for (const report of [missing, extra, duplicate, trim]) expect(() => verify(report)).toThrow();
  });

  it.each(["camera", "key", "fill", "canvas", "materials"] as const)("rejects frozen %s drift", (key) => {
    const report = makeReport(); const snapshot = report.captures[0].snapshot;
    if (key === "camera") snapshot.camera.up[0] += 0.01;
    if (key === "key") snapshot.key.target[0] += 0.01;
    if (key === "fill") snapshot.fill.intensity += 0.01;
    if (key === "canvas") { snapshot.canvas.cssWidth /= 2; snapshot.canvas.cssHeight /= 2; snapshot.canvas.devicePixelRatio *= 2; }
    if (key === "materials") snapshot.materials[0].materialName = "changed label";
    expect(() => verify(report)).toThrow(/Frozen/);
  });

  it("rejects fallback, wrong backend/presentation, material atlas label drift and PNG/canvas size disagreement", () => {
    const fallback = makeReport(); fallback.captures[0].snapshot.fallbackReason = "WebGPU unavailable";
    const backend = makeReport(); backend.captures[0].snapshot.actualBackend = "webgl";
    const clay = makeReport(); clay.captures[0].snapshot.canvas.presentationMode = "clay";
    const atlas = makeReport(); atlas.captures[0].snapshot.materials[0].atlasContentHash = hash("changed atlas");
    const size = makeReport(); size.captures[0].screenshot.widthPx += 1;
    for (const report of [fallback, backend, clay, atlas, size]) expect(() => verify(report)).toThrow();
  });

  it.each(["baseline", "baselineSampling", "materialBaseline"] as const)("requires the independently read %s file hash", (key) => {
    const report = makeReport(); report[key].sha256 = hash("wrong file");
    if (key === "baseline") report.geometryCheckpoint.baseline.sha256 = report.baseline.sha256;
    expect(() => verify(report)).toThrow(/file hashes/);
  });

  it.each(["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"] as const)("rejects frozen %s input drift", (key) => {
    const report = makeReport();
    if (key === "controls") report.controls.bayCount += 1;
    if (key === "resolvedSpec") report.resolvedSpec.facade.frontBayCount += 1;
    if (key === "identity") report.identity.catalogId = "changed catalog";
    if (key === "materialAnchors") report.materialAnchors.atlasManifest.slots[0].physicalSizeM.width += 1;
    if (key === "freeze") report.freeze.views[0].position[0] += 1;
    expect(() => verify(report)).toThrow(/Frozen/);
  });

  it("allows new unique source records but freezes every inherited S6 record, including old S5 exemptions", () => {
    expect(() => verify(makeReport())).not.toThrow();
    for (const file of ["scripts/diagnostics/r1-building-capture.mjs", "scripts/diagnostics/r1-baseline-browser.mjs", "src/features/building-family/compiler/buildingCompiler.ts"]) {
      const report = makeReport(); report.source.diagnosticFiles.find((row) => row.file === file)!.sha256 = hash("changed frozen source");
      expect(() => verify(report)).toThrow(/source fingerprint/);
    }
    const missing = makeReport(); missing.source.diagnosticFiles.shift();
    const duplicate = makeReport(); duplicate.source.diagnosticFiles.push(structuredClone(duplicate.source.diagnosticFiles[0]));
    expect(() => verify(missing)).toThrow(/source fingerprint/);
    expect(() => verify(duplicate)).toThrow(/fingerprint paths/);
  });

  it("requires unchanged HEAD/tracked patch and a replay reference to S6", () => {
    const head = makeReport(); head.source.commit = "a".repeat(40);
    const patch = makeReport(); patch.source.trackedDiffSha256 = hash("changed patch");
    const replay = makeReport(); replay.source.replayCard = structuredClone(baseline.source.replayCard);
    expect(() => verify(head)).toThrow(/commit or tracked patch/);
    expect(() => verify(patch)).toThrow(/commit or tracked patch/);
    expect(() => verify(replay)).toThrow(/reference S6/);
  });

  it("binds both procedural sampling backends to accepted source, channel, atlas and control identities", () => {
    for (const index of sampling.captures.map((row, index) => row.sourceName === "procedural" ? index : -1).filter((index) => index >= 0)) {
      const source = structuredClone(sampling); source.captures[index].snapshot.sourceHashes[0].contentHash = hash("changed source");
      const channel = structuredClone(sampling); channel.captures[index].snapshot.channelHashes.normal = hash("changed encoded normal");
      const atlas = structuredClone(sampling); atlas.captures[index].snapshot.atlasContentHash = hash("changed atlas");
      for (const input of [source, channel, atlas]) expect(() => verify(makeReport(), input)).toThrow(/sampling atlas\/source\/channel/);
    }
    const controls = structuredClone(sampling); controls.controls.bayCount += 1;
    const graphSource = structuredClone(sampling); graphSource.source.diagnosticFiles.find((row) => row.file.endsWith("buildingGraphBuilder.ts"))!.sha256 = hash("changed graph source");
    expect(() => verify(makeReport(), controls)).toThrow(/controls mismatch/);
    expect(() => verify(makeReport(), graphSource)).toThrow(/source\/graph fingerprints/);
  });

  it("rejects material baseline version/graph mismatch even when report state is self-consistent", () => {
    const version = structuredClone(material); Object.assign(version, { schemaVersion: "unsupported" });
    const graph = structuredClone(material); graph.immutable.identity.sourceGraphHash = hash("changed graph");
    expect(() => verify(makeReport(), sampling, version)).toThrow();
    expect(() => verify(makeReport(), sampling, graph)).toThrow(/material baseline graph/);
  });

  it("rejects nonfinite state, page errors, human acceptance claims and missing limitations", () => {
    const nonfinite = makeReport(); nonfinite.captures[0].wallState.wallMaterials[0].normalScale[0] = NaN;
    const errors = makeReport(); errors.pageErrors.push("shader error");
    const accepted = makeReport(); Object.assign(accepted, { humanReview: "pass" });
    const limitations = makeReport(); limitations.limitations = [];
    for (const report of [nonfinite, errors, accepted, limitations]) expect(() => verify(report)).toThrow();
  });

  it("does not mutate frozen report, baseline, sampling or material inputs", () => {
    const report = makeReport(); const before = JSON.stringify(report);
    const freezeDeep = (value: unknown): void => {
      if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freezeDeep); }
    };
    [report, baseline, sampling, material].forEach(freezeDeep);
    expect(() => verify(report)).not.toThrow();
    expect(JSON.stringify(report)).toBe(before);
  });
});
