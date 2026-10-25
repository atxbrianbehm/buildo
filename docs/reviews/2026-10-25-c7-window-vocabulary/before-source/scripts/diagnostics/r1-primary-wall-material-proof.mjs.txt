import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { createServer } from "vite";

const producerFile = "src/features/building-family/materials/providers/proceduralMaterialProvider.ts";
const oldProducerHash = "51cc87c0f78f2d9cc77d0ffb734288fc248195955dde4f2547cd4dfb9361d620";
const acceptedS5Hash = "c1e522e2655c55a456cc5b5351e22073fe8fbce87c327a7447131bdcf6149d30";
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const fileRecord = z.object({ file: z.string().min(1), sha256 }).strict();
const producerCheckpointSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-primary-wall-producer-source-checkpoint"),
  createdAt: z.string().datetime(), baseline: fileRecord,
  source: z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), trackedDiffSha256: sha256 }).strict(),
  producer: z.object({ file: z.literal(producerFile), sha256, byteLength: z.number().int().positive(), snapshot: fileRecord }).strict(),
  scope: z.literal("Producer code freeze before S6 edits; S5 retains the validated prior material outputs. No S6 repair or changed material baseline is claimed.")
}).strict();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const rawBytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

function inside(root, file) {
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Material proof files must stay inside the repository.");
  return resolved;
}

async function record(root, file) {
  const resolved = inside(root, file);
  return { file: path.relative(root, resolved).split(path.sep).join("/"), sha256: digest(await readFile(resolved)) };
}

async function geometryCheckpoint(fixture, baseline, diagnostic) {
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const geometryBytes = geometry => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
  return {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline,
    sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash,
    geometryHash: await diagnostic.fingerprintBuildingGeometry(fixture),
    irTriangles: fixture.ir.metrics.triangleCount, renderedTriangles: fixture.buildingRuntime.metrics.renderedTriangleCount,
    geometryBytes: [...new Set(fixture.buildingRuntime.renderables.map(object => object.geometry))].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
    instanceCount: fixture.ir.metrics.instanceCount,
    atlasChannelDataHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, digest(rawBytes(layer.data))]))
  };
}

/** Reconstruct both actual material baselines; old source code never becomes a client or product override. */
export async function prepareR1PrimaryWallMaterialDelta({ root = process.cwd(), packetId, createdAt = new Date().toISOString(),
  producerCheckpointPath = "test-results/r1-s6-2026-10-14/before-source/producer-source-checkpoint.json" }) {
  assert(packetId, "A capture packet ID is required.");
  const checkpointBytes = await readFile(inside(root, producerCheckpointPath));
  const producerCheckpoint = producerCheckpointSchema.parse(JSON.parse(checkpointBytes.toString("utf8")));
  assert.equal(producerCheckpoint.producer.sha256, oldProducerHash);
  assert.equal(producerCheckpoint.producer.snapshot.sha256, oldProducerHash);
  assert.equal(producerCheckpoint.producer.byteLength, 13391);
  const snapshotBytes = await readFile(inside(root, producerCheckpoint.producer.snapshot.file));
  assert.equal(digest(snapshotBytes), oldProducerHash, "The old producer snapshot changed.");
  assert.equal(snapshotBytes.byteLength, producerCheckpoint.producer.byteLength);
  assert.equal(producerCheckpoint.baseline.file, "docs/reviews/2026-10-14-r1-s5-verified/masonry-appearance-report.json");
  assert.equal(producerCheckpoint.baseline.sha256, acceptedS5Hash);
  const s5Bytes = await readFile(inside(root, producerCheckpoint.baseline.file));
  assert.equal(digest(s5Bytes), acceptedS5Hash, "The accepted S5 report changed.");
  const s4CardPath = "docs/reviews/2026-10-14-r1-s4/acceptance-card.json";
  const s4SamplingPath = "docs/reviews/2026-10-14-r1-s4/sampling-report.json";
  const baseline = {
    s4Card: await record(root, s4CardPath), s4Sampling: await record(root, s4SamplingPath),
    s5Report: producerCheckpoint.baseline, producerCheckpoint: await record(root, producerCheckpointPath),
    producerSnapshot: producerCheckpoint.producer.snapshot
  };
  const virtualId = "virtual:buildo-r1-s6-legacy-producer";
  const resolvedId = inside(root, producerFile).replaceAll("\\", "/") + "?r1-s6-legacy=" + oldProducerHash;
  const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true }, plugins: [{
    name: "r1-s6-frozen-legacy-producer", enforce: "pre",
    resolveId(id) { if (id === virtualId) return resolvedId; },
    load(id) { if (id === resolvedId) return snapshotBytes.toString("utf8"); }
  }] });
  const fixtures = [];
  try {
    const [coverage, contracts, masonry, fixtureModule, diagnostic, oldProviderModule, currentProviderModule, decoder, canonical] = await Promise.all([
      server.ssrLoadModule("/src/features/building-family/qa/r1MasonryCoverage.ts"),
      server.ssrLoadModule("/src/features/building-family/qa/r1BaselineContracts.ts"),
      server.ssrLoadModule("/src/features/building-family/qa/r1MasonryAppearance.ts"),
      server.ssrLoadModule("/src/features/building-family/ui/assemblyHallFixture.ts"),
      server.ssrLoadModule("/scripts/diagnostics/r1-building-capture.mjs"),
      server.ssrLoadModule(virtualId),
      server.ssrLoadModule("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
      server.ssrLoadModule("/src/features/building-family/state/completedFamilyExportVerifier.ts"),
      server.ssrLoadModule("/src/features/building-family/core/canonicalJson.ts")
    ]);
    const s4Card = contracts.R1AcceptanceCardSchema.parse(JSON.parse(await readFile(inside(root, s4CardPath), "utf8")));
    const s4Sampling = contracts.R1SamplingReportSchema.parse(JSON.parse(await readFile(inside(root, s4SamplingPath), "utf8")));
    const s5Report = masonry.R1MasonryAppearanceReportSchema.parse(JSON.parse(s5Bytes.toString("utf8")));
    assert.equal(s4Card.packetId, "2026-10-14-r1-s4");
    assert.equal(s5Report.packetId, "2026-10-14-r1-s5-retry-02");
    assert.deepEqual(s5Report.baseline, baseline.s4Card);
    assert.deepEqual(s5Report.baselineSampling, baseline.s4Sampling);
    assert.equal(producerCheckpoint.source.commit, s5Report.source.commit);
    assert.equal(producerCheckpoint.source.trackedDiffSha256, s5Report.source.trackedDiffSha256);
    const proceduralCaptures = s4Sampling.captures.filter((row) => row.sourceName === "procedural");
    assert.equal(proceduralCaptures.length, 2);
    const sourceOrder = proceduralCaptures[0].snapshot.sourceHashes.map((row) => row.sourceId);
    assert.equal(new Set(sourceOrder).size, 12);
    for (const row of proceduralCaptures) assert.deepEqual(row.snapshot.sourceHashes.map((source) => source.sourceId), sourceOrder);
    async function rebuild(Provider) {
      const provider = new Provider();
      const requests = [];
      const sources = [];
      const fixture = await fixtureModule.createAssemblyHallFixture({ promptControls: s4Card.controls,
        materialProvider: { id: provider.id, async generate(request, signal) {
          requests.push(structuredClone(request));
          const source = await provider.generate(request, signal);
          sources.push(source);
          return source;
        } }
      });
      fixtures.push(fixture);
      const requestsById = new Map(requests.map((request) => [request.sourceId, request]));
      const sourcesById = new Map(sources.map((source) => [source.sourceId, source]));
      assert.equal(requestsById.size, 12, "Every fresh request must have a unique source ID.");
      assert.equal(sourcesById.size, 12, "Every fresh generated artifact must have a unique source ID.");
      const orderedRequests = sourceOrder.map((id) => { assert(requestsById.has(id), id); return requestsById.get(id); });
      const orderedSources = sourceOrder.map((id) => { assert(sourcesById.has(id), id); return sourcesById.get(id); });
      assert.equal(requests.length, 12);
      assert.equal(sources.length, 12);
      assert.equal(canonical.canonicalJson(fixture.spec), canonical.canonicalJson(s4Card.resolvedSpec), "Frozen resolved spec changed.");
      assert.equal(fixture.graph.graphId, s4Card.identity.graphId);
      assert.equal(fixture.ir.sourceGraphHash, s4Card.identity.sourceGraphHash);
      assert.equal(fixture.catalog.catalogId, s4Card.identity.catalogId);
      assert.equal(fixture.packedAtlas.atlasId, s4Card.identity.atlasId);
      assert.equal(canonical.canonicalJson(fixture.packedAtlas.manifest), canonical.canonicalJson(s4Card.materialAnchors.atlasManifest), "Frozen manifest changed.");
      for (const channel of fixture.debugExport.channels) {
        const decoded = decoder.decodeCompletedFamilyExportChannel(channel);
        assert.deepEqual(decoded, fixture.packedAtlas.channels[channel.name], "Encoded material channel must reproduce actual packed RGBA bytes.");
      }
      return { requests: orderedRequests, sources: orderedSources, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport,
        geometryCheckpoint: await geometryCheckpoint(fixture, baseline.s4Card, diagnostic) };
    }
    const before = await rebuild(oldProviderModule.ProceduralMaterialProvider);
    const after = await rebuild(currentProviderModule.ProceduralMaterialProvider);
    assert.notStrictEqual(before.packedAtlas, after.packedAtlas, "Before/after need separate freshly generated atlases.");
    for (let index = 0; index < 12; index += 1) {
      assert.notStrictEqual(before.sources[index], after.sources[index], "Before/after may not reuse source artifacts.");
      for (const name of Object.keys(before.sources[index].layers)) {
        if (before.sources[index].layers[name] && after.sources[index].layers[name]) {
          assert.notStrictEqual(before.sources[index].layers[name].data, after.sources[index].layers[name].data, "Before/after source buffers must be independent.");
        }
      }
    }
    const report = await coverage.buildR1MasonryCoverageDelta({ packetId, createdAt, baseline,
      s4Card, s4Sampling, s5Report, producerCheckpoint, before, after });
    return JSON.parse(canonical.canonicalJson(report));
  } finally {
    for (const fixture of fixtures) fixture.familyRuntime.dispose();
    await server.close();
  }
}

/** A capture allowance is accepted only after reproducing the complete material delta again. */
export async function loadVerifiedR1PrimaryWallMaterialDelta({ root = process.cwd(), deltaPath, replayPath }) {
  const input = JSON.parse(await readFile(inside(root, deltaPath), "utf8"));
  assert.equal(inside(root, replayPath), inside(root, "docs/reviews/2026-10-14-r1-s4/acceptance-card.json"));
  const computed = await prepareR1PrimaryWallMaterialDelta({ root, packetId: input.packetId, createdAt: input.createdAt,
    producerCheckpointPath: input.baseline?.producerCheckpoint?.file });
  assert.deepEqual(input, computed, "The explicit selected-material baseline does not match reconstructed actual source/atlas bytes.");
  return computed;
}
