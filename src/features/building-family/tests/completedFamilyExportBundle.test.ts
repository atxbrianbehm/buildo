import { createCompletedFamilyExportBundle, parseCompletedFamilyExportBundle } from "../state/completedFamilyExportBundle";
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
});
