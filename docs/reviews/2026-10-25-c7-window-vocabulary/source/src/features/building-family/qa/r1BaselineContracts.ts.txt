import { z } from "zod";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { AtlasManifestSchema } from "../contracts/atlasManifest";
import { SchemaVersion010, SeedsSchema } from "../contracts/shared";

const finite = z.number().finite();
const vector3 = z.tuple([finite, finite, finite]);
const sha256 = z.string().regex(/^[a-f\d]{64}$/i);
export const R1ViewNameSchema = z.enum(["front", "three-quarter", "right", "rear"]);
export const R1LightingNameSchema = z.enum(["ordinary", "raking"]);
const backend = z.enum(["webgpu", "webgl"]);
const light = z.object({ position: vector3, target: vector3, color: vector3, intensity: finite.nonnegative() });

export const R1CaptureFreezeSchema = z.object({
  bounds: z.object({ min: vector3, max: vector3, center: vector3, size: vector3 }),
  views: z.array(z.object({
    name: R1ViewNameSchema, position: vector3, target: vector3, up: vector3,
    fov: finite.positive().lt(180), near: finite.positive(), far: finite.positive()
  })).length(4),
  lights: z.array(z.object({ name: z.string().min(1), key: light, fill: light })).length(8)
}).superRefine((value, context) => {
  if (new Set(value.views.map((view) => view.name)).size !== 4) {
    context.addIssue({ code: "custom", message: "All four distinct elevations are required." });
  }
  for (const view of value.views) {
    if (view.far <= view.near) context.addIssue({ code: "custom", message: "Camera far must exceed near." });
    for (const rig of ["ordinary", "raking"]) {
      if (value.lights.filter((item) => item.name === `${view.name}/${rig}`).length !== 1) {
        context.addIssue({ code: "custom", message: `Missing or duplicate light rig ${view.name}/${rig}.` });
      }
    }
  }
});

export const R1ReferenceSchema = z.object({
  id: z.string().min(1), role: z.enum(["primary", "secondary"]), file: z.string().min(1),
  sha256, widthPx: z.number().int().positive(), heightPx: z.number().int().positive(),
  cropPx: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }),
  observation: z.string().min(1)
}).superRefine((value, context) => {
  if (value.cropPx.x + value.cropPx.width > value.widthPx || value.cropPx.y + value.cropPx.height > value.heightPx) {
    context.addIssue({ code: "custom", message: "Reference crop must stay inside the original image." });
  }
});

const source = z.object({
  commit: z.string().regex(/^[a-f\d]{40}$/), trackedDiffSha256: sha256, dirtyPaths: z.array(z.string()),
  diagnosticFiles: z.array(z.object({ file: z.string(), sha256 })),
  replayCard: z.object({ file: z.string().min(1), sha256 }).optional(),
  documentId: z.literal("buildo-demo-family")
});
const controls = z.object({
  prompt: z.string().min(1), psgPresetId: z.literal("late19cCommercialDemo"),
  stylePackId: z.literal("late-19c-commercial-demo"), seeds: SeedsSchema,
  floorCount: z.number().int().positive(), bayCount: z.number().int().positive(),
  detailLevel: z.literal("high"), fidelityMode: z.literal("kit"), roofType: z.literal("flat"),
  trimDensity: z.literal("ornate"), windowFamily: z.string(), corniceFamily: z.string(),
  remoteMaterialEnabled: z.literal(false), lockedComponentKeys: z.array(z.string())
});
const identity = z.object({
  familyId: z.string(), buildingId: z.string(), graphId: z.string(), sourceGraphHash: sha256,
  catalogId: z.string(), atlasId: z.string(), atlasContentHash: sha256
});
const screenshot = z.object({ file: z.string().min(1), sha256, widthPx: z.number().int().positive(), heightPx: z.number().int().positive() });
const camera = z.object({
  type: z.literal("PerspectiveCamera"), isPerspectiveCamera: z.literal(true),
  position: vector3, target: vector3, up: vector3, fov: finite.positive(), near: finite.positive(), far: finite.positive(), aspect: finite.positive(),
  projectionMatrix: z.array(finite).length(16), matrixWorld: z.array(finite).length(16), matrixWorldInverse: z.array(finite).length(16)
}).superRefine((value, context) => {
  if (Math.abs(value.projectionMatrix[11] + 1) > 1e-6 || Math.abs(value.projectionMatrix[15]) > 1e-6) {
    context.addIssue({ code: "custom", message: "The main building capture requires a perspective projection, never a shadow camera." });
  }
});
// Detailed material diagnostics remain JSON data, never renderer objects or executable values.
const json = z.json();
export const R1BuildingSnapshotSchema = z.object({
  viewName: R1ViewNameSchema, lightingName: R1LightingNameSchema,
  frameCount: z.number().int().positive(), camera, key: light, fill: light,
  materials: z.array(json), canvas: z.object({
    width: z.number().int().positive(), height: z.number().int().positive(), cssWidth: finite.positive(), cssHeight: finite.positive(), devicePixelRatio: finite.positive(),
    backend, presentationMode: z.enum(["textured", "clay"]), revealThroughStage: z.literal("roof")
  }), actualBackend: backend, fallbackReason: z.string().nullable().optional()
});

export const R1_CRITERIA = [
  { id: "massing-base", label: "Massing and base", criterion: "Base, body and crown read immediately; commercial base differs from upper floors; roof does not bury the crown and shadows support the form." },
  { id: "facade-rhythm", label: "Facade rhythm", criterion: "Openings align and piers read as masonry; hierarchy avoids an equally heavy grid. Raking light reveals no clipping or misaligned joins." },
  { id: "opening-depth", label: "Opening depth and glazing", criterion: "Returns, frames and glass remain separate; glazing differs visibly from solid trim, and all facade glass faces outward correctly." },
  { id: "trim-restraint", label: "Trim layering and restraint", criterion: "A dominant crown has subordinate belts and window trim; ledges do not overwhelm the wall. Layers cast coherent shadows without floating or flicker." },
  { id: "material-scale", label: "Material scale and roles", criterion: "Wall brick courses use the existing 75 mm anchor; role/channel orientation is correct. One- and four-metre swatches have equal physical density, without sampling neighbouring slots." },
  { id: "side-rear", label: "Side and rear coherence", criterion: "Simpler elevations, corner and cornice returns and ground contact form competent generated architecture. No fidelity claim is made for reference elevations not shown." }
] as const;

export const R1AcceptanceCardSchema = z.object({
  schemaVersion: SchemaVersion010, packetKind: z.literal("buildo-r1-acceptance-card"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(), source, controls,
  resolvedSpec: BuildingFamilySpecSchema, identity, references: z.array(R1ReferenceSchema).length(2),
  materialAnchors: z.object({ brickCourseHeightM: z.literal(0.075), atlasManifest: AtlasManifestSchema }),
  freeze: R1CaptureFreezeSchema,
  captures: z.array(z.object({ screenshot, snapshot: R1BuildingSnapshotSchema })).length(18),
  criteria: z.array(z.object({ id: z.enum(R1_CRITERIA.map((row) => row.id)), label: z.string(), criterion: z.string(), review: z.literal("pending") })).length(6),
  humanReview: z.literal("pending"), scopeNote: z.string().min(1), pageErrors: z.array(z.string())
}).superRefine((value, context) => {
  if (new Set(value.criteria.map((row) => row.id)).size !== 6) context.addIssue({ code: "custom", message: "All six distinct criteria are required." });
  if (!value.references.some((row) => row.role === "primary") || !value.references.some((row) => row.role === "secondary")) {
    context.addIssue({ code: "custom", message: "Primary and secondary references are required." });
  }
  if (value.controls.bayCount !== value.resolvedSpec.facade.frontBayCount || value.controls.floorCount !== value.resolvedSpec.massing.floorCount) {
    context.addIssue({ code: "custom", message: "Baseline floor and bay inputs must match the resolved building." });
  }
  const cases = value.captures.map(({ snapshot: row }) => `${row.actualBackend}/${row.canvas.presentationMode}/${row.viewName}/${row.lightingName}`);
  const expectedCases = ["textured", "clay"].flatMap((mode) => [
    ...value.freeze.views.flatMap((view) => ["ordinary", "raking"].map((rig) => `webgpu/${mode}/${view.name}/${rig}`)),
    `webgl/${mode}/three-quarter/ordinary`
  ]);
  if (new Set(cases).size !== 18 || expectedCases.some((item) => !cases.includes(item))) {
    context.addIssue({ code: "custom", message: "The full frozen building capture matrix is required." });
  }
  const matches = (first: number[], second: number[]) => first.every((number, index) => Math.abs(number - second[index]) < 1e-6);
  for (const { snapshot: row } of value.captures) {
    const view = value.freeze.views.find((entry) => entry.name === row.viewName);
    const rig = value.freeze.lights.find((entry) => entry.name === `${row.viewName}/${row.lightingName}`);
    if (row.canvas.backend !== row.actualBackend || !view || !rig ||
        !matches(row.camera.position, view.position) || !matches(row.camera.target, view.target) ||
        !matches(row.key.position, rig.key.position) || !matches(row.fill.position, rig.fill.position)) {
      context.addIssue({ code: "custom", message: "Rendered camera, rig and backend must match the frozen capture labels." });
    }
  }
});

const uvPair = z.tuple([finite, finite]);
const textureSettings = z.object({
  wrapS: z.number().int(), wrapT: z.number().int(), colorSpace: z.string(), flipY: z.boolean(),
  minFilter: z.number().int(), magFilter: z.number().int(), generateMipmaps: z.boolean()
});
const wallSwatchId = z.enum(["mesh.wall-1m", "mesh.wall-4m", "instances.wall-scaled"]);
const byte = z.number().int().min(0).max(255);
export const R1PackedCheckerRowSchema = z.object({
  rowFraction: z.union([z.literal(0.30), z.literal(0.45), z.literal(0.60)]),
  fixedPx: z.number().int().nonnegative(), atlasY: z.number().int().nonnegative(),
  rgba: z.array(z.tuple([byte, byte, byte, byte])).min(2)
});

export function packedCheckerBoundaryColumns(rgba: readonly (readonly number[])[]): number[] {
  const chromatic = (rgb: readonly number[]) => Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) >= 20;
  return rgba.flatMap((pixel, column) => {
    const previous = rgba[(column + rgba.length - 1) % rgba.length];
    return chromatic(pixel) && chromatic(previous) &&
      Math.max(...pixel.slice(0, 3).map((channel, index) => Math.abs(channel - previous[index]))) > 24 ? [column] : [];
  });
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function packedCheckerPeriodExpectation(
  rows: readonly z.infer<typeof R1PackedCheckerRowSchema>[], physicalTileWidthM: number
) {
  const sourcePeriodicRows = rows.map((row) => {
    const boundaryColumns = packedCheckerBoundaryColumns(row.rgba);
    return { ...row, boundaryColumns, periodicBoundaryCount: boundaryColumns.length };
  });
  const spacing = sourcePeriodicRows.flatMap((row) => row.boundaryColumns.map((column, index) => {
    const next = row.boundaryColumns[(index + 1) % row.boundaryColumns.length];
    return ((next > column ? next - column : row.rgba.length - column + next) / row.rgba.length) * physicalTileWidthM;
  }));
  return { sourcePeriodicRows, expectedSpacingM: median(spacing),
    expectedDensityPerM: (median(sourcePeriodicRows.map((row) => row.periodicBoundaryCount)) ?? 0) / physicalTileWidthM };
}
export const R1CheckerMeasurementSchema = z.object({
  id: wallSwatchId,
  scans: z.array(z.object({
    rowFraction: finite.positive().lt(1), startPx: finite, endPx: finite, fixedPx: finite,
    boundariesPx: z.array(finite), boundaryCount: z.number().int().nonnegative(),
    consecutiveSpacingM: z.array(finite.positive()), medianSpacingM: finite.positive().nullable(),
    densityPerM: finite.nonnegative(), validPixelFraction: finite.nonnegative().max(1)
  })).length(3),
  medianSpacingM: finite.positive().nullable(), medianDensityPerM: finite.nonnegative()
});
export const R1CheckerProbeSchema = z.object({
  method: z.literal("presented-png-chromatic-horizontal-runs-v1"),
  swatches: z.array(R1CheckerMeasurementSchema).length(3)
}).superRefine((value, context) => {
  if (new Set(value.swatches.map((row) => row.id)).size !== 3) {
    context.addIssue({ code: "custom", message: "All three distinct wall swatches are required." });
  }
});
export const R1SamplingSnapshotSchema = z.object({
  backendRequested: backend, backendActual: backend, fallbackReason: z.string().nullable(),
  source: z.enum(["procedural", "controlled"]), canvasSizePx: z.tuple([finite.positive(), finite.positive()]),
  pixelsPerMeter: finite.positive(), atlasId: z.string().min(1), atlasContentHash: sha256,
  sourceHashes: z.array(z.object({ sourceId: z.string(), providerId: z.string(), requestHash: sha256, contentHash: sha256 })).min(1),
  channelHashes: z.object({ baseColor: sha256, normal: sha256, orm: sha256, height: sha256, opacity: sha256 }),
  sourceBytesUnchanged: z.literal(true),
  textureSettings: z.object({ baseColor: textureSettings, normal: textureSettings, orm: textureSettings, height: textureSettings, opacity: textureSettings }),
  swatches: z.array(z.object({
    id: z.string().min(1), label: z.string(), worldSizeM: vector3, instanceScale: vector3,
    slot: z.object({ id: z.string(), role: z.string(), physicalSizeM: z.object({ width: finite.positive(), height: finite.positive() }),
      rectPx: z.object({ x: finite.nonnegative(), y: finite.nonnegative(), width: finite.positive(), height: finite.positive() }), uvMode: z.string(), periodicity: z.string() }),
    inputUv: z.array(uvPair).min(1), adaptedUv: z.array(uvPair).min(1), frontVertexIndices: z.array(z.number().int().nonnegative()),
    sourceFrontVertexIndices: z.array(z.number().int().nonnegative()).optional(),
    packedCheckerRows: z.array(R1PackedCheckerRowSchema).length(3).optional(),
    wallAtlasSampling: z.object({
      schemaVersion: SchemaVersion010, algorithm: z.literal("cpu-tile-clipping-v1"),
      uvSpace: z.enum(["meters", "normalized"]), scale: vector3,
      sourceVertexCount: z.number().int().positive(), sourceTriangleCount: z.number().int().positive(),
      renderedVertexCount: z.number().int().positive(), renderedTriangleCount: z.number().int().positive(),
      repeatU: z.boolean(), repeatV: z.boolean()
    }).optional(),
    expectedTileExtents: uvPair, observedSlotUvSpan: uvPair,
    screenRectPx: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }),
    material: json
  }).passthrough()).min(3),
  checkerProbe: R1CheckerProbeSchema.optional(),
  rasterProbe: z.object({
    method: z.literal("presented-png-interior-rgb-step-24-v1"),
    swatches: z.array(z.object({ id: z.string(), scans: z.array(z.object({
      axis: z.enum(["horizontal", "vertical"]), startPx: finite, endPx: finite, fixedPx: finite,
      firstRgba: z.array(finite).length(4), boundariesPx: z.array(finite), boundaryCount: z.number().int().nonnegative(), consecutiveSpacingM: z.array(finite)
    })).length(2) })).min(3)
  }).optional()
}).superRefine((value, context) => {
  if (value.backendRequested !== value.backendActual) context.addIssue({ code: "custom", message: "A fallback cannot count as proof of the requested backend." });
});

export const R1WallSamplingComparisonSchema = z.object({
  schemaVersion: SchemaVersion010, packetKind: z.literal("buildo-r1-wall-sampling-comparison"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(), source,
  baseline: z.object({
    acceptanceCard: z.object({ file: z.string().min(1), sha256 }),
    samplingReport: z.object({ file: z.string().min(1), sha256 })
  }),
  sourceGraphHash: sha256, controlsUnchanged: z.literal(true), freezeUnchanged: z.literal(true),
  backends: z.array(z.object({
    requestedBackend: backend, actualBackend: backend,
    atlasContentHash: sha256, atlasUnchanged: z.literal(true), materialSourcesUnchanged: z.literal(true), channelsUnchanged: z.literal(true),
    rows: z.array(z.object({
      id: wallSwatchId, worldWidthM: finite.positive(), physicalTileWidthM: finite.positive(), pixelsPerMeter: finite.positive(),
      expectedDensityMethod: z.literal("packed-rgba-periodic-rgb-step-24-v1"),
      expectedSpacingM: finite.positive(), expectedDensityPerM: finite.positive(),
      sourcePeriodicRows: z.array(R1PackedCheckerRowSchema.extend({
        boundaryColumns: z.array(z.number().int().nonnegative()), periodicBoundaryCount: z.number().int().nonnegative()
      })).length(3),
      spacingRangeM: z.tuple([finite.positive(), finite.positive()]),
      densityRangePerM: z.tuple([finite.nonnegative(), finite.positive()]),
      before: R1CheckerMeasurementSchema, after: R1CheckerMeasurementSchema,
      beforeDensityRatioToOneMetre: finite.nonnegative().nullable(), afterDensityRatioToOneMetre: finite.nonnegative().nullable(),
      spacingPass: z.boolean(), densityPass: z.boolean(), pass: z.boolean()
    })).length(3)
  })).length(2),
  pass: z.boolean(), humanReview: z.literal("pending"), limitations: z.array(z.string().min(1)).min(1)
}).superRefine((value, context) => {
  if (new Set(value.backends.map((row) => row.requestedBackend)).size !== 2) {
    context.addIssue({ code: "custom", message: "Both actual renderer backends are required." });
  }
  for (const result of value.backends) {
    if (result.requestedBackend !== result.actualBackend || new Set(result.rows.map((row) => row.id)).size !== 3) {
      context.addIssue({ code: "custom", message: "Backend labels and all three wall rows must match their evidence." });
    }
    for (const row of result.rows) {
      const expected = packedCheckerPeriodExpectation(row.sourcePeriodicRows, row.physicalTileWidthM);
      const close = (first: number, second: number) => Math.abs(first - second) < 1e-6;
      const pixelToleranceM = 2 / row.pixelsPerMeter;
      const scanWidthM = (row.after.scans[0].endPx - row.after.scans[0].startPx) / row.pixelsPerMeter;
      const spacingRange = expected.expectedSpacingM === null ? null :
        [Math.max(1e-6, expected.expectedSpacingM - pixelToleranceM), expected.expectedSpacingM + pixelToleranceM];
      const densityTolerance = 2 / scanWidthM;
      const densityRange = [Math.max(0, expected.expectedDensityPerM - densityTolerance), expected.expectedDensityPerM + densityTolerance];
      if (new Set(row.sourcePeriodicRows.map((item) => item.rowFraction)).size !== 3 ||
          expected.sourcePeriodicRows.some((item, index) => item.periodicBoundaryCount !== row.sourcePeriodicRows[index].periodicBoundaryCount ||
            JSON.stringify(item.boundaryColumns) !== JSON.stringify(row.sourcePeriodicRows[index].boundaryColumns)) ||
          !spacingRange || !close(row.expectedSpacingM, expected.expectedSpacingM!) || !close(row.expectedDensityPerM, expected.expectedDensityPerM) ||
          row.spacingRangeM.some((item, index) => !close(item, spacingRange[index])) ||
          row.densityRangePerM.some((item, index) => !close(item, densityRange[index]))) {
        context.addIssue({ code: "custom", message: "Expected wall density and tolerances must derive from the packed periodic RGBA rows." });
      }
      const spacing = row.after.medianSpacingM;
      const density = row.after.medianDensityPerM;
      const ratio = row.afterDensityRatioToOneMetre;
      const spacingPass = spacing !== null && spacing >= row.spacingRangeM[0] && spacing <= row.spacingRangeM[1];
      const densityPass = density >= row.densityRangePerM[0] && density <= row.densityRangePerM[1] &&
        ratio !== null && ratio >= 0.8 && ratio <= 1.2;
      if (row.before.id !== row.id || row.after.id !== row.id || row.spacingRangeM[0] > row.spacingRangeM[1] ||
          row.densityRangePerM[0] > row.densityRangePerM[1] || row.spacingPass !== spacingPass ||
          row.densityPass !== densityPass || row.pass !== (spacingPass && densityPass)) {
        context.addIssue({ code: "custom", message: "Wall gate labels and results must agree with measured spacing and density." });
      }
    }
  }
  if (value.pass !== value.backends.every((result) => result.rows.every((row) => row.pass))) {
    context.addIssue({ code: "custom", message: "The comparison passes only when every wall row passes on both backends." });
  }
});

export const R1SamplingReportSchema = z.object({
  schemaVersion: SchemaVersion010, packetKind: z.literal("buildo-r1-material-sampling-baseline"),
  packetId: z.string().min(1), createdAt: z.iso.datetime(), source, controls,
  captures: z.array(z.object({ requestedBackend: backend, sourceName: z.enum(["procedural", "controlled"]), screenshot, snapshot: R1SamplingSnapshotSchema })).length(4),
  conclusions: z.array(z.string().min(1)), humanReview: z.literal("pending"), pageErrors: z.array(z.string())
}).superRefine((value, context) => {
  const combinations = new Set(value.captures.map((row) => `${row.requestedBackend}/${row.sourceName}`));
  if (combinations.size !== 4) context.addIssue({ code: "custom", message: "Both atlas sources must be captured on both backends." });
  for (const row of value.captures) {
    if (row.requestedBackend !== row.snapshot.backendActual || row.sourceName !== row.snapshot.source) {
      context.addIssue({ code: "custom", message: "Capture labels must match the actual renderer and source." });
    }
  }
});
