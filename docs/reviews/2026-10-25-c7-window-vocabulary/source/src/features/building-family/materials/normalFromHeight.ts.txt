import type { PixelLayer } from "./providers/proceduralMaterialProvider";

export interface NormalFromHeightOptions {
  strength?: number;
  wrapX?: boolean;
  wrapY?: boolean;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function heightValue(layer: PixelLayer, x: number, y: number, wrapX: boolean, wrapY: boolean): number {
  const sampleX = wrapX ? (x + layer.widthPx) % layer.widthPx : Math.max(0, Math.min(layer.widthPx - 1, x));
  const sampleY = wrapY ? (y + layer.heightPx) % layer.heightPx : Math.max(0, Math.min(layer.heightPx - 1, y));
  return layer.data[(sampleY * layer.widthPx + sampleX) * 4] / 255;
}

export function normalFromHeight(height: PixelLayer, options: NormalFromHeightOptions = {}): PixelLayer {
  const strength = options.strength ?? 2;
  const data = new Uint8ClampedArray(height.widthPx * height.heightPx * 4);

  for (let y = 0; y < height.heightPx; y += 1) {
    for (let x = 0; x < height.widthPx; x += 1) {
      const left = heightValue(height, x - 1, y, options.wrapX ?? false, options.wrapY ?? false);
      const right = heightValue(height, x + 1, y, options.wrapX ?? false, options.wrapY ?? false);
      const top = heightValue(height, x, y - 1, options.wrapX ?? false, options.wrapY ?? false);
      const bottom = heightValue(height, x, y + 1, options.wrapX ?? false, options.wrapY ?? false);
      const dx = (right - left) * strength;
      const dy = (bottom - top) * strength;
      const length = Math.hypot(-dx, -dy, 1);
      const nx = -dx / length;
      const ny = -dy / length;
      const nz = 1 / length;
      const index = (y * height.widthPx + x) * 4;

      data[index] = clampByte((nx * 0.5 + 0.5) * 255);
      data[index + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      data[index + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }

  return {
    widthPx: height.widthPx,
    heightPx: height.heightPx,
    channels: "rgba8",
    data
  };
}
