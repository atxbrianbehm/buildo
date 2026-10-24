import { createSeedTree } from "../core/seedTree";
import {
  createPeriodicMasonryRasterDescriptor,
  PeriodicMasonryRasterDescriptorSchema,
  PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE,
  PrimaryWallSamplingProfileSchema,
  periodicMasonryCoverage,
  rasterizePeriodicMasonry,
  type PeriodicMasonryRect,
  type PeriodicMasonryRgbaLayer
} from "../materials/periodicMasonryRaster";

const descriptor = createPeriodicMasonryRasterDescriptor({
  seedPath: "atlas/source/wall.primary/brick-red",
  legacyStochasticHash: "de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31"
});
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const decode = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};
const encode = (value: number) => byte(255 * (
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
));
const pixel = (layer: PeriodicMasonryRgbaLayer, x: number, y: number) =>
  Array.from(layer.data.slice((y * layer.widthPx + x) * 4, (y * layer.widthPx + x) * 4 + 4));

// Independent exact oracle: a binary 600-square lattice, with a summed-area
// table. Bilinear interpolation integrates partial cells without reproducing
// the production evaluator's course and stripe-intersection loops.
const SIZE = 600, STRIDE = SIZE + 1;
const prefix = new Int32Array(STRIDE * STRIDE);
beforeAll(() => {
  for (let y = 0; y < SIZE; y += 1) {
    let rowCount = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const mortar = y % 50 < 7 || (x + (Math.floor(y / 50) % 2) * 50) % 100 < 7;
      rowCount += mortar ? 1 : 0;
      prefix[(y + 1) * STRIDE + x + 1] = prefix[y * STRIDE + x + 1] + rowCount;
    }
  }
});
function integral(x: number, y: number): number {
  const px = x * SIZE, py = y * SIZE;
  const ix = Math.min(SIZE - 1, Math.floor(px)), iy = Math.min(SIZE - 1, Math.floor(py));
  const fx = px - ix, fy = py - iy;
  const a = prefix[iy * STRIDE + ix], b = prefix[iy * STRIDE + ix + 1];
  const c = prefix[(iy + 1) * STRIDE + ix], d = prefix[(iy + 1) * STRIDE + ix + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
function oracleCoverage(rect: PeriodicMasonryRect): number {
  return (integral(rect.x1, rect.y1) - integral(rect.x0, rect.y1) -
    integral(rect.x1, rect.y0) + integral(rect.x0, rect.y0)) /
    ((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * SIZE * SIZE);
}
function legacyGrain(x: number, y: number) {
  const seed = createSeedTree(descriptor.seedRoot);
  const grain = seed.float01("brick-grain/" + x + "/" + y) * 22 - 8;
  return {
    brick: [132 + grain, 45 + grain * 0.3, 32 + grain * 0.2].map(byte),
    mortar: [176 + grain, 163 + grain, 145 + grain].map(byte),
    height: byte(154 + seed.float01("brick-height/" + x + "/" + y) * 28)
  };
}

/** Integer partial-cell integral of the independent binary summed-area table. */
function scaledIntegral(x: number, y: number, scaleX: number, scaleY: number): number {
  const ix = Math.floor(x / scaleX), iy = Math.floor(y / scaleY);
  const rx = x - ix * scaleX, ry = y - iy * scaleY;
  const a = prefix[iy * STRIDE + ix];
  let area = a * scaleX * scaleY;
  if (rx !== 0) area += (prefix[iy * STRIDE + ix + 1] - a) * rx * scaleY;
  if (ry !== 0) area += (prefix[(iy + 1) * STRIDE + ix] - a) * scaleX * ry;
  if (rx !== 0 && ry !== 0) area += (
    prefix[(iy + 1) * STRIDE + ix + 1] - prefix[iy * STRIDE + ix + 1] -
    prefix[(iy + 1) * STRIDE + ix] + a
  ) * rx * ry;
  return area;
}
function referenceHeightNumerators(width: number, height: number): { pixelArea: number; values: number[] } {
  const gcd = (a: number, b: number) => {
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  };
  const extentX = 2400 / gcd(2400, width) * width, extentY = 2400 / gcd(2400, height) * height;
  const stepX = extentX / width, stepY = extentY / height;
  const grainX = extentX / 32, grainY = extentY / 32;
  const sample = (x: number, y: number) => scaledIntegral(x, y, extentX / 600, extentY / 600);
  const heights = Array.from({ length: 1024 }, (_, index) => legacyGrain(index % 32, Math.floor(index / 32)).height);
  const values: number[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let numerator = 0;
    for (let gy = Math.floor(y * 32 / height); gy < Math.ceil((y + 1) * 32 / height); gy += 1) {
      for (let gx = Math.floor(x * 32 / width); gx < Math.ceil((x + 1) * 32 / width); gx += 1) {
        const left = Math.max(x * stepX, gx * grainX), right = Math.min((x + 1) * stepX, (gx + 1) * grainX);
        const top = Math.max(y * stepY, gy * grainY), bottom = Math.min((y + 1) * stepY, (gy + 1) * grainY);
        const area = (right - left) * (bottom - top);
        const mortarArea = sample(right, bottom) - sample(left, bottom) - sample(right, top) + sample(left, top);
        numerator += heights[gy * 32 + gx] * (area - mortarArea) + 82 * mortarArea;
      }
    }
    if (!Number.isSafeInteger(numerator)) throw new Error("Independent height-area oracle must remain integer.");
    values.push(numerator);
  }
  return { pixelArea: stepX * stepY, values };
}

describe("versioned selected masonry model", () => {
  it("records a closed 0.96 m tile independently of the nominal 75 mm anchor", () => {
    expect(PrimaryWallSamplingProfileSchema.parse(PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE)).toEqual({
      schemaVersion: "0.1.0", model: "primary-authored-wall-periodic-area-v2",
      tileSizeM: 0.96, courseCount: 12, columnsPerCourse: 6, jointFractionOfCourse: 0.14
    });
    expect(PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE.tileSizeM / PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE.courseCount).toBe(0.08);
    expect(PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE.tileSizeM / PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE.columnsPerCourse).toBe(0.16);
    expect(PeriodicMasonryRasterDescriptorSchema.parse(JSON.parse(JSON.stringify(descriptor)))).toEqual(descriptor);
    expect(descriptor.seedRoot).toBe(descriptor.seedPath + "/" + descriptor.legacyStochasticHash);
  });
  const invalid: [string, () => unknown][] = [
    ["schema version", () => ({ ...descriptor, schemaVersion: "0.2.0" })],
    ["profile version", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, schemaVersion: "0.2.0" } })],
    ["model", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, model: "legacy-endpoint-copy" } })],
    ["tile anchor", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, tileSizeM: 0.9 } })],
    ["odd courses", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, courseCount: 11 } })],
    ["columns", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, columnsPerCourse: 5 } })],
    ["joint width", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, jointFractionOfCourse: 0.2 } })],
    ["source grain width", () => ({ ...descriptor, grainSizePx: { width: 31, height: 32 } })],
    ["source grain height", () => ({ ...descriptor, grainSizePx: { width: 32, height: 31 } })],
    ["seed root", () => ({ ...descriptor, seedRoot: descriptor.seedPath + "/rerolled" })],
    ["seed path", () => ({ ...descriptor, seedPath: "another-source" })],
    ["hash", () => ({ ...descriptor, legacyStochasticHash: "not-a-sha256" })],
    ["extra descriptor field", () => ({ ...descriptor, smoothing: true })],
    ["extra profile field", () => ({ ...descriptor, samplingProfile: { ...descriptor.samplingProfile, densityAccepted: true } })]
  ];
  it.each(invalid)("rejects altered %s at the raster boundary", (_, build) => {
    expect(() => rasterizePeriodicMasonry(build(), 32, 32)).toThrow();
  });
});

describe("periodic pixel-area coverage", () => {
  it.each([
    [{ x0: 0.02, x1: 0.06, y0: 0, y1: 0.01 }, 1],
    [{ x0: 0, x1: 0.01, y0: 0.02, y1: 0.05 }, 1],
    [{ x0: 0.02, x1: 0.06, y0: 0.02, y1: 0.05 }, 0],
    [{ x0: 1 / 12, x1: 1 / 12 + 0.01, y0: 0.1, y1: 0.13 }, 1],
    [{ x0: 0, x1: 0.01, y0: 0.1, y1: 0.13 }, 0]
  ] as const)("clips an independent pure joint/brick rectangle %j", (rect, expected) => {
    expect(periodicMasonryCoverage(rect)).toBeCloseTo(expected, 12);
  });
  it("counts bed/head overlap once and crosses a shifted course boundary", () => {
    expect(periodicMasonryCoverage({ x0: 0, x1: 14 / 600, y0: 0, y1: 14 / 600 })).toBeCloseTo(0.75, 12);
    expect(periodicMasonryCoverage({ x0: 50 / 600, x1: 57 / 600, y0: 43 / 600, y1: 64 / 600 })).toBeCloseTo(2 / 3, 12);
  });
  it.each([[32, 32], [27, 37], [16, 16], [64, 64]])("matches the independent integral at every %i by %i pixel", (width, height) => {
    let area = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const rect = { x0: x / width, x1: (x + 1) / width, y0: y / height, y1: (y + 1) / height };
      const coverage = periodicMasonryCoverage(rect);
      expect(coverage).toBeCloseTo(oracleCoverage(rect), 11);
      area += coverage;
    }
    expect(area).toBeCloseTo(width * height * 0.2002, 9);
    expect(area / (width * height)).toBeCloseTo(0.2002, 12);
    expect(prefix[SIZE * STRIDE + SIZE]).toBe(72072);
  });
  it("wraps positive and negative phases and bounded multiple tiles without parity drift", () => {
    const rect = { x0: 0.031, x1: 0.209, y0: 0.061, y1: 0.217 };
    const value = periodicMasonryCoverage(rect);
    for (const [dx, dy] of [[2, -3], [-4, 5], [0, -1]]) {
      expect(periodicMasonryCoverage({ x0: rect.x0 + dx, x1: rect.x1 + dx,
        y0: rect.y0 + dy, y1: rect.y1 + dy })).toBeCloseTo(value, 12);
    }
    expect(periodicMasonryCoverage({ x0: -2, x1: 2, y0: -1, y1: 3 })).toBeCloseTo(0.2002, 12);
  });
  it("retains the odd-course half-pitch phase across pixel rectangles", () => {
    const rect = { x0: 0.13, x1: 0.19, y0: 0.07, y1: 0.14 };
    expect(periodicMasonryCoverage({ x0: rect.x0 + 1 / 12, x1: rect.x1 + 1 / 12,
      y0: rect.y0 + 1 / 12, y1: rect.y1 + 1 / 12 })).toBeCloseTo(periodicMasonryCoverage(rect), 12);
  });
  it("uses half-open cell integrals rather than equality of endpoint texels", () => {
    const first = { x0: 0, x1: 1, y0: 0, y1: 1 / 32 };
    const last = { x0: 0, x1: 1, y0: 31 / 32, y1: 1 };
    expect(periodicMasonryCoverage(first)).toBeCloseTo(0.4172, 12);
    expect(periodicMasonryCoverage(last)).toBeCloseTo(0.07, 12);
    expect(periodicMasonryCoverage({ ...first, y0: 1, y1: 1 + 1 / 32 })).toBeCloseTo(periodicMasonryCoverage(first), 12);
  });
  it.each([
    { x0: NaN, x1: 1, y0: 0, y1: 1 },
    { x0: 0, x1: Infinity, y0: 0, y1: 1 },
    { x0: 1, x1: 0, y0: 0, y1: 1 },
    { x0: 0, x1: 1, y0: 1, y1: 1 },
    { x0: 0, x1: 4.01, y0: 0, y1: 1 },
    { x0: 0, x1: 1, y0: 0, y1: 4.01 },
    { x0: -1e6 - 1, x1: -1e6, y0: 0, y1: 1 },
    { x0: 0, x1: Number.MIN_VALUE, y0: 0, y1: Number.MIN_VALUE }
  ])("rejects invalid or unbounded rectangle %j", (rect) => {
    expect(() => periodicMasonryCoverage(rect)).toThrow(/rectangle/);
  });
});

describe("legacy grain field sampled directly at destination resolution", () => {
  it("matches every source color/height byte against independent coverage and legacy seed coordinates", () => {
    const result = rasterizePeriodicMasonry(descriptor, 32, 32);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      const coverage = oracleCoverage({ x0: x / 32, x1: (x + 1) / 32, y0: y / 32, y1: (y + 1) / 32 });
      const grain = legacyGrain(x, y);
      const color = grain.brick.map((value, channel) => encode(decode(value) * (1 - coverage) + decode(grain.mortar[channel]) * coverage));
      const h = byte(grain.height * (1 - coverage) + 82 * coverage);
      expect(pixel(result.baseColor, x, y)).toEqual([...color, 255]);
      expect(pixel(result.height, x, y)).toEqual([h, h, h, 255]);
    }
    const last = legacyGrain(31, 31);
    expect(pixel(result.baseColor, 31, 31)).toEqual([...last.brick, 255]);
    expect(pixel(result.height, 31, 31)).toEqual([last.height, last.height, last.height, 255]);
    expect(pixel(result.baseColor, 31, 31)).not.toEqual(pixel(result.baseColor, 0, 0));
  });
  it("integrates the exact final 27 by 37 pixel across the fixed 32-cell grain basis", () => {
    const result = rasterizePeriodicMasonry(descriptor, 27, 37);
    const left = legacyGrain(30, 31), right = legacyGrain(31, 31);
    const color = left.brick.map((value, channel) => encode(decode(value) * 5 / 32 + decode(right.brick[channel]) * 27 / 32));
    const height = byte(left.height * 5 / 32 + right.height * 27 / 32);
    expect(pixel(result.baseColor, 26, 36)).toEqual([...color, 255]);
    expect(pixel(result.height, 26, 36)).toEqual([height, height, height, 255]);
  });
  it("matches every ROI height byte against the independent integer partial-cell integral", () => {
    const result = rasterizePeriodicMasonry(descriptor, 27, 37);
    const reference = referenceHeightNumerators(27, 37);
    for (let y = 0; y < 37; y += 1) for (let x = 0; x < 27; x += 1) {
      const h = byte(reference.values[y * 27 + x] / reference.pixelArea);
      expect(pixel(result.height, x, y)).toEqual([h, h, h, 255]);
    }
  });
  it("rounds exact odd-sized ROI half-height witnesses once, without epsilon corrections", () => {
    const result = rasterizePeriodicMasonry(descriptor, 27, 37);
    const reference = referenceHeightNumerators(27, 37);
    expect(reference.pixelArea).toBe(1920000);
    expect(reference.values[24 * 27 + 6]).toBe(237120000);
    expect(reference.values[33 * 27 + 1]).toBe(294720000);
    expect(reference.values[24 * 27 + 6] / reference.pixelArea).toBe(123.5);
    expect(reference.values[33 * 27 + 1] / reference.pixelArea).toBe(153.5);
    expect(pixel(result.height, 6, 24)).toEqual([124, 124, 124, 255]);
    expect(pixel(result.height, 1, 33)).toEqual([154, 154, 154, 255]);
  });
  it("conserves the whole-field color and height integral within only half-byte quantization bounds", () => {
    const results = [[32, 32], [27, 37], [16, 16], [64, 64]].map(([width, height]) =>
      rasterizePeriodicMasonry(descriptor, width, height));
    for (let channel = 0; channel < 3; channel += 1) {
      const intervals = results.map((result) => {
        let low = 0, high = 0;
        for (let i = channel; i < result.baseColor.data.length; i += 4) {
          low += decode(Math.max(0, result.baseColor.data[i] - 0.5));
          high += decode(Math.min(255, result.baseColor.data[i] + 0.5));
        }
        const count = result.baseColor.widthPx * result.baseColor.heightPx;
        return [low / count, high / count];
      });
      expect(Math.max(...intervals.map(([low]) => low))).toBeLessThanOrEqual(Math.min(...intervals.map(([, high]) => high)));
    }
    const heightIntervals = results.map((result) => {
      let sum = 0;
      for (let i = 0; i < result.height.data.length; i += 4) sum += result.height.data[i];
      const mean = sum / (result.height.widthPx * result.height.heightPx);
      return [mean - 0.5, mean + 0.5];
    });
    expect(Math.max(...heightIntervals.map(([low]) => low))).toBeLessThanOrEqual(Math.min(...heightIntervals.map(([, high]) => high)));
    for (const result of results) {
      for (let i = 0; i < result.baseColor.data.length; i += 4) {
        const values = Array.from(result.baseColor.data.slice(i, i + 4));
        expect(values[0]).toBeGreaterThanOrEqual(124); expect(values[0]).toBeLessThanOrEqual(190);
        expect(values[1]).toBeGreaterThanOrEqual(43); expect(values[1]).toBeLessThanOrEqual(177);
        expect(values[2]).toBeGreaterThanOrEqual(30); expect(values[2]).toBeLessThanOrEqual(159);
        expect(values[3]).toBe(255);
        expect(result.height.data[i]).toBeGreaterThanOrEqual(82); expect(result.height.data[i]).toBeLessThanOrEqual(182);
        expect(Array.from(result.height.data.slice(i, i + 4))).toEqual([result.height.data[i], result.height.data[i], result.height.data[i], 255]);
      }
    }
  });
  it("is deterministic, leaves its descriptor intact and returns independent arrays", () => {
    const before = JSON.stringify(descriptor);
    const first = rasterizePeriodicMasonry(descriptor, 27, 37), second = rasterizePeriodicMasonry(descriptor, 27, 37);
    expect(first).toEqual(second);
    expect(JSON.stringify(descriptor)).toBe(before);
    expect(first.baseColor.data).not.toBe(second.baseColor.data);
    expect(first.height.data).not.toBe(first.baseColor.data);
    first.baseColor.data[0] ^= 1;
    expect(first.baseColor.data).not.toEqual(second.baseColor.data);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 4097])("rejects unbounded/non-integer raster dimension %s before allocation", (value) => {
    expect(() => rasterizePeriodicMasonry(descriptor, value, 32)).toThrow(/dimensions/);
    expect(() => rasterizePeriodicMasonry(descriptor, 32, value)).toThrow(/dimensions/);
  });
});
