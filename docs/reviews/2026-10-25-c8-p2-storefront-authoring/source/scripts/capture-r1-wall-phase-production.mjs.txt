/* global window, requestAnimationFrame */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { endianness } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { z } from "zod";
import { fingerprintOriginalIr } from "./diagnostics/r1-wall-phase-attribution.mjs";

const digest = input => createHash("sha256").update(input).digest("hex");
const raw = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const arrayCopy = array => array ? { type: array.constructor.name, byteLength: array.byteLength, bytes: digest(raw(array)) } : null;
function geometryCopy(geometry) {
  return Object.fromEntries([...Object.entries(geometry.attributes), ["index", geometry.index]].filter(([, attribute]) => attribute).map(([name, attribute]) => {
    assert(!attribute.isInterleavedBufferAttribute);
    return [name, { itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, array: arrayCopy(attribute.array) }];
  }));
}
const pins = {
  baseline: { file: "docs/reviews/2026-10-14-r1-s9-verified/acceptance-card.json", sha256: "19e255e86618f45db2b8a75b5d2dac47679622acc9e44190b27aedf8245bb189" },
  evidence: { file: "docs/reviews/2026-10-14-r1-s9-verified/wall-phase-attribution.json", sha256: "dc0681e8b4158d7c149c0dc57baeecb825c061fb2a4d60d362aac5d0504d2ba1" },
  sampling: { file: "docs/reviews/2026-10-14-r1-s8-verified/sampling-report.json", sha256: "7f57778fe9796681bbed1642498b826694e3af4b4e32619492a3a460a9b28eab" },
  material: { file: "docs/reviews/2026-10-14-r1-s8-verified/periodic-material-baseline-delta.json", sha256: "8965d88007645138a38a5058b17563e5c2a8d225b19ebfe27230081c3113802b" },
  source: { file: "test-results/r1-s10-2026-10-14/before-source/source-baseline.json", sha256: "9c2834bd27119c14ec173971cf6b12eabe1bdaa4a12c4287ac76524745394495" },
  uv: { file: "test-results/r1-s10-2026-10-14/before-original-wall-uvs/original-wall-uvs.json", sha256: "02080dd1a915ce05bbd74dfc1aa8c754e2dc1a9df20b9cf5cc2c4ada605ae0b8" }
};
const presets = [{ requestedBackend: "webgpu", viewName: "rear", lightingName: "ordinary" }, { requestedBackend: "webgpu", viewName: "right", lightingName: "ordinary" }, { requestedBackend: "webgl", viewName: "three-quarter", lightingName: "ordinary" }];
const conditions = ["production", "base-color-only", "flat-no-shadow", "restored-production"];

/** One fresh-production seam for the runner and independent root preservation.
 * The caller owns fixture lifetime, provider outputs and optional actual PNGs. */
export async function verifyFreshWallPhaseProduction({ fixture, sources, requests, acceptedS9, materialBaseline, uvCheckpoint, canonicalJson, qa, fingerprintBuildingGeometry, decodePng, createAtlasDebugExport, captures, actualPngs }) {
  const same = (a, b, message) => assert.equal(canonicalJson(a), canonicalJson(b), message);
  const baseline = acceptedS9.report, evidence = acceptedS9.evidence, checkpoint = qa.R1WallPhaseProductionUvCheckpointSchema.parse(uvCheckpoint.report);
  assert.equal(baseline.packetId, "2026-10-14-r1-s9"); assert.equal(endianness(), "LE");
  assert.equal(digest(uvCheckpoint.bytes), checkpoint.sourceUv.bytes.sha256);
  const ordered = [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)); assert.equal(ordered.length, 12); assert.equal(requests.size, 12);
  assert.equal(typeof decodePng, "function"); assert.equal(typeof createAtlasDebugExport, "function");
  const pngBytes = channel => {
    assert.equal(typeof channel.pngDataUrl, "string"); assert(channel.pngDataUrl.startsWith("data:image/png;base64,"));
    const encoded = channel.pngDataUrl.slice("data:image/png;base64,".length), bytes = Buffer.from(encoded, "base64");
    assert.equal(bytes.toString("base64"), encoded, "Atlas PNG requires canonical base64 bytes."); return bytes;
  };
  const channelHashes = {}, encodedChannels = new Map(), expectedNames = Object.keys(materialBaseline.after.channelHashes).sort();
  assert.equal(fixture.debugExport.channels.length, expectedNames.length);
  for (const channel of fixture.debugExport.channels) {
    assert(expectedNames.includes(channel.name)); assert(!encodedChannels.has(channel.name));
    const bytes = pngBytes(channel), decoded = await decodePng(bytes), layer = fixture.packedAtlas.channels[channel.name];
    assert.equal(decoded.width, layer.widthPx); assert.equal(decoded.height, layer.heightPx);
    assert.equal(channel.widthPx, decoded.width); assert.equal(channel.heightPx, decoded.height); assert.equal(channel.byteLength, layer.data.byteLength);
    assert.equal(decoded.data.byteLength, decoded.width * decoded.height * 4);
    assert(Buffer.from(raw(decoded.data)).equals(Buffer.from(raw(layer.data))), "Actual encoded atlas PNG differs from actual packed RGBA.");
    assert.equal(digest(raw(decoded.data)), materialBaseline.after.channelDataHashes[channel.name], "Decoded atlas PNG must equal S8-verified raw channel bytes.");
    // The historical channelHash hashes a named RGBA payload, not the PNG binary.
    const actualHash = digest(Buffer.concat([Buffer.from(`${channel.name}:${decoded.width}x${decoded.height}:`), Buffer.from(raw(decoded.data))]));
    assert.equal(actualHash, channel.channelHash); assert.equal(actualHash, materialBaseline.after.channelHashes[channel.name]);
    channelHashes[channel.name] = actualHash; encodedChannels.set(channel.name, bytes);
  }
  const materialState = { sourceHashes: ordered.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash })),
    sourceLayerHashes: ordered.map(source => ({ sourceId: source.sourceId, ...Object.fromEntries(["baseColor", "height", "roughness", "metalness", "opacity"].map(name => [name, source.layers[name] ? digest(raw(source.layers[name].data)) : null])), provenanceHash: digest(canonicalJson(source.provenance)) })),
    channelHashes, channelDataHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(raw(layer.data))])) };
  for (const key of Object.keys(materialState)) same(materialState[key], materialBaseline.after[key], "Actual S8 material " + key + " changed.");
  same(materialState, checkpoint.materialState); same(ordered.map(source => requests.get(source.sourceId)), materialBaseline.afterRequests);
  // S8 persisted raw-channel hashes, not separate atlas PNG byte artifacts.
  // Re-encode owned copies of those verified raw channels with its unchanged encoder.
  const reconstructed = await createAtlasDebugExport({ ...fixture.packedAtlas, channels: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, { ...layer, data: layer.data.slice() }])) });
  assert.equal(reconstructed.channels.length, expectedNames.length);
  for (const channel of reconstructed.channels) assert(encodedChannels.get(channel.name)?.equals(pngBytes(channel)), "Actual atlas PNG bytes differ from deterministic encoding of S8-verified raw pixels.");
  same(fixture.spec, baseline.resolvedSpec); same(fixture.packedAtlas.manifest, baseline.materialAnchors.atlasManifest);
  const identity = { familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId, sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId, atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash }; same(identity, baseline.identity); same(identity, checkpoint.identity);
  const targets = fixture.ir.meshBatches.filter(batch => batch.batchId === "mesh.wall-panels"); assert.equal(targets.length, 1);
  const uvProof = await qa.verifyWallPhaseProductionUvs({ currentUvs: targets[0].uvs, originalUvBytes: uvCheckpoint.bytes, sourceFaces: evidence.sourceFaces });
  const productionIrHash = fingerprintOriginalIr(fixture), recoveredOriginalIrHash = fingerprintOriginalIr({ ir: qa.createWallPhaseLegacyIrView(fixture.ir, uvProof.originalUvs) });
  assert.equal(recoveredOriginalIrHash, checkpoint.originalIrHash); assert.equal(recoveredOriginalIrHash, evidence.originalIrHash); assert.notEqual(productionIrHash, recoveredOriginalIrHash);
  const irMetadataHash = digest(canonicalJson(qa.wallPhaseProductionIrMetadata(fixture.ir))); assert.equal(irMetadataHash, checkpoint.irMetadataHash);
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const runtime = fixture.buildingRuntime, selected = runtime.renderables.find(object => object.name === "mesh.wall-panels"); assert(selected?.isMesh && !selected.isInstancedMesh);
  const protectedGeometry = runtime.renderables.filter(object => object !== selected).map(object => ({ batchId: object.name, geometry: geometryCopy(object.geometry), matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(), instanceMatrix: object.isInstancedMesh ? arrayCopy(object.instanceMatrix.array) : null }));
  const transformState = { root: runtime.root.matrix.toArray(), rootWorld: runtime.root.matrixWorld.toArray(), stages: runtime.stageGroups.map(({ stage, group }) => ({ stage, matrix: group.matrix.toArray(), matrixWorld: group.matrixWorld.toArray() })), selectedMatrix: selected.matrix.toArray(), selectedWorld: selected.matrixWorld.toArray() };
  const protectedGeometryHash = digest(JSON.stringify({ protectedGeometry, transformState })); assert.equal(protectedGeometryHash, evidence.protectedGeometryHash);
  const instanceTransformsHash = digest(JSON.stringify({ source: fixture.ir.instanceBatches.map(batch => ({ batchId: batch.batchId, count: batch.count, transforms: arrayCopy(batch.transforms) })), submitted: protectedGeometry.filter(row => row.instanceMatrix).map(({ batchId, instanceMatrix, matrix, matrixWorld }) => ({ batchId, instanceMatrix, matrix, matrixWorld })) })); assert.equal(instanceTransformsHash, evidence.instanceTransformsHash);
  const selectedGeometryHash = digest(JSON.stringify(geometryCopy(selected.geometry))), shared = evidence.geometryStates.find(row => row.phase === "shared"); assert(shared); assert.equal(selectedGeometryHash, shared.selectedGeometryHash);
  const geometryBuffers = new Set(), instanceBuffers = new Set();
  for (const object of runtime.renderables) {
    for (const attribute of [...Object.values(object.geometry.attributes), object.geometry.index].filter(Boolean)) geometryBuffers.add(attribute.array.buffer);
    if (object.isInstancedMesh) instanceBuffers.add(object.instanceMatrix.array.buffer);
  }
  assert([...instanceBuffers].every(buffer => !geometryBuffers.has(buffer)));
  const productionProof = qa.R1WallPhaseProductionProofSchema.parse({ productionIrHash, recoveredOriginalIrHash, irMetadataHash, originalUvHash: uvProof.originalUvHash, productionUvHash: uvProof.productionUvHash,
    selectedGeometryHash, geometryHash: await fingerprintBuildingGeometry(fixture), protectedGeometryHash, instanceTransformsHash, selectedFaceCount: uvProof.selectedFaceCount, protectedFaceCount: uvProof.protectedFaceCount, changedScalarCount: uvProof.changedScalarCount,
    cost: { irTriangles: fixture.ir.metrics.triangleCount, renderedTriangles: runtime.renderables.reduce((sum, object) => sum + (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1), 0),
      geometryBytes: [...geometryBuffers].reduce((sum, buffer) => sum + buffer.byteLength, 0), instanceCount: fixture.ir.metrics.instanceCount, instanceMatrixBytes: [...instanceBuffers].reduce((sum, buffer) => sum + buffer.byteLength, 0), selectedRenderedVertices: selected.geometry.attributes.position.count, selectedRenderedTriangles: (selected.geometry.index?.count ?? selected.geometry.attributes.position.count) / 3 } });
  assert.equal(productionProof.cost.irTriangles, materialBaseline.immutable.cost.irTriangles); assert.equal(productionProof.cost.instanceCount, materialBaseline.immutable.cost.instanceCount);
  assert.equal(productionProof.cost.selectedRenderedVertices, shared.selectedVertexCount); assert.equal(productionProof.cost.selectedRenderedTriangles, shared.selectedTriangleCount); assert.equal(productionProof.cost.renderedTriangles, shared.totalRenderedTriangles);
  assert.equal(Boolean(captures), Boolean(actualPngs));
  if (captures) {
    assert.equal(captures.length, 12); assert.equal(actualPngs.size, 12);
    for (const row of captures) {
      same(row.productionState, Object.fromEntries(["productionIrHash", "irMetadataHash", "selectedGeometryHash", "geometryHash", "protectedGeometryHash", "instanceTransformsHash"].map(key => [key, productionProof[key]])), "Presented production hashes must match independently rebuilt actual buffers.");
      const actual = actualPngs.get(row.screenshot.file); assert(actual); assert.equal(digest(actual.bytes), row.screenshot.sha256);
      assert.equal(actual.decoded.width, row.screenshot.widthPx); assert.equal(actual.decoded.height, row.screenshot.heightPx); assert.equal(actual.decoded.data.length, actual.decoded.width * actual.decoded.height * 4);
      if (row.condition === "base-color-only" || row.condition === "flat-no-shadow") {
        const old = baseline.captures.find(candidate => candidate.requestedBackend === row.requestedBackend && candidate.viewName === row.viewName && candidate.lightingName === row.lightingName && candidate.condition === "shared-" + row.condition); assert(old); assert.equal(row.screenshot.sha256, old.screenshot.sha256);
      }
      if (row.condition === "restored-production") {
        const production = captures.find(candidate => candidate.requestedBackend === row.requestedBackend && candidate.viewName === row.viewName && candidate.lightingName === row.lightingName && candidate.condition === "production"); assert(production); assert.equal(row.screenshot.sha256, production.screenshot.sha256);
        assert(Buffer.from(actual.bytes).equals(Buffer.from(actualPngs.get(production.screenshot.file).bytes)));
      }
    }
  }
  return { productionProof, materialState };
}

export async function runWallPhaseProductionCapture(argv = process.argv.slice(2)) {
  const root = process.cwd(), args = [...argv], prepareOnly = args.at(-1) === "--prepare-only"; if (prepareOnly) args.pop(); assert(args.length <= 1);
  const outputDirectory = path.resolve(args[0] ?? "test-results/r1-s10-2026-10-14/2026-10-14-r1-s10"), relative = path.relative(root, outputDirectory); assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const gitOptions = { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }, head = () => execFileSync("git", ["rev-parse", "HEAD"], { ...gitOptions, encoding: "utf8" }).trim(), patch = () => digest(execFileSync("git", ["diff", "HEAD", "--binary"], gitOptions));
  const sourcePaths = () => execFileSync("rg", ["--files", "--hidden", "--no-ignore", "src", "server", "scripts"], { ...gitOptions, encoding: "utf8" }).trim().split(/\r?\n/).map(file => file.split(path.sep).join("/")).sort();
  const checked = async pointer => { const target = path.resolve(root, pointer.file), rel = path.relative(root, target); assert(rel && !rel.startsWith("..") && !path.isAbsolute(rel)); const bytes = await readFile(target); assert.equal(digest(bytes), pointer.sha256, "Frozen artifact changed: " + pointer.file); return bytes; };
  const record = async file => ({ file, sha256: digest(await readFile(path.resolve(root, file))) });
  let server, browser, fixture; const pageErrors = [];
  try {
    await mkdir(path.dirname(outputDirectory), { recursive: true }); await mkdir(outputDirectory);
    server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 5173, strictPort: false, hmr: false } }); if (!prepareOnly) await server.listen();
    const [qa, phase, contracts, periodic, masonry, canonical, fixtureModule, providerModule, diagnostic, decoder, productionBrowser, atlasDebugModule] = await Promise.all([
      server.ssrLoadModule("/src/features/building-family/qa/r1WallPhaseProduction.ts"), server.ssrLoadModule("/src/features/building-family/qa/r1WallPhase.ts"), server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"), server.ssrLoadModule("/src/features/building-family/qa/r1PeriodicSampling.ts"),
      server.ssrLoadModule("/src/features/building-family/qa/r1MasonryAppearance.ts"), server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts"), server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"), server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
      server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"), server.ssrLoadModule("/scripts/diagnostics/r1-wall-seam-attribution.mjs"), server.ssrLoadModule("/scripts/diagnostics/r1-wall-phase-production-browser.mjs"), server.ssrLoadModule("/src/features/building-family/materials/atlasDebugExport.ts")
    ]);
    const same = (a, b, message) => assert.equal(canonical.canonicalJson(a), canonical.canonicalJson(b), message), parsed = Object.fromEntries(await Promise.all(Object.entries(pins).map(async ([key, value]) => [key, JSON.parse((await checked(value)).toString("utf8"))])));
    const baseline = phase.R1WallPhaseReportSchema.parse(parsed.baseline), evidence = phase.R1WallPhaseEvidenceSchema.parse(parsed.evidence), sampling = contracts.R1SamplingReportSchema.parse(parsed.sampling), material = periodic.R1PeriodicSamplingDeltaSchema.parse(parsed.material);
    const ledger = qa.R1WallPhaseProductionSourceBaselineSchema.parse(parsed.source), uv = qa.R1WallPhaseProductionUvCheckpointSchema.parse(parsed.uv), uvBytes = await checked(uv.sourceUv.bytes);
    assert.equal(ledger.sourceCommit, head()); await checked(ledger.executionHelper); await checked(ledger.trackedPatch); await checked(uv.executionHelper); await checked(uv.executionHelperSnapshot); await checked(uv.trackedPatch);
    const prior = JSON.parse((await checked(ledger.baseline)).toString("utf8")); assert.equal(prior.copiedArtifacts.length, 20); assert.equal(prior.sourceSnapshots.length, 60);
    for (const row of prior.copiedArtifacts) { await checked(row.original); await checked(row.durable); assert.equal(row.original.sha256, row.durable.sha256); }
    for (const row of prior.sourceSnapshots) { assert.equal(row.original.sha256, row.snapshot.sha256); await checked(row.snapshot); }
    for (const row of ledger.preEditSnapshots) { assert.equal(row.original.sha256, row.snapshot.sha256); await checked(row.snapshot); }
    const priorMaterial = JSON.parse((await checked(ledger.priorMaterialBaseline)).toString("utf8"));
    for (const row of priorMaterial.copiedArtifacts) { await checked(row.original); await checked(row.durable); assert.equal(row.original.sha256, row.durable.sha256); }
    for (const row of ledger.acceptedMaterialArtifacts) { await checked(row.original); await checked(row.durable); assert.equal(row.original.sha256, row.durable.sha256); }
    const permitted = new Set(ledger.permittedExisting); for (const row of ledger.allSourceFiles) if (!permitted.has(row.file)) await checked(row);
    const expectedFiles = [...ledger.allSourceFiles.map(row => row.file), ...ledger.permittedAdded].sort(); same(sourcePaths(), expectedFiles);
    const diagnosticPaths = [...new Set([...baseline.source.diagnosticFiles.map(row => row.file), ...ledger.permittedExisting, ...ledger.permittedAdded])].sort();
    const source = { commit: head(), trackedDiffSha256: patch(), dirtyPaths: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { ...gitOptions, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean), diagnosticFiles: await Promise.all(diagnosticPaths.map(record)), documentId: baseline.source.documentId, replayCard: pins.baseline };
    const current = await Promise.all(expectedFiles.map(record));
    async function stable() { assert.equal(head(), source.commit); assert.equal(patch(), source.trackedDiffSha256); same(sourcePaths(), expectedFiles); for (const row of [...current, ...Object.values(pins)]) await checked(row); }
    const sources = new Map(), requests = new Map(), provider = new providerModule.ProceduralMaterialProvider();
    fixture = await fixtureModule.createAssemblyHallFixture({ promptControls: baseline.controls, materialProvider: { id: provider.id, async generate(request, signal) { assert(!requests.has(request.sourceId)); requests.set(request.sourceId, structuredClone(request)); const result = await provider.generate(request, signal); assert(!sources.has(result.sourceId)); sources.set(result.sourceId, result); return result; } } });
    const verifierInput = { fixture, sources, requests, acceptedS9: { report: baseline, evidence }, materialBaseline: material, uvCheckpoint: { report: uv, bytes: uvBytes }, canonicalJson: canonical.canonicalJson, qa, fingerprintBuildingGeometry: diagnostic.fingerprintBuildingGeometry,
      decodePng: decoder.decodeScreenshotPng, createAtlasDebugExport: atlasDebugModule.createAtlasDebugExport };
    const fresh = await verifyFreshWallPhaseProduction(verifierInput);
    same(await productionBrowser.measureWallPhaseProductionFixture(fixture), Object.fromEntries(["productionIrHash", "irMetadataHash", "selectedGeometryHash", "geometryHash", "protectedGeometryHash", "instanceTransformsHash"].map(key => [key, fresh.productionProof[key]])), "Browser production hash protocol must match independent Node reconstruction.");
    if (prepareOnly) {
      const prepared = z.object({ schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-phase-production-preparation"), source: contracts.R1AcceptanceCardSchema.shape.source, productionProof: qa.R1WallPhaseProductionProofSchema, actualBackendsCaptured: z.literal(false) }).strict().parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-production-preparation", source, productionProof: fresh.productionProof, actualBackendsCaptured: false });
      await stable(); same(await verifyFreshWallPhaseProduction(verifierInput), fresh); await writeFile(path.join(outputDirectory, "preparation.json"), JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify({ outputDirectory, sourceFingerprints: source.diagnosticFiles.length, productionProof: fresh.productionProof, actualBackendsCaptured: false }, null, 2)); return;
    }
    const createdAt = new Date().toISOString(), captures = [], actualPngs = new Map(); browser = await chromium.launch();
    for (const backend of ["webgpu", "webgl"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 }); page.on("pageerror", error => pageErrors.push(String(error)));
      try {
        await page.goto(new URL("/scripts/diagnostics/r1-baseline.html", server.resolvedUrls.local[0]).href); await page.addScriptTag({ type: "module", url: "/scripts/diagnostics/r1-wall-phase-production-browser.mjs" }); await page.waitForFunction(() => !!window.r1WallPhaseProductionHarness);
        const info = await page.evaluate(input => window.r1WallPhaseProductionHarness.mount(input), { controls: baseline.controls, backend, freeze: baseline.freeze });
        for (const key of ["controls", "resolvedSpec", "identity", "materialAnchors", "freeze"]) same(info[key], baseline[key]); assert.equal(info.actualBackend, backend); assert.equal(info.fallbackReason, null);
        const canvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]'); await canvas.waitFor({ state: "visible" }); await page.getByRole("combobox", { name: "Reveal through stage" }).selectOption("roof", { force: true }); await page.getByRole("combobox", { name: "Presentation mode" }).selectOption("textured", { force: true });
        for (const preset of presets.filter(row => row.requestedBackend === backend)) {
          await page.evaluate(input => window.r1WallPhaseProductionHarness.setCapture(input), preset);
          for (const condition of conditions) {
            await page.evaluate(value => window.r1WallPhaseProductionHarness.setWallDiagnostic(value), condition);
            await page.evaluate(() => new Promise(resolve => { let count = 0; const tick = () => { if (++count >= 4) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
            const snapshot = contracts.R1BuildingSnapshotSchema.parse(await page.evaluate(() => window.r1WallPhaseProductionHarness.snapshot())), wallState = masonry.R1MasonryWallStateSchema.parse(await page.evaluate(() => window.r1WallPhaseProductionHarness.wallDiagnosticSnapshot())), productionState = await page.evaluate(() => window.r1WallPhaseProductionHarness.productionSnapshot());
            const file = `r1-s10-${backend}-${preset.viewName}-${preset.lightingName}-${condition}.png`, bytes = await canvas.screenshot(), screenshot = { file, sha256: digest(bytes), widthPx: snapshot.canvas.width, heightPx: snapshot.canvas.height };
            await writeFile(path.join(outputDirectory, file), bytes, { flag: "wx" }); actualPngs.set(file, { bytes, decoded: decoder.decodeScreenshotPng(bytes) }); captures.push({ ...preset, condition, screenshot, snapshot, wallState, productionState });
          }
        }
      } finally { try { await page.evaluate(() => window.r1WallPhaseProductionHarness?.dispose()); } finally { await page.close(); } }
    }
    assert.equal(pageErrors.length, 0); same(await verifyFreshWallPhaseProduction({ ...verifierInput, captures, actualPngs }), fresh);
    const report = qa.verifyR1WallPhaseProductionReport({ report: { schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-production", packetId: path.basename(outputDirectory), createdAt, source, baseline: pins.baseline, phaseEvidence: pins.evidence, baselineSampling: pins.sampling, materialBaseline: pins.material, sourceBaseline: pins.source, uvCheckpoint: pins.uv,
      controls: baseline.controls, resolvedSpec: baseline.resolvedSpec, identity: baseline.identity, materialAnchors: baseline.materialAnchors, freeze: baseline.freeze, productionProof: fresh.productionProof, materialState: fresh.materialState, captures, pageErrors, humanReview: "pending",
      limitations: ["Fresh default compilation only. Existing completed-family runtimeIr, identity/cache invalidation and migration remain R2 work.", "Actual S9 shared base/flat pixels are comparators; full-production/restoration establishes an explicit new S10 geometry baseline.", "Atlas PNG bytes are freshly decoded and deterministically re-encoded from S8-verified raw channels; S8 did not separately persist those encoded PNG byte artifacts. Historical channelHash identifies the named RGBA payload, not PNG binary bytes.", "Construction counts and diagnostic guards do not establish representative-machine or family performance, measured course density or human visual acceptance."] },
      baseline: { report: baseline, sha256: pins.baseline.sha256 }, evidence: { report: evidence, sha256: pins.evidence.sha256 }, sampling: { report: sampling, sha256: pins.sampling.sha256 }, material: { report: material, sha256: pins.material.sha256 }, sourceBaseline: { report: ledger, sha256: pins.source.sha256 }, uvCheckpoint: { report: uv, sha256: pins.uv.sha256 } });
    await stable(); same(await verifyFreshWallPhaseProduction(verifierInput), fresh); await writeFile(path.join(outputDirectory, "acceptance-card.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify({ outputDirectory, captures: captures.length, sourceFingerprints: source.diagnosticFiles.length, productionProof: fresh.productionProof, pageErrors }, null, 2));
  } finally { try { fixture?.familyRuntime.dispose(); } finally { try { await browser?.close(); } finally { await server?.close(); } } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runWallPhaseProductionCapture(); } catch (error) { console.error(error); process.exitCode = 1; }
}
