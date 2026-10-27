import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { R1AcceptanceCardSchema, R1SamplingReportSchema } from "../qa/r1BaselineContracts";
import { R1_MASONRY_FLAT_LINEAR_COLOR, type R1MasonryWallState } from "../qa/r1MasonryAppearance";
import { R1PeriodicSamplingDeltaSchema } from "../qa/r1PeriodicSampling";
import { deriveSharedWallPhaseUv, projectWallPhasePoint, wallPhaseTileCoordinate, wallPhaseCaseKey,
  R1_WALL_PHASE_CONDITIONS, R1_WALL_PHASE_PRESETS, R1_WALL_PHASE_SOURCE_BASELINE_SHA256, R1_WALL_PHASE_NEW_SOURCE_FILES,
  R1WallPhaseAllocationLedgerSchema, R1WallPhaseEvidenceSchema, R1WallPhaseReportSchema, R1WallPhaseSourceBaselineSchema,
  verifyR1WallPhaseEvidence, verifyR1WallPhaseReport, type R1WallPhaseEvidence, type R1WallPhaseReport, type WallPhaseFacade } from "../qa/r1WallPhase";

type V2 = [number, number];
type V3 = [number, number, number];
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const B = { min: [-3, 0, -3] as V3, max: [3, 3, 3] as V3 };
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const directory = "docs/reviews/2026-10-14-r1-s8-verified/";
function read(file: string) {
  const bytes = readFileSync(path.resolve(directory, file));
  return { report: JSON.parse(bytes.toString("utf8")) as unknown, ref: { file: directory + file, sha256: hash(bytes) } };
}
const cardFile = read("acceptance-card.json"), samplingFile = read("sampling-report.json"), materialFile = read("periodic-material-baseline-delta.json");
const baseline = R1AcceptanceCardSchema.parse(cardFile.report), sampling = R1SamplingReportSchema.parse(samplingFile.report), material = R1PeriodicSamplingDeltaSchema.parse(materialFile.report);
const normals: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const facadeIndex = { front: 5, rear: 4, left: 1, right: 0 };
const facades: WallPhaseFacade[] = ["front", "rear", "left", "right"];

// Literal frame oracle, separate from the implementation. These are synthetic
// mathematical/source-face fixtures, never claimed canonical rendered evidence.
function sharedUv(p: V3, facade: WallPhaseFacade): V2 {
  if (facade === "front") return [3 - p[0], p[1]];
  if (facade === "rear") return [p[0] + 3, p[1]];
  if (facade === "left") return [p[2] + 3, p[1]];
  return [3 - p[2], p[1]];
}
function boxFaces(elementIndex: number): R1WallPhaseEvidence["sourceFaces"] {
  const ownedFacade = facades[elementIndex % 4];
  const low = elementIndex % 8 < 4 ? -0.48 : 0.48, high = low + 0.96;
  const x0 = ownedFacade === "left" ? -3 : ownedFacade === "right" ? 2.9 : low;
  const x1 = ownedFacade === "left" ? -2.9 : ownedFacade === "right" ? 3 : high;
  const z0 = ownedFacade === "front" ? -3 : ownedFacade === "rear" ? 2.9 : low;
  const z1 = ownedFacade === "front" ? -2.9 : ownedFacade === "rear" ? 3 : high;
  const y0 = 0, y1 = 2.88;
  const positions: V3[][] = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]
  ];
  return positions.map((buildingPositions, faceIndex) => {
    const width = faceIndex < 2 ? z1 - z0 : x1 - x0, height = faceIndex === 2 || faceIndex === 3 ? z1 - z0 : y1 - y0;
    const originalMetreUvs: V2[] = [[0, 0], [width, 0], [width, height], [0, height]];
    const selected = faceIndex === facadeIndex[ownedFacade];
    return { elementIndex, faceIndex, semanticPath: `facade/wall/subdivided/piece/${elementIndex}`, ownedFacade,
      facade: selected ? ownedFacade : null, selected, sourceVertexIndices: [0, 1, 2, 3].map((v) => elementIndex * 24 + faceIndex * 4 + v),
      buildingPositions, buildingNormal: [...normals[faceIndex]] as V3, originalMetreUvs,
      sharedMetreUvs: selected ? buildingPositions.map((p) => sharedUv(p, ownedFacade)) : structuredClone(originalMetreUvs) };
  });
}
function sourceLocalUv(elementIndex: number, p: V3): V2 {
  const face = boxFaces(elementIndex).find((f) => f.selected)!;
  const p0 = face.buildingPositions[0];
  return [Math.abs(p[0] - p0[0]) + Math.abs(p[2] - p0[2]), p[1]];
}
const slot = baseline.materialAnchors.atlasManifest.slots.find((row) => row.id === "wall.primary")!;
const atlas = baseline.materialAnchors.atlasManifest;
function triangle(id: string, elementIndex: number, point: V3, sign: 1 | -1, phase: "local" | "shared" = "shared"): R1WallPhaseEvidence["triangleWitnesses"][number] {
  const face = boxFaces(elementIndex).find((f) => f.selected)!;
  const tangent: V3 = face.ownedFacade === "rear" ? [1, 0, 0] : [0, 0, -1];
  const positionsM: V3[] = [[...point], point.map((value, axis) => value + sign * 0.03 * tangent[axis]) as V3, [point[0], point[1] + sign * 0.03, point[2]]];
  const metreUvs = positionsM.map((p) => phase === "shared" ? sharedUv(p, face.ownedFacade) : sourceLocalUv(elementIndex, p));
  const tile: V2 = [0, 1].map((axis) => Math.floor(Math.min(...metreUvs.map((uv) => uv[axis])) / 0.96)) as V2;
  const atlasUvs = metreUvs.map((uv) => [(slot.rectPx.x + (uv[0] / 0.96 - tile[0]) * slot.rectPx.width) / atlas.widthPx,
    (slot.rectPx.y + (uv[1] / 0.96 - tile[1]) * slot.rectPx.height) / atlas.heightPx] as V2);
  return { id, phase, elementIndex, faceIndex: face.faceIndex, facade: face.ownedFacade, positionsM,
    normals: positionsM.map(() => [...face.buildingNormal] as V3), metreUvs, atlasUvs, tile, barycentric: [1, 0, 0], buildingPoint: [...point], interpolatedAtlasUv: [...atlasUvs[0]] };
}
function ledger(index: number, phase: "local" | "shared") {
  const prepared = index >= 2;
  return { buffers: [{ id: "protected", byteLength: 2444336 }, { id: "instances", byteLength: 7552 }, { id: "original", byteLength: 1000000 }, { id: "candidate", byteLength: 1200000 }, { id: "temporary", byteLength: 50 }, { id: "guard", byteLength: 20 }],
    active: ["protected", "instances", phase === "local" ? "original" : "candidate"], retainedOriginal: ["original"], owned: phase === "shared" ? ["candidate"] : [], temporary: [], auxiliary: ["guard"],
    peak: prepared ? ["protected", "instances", "original", "candidate", "temporary", "guard"] : ["protected", "instances", "original", "guard"],
    activeBytes: phase === "local" ? 3451888 : 3651888, retainedOriginalBytes: 1000000, ownedBytes: phase === "shared" ? 1200000 : 0,
    temporaryBytes: 0, auxiliaryBytes: 20, peakBytes: prepared ? 4651958 : 3451908 };
}
const pixelRgba = (condition: string): [number, number, number, number] => condition === "local-base-color-only" ? [80, 20, 10, 255] : condition === "shared-base-color-only" ? [100, 25, 12, 255] : [97, 17, 12, 255];

function makeBundle() {
  const sourceFaces = Array.from({ length: 265 }, (_, i) => boxFaces(i)).flat();
  const directionAreas = new Map<string, { normal: V3; areaM2: number }>();
  let selectedSurfaceAreaM2 = 0;
  for (const f of sourceFaces) {
    const a = f.buildingPositions[1].map((v, i) => v - f.buildingPositions[0][i]), b = f.buildingPositions[2].map((v, i) => v - f.buildingPositions[0][i]);
    const areaM2 = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    selectedSurfaceAreaM2 += areaM2;
    const key = f.buildingNormal.join(","), row = directionAreas.get(key) ?? { normal: f.buildingNormal, areaM2: 0 }; row.areaM2 += areaM2; directionAreas.set(key, row);
  }
  const surface = { selectedSurfaceAreaM2, selectedBounds: { min: [-3, 0, -3] as V3, max: [3, 2.88, 3] as V3 }, normalAreaDistribution: [...directionAreas.values()], minimumWindingNormalDot: 1 };
  const protectedHashes = { originalIrHash: hash("synthetic original IR"), protectedGeometryHash: hash("synthetic protected geometry and transforms"), instanceTransformsHash: hash("synthetic 118 unchanged instance matrices"), protectedUvHash: hash("synthetic protected source face UVs") };
  const geometryStates: R1WallPhaseEvidence["geometryStates"] = ["local", "shared"].map((phaseName) => ({ phase: phaseName as "local" | "shared", ...protectedHashes,
    geometryHash: phaseName === "local" ? material.immutable.geometryHash : hash("synthetic shared actual bundle"), selectedGeometryHash: hash(`synthetic submitted ${phaseName} buffers`),
    selectedVertexCount: phaseName === "local" ? 1100 : 1300, selectedIndexCount: phaseName === "local" ? 3000 : 3300,
    selectedTriangleCount: phaseName === "local" ? 1000 : 1100, totalRenderedTriangles: phaseName === "local" ? 61508 : 61608, ...surface }));
  const captures = R1_WALL_PHASE_PRESETS.flatMap((preset) => {
    const original = baseline.captures.find((row) => row.snapshot.actualBackend === preset.requestedBackend && row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName && row.snapshot.canvas.presentationMode === "textured")!;
    const wallSlots = new Set(baseline.materialAnchors.atlasManifest.slots.filter((row) => row.role === "wall").map((row) => row.id));
    const wallLabels = z.array(z.object({ batchId: z.string(), materialSlotId: z.string().nullable().optional() }).passthrough()).parse(original.snapshot.materials).filter((row) => row.materialSlotId && wallSlots.has(row.materialSlotId));
    return R1_WALL_PHASE_CONDITIONS.map((condition, index) => {
      const phase = condition.startsWith("shared-") ? "shared" : "local";
      const state = geometryStates.find((s) => s.phase === phase)!;
      const materialCondition = condition.includes("base-color-only") ? "base-color-only" : condition.includes("flat-no-shadow") ? "flat-no-shadow" : condition;
      const raw = material.after.channelDataHashes;
      const wallState: R1MasonryWallState = { condition: materialCondition as R1MasonryWallState["condition"], geometryHash: state.geometryHash, nonWallStateHash: hash("synthetic protected non-wall state"),
        wallMaterials: [...new Set(wallLabels.map((row) => row.materialSlotId!))].sort().map((slotId) => ({ slotId,
          maps: { baseColor: raw.baseColor, normal: raw.normal, roughness: raw.orm, metalness: raw.orm, opacity: raw.opacity },
          color: [1, 1, 1], roughness: 0.7, metalness: 0.03, normalScale: [0.6, 0.6], otherPropertiesHash: hash(`synthetic protected properties ${slotId}`) })),
        wallRenderables: wallLabels.map((row) => ({ batchId: row.batchId, castShadow: true, receiveShadow: materialCondition !== "flat-no-shadow" })) };
      for (const m of wallState.wallMaterials) {
        if (materialCondition === "base-color-only" || materialCondition === "flat-no-shadow") { m.maps.normal = m.maps.roughness = m.maps.metalness = null; m.roughness = 0.82; m.metalness = 0; }
        if (materialCondition === "flat-no-shadow") { m.maps.baseColor = null; m.color = [...R1_MASONRY_FLAT_LINEAR_COLOR]; }
      }
      const rawSnapshot = structuredClone(original.snapshot); rawSnapshot.frameCount = index + 1;
      const snapshot = R1WallPhaseReportSchema.shape.captures.element.shape.snapshot.parse(rawSnapshot);
      const allocations = ledger(index, phase);
      return { ...preset, condition, screenshot: { ...original.screenshot, file: `${wallPhaseCaseKey({ ...preset, condition }).replaceAll("/", "-")}.png`,
        sha256: condition === "production" || condition === "restored-production" ? original.screenshot.sha256 : hash(`${preset.requestedBackend}/${preset.viewName}/${materialCondition === "flat-no-shadow" ? "flat-pair" : condition}`) },
      snapshot, wallState, phaseState: { ...state, allocationLedger: allocations },
      runtime: { references: { selectedOriginalGeometryAttached: phase === "local", originalSelectedAttributeReferencesIntact: true, originalSelectedArrayReferencesIntact: true, originalSelectedBufferReferencesIntact: true,
        originalSelectedBytesIntact: true, protectedGeometryReferencesIntact: true, irReferencesIntact: true },
        resources: { ownedGeometryCreated: index >= 4 ? 2 : index >= 2 ? 1 : 0, ownedGeometryDisposed: index === 5 ? 2 : index >= 3 ? 1 : 0, ownedGeometryLive: phase === "shared" ? 1 : 0,
          temporaryGeometryCreated: index >= 4 ? 2 : index >= 2 ? 1 : 0, temporaryGeometryDisposed: index >= 4 ? 2 : index >= 2 ? 1 : 0, temporaryGeometryLive: 0 },
        cost: { activeSceneTriangleCount: state.totalRenderedTriangles, selectedSurfaceAreaM2: state.selectedSurfaceAreaM2, selectedBounds: state.selectedBounds, normalAreaDistribution: state.normalAreaDistribution, minimumWindingNormalDot: 1,
          activeSceneUniqueBufferBytes: allocations.activeBytes, activeSceneGeometryBufferBytes: allocations.activeBytes - 7552, activeInstanceMatrixBufferBytes: 7552,
          retainedOriginalBufferBytes: allocations.retainedOriginalBytes, temporarySourceBufferBytes: index >= 2 ? 50 : 0, guardSnapshotBufferBytes: 20, ownedReplacementBufferBytes: allocations.ownedBytes, peakUnionBufferBytes: allocations.peakBytes,
          preparationTimeMs: 1.25, constructionTimeMs: index >= 2 ? 2.5 : 0, sourceVertexCount: 6360 as const, sourceTriangleCount: 3180 as const, renderedVertexCount: state.selectedVertexCount, renderedTriangleCount: state.selectedTriangleCount,
          scope: "Scene, instance, retained-original, guard and replacement ArrayBuffers; excludes report transport, JavaScript objects and GPU allocations." as const },
        submittedFrameCount: index + 1, actualBackend: preset.requestedBackend, backendCounters: { available: true, scope: "renderer.info sampled counters" as const, render: { calls: 42 }, memory: { geometries: 42 } } } };
    });
  });
  const triangleWitnesses = [triangle("rear-first", 1, [0.48, 0.48, 3], -1), triangle("rear-second", 5, [0.48, 0.48, 3], 1),
    triangle("right-first", 3, [3, 0.48, 0.48], 1), triangle("right-second", 7, [3, 0.48, 0.48], -1),
    triangle("rear-u-start", 1, [-0.48, 0.48, 3], 1), triangle("rear-v-end", 1, [0.48, 1.44, 3], -1),
    triangle("rear-mapped-local", 1, [0.46, 0.48, 3], -1, "local"), triangle("rear-mapped-shared", 1, [0.46, 0.48, 3], -1),
    triangle("right-mapped-local", 3, [3, 0.48, 0.46], 1, "local"), triangle("right-mapped-shared", 3, [3, 0.48, 0.46], 1)];
  const side = (id: string) => { const t = triangleWitnesses.find((row) => row.id === id)!; return { elementIndex: t.elementIndex, faceIndex: t.faceIndex, localMetreUv: sourceLocalUv(t.elementIndex, t.buildingPoint), sharedMetreUv: [...t.metreUvs[0]] as V2, sharedTriangleWitnessId: id }; };
  const pixelMappings = (["rear", "right"] as const).map((viewName) => {
    const sample = (phase: "local" | "shared") => {
      const t = triangleWitnesses.find((row) => row.id === `${viewName}-mapped-${phase}`)!;
      const atlasPixel = [Math.floor(t.interpolatedAtlasUv[0] * atlas.widthPx), Math.floor(t.interpolatedAtlasUv[1] * atlas.heightPx)] as V2;
      return { triangleWitnessId: t.id, atlasPixel, roiPixel: [atlasPixel[0] - slot.rectPx.x, atlasPixel[1] - slot.rectPx.y] as V2,
        transformedAtlasUv: [...t.interpolatedAtlasUv] as V2, textureTransform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], flipY: false, wrapS: 1001 as const, wrapT: 1001 as const },
        baseColorRgba: (phase === "local" ? [104, 35, 24, 255] : [130, 46, 30, 255]) as [number, number, number, number], presentedRgba: pixelRgba(`${phase}-base-color-only`) };
    };
    return { requestedBackend: "webgpu" as const, viewName, lightingName: "ordinary" as const, pixel: [10, 10] as V2, local: sample("local"), shared: sample("shared"), flatNoShadow: { localRgba: pixelRgba("flat"), sharedRgba: pixelRgba("flat") } };
  });
  const evidence: R1WallPhaseEvidence = { schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-attribution", baselinePacketId: "2026-10-14-r1-s8",
    sourceGraphHash: baseline.identity.sourceGraphHash, atlasContentHash: baseline.identity.atlasContentHash, originalGeometryHash: material.immutable.geometryHash, sourceGeometryHash: hash("synthetic original selected source"), ...protectedHashes,
    phaseModel: { phaseSpace: "building-local-metres", bounds: { min: [-3, 0, -3], max: [3, 2.88, 3] }, groundYM: 0, rootMatrixWorld: [...I], objectMatrixWorld: [...I] },
    target: { batchId: "mesh.wall-panels", objectKind: "Mesh", instanceCount: 0, sourcePrimitiveCount: 265, sourceVertexCount: 6360, sourceTriangleCount: 3180 },
    sourceFaces, geometryStates, triangleWitnesses,
    continuityPairs: [{ id: "rear-boundary", facade: "rear", buildingPoint: [0.48, 0.48, 3], first: side("rear-first"), second: side("rear-second") },
      { id: "right-boundary", facade: "right", buildingPoint: [3, 0.48, 0.48], first: side("right-first"), second: side("right-second") }],
    wrapWitnesses: [{ id: "rear-u-period", firstTriangleWitnessId: "rear-u-start", secondTriangleWitnessId: "rear-second", periodOffset: [1, 0] },
      { id: "rear-height-period", firstTriangleWitnessId: "rear-first", secondTriangleWitnessId: "rear-v-end", periodOffset: [0, 1] }],
    pixelProfiles: captures.filter((row) => row.requestedBackend === "webgpu").map((row) => ({ requestedBackend: row.requestedBackend, viewName: row.viewName, lightingName: row.lightingName,
      condition: row.condition, screenshot: { file: row.screenshot.file, sha256: row.screenshot.sha256 }, axis: "x" as const, fixedPx: 10, firstPx: 10, rgba: [...pixelRgba(row.condition), ...pixelRgba(row.condition)] })),
    pixelMappings, captureCosts: captures.map((row) => ({ caseKey: wallPhaseCaseKey(row), allocationLedger: structuredClone(row.phaseState.allocationLedger) })),
    historicalBoundarySelections: (["rear", "right"] as const).map((viewName) => ({ id: `${viewName}-historical-boundary`, requestedBackend: "webgpu", viewName, lightingName: "ordinary",
      sides: [0, 1].map((side) => { const elementIndex = viewName === "rear" ? (side ? 5 : 1) : (side ? 7 : 3), f = boxFaces(elementIndex).find((f) => f.selected)!;
        return { pixel: [viewName === "rear" ? 697 + side : 742 + side, 590] as V2, elementIndex, faceIndex: f.faceIndex, ownedFacade: f.ownedFacade, selected: true,
          buildingPoint: (viewName === "rear" ? [side ? 0.5 : 0.46, 0.48, 3] : [3, 0.48, side ? 0.5 : 0.46]) as V3, buildingNormal: [...f.buildingNormal] as V3 }; }), bothSelected: true })),
    limitations: ["Synthetic mathematical/evidence contract fixture; actual same-point rays, PNG bytes and reference disposal require independent runtime proof."] };
  const source = structuredClone(baseline.source); source.replayCard = { ...cardFile.ref }; source.trackedDiffSha256 = hash("synthetic new diagnostic patch");
  source.diagnosticFiles.push(...R1_WALL_PHASE_NEW_SOURCE_FILES.map((file) => ({ file, sha256: hash(`synthetic ${file}`) })));
  const sourceBaseline = { schemaVersion: "0.1.0" as const, packetKind: "buildo-r1-s9-pre-edit-source-baseline" as const, packetId: "2026-10-14-r1-s9" as const, createdAt: "2026-10-15T01:06:31.010Z",
    sourceCommit: baseline.source.commit, baseline: { file: "synthetic prior S8 source proof", sha256: hash("prior proof") }, executionHelper: { file: "synthetic freeze helper", sha256: hash("freeze helper") },
    trackedPatch: { file: "synthetic original patch", sha256: baseline.source.trackedDiffSha256 },
    allSourceFiles: [...baseline.source.diagnosticFiles, ...Array.from({ length: 238 - baseline.source.diagnosticFiles.length }, (_, i) => ({ file: `synthetic-unused-${i}.ts`, sha256: hash(`unused${i}`) }))],
    sourceStability: { algorithm: "sha256-utf8-ordinal-posix-file-colon-sha256-lf" as const, fileCount: 238 as const, sha256: hash("synthetic source aggregate") },
    protectedArtifacts: 26 as const, protectedDiagnosticSources: 55 as const, humanReview: "pending" as const, scope: "Synthetic contract context, not ignored runtime proof." };
  const report: R1WallPhaseReport = { schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-discriminator", packetId: "synthetic-S9", createdAt: "2026-10-15T02:00:00.000Z", source,
    baseline: cardFile.ref, baselineSampling: samplingFile.ref, materialBaseline: materialFile.ref,
    sourceBaseline: { file: "test-results/r1-s9-2026-10-14/before-source/source-baseline.json", sha256: R1_WALL_PHASE_SOURCE_BASELINE_SHA256 },
    phaseEvidence: { file: "synthetic-wall-phase-attribution.json", sha256: hash("recomputed by verify helper") },
    controls: structuredClone(baseline.controls), resolvedSpec: structuredClone(baseline.resolvedSpec), identity: structuredClone(baseline.identity), materialAnchors: structuredClone(baseline.materialAnchors), freeze: structuredClone(baseline.freeze),
    geometryCheckpoint: { schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: cardFile.ref, sourceGraphHash: baseline.identity.sourceGraphHash,
      atlasContentHash: baseline.identity.atlasContentHash, geometryHash: material.immutable.geometryHash, atlasChannelDataHashes: material.after.channelDataHashes, ...material.immutable.cost },
    captures, pageErrors: [], humanReview: "pending", limitations: [...evidence.limitations] };
  return { report, evidence, sourceBaseline };
}
function verify(bundle: ReturnType<typeof makeBundle>) {
  // Rehash adversarial evidence too, so semantic rejection is not a stale-hash accident.
  bundle.report.phaseEvidence.sha256 = hash(JSON.stringify(bundle.evidence));
  return verifyR1WallPhaseReport({ report: bundle.report, baseline: { report: baseline, sha256: cardFile.ref.sha256 }, sampling: { report: sampling, sha256: samplingFile.ref.sha256 },
    material: { report: material, sha256: materialFile.ref.sha256 }, sourceBaseline: { report: bundle.sourceBaseline, sha256: R1_WALL_PHASE_SOURCE_BASELINE_SHA256 },
    evidence: { report: bundle.evidence, sha256: bundle.report.phaseEvidence.sha256 } });
}

describe("pure placed wall phase frames", () => {
  it.each<[WallPhaseFacade, V3, V3, V2]>([["front", [1, 0.5, -3], [0, 0, -1], [2, 0.5]], ["rear", [1, 0.5, 3], [0, 0, 1], [4, 0.5]],
    ["left", [-3, 0.5, 1], [-1, 0, 0], [4, 0.5]], ["right", [3, 0.5, 1], [1, 0, 0], [2, 0.5]]])("pins independent %s handed frame", (facade, buildingPoint, buildingNormal, expected) => {
    expect(deriveSharedWallPhaseUv({ facade, buildingPoint, buildingNormal, bounds: B, groundYM: 0 })).toEqual(expected);
  });
  it("removes root translation, rotation and scale while retaining placed object translation", () => {
    const root = [0, 0, -2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 10, 20, 30, 1];
    const object = [0, 0, -2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 6, 23, 26, 1];
    const result = projectWallPhasePoint({ sourcePoint: [1, 2, 3], sourceNormal: [0, 0, 1], rootMatrixWorld: root, objectMatrixWorld: object });
    expect(result.buildingPoint).toEqual([3, 3, 2]); expect(result.buildingNormal).toEqual([0, 0, 1]);
  });
  it("composes object and instance once without claiming live wall instance support", () => {
    const object = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1];
    const instance = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 2, 3, 1];
    const result = projectWallPhasePoint({ sourcePoint: [1, 0, 0], sourceNormal: [1, 0, 0], rootMatrixWorld: I, objectMatrixWorld: object, instanceMatrix: instance });
    expect(result.buildingPoint).toEqual([7, 12, 15]); expect(result.buildingNormal).toEqual([0, 0, -1]);
  });
  it("uses inverse-transpose normals under nonuniform scale", () => {
    const m = [...I]; m[0] = 2;
    const result = projectWallPhasePoint({ sourcePoint: [1, 1, 0], sourceNormal: [1, 1, 0], rootMatrixWorld: I, objectMatrixWorld: m });
    expect(result.buildingNormal[0]).toBeCloseTo(1 / Math.sqrt(5), 14); expect(result.buildingNormal[1]).toBeCloseTo(2 / Math.sqrt(5), 14);
  });
  it("preserves reflected placement handedness and input bytes", () => {
    const m = [...I]; m[0] = -1;
    const input = { sourcePoint: [2, 1, 0] as V3, sourceNormal: [1, 0, 0] as V3, rootMatrixWorld: [...I], objectMatrixWorld: m };
    const before = JSON.stringify(input), result = projectWallPhasePoint(input);
    expect(result.buildingPoint).toEqual([-2, 1, 0]); expect(result.buildingNormal).toEqual([-1, 0, 0]); expect(JSON.stringify(input)).toBe(before);
  });
  it.each([0, Number.NaN, Infinity])("rejects singular/nonfinite placements (%s)", (value) => {
    const m = [...I]; m[0] = value;
    expect(() => projectWallPhasePoint({ sourcePoint: [0, 0, 0], sourceNormal: [1, 0, 0], rootMatrixWorld: m, objectMatrixWorld: I })).toThrow();
  });
  it("rejects perspective matrices and zero normals", () => {
    const m = [...I]; m[3] = 0.1;
    expect(() => projectWallPhasePoint({ sourcePoint: [0, 0, 0], sourceNormal: [1, 0, 0], rootMatrixWorld: I, objectMatrixWorld: m })).toThrow();
    expect(() => projectWallPhasePoint({ sourcePoint: [0, 0, 0], sourceNormal: [0, 0, 0], rootMatrixWorld: I, objectMatrixWorld: I })).toThrow();
  });
  it.each([["wrong plane", [0, 1, 2], [0, 0, 1]], ["cap normal", [0, 1, 3], [0, 1, 0]], ["outside face", [5, 1, 3], [0, 0, 1]]] as const)("rejects selected %s", (_, p, n) => {
    expect(() => deriveSharedWallPhaseUv({ facade: "rear", buildingPoint: [...p], buildingNormal: [...n], bounds: B, groundYM: 0 })).toThrow();
  });
  it.each([-1.92, -0.96, 0, 0.96, 1.92])("wraps exact integer boundary %s without duplicate-texel assumptions", (m) => {
    const result = wallPhaseTileCoordinate(m); expect(result.tile).toBe(m / 0.96); expect(result.phase).toBe(0);
  });
  it("keeps genuine negative fractional wrap and height phase", () => {
    expect(wallPhaseTileCoordinate(-0.24)).toEqual({ tile: -1, phase: 0.75 });
    expect(wallPhaseTileCoordinate(0.72)).toEqual({ tile: 0, phase: 0.75 });
    expect(wallPhaseTileCoordinate(-0.96 - 0.001).tile).toBe(-2);
  });
  it("rejects unsafe spans and invalid physical tiles", () => {
    expect(() => wallPhaseTileCoordinate(Number.MAX_VALUE)).toThrow(); expect(() => wallPhaseTileCoordinate(1, 0)).toThrow();
  });
  it("rejects U/V subtraction overflow even when every input scalar is finite", () => {
    expect(() => deriveSharedWallPhaseUv({ facade: "rear", buildingPoint: [1e308, 1, 3], buildingNormal: [0, 0, 1], bounds: { min: [-1e308, 0, -3], max: [1e308, 3, 3] }, groundYM: 0 })).toThrow(/overflowed/);
    expect(() => deriveSharedWallPhaseUv({ facade: "rear", buildingPoint: [0, 1e308, 3], buildingNormal: [0, 0, 1], bounds: { min: [-3, -1e308, -3], max: [3, 1e308, 3] }, groundYM: -1e308 })).toThrow(/overflowed/);
  });
});

describe("S9 phase evidence and frozen report", () => {
  it("binds18cases, four owned frames, real-form same-point/period witnesses and honest phase/lifetime costs", () => {
    const b = makeBundle(); expect(verify(b).captures).toHaveLength(18);
    expect(b.evidence.sourceFaces).toHaveLength(1590);
    expect(b.evidence.continuityPairs[0].first.localMetreUv[0]).toBeCloseTo(0.96); expect(b.evidence.continuityPairs[0].second.localMetreUv[0]).toBe(0);
    expect(b.evidence.continuityPairs[0].first.sharedMetreUv).toEqual(b.evidence.continuityPairs[0].second.sharedMetreUv);
    expect(b.report.captures[0].phaseState.allocationLedger.peakBytes).toBe(3451908); expect(b.report.captures[5].phaseState.allocationLedger.peakBytes).toBe(4651958);
    expect(b.report.captures[3].screenshot.sha256).toBe(b.report.captures[4].screenshot.sha256);
  });
  const corruptions: [string, (b: ReturnType<typeof makeBundle>) => void][] = [
    ["duplicate source face", (b) => { b.evidence.sourceFaces[1] = structuredClone(b.evidence.sourceFaces[0]); }],
    ["protected cap UV", (b) => { b.evidence.sourceFaces.find((f) => !f.selected)!.sharedMetreUvs[0][0] += 0.1; }],
    ["wrong facade ownership", (b) => { b.evidence.sourceFaces.find((f) => f.selected)!.ownedFacade = "left"; }],
    ["unselected entire source box", (b) => { const f = b.evidence.sourceFaces.find((f) => f.elementIndex === 8 && f.selected)!; f.selected = false; f.facade = null; f.sharedMetreUvs = structuredClone(f.originalMetreUvs); }],
    ["two selected faces on one box", (b) => { const selected = b.evidence.sourceFaces.find((f) => f.elementIndex === 8 && f.selected)!; const i = b.evidence.sourceFaces.findIndex((f) => f.elementIndex === 8 && f.faceIndex === 0); b.evidence.sourceFaces[i] = { ...structuredClone(selected), faceIndex: 0, sourceVertexIndices: [192, 193, 194, 195] }; }],
    ["forged source vertex ownership", (b) => { b.evidence.sourceFaces[0].sourceVertexIndices[0] += 4; }],
    ["two identically wrong shared values", (b) => { b.evidence.continuityPairs[0].first.sharedMetreUv[0] += 0.1; b.evidence.continuityPairs[0].second.sharedMetreUv[0] += 0.1; }],
    ["same source piece masquerading as a boundary", (b) => { b.evidence.continuityPairs[0].second = structuredClone(b.evidence.continuityPairs[0].first); }],
    ["fake local reset", (b) => { b.evidence.continuityPairs[0].first.localMetreUv[0] += 0.2; }],
    ["missing wrap triangle", (b) => { b.evidence.wrapWitnesses[0].firstTriangleWitnessId = "absent"; }],
    ["zero period", (b) => { b.evidence.wrapWitnesses[0].periodOffset = [0, 0]; }],
    ["false height period", (b) => { b.evidence.wrapWitnesses[1].periodOffset = [1, 0]; }],
    ["wrong submitted normal", (b) => { b.evidence.triangleWitnesses[0].normals[0] = [0, 0, -1]; }],
    ["forged barycentric point", (b) => { b.evidence.triangleWitnesses[0].buildingPoint[0] += 0.1; }],
    ["forged barycentric weights", (b) => { b.evidence.triangleWitnesses[0].barycentric = [0.5, 0.5, 0.5]; }],
    ["protected geometry delta", (b) => { b.evidence.geometryStates[1].protectedGeometryHash = hash("changed protected geometry"); }],
    ["changed original IR", (b) => { b.evidence.geometryStates[1].originalIrHash = hash("changed IR"); }],
    ["changed instance transforms", (b) => { b.evidence.geometryStates[1].instanceTransformsHash = hash("changed instances"); }],
    ["changed protected source UV", (b) => { b.evidence.geometryStates[1].protectedUvHash = hash("changed caps"); }],
    ["false indexed triangle cost", (b) => { b.evidence.geometryStates[1].selectedIndexCount += 1; }],
    ["changed surface area", (b) => { b.evidence.geometryStates[1].selectedSurfaceAreaM2 += 1; }],
    ["changed surface bounds", (b) => { b.evidence.geometryStates[1].selectedBounds.max[0] += 0.01; }],
    ["shifted facade envelope", (b) => { b.evidence.phaseModel.bounds.max[1] += 0.1; }],
    ["shifted whole-tile ground anchor", (b) => { b.evidence.phaseModel.groundYM = -0.96; for (const f of b.evidence.sourceFaces) if (f.selected) f.sharedMetreUvs.forEach((uv) => { uv[1] += 0.96; }); }],
    ["changed normal area", (b) => { b.evidence.geometryStates[1].normalAreaDistribution[0].areaM2 += 1; }],
    ["flipped submitted winding metric", (b) => { b.evidence.geometryStates[1].minimumWindingNormalDot = -1; }],
    ["unchanged shared buffers", (b) => { b.evidence.geometryStates[1].selectedGeometryHash = b.evidence.geometryStates[0].selectedGeometryHash; }],
    ["changed graph", (b) => { b.report.identity.graphId += "-changed"; }],
    ["changed physical material anchor", (b) => { b.report.materialAnchors.atlasManifest.slots[0].physicalSizeM.width += 0.01; }],
    ["changed source fingerprint", (b) => { b.report.source.diagnosticFiles.find((r) => r.file.includes("atlasPacker"))!.sha256 = hash("changed packer"); }],
    ["omitted declared new source", (b) => { b.report.source.diagnosticFiles.pop(); }],
    ["unapproved extra source", (b) => { b.report.source.diagnosticFiles.push({ file: "unapproved.ts", sha256: hash("unapproved") }); }],
    ["changed baseline pointer", (b) => { b.report.baseline.sha256 = hash("another card"); }],
    ["changed source ledger pointer", (b) => { b.report.sourceBaseline.sha256 = hash("another ledger"); }],
    ["duplicate capture", (b) => { b.report.captures[1] = structuredClone(b.report.captures[0]); }],
    ["stale submitted frames", (b) => { b.report.captures[2].snapshot.frameCount = 2; b.report.captures[2].runtime.submittedFrameCount = 2; }],
    ["frame counter not bound to submission", (b) => { b.report.captures[2].runtime.submittedFrameCount += 1; }],
    ["actual backend fallback", (b) => { b.report.captures[2].runtime.actualBackend = "webgl"; }],
    ["changed restoration pixels", (b) => { b.report.captures[5].screenshot.sha256 = hash("not restored"); }],
    ["changed optional frozen snapshot field", (b) => { b.report.captures[2].snapshot.fallbackReason = b.report.captures[2].snapshot.fallbackReason === null ? undefined : null; }],
    ["changed restored geometry", (b) => { b.report.captures[5].phaseState.geometryHash = hash("not restored geometry"); }],
    ["changed nonwall state", (b) => { b.report.captures[2].wallState.nonWallStateHash = hash("other material changed"); }],
    ["extra material mutation", (b) => { b.report.captures[2].wallState.wallMaterials[0].normalScale[0] += 0.1; }],
    ["shadow caster mutation", (b) => { b.report.captures[4].wallState.wallRenderables[0].castShadow = false; }],
    ["fake raw channel encoding", (b) => { b.report.captures[0].wallState.wallMaterials[0].maps.baseColor = material.after.channelHashes.baseColor; }],
    ["unreported allocation lifetime", (b) => { b.report.captures[2].phaseState.allocationLedger.peakBytes += 1; }],
    ["geometry/instance byte-scope conflation", (b) => { b.report.captures[2].runtime.cost.activeSceneGeometryBufferBytes += 7552; }],
    ["missing guard overhead", (b) => { b.report.captures[2].runtime.cost.guardSnapshotBufferBytes = 0; }],
    ["false construction peak", (b) => { b.report.captures[2].runtime.cost.peakUnionBufferBytes += 1; }],
    ["arithmetic-valid local owned geometry leak", (b) => { b.report.captures[1].runtime.resources.ownedGeometryCreated = 1; b.report.captures[1].runtime.resources.ownedGeometryLive = 1; }],
    ["arithmetic-valid live temporary leak", (b) => { b.report.captures[2].runtime.resources.temporaryGeometryCreated += 1; b.report.captures[2].runtime.resources.temporaryGeometryLive = 1; }],
    ["wrong attached original reference", (b) => { b.report.captures[2].runtime.references.selectedOriginalGeometryAttached = true; }],
    ["unlinked ROI coordinate", (b) => { b.evidence.pixelMappings[0].shared.atlasPixel[0] += 1; }],
    ["unlinked pixel observation", (b) => { b.evidence.pixelMappings[0].shared.presentedRgba[0] += 1; }],
    ["unchanged mapped source color", (b) => { b.evidence.pixelMappings[0].shared.baseColorRgba = [...b.evidence.pixelMappings[0].local.baseColorRgba]; }],
    ["unlinked flat observation", (b) => { b.evidence.pixelMappings[0].flatNoShadow.sharedRgba[0] += 1; }],
    ["wrong pixel profile PNG", (b) => { b.evidence.pixelProfiles[0].screenshot.sha256 = hash("another PNG"); }],
    ["outside canvas profile", (b) => { b.evidence.pixelProfiles[0].firstPx = 1280; }],
    ["false historical selection conjunction", (b) => { b.evidence.historicalBoundarySelections[0].bothSelected = false; }],
    ["wrong historical pixel labels", (b) => { b.evidence.historicalBoundarySelections[0].sides[0].pixel[0] += 1; }],
    ["false historical cap selection", (b) => { b.evidence.historicalBoundarySelections[0].sides[0].selected = false; }],
    ["hidden resource leak arithmetic", (b) => { b.report.captures[5].runtime.resources.ownedGeometryLive += 1; }]
  ];
  it.each(corruptions)("rejects %s even when attribution is rehashed", (_, corrupt) => { const b = makeBundle(); corrupt(b); expect(() => verify(b)).toThrow(); });
  it.each(["originalSelectedAttributeReferencesIntact", "originalSelectedArrayReferencesIntact", "originalSelectedBufferReferencesIntact", "originalSelectedBytesIntact", "protectedGeometryReferencesIntact", "irReferencesIntact"] as const)("rejects failed actual reference guard %s", (key) => {
    const b = makeBundle(); b.report.captures[2].runtime.references[key] = false; expect(() => verify(b)).toThrow(/reference/);
  });
  it("records a genuine protected cap at the historical pixel without inventing a selected-face pass", () => {
    const b = makeBundle(), row = b.evidence.historicalBoundarySelections[0];
    row.sides[0] = { pixel: [697, 590], elementIndex: 1, faceIndex: 0, ownedFacade: "rear", selected: false, buildingPoint: [0.48, 0.48, 2.95], buildingNormal: [1, 0, 0] };
    row.bothSelected = false; expect(verify(b).captures).toHaveLength(18);
  });
  it("rejects stale local/shared presented PNGs despite correct changed CPU buffer hashes", () => {
    const b = makeBundle(); b.report.captures[2].screenshot.sha256 = b.report.captures[1].screenshot.sha256;
    b.evidence.pixelProfiles[2].screenshot.sha256 = b.report.captures[2].screenshot.sha256;
    expect(() => verify(b)).toThrow(/pixels must differ/);
  });
  it("rejects vertex-only fract masquerading as an interpolating clipped chart", () => {
    const b = makeBundle(), t = b.evidence.triangleWitnesses[0];
    t.positionsM = [[-0.16, 0.48, 3], [0.08, 0.48, 3], [-0.16, 0.58, 3]];
    t.metreUvs = t.positionsM.map((p) => sharedUv(p, "rear")); t.tile = [2, 0];
    t.atlasUvs = t.metreUvs.map((uv) => [(slot.rectPx.x + (uv[0] / 0.96 % 1) * slot.rectPx.width) / atlas.widthPx, (slot.rectPx.y + (uv[1] / 0.96 % 1) * slot.rectPx.height) / atlas.heightPx]);
    t.buildingPoint = [...t.positionsM[0]]; t.interpolatedAtlasUv = [...t.atlasUvs[0]];
    expect(() => verify(b)).toThrow(/separate clipped chart/);
  });
  it("rejects live instanced targets and unversioned/unknown contract data", () => {
    const b = makeBundle();
    expect(() => R1WallPhaseEvidenceSchema.parse({ ...b.evidence, target: { ...b.evidence.target, objectKind: "InstancedMesh", instanceCount: 1 } })).toThrow();
    expect(() => R1WallPhaseReportSchema.parse({ ...b.report, schemaVersion: "0.2.0" })).toThrow();
    expect(() => R1WallPhaseEvidenceSchema.parse({ ...b.evidence, fakeProof: true })).toThrow();
    expect(() => R1WallPhaseSourceBaselineSchema.parse({ ...b.sourceBaseline, allSourceFiles: [...b.sourceBaseline.allSourceFiles.slice(1), b.sourceBaseline.allSourceFiles[1]] })).toThrow();
  });
  it("deduplicates alias roles, retains guard overhead and rejects forged peak or duplicate buffer IDs", () => {
    const good = ledger(0, "local"); expect(R1WallPhaseAllocationLedgerSchema.parse(good).peakBytes).toBe(3451908);
    expect(() => R1WallPhaseAllocationLedgerSchema.parse({ ...good, active: ["original", "original"], activeBytes: 200 })).toThrow();
    expect(() => R1WallPhaseAllocationLedgerSchema.parse({ ...good, peak: ["original"], peakBytes: 100 })).toThrow();
    expect(() => R1WallPhaseAllocationLedgerSchema.parse({ ...good, buffers: [...good.buffers, good.buffers[0]] })).toThrow();
  });
  it("parses genuine positive canonical wraps while keeping negative wrap only in independent math goldens", () => {
    const b = makeBundle(); expect(verifyR1WallPhaseEvidence({ evidence: b.evidence, baseline, materialBaseline: material }).wrapWitnesses).toHaveLength(2);
    expect(b.evidence.triangleWitnesses.flatMap((t) => t.metreUvs).every((uv) => uv.every((v) => v >= 0))).toBe(true);
  });
});
