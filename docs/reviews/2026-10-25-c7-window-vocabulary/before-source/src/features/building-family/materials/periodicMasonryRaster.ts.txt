import { z } from "zod";
import { createSeedTree } from "../core/seedTree";

/** A closed running-bond tile: 80 mm courses and 160 mm brick pitch. */
export const PrimaryWallSamplingProfileSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  model: z.literal("primary-authored-wall-periodic-area-v2"),
  tileSizeM: z.literal(0.96),
  courseCount: z.literal(12),
  columnsPerCourse: z.literal(6),
  jointFractionOfCourse: z.literal(0.14)
}).strict();
export type PrimaryWallSamplingProfile = z.infer<typeof PrimaryWallSamplingProfileSchema>;
export const PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE: PrimaryWallSamplingProfile = Object.freeze({
  schemaVersion: "0.1.0",
  model: "primary-authored-wall-periodic-area-v2",
  tileSizeM: 0.96,
  courseCount: 12,
  columnsPerCourse: 6,
  jointFractionOfCourse: 0.14
});

/** The model fixes the legacy palette/height formula and the half-open grain grid. */
export const PeriodicMasonryRasterDescriptorSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  samplingProfile: PrimaryWallSamplingProfileSchema,
  seedPath: z.string().min(1).max(2048),
  seedRoot: z.string().min(1).max(2113),
  legacyStochasticHash: z.string().regex(/^[a-f\d]{64}$/),
  grainSizePx: z.object({ width: z.literal(32), height: z.literal(32) }).strict()
}).strict().superRefine((value, context) => {
  if (value.seedRoot !== value.seedPath + "/" + value.legacyStochasticHash) {
    context.addIssue({ code: "custom", message: "Raster seed root must retain its legacy request identity." });
  }
});
export type PeriodicMasonryRasterDescriptor = z.infer<typeof PeriodicMasonryRasterDescriptorSchema>;

export function createPeriodicMasonryRasterDescriptor(input: {
  seedPath: string;
  legacyStochasticHash: string;
}): PeriodicMasonryRasterDescriptor {
  return PeriodicMasonryRasterDescriptorSchema.parse({
    schemaVersion: "0.1.0",
    samplingProfile: PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE,
    seedPath: input.seedPath,
    seedRoot: input.seedPath + "/" + input.legacyStochasticHash,
    legacyStochasticHash: input.legacyStochasticHash,
    grainSizePx: { width: 32, height: 32 }
  });
}

export interface PeriodicMasonryRect { x0: number; y0: number; x1: number; y1: number }
export interface PeriodicMasonryRgbaLayer {
  widthPx: number;
  heightPx: number;
  channels: "rgba8";
  data: Uint8ClampedArray;
}

// In this fixed model one tile is 600 units, a course 50, a pitch 100 and a
// joint 7. Integer stripe boundaries avoid cancellation at source-byte ties.
const TILE = 600;
const COURSE = 50;
const PITCH = 100;
const JOINT = 7;
const GRAIN = 32;
const overlap = (size: number, start: number, end: number) =>
  Math.max(0, Math.min(size, end) - Math.max(0, start));
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const linear = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};
const encoded = (value: number) =>
  byte(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));

function mortarAreaFor(x0: number, y0: number, x1: number, y1: number,
  pitch: number, course: number, jointX: number, jointY: number): number {
  const w = x1 - x0, h = y1 - y0;
  let area = 0;
  for (let row = Math.floor(y0 / course); row < Math.ceil(y1 / course); row += 1) {
    const startY = row * course - y0;
    const rowHeight = overlap(h, startY, startY + course);
    const bedHeight = overlap(h, startY, startY + jointY);
    const shift = row % 2 === 0 ? 0 : pitch / 2;
    let verticalWidth = 0;
    for (let column = Math.floor((x0 + shift) / pitch); column < Math.ceil((x1 + shift) / pitch); column += 1) {
      const startX = column * pitch - shift - x0;
      verticalWidth += overlap(w, startX, startX + jointX);
    }
    area += w * bedHeight + verticalWidth * (rowHeight - bedHeight);
  }
  return area;
}

function integerLcm(a: number, b: number): number {
  let divisor = a, remainder = b;
  while (remainder !== 0) [divisor, remainder] = [remainder, divisor % remainder];
  return a / divisor * b;
}

/**
 * Exact area of the periodic stripe union in a normalized tile rectangle.
 * Bounds may cross course, parity or tile boundaries. Even course count makes
 * folding a whole tile preserve running-bond parity, including negative phase.
 */
export function periodicMasonryCoverage(rect: PeriodicMasonryRect): number {
  const width = rect.x1 - rect.x0, height = rect.y1 - rect.y0;
  if (![rect.x0, rect.y0, rect.x1, rect.y1].every(Number.isFinite) ||
      [rect.x0, rect.y0, rect.x1, rect.y1].some((value) => Math.abs(value) > 1e6) ||
      width <= 0 || height <= 0 || width > 4 || height > 4 || width * height <= 0) {
    throw new Error("Periodic masonry rectangle must have finite positive area and bounded spans.");
  }
  const originX = Math.floor(rect.x0), originY = Math.floor(rect.y0);
  const x0 = (rect.x0 - originX) * TILE, x1 = (rect.x1 - originX) * TILE;
  const y0 = (rect.y0 - originY) * TILE, y1 = (rect.y1 - originY) * TILE;
  const w = x1 - x0, h = y1 - y0;
  if (w * h <= 0) throw new Error("Periodic masonry rectangle area is below coordinate precision.");
  const mortarArea = mortarAreaFor(x0, y0, x1, y1, PITCH, COURSE, JOINT, JOINT);
  return Math.max(0, Math.min(1, mortarArea / (w * h)));
}

/**
 * Evaluate the same material field at source or slot resolution. Grain is
 * always the half-open 32-cell legacy seed basis, including cell 31 rather than
 * a duplicated cell 0. Destination pixels integrate every crossed grain cell.
 * Endpoint bytes are clamped first, colors averaged in linear sRGB and height
 * averaged linearly; destination bytes are quantized once.
 */
export function rasterizePeriodicMasonry(descriptorInput: unknown, widthPx: number, heightPx: number): {
  baseColor: PeriodicMasonryRgbaLayer;
  height: PeriodicMasonryRgbaLayer;
} {
  const descriptor = PeriodicMasonryRasterDescriptorSchema.parse(descriptorInput);
  if (![widthPx, heightPx].every((value) => Number.isInteger(value) && value > 0 && value <= 4096) ||
      widthPx * heightPx > 16_777_216) {
    throw new Error("Periodic masonry raster dimensions must be positive integers at most 4096.");
  }
  // 2400 closes both the 600-unit masonry lattice and 32-cell grain lattice.
  // Include target dimensions so all intersections and height-area numerators
  // are integers, even at half-byte ties in an odd-sized atlas slot.
  const tileX = integerLcm(2400, widthPx), tileY = integerLcm(2400, heightPx);
  const pixelX = tileX / widthPx, pixelY = tileY / heightPx;
  const grainX = tileX / GRAIN, grainY = tileY / GRAIN;
  const pixelArea = pixelX * pixelY;
  if (![tileX, tileY, pixelX, pixelY, grainX, grainY, tileX * tileY, pixelArea * 255].every(Number.isSafeInteger)) {
    throw new Error("Periodic masonry raster exceeds safe integer area bounds.");
  }
  const seed = createSeedTree(descriptor.seedRoot);
  const colors = new Float64Array(GRAIN * GRAIN * 6);
  const heights = new Uint8ClampedArray(GRAIN * GRAIN);
  for (let y = 0; y < GRAIN; y += 1) for (let x = 0; x < GRAIN; x += 1) {
    const index = y * GRAIN + x;
    const grain = seed.float01("brick-grain/" + x + "/" + y) * 22 - 8;
    const brick = [132 + grain, 45 + grain * 0.3, 32 + grain * 0.2];
    const mortar = [176 + grain, 163 + grain, 145 + grain];
    for (let channel = 0; channel < 3; channel += 1) {
      colors[index * 6 + channel] = linear(byte(brick[channel]));
      colors[index * 6 + channel + 3] = linear(byte(mortar[channel]));
    }
    heights[index] = byte(154 + seed.float01("brick-height/" + x + "/" + y) * 28);
  }
  const baseColor: PeriodicMasonryRgbaLayer = {
    widthPx, heightPx, channels: "rgba8", data: new Uint8ClampedArray(widthPx * heightPx * 4)
  };
  const height: PeriodicMasonryRgbaLayer = {
    widthPx, heightPx, channels: "rgba8", data: new Uint8ClampedArray(widthPx * heightPx * 4)
  };
  for (let y = 0; y < heightPx; y += 1) for (let x = 0; x < widthPx; x += 1) {
    const rgb = [0, 0, 0];
    let heightArea = 0;
    const firstX = Math.floor(x * GRAIN / widthPx), endX = Math.min(GRAIN, Math.ceil((x + 1) * GRAIN / widthPx));
    const firstY = Math.floor(y * GRAIN / heightPx), endY = Math.min(GRAIN, Math.ceil((y + 1) * GRAIN / heightPx));
    for (let gy = firstY; gy < endY; gy += 1) for (let gx = firstX; gx < endX; gx += 1) {
      const x0 = Math.max(x * pixelX, gx * grainX), x1 = Math.min((x + 1) * pixelX, (gx + 1) * grainX);
      const y0 = Math.max(y * pixelY, gy * grainY), y1 = Math.min((y + 1) * pixelY, (gy + 1) * grainY);
      const area = (x1 - x0) * (y1 - y0);
      if (area <= 0) continue;
      const mortarArea = mortarAreaFor(x0, y0, x1, y1, tileX / 6, tileY / 12, tileX * 7 / 600, tileY * 7 / 600);
      const brickArea = area - mortarArea;
      const index = gy * GRAIN + gx;
      for (let channel = 0; channel < 3; channel += 1) {
        rgb[channel] += colors[index * 6 + channel] * brickArea + colors[index * 6 + channel + 3] * mortarArea;
      }
      heightArea += heights[index] * brickArea + 82 * mortarArea;
    }
    if (!Number.isSafeInteger(heightArea)) throw new Error("Periodic masonry height-area numerator exceeds safe integer bounds.");
    const offset = (y * widthPx + x) * 4;
    baseColor.data.set([encoded(rgb[0] / pixelArea), encoded(rgb[1] / pixelArea), encoded(rgb[2] / pixelArea), 255], offset);
    const value = byte(heightArea / pixelArea);
    height.data.set([value, value, value, 255], offset);
  }
  return { baseColor, height };
}
