/* global window, document, requestAnimationFrame, createImageBitmap */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const baselinePacketId = "2026-10-13-r1-baseline";
const root = process.cwd();
const captureArguments = process.argv.slice(2);
const materialDeltaFlag = captureArguments.indexOf("--primary-wall-material-delta");
const periodicDeltaFlag = captureArguments.indexOf("--periodic-wall-material-delta");
if (materialDeltaFlag !== -1 && periodicDeltaFlag !== -1) throw new Error("Selected material replay flags are mutually exclusive.");
let primaryWallDeltaPath = null;
let periodicWallDeltaPath = null;
if (materialDeltaFlag !== -1) {
  if (materialDeltaFlag !== 2 || captureArguments.length !== 4 || !captureArguments[3]) {
    throw new Error("Primary-wall material capture requires output, frozen S4 card, and --primary-wall-material-delta <validated delta> only.");
  }
  primaryWallDeltaPath = path.resolve(captureArguments[3]);
  captureArguments.splice(materialDeltaFlag, 2);
}
if (periodicDeltaFlag !== -1) {
  if (periodicDeltaFlag !== 2 || captureArguments.length !== 4 || !captureArguments[3]) {
    throw new Error("Periodic-wall material capture requires output, frozen S6 card, and --periodic-wall-material-delta <validated delta> only.");
  }
  periodicWallDeltaPath = path.resolve(captureArguments[3]);
  captureArguments.splice(periodicDeltaFlag, 2);
}
const outputDirectory = path.resolve(captureArguments[0] ?? `docs/reviews/${baselinePacketId}`);
const replayPath = captureArguments[1] ? path.resolve(captureArguments[1]) : null;
const openingLayoutGraphPath = captureArguments[2] ? path.resolve(captureArguments[2]) : null;
if (primaryWallDeltaPath) {
  if (!replayPath || openingLayoutGraphPath) throw new Error("Primary-wall material capture requires strict S4 replay without a graph allowance.");
  const relativeDelta = path.relative(root, primaryWallDeltaPath);
  if (relativeDelta.startsWith("..") || path.isAbsolute(relativeDelta)) throw new Error("The selected material delta must stay inside the repository.");
}
if (openingLayoutGraphPath && !replayPath) throw new Error("Opening layout comparison requires a frozen acceptance card.");
if (periodicWallDeltaPath) {
  if (!replayPath || openingLayoutGraphPath) throw new Error("Periodic-wall material capture requires strict S6 replay without a graph allowance.");
  const relativeDelta = path.relative(root, periodicWallDeltaPath);
  if (relativeDelta.startsWith("..") || path.isAbsolute(relativeDelta)) throw new Error("The periodic material delta must stay inside the repository.");
}
if (openingLayoutGraphPath) {
  const relativeGraph = path.relative(root, openingLayoutGraphPath);
  if (relativeGraph.startsWith("..") || path.isAbsolute(relativeGraph)) throw new Error("Frozen opening graph must stay inside the repository.");
}
const packetId = replayPath ? path.basename(outputDirectory) : baselinePacketId;
const relativeOutput = path.relative(root, outputDirectory);
if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) throw new Error("Capture output must stay inside the repository.");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const screenshotFile = (name) => path.join(outputDirectory, name);
const frameSettled = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let server;
let browser;
const pageErrors = [];
let replayCard;
let baselineSampling;
let replayCardRecord;
let baselineSamplingRecord;
let openingLayoutContracts;
let graphContracts;
let openingLayoutKit;
let beforeOpeningGraph;
let afterOpeningGraph;
let openingLayoutComparison;
let primaryWallDelta;
let primaryWallDeltaBytes;
let periodicWallDelta;
let periodicWallDeltaBytes;
let periodicInheritedPaths = [];

function stableJson(value) {
  return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
}

async function artifactRecord(file) {
  return { file: path.relative(root, file).split(path.sep).join("/"), sha256: sha256(await readFile(file)) };
}

async function verifyReplay(page, info, checkFreeze) {
  if (!replayCard) return;
  for (const key of ["controls", "resolvedSpec", "materialAnchors"]) {
    if (stableJson(info[key]) !== stableJson(replayCard[key])) throw new Error("Replay changed frozen " + key + ".");
  }
  let expectedIdentity = replayCard.identity;
  if (primaryWallDelta) expectedIdentity = { ...expectedIdentity, atlasContentHash: primaryWallDelta.after.atlasContentHash };
  if (periodicWallDelta) expectedIdentity = { ...expectedIdentity, atlasContentHash: periodicWallDelta.after.atlasContentHash };
  if (openingLayoutGraphPath) {
    const inputs = await page.evaluate(() => window.r1Harness.openingLayoutInputs());
    if (stableJson(inputs.spec) !== stableJson(info.resolvedSpec) || inputs.catalog.catalogId !== info.identity.catalogId) {
      throw new Error("Opening comparison inputs differ from the mounted fixture identity.");
    }
    const report = openingLayoutContracts.OpeningLayoutComparisonSchema.parse(await openingLayoutContracts.compareOpeningLayoutGraphs({
      beforeGraph: beforeOpeningGraph, afterGraph: inputs.graph, spec: inputs.spec, catalog: inputs.catalog, kit: openingLayoutKit
    }));
    if (report.before.graphId !== replayCard.identity.graphId || report.before.sourceGraphHash !== replayCard.identity.sourceGraphHash ||
        report.after.graphId !== info.identity.graphId || report.after.sourceGraphHash !== info.identity.sourceGraphHash ||
        report.immutable.catalogId !== replayCard.identity.catalogId) {
      throw new Error("Opening graph provenance differs from the frozen or mounted graph identity.");
    }
    if (openingLayoutComparison && stableJson(report) !== stableJson(openingLayoutComparison)) {
      throw new Error("Opening layout comparison changed between actual mounts.");
    }
    openingLayoutComparison ??= report;
    afterOpeningGraph ??= graphContracts.BuildingGraphSchema.parse(inputs.graph);
    expectedIdentity = { ...expectedIdentity, graphId: report.after.graphId, sourceGraphHash: report.after.sourceGraphHash };
  }
  if (stableJson(info.identity) !== stableJson(expectedIdentity)) throw new Error("Replay changed an unapproved frozen identity field.");
  if (checkFreeze && stableJson(info.freeze) !== stableJson(replayCard.freeze)) throw new Error("Replay recomputed the frozen capture poses.");
}

function baselineSamplingCapture(backend, sourceName) {
  return baselineSampling.captures.find((row) => row.requestedBackend === backend && row.sourceName === sourceName);
}

function verifySamplingIdentity(backend, sourceName, snapshot) {
  if (!baselineSampling) return;
  const before = baselineSamplingCapture(backend, sourceName).snapshot;
  const selectedDelta = periodicWallDelta ?? primaryWallDelta;
  const expected = selectedDelta && sourceName === "procedural"
    ? { ...before, atlasContentHash: selectedDelta.after.atlasContentHash,
      sourceHashes: selectedDelta.after.sourceHashes, channelHashes: selectedDelta.after.channelHashes }
    : before;
  for (const key of ["atlasId", "atlasContentHash", "sourceHashes", "channelHashes", "canvasSizePx", "pixelsPerMeter"]) {
    if (stableJson(expected[key]) !== stableJson(snapshot[key])) throw new Error("Wall comparison changed sampling " + key + ".");
  }
  if ((primaryWallDelta || periodicWallDelta) && stableJson(before.textureSettings) !== stableJson(snapshot.textureSettings)) throw new Error("Selected material capture changed texture settings.");
}

async function capture(canvas, name) {
  const bytes = await canvas.screenshot();
  await writeFile(screenshotFile(name), bytes, { flag: "wx" });
  const size = await canvas.evaluate((element) => ({ widthPx: element.width, heightPx: element.height }));
  return { file: name, sha256: sha256(bytes), ...size };
}

async function rasterProbe(page, screenshot, snapshot) {
  const pngBase64 = (await readFile(screenshotFile(screenshot.file))).toString("base64");
  return page.evaluate(async ({ pngBase64, swatches, pixelsPerMeter }) => {
    const bytes = Uint8Array.from(globalThis.atob(pngBase64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new globalThis.Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cannot decode presented screenshot for the raster probe.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    function pixel(x, y) {
      const offset = (Math.round(y) * image.width + Math.round(x)) * 4;
      return Array.from(image.data.slice(offset, offset + 4));
    }
    function scan(rect, axis) {
      const start = Math.ceil((axis === "horizontal" ? rect.x : rect.y) + 3);
      const end = Math.floor((axis === "horizontal" ? rect.x + rect.width : rect.y + rect.height) - 3);
      const fixed = Math.round(axis === "horizontal" ? rect.y + rect.height * 0.37 : rect.x + rect.width * 0.37);
      if (start < 0 || end >= (axis === "horizontal" ? image.width : image.height) || fixed < 0 || fixed >= (axis === "horizontal" ? image.height : image.width)) {
        throw new Error("Swatch raster scan is outside the presented screenshot.");
      }
      let last = pixel(axis === "horizontal" ? start : fixed, axis === "horizontal" ? fixed : start);
      const firstRgba = [...last];
      const boundariesPx = [];
      for (let position = start + 1; position <= end; position += 1) {
        const next = pixel(axis === "horizontal" ? position : fixed, axis === "horizontal" ? fixed : position);
        if (Math.max(...next.slice(0, 3).map((channel, index) => Math.abs(channel - last[index]))) > 24) boundariesPx.push(position);
        last = next;
      }
      return { axis, startPx: start, endPx: end, fixedPx: fixed, firstRgba, boundariesPx,
        boundaryCount: boundariesPx.length, consecutiveSpacingM: boundariesPx.slice(1).map((position, index) => (position - boundariesPx[index]) / pixelsPerMeter) };
    }
    return { method: "presented-png-interior-rgb-step-24-v1", swatches: swatches.filter((swatch) => swatch.slot.role === "wall").map((swatch) => ({
      id: swatch.id, scans: [scan(swatch.screenRectPx, "horizontal"), scan(swatch.screenRectPx, "vertical")]
    })) };
  }, { pngBase64, swatches: snapshot.swatches, pixelsPerMeter: snapshot.pixelsPerMeter });
}

// The same measurement runs on the frozen and repaired PNGs. Source glyphs remain
// unchanged; chromatic masking prevents their neutral strokes from counting as cells.
async function checkerProbe(page, pngBytes, snapshot) {
  return page.evaluate(async ({ pngBase64, swatches, pixelsPerMeter, canvasSizePx }) => {
    const bytes = Uint8Array.from(globalThis.atob(pngBase64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new globalThis.Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cannot decode the checker screenshot.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    if (image.width !== canvasSizePx[0] || image.height !== canvasSizePx[1]) throw new Error("Checker PNG dimensions differ from the recorded canvas.");
    function median(values) {
      if (!values.length) return null;
      const sorted = [...values].sort((first, second) => first - second);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    function pixel(x, y) {
      const offset = (y * image.width + x) * 4;
      return Array.from(image.data.slice(offset, offset + 3));
    }
    function chromatic(x, y) {
      const rgb = pixel(x, y);
      return Math.max(...rgb) - Math.min(...rgb) >= 20;
    }
    function scan(rect, rowFraction) {
      const startPx = Math.ceil(rect.x + 3);
      const endPx = Math.floor(rect.x + rect.width - 3);
      const fixedPx = Math.round(rect.y + rect.height * rowFraction);
      if (startPx < 1 || endPx >= image.width - 1 || endPx <= startPx || fixedPx < 0 || fixedPx >= image.height) {
        throw new Error("Checker scan is outside its presented wall rectangle.");
      }
      let last = null;
      let validPixels = 0;
      const boundariesPx = [];
      for (let x = startPx; x <= endPx; x += 1) {
        if (![x - 1, x, x + 1].every((position) => chromatic(position, fixedPx))) { last = null; continue; }
        validPixels += 1;
        const next = pixel(x, fixedPx);
        if (last && Math.max(...next.map((value, index) => Math.abs(value - last[index]))) > 24 &&
            (!boundariesPx.length || x - boundariesPx.at(-1) > 1)) boundariesPx.push(x);
        last = next;
      }
      const consecutiveSpacingM = boundariesPx.slice(1).map((position, index) => (position - boundariesPx[index]) / pixelsPerMeter);
      return { rowFraction, startPx, endPx, fixedPx, boundariesPx, boundaryCount: boundariesPx.length, consecutiveSpacingM,
        medianSpacingM: median(consecutiveSpacingM), densityPerM: boundariesPx.length / ((endPx - startPx) / pixelsPerMeter),
        validPixelFraction: validPixels / (endPx - startPx + 1) };
    }
    return { method: "presented-png-chromatic-horizontal-runs-v1", swatches: swatches.filter((row) => row.slot.role === "wall").map((row) => {
      const scans = [0.30, 0.45, 0.60].map((fraction) => scan(row.screenRectPx, fraction));
      return { id: row.id, scans, medianSpacingM: median(scans.map((item) => item.medianSpacingM).filter((value) => value !== null)),
        medianDensityPerM: median(scans.map((item) => item.densityPerM)) };
    }) };
  }, { pngBase64: pngBytes.toString("base64"), swatches: snapshot.swatches, pixelsPerMeter: snapshot.pixelsPerMeter, canvasSizePx: snapshot.canvasSizePx });
}

async function compareWallSampling(page, captures, contracts, source, createdAt, sourceGraphHash) {
  const backends = [];
  for (const backend of ["webgpu", "webgl"]) {
    const current = captures.find((row) => row.requestedBackend === backend && row.sourceName === "controlled");
    const baseline = baselineSamplingCapture(backend, "controlled");
    const imagePath = path.resolve(path.dirname(replayPath), baseline.screenshot.file);
    const relativeImage = path.relative(path.dirname(replayPath), imagePath);
    if (relativeImage.startsWith("..") || path.isAbsolute(relativeImage)) throw new Error("Baseline screenshot must stay inside its evidence directory.");
    const bytes = await readFile(imagePath);
    if (sha256(bytes) !== baseline.screenshot.sha256) throw new Error("Baseline checker screenshot hash changed.");
    const beforeProbe = contracts.R1CheckerProbeSchema.parse(await checkerProbe(page, bytes, baseline.snapshot));
    const afterProbe = current.snapshot.checkerProbe;
    const beforeOne = beforeProbe.swatches.find((row) => row.id === "mesh.wall-1m");
    const afterOne = afterProbe.swatches.find((row) => row.id === "mesh.wall-1m");
    const rows = current.snapshot.swatches.filter((row) => row.slot.role === "wall").map((swatch) => {
      const before = beforeProbe.swatches.find((row) => row.id === swatch.id);
      const after = afterProbe.swatches.find((row) => row.id === swatch.id);
      const tileWidth = swatch.slot.physicalSizeM.width;
      if (!swatch.packedCheckerRows) throw new Error("The wall comparison requires actual packed checker rows.");
      const sourceRows = swatch.packedCheckerRows.map((row) => contracts.R1PackedCheckerRowSchema.parse(row));
      const expected = contracts.packedCheckerPeriodExpectation(sourceRows, tileWidth);
      if (expected.expectedSpacingM === null || expected.expectedDensityPerM <= 0) throw new Error("The packed source has no measurable periodic checker pattern.");
      const pixelToleranceM = 2 / current.snapshot.pixelsPerMeter;
      const spacingRangeM = [Math.max(1e-6, expected.expectedSpacingM - pixelToleranceM), expected.expectedSpacingM + pixelToleranceM];
      const scannedWidthM = (after.scans[0].endPx - after.scans[0].startPx) / current.snapshot.pixelsPerMeter;
      const densityTolerance = 2 / scannedWidthM;
      const densityRangePerM = [Math.max(0, expected.expectedDensityPerM - densityTolerance), expected.expectedDensityPerM + densityTolerance];
      const beforeDensityRatioToOneMetre = beforeOne.medianDensityPerM ? before.medianDensityPerM / beforeOne.medianDensityPerM : null;
      const afterDensityRatioToOneMetre = afterOne.medianDensityPerM ? after.medianDensityPerM / afterOne.medianDensityPerM : null;
      const spacingPass = after.medianSpacingM !== null && after.medianSpacingM >= spacingRangeM[0] && after.medianSpacingM <= spacingRangeM[1];
      const densityPass = after.medianDensityPerM >= densityRangePerM[0] && after.medianDensityPerM <= densityRangePerM[1] &&
        afterDensityRatioToOneMetre !== null && afterDensityRatioToOneMetre >= 0.8 && afterDensityRatioToOneMetre <= 1.2;
      return { id: swatch.id, worldWidthM: swatch.worldSizeM[0], physicalTileWidthM: tileWidth, pixelsPerMeter: current.snapshot.pixelsPerMeter,
        expectedDensityMethod: "packed-rgba-periodic-rgb-step-24-v1", ...expected, spacingRangeM, densityRangePerM,
        before, after, beforeDensityRatioToOneMetre, afterDensityRatioToOneMetre, spacingPass, densityPass, pass: spacingPass && densityPass };
    });
    backends.push({ requestedBackend: backend, actualBackend: current.snapshot.backendActual,
      atlasContentHash: current.snapshot.atlasContentHash, atlasUnchanged: true, materialSourcesUnchanged: true, channelsUnchanged: true, rows });
  }
  return contracts.R1WallSamplingComparisonSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-sampling-comparison", packetId, createdAt, source,
    baseline: { acceptanceCard: replayCardRecord, samplingReport: baselineSamplingRecord },
    sourceGraphHash, controlsUnchanged: true, freezeUnchanged: true, backends,
    pass: backends.every((result) => result.rows.every((row) => row.pass)), humanReview: "pending",
    limitations: ["The rendered gate measures horizontal checker density; raw vertical scans retain axis-glyph noise.",
      "This wall sampling repair does not establish adjacent-piece brick phase or acceptance of other material roles or architectural criteria."]
  });
}

async function reference(file, metadata) {
  const bytes = await readFile(path.join(root, file));
  const digest = sha256(bytes);
  if (digest !== metadata.sha256) throw new Error(`Reference bytes changed: ${file}`);
  return { file, ...metadata };
}

try {
  if (primaryWallDeltaPath || periodicWallDeltaPath) {
    try { await access(outputDirectory); throw new Error("Selected material captures require a fresh exclusive output directory."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  try {
    await access(screenshotFile("acceptance-card.json"));
    throw new Error("This baseline already exists. Supply a fresh repository-local output directory to preserve the earlier evidence.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(outputDirectory, { recursive: true });
  server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 5173, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not resolve a loopback URL.");
  const contracts = await server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts");
  if (replayPath) {
    replayCard = contracts.R1AcceptanceCardSchema.parse(JSON.parse(await readFile(replayPath, "utf8")));
    replayCardRecord = await artifactRecord(replayPath);
    const samplingPath = path.join(path.dirname(replayPath), "sampling-report.json");
    baselineSampling = contracts.R1SamplingReportSchema.parse(JSON.parse(await readFile(samplingPath, "utf8")));
    baselineSamplingRecord = await artifactRecord(samplingPath);
    if (stableJson(baselineSampling.controls) !== stableJson(replayCard.controls)) throw new Error("Frozen sampling/building controls differ.");
    if (replayCard.captures.some(({ snapshot }) => snapshot.canvas.width !== 1280 || snapshot.canvas.height !== 800 ||
      snapshot.canvas.cssWidth !== 1280 || snapshot.canvas.cssHeight !== 800 || snapshot.canvas.devicePixelRatio !== 1)) {
      throw new Error("The replay harness requires the original 1280 x 800 canvas and pixel ratio 1.");
    }
  }
  if (openingLayoutGraphPath) {
    openingLayoutContracts = await server.ssrLoadModule("/src/features/building-family/qa/openingLayoutComparison.ts");
    graphContracts = await server.ssrLoadModule("/src/features/building-family/contracts/buildingGraph.ts");
    openingLayoutKit = (await server.ssrLoadModule("/src/features/building-family/art-kit/late19cApartmentKit.ts")).late19cApartmentKit;
    beforeOpeningGraph = graphContracts.BuildingGraphSchema.parse(JSON.parse(await readFile(openingLayoutGraphPath, "utf8")));
  }
  if (primaryWallDeltaPath) {
    if (replayCard.packetId !== "2026-10-14-r1-s4") throw new Error("The selected material replay must use the original durable S4 acceptance card.");
    const proof = await server.ssrLoadModule("/scripts/diagnostics/r1-primary-wall-material-proof.mjs");
    primaryWallDelta = await proof.loadVerifiedR1PrimaryWallMaterialDelta({ server, root, deltaPath: primaryWallDeltaPath, replayPath });
    primaryWallDeltaBytes = await readFile(primaryWallDeltaPath);
    if (primaryWallDelta.packetId !== packetId || stableJson(JSON.parse(primaryWallDeltaBytes.toString("utf8"))) !== stableJson(primaryWallDelta)) {
      throw new Error("The selected material baseline changed or belongs to a different capture packet.");
    }
  }
  if (periodicWallDeltaPath) {
    if (replayCard.packetId !== "2026-10-14-r1-s6") throw new Error("Periodic material replay must use the actual accepted S6 card.");
    const proof = await server.ssrLoadModule("/scripts/diagnostics/r1-primary-wall-periodic-proof.mjs");
    periodicWallDelta = await proof.loadVerifiedR1PeriodicWallMaterialDelta({ root, deltaPath: periodicWallDeltaPath, replayPath });
    periodicWallDeltaBytes = await readFile(periodicWallDeltaPath);
    if (periodicWallDelta.packetId !== packetId || stableJson(JSON.parse(periodicWallDeltaBytes.toString("utf8"))) !== stableJson(periodicWallDelta)) {
      throw new Error("Periodic material baseline changed or belongs to another capture packet.");
    }
    const priorBytes = await readFile(path.join(root, periodicWallDelta.baseline.s7Report.file));
    if (sha256(priorBytes) !== periodicWallDelta.baseline.s7Report.sha256) throw new Error("Inherited S7 source list changed.");
    periodicInheritedPaths = JSON.parse(priorBytes.toString("utf8")).source.diagnosticFiles.map(record => record.file);
  }
  browser = await chromium.launch();
  const diagnosticPaths = [...new Set([
    "scripts/capture-r1-baseline.mjs", "scripts/diagnostics/r1-baseline.html", "scripts/diagnostics/r1-baseline-browser.mjs",
    "scripts/diagnostics/r1-building-capture.mjs", "scripts/diagnostics/r1-material-sampling.mjs",
    "src/features/building-family/qa/r1BaselineContracts.ts",
    "src/features/building-family/compiler/buildingCompiler.ts",
    "src/features/building-family/compiler/openingSlotBinding.ts",
    "src/features/building-family/compiler/openingGeometry.ts",
    "src/features/building-family/compiler/facadeWallSubdivision.ts",
    "src/features/building-family/renderer-three/buildingSceneAdapter.ts",
    "src/features/building-family/renderer-three/wallAtlasGeometry.ts",
    "src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts",
    "src/features/building-family/renderer-three/resourceDisposal.ts",
    "src/features/building-family/qa/moduleQualityReport.ts",
    "src/features/building-family/compiler/frontTrimClearance.ts",
    "src/features/building-family/compiler/profiledTrimGeometry.ts",
    ...(openingLayoutGraphPath ? [
      "src/features/building-family/art-kit/facadeModulePlanner.ts",
      "src/features/building-family/art-kit/late19cApartmentKit.ts",
      "src/features/building-family/core/seedTree.ts",
      "src/features/building-family/compiler/buildingGraphBuilder.ts",
      "src/features/building-family/qa/openingLayoutComparison.ts",
      "src/features/building-family/tests/facadeModulePlanner.test.ts",
      "src/features/building-family/tests/openingLayoutComparison.test.ts",
      "src/features/building-family/tests/openingApertureVisibility.test.ts"
    ] : []),
    ...(primaryWallDelta ? [
      ...replayCard.source.diagnosticFiles.map((record) => record.file),
      "src/features/building-family/materials/providers/proceduralMaterialProvider.ts",
      "src/features/building-family/qa/r1MasonryCoverage.ts",
      "src/features/building-family/tests/r1MasonryCoverage.test.ts",
      "scripts/diagnostics/r1-primary-wall-material-proof.mjs",
      "scripts/capture-r1-primary-wall-material.mjs",
      "src/features/building-family/tests/proceduralMaterialProvider.test.ts",
      "src/features/building-family/qa/r1MasonryAppearance.ts",
      "src/features/building-family/tests/r1MasonryAppearance.test.ts",
      "src/features/building-family/core/canonicalJson.ts",
      "src/features/building-family/core/contentHash.ts",
      "src/features/building-family/materials/atlasPlanner.ts",
      "src/features/building-family/materials/atlasPacker.ts",
      "src/features/building-family/materials/normalFromHeight.ts",
      "src/features/building-family/materials/periodicBlend.ts",
      "src/features/building-family/materials/atlasDebugExport.ts",
      "src/features/building-family/state/completedFamilyExportVerifier.ts",
      "src/features/building-family/ui/assemblyHallFixture.ts",
      "src/features/building-family/tests/assemblyHallFixture.test.ts"
    ] : []),
    ...(periodicWallDelta ? [
      ...periodicInheritedPaths,
      "src/features/building-family/materials/providers/proceduralMaterialProvider.ts",
      "src/features/building-family/materials/atlasPlanner.ts", "src/features/building-family/materials/atlasPacker.ts",
      "src/features/building-family/materials/periodicMasonryRaster.ts",
      "src/features/building-family/tests/periodicMasonryRaster.test.ts",
      "src/features/building-family/tests/periodicMasonryIntegration.test.ts",
      "src/features/building-family/qa/r1PeriodicSampling.ts", "src/features/building-family/tests/r1PeriodicSampling.test.ts",
      "scripts/diagnostics/r1-periodic-masonry-oracle.mjs", "scripts/diagnostics/r1-primary-wall-periodic-proof.mjs",
      "scripts/capture-r1-periodic-wall-material.mjs"
    ] : [])
  ])];
  const source = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    trackedDiffSha256: sha256(execFileSync("git", ["diff", "HEAD", "--binary"], { stdio: ["ignore", "pipe", "ignore"] })),
    dirtyPaths: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/).filter(Boolean),
    diagnosticFiles: await Promise.all(diagnosticPaths.map(async (file) => ({ file, sha256: sha256(await readFile(path.join(root, file))) }))),
    documentId: "buildo-demo-family",
    ...(replayCardRecord ? { replayCard: replayCardRecord } : {})
  };
  const createdAt = new Date().toISOString();
  const buildingCaptures = [];
  const samplingCaptures = [];
  let canonical;
  let comparison;
  for (const backend of ["webgpu", "webgl"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") console.error("Browser:", message.text()); });
    page.on("requestfailed", (request) => console.error("Request failed:", request.url(), request.failure()?.errorText));
    try {
      await page.goto(new URL("/scripts/diagnostics/r1-baseline.html", url).href);
      await page.waitForFunction(() => !!window.r1Harness);
      const info = await page.evaluate((input) => window.r1Harness.mount(input), {
        kind: "building", backend, ...(replayCard ? { controls: replayCard.controls, freeze: replayCard.freeze } : {})
      });
      await verifyReplay(page, info, true);
      if (info.actualBackend !== backend) throw new Error(`${backend} building proof fell back to ${info.actualBackend}: ${info.fallbackReason}`);
      canonical ??= info;
      if (info.identity.sourceGraphHash !== canonical.identity.sourceGraphHash || info.identity.atlasContentHash !== canonical.identity.atlasContentHash) {
        throw new Error("The building source identities changed between backend captures.");
      }
      const canvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
      await canvas.waitFor({ state: "visible" });
      // Drive the real production controls; no material-mode imitation in the harness.
      const stage = page.getByRole("combobox", { name: "Reveal through stage" });
      if (await stage.count()) await stage.selectOption("roof", { force: true });
      for (const mode of ["textured", "clay"]) {
        await page.getByRole("combobox", { name: "Presentation mode" }).selectOption(mode, { force: true });
        await page.waitForFunction((mode) => document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]')?.dataset.presentationMode === mode, mode);
        for (const viewName of backend === "webgpu" ? ["front", "three-quarter", "right", "rear"] : ["three-quarter"]) {
          for (const lightingName of backend === "webgpu" ? ["ordinary", "raking"] : ["ordinary"]) {
            await page.evaluate((preset) => window.r1Harness.setCapture(preset), { viewName, lightingName });
            await frameSettled(page);
            const snapshot = await page.evaluate(() => window.r1Harness.snapshot());
            const screenshot = await capture(canvas, `building-${backend}-${mode}-${viewName}-${lightingName}.png`);
            if (periodicWallDelta && mode === "textured") {
              const frozen = replayCard.captures.find((row) => row.snapshot.actualBackend === backend && row.snapshot.canvas.presentationMode === "textured" &&
                row.snapshot.viewName === viewName && row.snapshot.lightingName === lightingName);
              if (!frozen) throw new Error("Missing frozen S6 textured view.");
              const frozenBytes = await readFile(path.join(path.dirname(replayPath), frozen.screenshot.file));
              if (sha256(frozenBytes) !== frozen.screenshot.sha256) throw new Error("Frozen S6 textured pixels changed on disk.");
              if ((await readFile(screenshotFile(screenshot.file))).equals(frozenBytes)) throw new Error("Periodic wall treatment did not change the actual textured building PNG.");
            }
            if ((primaryWallDelta || periodicWallDelta) && mode === "clay") {
              const frozen = replayCard.captures.find((row) => row.snapshot.actualBackend === backend && row.snapshot.canvas.presentationMode === "clay" &&
                row.snapshot.viewName === viewName && row.snapshot.lightingName === lightingName);
              if (!frozen) throw new Error(periodicWallDelta ? "Missing frozen S6 clay view." : "Missing frozen S4 clay view.");
              const frozenBytes = await readFile(path.join(path.dirname(replayPath), frozen.screenshot.file));
              if (sha256(frozenBytes) !== frozen.screenshot.sha256 || !(await readFile(screenshotFile(screenshot.file))).equals(frozenBytes)) {
                throw new Error("Selected material capture changed frozen clay pixels.");
              }
            }
            buildingCaptures.push({ screenshot, snapshot });
          }
        }
      }
      console.log(`${backend}: building captures complete`);
      await page.evaluate(() => window.r1Harness.dispose());
      const sampling = await page.evaluate((input) => window.r1Harness.mount(input), {
        kind: "sampling", backend, ...(replayCard ? { controls: replayCard.controls } : {}),
        ...(primaryWallDelta ? { primaryWallMaterialDelta: primaryWallDelta } : {}),
        ...(periodicWallDelta ? { periodicWallMaterialDelta: periodicWallDelta } : {})
      });
      await verifyReplay(page, sampling, false);
      if (sampling.actualBackend !== backend) throw new Error(`${backend} sampling proof fell back to ${sampling.actualBackend}: ${sampling.fallbackReason}`);
      for (const sourceName of ["procedural", "controlled"]) {
        await page.evaluate((name) => window.r1Harness.setSource(name), sourceName);
        await frameSettled(page);
        const snapshot = await page.evaluate(() => window.r1Harness.snapshot());
        verifySamplingIdentity(backend, sourceName, snapshot);
        const screenshot = await capture(page.locator('canvas[aria-label="R1 material sampling canvas"]'), `sampling-${backend}-${sourceName}.png`);
        if (periodicWallDelta && sourceName === "procedural") {
          const frozenScreenshot = baselineSamplingCapture(backend, sourceName).screenshot;
          const frozenBytes = await readFile(path.join(path.dirname(replayPath), frozenScreenshot.file));
          if (sha256(frozenBytes) !== frozenScreenshot.sha256) throw new Error("Frozen S6 procedural swatch changed on disk.");
          if ((await readFile(screenshotFile(screenshot.file))).equals(frozenBytes)) throw new Error("Periodic wall treatment did not change the actual procedural swatch PNG.");
        }
        if ((primaryWallDelta || periodicWallDelta) && sourceName === "controlled") {
          const frozenScreenshot = baselineSamplingCapture(backend, sourceName).screenshot;
          const frozenBytes = await readFile(path.join(path.dirname(replayPath), frozenScreenshot.file));
          if (sha256(frozenBytes) !== frozenScreenshot.sha256 || !(await readFile(screenshotFile(screenshot.file))).equals(frozenBytes)) {
            throw new Error("Frozen-origin controlled checker PNG changed.");
          }
        }
        snapshot.rasterProbe = await rasterProbe(page, screenshot, snapshot);
        if (sourceName === "controlled") {
          snapshot.checkerProbe = contracts.R1CheckerProbeSchema.parse(await checkerProbe(page, await readFile(screenshotFile(screenshot.file)), snapshot));
        }
        samplingCaptures.push({ requestedBackend: backend, sourceName, screenshot, snapshot });
      }
      if (primaryWallDelta || periodicWallDelta) {
        await page.evaluate(() => window.r1Harness.setSource("procedural"));
        const restored = await page.evaluate(() => window.r1Harness.snapshot());
        verifySamplingIdentity(backend, "procedural", restored);
        if (!restored.sourceBytesUnchanged) throw new Error("Controlled swatches mutated the selected production material bytes.");
        const original = samplingCaptures.find((row) => row.requestedBackend === backend && row.sourceName === "procedural").screenshot;
        const restoredBytes = await page.locator('canvas[aria-label="R1 material sampling canvas"]').screenshot();
        if (!restoredBytes.equals(await readFile(screenshotFile(original.file)))) throw new Error("Restored S6 procedural swatch pixels changed.");
      }
      if (replayCard && backend === "webgl") comparison = await compareWallSampling(page, samplingCaptures, contracts, source, createdAt, canonical.identity.sourceGraphHash);
      console.log(`${backend}: material captures complete`);
    } finally {
      await page.evaluate(() => window.r1Harness?.dispose()).catch(() => {});
      await page.close();
    }
  }
  if (pageErrors.length) throw new Error(`Capture page errors: ${pageErrors.join("; ")}`);
  if (primaryWallDelta || periodicWallDelta) {
    for (const record of source.diagnosticFiles) {
      if (sha256(await readFile(path.join(root, record.file))) !== record.sha256) throw new Error("Capture source changed: " + record.file);
    }
    if (sha256(execFileSync("git", ["diff", "HEAD", "--binary"], { stdio: ["ignore", "pipe", "ignore"] })) !== source.trackedDiffSha256 ||
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== source.commit) {
      throw new Error("Source commit/patch changed during the selected material capture.");
    }
  }
  const references = replayCard ? await Promise.all(replayCard.references.map((row) => reference(row.file, row))) : await Promise.all([
    reference("docs/ref/Former_John_Marx_Grocery_Store,_Buffalo,_New_York_-_20200821.jpg", {
      id: "marx-grocery-buffalo", role: "primary", sha256: "64cb05e4bd20a98833f2e5811b5e71a8c533a279486d8f0b0f9eadc6f7e00171",
      widthPx: 960, heightPx: 1280, cropPx: { x: 80, y: 145, width: 840, height: 945 },
      observation: "Three levels and four upper front bays. Use masonry, opening depth and crown hierarchy; the canonical four-floor seven-bay building is not a proportional replica."
    }),
    reference("docs/ref/AN_EXAMPLE_OF_BROOKLYN_ARCHITECTURE_ON_VANDERBILT_AVENUE_IN_NEW_YORK_CITY._BROOKLYN_REMAINS_ONE_OF_AMERICA'S_BEST..._-_NARA_-_555902.jpg", {
      id: "vanderbilt-brooklyn", role: "secondary", sha256: "cf616403ef6be4f64680b797d13057e5d284d496e7b58b54ec7be2205512c61c",
      widthPx: 960, heightPx: 649, cropPx: { x: 270, y: 380, width: 405, height: 210 },
      observation: "Four levels including the contrasting red base. Use base/body distinction, without adopting all facade ornament."
    })
  ]);
  const acceptance = contracts.R1AcceptanceCardSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-acceptance-card", packetId, createdAt, source,
    controls: canonical.controls, resolvedSpec: canonical.resolvedSpec, identity: canonical.identity, references,
    materialAnchors: canonical.materialAnchors,
    freeze: canonical.freeze, captures: buildingCaptures,
    criteria: contracts.R1_CRITERIA.map((criterion) => ({ ...criterion, review: "pending" })),
    humanReview: "pending", scopeNote: periodicWallDelta
      ? "R1.S8 primary-wall periodic pixel-area material baseline. periodic-material-baseline-delta.json reconstructs actual S6 before bytes, exact no-profile replay, and the selected content-bound descriptor. The fixed 0.96 m tile explicitly uses 12 even courses/six columns: 80 mm actual course/160 mm pitch; 75 mm remains nominal. Only selected base-color/height and derived normal ROI/padding bytes and versioned material identities change. Graph, geometry, catalog, atlas ID, other 11 sources, full ORM/opacity, controls, anchors, cameras/lights and frozen clay/checker pixels remain strict. Controlled swatches retain inherited legacy origins. Human acceptance remains pending."
      : primaryWallDelta
      ? "R1.S6 selected primary-wall mortar-coverage material baseline. material-baseline-delta.json independently validates the changed primary request/provenance, base-color/height and derived normal bytes. Graph, geometry, catalog, atlas ID, all other sources/channels, controls, anchors, cameras and lights remain frozen; controlled swatches use explicitly frozen legacy origins. All screenshots are fresh captures of the actual recorded identity. Human visual acceptance remains pending."
      : openingLayoutComparison
      ? "R1 opening-presence repair with runtime-validated full before/after graphs. Only front-body and side opening placements and their derived graph identities may change; controls, other placements and graph fields, recipes, materials, cameras and lights remain frozen. Human visual acceptance remains pending."
      : replayCard
      ? "R1 frozen-input repair comparison. The original controls, cameras, lights, graph and material atlas are replayed; compiler and renderer geometry may change within the named repair packet. Other architectural criteria and human visual acceptance remain pending."
      : "R1 baseline evidence. Production geometry/materials are captured with frozen diagnostic cameras and lights. Automated evidence does not establish aesthetic acceptance.", pageErrors
  });
  const report = contracts.R1SamplingReportSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-material-sampling-baseline", packetId, createdAt, source,
    controls: canonical.controls, captures: samplingCaptures, conclusions: [
      replayCard ? "This packet compares wall sampling against the frozen source and rendered checker evidence on both actual backends."
        : "This packet records the current production adapter and actual backend sampling as a baseline.",
      "Expected repeats use world dimensions divided by the actual semantic slot physical tile dimensions. Vertex UV min/max spans describe tile windows and do not establish rendered density; the presented checker probe measures density independently."
    ], humanReview: "pending", pageErrors
  });
  await writeFile(screenshotFile("acceptance-card.json"), JSON.stringify(acceptance, null, 2) + "\n", { flag: "wx" });
  await writeFile(screenshotFile("sampling-report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  if (primaryWallDelta) {
    await writeFile(screenshotFile("material-baseline-delta.json"), primaryWallDeltaBytes, { flag: "wx" });
    if (!primaryWallDeltaBytes.equals(await readFile(primaryWallDeltaPath))) throw new Error("Selected material delta changed during capture.");
  }
  if (periodicWallDelta) {
    await writeFile(screenshotFile("periodic-material-baseline-delta.json"), periodicWallDeltaBytes, { flag: "wx" });
    if (!periodicWallDeltaBytes.equals(await readFile(periodicWallDeltaPath))) throw new Error("Periodic material delta changed during capture.");
  }
  if (comparison) {
    await writeFile(screenshotFile("wall-sampling-comparison.json"), JSON.stringify(comparison, null, 2) + "\n", { flag: "wx" });
    if (!comparison.pass) throw new Error("The wall physical-density comparison failed. See wall-sampling-comparison.json for measured evidence.");
  }
  if (openingLayoutComparison) {
    for (const [name, artifact] of [
      ["opening-layout-before-graph.json", beforeOpeningGraph],
      ["opening-layout-after-graph.json", afterOpeningGraph],
      ["opening-layout-comparison.json", openingLayoutComparison]
    ]) await writeFile(screenshotFile(name), JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ outputDirectory, buildingCaptures: buildingCaptures.length, samplingCaptures: samplingCaptures.length, pageErrors }, null, 2));
} catch (error) {
  console.error(error);
  if (pageErrors.length) console.error("Page errors:", JSON.stringify(pageErrors));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
