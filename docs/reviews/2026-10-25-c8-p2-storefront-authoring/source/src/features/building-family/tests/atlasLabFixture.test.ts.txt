import { createAtlasLabFixture } from "../materials/atlasLabFixture";

describe("createAtlasLabFixture", () => {
  it("generates a visible Atlas Lab fixture from the real material pipeline", async () => {
    const fixture = await createAtlasLabFixture();

    expect(fixture.schemaVersion).toBe("0.1.0");
    expect(fixture.prompt).toBe("four floors, 7 bays, brick, flat roof, ornate trim");
    expect(fixture.packedAtlas.diagnostics).toEqual([]);
    expect(fixture.debugExport.channels.map((channel) => channel.name)).toEqual([
      "baseColor",
      "normal",
      "orm",
      "height",
      "opacity"
    ]);
    expect(fixture.debugExport.slotOverlays).toHaveLength(12);
    expect(fixture.debugExport.channels[0].pngDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fixture.cacheEntries.map((entry) => entry.artifactType)).toEqual([
      "materialSources",
      "packedAtlas",
      "atlasDebugExport"
    ]);
    expect(fixture.cacheEntries.every((entry) => entry.schemaVersion === "0.1.0")).toBe(true);
  });

  it("is deterministic across repeated fixture runs", async () => {
    const first = await createAtlasLabFixture();
    const second = await createAtlasLabFixture();

    expect(first.packedAtlas.manifest).toEqual(second.packedAtlas.manifest);
    expect(first.packedAtlas.contentHash).toBe(second.packedAtlas.contentHash);
    expect(first.debugExport.exportHash).toBe(second.debugExport.exportHash);
    expect(first.cacheEntries.map((entry) => entry.contentHash)).toEqual(
      second.cacheEntries.map((entry) => entry.contentHash)
    );
  });
});
