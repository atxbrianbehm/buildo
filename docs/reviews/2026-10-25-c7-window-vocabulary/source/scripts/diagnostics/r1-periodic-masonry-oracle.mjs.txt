import assert from 'node:assert/strict';

// Independent evidence oracle: integrate an integer 600 x 600 binary field.
// Production uses course/stripe clipping; this uses a summed-area table instead.
const extent = 600, stride = extent + 1;
const integral = new Uint32Array(stride * stride);
for (let y = 0; y < extent; y += 1) {
  let row = 0;
  for (let x = 0; x < extent; x += 1) {
    row += y % 50 < 7 || (x + (Math.floor(y / 50) % 2) * 50) % 100 < 7 ? 1 : 0;
    integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
  }
}
assert.equal(integral[extent * stride + extent], 72072);
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
const lcm = (a, b) => a / gcd(a, b) * b;
const byte = value => Math.max(0, Math.min(255, Math.round(value)));
const linear = value => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const encoded = value => byte(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055));

export function createIndependentPeriodicMasonryOracle(seedRoot, createSeedTree) {
  assert.equal(typeof seedRoot, 'string'); assert(seedRoot.length);
  assert.equal(typeof createSeedTree, 'function');
  const seed = createSeedTree(seedRoot);
  const grains = Array.from({ length: 1024 }, (_, index) => {
    const x = index % 32, y = Math.floor(index / 32);
    const grain = seed.float01(`brick-grain/${x}/${y}`) * 22 - 8;
    return { brick: [132 + grain, 45 + 0.3 * grain, 32 + 0.2 * grain].map(value => linear(byte(value))),
      mortar: [176 + grain, 163 + grain, 145 + grain].map(value => linear(byte(value))),
      height: byte(154 + seed.float01(`brick-height/${x}/${y}`) * 28) };
  });
  return { rasterize(widthPx, heightPx) {
    for (const size of [widthPx, heightPx]) assert(Number.isInteger(size) && size > 0 && size <= 4096);
    assert(widthPx * heightPx <= 16777216);
    // Both grain boundaries and destination boundaries are exact integers here.
    // Partial binary-cell integrals also stay integer, preserving half-byte ties.
    const unitsX = lcm(lcm(extent, 32), widthPx), unitsY = lcm(lcm(extent, 32), heightPx);
    const cellX = unitsX / extent, cellY = unitsY / extent;
    const grainX = unitsX / 32, grainY = unitsY / 32;
    const pixelX = unitsX / widthPx, pixelY = unitsY / heightPx, pixelArea = pixelX * pixelY;
    assert(Number.isSafeInteger(unitsX * unitsY));
    function at(x, y) {
      assert(Number.isSafeInteger(x) && Number.isSafeInteger(y));
      assert(x >= 0 && x <= unitsX && y >= 0 && y <= unitsY);
      const ix = Math.floor(x / cellX), iy = Math.floor(y / cellY);
      const rx = x - ix * cellX, ry = y - iy * cellY;
      const whole = integral[iy * stride + ix];
      let result = whole * cellX * cellY;
      if (rx) result += rx * cellY * (integral[iy * stride + ix + 1] - whole);
      if (ry) result += ry * cellX * (integral[(iy + 1) * stride + ix] - whole);
      if (rx && ry) result += rx * ry * (integral[(iy + 1) * stride + ix + 1]
        - integral[(iy + 1) * stride + ix] - integral[iy * stride + ix + 1] + whole);
      assert(Number.isSafeInteger(result));
      return result;
    }
    const area = (x0, y0, x1, y1) => at(x1, y1) - at(x0, y1) - at(x1, y0) + at(x0, y0);
    const colorData = new Uint8ClampedArray(widthPx * heightPx * 4);
    const heightData = new Uint8ClampedArray(colorData.length);
    const coverage = new Float64Array(widthPx * heightPx);
    let totalMortarArea = 0;
    for (let y = 0; y < heightPx; y += 1) for (let x = 0; x < widthPx; x += 1) {
      const x0 = x * pixelX, y0 = y * pixelY, x1 = x0 + pixelX, y1 = y0 + pixelY;
      const mortarArea = area(x0, y0, x1, y1);
      coverage[y * widthPx + x] = mortarArea / pixelArea;
      totalMortarArea += mortarArea;
      const color = [0, 0, 0]; let height = 0, total = 0;
      for (let gy = Math.floor(y0 / grainY); gy < Math.ceil(y1 / grainY); gy += 1) {
        for (let gx = Math.floor(x0 / grainX); gx < Math.ceil(x1 / grainX); gx += 1) {
          const left = Math.max(x0, gx * grainX), right = Math.min(x1, (gx + 1) * grainX);
          const top = Math.max(y0, gy * grainY), bottom = Math.min(y1, (gy + 1) * grainY);
          const grainArea = (right - left) * (bottom - top), mortar = area(left, top, right, bottom), brick = grainArea - mortar;
          const endpoint = grains[gy * 32 + gx];
          for (let channel = 0; channel < 3; channel += 1) color[channel] += endpoint.brick[channel] * brick + endpoint.mortar[channel] * mortar;
          height += endpoint.height * brick + 82 * mortar; total += grainArea;
        }
      }
      assert.equal(total, pixelArea);
      const offset = (y * widthPx + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) colorData[offset + channel] = encoded(color[channel] / pixelArea);
      const h = byte(height / pixelArea);
      heightData.set([h, h, h, 255], offset); colorData[offset + 3] = 255;
    }
    assert.equal(totalMortarArea, integral[extent * stride + extent] * cellX * cellY);
    const coverageSum = totalMortarArea / pixelArea;
    const coverageMean = totalMortarArea / (unitsX * unitsY);
    assert(Math.abs(coverageMean - 0.2002) < 1e-12);
    const layer = data => ({ widthPx, heightPx, channels: 'rgba8', data });
    return { baseColor: layer(colorData), height: layer(heightData), coverage, coverageSum, coverageMean };
  } };
}
