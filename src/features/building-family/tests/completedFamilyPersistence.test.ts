import {
  createAssemblyHallFixture,
  restoreAssemblyHallFixtureFromCompletedFamilyPacket
} from "../ui/assemblyHallFixture";
import {
  COMPLETED_FAMILY_ARTIFACT_TYPE,
  CompletedFamilyPersistencePacketSchema,
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket,
  parseCompletedFamilyPersistencePacket
} from "../state/completedFamilyPersistence";

describe("completed family persistence", () => {
  let fixture: Awaited<ReturnType<typeof createAssemblyHallFixture>>;

  beforeAll(async () => {
    fixture = await createAssemblyHallFixture();
  });

  afterAll(() => {
    fixture.familyRuntime.dispose();
  });

  it("packs a completed fixture into a schema-versioned reload packet without live runtime objects", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-alpha",
      runId: "run-alpha",
      requestHash: "request-alpha",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    expect(packet).toMatchObject({
      schemaVersion: "0.1.0",
      documentId: "family-document-alpha",
      runId: "run-alpha",
      requestHash: "request-alpha",
      createdAt: "2026-06-24T00:00:00.000Z",
      familyId: fixture.spec.familyId,
      buildingId: fixture.ir.buildingId,
      stylePackReference: {
        schemaVersion: "0.1.0",
        stylePackId: fixture.spec.stylePackId,
        sourceIntentHash: fixture.spec.sourceIntentHash
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(packet.artifacts.spec).toEqual(fixture.spec);
    expect(packet.artifacts.atlasManifest).toEqual(fixture.packedAtlas.manifest);
    expect(packet.artifacts.atlasChannels.baseColor.data).toBeInstanceOf(Uint8ClampedArray);
    expect(packet.artifacts.atlasContentHash).toBe(fixture.packedAtlas.contentHash);
    expect(packet.artifacts.componentCatalog).toEqual(fixture.catalog);
    expect(packet.artifacts.graph).toEqual(fixture.graph);
    expect(packet.artifacts.runtimeIr).toEqual(fixture.ir);
    expect(packet.artifacts.componentGallery).toEqual(fixture.componentGallery);
    expect(packet.artifacts.debugExport).toEqual(fixture.debugExport);
    expect(packet.provenance.promptTrace).toEqual(fixture.promptTrace);
    expect(packet.provenance.variantStress).toEqual(fixture.variantStress);
    expect(packet.provenance.remoteMaterialApplication).toBeUndefined();
    expect(packet.provenance.provenanceEntryCount).toBe(fixture.provenanceEntryCount);
    expect("familyRuntime" in packet.artifacts).toBe(false);
    expect("buildingRuntime" in packet.artifacts).toBe(false);
    expect(CompletedFamilyPersistencePacketSchema.parse(packet)).toEqual(packet);
    const restored = parseCompletedFamilyPersistencePacket(structuredClone(packet));
    expect(restored.contentHash).toBe(packet.contentHash);
    expect(restored.artifacts.atlasChannels.baseColor.data.byteLength).toBe(
      packet.artifacts.atlasChannels.baseColor.data.byteLength
    );
    expect(restored.artifacts.runtimeIr.sourceGraphHash).toBe(packet.artifacts.runtimeIr.sourceGraphHash);
  });

  it("restores a completed-family packet into a live Assembly Hall fixture runtime", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-restore",
      runId: "run-restore",
      requestHash: "request-restore",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    expect(packet.prompt).toBe(fixture.prompt);

    const restored = await restoreAssemblyHallFixtureFromCompletedFamilyPacket(structuredClone(packet));
    const wallObject = restored.buildingRuntime.objectsByBatchId.get("mesh.wall-panels")!;

    expect(restored).not.toBe(fixture);
    expect(restored.prompt).toBe(fixture.prompt);
    expect(restored.spec).toEqual(packet.artifacts.spec);
    expect(restored.packedAtlas).toMatchObject({
      schemaVersion: "0.1.0",
      atlasId: packet.artifacts.atlasManifest.atlasId,
      manifest: packet.artifacts.atlasManifest,
      contentHash: packet.artifacts.atlasContentHash,
      slotProvenance: packet.artifacts.atlasSlotProvenance
    });
    expect(restored.familyRuntime.textureSet.contentHash).toBe(packet.artifacts.atlasContentHash);
    expect(restored.buildingRuntime.materialRegistry).toBe(restored.familyRuntime.materialRegistry);
    expect(wallObject.material.map).toBe(restored.familyRuntime.textureSet.textures.baseColor);
    expect(restored.componentGallery).toEqual(packet.artifacts.componentGallery);
    expect(restored.metrics).toMatchObject({
      activeBackend: "pending",
      atlasContentHash: packet.artifacts.atlasContentHash,
      componentCount: packet.artifacts.componentGallery.entries.length,
      drawCallCount: restored.buildingRuntime.renderables.length,
      instanceCount: packet.artifacts.runtimeIr.metrics.instanceCount,
      triangleCount: packet.artifacts.runtimeIr.metrics.triangleCount,
      textureCount: 5
    });
    expect(restored.provenanceEntryCount).toBe(packet.provenance.provenanceEntryCount);

    restored.familyRuntime.dispose();
  });

  it("adapts the packet to the artifact cache entry keyed by request hash", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-beta",
      runId: "run-beta",
      requestHash: "request-beta",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });
    const entry = completedFamilyPersistenceCacheEntry(packet, {
      createdAt: "2026-06-24T00:01:00.000Z"
    });

    expect(entry).toMatchObject({
      schemaVersion: "0.1.0",
      artifactType: COMPLETED_FAMILY_ARTIFACT_TYPE,
      requestHash: "request-beta",
      contentHash: packet.contentHash,
      createdAt: "2026-06-24T00:01:00.000Z",
      artifact: packet
    });
    expect(entry.dependencies).toEqual([
      fixture.spec.familyId,
      fixture.packedAtlas.atlasId,
      fixture.packedAtlas.contentHash,
      fixture.catalog.catalogId,
      fixture.graph.graphId,
      fixture.ir.sourceGraphHash,
      fixture.ir.buildingId
    ]);
    expect(structuredClone(entry).artifact.contentHash).toBe(packet.contentHash);
  });
});
