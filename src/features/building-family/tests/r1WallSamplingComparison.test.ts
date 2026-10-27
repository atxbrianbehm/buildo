import {
  packedCheckerBoundaryColumns,
  packedCheckerPeriodExpectation,
  R1PackedCheckerRowSchema,
  R1WallSamplingComparisonSchema
} from "../qa/r1BaselineContracts";

// A row produced by the unchanged 32px checker, periodic edge blending, and
// nearest packing into the real 27px wall slot. The bridge at column zero is
// another visible transition; eight nominal cells therefore give nine edges.
const packedRgb = [
  [137, 146, 50], [29, 83, 41], [29, 83, 41], [29, 83, 41],
  [64, 184, 92], [64, 184, 92], [64, 184, 92],
  [29, 83, 41], [29, 83, 41], [29, 83, 41], [29, 83, 41],
  [64, 184, 92], [64, 184, 92], [64, 184, 92],
  [110, 94, 27], [110, 94, 27], [110, 94, 27],
  [244, 209, 59], [244, 209, 59], [244, 209, 59], [244, 209, 59],
  [110, 94, 27], [110, 94, 27], [110, 94, 27],
  [244, 209, 59], [244, 209, 59], [244, 209, 59]
];
const fractions = [0.30, 0.45, 0.60] as const;
const wallIds = ["mesh.wall-1m", "mesh.wall-4m", "instances.wall-scaled"] as const;

function sourceRows() {
  return fractions.map((rowFraction, index) => R1PackedCheckerRowSchema.parse({
    rowFraction, fixedPx: index * 10 + 10, atlasY: index + 15,
    rgba: packedRgb.map((rgb) => [...rgb, 255])
  }));
}

function measurement(id: typeof wallIds[number], width: number, count: number, spacing: number) {
  return {
    id,
    scans: fractions.map((rowFraction, index) => ({
      rowFraction, startPx: 0, endPx: width * 100, fixedPx: index * 10 + 10,
      boundariesPx: Array.from({ length: count }, (_, offset) => offset * spacing * 100),
      boundaryCount: count, consecutiveSpacingM: Array.from({ length: Math.max(0, count - 1) }, () => spacing),
      medianSpacingM: spacing, densityPerM: count / width, validPixelFraction: 1
    })),
    medianSpacingM: spacing, medianDensityPerM: count / width
  };
}

function makeComparison() {
  const hash = "a".repeat(64);
  const expected = packedCheckerPeriodExpectation(sourceRows(), 0.96);
  const rows = wallIds.map((id, index) => {
    const width = index ? 4 : 1;
    const before = measurement(id, width, index === 1 ? 2 : 8, index === 1 ? 2.6675 : index === 2 ? 0.44 : 0.11);
    const after = measurement(id, width, index ? 37 : 9, 0.11);
    return {
      id, worldWidthM: width, physicalTileWidthM: 0.96, pixelsPerMeter: 100,
      expectedDensityMethod: "packed-rgba-periodic-rgb-step-24-v1", ...expected,
      spacingRangeM: [expected.expectedSpacingM! - 0.02, expected.expectedSpacingM! + 0.02],
      densityRangePerM: [expected.expectedDensityPerM - 2 / width, expected.expectedDensityPerM + 2 / width],
      before, after, beforeDensityRatioToOneMetre: before.medianDensityPerM / 8,
      afterDensityRatioToOneMetre: after.medianDensityPerM / 9,
      spacingPass: true, densityPass: true, pass: true
    };
  });
  return {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-sampling-comparison", packetId: "test-wall-repair", createdAt: "2026-10-14T12:00:00.000Z",
    source: { commit: "a".repeat(40), trackedDiffSha256: hash, dirtyPaths: [], diagnosticFiles: [], documentId: "buildo-demo-family" },
    baseline: { acceptanceCard: { file: "acceptance-card.json", sha256: hash }, samplingReport: { file: "sampling-report.json", sha256: hash } },
    sourceGraphHash: hash, controlsUnchanged: true, freezeUnchanged: true,
    backends: ["webgpu", "webgl"].map((backend) => ({
      requestedBackend: backend, actualBackend: backend, atlasContentHash: hash,
      atlasUnchanged: true, materialSourcesUnchanged: true, channelsUnchanged: true, rows: structuredClone(rows)
    })),
    pass: true, humanReview: "pending", limitations: ["Horizontal sampling evidence; architectural review remains pending."]
  };
}

describe("wall sampling repair evidence", () => {
  it("counts the packed seam bridge and the end-to-start transition in a full period", () => {
    const rows = sourceRows();
    expect(packedCheckerBoundaryColumns(rows[0].rgba)).toEqual([0, 1, 4, 7, 11, 14, 17, 21, 24]);
    const expected = packedCheckerPeriodExpectation(rows, 0.96);
    expect(expected.expectedDensityPerM).toBeCloseTo(9.375);
    expect(expected.expectedSpacingM).toBeCloseTo(0.96 * 3 / 27);
  });

  it("accepts source-derived physical density on all three walls and both actual backends", () => {
    expect(R1WallSamplingComparisonSchema.safeParse(makeComparison()).success).toBe(true);
  });

  it("rejects a missing or duplicate backend, missing wall, or fallback label", () => {
    const missingBackend = makeComparison();
    missingBackend.backends.pop();
    const duplicateBackend = makeComparison();
    duplicateBackend.backends[1] = duplicateBackend.backends[0];
    const missingWall = makeComparison();
    missingWall.backends[0].rows.pop();
    const duplicateWall = makeComparison();
    duplicateWall.backends[0].rows[2] = duplicateWall.backends[0].rows[0];
    const fallback = makeComparison();
    fallback.backends[0].actualBackend = "webgl";
    for (const report of [missingBackend, duplicateBackend, missingWall, duplicateWall, fallback]) {
      expect(R1WallSamplingComparisonSchema.safeParse(report).success).toBe(false);
    }
  });

  it("records a failed wall without allowing a false aggregate or per-wall pass", () => {
    const failed = makeComparison();
    const row = failed.backends[0].rows[1];
    row.after = measurement(row.id, 4, 8, 0.44);
    row.afterDensityRatioToOneMetre = 2 / 9;
    row.spacingPass = false;
    row.densityPass = false;
    row.pass = false;
    failed.pass = false;
    expect(R1WallSamplingComparisonSchema.safeParse(failed).success).toBe(true);
    expect(R1WallSamplingComparisonSchema.safeParse({ ...failed, pass: true }).success).toBe(false);
    row.pass = true;
    expect(R1WallSamplingComparisonSchema.safeParse(failed).success).toBe(false);
  });

  it("rejects nominal eight-cell expectations or widened tolerances that disagree with packed bytes", () => {
    const nominal = makeComparison();
    nominal.backends[0].rows[1].expectedDensityPerM = 8 / 0.96;
    const widened = makeComparison();
    widened.backends[0].rows[1].densityRangePerM = [0, 100];
    const incorrectCount = makeComparison();
    incorrectCount.backends[0].rows[1].sourcePeriodicRows[0].periodicBoundaryCount = 8;
    for (const report of [nominal, widened, incorrectCount]) {
      expect(R1WallSamplingComparisonSchema.safeParse(report).success).toBe(false);
    }
  });

  it("rejects missing packed rows, duplicate phases, and invalid RGBA bytes", () => {
    const missing = makeComparison();
    missing.backends[0].rows[0].sourcePeriodicRows.pop();
    const duplicate = makeComparison();
    duplicate.backends[0].rows[0].sourcePeriodicRows[2] = duplicate.backends[0].rows[0].sourcePeriodicRows[0];
    const invalidByte = makeComparison();
    invalidByte.backends[0].rows[0].sourcePeriodicRows[0].rgba[0][0] = 256;
    for (const report of [missing, duplicate, invalidByte]) {
      expect(R1WallSamplingComparisonSchema.safeParse(report).success).toBe(false);
    }
    expect(R1PackedCheckerRowSchema.safeParse({ ...sourceRows()[0], rgba: [] }).success).toBe(false);
  });
});
