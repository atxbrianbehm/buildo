import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { createIndependentPeriodicMasonryOracle } from "./r1-periodic-masonry-oracle.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const checkpointFile = "test-results/r1-s8-2026-10-14/before-source/material-byte-checkpoint.json";
const checkpointSHA = "59342dc99d9c119e953c88cda5fda955a54f19c3d7a4362791f28bda710a8e43";
const accepted = {
  s6Card: { file: "docs/reviews/2026-10-14-r1-s6-verified/acceptance-card.json", sha256: "7a9b28fb747e06431c16437ade61639eb43fe326c1c0c66e68a3cd638b035f0f" },
  s6Sampling: { file: "docs/reviews/2026-10-14-r1-s6-verified/sampling-report.json", sha256: "3cfbb91aca772e6962e5feee1a6555d493e6386331a6b53c21ab5989956f2838" },
  s6Material: { file: "docs/reviews/2026-10-14-r1-s6-verified/material-baseline-delta.json", sha256: "c365b4419ab23b0050b621ffff9ddf096a83b9e198a1eb942ff1774a42c5e9a4" },
  s7Report: { file: "docs/reviews/2026-10-14-r1-s7-verified/wall-seam-report.json", sha256: "9a23646cf31969792196d1fe48dd4ef3c017f83938f976fd1bcb6e1cb3075669" },
  s7SourceProof: { file: "test-results/r1-s7-2026-10-14/final-01-proof/source-and-copy-checkpoint.json", sha256: "f431bd621adff3c3c4d384e1a0e94d72fb5355265958b1a5c3aff326b67b83be" }
};
function inside(root, file) {
  const absolute = path.resolve(root, file), relative = path.relative(root, absolute);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Periodic proof files must stay inside the repository.");
  return absolute;
}
async function checkedBytes(root, record) {
  const bytes = await readFile(inside(root, record.file));
  assert.equal(digest(bytes), record.sha256, "Frozen periodic baseline changed: " + record.file);
  return bytes;
}
async function record(root, file) { return { file, sha256: digest(await readFile(inside(root, file))) }; }
function decode(layer) {
  const bytes = Buffer.from(layer.dataBase64, "base64");
  assert.equal(bytes.length, layer.widthPx * layer.heightPx * 4, "RGBA DTO byte length changed.");
  assert.equal(bytes.toString("base64"), layer.dataBase64, "RGBA DTO must use canonical base64.");
  assert.equal(digest(bytes), layer.sha256, "Actual frozen RGBA bytes changed.");
  return { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: "rgba8", data: new Uint8ClampedArray(bytes) };
}
function checkpointFor(atlas, actualGeometry, baseline) {
  return { schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline,
    ...actualGeometry, atlasContentHash: atlas.contentHash,
    atlasChannelDataHashes: Object.fromEntries(Object.entries(atlas.channels).map(([name, layer]) => [name, digest(raw(layer.data))])) };
}

/** Fresh current output versus independently hash-decoded actual S6 bytes, plus complete no-profile replay. */
export async function prepareR1PeriodicWallMaterialDelta({ root = process.cwd(), packetId, createdAt = new Date().toISOString(),
  beforeCheckpointPath = checkpointFile }) {
  assert(packetId, "A periodic material capture packet ID is required.");
  assert.equal(inside(root, beforeCheckpointPath), inside(root, checkpointFile));
  const checkpointBytes = await checkedBytes(root, { file: beforeCheckpointPath, sha256: checkpointSHA });
  const baselineBytes = Object.fromEntries(await Promise.all(Object.entries(accepted).map(async ([key, value]) => [key, await checkedBytes(root, value)])));
  const baseline = { ...accepted, beforeCheckpoint: { file: checkpointFile, sha256: checkpointSHA } };
  const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false } });
  let fixture;
  try {
    const [qa, contracts, coverage, fixtureModule, providerModule, packer, planner, debug, decoder, diagnostic, canonical, seedModule] = await Promise.all([
      server.ssrLoadModule("/src/features/building-family/qa/r1PeriodicSampling.ts"),
      server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"),
      server.ssrLoadModule("/src/features/building-family/qa/r1MasonryCoverage.ts"),
      server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"),
      server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
      server.ssrLoadModule("/src/features/building-family/materials/atlasPacker.ts"),
      server.ssrLoadModule("/src/features/building-family/materials/atlasPlanner.ts"),
      server.ssrLoadModule("/src/features/building-family/materials/atlasDebugExport.ts"),
      server.ssrLoadModule("/src/features/building-family/state/completedFamilyExportVerifier.ts"),
      server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"),
      server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts"),
      server.ssrLoadModule("/src/features/building-family/core/seedTree.ts")
    ]);
    const same = (actual, expected, message) => assert.equal(canonical.canonicalJson(actual), canonical.canonicalJson(expected), message);
    const checkpoint = qa.R1PeriodicSamplingByteCheckpointSchema.parse(JSON.parse(checkpointBytes.toString("utf8")));
    const card = contracts.R1AcceptanceCardSchema.parse(JSON.parse(baselineBytes.s6Card.toString("utf8")));
    const sampling = contracts.R1SamplingReportSchema.parse(JSON.parse(baselineBytes.s6Sampling.toString("utf8")));
    const material = coverage.verifyR1MasonryCoverageDelta(JSON.parse(baselineBytes.s6Material.toString("utf8")));
    const seams = JSON.parse(baselineBytes.s7Report.toString("utf8")), priorProof = JSON.parse(baselineBytes.s7SourceProof.toString("utf8"));
    assert.equal(card.packetId, "2026-10-14-r1-s6");
    same(checkpoint.baselineCard, accepted.s6Card); same(checkpoint.baselineMaterial, accepted.s6Material);
    same(checkpoint.priorPacket, accepted.s7Report); same(checkpoint.priorSourceProof, accepted.s7SourceProof);
    same(checkpoint.identity, card.identity); same(checkpoint.sourceFingerprints, seams.source.diagnosticFiles);
    assert.equal(priorProof.sourceSnapshots.length, 47);
    same(priorProof.sourceSnapshots.map(pair => pair.original), checkpoint.sourceFingerprints);
    for (const pair of priorProof.sourceSnapshots) {
      assert.equal(pair.original.sha256, pair.snapshot.sha256); await checkedBytes(root, pair.snapshot);
    }
    const mutableInherited = new Set([
      "src/features/building-family/materials/providers/proceduralMaterialProvider.ts",
      "src/features/building-family/materials/atlasPlanner.ts", "src/features/building-family/materials/atlasPacker.ts",
      "src/features/building-family/tests/r1MasonryCoverage.test.ts", "scripts/capture-r1-baseline.mjs",
      "scripts/diagnostics/r1-baseline-browser.mjs", "scripts/diagnostics/r1-material-sampling.mjs"
    ]);
    for (const row of checkpoint.sourceFingerprints) if (!mutableInherited.has(row.file)) await checkedBytes(root, row);
    assert.equal(priorProof.copiedArtifacts.length, 21);
    for (const pair of priorProof.copiedArtifacts) { await checkedBytes(root, pair.original); await checkedBytes(root, pair.durable); }
    await checkedBytes(root, priorProof.trackedPatch); await checkedBytes(root, checkpoint.trackedPatch);
    const sourcePaths = [...new Set([...checkpoint.sourceFingerprints.map(row => row.file),
      "src/features/building-family/materials/providers/proceduralMaterialProvider.ts",
      "src/features/building-family/materials/atlasPlanner.ts", "src/features/building-family/materials/atlasPacker.ts",
      "src/features/building-family/materials/periodicMasonryRaster.ts",
      "src/features/building-family/tests/periodicMasonryRaster.test.ts",
      "src/features/building-family/tests/periodicMasonryIntegration.test.ts",
      "src/features/building-family/qa/r1PeriodicSampling.ts",
      "src/features/building-family/tests/r1PeriodicSampling.test.ts",
      "scripts/diagnostics/r1-primary-wall-periodic-proof.mjs",
      "scripts/diagnostics/r1-periodic-masonry-oracle.mjs",
      "scripts/capture-r1-periodic-wall-material.mjs"] )];
    const currentSource = await Promise.all(sourcePaths.map(file => record(root, file)));
    const gitOptions = { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 };
    const head = () => execFileSync("git", ["rev-parse", "HEAD"], { ...gitOptions, encoding: "utf8" }).trim();
    const patch = () => digest(execFileSync("git", ["diff", "HEAD", "--binary"], gitOptions));
    const currentHead = head(), currentPatch = patch();
    assert.equal(currentHead, checkpoint.sourceCommit);
    const beforeSources = checkpoint.sources.map(({ request: _request, layers, ...metadata }) => {
      void _request;
      return { ...metadata, layers: Object.fromEntries(Object.entries(layers).filter(([, layer]) => layer).map(([name, layer]) => [name, decode(layer)])) };
    });
    const beforeAtlas = { ...checkpoint.packedAtlas.metadata,
      channels: Object.fromEntries(Object.entries(checkpoint.packedAtlas.channels).map(([name, layer]) => [name, decode(layer)])) };
    const oldRequests = checkpoint.sources.map(source => structuredClone(source.request));
    const actualRequests = new Map(), actualSources = new Map(), provider = new providerModule.ProceduralMaterialProvider();
    let generated = 0;
    fixture = await fixtureModule.createAssemblyHallFixture({ promptControls: card.controls, materialProvider: { id: provider.id,
      async generate(request, signal) {
        assert(!actualRequests.has(request.sourceId), "Duplicate current source request.");
        actualRequests.set(request.sourceId, structuredClone(request));
        const source = await provider.generate(request, signal); assert(!actualSources.has(source.sourceId), "Duplicate current source artifact.");
        actualSources.set(source.sourceId, source); generated += 1; return source;
      } } });
    assert.equal(generated, 12); assert.equal(actualRequests.size, 12); assert.equal(actualSources.size, 12);
    same(fixture.spec, card.resolvedSpec); same(fixture.packedAtlas.manifest, card.materialAnchors.atlasManifest);
    same({ familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId,
      sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId, atlasId: fixture.packedAtlas.atlasId }, material.immutable.identity);
    fixture.buildingRuntime.root.updateWorldMatrix(true, true);
    const geometryBytes = geometry => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0);
    const actualGeometry = { sourceGraphHash: fixture.ir.sourceGraphHash, geometryHash: await diagnostic.fingerprintBuildingGeometry(fixture),
      irTriangles: fixture.ir.metrics.triangleCount, renderedTriangles: fixture.buildingRuntime.metrics.renderedTriangleCount,
      geometryBytes: [...new Set(fixture.buildingRuntime.renderables.map(object => object.geometry))].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
      instanceCount: fixture.ir.metrics.instanceCount };
    assert.equal(actualGeometry.geometryHash, checkpoint.geometryHash);
    same(actualGeometry, { sourceGraphHash: card.identity.sourceGraphHash, geometryHash: material.immutable.geometryHash, ...material.immutable.cost });
    const after = { requests: oldRequests.map(row => actualRequests.get(row.sourceId)), sources: oldRequests.map(row => actualSources.get(row.sourceId)),
      packedAtlas: fixture.packedAtlas, geometryCheckpoint: checkpointFor(fixture.packedAtlas, actualGeometry, accepted.s6Card) };
    const oldPlan = { ...await planner.planAtlas(card.resolvedSpec, { widthPx: 128, heightPx: 128, paddingPx: 4 }),
      materialSources: oldRequests.map(({ widthPx: _width, heightPx: _height, ...rest }) => { void _width; void _height; return rest; }) };
    same(oldPlan.manifest, checkpoint.packedAtlas.metadata.manifest);
    const legacySources = await Promise.all(oldRequests.map(request => new providerModule.ProceduralMaterialProvider().generate(structuredClone(request), new AbortController().signal)));
    const legacyAtlas = await packer.packAtlas(oldPlan, legacySources);
    const before = { requests: oldRequests, sources: beforeSources, packedAtlas: beforeAtlas,
      geometryCheckpoint: checkpointFor(beforeAtlas, actualGeometry, accepted.s6Card) };
    const legacyReplay = { requests: structuredClone(oldRequests), sources: legacySources, packedAtlas: legacyAtlas,
      geometryCheckpoint: checkpointFor(legacyAtlas, actualGeometry, accepted.s6Card) };
    let beforeExport;
    for (const frame of [before, after, legacyReplay]) {
      const exported = await debug.createAtlasDebugExport(frame.packedAtlas);
      if (frame === before) beforeExport = exported;
      if (frame === legacyReplay) same(exported, beforeExport, "Every no-profile encoded export field must replay exactly.");
      for (const channel of exported.channels) {
        const decoded = decoder.decodeCompletedFamilyExportChannel(channel), retained = frame.packedAtlas.channels[channel.name];
        assert.equal(decoded.widthPx, retained.widthPx); assert.equal(decoded.heightPx, retained.heightPx);
        assert.deepEqual(raw(decoded.data), raw(retained.data), "Encoded channel must reproduce actual packed RGBA bytes.");
      }
      if (frame !== after) {
        same(exported.channels.map(({ name, channelHash }) => ({ name, channelHash })),
          fixture.debugExport.channels.map(({ name }) => ({ name, channelHash: material.after.channelHashes[name] })), "No-profile encoded-channel replay changed.");
      }
    }
    const descriptor = after.sources.find(source => source.sourceId === "source.wall.primary").rasterDescriptor;
    assert(descriptor, "Current selected source must carry its content-bound periodic descriptor.");
    const oracle = createIndependentPeriodicMasonryOracle(descriptor.seedRoot, seedModule.createSeedTree);
    const report = await qa.buildR1PeriodicSamplingDelta({ packetId, createdAt, baseline, s6Card: card, s6Sampling: sampling,
      s6Material: material, beforeCheckpoint: checkpoint, before, after, legacyReplay, oracle });
    assert.equal(head(), currentHead); assert.equal(patch(), currentPatch);
    for (const row of currentSource) await checkedBytes(root, row);
    for (const row of Object.values(baseline)) await checkedBytes(root, row);
    return JSON.parse(canonical.canonicalJson(report));
  } finally { fixture?.familyRuntime.dispose(); await server.close(); }
}

/** A new allowance is accepted only after recomputing the exact actual source/atlas/legacy replay delta. */
export async function loadVerifiedR1PeriodicWallMaterialDelta({ root = process.cwd(), deltaPath, replayPath }) {
  assert.equal(inside(root, replayPath), inside(root, accepted.s6Card.file), "Periodic replay must use the actual accepted S6 card.");
  const input = JSON.parse(await readFile(inside(root, deltaPath), "utf8"));
  const computed = await prepareR1PeriodicWallMaterialDelta({ root, packetId: input.packetId, createdAt: input.createdAt,
    beforeCheckpointPath: input.baseline?.beforeCheckpoint?.file });
  assert.deepEqual(input, computed, "Periodic material allowance differs from freshly reconstructed actual bytes.");
  return computed;
}
