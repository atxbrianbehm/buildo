import type { AtlasSlot } from "../contracts/atlasManifest";
import type { PixelLayer } from "./providers/proceduralMaterialProvider";

function pixelOffset(layer: PixelLayer, x: number, y: number): number {
  return (y * layer.widthPx + x) * 4;
}

function averageEdgePixels(data: Uint8ClampedArray, leftOffset: number, rightOffset: number): void {
  for (let channel = 0; channel < 4; channel += 1) {
    const average = Math.round((data[leftOffset + channel] + data[rightOffset + channel]) / 2);
    data[leftOffset + channel] = average;
    data[rightOffset + channel] = average;
  }
}

export function blendPeriodicEdges(layer: PixelLayer, periodicity: AtlasSlot["periodicity"]): PixelLayer {
  const data = new Uint8ClampedArray(layer.data);

  if (periodicity === "x" || periodicity === "xy") {
    for (let y = 0; y < layer.heightPx; y += 1) {
      averageEdgePixels(data, pixelOffset(layer, 0, y), pixelOffset(layer, layer.widthPx - 1, y));
    }
  }

  if (periodicity === "xy") {
    for (let x = 0; x < layer.widthPx; x += 1) {
      averageEdgePixels(data, pixelOffset(layer, x, 0), pixelOffset(layer, x, layer.heightPx - 1));
    }
  }

  return {
    widthPx: layer.widthPx,
    heightPx: layer.heightPx,
    channels: "rgba8",
    data
  };
}
