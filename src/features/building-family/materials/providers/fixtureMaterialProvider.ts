import { canonicalJson } from "../../core/canonicalJson";
import { hashCanonicalJson, sha256Hex } from "../../core/contentHash";
import type {
  MaterialGenerationProvider,
  MaterialSourceArtifact,
  MaterialSourceRequest,
  PixelLayer
} from "./proceduralMaterialProvider";

type Rgba = [number, number, number, number];

function sourceByte(sourceId: string, salt: number): number {
  let value = 0;
  for (let index = 0; index < sourceId.length; index += 1) {
    value = (value + sourceId.charCodeAt(index) * (index + 1 + salt)) % 256;
  }
  return value;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeLayer(widthPx: number, heightPx: number, sample: (x: number, y: number) => Rgba): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);

  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const [r, g, b, a] = sample(x, y);
      const index = (y * widthPx + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  return { widthPx, heightPx, channels: "rgba8", data };
}

function solidLayer(widthPx: number, heightPx: number, value: number, alpha = 255): PixelLayer {
  return makeLayer(widthPx, heightPx, () => [value, value, value, alpha]);
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
    const bytes = new Uint8Array(layer.data.byteLength);
    bytes.set(layer.data);
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

export class FixtureMaterialProvider implements MaterialGenerationProvider {
  readonly id = "fixture";

  async generate(request: MaterialSourceRequest, signal: AbortSignal): Promise<MaterialSourceArtifact> {
    if (signal.aborted) {
      throw new Error("Fixture material generation aborted");
    }

    const requestHash = await hashCanonicalJson({
      providerId: this.id,
      request
    });
    const red = sourceByte(request.sourceId, 1);
    const green = sourceByte(request.sourceId, 7);
    const blue = sourceByte(request.sourceId, 13);
    const baseColor = makeLayer(request.widthPx, request.heightPx, (x, y) => [
      clampByte(red + x * 5),
      clampByte(green + y * 7),
      clampByte(blue + x * 3 + y * 2),
      255
    ]);
    const height = makeLayer(request.widthPx, request.heightPx, (x, y) => {
      const value = 80 + ((x + y) % Math.max(1, request.widthPx)) * 12;
      return [clampByte(value), clampByte(value), clampByte(value), 255];
    });
    const roughness = solidLayer(request.widthPx, request.heightPx, 146);
    const metalness = request.sourceId.includes("frame") || request.sourceId.includes("trim")
      ? solidLayer(request.widthPx, request.heightPx, 62)
      : undefined;
    const opacity = request.sourceId.includes("glass") || request.sourceId.includes("ornament") || request.sourceId.includes("utility")
      ? solidLayer(request.widthPx, request.heightPx, 210, 210)
      : undefined;
    const layers = { baseColor, height, roughness, metalness, opacity };

    if (signal.aborted) {
      throw new Error("Fixture material generation aborted");
    }

    const contentHash = await sha256Hex(
      new TextEncoder().encode(
        canonicalJson({
          providerId: this.id,
          requestHash,
          layerBytes: Array.from(layerBytes(layers))
        })
      )
    );

    return {
      sourceId: request.sourceId,
      providerId: this.id,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      layers,
      requestHash,
      contentHash,
      provenance: {
        providerId: this.id,
        seedPath: request.seedPath,
        promptVocabulary: request.promptVocabulary,
        algorithm: "fixture-v0.1-rgba"
      }
    };
  }
}
