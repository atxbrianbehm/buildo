/* global window, requestAnimationFrame */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDirectory = path.resolve(process.argv[2] ?? "test-results/r1-s5-2026-10-14/2026-10-14-r1-s5");
const baselinePath = path.resolve(process.argv[3] ?? "docs/reviews/2026-10-14-r1-s4/acceptance-card.json");
const inside = (target) => {
  const relative = path.relative(root, target);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Evidence paths must stay inside the repository.");
  return target;
};
inside(outputDirectory); inside(baselinePath);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rawBytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const artifactRecord = async (file) => ({ file: path.relative(root, file).split(path.sep).join("/"), sha256: digest(await readFile(file)) });
const conditions = ["production", "normal-off", "base-color-only", "flat", "flat-no-shadow", "restored-production"];
const gpuPresets = [
  { viewName: "front", lightingName: "ordinary" },
  { viewName: "three-quarter", lightingName: "ordinary" },
  { viewName: "right", lightingName: "ordinary" },
  { viewName: "three-quarter", lightingName: "raking" }
];
let server;
let browser;
let fixture;
const pageErrors = [];

function mortarCount(layer, rectangle = { x: 0, y: 0, width: layer.widthPx, height: layer.heightPx }) {
  let count = 0;
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      if (layer.data[(y * layer.widthPx + x) * 4 + 1] > 100) count += 1;
    }
  }
  return count;
}

try {
  try {
    await access(outputDirectory);
    throw new Error("Refusing to overwrite an existing discriminator output directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(outputDirectory, { recursive: true });
  server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 5173, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  assert(url, "Vite must expose a loopback capture URL.");
  const [baselineContracts, masonry, fixtureModule, providerModule, diagnostic, canonical] = await Promise.all([
    server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1MasonryAppearance.ts"),
    server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"),
    server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"),
    server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts")
  ]);
  const baseline = baselineContracts.R1AcceptanceCardSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
  assert.equal(baseline.packetId, "2026-10-14-r1-s4");
  const samplingPath = path.join(path.dirname(baselinePath), "sampling-report.json");
  const baselineSampling = baselineContracts.R1SamplingReportSchema.parse(JSON.parse(await readFile(samplingPath, "utf8")));
  const baselineRecord = await artifactRecord(baselinePath);
  const baselineSamplingRecord = await artifactRecord(samplingPath);
  const procedural = baselineSampling.captures.find((row) => row.requestedBackend === "webgpu" && row.sourceName === "procedural");
  assert(procedural);
  const provider = new providerModule.ProceduralMaterialProvider();
  const sources = new Map();
  const requests = new Map();
  fixture = await fixtureModule.createAssemblyHallFixture({
    promptControls: baseline.controls,
    materialProvider: {
      id: provider.id,
      async generate(request, signal) {
        const source = await provider.generate(request, signal);
        sources.set(source.sourceId, source);
        requests.set(source.sourceId, request);
        return source;
      }
    }
  });
  assert.deepEqual(fixture.spec, baseline.resolvedSpec);
  assert.equal(fixture.ir.sourceGraphHash, baseline.identity.sourceGraphHash);
  assert.equal(fixture.packedAtlas.contentHash, baseline.identity.atlasContentHash);
  assert.equal(fixture.catalog.catalogId, baseline.identity.catalogId);
  assert.equal(fixture.graph.graphId, baseline.identity.graphId);
  const sourceHashes = [...sources.values()].map(({ sourceId, providerId, requestHash, contentHash }) =>
    ({ sourceId, providerId, requestHash, contentHash })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  assert.deepEqual(sourceHashes, procedural.snapshot.sourceHashes, "Procedural source artifacts must match frozen S4.");
  const encodedChannelHashes = Object.fromEntries(fixture.debugExport.channels.map(({ name, channelHash }) => [name, channelHash]));
  assert.deepEqual(encodedChannelHashes, procedural.snapshot.channelHashes, "Encoded atlas channels must match frozen S4.");
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const geometryBytes = (geometry) => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0);
  const geometryCheckpoint = masonry.R1MasonryGeometryCheckpointSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: baselineRecord,
    sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash,
    geometryHash: await diagnostic.fingerprintBuildingGeometry(fixture),
    irTriangles: fixture.ir.metrics.triangleCount,
    renderedTriangles: fixture.buildingRuntime.metrics.renderedTriangleCount,
    geometryBytes: [...new Set(fixture.buildingRuntime.renderables.map((object) => object.geometry))].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
    instanceCount: fixture.ir.metrics.instanceCount,
    atlasChannelDataHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(rawBytes(layer.data))]))
  });
  assert.equal(geometryCheckpoint.geometryHash, "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e", "Pre-treatment geometry buffers must match the preserved S4 checkpoint.");
  assert.equal(geometryCheckpoint.irTriangles, 11868);
  assert.equal(geometryCheckpoint.renderedTriangles, 61508);
  assert.equal(geometryCheckpoint.geometryBytes, 3444336);
  assert.equal(geometryCheckpoint.instanceCount, 118);
  await writeFile(path.join(outputDirectory, "frozen-geometry-checkpoint.json"), JSON.stringify(geometryCheckpoint, null, 2) + "\n", { flag: "wx" });
  const slot = fixture.packedAtlas.manifest.slots.find((entry) => entry.id === "wall.primary");
  assert(slot && slot.role === "wall");
  const wallSource = sources.get(slot.materialSourceId);
  const request = requests.get(slot.materialSourceId);
  assert(wallSource && request);
  const cells = providerModule.brickCellSizePx(request);
  const sourceMortarPixels = mortarCount(wallSource.layers.baseColor);
  const packedMortarPixels = mortarCount(fixture.packedAtlas.channels.baseColor, slot.rectPx);
  const brickSourceModel = {
    sourceId: wallSource.sourceId,
    sourceWidthPx: wallSource.widthPx, sourceHeightPx: wallSource.heightPx,
    sourceContentHash: wallSource.contentHash, sourceRequestHash: wallSource.requestHash,
    sourceBaseColorSha256: digest(rawBytes(wallSource.layers.baseColor.data)),
    physicalSizeM: slot.physicalSizeM,
    nominalCourseHeightM: providerModule.BRICK_COURSE_HEIGHT_M,
    nominalCoursesPerTile: cells.coursesPerTile,
    brickWidthPx: cells.brickWidth, brickHeightPx: cells.brickHeight, mortarPx: cells.mortar,
    quantizedCourseHeightM: slot.physicalSizeM.height * cells.brickHeight / wallSource.heightPx,
    quantizedMortarHeightM: slot.physicalSizeM.height * cells.mortar / wallSource.heightPx,
    mortarPixelCount: sourceMortarPixels, totalPixelCount: wallSource.widthPx * wallSource.heightPx,
    mortarPixelFraction: sourceMortarPixels / (wallSource.widthPx * wallSource.heightPx),
    packedRectPx: slot.rectPx, packedMortarPixelCount: packedMortarPixels,
    packedTotalPixelCount: slot.rectPx.width * slot.rectPx.height,
    packedMortarPixelFraction: packedMortarPixels / (slot.rectPx.width * slot.rectPx.height)
  };
  const sourcePaths = [...baseline.source.diagnosticFiles.map((row) => row.file),
    "scripts/capture-r1-masonry-discriminator.mjs",
    "src/features/building-family/qa/r1MasonryAppearance.ts",
    "src/features/building-family/tests/r1MasonryAppearance.test.ts"];
  const source = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    trackedDiffSha256: digest(execFileSync("git", ["diff", "HEAD", "--binary"], { stdio: ["ignore", "pipe", "ignore"] })),
    dirtyPaths: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/).filter(Boolean),
    diagnosticFiles: await Promise.all(sourcePaths.map((file) => artifactRecord(inside(path.join(root, file))))),
    documentId: "buildo-demo-family", replayCard: baselineRecord
  };
  const captures = [];
  const createdAt = new Date().toISOString();
  browser = await chromium.launch();
  for (const backend of ["webgpu", "webgl"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    try {
      await page.goto(new URL("/scripts/diagnostics/r1-baseline.html", url).href);
      await page.waitForFunction(() => !!window.r1Harness);
      const info = await page.evaluate((input) => window.r1Harness.mount(input), {
        kind: "building", backend, controls: baseline.controls, freeze: baseline.freeze
      });
      // Frozen artifacts use JSON semantics: optional undefined fields are omitted.
      for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"]) {
        assert.equal(canonical.canonicalJson(info[key]), canonical.canonicalJson(baseline[key]), key);
      }
      assert.equal(info.actualBackend, backend, "Backend fallback cannot serve as diagnostic evidence.");
      const canvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
      await canvas.waitFor({ state: "visible" });
      const stage = page.getByRole("combobox", { name: "Reveal through stage" });
      if (await stage.count()) await stage.selectOption("roof", { force: true });
      await page.getByRole("combobox", { name: "Presentation mode" }).selectOption("textured", { force: true });
      for (const preset of backend === "webgpu" ? gpuPresets : [gpuPresets[1]]) {
        await page.evaluate((input) => window.r1Harness.setCapture(input), preset);
        for (const condition of conditions) {
          await page.evaluate((value) => window.r1Harness.setWallDiagnostic(value), condition);
          await page.evaluate(() => new Promise((resolve) => {
            let frames = 0;
            const tick = () => { frames += 1; if (frames >= 4) resolve(); else requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
          }));
          const snapshot = baselineContracts.R1BuildingSnapshotSchema.parse(await page.evaluate(() => window.r1Harness.snapshot()));
          const wallState = await page.evaluate(() => window.r1Harness.wallDiagnosticSnapshot());
          assert.equal(wallState.geometryHash, geometryCheckpoint.geometryHash, "A material diagnostic changed geometry buffers.");
          const bytes = await canvas.screenshot();
          const file = `masonry-${backend}-${preset.viewName}-${preset.lightingName}-${condition}.png`;
          await writeFile(path.join(outputDirectory, file), bytes, { flag: "wx" });
          const screenshot = { file, sha256: digest(bytes), widthPx: snapshot.canvas.width, heightPx: snapshot.canvas.height };
          if (condition === "production" || condition === "restored-production") {
            const before = baseline.captures.find((row) => row.snapshot.actualBackend === backend && row.snapshot.canvas.presentationMode === "textured" &&
              row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName);
            assert(before, "Missing S4 frozen preset.");
            assert.equal(screenshot.sha256, before.screenshot.sha256, "Production/restored output must be byte-identical to S4.");
          }
          captures.push({ requestedBackend: backend, ...preset, condition, screenshot, snapshot, wallState });
        }
      }
      console.log(`${backend}: masonry diagnostic captures complete`);
    } finally {
      await page.evaluate(() => window.r1Harness?.dispose()).catch(() => {});
      await page.close();
    }
  }
  assert.equal(pageErrors.length, 0);
  const report = masonry.verifyR1MasonryAppearance({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-appearance-discriminator",
    packetId: path.basename(outputDirectory), createdAt, source, baseline: baselineRecord, baselineSampling: baselineSamplingRecord,
    controls: baseline.controls, resolvedSpec: baseline.resolvedSpec, identity: baseline.identity,
    materialAnchors: baseline.materialAnchors, freeze: baseline.freeze,
    geometryCheckpoint, brickSourceModel, captures, pageErrors, humanReview: "pending",
    limitations: [
      "These controlled material/shadow variants are diagnostics, not production repairs or human acceptance.",
      "The measured source and packed mortar fractions describe retained procedural RGBA pixels; quantized metre spans are the source-cell model, not a measured full-building course-density gate.",
      "Texture state hashes use bare actual RGBA bytes; S4 debug channel hashes separately include channel name and dimensions.",
      "The procedural 32-pixel source and 128-pixel atlas case does not establish remote-provider or representative-machine quality."
    ]
  }, baseline, baselineRecord.sha256, { report: baselineSampling, sha256: baselineSamplingRecord.sha256 });
  for (const record of source.diagnosticFiles) assert.deepEqual(await artifactRecord(inside(path.resolve(root, record.file))), record, "Source changed during capture.");
  assert.equal(digest(execFileSync("git", ["diff", "HEAD", "--binary"], { stdio: ["ignore", "pipe", "ignore"] })), source.trackedDiffSha256);
  await writeFile(path.join(outputDirectory, "masonry-appearance-report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ outputDirectory, captures: captures.length, geometryCheckpoint, brickSourceModel, pageErrors }, null, 2));
} catch (error) {
  console.error(error);
  if (pageErrors.length) console.error("Page errors:", pageErrors);
  process.exitCode = 1;
} finally {
  fixture?.familyRuntime.dispose();
  await browser?.close();
  await server?.close();
}
