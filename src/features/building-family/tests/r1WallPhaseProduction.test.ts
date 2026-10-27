import { readFileSync } from "node:fs";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { R1SamplingReportSchema } from "../qa/r1BaselineContracts";
import { R1PeriodicSamplingDeltaSchema } from "../qa/r1PeriodicSampling";
import { R1WallPhaseEvidenceSchema, R1WallPhaseReportSchema, R1_WALL_PHASE_PRESETS } from "../qa/r1WallPhase";
import { createWallPhaseLegacyIrView, R1WallPhaseProductionMaterialStateSchema, R1WallPhaseProductionProofSchema,
  R1WallPhaseProductionReportSchema, R1WallPhaseProductionSourceBaselineSchema, R1WallPhaseProductionUvCheckpointSchema,
  R1_WALL_PHASE_PRODUCTION_CONDITIONS, R1_WALL_PHASE_PRODUCTION_EXISTING_FILES, R1_WALL_PHASE_PRODUCTION_NEW_FILES,
  R1_WALL_PHASE_PRODUCTION_PINS as pins, verifyR1WallPhaseProductionReport, verifyWallPhaseProductionUvs, wallPhaseProductionIrMetadata } from "../qa/r1WallPhaseProduction";

const read = (file: string): unknown => JSON.parse(readFileSync(new URL("../../../../" + file, import.meta.url), "utf8"));
const cardPointer = { file: "docs/reviews/2026-10-14-r1-s9-verified/acceptance-card.json", sha256: pins.card };
const evidencePointer = { file: "docs/reviews/2026-10-14-r1-s9-verified/wall-phase-attribution.json", sha256: pins.evidence };
const baseline = R1WallPhaseReportSchema.parse(read(cardPointer.file)), evidence = R1WallPhaseEvidenceSchema.parse(read(evidencePointer.file));
const material = R1PeriodicSamplingDeltaSchema.parse(read(baseline.materialBaseline.file)), sampling = R1SamplingReportSchema.parse(read(baseline.baselineSampling.file));
const hash = (value: number) => value.toString(16).padStart(64, "0");
const record = (file: string, sha256 = hash(101)) => ({ file, sha256 });
const sourceProof = record("test-results/r1-s9-2026-10-14/final-02-proof/source-and-copy-checkpoint.json", "75f75af083925ab058c37368dcbae3d437d7ad59ef6c14b1d4d4d782fbd12f32");
function uvs(shared: boolean) {
  const output = new Float32Array(12720);
  for (const face of evidence.sourceFaces) for (let corner = 0; corner < 4; corner += 1) output.set(shared && face.selected ? face.sharedMetreUvs[corner] : face.originalMetreUvs[corner], face.sourceVertexIndices[corner] * 2);
  return output;
}
const rawOriginal = new Uint8Array(uvs(false).buffer);
const materialState = R1WallPhaseProductionMaterialStateSchema.parse(Object.fromEntries(Object.keys(R1WallPhaseProductionMaterialStateSchema.shape).map(key => [key, material.after[key as keyof typeof material.after]])));
let mask: Awaited<ReturnType<typeof verifyWallPhaseProductionUvs>>;
let actual: Awaited<ReturnType<typeof createAssemblyHallFixture>>;
beforeAll(async () => { mask = await verifyWallPhaseProductionUvs({ currentUvs: uvs(true), originalUvBytes: rawOriginal, sourceFaces: evidence.sourceFaces }); actual = await createAssemblyHallFixture({ promptControls: baseline.controls }); });
afterAll(() => actual?.familyRuntime.dispose());

async function arrayRecord(array?: ArrayBufferView) {
  return array ? { type: array.constructor.name, byteLength: array.byteLength, bytes: await sha256Hex(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) } : null;
}
async function irFingerprint(ir: RuntimeBuildingIR) {
  return sha256Hex(JSON.stringify({
    meshBatches: await Promise.all(ir.meshBatches.map(async batch => ({ batchId: batch.batchId, positions: await arrayRecord(batch.positions), normals: await arrayRecord(batch.normals), uvs: await arrayRecord(batch.uvs), indices: await arrayRecord(batch.indices) }))),
    instanceBatches: await Promise.all(ir.instanceBatches.map(async batch => ({ batchId: batch.batchId, count: batch.count, transforms: await arrayRecord(batch.transforms) })))
  }));
}
// These report/source-ledger contexts are synthetic schema fixtures, not claims about file SHA preimages.
// Accepted S9 tables/materials are durable repository fixtures; no ignored execution record is imported.
function fixture() {
  const paths = [...new Set([...baseline.source.diagnosticFiles.map(row => row.file), ...R1_WALL_PHASE_PRODUCTION_EXISTING_FILES])];
  for (let index = 0; paths.length < 243; index += 1) paths.push(`src/synthetic-pre-edit-${index}.ts`);
  const before = paths.sort().map(file => baseline.source.diagnosticFiles.find(row => row.file === file) ?? record(file));
  const stability = { algorithm: "sha256-utf8-ordinal-posix-file-colon-sha256-lf", fileCount: 243, sha256: "6b34c405378a9729d9c69fea394238fc35bff943b4f76225e145abf331ad6717" };
  const oldPatch = record("test-results/synthetic-before-source/old.patch");
  const ledger = R1WallPhaseProductionSourceBaselineSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-s10-pre-edit-source-baseline", packetId: "2026-10-14-r1-s10", createdAt: baseline.createdAt,
    sourceCommit: baseline.source.commit, baseline: sourceProof, priorMaterialBaseline: record("test-results/synthetic-s8-proof.json"),
    acceptedMaterialArtifacts: [baseline.baseline, baseline.baselineSampling, baseline.materialBaseline, record("docs/reviews/synthetic-sampling-comparison.json")].map(pointer => ({ file: pointer.file.split("/").at(-1), original: pointer, durable: pointer })),
    executionHelper: record("test-results/synthetic-freeze.mjs"), trackedPatch: oldPatch, allSourceFiles: before, sourceStability: stability,
    preEditSnapshots: R1_WALL_PHASE_PRODUCTION_EXISTING_FILES.map(file => ({ original: before.find(row => row.file === file), snapshot: record(`test-results/synthetic/${file}.snapshot`, before.find(row => row.file === file)!.sha256) })),
    permittedExisting: [...R1_WALL_PHASE_PRODUCTION_EXISTING_FILES], permittedAdded: [...R1_WALL_PHASE_PRODUCTION_NEW_FILES], protectedArtifacts: 20, protectedDiagnosticSources: 60, humanReview: "pending", scope: "Synthetic trusted context for pure validator tests." });
  const uvCheckpoint = R1WallPhaseProductionUvCheckpointSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-s10-original-wall-uv-byte-checkpoint", packetId: "2026-10-14-r1-s10", createdAt: baseline.createdAt,
    sourceCommit: baseline.source.commit, trackedPatch: { ...oldPatch, file: "test-results/synthetic-uv/old.patch" }, executionHelper: record("test-results/synthetic-uv.mjs"), executionHelperSnapshot: record("test-results/synthetic-uv.mjs.snapshot"),
    sourceStability: stability, allSourceFiles: before, baseline: { card: cardPointer, attribution: evidencePointer, sourceProof, material: baseline.materialBaseline }, identity: baseline.identity,
    originalIrHash: pins.originalIr, irMetadataHash: pins.metadata, sourceGeometryHash: evidence.sourceGeometryHash, originalGeometryHash: evidence.originalGeometryHash,
    sourceUv: { batchId: "mesh.wall-panels", arrayType: "Float32Array", byteOrder: "LE", itemSize: 2, elementCount: 12720, byteLength: 50880, sourceVertexCount: 6360, sourceTriangleCount: 3180,
      selectedFaceCount: 265, protectedFaceCount: 1325, negativeZeroCount: 0, positiveZeroCount: 6360, bytes: record("test-results/synthetic-uv/original.bin", pins.originalUv) },
    materialState, humanReview: "pending", limitations: ["Synthetic parsed context.", "Actual pre-edit bytes are verified separately by the loader."] });
  const proof = R1WallPhaseProductionProofSchema.parse({ productionIrHash: hash(201), recoveredOriginalIrHash: pins.originalIr, irMetadataHash: pins.metadata,
    originalUvHash: pins.originalUv, productionUvHash: mask.productionUvHash, selectedGeometryHash: pins.selectedGeometry, geometryHash: hash(202), protectedGeometryHash: pins.protectedGeometry,
    instanceTransformsHash: pins.instances, selectedFaceCount: 265, protectedFaceCount: 1325, changedScalarCount: mask.changedScalarCount,
    cost: { irTriangles: 11868, renderedTriangles: 63938, geometryBytes: 3629016, instanceCount: 118, instanceMatrixBytes: 7552, selectedRenderedVertices: 47912, selectedRenderedTriangles: 22366 } });
  const state = { productionIrHash: proof.productionIrHash, irMetadataHash: proof.irMetadataHash, selectedGeometryHash: proof.selectedGeometryHash,
    geometryHash: proof.geometryHash, protectedGeometryHash: proof.protectedGeometryHash, instanceTransformsHash: proof.instanceTransformsHash };
  const captures = R1_WALL_PHASE_PRESETS.flatMap((preset, pose) => R1_WALL_PHASE_PRODUCTION_CONDITIONS.map((condition, index) => {
    const oldCondition = condition === "base-color-only" ? "shared-base-color-only" : condition === "flat-no-shadow" ? "shared-flat-no-shadow" : condition;
    const old = baseline.captures.find(row => row.requestedBackend === preset.requestedBackend && row.viewName === preset.viewName && row.condition === oldCondition)!;
    return { ...preset, condition, screenshot: { ...old.screenshot, file: `r1-s10-${preset.requestedBackend}-${preset.viewName}-ordinary-${condition}.png`, sha256: condition === "production" || condition === "restored-production" ? hash(301 + pose) : old.screenshot.sha256 },
      snapshot: { ...structuredClone(old.snapshot), frameCount: index + 10 }, wallState: { ...structuredClone(old.wallState), geometryHash: proof.geometryHash }, productionState: { ...state } };
  }));
  const diagnosticPaths = [...new Set([...baseline.source.diagnosticFiles.map(row => row.file), ...R1_WALL_PHASE_PRODUCTION_EXISTING_FILES, ...R1_WALL_PHASE_PRODUCTION_NEW_FILES])].sort();
  const report = R1WallPhaseProductionReportSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-production", packetId: "2026-10-14-r1-s10", createdAt: baseline.createdAt,
    source: { ...baseline.source, trackedDiffSha256: hash(400), replayCard: cardPointer, diagnosticFiles: diagnosticPaths.map(file => baseline.source.diagnosticFiles.find(row => row.file === file) ?? record(file, hash(402))) },
    baseline: cardPointer, phaseEvidence: evidencePointer, baselineSampling: baseline.baselineSampling, materialBaseline: baseline.materialBaseline,
    sourceBaseline: record("test-results/synthetic-source-baseline.json", pins.sourceBaseline), uvCheckpoint: record("test-results/synthetic-original-uvs.json", pins.uvCheckpoint),
    controls: baseline.controls, resolvedSpec: baseline.resolvedSpec, identity: baseline.identity, materialAnchors: baseline.materialAnchors, freeze: baseline.freeze,
    productionProof: proof, materialState, captures, pageErrors: [], humanReview: "pending", limitations: ["Synthetic report fixture; no rendered result is asserted by this test."] });
  return { report, baseline: { report: baseline, sha256: pins.card }, evidence: { report: evidence, sha256: pins.evidence },
    sampling: { report: sampling, sha256: baseline.baselineSampling.sha256 }, material: { report: material, sha256: baseline.materialBaseline.sha256 },
    sourceBaseline: { report: ledger, sha256: pins.sourceBaseline }, uvCheckpoint: { report: uvCheckpoint, sha256: pins.uvCheckpoint } };
}

describe("fresh production wall-panel phase", () => {
  it("binds independent original-byte and shared Float32 goldens without importing runtime proof files", async () => {
    expect(await sha256Hex(rawOriginal)).toBe(pins.originalUv); expect(mask.selectedFaceCount).toBe(265); expect(mask.protectedFaceCount).toBe(1325);
    const original = new Uint32Array(rawOriginal.buffer), shared = new Uint32Array(uvs(true).buffer);
    expect(mask.changedScalarCount).toBe(shared.reduce((sum, value, index) => sum + Number(value !== original[index]), 0));
    expect(mask.changedScalarCount).toBeGreaterThan(0); expect(mask.changedScalarCount).toBeLessThan(2120);
  });
  it("matches actual fresh compilation, recovering the sealed old IR through only an owned UV replacement", async () => {
    const target = actual.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels")!;
    const before = target.uvs!.slice(), result = await verifyWallPhaseProductionUvs({ currentUvs: target.uvs!, originalUvBytes: rawOriginal, sourceFaces: evidence.sourceFaces });
    const view = createWallPhaseLegacyIrView(actual.ir, result.originalUvs);
    expect(await irFingerprint(view)).toBe(pins.originalIr); expect(await irFingerprint(actual.ir)).not.toBe(pins.originalIr);
    expect(await hashCanonicalJson(wallPhaseProductionIrMetadata(actual.ir))).toBe(pins.metadata);
    expect(target.uvs).toEqual(before); expect(view).not.toBe(actual.ir); expect(view.semanticIndex).toBe(actual.ir.semanticIndex);
    for (let index = 0; index < view.meshBatches.length; index += 1) {
      const batch = view.meshBatches[index], current = actual.ir.meshBatches[index];
      if (batch.batchId !== "mesh.wall-panels") expect(batch).toBe(current);
      else { expect(batch.uvs!.buffer).not.toBe(target.uvs!.buffer); expect(batch.positions).toBe(current.positions); expect(batch.normals).toBe(current.normals); expect(batch.indices).toBe(current.indices); }
    }
    const selected = actual.buildingRuntime.renderables.find(object => object.name === "mesh.wall-panels")!.geometry;
    const attributes = await Promise.all(["position", "normal", "uv", "index"].map(async name => {
      const attribute = name === "index" ? selected.index! : selected.getAttribute(name), array = attribute.array;
      return [name, { itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, array: await arrayRecord(array) }];
    }));
    expect(await sha256Hex(JSON.stringify(Object.fromEntries(attributes)))).toBe(pins.selectedGeometry);
  });
  it.each(["positions", "normals", "indices"] as const)("cannot hide changed %s by restoring original UVs", async key => {
    const view = createWallPhaseLegacyIrView(actual.ir, mask.originalUvs), index = view.meshBatches.findIndex(batch => batch.batchId === "mesh.wall-panels"), batch = view.meshBatches[index];
    const copy = batch[key]!.slice(); copy[0] += 1; view.meshBatches[index] = { ...batch, [key]: copy };
    expect(await irFingerprint(view)).not.toBe(pins.originalIr);
  });
  it("protects source instance transforms through the old whole-IR hash", async () => {
    const view = createWallPhaseLegacyIrView(actual.ir, mask.originalUvs), index = view.instanceBatches.findIndex(batch => batch.transforms?.length), batch = view.instanceBatches[index];
    const transforms = batch.transforms!.slice(); transforms[0] += 1; view.instanceBatches = view.instanceBatches.map((item, i) => i === index ? { ...item, transforms } : item);
    expect(await irFingerprint(view)).not.toBe(pins.originalIr);
  });
  it("protects semantic and material metadata omitted by the array fingerprint", async () => {
    const view = createWallPhaseLegacyIrView(actual.ir, mask.originalUvs);
    const changed = { ...view, semanticIndex: view.semanticIndex.map((row, index) => index ? row : { ...row, semanticPath: row.semanticPath + "/wrong" }) };
    expect(await irFingerprint(changed)).toBe(pins.originalIr); expect(await hashCanonicalJson(wallPhaseProductionIrMetadata(changed))).not.toBe(pins.metadata);
  });
  it.each(["selected", "protected", "protected-negative-zero", "nonfinite"])("rejects %s UV tampering", async kind => {
    const currentUvs = uvs(true), face = evidence.sourceFaces.find(row => row.selected === (kind === "selected" || kind === "nonfinite"))!;
    currentUvs[face.sourceVertexIndices[0] * 2] = kind === "nonfinite" ? Infinity : kind === "protected-negative-zero" ? -0 : currentUvs[face.sourceVertexIndices[0] * 2] + 0.125;
    await expect(verifyWallPhaseProductionUvs({ currentUvs, originalUvBytes: rawOriginal, sourceFaces: evidence.sourceFaces })).rejects.toThrow();
  });
  it.each(["duplicate", "indices", "owner", "missing-selection", "fractional-shared"])("rejects %s source-mask substitution", async kind => {
    const faces = structuredClone(evidence.sourceFaces), selected = faces.find(row => row.selected)!;
    if (kind === "duplicate") faces[1] = structuredClone(faces[0]);
    if (kind === "indices") selected.sourceVertexIndices[0] += 4;
    if (kind === "owner") selected.ownedFacade = selected.ownedFacade === "front" ? "rear" : "front";
    if (kind === "missing-selection") selected.selected = false;
    if (kind === "fractional-shared") selected.sharedMetreUvs[0][0] += 1e-10;
    await expect(verifyWallPhaseProductionUvs({ currentUvs: uvs(true), originalUvBytes: rawOriginal, sourceFaces: faces })).rejects.toThrow();
  });
  it("rejects changed or truncated original bytes and returns independent storage", async () => {
    const changed = rawOriginal.slice(); changed[0] ^= 1;
    await expect(verifyWallPhaseProductionUvs({ currentUvs: uvs(true), originalUvBytes: changed, sourceFaces: evidence.sourceFaces })).rejects.toThrow(/Pinned/);
    await expect(verifyWallPhaseProductionUvs({ currentUvs: uvs(true), originalUvBytes: rawOriginal.subarray(4), sourceFaces: evidence.sourceFaces })).rejects.toThrow(/storage/);
    expect(mask.originalUvs.buffer).not.toBe(rawOriginal.buffer);
  });
  it("accepts the strict synthetic twelve-case report and distinct same-byte patch archive paths", () => { const input = fixture(); expect(verifyR1WallPhaseProductionReport(input)).toEqual(input.report); });
  const mutations: Array<[string, (input: ReturnType<typeof fixture>) => void]> = [
    ["legacy IR rebadged", x => { x.report.productionProof.productionIrHash = pins.originalIr; }],
    ["counterfactual whole geometry rebadged", x => { x.report.productionProof.geometryHash = evidence.geometryStates.find(row => row.phase === "shared")!.geometryHash; }],
    ["old local selected buffers", x => { x.report.productionProof.selectedGeometryHash = evidence.geometryStates.find(row => row.phase === "local")!.selectedGeometryHash as typeof pins.selectedGeometry; }],
    ["wrong geometry byte scope", x => { x.report.productionProof.cost.geometryBytes = 3636568 as 3629016; }],
    ["changed metadata", x => { x.report.productionProof.irMetadataHash = hash(500) as typeof pins.metadata; }],
    ["changed material raw channel", x => { x.report.materialState.channelDataHashes.baseColor = hash(501); }],
    ["changed anchor", x => { x.report.materialAnchors.atlasManifest.slots[0].physicalSizeM.width += 0.01; }],
    ["changed graph", x => { x.report.identity.sourceGraphHash = hash(502); }],
    ["old evidence hash", x => { x.report.phaseEvidence.sha256 = hash(503); }],
    ["old UV raw hash", x => { x.uvCheckpoint.report.sourceUv.bytes.sha256 = hash(504); }],
    ["omitted source", x => { x.report.source.diagnosticFiles.pop(); }],
    ["extra source", x => { x.report.source.diagnosticFiles.push(record("src/unapproved.ts")); }],
    ["old validator source drift", x => { x.report.source.diagnosticFiles.find(row => row.file.endsWith("r1WallPhase.ts"))!.sha256 = hash(505); }],
    ["broader permitted delta", x => { x.sourceBaseline.report.permittedExisting[0] = "src/features/building-family/compiler/buildingCompiler.ts"; }],
    ["duplicate case", x => { x.report.captures[1] = structuredClone(x.report.captures[0]); }],
    ["stale frame", x => { x.report.captures[1].snapshot.frameCount = x.report.captures[0].snapshot.frameCount; }],
    ["wrong camera", x => { x.report.captures[1].snapshot.camera.position[0] += 0.01; }],
    ["backend fallback", x => { x.report.captures[1].snapshot.fallbackReason = "fallback"; }],
    ["stale production pixels", x => { x.report.captures[0].screenshot.sha256 = baseline.captures.find(row => row.condition === "production" && row.viewName === "rear")!.screenshot.sha256; }],
    ["changed base output", x => { x.report.captures[1].screenshot.sha256 = hash(506); }],
    ["changed flat output", x => { x.report.captures[2].screenshot.sha256 = hash(507); }],
    ["failed restoration", x => { x.report.captures[3].screenshot.sha256 = hash(508); }],
    ["per-mount geometry drift", x => { x.report.captures[1].productionState.geometryHash = hash(509); }],
    ["shadow flag drift", x => { x.report.captures[2].wallState.wallRenderables[0].castShadow = !x.report.captures[2].wallState.wallRenderables[0].castShadow; }],
    ["nonwall drift", x => { x.report.captures[1].wallState.nonWallStateHash = hash(510); }]
  ];
  it.each(mutations)("rejects %s with otherwise coherent report context", (_name, mutate) => { const input = fixture(); mutate(input); expect(() => verifyR1WallPhaseProductionReport(input)).toThrow(); });
  it("rejects unknown serialized fields and versions", () => {
    expect(R1WallPhaseProductionProofSchema.safeParse({ ...fixture().report.productionProof, optionalBypass: true }).success).toBe(false);
    expect(R1WallPhaseProductionUvCheckpointSchema.safeParse({ ...fixture().uvCheckpoint.report, schemaVersion: "0.2.0" }).success).toBe(false);
  });
});
