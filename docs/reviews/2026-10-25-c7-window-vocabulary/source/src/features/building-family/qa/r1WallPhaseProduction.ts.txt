import { z } from "zod";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { canonicalJson } from "../core/canonicalJson";
import { sha256Hex } from "../core/contentHash";
import { R1SamplingReportSchema } from "./r1BaselineContracts";
import { R1PeriodicSamplingDeltaSchema } from "./r1PeriodicSampling";
import { R1WallPhaseEvidenceSchema, R1WallPhaseReportSchema, R1_WALL_PHASE_PRESETS, wallPhaseCaseKey } from "./r1WallPhase";

const sha = z.string().regex(/^[a-f\d]{64}$/), fileHash = z.object({ file: z.string().min(1), sha256: sha }).strict();
const count = z.number().int().nonnegative(), same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const fail = (message: string): never => { throw new Error("R1 production wall phase: " + message); };
export const R1_WALL_PHASE_PRODUCTION_PINS = {
  card: "19e255e86618f45db2b8a75b5d2dac47679622acc9e44190b27aedf8245bb189",
  evidence: "dc0681e8b4158d7c149c0dc57baeecb825c061fb2a4d60d362aac5d0504d2ba1",
  sourceBaseline: "9c2834bd27119c14ec173971cf6b12eabe1bdaa4a12c4287ac76524745394495",
  uvCheckpoint: "02080dd1a915ce05bbd74dfc1aa8c754e2dc1a9df20b9cf5cc2c4ada605ae0b8",
  originalUv: "37e76f653f71aabba69f43e25665c45324effc03a904974465933e659860969b",
  originalIr: "349d1b2c44cee7c41d222c3da689c301fb2fac8f7fd37fb9fc3d1515ec939bcd",
  metadata: "b0bd8ece1683865f9ffe14a6acb112f4ae7f40e8a331e0ba440311afa773f274",
  selectedGeometry: "80f8af529a89c96279ffd106014bc78e0bc35540ca3c0441ec6e98e753ee792c",
  protectedGeometry: "9249e8d58ab784ef67783e2ffcabd0c86028d6a26a2e9bc34f94a456641286c0",
  instances: "6ec802356639427e2ed28433e4710aeba88a7c01522fc07b7659a1944f96fece"
} as const;
export const R1_WALL_PHASE_PRODUCTION_EXISTING_FILES = [
  "src/features/building-family/compiler/facadeSplitPlan.ts", "src/features/building-family/tests/buildingCompiler.test.ts",
  "src/features/building-family/tests/facadeSplitPlan.test.ts"
] as const;
export const R1_WALL_PHASE_PRODUCTION_NEW_FILES = [
  "scripts/capture-r1-wall-phase-production.mjs", "scripts/diagnostics/r1-wall-phase-production-browser.mjs",
  "src/features/building-family/qa/r1WallPhaseProduction.ts", "src/features/building-family/tests/r1WallPhaseProduction.test.ts"
] as const;
export const R1_WALL_PHASE_PRODUCTION_CONDITIONS = ["production", "base-color-only", "flat-no-shadow", "restored-production"] as const;
const stability = z.object({ algorithm: z.literal("sha256-utf8-ordinal-posix-file-colon-sha256-lf"), fileCount: z.literal(243), sha256: sha }).strict();
const pair = z.object({ original: fileHash, snapshot: fileHash }).strict();
const artifact = z.object({ file: z.string(), original: fileHash, durable: fileHash }).strict();
const after = R1PeriodicSamplingDeltaSchema.shape.after.shape;
export const R1WallPhaseProductionMaterialStateSchema = z.object({ sourceHashes: after.sourceHashes, sourceLayerHashes: after.sourceLayerHashes,
  channelHashes: after.channelHashes, channelDataHashes: after.channelDataHashes }).strict();
export const R1WallPhaseProductionSourceBaselineSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-s10-pre-edit-source-baseline"), packetId: z.literal("2026-10-14-r1-s10"),
  createdAt: z.iso.datetime(), sourceCommit: z.string().regex(/^[a-f\d]{40}$/), baseline: fileHash, priorMaterialBaseline: fileHash,
  acceptedMaterialArtifacts: z.array(artifact).length(4), executionHelper: fileHash, trackedPatch: fileHash,
  allSourceFiles: z.array(fileHash).length(243), sourceStability: stability, preEditSnapshots: z.array(pair).length(3),
  permittedExisting: z.array(z.string()).length(3), permittedAdded: z.array(z.string()).length(4),
  protectedArtifacts: z.literal(20), protectedDiagnosticSources: z.literal(60), humanReview: z.literal("pending"), scope: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (new Set(value.allSourceFiles.map(row => row.file)).size !== 243 ||
      !same([...value.permittedExisting].sort(), [...R1_WALL_PHASE_PRODUCTION_EXISTING_FILES].sort()) ||
      !same([...value.permittedAdded].sort(), [...R1_WALL_PHASE_PRODUCTION_NEW_FILES].sort())) context.addIssue({ code: "custom", message: "Exact pre-edit paths and permitted source delta are required." });
});
const historical = R1WallPhaseReportSchema.shape;
export const R1WallPhaseProductionUvCheckpointSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-s10-original-wall-uv-byte-checkpoint"), packetId: z.literal("2026-10-14-r1-s10"),
  createdAt: z.iso.datetime(), sourceCommit: z.string().regex(/^[a-f\d]{40}$/), trackedPatch: fileHash, executionHelper: fileHash, executionHelperSnapshot: fileHash,
  sourceStability: stability, allSourceFiles: z.array(fileHash).length(243),
  baseline: z.object({ card: fileHash, attribution: fileHash, sourceProof: fileHash, material: fileHash }).strict(), identity: historical.identity,
  originalIrHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.originalIr), irMetadataHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.metadata),
  sourceGeometryHash: z.literal("0d2d671d495fe65dede313e763b054a8e60255ce67e6dd13b78ed9e6060cc5d0"),
  originalGeometryHash: z.literal("4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e"),
  sourceUv: z.object({ batchId: z.literal("mesh.wall-panels"), arrayType: z.literal("Float32Array"), byteOrder: z.literal("LE"), itemSize: z.literal(2),
    elementCount: z.literal(12720), byteLength: z.literal(50880), sourceVertexCount: z.literal(6360), sourceTriangleCount: z.literal(3180),
    selectedFaceCount: z.literal(265), protectedFaceCount: z.literal(1325), negativeZeroCount: z.literal(0), positiveZeroCount: z.literal(6360), bytes: fileHash }).strict(),
  materialState: R1WallPhaseProductionMaterialStateSchema, humanReview: z.literal("pending"), limitations: z.array(z.string()).length(2)
}).strict();

/** Hash metadata omitted by the historical array fingerprint, preserving actual field/order data. */
export function wallPhaseProductionIrMetadata(ir: RuntimeBuildingIR): unknown {
  return { ...ir,
    meshBatches: ir.meshBatches.map(batch => Object.fromEntries(Object.entries(batch).filter(([key]) => !["positions", "normals", "uvs", "indices"].includes(key)))),
    instanceBatches: ir.instanceBatches.map(batch => Object.fromEntries(Object.entries(batch).filter(([key]) => key !== "transforms"))) };
}
/** Reconstruct legacy bytes for hashing without changing production IR or its backing arrays. */
export function createWallPhaseLegacyIrView(ir: RuntimeBuildingIR, originalUvs: Float32Array): RuntimeBuildingIR {
  if (ir.meshBatches.filter(batch => batch.batchId === "mesh.wall-panels").length !== 1 || originalUvs.length !== 12720) fail("One canonical wall UV array is required.");
  return { ...ir, meshBatches: ir.meshBatches.map(batch => batch.batchId === "mesh.wall-panels" ? { ...batch, uvs: originalUvs.slice() } : batch) };
}
const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
export async function verifyWallPhaseProductionUvs(input: { currentUvs: Float32Array; originalUvBytes: Uint8Array; sourceFaces: unknown }) {
  if (Object.prototype.toString.call(input.currentUvs) !== "[object Float32Array]" || input.currentUvs.length !== 12720 ||
      Object.prototype.toString.call(input.originalUvBytes) !== "[object Uint8Array]" || input.originalUvBytes.byteLength !== 50880 ||
      new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) fail("Exact canonical Float32 little-endian UV storage is required.");
  const currentBytes = new Uint8Array(input.currentUvs.buffer, input.currentUvs.byteOffset, input.currentUvs.byteLength).slice(), originalBytes = new Uint8Array(input.originalUvBytes);
  const [originalUvHash, productionUvHash] = await Promise.all([sha256Hex(originalBytes), sha256Hex(currentBytes)]);
  if (originalUvHash !== R1_WALL_PHASE_PRODUCTION_PINS.originalUv) fail("Pinned pre-edit raw UV bytes changed.");
  const faces = R1WallPhaseEvidenceSchema.shape.sourceFaces.parse(input.sourceFaces), originalUvs = new Float32Array(originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength));
  const current = new DataView(currentBytes.buffer), original = new DataView(originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength), scalar = new DataView(new ArrayBuffer(4));
  const keys = new Set<string>(), selections = new Array<number>(265).fill(0); let selectedFaceCount = 0, changedScalarCount = 0;
  for (const face of faces) {
    const key = `${face.elementIndex}/${face.faceIndex}`; if (keys.has(key)) fail("Duplicate source face."); keys.add(key);
    if (face.selected) { selections[face.elementIndex] += 1; selectedFaceCount += 1; if (face.facade !== face.ownedFacade) fail("Only the owned exterior face may be selected."); }
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = face.elementIndex * 24 + face.faceIndex * 4 + corner;
      if (face.sourceVertexIndices[corner] !== vertex) fail("Source face vertex ordering changed.");
      for (let axis = 0; axis < 2; axis += 1) {
        const index = vertex * 2 + axis, originalValue = originalUvs[index], expected = face.sharedMetreUvs[corner][axis];
        if (!Number.isFinite(expected) || Math.fround(expected) !== expected || originalValue !== face.originalMetreUvs[corner][axis]) fail("Pinned Float32 source-face UV table changed.");
        scalar.setFloat32(0, expected, true);
        if (current.getUint32(index * 4, true) !== (face.selected ? scalar.getUint32(0, true) : original.getUint32(index * 4, true))) fail("Selected shared UV or protected original UV bytes changed.");
        if (current.getUint32(index * 4, true) !== original.getUint32(index * 4, true)) changedScalarCount += 1;
      }
    }
  }
  if (selectedFaceCount !== 265 || selections.some(value => value !== 1) || changedScalarCount === 0) fail("Exactly one selected rewrite mask per box and an actual phase delta are required.");
  if (!equalBytes(originalBytes, input.originalUvBytes) || !equalBytes(currentBytes, new Uint8Array(input.currentUvs.buffer, input.currentUvs.byteOffset, input.currentUvs.byteLength))) fail("UV inputs changed during verification.");
  return { originalUvs, originalUvHash, productionUvHash, selectedFaceCount, protectedFaceCount: faces.length - selectedFaceCount, changedScalarCount };
}

export const R1WallPhaseProductionProofSchema = z.object({ productionIrHash: sha, recoveredOriginalIrHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.originalIr),
  irMetadataHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.metadata), originalUvHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.originalUv), productionUvHash: sha,
  selectedGeometryHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.selectedGeometry), geometryHash: sha,
  protectedGeometryHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.protectedGeometry), instanceTransformsHash: z.literal(R1_WALL_PHASE_PRODUCTION_PINS.instances),
  selectedFaceCount: z.literal(265), protectedFaceCount: z.literal(1325), changedScalarCount: count.positive().max(2120),
  cost: z.object({ irTriangles: z.literal(11868), renderedTriangles: z.literal(63938), geometryBytes: z.literal(3629016), instanceCount: z.literal(118),
    instanceMatrixBytes: z.literal(7552), selectedRenderedVertices: z.literal(47912), selectedRenderedTriangles: z.literal(22366) }).strict()
}).strict();
export type R1WallPhaseProductionProof = z.infer<typeof R1WallPhaseProductionProofSchema>;
const productionState = R1WallPhaseProductionProofSchema.pick({ productionIrHash: true, irMetadataHash: true, selectedGeometryHash: true, geometryHash: true, protectedGeometryHash: true, instanceTransformsHash: true });
const oldCapture = historical.captures.element.shape;
export const R1WallPhaseProductionReportSchema = z.object({ schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-phase-production"),
  packetId: z.literal("2026-10-14-r1-s10"), createdAt: z.iso.datetime(), source: historical.source,
  baseline: fileHash, phaseEvidence: fileHash, baselineSampling: fileHash, materialBaseline: fileHash, sourceBaseline: fileHash, uvCheckpoint: fileHash,
  controls: historical.controls, resolvedSpec: historical.resolvedSpec, identity: historical.identity, materialAnchors: historical.materialAnchors, freeze: historical.freeze,
  productionProof: R1WallPhaseProductionProofSchema, materialState: R1WallPhaseProductionMaterialStateSchema,
  captures: z.array(z.object({ requestedBackend: oldCapture.requestedBackend, viewName: oldCapture.viewName, lightingName: oldCapture.lightingName,
    condition: z.enum(R1_WALL_PHASE_PRODUCTION_CONDITIONS), screenshot: oldCapture.screenshot, snapshot: oldCapture.snapshot, wallState: oldCapture.wallState, productionState }).strict()).length(12),
  pageErrors: z.array(z.string()).length(0), humanReview: z.literal("pending"), limitations: z.array(z.string().min(1)).min(1)
}).strict();
export type R1WallPhaseProductionReport = z.infer<typeof R1WallPhaseProductionReportSchema>;
type Accepted = { report: unknown; sha256: string };
export function verifyR1WallPhaseProductionReport(input: { report: unknown; baseline: Accepted; evidence: Accepted; sampling: Accepted; material: Accepted; sourceBaseline: Accepted; uvCheckpoint: Accepted }): R1WallPhaseProductionReport {
  const report = R1WallPhaseProductionReportSchema.parse(input.report), baseline = R1WallPhaseReportSchema.parse(input.baseline.report), evidence = R1WallPhaseEvidenceSchema.parse(input.evidence.report);
  const sampling = R1SamplingReportSchema.parse(input.sampling.report), material = R1PeriodicSamplingDeltaSchema.parse(input.material.report);
  const ledger = R1WallPhaseProductionSourceBaselineSchema.parse(input.sourceBaseline.report), checkpoint = R1WallPhaseProductionUvCheckpointSchema.parse(input.uvCheckpoint.report);
  for (const [key, supplied, expected] of [["baseline", input.baseline, R1_WALL_PHASE_PRODUCTION_PINS.card], ["phaseEvidence", input.evidence, R1_WALL_PHASE_PRODUCTION_PINS.evidence],
    ["sourceBaseline", input.sourceBaseline, R1_WALL_PHASE_PRODUCTION_PINS.sourceBaseline], ["uvCheckpoint", input.uvCheckpoint, R1_WALL_PHASE_PRODUCTION_PINS.uvCheckpoint],
    ["baselineSampling", input.sampling, baseline.baselineSampling.sha256], ["materialBaseline", input.material, baseline.materialBaseline.sha256]] as const) {
    if (sha.parse(supplied.sha256) !== expected || report[key].sha256 !== expected) fail(`Pinned ${key} changed.`);
  }
  if (baseline.packetId !== "2026-10-14-r1-s9" || report.source.commit !== baseline.source.commit || ledger.sourceCommit !== baseline.source.commit || checkpoint.sourceCommit !== baseline.source.commit ||
      !same(report.source.replayCard, report.baseline) || !same(checkpoint.baseline.card, report.baseline) || !same(checkpoint.baseline.attribution, report.phaseEvidence) ||
      !same(checkpoint.baseline.sourceProof, ledger.baseline) || !same(checkpoint.baseline.material, report.materialBaseline) || checkpoint.trackedPatch.sha256 !== ledger.trackedPatch.sha256 ||
      !same(checkpoint.allSourceFiles, ledger.allSourceFiles) || !same(checkpoint.sourceStability, ledger.sourceStability) || checkpoint.executionHelper.sha256 !== checkpoint.executionHelperSnapshot.sha256 ||
      checkpoint.sourceUv.bytes.sha256 !== R1_WALL_PHASE_PRODUCTION_PINS.originalUv) fail("Pre-edit source/UV provenance changed.");
  for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"] as const) if (!same(report[key], baseline[key])) fail(`Frozen ${key} changed.`);
  const expectedMaterialState = Object.fromEntries(Object.keys(R1WallPhaseProductionMaterialStateSchema.shape).map(key => [key, material.after[key as keyof typeof material.after]]));
  if (!same(checkpoint.identity, baseline.identity) || !same(report.baselineSampling, baseline.baselineSampling) || !same(report.materialBaseline, baseline.materialBaseline) ||
      !same(report.materialState, checkpoint.materialState) || !same(report.materialState, expectedMaterialState) ||
      material.after.atlasContentHash !== report.identity.atlasContentHash || evidence.sourceGraphHash !== report.identity.sourceGraphHash || evidence.atlasContentHash !== report.identity.atlasContentHash || sampling.pageErrors.length) fail("Accepted material/source/atlas identity changed.");
  const proof = report.productionProof, shared = evidence.geometryStates.find(row => row.phase === "shared");
  if (!shared || proof.productionIrHash === evidence.originalIrHash || proof.productionUvHash === proof.originalUvHash ||
      proof.geometryHash === evidence.originalGeometryHash || proof.geometryHash === shared.geometryHash || proof.selectedGeometryHash !== shared.selectedGeometryHash) fail("Production IR and whole geometry need a new baseline; selected buffers must equal S9 shared.");
  const expectedPaths = [...new Set([...baseline.source.diagnosticFiles.map(row => row.file), ...R1_WALL_PHASE_PRODUCTION_EXISTING_FILES, ...R1_WALL_PHASE_PRODUCTION_NEW_FILES])].sort();
  if (new Set(report.source.diagnosticFiles.map(row => row.file)).size !== expectedPaths.length || !same(report.source.diagnosticFiles.map(row => row.file).sort(), expectedPaths)) fail("Exact prior source union plus seven permitted files is required.");
  for (const old of baseline.source.diagnosticFiles) {
    const before = ledger.allSourceFiles.find(row => row.file === old.file), current = report.source.diagnosticFiles.find(row => row.file === old.file);
    if (!before || before.sha256 !== old.sha256 || !current || (!(R1_WALL_PHASE_PRODUCTION_EXISTING_FILES as readonly string[]).includes(old.file) && current.sha256 !== old.sha256)) fail("Historical diagnostic sources must remain frozen.");
  }
  const expectedCases = R1_WALL_PHASE_PRESETS.flatMap(preset => R1_WALL_PHASE_PRODUCTION_CONDITIONS.map(condition => wallPhaseCaseKey({ ...preset, condition })));
  if (new Set(report.captures.map(wallPhaseCaseKey)).size !== 12 || report.captures.some(row => !expectedCases.includes(wallPhaseCaseKey(row))) || new Set(report.captures.map(row => row.screenshot.file)).size !== 12) fail("Exactly twelve unique production cases are required.");
  for (const preset of R1_WALL_PHASE_PRESETS) {
    const rows = R1_WALL_PHASE_PRODUCTION_CONDITIONS.map(condition => report.captures.find(row => wallPhaseCaseKey(row) === wallPhaseCaseKey({ ...preset, condition })));
    if (rows.some(row => !row)) return fail("Missing production case.");
    const production = rows[0]; if (!production) return fail("Missing production baseline.");
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]; if (!row) return fail("Missing production condition.");
      const historicalCondition = row.condition === "base-color-only" ? "shared-base-color-only" : row.condition === "flat-no-shadow" ? "shared-flat-no-shadow" : row.condition;
      const old = baseline.captures.find(value => wallPhaseCaseKey(value) === wallPhaseCaseKey({ ...preset, condition: historicalCondition })); if (!old) return fail("Accepted S9 comparison missing.");
      const { frameCount: currentFrame, ...snapshot } = row.snapshot, { frameCount: oldFrame, ...oldSnapshot } = old.snapshot; void oldFrame;
      const previous = rows[index - 1];
      if (!same(snapshot, oldSnapshot) || row.snapshot.actualBackend !== preset.requestedBackend || row.snapshot.canvas.backend !== preset.requestedBackend || row.snapshot.fallbackReason != null ||
          row.snapshot.viewName !== row.viewName || row.snapshot.lightingName !== row.lightingName || row.screenshot.widthPx !== row.snapshot.canvas.width || row.screenshot.heightPx !== row.snapshot.canvas.height ||
          (previous && currentFrame <= previous.snapshot.frameCount)) fail("Frozen camera/light/canvas/material labels and advancing actual frames are required.");
      const expectedState = Object.fromEntries(Object.keys(productionState.shape).map(key => [key, proof[key as keyof typeof proof]]));
      if (!same(row.productionState, expectedState) || row.wallState.geometryHash !== proof.geometryHash ||
          !same(row.wallState, { ...old.wallState, geometryHash: proof.geometryHash })) fail("Actual production buffers, protected state or material treatment changed.");
      if ((row.condition === "base-color-only" || row.condition === "flat-no-shadow") && row.screenshot.sha256 !== old.screenshot.sha256) fail("Actual base/flat pixels must equal accepted S9 shared output.");
      if (row.condition === "production" && row.screenshot.sha256 === old.screenshot.sha256) fail("Fresh production must present the actual phase change.");
      if (row.condition === "restored-production" && row.screenshot.sha256 !== production.screenshot.sha256) fail("Actual restored production pixels must match fresh production.");
    }
  }
  return report;
}
