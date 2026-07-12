import { brickCellSizePx, ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import type { MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";

function brickRequest(partial: Partial<MaterialSourceRequest> = {}): MaterialSourceRequest {
  return {
    sourceId: "source.wall.primary",
    role: "wall",
    selectedFamily: "brick-red",
    periodicity: "xy",
    physicalSizeM: { width: 1.2, height: 1.2 },
    seedPath: "atlas/source/wall.primary/brick-red",
    promptVocabulary: ["brick-red", "primary wall material"],
    metersPerTile: 1.2,
    artKitMaterialRoleId: "brick",
    proceduralSource: "running-bond-brick",
    widthPx: 64,
    heightPx: 64,
    ...partial
  };
}

describe("ProceduralMaterialProvider art-kit scale", () => {
  it("keeps brick cell proportions stable across texture resolutions for the same metersPerTile", () => {
    const small = brickCellSizePx(brickRequest({ widthPx: 64, heightPx: 64 }));
    const large = brickCellSizePx(brickRequest({ widthPx: 128, heightPx: 128 }));

    expect(small.brickHeight).toBeGreaterThan(0);
    expect(large.brickHeight / small.brickHeight).toBeCloseTo(2, 0);
    expect(large.brickWidth / small.brickWidth).toBeCloseTo(2, 0);
  });

  it("uses distinct procedural paths for brick, plaster, and roof", async () => {
    const provider = new ProceduralMaterialProvider();
    const signal = new AbortController().signal;
    const brick = await provider.generate(brickRequest(), signal);
    const plaster = await provider.generate(
      brickRequest({
        selectedFamily: "painted-stucco",
        artKitMaterialRoleId: "plaster",
        proceduralSource: "painted-stucco",
        metersPerTile: 1.5,
        physicalSizeM: { width: 1.5, height: 1.5 }
      }),
      signal
    );
    const roof = await provider.generate(
      brickRequest({
        sourceId: "source.roof.primary",
        role: "roof",
        selectedFamily: "flat-membrane",
        artKitMaterialRoleId: "roof",
        proceduralSource: "roof-membrane",
        metersPerTile: 2,
        physicalSizeM: { width: 2, height: 2 }
      }),
      signal
    );

    expect(brick.contentHash).not.toBe(plaster.contentHash);
    expect(brick.contentHash).not.toBe(roof.contentHash);
    expect(plaster.contentHash).not.toBe(roof.contentHash);
    expect(brick.layers.height).toBeDefined();
    expect(roof.layers.baseColor.data.length).toBe(64 * 64 * 4);
  });
});
