import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

describe("assembly hall fixture", () => {
  it("builds a rendered-building fixture from the real atlas, compiler, gallery, and family runtime pipeline", async () => {
    const fixture = await createAssemblyHallFixture();
    const wallObject = fixture.buildingRuntime.objectsByBatchId.get("mesh.wall-panels")!;
    const windowObject = fixture.buildingRuntime.objectsByBatchId.get("instances.window")!;

    expect(fixture.schemaVersion).toBe("0.1.0");
    expect(fixture.familyRuntime.textureSet.contentHash).toBe(fixture.packedAtlas.contentHash);
    expect(fixture.familyRuntime.textureSet.channelHashes).toEqual(
      Object.fromEntries(fixture.debugExport.channels.map((channel) => [channel.name, channel.channelHash]))
    );
    expect(fixture.buildingRuntime.materialRegistry).toBe(fixture.familyRuntime.materialRegistry);
    expect(wallObject.material.map).toBe(fixture.familyRuntime.textureSet.textures.baseColor);
    expect(windowObject.isInstancedMesh).toBe(true);
    expect(fixture.componentGallery.entries.length).toBeGreaterThan(0);
    expect(fixture.metrics).toMatchObject({
      atlasContentHash: fixture.packedAtlas.contentHash,
      componentCount: fixture.componentGallery.entries.length,
      drawCallCount: fixture.buildingRuntime.renderables.length,
      textureCount: 5
    });
    expect(fixture.backendSupport.webgpu.importPath).toBe("three/webgpu");
    expect(fixture.backendSupport.webgl.importPath).toBe("three");
  });
});
