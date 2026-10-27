import type { AtlasMaterialSourcePlan } from "../atlasPlanner";
import { canonicalJson } from "../../core/canonicalJson";
import { hashCanonicalJson, sha256Hex } from "../../core/contentHash";
import { createSeedTree, type SeedTree } from "../../core/seedTree";
import {
  createPeriodicMasonryRasterDescriptor,
  PeriodicMasonryRasterDescriptorSchema,
  PrimaryWallSamplingProfileSchema,
  rasterizePeriodicMasonry,
  type PeriodicMasonryRasterDescriptor
} from "../periodicMasonryRaster";

export interface PixelLayer {
  widthPx: number;
  heightPx: number;
  channels: "rgba8";
  data: Uint8ClampedArray;
}

export interface MaterialSourceRequest extends AtlasMaterialSourcePlan {
  widthPx: number;
  heightPx: number;
}

export interface ArtifactProvenance {
  providerId: string;
  seedPath: string;
  promptVocabulary: string[];
  algorithm: string;
}

export interface MaterialSourceArtifact {
  sourceId: string;
  providerId: string;
  widthPx: number;
  heightPx: number;
  layers: {
    baseColor: PixelLayer;
    height?: PixelLayer;
    roughness?: PixelLayer;
    metalness?: PixelLayer;
    opacity?: PixelLayer;
  };
  requestHash: string;
  contentHash: string;
  provenance: ArtifactProvenance;
  rasterDescriptor?: PeriodicMasonryRasterDescriptor;
}

export interface MaterialGenerationProvider {
  readonly id: string;
  generate(request: MaterialSourceRequest, signal: AbortSignal): Promise<MaterialSourceArtifact>;
}

type Rgba = [number, number, number, number];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return [clampByte(r), clampByte(g), clampByte(b), clampByte(a)];
}

function makeLayer(
  widthPx: number,
  heightPx: number,
  periodicity: MaterialSourceRequest["periodicity"],
  sample: (x: number, y: number) => Rgba
): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);

  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const sampleX = periodicity === "x" || periodicity === "xy" ? x % Math.max(1, widthPx - 1) : x;
      const sampleY = periodicity === "xy" ? y % Math.max(1, heightPx - 1) : y;
      const [r, g, b, a] = sample(sampleX, sampleY);
      const index = (y * widthPx + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  return { widthPx, heightPx, channels: "rgba8", data };
}

function noise(seed: SeedTree, x: number, y: number, channel = "n"): number {
  return seed.float01(`${channel}/${x}/${y}`);
}

function mono(value: number, alpha = 255): Rgba {
  const byte = clampByte(value);
  return [byte, byte, byte, clampByte(alpha)];
}

function layerBytes(layers: MaterialSourceArtifact["layers"]): Uint8Array {
  const layerNames = Object.keys(layers).sort() as Array<keyof MaterialSourceArtifact["layers"]>;
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (const name of layerNames) {
    const layer = layers[name];
    if (!layer) {
      continue;
    }
    const header = new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`);
    const bytes = new Uint8Array(layer.data.buffer.slice(layer.data.byteOffset, layer.data.byteOffset + layer.data.byteLength));
    chunks.push(header, bytes);
    total += header.byteLength + bytes.byteLength;
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/** The optional raster descriptor is part of selected source content identity. */
export async function hashMaterialSourceContent(
  artifact: Pick<MaterialSourceArtifact, "providerId" | "requestHash" | "layers" | "rasterDescriptor">
): Promise<string> {
  const rasterDescriptor = artifact.rasterDescriptor === undefined
    ? undefined
    : PeriodicMasonryRasterDescriptorSchema.parse(artifact.rasterDescriptor);
  return sha256Hex(new TextEncoder().encode(canonicalJson({
    providerId: artifact.providerId,
    requestHash: artifact.requestHash,
    layerBytes: Array.from(layerBytes(artifact.layers)),
    ...(rasterDescriptor ? { rasterDescriptor } : {})
  })));
}

/** Reproduce request identity without allowing a profile to reroll legacy grain. */
export async function getProceduralMaterialRequestIdentity(request: MaterialSourceRequest): Promise<{
  stochasticHash: string;
  requestHash: string;
  algorithm: string;
  rasterDescriptor?: PeriodicMasonryRasterDescriptor;
}> {
  const { samplingProfile, ...legacyRequest } = request;
  const stochasticHash = await hashCanonicalJson({ providerId: "procedural", request: legacyRequest });
  if (samplingProfile !== undefined) {
    const profile = PrimaryWallSamplingProfileSchema.parse(samplingProfile);
    if (request.sourceId !== "source.wall.primary" || !usesPrimaryWallMortarCoverage(request) ||
      request.periodicity !== "xy" || request.metersPerTile !== profile.tileSizeM ||
      request.physicalSizeM.width !== profile.tileSizeM || request.physicalSizeM.height !== profile.tileSizeM) {
      throw new Error("Periodic masonry sampling requires the authoritative primary wall and unchanged physical tile.");
    }
    if (![request.widthPx, request.heightPx].every((value) => Number.isInteger(value) && value > 0 && value <= 4096)) {
      throw new Error("Periodic masonry source dimensions must be integers between 1 and 4096.");
    }
    return {
      stochasticHash,
      requestHash: await hashCanonicalJson({
        providerId: "procedural", request: { ...legacyRequest, samplingProfile: profile }, coverageProfile: profile.model
      }),
      algorithm: `procedural-v0.1-typed-rgba/${profile.model}`,
      rasterDescriptor: createPeriodicMasonryRasterDescriptor({ seedPath: request.seedPath, legacyStochasticHash: stochasticHash })
    };
  }
  const areaCoverage = usesPrimaryWallMortarCoverage(request);
  return {
    stochasticHash,
    requestHash: areaCoverage ? await hashCanonicalJson({
      providerId: "procedural", request, coverageProfile: PRIMARY_WALL_MORTAR_COVERAGE_PROFILE
    }) : stochasticHash,
    algorithm: areaCoverage ? `procedural-v0.1-typed-rgba/${PRIMARY_WALL_MORTAR_COVERAGE_PROFILE}` : "procedural-v0.1-typed-rgba"
  };
}

/** Standard late-19c brick course height (meters), including mortar bed. */
export const BRICK_COURSE_HEIGHT_M = 0.075;

/** Artifact identity for the bounded primary authored-wall mortar repair. */
export const PRIMARY_WALL_MORTAR_COVERAGE_PROFILE = "primary-authored-wall-mortar-area-v1";

export function usesPrimaryWallMortarCoverage(request: MaterialSourceRequest): boolean {
  return request.role === "wall" &&
    request.artKitMaterialRoleId === "brick" &&
    request.proceduralSource === "running-bond-brick";
}

/**
 * Derive brick cell size from metersPerTile so coursing density stays stable.
 * V5: ~0.96 m tile → ~12.8 courses; stretched by physical UV scale on the facade.
 */
export function brickCellSizePx(request: MaterialSourceRequest): {
  brickWidth: number;
  brickHeight: number;
  mortar: number;
  coursesPerTile: number;
} {
  const metersPerTile =
    request.metersPerTile ??
    Math.max(request.physicalSizeM.width, request.physicalSizeM.height);
  const coursesPerTile = Math.max(4, metersPerTile / BRICK_COURSE_HEIGHT_M);
  const brickHeight = Math.max(2, Math.round(request.heightPx / coursesPerTile));
  const brickWidth = Math.max(4, Math.round(brickHeight * 2.1));
  const mortar = Math.max(1, Math.round(brickHeight * 0.14));
  return { brickWidth, brickHeight, mortar, coursesPerTile };
}

/**
 * Exact mortar area in the integer pixel box [x,x+1] × [y,y+1]. Cell dimensions
 * remain the legacy integers. Odd rows retain the half-cell horizontal shift,
 * including half-pixel shifts for odd widths. The joint occupies 14% of a course.
 */
export function brickMortarCoveragePx(x: number, y: number, brickWidth: number, brickHeight: number): number {
  const jointWidth = brickHeight * 0.14;
  const row = Math.floor(y / brickHeight);
  const localY = y - row * brickHeight;
  const offsetX = row % 2 === 0 ? 0 : brickWidth / 2;
  const localX = ((x + offsetX) % brickWidth + brickWidth) % brickWidth;
  const horizontal = Math.max(0, Math.min(1, jointWidth - localY));
  const vertical = Math.max(0, Math.min(1, jointWidth - localX)) +
    Math.max(0, Math.min(jointWidth, localX + 1 - brickWidth));
  return horizontal + vertical - horizontal * vertical;
}

function srgbByteToLinear(byte: number): number {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(value: number): number {
  return clampByte(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
}

function blendBrickMortarColor(brick: Rgba, mortar: Rgba, coverage: number): Rgba {
  if (coverage === 0) return brick;
  if (coverage === 1) return mortar;
  // Clamp/round the legacy endpoint bytes first; average their linear-sRGB areas,
  // then encode and round once. Alpha is coverage-independent for these sources.
  return [
    linearToSrgbByte(srgbByteToLinear(brick[0]) * (1 - coverage) + srgbByteToLinear(mortar[0]) * coverage),
    linearToSrgbByte(srgbByteToLinear(brick[1]) * (1 - coverage) + srgbByteToLinear(mortar[1]) * coverage),
    linearToSrgbByte(srgbByteToLinear(brick[2]) * (1 - coverage) + srgbByteToLinear(mortar[2]) * coverage),
    brick[3]
  ];
}

function brickLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const { brickHeight, brickWidth, mortar } = brickCellSizePx(request);
  const areaCoverage = usesPrimaryWallMortarCoverage(request);
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const row = Math.floor(y / brickHeight);
    const offsetX = row % 2 === 0 ? x : x + brickWidth / 2;
    const inMortar = y % brickHeight < mortar || offsetX % brickWidth < mortar;
    const grain = noise(seed, x, y, "brick-grain") * 22 - 8;
    if (areaCoverage) {
      return blendBrickMortarColor(
        rgba(132 + grain, 45 + grain * 0.3, 32 + grain * 0.2),
        rgba(176 + grain, 163 + grain, 145 + grain),
        brickMortarCoveragePx(x, y, brickWidth, brickHeight)
      );
    }
    return inMortar ? rgba(176 + grain, 163 + grain, 145 + grain) : rgba(132 + grain, 45 + grain * 0.3, 32 + grain * 0.2);
  });
  const height = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const row = Math.floor(y / brickHeight);
    const offsetX = row % 2 === 0 ? x : x + brickWidth / 2;
    const inMortar = y % brickHeight < mortar || offsetX % brickWidth < mortar;
    if (areaCoverage) {
      const coverage = brickMortarCoveragePx(x, y, brickWidth, brickHeight);
      const brickHeightByte = clampByte(154 + noise(seed, x, y, "brick-height") * 28);
      return mono(brickHeightByte * (1 - coverage) + 82 * coverage);
    }
    return mono(inMortar ? 82 : 154 + noise(seed, x, y, "brick-height") * 28);
  });
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(188 + noise(seed, x, y, "brick-roughness") * 44)
  );
  return { baseColor, height, roughness };
}

function stuccoLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const crack = x % 19 === 0 && y > 4 && y < request.heightPx - 4;
    const n = noise(seed, x, y, "stucco");
    return crack ? rgba(82, 78, 70) : rgba(178 + n * 34, 170 + n * 30, 148 + n * 22);
  });
  const height = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const crack = x % 19 === 0 && y > 4 && y < request.heightPx - 4;
    return mono(crack ? 58 : 126 + noise(seed, x, y, "stucco-height") * 52);
  });
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(198 + noise(seed, x, y, "stucco-roughness") * 38)
  );
  return { baseColor, height, roughness };
}

function paintedMetalLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const edgeWear = x < 2 || y < 2 || x > request.widthPx - 4 || y > request.heightPx - 4;
    const n = noise(seed, x, y, "metal");
    return edgeWear ? rgba(136 + n * 32, 125 + n * 28, 102 + n * 20) : rgba(47 + n * 12, 62 + n * 14, 58 + n * 10);
  });
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(118 + noise(seed, x, y, "metal-roughness") * 72)
  );
  const metalness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(96 + noise(seed, x, y, "metalness") * 54)
  );
  return { baseColor, roughness, metalness };
}

function paintedWoodLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const grain = Math.sin((y + noise(seed, x, 0, "wood-line") * 5) / 2.8) * 18;
    const n = noise(seed, x, y, "wood");
    return rgba(135 + grain + n * 20, 95 + grain * 0.5 + n * 12, 54 + n * 10);
  });
  const height = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(126 + Math.sin(y / 2.8) * 18 + noise(seed, x, y, "wood-height") * 18)
  );
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(150 + noise(seed, x, y, "wood-roughness") * 58)
  );
  return { baseColor, height, roughness };
}

function roofLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const isGable = request.selectedFamily.includes("gable");
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const seam = isGable ? y % 8 === 0 : x % 13 === 0 || y % 11 === 0;
    const n = noise(seed, x, y, "roof");
    return seam ? rgba(56 + n * 16, 54 + n * 14, 50 + n * 12) : rgba(73 + n * 22, 70 + n * 20, 65 + n * 16);
  });
  const height = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const seam = isGable ? y % 8 === 0 : x % 13 === 0 || y % 11 === 0;
    return mono(seam ? 150 : 112 + noise(seed, x, y, "roof-height") * 20);
  });
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(176 + noise(seed, x, y, "roof-roughness") * 46)
  );
  return { baseColor, height, roughness };
}

function glassLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const wave = Math.sin((x + y) / 5) * 10;
    const n = noise(seed, x, y, "glass");
    return rgba(100 + wave + n * 12, 134 + wave + n * 18, 128 + wave + n * 16, 190);
  });
  const roughness = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) =>
    mono(48 + noise(seed, x, y, "glass-roughness") * 24)
  );
  const opacity = makeLayer(request.widthPx, request.heightPx, request.periodicity, () => mono(190, 190));
  return { baseColor, roughness, opacity };
}

function ornamentLayers(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const baseColor = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const centerX = (request.widthPx - 1) / 2;
    const centerY = (request.heightPx - 1) / 2;
    const dx = Math.abs(x - centerX) / Math.max(1, centerX);
    const dy = Math.abs(y - centerY) / Math.max(1, centerY);
    const petal = Math.sin((dx + dy) * 10) > 0.2;
    const alpha = petal ? 210 : 24;
    return rgba(154, 139, 108, alpha);
  });
  const height = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const n = noise(seed, x, y, "ornament-height");
    const relief = Math.sin((x / request.widthPx + y / request.heightPx) * Math.PI * 4);
    return mono(92 + Math.max(0, relief) * 96 + n * 18);
  });
  const opacity = makeLayer(request.widthPx, request.heightPx, request.periodicity, (x, y) => {
    const n = noise(seed, x, y, "ornament-opacity");
    return mono(n > 0.22 ? 220 : 0);
  });
  return { baseColor, height, opacity };
}

function layersForRequest(request: MaterialSourceRequest, seed: SeedTree): MaterialSourceArtifact["layers"] {
  const family = request.selectedFamily.toLowerCase();
  const source = request.sourceId.toLowerCase();
  const procedural = (request.proceduralSource ?? "").toLowerCase();
  const role = (request.artKitMaterialRoleId ?? "").toLowerCase();

  if (
    family.includes("brick") ||
    procedural.includes("brick") ||
    role === "brick"
  ) {
    return brickLayers(request, seed);
  }
  if (
    family.includes("stucco") ||
    family.includes("plaster") ||
    procedural.includes("stucco") ||
    procedural.includes("plaster") ||
    role === "plaster"
  ) {
    return stuccoLayers(request, seed);
  }
  if (
    source.includes("roof") ||
    family.includes("roof") ||
    family.includes("gable") ||
    procedural.includes("roof") ||
    role === "roof"
  ) {
    return roofLayers(request, seed);
  }
  if (source.includes("glass") || procedural.includes("glass") || role === "glass") {
    return glassLayers(request, seed);
  }
  if (
    source.includes("door") ||
    family.includes("wood") ||
    procedural.includes("wood") ||
    role === "painted-wood"
  ) {
    return paintedWoodLayers(request, seed);
  }
  if (
    source.includes("ornament") ||
    source.includes("utility") ||
    procedural.includes("grime") ||
    role === "grime"
  ) {
    return ornamentLayers(request, seed);
  }
  return paintedMetalLayers(request, seed);
}

export class ProceduralMaterialProvider implements MaterialGenerationProvider {
  readonly id = "procedural";

  async generate(request: MaterialSourceRequest, signal: AbortSignal): Promise<MaterialSourceArtifact> {
    if (signal.aborted) {
      throw new Error("Procedural material generation aborted");
    }

    const { stochasticHash, requestHash, algorithm, rasterDescriptor } = await getProceduralMaterialRequestIdentity(request);
    const seed = createSeedTree(`${request.seedPath}/${stochasticHash}`);
    const legacyLayers = layersForRequest(request, seed);
    const layers = rasterDescriptor ? {
      ...legacyLayers,
      ...rasterizePeriodicMasonry(rasterDescriptor, request.widthPx, request.heightPx)
    } : legacyLayers;

    if (signal.aborted) {
      throw new Error("Procedural material generation aborted");
    }

    const contentHash = await hashMaterialSourceContent({ providerId: this.id, requestHash, layers, rasterDescriptor });

    return {
      sourceId: request.sourceId,
      providerId: this.id,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      layers,
      requestHash,
      contentHash,
      ...(rasterDescriptor ? { rasterDescriptor } : {}),
      provenance: {
        providerId: this.id,
        seedPath: request.seedPath,
        promptVocabulary: request.promptVocabulary,
        algorithm
      }
    };
  }
}
