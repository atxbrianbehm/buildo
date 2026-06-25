import { createCompletedFamilyExportBundle, parseCompletedFamilyExportBundle } from "../state/completedFamilyExportBundle";
import { verifyCompletedFamilyExportBundle } from "../state/completedFamilyExportVerifier";
import { createCompletedFamilyPersistencePacket } from "../state/completedFamilyPersistence";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

describe("completed family export bundle", () => {
  it("creates a portable JSON bundle for reproducing the completed procedural building and atlas", async () => {
    const fixture = await createAssemblyHallFixture();
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-export",
      runId: "run-export",
      requestHash: "request-export",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    const bundle = createCompletedFamilyExportBundle(packet);
    const roundTripped = parseCompletedFamilyExportBundle(JSON.parse(JSON.stringify(bundle)));
    const jsonNormalizedPacket = JSON.parse(JSON.stringify(packet));

    expect(roundTripped).toMatchObject({
      schemaVersion: "0.1.0",
      bundleType: "completed-family-export",
      documentId: "family-document-export",
      runId: "run-export",
      requestHash: "request-export",
      contentHash: packet.contentHash,
      stylePackReference: packet.stylePackReference,
      spec: jsonNormalizedPacket.artifacts.spec,
      componentCatalog: jsonNormalizedPacket.artifacts.componentCatalog,
      graph: jsonNormalizedPacket.artifacts.graph
    });
    expect(roundTripped.atlas).toMatchObject({
      manifest: jsonNormalizedPacket.artifacts.atlasManifest,
      contentHash: packet.artifacts.atlasContentHash,
      slotProvenance: jsonNormalizedPacket.artifacts.atlasSlotProvenance
    });
    expect(roundTripped.atlas.channels.map((channel) => channel.name)).toEqual([
      "baseColor",
      "normal",
      "orm",
      "height",
      "opacity"
    ]);
    expect(roundTripped.atlas.channels.every((channel) => channel.pngDataUrl.startsWith("data:image/png;base64,"))).toBe(
      true
    );
    expect(roundTripped.provenance).toEqual(jsonNormalizedPacket.provenance);
    expect(JSON.stringify(roundTripped)).not.toContain("familyRuntime");
    expect(JSON.stringify(roundTripped)).not.toContain("buildingRuntime");

    fixture.familyRuntime.dispose();
  });

  it("verifies that a JSON export can reproduce the atlas bytes and compiled building metrics", async () => {
    const fixture = await createAssemblyHallFixture();
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-export",
      runId: "run-export",
      requestHash: "request-export",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    const bundle = JSON.parse(JSON.stringify(createCompletedFamilyExportBundle(packet)));
    const report = await verifyCompletedFamilyExportBundle(bundle);

    expect(report).toMatchObject({
      schemaVersion: "0.1.0",
      verificationType: "completed-family-export-reproduction",
      status: "verified",
      documentId: "family-document-export",
      runId: "run-export",
      reproduced: {
        familyId: fixture.spec.familyId,
        buildingId: fixture.ir.buildingId,
        atlasId: fixture.packedAtlas.atlasId,
        atlasContentHash: fixture.packedAtlas.contentHash,
        componentCatalogId: fixture.catalog.catalogId,
        graphId: fixture.graph.graphId,
        sourceGraphHash: fixture.ir.sourceGraphHash,
        channelCount: 5,
        triangleCount: fixture.ir.metrics.triangleCount,
        instanceCount: fixture.ir.metrics.instanceCount,
        semanticPathCount: fixture.ir.semanticIndex.length
      }
    });
    expect(report.checks.every((check) => check.status === "passed")).toBe(true);
    expect(report.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "atlas.channelSet",
        "atlas.channelHash.baseColor",
        "atlas.contentHash",
        "building.sourceGraphHash",
        "building.metrics"
      ])
    );

    fixture.familyRuntime.dispose();
  });
});
