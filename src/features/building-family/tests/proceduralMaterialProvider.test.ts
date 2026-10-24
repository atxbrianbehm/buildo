import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import {
  brickCellSizePx,
  brickMortarCoveragePx,
  PRIMARY_WALL_MORTAR_COVERAGE_PROFILE,
  ProceduralMaterialProvider,
  usesPrimaryWallMortarCoverage
} from "../materials/providers/proceduralMaterialProvider";
import type { MaterialSourceArtifact, MaterialSourceRequest, PixelLayer } from "../materials/providers/proceduralMaterialProvider";

function brickRequest(partial: Partial<MaterialSourceRequest> = {}): MaterialSourceRequest {
  return {
    sourceId: "source.wall.primary",
    role: "wall",
    selectedFamily: "brick-red",
    periodicity: "xy",
    physicalSizeM: { width: 0.96, height: 0.96 },
    seedPath: "atlas/source/wall.primary/brick-red",
    promptVocabulary: ["brick-red", "primary wall material"],
    metersPerTile: 0.96,
    artKitMaterialRoleId: "brick",
    proceduralSource: "running-bond-brick",
    widthPx: 64,
    heightPx: 64,
    ...partial
  };
}

function canonicalBrickRequest(): MaterialSourceRequest {
  return brickRequest({
    widthPx: 32,
    heightPx: 32,
    promptVocabulary: ["brick-red", "primary wall material", "running-bond-brick"]
  });
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const offset = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(offset, offset + 4));
}

function rawLayerHash(layer: PixelLayer): Promise<string> {
  return sha256Hex(new Uint8Array(layer.data.buffer, layer.data.byteOffset, layer.data.byteLength));
}

describe("ProceduralMaterialProvider art-kit scale", () => {
  it("keeps brick cell proportions stable across texture resolutions for the same metersPerTile", () => {
    const small = brickCellSizePx(brickRequest({ widthPx: 64, heightPx: 64 }));
    const large = brickCellSizePx(brickRequest({ widthPx: 128, heightPx: 128 }));

    expect(small.brickHeight).toBeGreaterThan(0);
    expect(small.coursesPerTile).toBeCloseTo(0.96 / 0.075, 5);
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

describe("primary authored-wall mortar area coverage", () => {
  it("retains the legacy quantized grid and nominal physical anchor", () => {
    expect(brickCellSizePx(canonicalBrickRequest())).toEqual({
      brickWidth: 6,
      brickHeight: 3,
      mortar: 1,
      coursesPerTile: 12.8
    });
  });

  it.each([
    [0, 0, 0.6636],
    [1, 0, 0.42],
    [0, 1, 0.42],
    [1, 1, 0],
    [3, 3, 0.6636],
    [3, 4, 0.42],
    [0, 4, 0]
  ])("integrates the default pixel (%i,%i), without counting the joint intersection twice", (x, y, expected) => {
    expect(brickMortarCoveragePx(x, y, 6, 3)).toBeCloseTo(expected, 12);
  });

  it("splits an odd-width half-cell joint over both neighboring pixels and the wrap", () => {
    // An 11 × 5 cell has a 0.7-pixel joint. Its odd-row shift is 5.5 pixels.
    expect(brickMortarCoveragePx(5, 6, 11, 5)).toBeCloseTo(0.5, 12);
    expect(brickMortarCoveragePx(6, 6, 11, 5)).toBeCloseTo(0.2, 12);
    expect(brickMortarCoveragePx(4, 6, 11, 5)).toBe(0);
    expect(brickMortarCoveragePx(7, 6, 11, 5)).toBe(0);
    expect(brickMortarCoveragePx(5, 5, 11, 5)).toBeCloseTo(0.85, 12);
    expect(brickMortarCoveragePx(6, 5, 11, 5)).toBeCloseTo(0.76, 12);
  });

  it("retains whole and partial pixels when the authored joint is wider than one pixel", () => {
    // A 10-pixel course has a 1.4-pixel joint; the remaining 0.4 must survive.
    expect(brickMortarCoveragePx(2, 0, 21, 10)).toBe(1);
    expect(brickMortarCoveragePx(2, 1, 21, 10)).toBeCloseTo(0.4, 12);
    expect(brickMortarCoveragePx(0, 2, 21, 10)).toBe(1);
    expect(brickMortarCoveragePx(1, 2, 21, 10)).toBeCloseTo(0.4, 12);
    expect(brickMortarCoveragePx(1, 1, 21, 10)).toBeCloseTo(0.64, 12);
    expect(brickMortarCoveragePx(2, 2, 21, 10)).toBe(0);
  });

  it("preserves the two-row periodic area and negative integer phases", () => {
    let defaultArea = 0;
    let oddArea = 0;
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const coverage = brickMortarCoveragePx(x, y, 6, 3);
        defaultArea += coverage;
        expect(brickMortarCoveragePx(x - 6, y - 6, 6, 3)).toBeCloseTo(coverage, 12);
      }
    }
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 11; x += 1) {
        const coverage = brickMortarCoveragePx(x, y, 11, 5);
        oddArea += coverage;
        expect(brickMortarCoveragePx(x - 11, y - 10, 11, 5)).toBeCloseTo(coverage, 12);
      }
    }
    // Closed-form stripe-union areas: 14% bed plus the vertical fraction,
    // minus their intersection. These totals include both shifted rows.
    expect(defaultArea).toBeCloseTo(7.2072, 12);
    expect(oddArea).toBeCloseTo(21.42, 12);
  });

  it("keeps the duplicated endpoint convention in the 32-pixel coverage model", () => {
    let area = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        area += brickMortarCoveragePx(x % 31, y % 31, 6, 3);
      }
    }
    // Finite 32 × 32 area includes the legacy duplicated last row and column.
    expect(area).toBeCloseTo(229.7064, 9);
    expect(area / 1024).toBeCloseTo(0.22432265625, 12);
  });

  it.each([
    { role: "horizontalTrim" as const },
    { artKitMaterialRoleId: "plaster" },
    { artKitMaterialRoleId: undefined },
    { proceduralSource: "painted-stucco" },
    { proceduralSource: undefined },
    { artKitMaterialRoleId: "Brick" },
    { proceduralSource: "RUNNING-BOND-BRICK" }
  ])("requires the complete authoritative wall metadata (%j)", (partial) => {
    expect(usesPrimaryWallMortarCoverage(brickRequest(partial))).toBe(false);
  });

  it("uses authored metadata rather than a material name or source-id substring", () => {
    expect(usesPrimaryWallMortarCoverage(brickRequest({
      sourceId: "authored/renamed-wall",
      selectedFamily: "custom-masonry"
    }))).toBe(true);
  });
});

describe("selected mortar source identity and retained noise", () => {
  let artifact: MaterialSourceArtifact;
  beforeAll(async () => {
    artifact = await new ProceduralMaterialProvider().generate(canonicalBrickRequest(), new AbortController().signal);
  });

  it("versions the selected request independently of its legacy stochastic hash", async () => {
    const request = canonicalBrickRequest();
    expect(await hashCanonicalJson({ providerId: "procedural", request })).toBe(
      "de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31"
    );
    expect(PRIMARY_WALL_MORTAR_COVERAGE_PROFILE).toBe("primary-authored-wall-mortar-area-v1");
    expect(artifact.requestHash).toBe(await hashCanonicalJson({
      providerId: "procedural", request, coverageProfile: "primary-authored-wall-mortar-area-v1"
    }));
    expect(artifact.requestHash).toBe("fe3c0040dee939d9713031bbaa6e8edbb84cbb7ccbd29f97c0b136f732a5c57a");
    expect(artifact.provenance).toEqual({
      providerId: "procedural",
      seedPath: request.seedPath,
      promptVocabulary: request.promptVocabulary,
      algorithm: "procedural-v0.1-typed-rgba/primary-authored-wall-mortar-area-v1"
    });
  });

  it("preserves the literal pre-repair roughness bytes and opaque alpha", async () => {
    expect(artifact.layers.roughness).toBeDefined();
    expect(await rawLayerHash(artifact.layers.roughness!)).toBe(
      "5c456366ae573db99c42c67074f8ebc9404a0ea702a8ca7ca16de37b8f2ceb4b"
    );
    for (const layer of Object.values(artifact.layers)) {
      for (let offset = 3; offset < layer.data.length; offset += 4) expect(layer.data[offset]).toBe(255);
    }
  });

  it("preserves literal brick-interior colors and height noise from the pre-repair source", () => {
    expect(pixel(artifact.layers.baseColor, 1, 1)).toEqual([136, 46, 33, 255]);
    expect(pixel(artifact.layers.height!, 1, 1)).toEqual([172, 172, 172, 255]);
    expect(pixel(artifact.layers.baseColor, 2, 4)).toEqual([135, 46, 33, 255]);
    expect(pixel(artifact.layers.height!, 2, 4)).toEqual([157, 157, 157, 255]);
  });

  it("uses linear-sRGB area color and the same coverage in byte-height blending", () => {
    // Frozen legacy endpoints at (1,0): brick=[136,46,33], mortar=[180,167,149],
    // brick height=172 and mortar height=82. A 0.42 joint yields this encoded
    // linear-sRGB color; averaging encoded bytes instead would give [154,97,82].
    expect(pixel(artifact.layers.baseColor, 1, 0)).toEqual([156, 117, 103, 255]);
    expect(pixel(artifact.layers.height!, 1, 0)).toEqual([134, 134, 134, 255]);
    // Frozen (0,0) endpoints are [125,43,31]/[169,156,138] and 176/82.
    // The 0.6636 intersection union must be shared by both channels.
    expect(pixel(artifact.layers.baseColor, 0, 0)).toEqual([156, 131, 116, 255]);
    expect(pixel(artifact.layers.height!, 0, 0)).toEqual([114, 114, 114, 255]);
    expect(pixel(artifact.layers.baseColor, 3, 4)).toEqual([163, 122, 108, 255]);
    expect(pixel(artifact.layers.height!, 3, 4)).toEqual([134, 134, 134, 255]);
  });

  it("retains duplicated pixel endpoints across every generated layer", () => {
    for (const layer of Object.values(artifact.layers)) {
      for (let y = 0; y < 32; y += 1) expect(pixel(layer, 31, y)).toEqual(pixel(layer, 0, y));
      for (let x = 0; x < 32; x += 1) expect(pixel(layer, x, 31)).toEqual(pixel(layer, x, 0));
    }
  });

  it("retains secondary wall legacy routing, hashes, provenance and raw layers", async () => {
    const request = brickRequest({
      sourceId: "source.wall.secondary",
      physicalSizeM: { width: 1.2, height: 1.2 },
      seedPath: "atlas/source/wall.secondary/brick-red",
      promptVocabulary: ["brick-red", "secondary wall material", "painted-stucco"],
      metersPerTile: 1.2,
      artKitMaterialRoleId: "plaster",
      proceduralSource: "painted-stucco",
      widthPx: 32,
      heightPx: 32
    });
    const secondary = await new ProceduralMaterialProvider().generate(request, new AbortController().signal);
    expect(secondary.requestHash).toBe("a7507d9fbd6e2f1d1f5ee2cac6f7c6b781b99506a69cb52313887fb344c7af75");
    expect(secondary.contentHash).toBe("986b45a1225f77e40a9cfb881e68bf7aeffeb0884ec1295e18367be417c372ae");
    expect(secondary.provenance).toEqual({
      providerId: "procedural", seedPath: request.seedPath, promptVocabulary: request.promptVocabulary,
      algorithm: "procedural-v0.1-typed-rgba"
    });
    expect(await rawLayerHash(secondary.layers.baseColor)).toBe("f97645454ca5d8775f0afa9a658fa97d2e5eebdac1ca032a9c34225e6319b09e");
    expect(await rawLayerHash(secondary.layers.height!)).toBe("16dbb42c2c1d5fb28b18d16ef02165a8bee887ea0fdf9f997719aea74899c977");
    expect(await rawLayerHash(secondary.layers.roughness!)).toBe("fd72c1053292a3a8bf071d38b811a5b90ced0848d89cfa0ea6fc059136c97247");
  });

  it("reproduces selected request/content identities and raw layers on repeat runs", async () => {
    const repeated = await new ProceduralMaterialProvider().generate(canonicalBrickRequest(), new AbortController().signal);
    expect(repeated.requestHash).toBe(artifact.requestHash);
    expect(repeated.contentHash).toBe(artifact.contentHash);
    expect(repeated.provenance).toEqual(artifact.provenance);
    expect(repeated.layers).toEqual(artifact.layers);
  });
});
