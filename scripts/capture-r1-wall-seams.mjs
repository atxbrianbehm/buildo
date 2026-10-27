/* global window, requestAnimationFrame */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDirectory = path.resolve(process.argv[2] ?? "test-results/r1-s7-2026-10-14/2026-10-14-r1-s7");
const baselinePath = path.resolve(process.argv[3] ?? "docs/reviews/2026-10-14-r1-s6-verified/acceptance-card.json");
const inside = (target) => {
  const relative = path.relative(root, target);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Evidence paths must stay inside the repository.");
  return target;
};
inside(outputDirectory); inside(baselinePath);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const rawBytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const artifactRecord = async file => ({ file: path.relative(root, inside(file)).split(path.sep).join("/"), sha256: digest(await readFile(file)) });
const trackedPatch = () => digest(execFileSync("git", ["diff", "HEAD", "--binary"], { stdio: ["ignore", "pipe", "ignore"] }));
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const geometryHash = "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e";
const acceptedMaterialHash = "c365b4419ab23b0050b621ffff9ddf096a83b9e198a1eb942ff1774a42c5e9a4";
let server, browser, fixture;
const pageErrors = [];

try {
  await mkdir(path.dirname(outputDirectory), { recursive: true });
  // An exclusive directory keeps excluded attempts and accepted evidence separate.
  await mkdir(outputDirectory);
  server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 5173, strictPort: false, hmr: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  assert(url, "Vite must expose a loopback capture URL.");
  const [contracts, masonry, seams, coverage, fixtureModule, providerModule, diagnostic, canonical, attribution] = await Promise.all([
    server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1MasonryAppearance.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1WallSeams.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1MasonryCoverage.ts"),
    server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"),
    server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"),
    server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-wall-seam-attribution.mjs")
  ]);
  const same = (actual, expected, message) => assert.equal(canonical.canonicalJson(actual), canonical.canonicalJson(expected), message);
  const baseline = contracts.R1AcceptanceCardSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
  assert.equal(baseline.packetId, "2026-10-14-r1-s6");
  assert.equal(baseline.pageErrors.length, 0);
  const samplingPath = path.join(path.dirname(baselinePath), "sampling-report.json");
  const materialPath = path.join(path.dirname(baselinePath), "material-baseline-delta.json");
  const baselineSampling = contracts.R1SamplingReportSchema.parse(JSON.parse(await readFile(samplingPath, "utf8")));
  const materialBaseline = coverage.R1MasonryCoverageDeltaSchema.parse(JSON.parse(await readFile(materialPath, "utf8")));
  const baselineRecord = await artifactRecord(baselinePath);
  const samplingRecord = await artifactRecord(samplingPath);
  const materialRecord = await artifactRecord(materialPath);
  assert.equal(materialRecord.sha256, acceptedMaterialHash, "The accepted S6 material proof changed.");
  assert.equal(head(), baseline.source.commit, "S6 source commit changed.");
  assert.equal(trackedPatch(), baseline.source.trackedDiffSha256, "S6 tracked patch changed.");
  for (const record of baseline.source.diagnosticFiles) {
    same(await artifactRecord(inside(path.resolve(root, record.file))), record, `Frozen S6 source changed: ${record.file}`);
  }
  for (const row of baseline.captures) {
    assert.equal(digest(await readFile(inside(path.resolve(path.dirname(baselinePath), row.screenshot.file)))), row.screenshot.sha256,
      "An accepted S6 baseline PNG changed.");
  }
  const newPaths = [
    "scripts/capture-r1-wall-seams.mjs", "scripts/diagnostics/r1-wall-seam-attribution.mjs",
    "src/features/building-family/qa/r1WallSeams.ts", "src/features/building-family/tests/r1WallSeams.test.ts"
  ];
  const sourcePaths = [...baseline.source.diagnosticFiles.map(row => row.file), ...newPaths];
  assert.equal(new Set(sourcePaths).size, sourcePaths.length);
  const source = {
    commit: head(), trackedDiffSha256: trackedPatch(),
    dirtyPaths: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().split(/\r?\n/).filter(Boolean),
    diagnosticFiles: await Promise.all(sourcePaths.map(file => artifactRecord(inside(path.resolve(root, file))))),
    documentId: "buildo-demo-family", replayCard: baselineRecord
  };
  const provider = new providerModule.ProceduralMaterialProvider();
  const sources = new Map(), requests = new Map();
  fixture = await fixtureModule.createAssemblyHallFixture({ promptControls: baseline.controls, materialProvider: {
    id: provider.id,
    async generate(request, signal) {
      const artifact = await provider.generate(request, signal);
      assert(!sources.has(artifact.sourceId), "Repeated material source IDs are not a fresh twelve-source fixture.");
      sources.set(artifact.sourceId, artifact); requests.set(artifact.sourceId, request);
      return artifact;
    }
  } });
  same(fixture.spec, baseline.resolvedSpec, "Resolved S6 spec changed.");
  const identity = {
    familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId,
    sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId,
    atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash
  };
  same(identity, baseline.identity, "Graph/catalog/atlas/building identity changed.");
  same(fixture.packedAtlas.manifest, baseline.materialAnchors.atlasManifest, "Atlas anchors/manifest changed.");
  assert.equal(sources.size, 12);
  const orderedSources = [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const sourceHashes = orderedSources.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash }));
  const sourceLayerSnapshot = () => orderedSources.map(artifact => ({ sourceId: artifact.sourceId,
    ...Object.fromEntries(["baseColor", "height", "roughness", "metalness", "opacity"].map(name => [name,
      artifact.layers[name] ? digest(rawBytes(artifact.layers[name].data)) : null])),
    provenanceHash: digest(canonical.canonicalJson(artifact.provenance))
  }));
  const sourceLayerHashes = sourceLayerSnapshot();
  const channelHashes = Object.fromEntries(fixture.debugExport.channels.map(({ name, channelHash }) => [name, channelHash]));
  const channelDataHashes = Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(rawBytes(layer.data))]));
  same(sourceHashes, materialBaseline.after.sourceHashes, "Actual source identities changed from S6.");
  same(sourceLayerHashes, materialBaseline.after.sourceLayerHashes, "Actual source/provenance bytes changed from S6.");
  same(channelHashes, materialBaseline.after.channelHashes, "Actual encoded atlas channels changed from S6.");
  same(channelDataHashes, materialBaseline.after.channelDataHashes, "Actual raw packed atlas bytes changed from S6.");
  const procedural = baselineSampling.captures.filter(row => row.sourceName === "procedural");
  assert.equal(procedural.length, 2);
  for (const row of procedural) {
    same(sourceHashes, row.snapshot.sourceHashes, "Fresh procedural sources must match both recorded backends.");
    same(channelHashes, row.snapshot.channelHashes, "Fresh encoded atlas must match both recorded backends.");
  }
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const geometryBytes = geometry => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
  const geometryCheckpoint = masonry.R1MasonryGeometryCheckpointSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: baselineRecord,
    sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash,
    geometryHash: await diagnostic.fingerprintBuildingGeometry(fixture), atlasChannelDataHashes: channelDataHashes,
    irTriangles: fixture.ir.metrics.triangleCount, renderedTriangles: fixture.buildingRuntime.metrics.renderedTriangleCount,
    geometryBytes: [...new Set(fixture.buildingRuntime.renderables.map(object => object.geometry))].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
    instanceCount: fixture.ir.metrics.instanceCount
  });
  assert.equal(geometryCheckpoint.geometryHash, geometryHash, "Actual rendered/IR buffers changed.");
  const captures = [], createdAt = new Date().toISOString();
  browser = await chromium.launch();
  for (const backend of ["webgpu", "webgl"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", error => pageErrors.push(String(error)));
    try {
      await page.goto(new URL("/scripts/diagnostics/r1-baseline.html", url).href);
      await page.waitForFunction(() => !!window.r1Harness);
      const info = await page.evaluate(input => window.r1Harness.mount(input), {
        kind: "building", backend, controls: baseline.controls, freeze: baseline.freeze
      });
      for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"]) same(info[key], baseline[key], `Frozen mount ${key} changed.`);
      assert.equal(info.actualBackend, backend, "A fallback cannot serve as diagnostic evidence.");
      const canvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
      await canvas.waitFor({ state: "visible" });
      await page.getByRole("combobox", { name: "Reveal through stage" }).selectOption("roof", { force: true });
      await page.getByRole("combobox", { name: "Presentation mode" }).selectOption("textured", { force: true });
      for (const preset of seams.R1_WALL_SEAM_PRESETS.filter(row => row.requestedBackend === backend)) {
        await page.evaluate(({ viewName, lightingName }) => window.r1Harness.setCapture({ viewName, lightingName }), preset);
        for (const condition of masonry.R1_MASONRY_CONDITIONS) {
          await page.evaluate(value => window.r1Harness.setWallDiagnostic(value), condition);
          await page.evaluate(() => new Promise(resolve => {
            let frames = 0;
            const tick = () => { frames += 1; if (frames >= 4) resolve(); else requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
          }));
          const snapshot = contracts.R1BuildingSnapshotSchema.parse(await page.evaluate(() => window.r1Harness.snapshot()));
          const wallState = masonry.R1MasonryWallStateSchema.parse(await page.evaluate(() => window.r1Harness.wallDiagnosticSnapshot()));
          assert.equal(wallState.geometryHash, geometryHash);
          const before = baseline.captures.find(row => row.snapshot.actualBackend === backend && row.snapshot.canvas.presentationMode === "textured"
            && row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName);
          assert(before, "Missing matching S6 frozen view.");
          for (const key of ["camera", "key", "fill", "canvas", "materials"]) same(snapshot[key], before.snapshot[key], `Frozen capture ${key} changed.`);
          const bytes = await canvas.screenshot();
          const file = `seams-${backend}-${preset.viewName}-${preset.lightingName}-${condition}.png`;
          const screenshot = { file, sha256: digest(bytes), widthPx: snapshot.canvas.width, heightPx: snapshot.canvas.height };
          if (condition === "production" || condition === "restored-production") assert.equal(screenshot.sha256, before.screenshot.sha256,
            "Production/restored PNG must be byte-identical to the actual S6 view.");
          await writeFile(path.join(outputDirectory, file), bytes, { flag: "wx" });
          captures.push({ ...preset, condition, screenshot, snapshot, wallState });
        }
      }
      console.log(`${backend}: S7 frozen wall treatments captured`);
    } finally {
      await page.evaluate(() => window.r1Harness?.dispose()).catch(() => {});
      await page.close();
    }
  }
  assert.equal(pageErrors.length, 0);
  const evidence = attribution.R1WallSeamAttributionSchema.parse(await attribution.buildWallSeamAttribution({
    fixture, baseline, baselineSampling, sources, requests, captures, outputDirectory
  }));
  const attributionFile = path.join(outputDirectory, "wall-seam-attribution.json");
  const evidenceBytes = JSON.stringify(evidence, null, 2) + "\n";
  const attributionEvidence = { file: path.relative(root, attributionFile).split(path.sep).join("/"), sha256: digest(evidenceBytes) };
  const report = seams.verifyR1WallSeamReport({
    schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-seam-discriminator", packetId: path.basename(outputDirectory), createdAt,
    source, baseline: baselineRecord, baselineSampling: samplingRecord, materialBaseline: materialRecord, attributionEvidence,
    controls: baseline.controls, resolvedSpec: baseline.resolvedSpec, identity, materialAnchors: baseline.materialAnchors,
    freeze: baseline.freeze, geometryCheckpoint, captures, pageErrors, humanReview: "pending",
    limitations: [
      "Material and received-shadow treatments are diagnostics; they change no production geometry or source pixels and do not establish human acceptance.",
      "Frame counts measure successful draw submissions; the independent PNG comparisons prove presented production/restoration pixels.",
      "SSR ray/UV probes use actual rendered buffers and exact recorded camera matrices. Nearest CPU atlas samples describe texture inputs, not a complete shader/light/shadow evaluation.",
      "The procedural case does not clear source-document/warm-cache restore, non-wall UV defects, remote-provider quality or representative-machine/family performance."
    ]
  }, baseline, baselineRecord.sha256, { report: baselineSampling, sha256: samplingRecord.sha256 },
  { report: materialBaseline, sha256: materialRecord.sha256 });
  for (const record of source.diagnosticFiles) same(await artifactRecord(inside(path.resolve(root, record.file))), record, `Source changed during capture: ${record.file}`);
  assert.equal(head(), source.commit); assert.equal(trackedPatch(), source.trackedDiffSha256);
  assert.equal(await diagnostic.fingerprintBuildingGeometry(fixture), geometryCheckpoint.geometryHash, "Attribution mutated geometry.");
  same(sourceLayerSnapshot(), sourceLayerHashes, "Attribution mutated actual source/provenance bytes.");
  same(Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(rawBytes(layer.data))])), channelDataHashes,
    "Attribution mutated packed material bytes.");
  await writeFile(attributionFile, evidenceBytes, { flag: "wx" });
  await writeFile(path.join(outputDirectory, "frozen-geometry-checkpoint.json"), JSON.stringify(geometryCheckpoint, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(outputDirectory, "wall-seam-report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ outputDirectory, captures: captures.length, geometryHash, atlasContentHash: identity.atlasContentHash,
    sourceFingerprints: source.diagnosticFiles.length, attributionEvidence, pageErrors }, null, 2));
} catch (error) {
  console.error(error);
  if (pageErrors.length) console.error("Page errors:", pageErrors);
  process.exitCode = 1;
} finally {
  fixture?.familyRuntime.dispose();
  await browser?.close();
  await server?.close();
}
