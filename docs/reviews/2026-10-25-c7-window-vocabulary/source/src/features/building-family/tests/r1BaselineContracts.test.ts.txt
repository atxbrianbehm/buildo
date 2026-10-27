import {
  R1AcceptanceCardSchema,
  R1CaptureFreezeSchema,
  R1ReferenceSchema,
  R1SamplingReportSchema,
  R1SamplingSnapshotSchema,
  R1_CRITERIA
} from "../qa/r1BaselineContracts";

const hash = "a".repeat(64);
const viewNames = ["front", "three-quarter", "right", "rear"] as const;
const rigNames = ["ordinary", "raking"] as const;
const seeds = { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" };

function makeFreeze() {
  const light = { position: [10, 20, -10], target: [0, 6, 0], color: [1, 1, 1], intensity: 1 };
  return {
    bounds: { min: [-8, 0, -5], max: [8, 12, 5], center: [0, 6, 0], size: [16, 12, 10] },
    views: viewNames.map((name) => ({ name, position: [0, 6, -30], target: [0, 6, 0], up: [0, 1, 0], fov: 42, near: 0.1, far: 200 })),
    lights: viewNames.flatMap((name) => rigNames.map((rig) => ({ name: `${name}/${rig}`, key: light, fill: light })))
  };
}

function makeReference(role: "primary" | "secondary" = "primary") {
  return {
    id: role, role, file: `docs/ref/${role}.jpg`, sha256: hash,
    widthPx: 960, heightPx: 1280,
    cropPx: { x: 80, y: 145, width: 840, height: 945 },
    observation: "Use the observed base, body and crown hierarchy."
  };
}

function makeBuildingCapture(
  viewName: typeof viewNames[number], lightingName: typeof rigNames[number],
  presentationMode: "textured" | "clay", backend: "webgpu" | "webgl"
) {
  const freeze = makeFreeze();
  const view = freeze.views.find((row) => row.name === viewName)!;
  const rig = freeze.lights.find((row) => row.name === `${viewName}/${lightingName}`)!;
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const projectionMatrix = [1.628, 0, 0, 0, 0, 2.605, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0];
  return {
    screenshot: { file: `${backend}-${presentationMode}-${viewName}-${lightingName}.png`, sha256: hash, widthPx: 1280, heightPx: 800 },
    snapshot: {
      viewName, lightingName, frameCount: 1,
      camera: { ...view, type: "PerspectiveCamera", isPerspectiveCamera: true, aspect: 1.6, projectionMatrix, matrixWorld: matrix, matrixWorldInverse: matrix },
      key: rig.key, fill: rig.fill, materials: [], actualBackend: backend, fallbackReason: null,
      canvas: { width: 1280, height: 800, cssWidth: 1280, cssHeight: 800, devicePixelRatio: 1, backend, presentationMode, revealThroughStage: "roof" }
    }
  };
}

function makeCard() {
  return {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-acceptance-card", packetId: "test-r1", createdAt: "2026-10-14T12:00:00.000Z",
    source: {
      commit: "a".repeat(40), dirtyPaths: [], trackedDiffSha256: hash,
      diagnosticFiles: [{ file: "scripts/capture-r1-baseline.mjs", sha256: hash }], documentId: "buildo-demo-family"
    },
    controls: {
      prompt: "four floors, 7 bays, brick, flat roof, ornate trim", psgPresetId: "late19cCommercialDemo", stylePackId: "late-19c-commercial-demo", seeds,
      floorCount: 4, bayCount: 7, detailLevel: "high", fidelityMode: "kit", roofType: "flat", trimDensity: "ornate",
      windowFamily: "tall-arched", corniceFamily: "bracketed-metal", remoteMaterialEnabled: false, lockedComponentKeys: []
    },
    resolvedSpec: {
      schemaVersion: "0.1.0", familyId: "family", sourceIntentHash: hash, stylePackId: "late-19c-commercial-demo", seeds,
      massing: { widthM: 16, depthM: 10, floorCount: 4, floorHeightsM: [3, 3, 3, 3], parapetHeightM: 0.5, roof: { type: "flat" } },
      facade: { frontBayCount: 7, sideBaySpacingM: 2, groundFloorRatio: 1.2, corniceHeightM: 0.6, symmetry: 1 },
      selectedFamilies: { wall: "brick", roof: "flat", window: "tall-arched", door: "storefront", cornice: "bracketed-metal", trim: "ornate" },
      materialParameters: {}, componentParameters: {}, variationPolicy: {}, locks: [], diagnostics: []
    },
    identity: { familyId: "family", buildingId: "building", graphId: "graph", sourceGraphHash: hash, catalogId: "catalog", atlasId: "atlas", atlasContentHash: hash },
    materialAnchors: {
      brickCourseHeightM: 0.075,
      atlasManifest: {
        schemaVersion: "0.1.0", atlasId: "atlas", widthPx: 128, heightPx: 128, paddingPx: 4,
        channels: ["baseColor", "normal", "orm", "height", "opacity"], slots: []
      }
    },
    references: [makeReference(), makeReference("secondary")], freeze: makeFreeze(),
    captures: (["textured", "clay"] as const).flatMap((mode) => [
      ...viewNames.flatMap((view) => rigNames.map((rig) => makeBuildingCapture(view, rig, mode, "webgpu"))),
      makeBuildingCapture("three-quarter", "ordinary", mode, "webgl")
    ]),
    criteria: R1_CRITERIA.map((criterion) => ({ ...criterion, review: "pending" })),
    humanReview: "pending", scopeNote: "Preparation only; visual acceptance is pending.", pageErrors: []
  };
}

function makeSamplingSnapshot(backend: "webgpu" | "webgl", source: "procedural" | "controlled") {
  const settings = { wrapS: 1001, wrapT: 1001, colorSpace: "", flipY: false, minFilter: 1003, magFilter: 1003, generateMipmaps: false };
  return {
    backendRequested: backend, backendActual: backend, fallbackReason: null, source,
    canvasSizePx: [1280, 800], pixelsPerMeter: 100, atlasId: "atlas", atlasContentHash: hash,
    sourceHashes: [{ sourceId: "wall-source", providerId: "procedural", requestHash: hash, contentHash: hash }],
    channelHashes: { baseColor: hash, normal: hash, orm: hash, height: hash, opacity: hash }, sourceBytesUnchanged: true,
    textureSettings: { baseColor: { ...settings, colorSpace: "srgb" }, normal: settings, orm: settings, height: settings, opacity: settings },
    swatches: [
      { id: "one-metre", width: 1, instanceScale: [1, 1, 1] },
      { id: "four-metre", width: 4, instanceScale: [1, 1, 1] },
      { id: "scaled-instance", width: 4, instanceScale: [4, 1, 1] }
    ].map(({ id, width, instanceScale }) => ({
      id, label: id, worldSizeM: [width, 1, 0.02], instanceScale,
      slot: { id: "wall", role: "wall", physicalSizeM: { width: 0.96, height: 0.96 },
        rectPx: { x: 0, y: 0, width: 256, height: 256 }, uvMode: "repeat", periodicity: "xy" },
      inputUv: [[0, 0], [width, 1]], adaptedUv: [[0, 0], [0.25, 0.25]], frontVertexIndices: [0, 1],
      expectedTileExtents: [width / 0.96, 1 / 0.96], observedSlotUvSpan: [1, 1],
      screenRectPx: { x: 10, y: 10, width: width * 100, height: 100 }, material: { roughness: 0.82 }
    }))
  };
}

function makeSamplingReport() {
  const { source, controls } = makeCard();
  return {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-material-sampling-baseline", packetId: "test-r1-sampling", createdAt: "2026-10-14T12:00:00.000Z",
    source, controls,
    captures: (["webgpu", "webgl"] as const).flatMap((backend) => (["procedural", "controlled"] as const).map((sourceName) => ({
      requestedBackend: backend, sourceName,
      screenshot: { file: `${backend}-${sourceName}.png`, sha256: hash, widthPx: 1280, heightPx: 800 },
      snapshot: makeSamplingSnapshot(backend, sourceName)
    }))),
    conclusions: ["The unchanged adapter still needs a sampling repair."], humanReview: "pending", pageErrors: []
  };
}

describe("R1 baseline artifact contracts", () => {
  it("accepts a versioned preparation card with explicit pending human review", () => {
    expect(R1AcceptanceCardSchema.safeParse(makeCard()).success).toBe(true);
  });

  it.each([
    { x: 950, y: 0, width: 20, height: 10 },
    { x: 0, y: 1270, width: 10, height: 20 }
  ])("rejects a reference crop that crosses the original image boundary", (cropPx) => {
    expect(R1ReferenceSchema.safeParse({ ...makeReference(), cropPx }).success).toBe(false);
  });

  it("rejects duplicate or missing elevations and light rigs", () => {
    const duplicateView = makeFreeze();
    duplicateView.views[3].name = "front";
    const missingView = makeFreeze();
    missingView.views.pop();
    const duplicateRig = makeFreeze();
    duplicateRig.lights[7].name = "front/ordinary";
    const missingRig = makeFreeze();
    missingRig.lights.pop();
    for (const freeze of [duplicateView, missingView, duplicateRig, missingRig]) {
      expect(R1CaptureFreezeSchema.safeParse(freeze).success).toBe(false);
    }
  });

  it.each([0.1, 0.01])("rejects a camera whose far plane does not exceed its near plane", (far) => {
    const freeze = makeFreeze();
    freeze.views[0].far = far;
    expect(R1CaptureFreezeSchema.safeParse(freeze).success).toBe(false);
  });

  it("rejects unsupported serialized versions", () => {
    expect(R1AcceptanceCardSchema.safeParse({ ...makeCard(), schemaVersion: "0.2.0" }).success).toBe(false);
    expect(R1SamplingReportSchema.safeParse({ ...makeSamplingReport(), schemaVersion: "0.2.0" }).success).toBe(false);
  });

  it("cannot label the preparation card or an individual criterion as a human visual pass", () => {
    const card = makeCard();
    expect(R1AcceptanceCardSchema.safeParse({ ...card, humanReview: "pass" }).success).toBe(false);
    card.criteria[0].review = "pass";
    expect(R1AcceptanceCardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects baseline controls that differ from the resolved structural input", () => {
    const card = makeCard();
    card.controls.bayCount = 8;
    expect(R1AcceptanceCardSchema.safeParse(card).success).toBe(false);
  });

  it("preserves the 75 mm brick course anchor and a validated atlas manifest", () => {
    const changedAnchor = makeCard();
    changedAnchor.materialAnchors.brickCourseHeightM = 0.05;
    const unsupportedManifest = makeCard();
    unsupportedManifest.materialAnchors.atlasManifest.schemaVersion = "0.2.0";
    expect(R1AcceptanceCardSchema.safeParse(changedAnchor).success).toBe(false);
    expect(R1AcceptanceCardSchema.safeParse(unsupportedManifest).success).toBe(false);
  });

  it("requires every frozen building capture, including both WebGL presentation modes", () => {
    const missing = makeCard();
    missing.captures.pop();
    const duplicate = makeCard();
    duplicate.captures[17] = duplicate.captures[0];
    expect(R1AcceptanceCardSchema.safeParse(missing).success).toBe(false);
    expect(R1AcceptanceCardSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects a building capture whose actual camera, light or backend differs from its label", () => {
    const cameraMismatch = makeCard();
    cameraMismatch.captures[0].snapshot.camera.position[0] += 1;
    const lightMismatch = makeCard();
    lightMismatch.captures[0].snapshot.key.position[0] += 1;
    const backendMismatch = makeCard();
    backendMismatch.captures[0].snapshot.canvas.backend = "webgl";
    for (const card of [cameraMismatch, lightMismatch, backendMismatch]) {
      expect(R1AcceptanceCardSchema.safeParse(card).success).toBe(false);
    }
  });

  it("rejects a capture with an invalid pixel ratio", () => {
    const card = makeCard();
    card.captures[0].snapshot.canvas.devicePixelRatio = 0;
    expect(R1AcceptanceCardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects an orthographic projection or a camera labeled as non-perspective", () => {
    const orthographic = makeCard();
    orthographic.captures[0].snapshot.camera.projectionMatrix[11] = 0;
    orthographic.captures[0].snapshot.camera.projectionMatrix[15] = 1;
    const wrongType = makeCard();
    wrongType.captures[0].snapshot.camera.type = "OrthographicCamera";
    const falsePerspective = makeCard();
    falsePerspective.captures[0].snapshot.camera.isPerspectiveCamera = false;
    for (const card of [orthographic, wrongType, falsePerspective]) {
      expect(R1AcceptanceCardSchema.safeParse(card).success).toBe(false);
    }
  });

  it("accepts all four source/backend sampling captures with immutable source bytes", () => {
    expect(R1SamplingReportSchema.safeParse(makeSamplingReport()).success).toBe(true);
  });

  it("cannot count WebGL fallback as WebGPU sampling proof", () => {
    const snapshot = makeSamplingSnapshot("webgpu", "controlled");
    snapshot.backendActual = "webgl";
    expect(R1SamplingSnapshotSchema.safeParse({ ...snapshot, fallbackReason: "WebGPU initialization failed" }).success).toBe(false);
  });

  it("rejects sampling capture labels that do not describe their actual source or backend", () => {
    const wrongSource = makeSamplingReport();
    wrongSource.captures[0].snapshot.source = "controlled";
    const wrongBackend = makeSamplingReport();
    wrongBackend.captures[0].snapshot.backendActual = "webgl";
    wrongBackend.captures[0].snapshot.backendRequested = "webgl";
    for (const report of [wrongSource, wrongBackend]) {
      expect(R1SamplingReportSchema.safeParse(report).success).toBe(false);
    }
  });

  it("rejects mutation of source bytes and incomplete sampling backend coverage", () => {
    const snapshot = makeSamplingSnapshot("webgpu", "controlled");
    expect(R1SamplingSnapshotSchema.safeParse({ ...snapshot, sourceBytesUnchanged: false }).success).toBe(false);
    const report = makeSamplingReport();
    report.captures[3] = report.captures[0];
    expect(R1SamplingReportSchema.safeParse(report).success).toBe(false);
  });
});
