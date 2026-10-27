/* global window, requestAnimationFrame */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { z } from "zod";

const root = process.cwd();
const args = process.argv.slice(2);
const prepareOnly = args.at(-1) === "--prepare-only";
if (prepareOnly) args.pop();
assert(args.length <= 2, "Provide exclusive output directory, optional frozen S9 ledger and --prepare-only.");
const outputDirectory = path.resolve(args[0] ?? "test-results/r1-s9-2026-10-14/2026-10-14-r1-s9");
const ledgerPath = path.resolve(args[1] ?? "test-results/r1-s9-2026-10-14/before-source/source-baseline.json");
const accepted = {
  baseline: { file: "docs/reviews/2026-10-14-r1-s8-verified/acceptance-card.json", sha256: "2ebeb86be27b87c8b9ac804b2013cf2d5d20e20aab14397cc030659797900392" },
  sampling: { file: "docs/reviews/2026-10-14-r1-s8-verified/sampling-report.json", sha256: "7f57778fe9796681bbed1642498b826694e3af4b4e32619492a3a460a9b28eab" },
  material: { file: "docs/reviews/2026-10-14-r1-s8-verified/periodic-material-baseline-delta.json", sha256: "8965d88007645138a38a5058b17563e5c2a8d225b19ebfe27230081c3113802b" },
  sourceProof: { file: "test-results/r1-s8-2026-10-14/final-02-proof/source-and-copy-checkpoint.json", sha256: "c71ae3c508bf640682c316789f1cf8b7bb09ea50ab64f8987464a1fa4c6eda4c" },
  ledger: { file: "test-results/r1-s9-2026-10-14/before-source/source-baseline.json", sha256: "6bcab4595019b871e999ce4515b309cc2a232af40d6ba485760b54ed2947834b" }
};
const changedPaths = new Set(["scripts/diagnostics/r1-building-capture.mjs", "scripts/diagnostics/r1-baseline-browser.mjs"]);
const newPaths = [
  "scripts/diagnostics/r1-wall-phase-attribution.mjs", "scripts/capture-r1-wall-phase.mjs",
  "scripts/diagnostics/r1-wall-phase-browser.mjs", "src/features/building-family/qa/r1WallPhase.ts",
  "src/features/building-family/tests/r1WallPhase.test.ts"
];
const geometryHash = "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const rawBytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const inside = target => {
  const absolute = path.resolve(target), relative = path.relative(root, absolute);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Evidence must stay inside the repository.");
  return absolute;
};
inside(outputDirectory); inside(ledgerPath);
assert.equal(ledgerPath, path.resolve(root, accepted.ledger.file), "Only the actual pre-edit S9 ledger is accepted.");
const record = async file => ({ file: path.relative(root, inside(file)).split(path.sep).join("/"), sha256: digest(await readFile(file)) });
const checked = async value => {
  const bytes = await readFile(inside(path.resolve(root, value.file)));
  assert.equal(digest(bytes), value.sha256, "Frozen evidence changed: " + value.file); return bytes;
};
const gitOptions = { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 };
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { ...gitOptions, encoding: "utf8" }).trim();
const trackedPatch = () => digest(execFileSync("git", ["diff", "HEAD", "--binary"], gitOptions));
const sourcePaths = () => execFileSync("rg", ["--files", "--hidden", "--no-ignore", "src", "server", "scripts"],
  { ...gitOptions, encoding: "utf8" }).trim().split(/\r?\n/).map(file => file.split(path.sep).join("/")).sort();
const frameSettled = page => page.evaluate(() => new Promise(resolve => {
  let count = 0;
  const tick = () => { count += 1; if (count >= 4) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
let server, browser, fixture;
const pageErrors = [];

try {
  await mkdir(path.dirname(outputDirectory), { recursive: true }); await mkdir(outputDirectory);
  server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 5173, strictPort: false, hmr: false } });
  if (!prepareOnly) await server.listen();
  const [contracts, masonry, periodic, phase, fixtureModule, providerModule, diagnostic, canonical, attribution, splitModule, subdivision, primitives, kitModule, plannerModule, seamModule, atlasGeometryModule, controllerModule] = await Promise.all([
    server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1MasonryAppearance.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1PeriodicSampling.ts"),
    server.ssrLoadModule("/src/features/building-family/qa/r1WallPhase.ts"),
    server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"),
    server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"),
    server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-wall-phase-attribution.mjs"),
    server.ssrLoadModule("/src/features/building-family/compiler/facadeSplitPlan.ts"),
    server.ssrLoadModule("/src/features/building-family/compiler/facadeWallSubdivision.ts"),
    server.ssrLoadModule("/src/features/building-family/compiler/primitiveGeometry.ts"),
    server.ssrLoadModule("/src/features/building-family/art-kit/late19cApartmentKit.ts"),
    server.ssrLoadModule("/src/features/building-family/art-kit/facadeModulePlanner.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-wall-seam-attribution.mjs"),
    server.ssrLoadModule("/src/features/building-family/renderer-three/wallAtlasGeometry.ts"),
    server.ssrLoadModule("/scripts/diagnostics/r1-wall-phase-browser.mjs")
  ]);
  const same = (a, b, message) => assert.equal(canonical.canonicalJson(a), canonical.canonicalJson(b), message);
  const loaded = Object.fromEntries(await Promise.all(Object.entries(accepted).map(async ([key, value]) => [key, JSON.parse((await checked(value)).toString("utf8"))])));
  const baseline = contracts.R1AcceptanceCardSchema.parse(loaded.baseline), baselineSampling = contracts.R1SamplingReportSchema.parse(loaded.sampling);
  const materialBaseline = periodic.R1PeriodicSamplingDeltaSchema.parse(loaded.material);
  const ledger = phase.R1WallPhaseSourceBaselineSchema.parse(loaded.ledger), prior = loaded.sourceProof;
  same(ledger.baseline, accepted.sourceProof); assert.equal(ledger.sourceCommit, head());
  assert.equal(baseline.packetId, "2026-10-14-r1-s8"); assert.equal(baseline.pageErrors.length + baselineSampling.pageErrors.length, 0);
  assert.equal(prior.sourceSnapshots.length, 55); assert.equal(prior.copiedArtifacts.length, 26);
  await checked(ledger.executionHelper); await checked(ledger.trackedPatch); await checked(prior.trackedPatch);
  for (const row of prior.sourceSnapshots) { assert.equal(row.original.sha256, row.snapshot.sha256); await checked(row.snapshot); }
  for (const row of prior.copiedArtifacts) { await checked(row.original); await checked(row.durable); assert.equal(row.original.sha256, row.durable.sha256); }
  for (const row of ledger.allSourceFiles) if (!changedPaths.has(row.file)) await checked(row);
  const expectedFiles = [...ledger.allSourceFiles.map(row => row.file), ...newPaths].sort();
  same(sourcePaths(), expectedFiles, "Only two declared existing hooks and five new diagnostic files may change the complete source tree.");
  const diagnosticPaths = [...new Set([...prior.source.diagnosticFiles.map(row => row.file), ...newPaths])].sort();
  assert.equal(diagnosticPaths.length, 60);
  const source = {
    commit: head(), trackedDiffSha256: trackedPatch(),
    dirtyPaths: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { ...gitOptions, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
    diagnosticFiles: await Promise.all(diagnosticPaths.map(file => record(path.resolve(root, file)))),
    documentId: baseline.source.documentId, replayCard: accepted.baseline
  };
  const allCurrent = await Promise.all(expectedFiles.map(file => record(path.resolve(root, file))));
  async function stable() {
    assert.equal(head(), source.commit); assert.equal(trackedPatch(), source.trackedDiffSha256);
    same(sourcePaths(), expectedFiles);
    for (const value of [...allCurrent, ...Object.values(accepted)]) await checked(value);
  }
  const provider = new providerModule.ProceduralMaterialProvider(), sources = new Map(), requests = new Map();
  fixture = await fixtureModule.createAssemblyHallFixture({ promptControls: baseline.controls, materialProvider: {
    id: provider.id,
    async generate(request, signal) {
      assert(!requests.has(request.sourceId), "Every request must be a fresh distinct source."); requests.set(request.sourceId, structuredClone(request));
      const result = await provider.generate(request, signal); assert(!sources.has(result.sourceId)); sources.set(result.sourceId, result); return result;
    }
  } });
  assert.equal(sources.size, 12); same(fixture.spec, baseline.resolvedSpec);
  const identity = { familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId,
    sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId, atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash };
  same(identity, baseline.identity); same(fixture.packedAtlas.manifest, baseline.materialAnchors.atlasManifest);
  const ordered = [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const materialState = () => ({
    sourceHashes: ordered.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash })),
    sourceLayerHashes: ordered.map(source => ({ sourceId: source.sourceId,
      ...Object.fromEntries(["baseColor", "height", "roughness", "metalness", "opacity"].map(name => [name, source.layers[name] ? digest(rawBytes(source.layers[name].data)) : null])),
      provenanceHash: digest(canonical.canonicalJson(source.provenance)) })),
    channelHashes: Object.fromEntries(fixture.debugExport.channels.map(({ name, channelHash }) => [name, channelHash])),
    channelDataHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(rawBytes(layer.data))]))
  });
  const frozenMaterial = materialState();
  for (const key of ["sourceHashes", "sourceLayerHashes", "channelHashes", "channelDataHashes"]) same(frozenMaterial[key], materialBaseline.after[key], "Actual S8 material bytes must remain exact.");
  same(ordered.map(source => requests.get(source.sourceId)), materialBaseline.afterRequests, "Actual profile/legacy seed requests remain exact.");
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const geometryBytes = geometry => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0);
  const geometryCheckpoint = masonry.R1MasonryGeometryCheckpointSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint",
    baseline: accepted.baseline, sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash,
    geometryHash: await diagnostic.fingerprintBuildingGeometry(fixture), atlasChannelDataHashes: frozenMaterial.channelDataHashes,
    irTriangles: fixture.ir.metrics.triangleCount, renderedTriangles: fixture.buildingRuntime.metrics.renderedTriangleCount,
    geometryBytes: [...new Set(fixture.buildingRuntime.renderables.map(object => object.geometry))].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
    instanceCount: fixture.ir.metrics.instanceCount });
  assert.equal(geometryCheckpoint.geometryHash, geometryHash); same({
    irTriangles: geometryCheckpoint.irTriangles, renderedTriangles: geometryCheckpoint.renderedTriangles,
    geometryBytes: geometryCheckpoint.geometryBytes, instanceCount: geometryCheckpoint.instanceCount
  }, materialBaseline.immutable.cost);
  await attribution.verifyFreshS8MaterialFixture({ fixture, sources, requests, materialBaseline, baseline, canonicalJson: canonical.canonicalJson, fingerprintBuildingGeometry: diagnostic.fingerprintBuildingGeometry });
  const ownership = await attribution.reconstructWallOwnership({ fixture, splitModule, subdivision, primitives, kit: kitModule.late19cApartmentKit, plannerModule });
  if (prepareOnly) {
    const controller = await controllerModule.createWallPhaseDiagnostic({ fixture });
    try {
      for (const phaseCondition of ["local", "shared", "local"]) {
        await controller.setWallPhaseDiagnostic(phaseCondition);
        const snapshot = await controller.wallPhaseDiagnosticSnapshot();
        const verified = attribution.verifySubmittedWallPhaseGeometry({ fixture, snapshot, ownership, baseline, createWallAtlasGeometry: atlasGeometryModule.createWallAtlasGeometry, same });
        assert.equal(verified.originalIrHash, attribution.fingerprintOriginalIr(fixture));
        console.log(JSON.stringify({ preparedPhase: phaseCondition, ...verified }));
      }
    } finally { controller.dispose(); }
    const prepared = z.object({ schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-s9-preparation"), source: contracts.R1AcceptanceCardSchema.shape.source,
      baseline: z.object({ file: z.string(), sha256: z.string().regex(/^[a-f\d]{64}$/) }), geometryCheckpoint: masonry.R1MasonryGeometryCheckpointSchema,
      sourceCount: z.literal(12), ownershipPieceCount: z.literal(265), actualBackendsCaptured: z.literal(false) }).strict().parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r1-s9-preparation", source, baseline: accepted.baseline, geometryCheckpoint,
      sourceCount: sources.size, ownershipPieceCount: ownership.length, actualBackendsCaptured: false
    });
    await stable(); same(materialState(), frozenMaterial); assert.equal(await diagnostic.fingerprintBuildingGeometry(fixture), geometryHash);
    await writeFile(path.join(outputDirectory, "preparation.json"), JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify(prepared, null, 2));
  } else {
    const createdAt = new Date().toISOString(), captures = [];
    browser = await chromium.launch();
    for (const backend of ["webgpu", "webgl"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
      page.on("pageerror", error => pageErrors.push(error.message));
      try {
        await page.goto(new URL("/scripts/diagnostics/r1-baseline.html", server.resolvedUrls.local[0]).href);
        await page.waitForFunction(() => !!window.r1Harness);
        const info = await page.evaluate(input => window.r1Harness.mount(input), { kind: "building", backend, controls: baseline.controls, freeze: baseline.freeze, wallPhaseDiagnostic: true });
        for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"]) same(info[key], baseline[key], "Frozen mount " + key + " changed.");
        assert.equal(info.actualBackend, backend); assert.equal(info.fallbackReason, null);
        const canvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]'); await canvas.waitFor({ state: "visible" });
        await page.getByRole("combobox", { name: "Reveal through stage" }).selectOption("roof", { force: true });
        await page.getByRole("combobox", { name: "Presentation mode" }).selectOption("textured", { force: true });
        for (const preset of phase.R1_WALL_PHASE_PRESETS.filter(row => row.requestedBackend === backend)) {
          await page.evaluate(({ viewName, lightingName }) => window.r1Harness.setCapture({ viewName, lightingName }), preset);
          let previousFrame = 0;
          for (const condition of phase.R1_WALL_PHASE_CONDITIONS) {
            const phaseCondition = condition.startsWith("shared-") ? "shared" : "local";
            const materialCondition = condition.includes("base-color-only") ? "base-color-only" : condition.includes("flat-no-shadow") ? "flat-no-shadow" : condition;
            // The phase setter is guarded by textured-material ownership. Restore
            // that owner before requesting the next phase, then apply treatment.
            await page.evaluate(() => window.r1Harness.setWallDiagnostic("production"));
            await page.evaluate(value => window.r1Harness.setWallPhaseDiagnostic(value), phaseCondition);
            await page.evaluate(value => window.r1Harness.setWallDiagnostic(value), materialCondition);
            await frameSettled(page);
            const snapshot = contracts.R1BuildingSnapshotSchema.parse(await page.evaluate(() => window.r1Harness.snapshot()));
            const wallState = masonry.R1MasonryWallStateSchema.parse(await page.evaluate(() => window.r1Harness.wallDiagnosticSnapshot()));
            const transport = await page.evaluate(() => window.r1Harness.wallPhaseDiagnosticSnapshot());
            assert.equal(transport.condition, phaseCondition); assert.equal(transport.actualBackend, backend);
            assert.equal(transport.submittedFrameCount, snapshot.frameCount); assert(snapshot.frameCount > previousFrame); previousFrame = snapshot.frameCount;
            const before = baseline.captures.find(row => row.snapshot.actualBackend === backend && row.snapshot.canvas.presentationMode === "textured" && row.snapshot.viewName === preset.viewName && row.snapshot.lightingName === preset.lightingName);
            assert(before, "Matching actual accepted S8 preset is required.");
            const { frameCount: oldFrame, ...oldSnapshot } = before.snapshot, { frameCount: currentFrame, ...currentSnapshot } = snapshot; void oldFrame; void currentFrame;
            same(currentSnapshot, oldSnapshot, "Frozen S8 snapshot changed.");
            const bytes = await canvas.screenshot(), file = `r1-s9-${backend}-${preset.viewName}-${preset.lightingName}-${condition}.png`;
            const screenshot = { file, sha256: digest(bytes), widthPx: snapshot.canvas.width, heightPx: snapshot.canvas.height };
            if (condition === "production" || condition === "restored-production") assert.equal(screenshot.sha256, before.screenshot.sha256, "Production/restoration pixels must be the actual S8 PNG bytes.");
            await writeFile(path.join(outputDirectory, file), bytes, { flag: "wx" });
            const runtime = Object.fromEntries(["references", "resources", "submittedFrameCount", "actualBackend", "backendCounters", "cost"].map(key => [key, transport[key]]));
            captures.push({ ...preset, condition, screenshot, snapshot, wallState, runtime, transport });
          }
        }
      } finally {
        try { await page.evaluate(() => window.r1Harness?.dispose()); } finally { await page.close(); }
      }
    }
    assert.equal(pageErrors.length, 0);
    const evidence = phase.verifyR1WallPhaseEvidence({ evidence: await attribution.buildWallPhaseAttribution({ fixture, ownership, captures, outputDirectory, baseline, materialBaseline, decodeScreenshotPng: seamModule.decodeScreenshotPng, createWallAtlasGeometry: atlasGeometryModule.createWallAtlasGeometry, same }), baseline, materialBaseline });
    const evidenceBytes = JSON.stringify(evidence, null, 2) + "\n", evidenceFile = path.join(outputDirectory, "wall-phase-attribution.json");
    const phaseEvidence = { file: path.relative(root, evidenceFile).split(path.sep).join("/"), sha256: digest(evidenceBytes) };
    const report = phase.verifyR1WallPhaseReport({ report: {
      schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-discriminator", packetId: path.basename(outputDirectory), createdAt, source,
      baseline: accepted.baseline, baselineSampling: accepted.sampling, materialBaseline: accepted.material, sourceBaseline: accepted.ledger, phaseEvidence,
      controls: baseline.controls, resolvedSpec: baseline.resolvedSpec, identity, materialAnchors: baseline.materialAnchors, freeze: baseline.freeze, geometryCheckpoint,
      captures: captures.map(({ transport, ...capture }) => { void transport; return capture; }), pageErrors, humanReview: "pending",
      limitations: ["Diagnostic phase treatment of owned ordinary wall exteriors only; production/IR/material adoption remains a separate reviewed packet.",
        "Actual S8 production/restored image hashes and protected source/IR/material bytes are required. Phase evidence is diagnostic and does not establish visual acceptance.",
        "Measured unique ArrayBuffer and triangle costs do not establish representative-machine/family performance. Flat-control pixel differences have no automatic causal threshold."]
    }, baseline: { report: baseline, sha256: accepted.baseline.sha256 }, sampling: { report: baselineSampling, sha256: accepted.sampling.sha256 },
    material: { report: materialBaseline, sha256: accepted.material.sha256 }, sourceBaseline: { report: ledger, sha256: accepted.ledger.sha256 }, evidence: { report: evidence, sha256: phaseEvidence.sha256 } });
    await stable(); same(materialState(), frozenMaterial); assert.equal(await diagnostic.fingerprintBuildingGeometry(fixture), geometryHash);
    await writeFile(evidenceFile, evidenceBytes, { flag: "wx" });
    await writeFile(path.join(outputDirectory, "acceptance-card.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ outputDirectory, captures: captures.length, sourceFingerprints: source.diagnosticFiles.length, phaseEvidence, pageErrors }, null, 2));
  }
} catch (error) {
  console.error(error); if (pageErrors.length) console.error("Page errors:", pageErrors); process.exitCode = 1;
} finally {
  try { fixture?.familyRuntime.dispose(); } finally { try { await browser?.close(); } finally { await server?.close(); } }
}
