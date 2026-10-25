import { compositeRemoteMaterialOverlay } from "../materials/remoteMaterialOverlay";
import {
  remoteMaterialOverlayFromImageArtifact,
  type PngLayerDecoder,
  type RemoteMaterialImageArtifact
} from "../materials/remoteMaterialImageBridge";
import type {
  MaterialSourceArtifact,
  MaterialSourceRequest,
  PixelLayer
} from "../materials/providers/proceduralMaterialProvider";

function makeLayer(
  widthPx: number,
  heightPx: number,
  rgba: [number, number, number, number]
): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { widthPx, heightPx, channels: "rgba8", data };
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const index = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(index, index + 4));
}

function sourceRequest(): MaterialSourceRequest {
  return {
    sourceId: "source.wall.primary",
    role: "wall",
    selectedFamily: "running-bond-brick",
    periodicity: "xy",
    physicalSizeM: { width: 18, height: 14 },
    seedPath: "atlas/source/wall.primary/running-bond-brick",
    promptVocabulary: ["running-bond-brick", "primary wall material"],
    widthPx: 4,
    heightPx: 2
  };
}

function remoteArtifact(overrides: Partial<RemoteMaterialImageArtifact> = {}): RemoteMaterialImageArtifact {
  return {
    schemaVersion: "0.1.0",
    sourceId: "source.wall.primary",
    providerId: "openai-image",
    image: {
      format: "png",
      b64Json: "remote-png-b64"
    },
    revisedPrompt: "tileable revised masonry prompt",
    requestHash: "remote-request-hash",
    contentHash: "remote-content-hash",
    provenance: {
      providerId: "openai-image",
      model: "gpt-image-test",
      endpoint: "https://api.openai.com/v1/images/generations",
      prompt: "remote prompt",
      promptVocabulary: ["running-bond-brick", "patina"],
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      outputFormat: "png",
      quality: "low"
    },
    ...overrides
  };
}

function proceduralArtifact(): MaterialSourceArtifact {
  return {
    sourceId: "source.wall.primary",
    providerId: "procedural",
    widthPx: 4,
    heightPx: 2,
    layers: {
      baseColor: makeLayer(4, 2, [100, 100, 100, 255]),
      height: makeLayer(4, 2, [80, 80, 80, 255])
    },
    requestHash: "procedural-request-hash",
    contentHash: "procedural-content-hash",
    provenance: {
      providerId: "procedural",
      seedPath: "atlas/source/wall.primary/running-bond-brick",
      promptVocabulary: ["running-bond-brick"],
      algorithm: "test-procedural"
    }
  };
}

describe("remote material image bridge", () => {
  it("decodes a remote PNG artifact into an overlay for the procedural compositor", async () => {
    const decoderCalls: Array<{ b64Json: string; widthPx: number; heightPx: number }> = [];
    const decoder: PngLayerDecoder = async (input) => {
      decoderCalls.push(input);
      return makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128]);
    };

    const result = await remoteMaterialOverlayFromImageArtifact(remoteArtifact(), sourceRequest(), decoder);

    expect(result.diagnostics).toEqual([]);
    expect(decoderCalls).toEqual([{ b64Json: "remote-png-b64", widthPx: 4, heightPx: 2 }]);
    expect(result.overlay).toEqual(
      expect.objectContaining({
        sourceId: "source.wall.primary",
        providerId: "openai-image",
        widthPx: 4,
        heightPx: 2,
        requestHash: "remote-request-hash",
        contentHash: "remote-content-hash",
        revisedPrompt: "tileable revised masonry prompt",
        provenance: expect.objectContaining({
          providerId: "openai-image",
          seedPath: "atlas/source/wall.primary/running-bond-brick",
          promptVocabulary: ["running-bond-brick", "patina"],
          algorithm: "remote-png-artifact-decode-v0.1"
        })
      })
    );

    const composed = await compositeRemoteMaterialOverlay(proceduralArtifact(), result.overlay!);
    expect(composed.diagnostics).toEqual([]);
    expect(pixel(composed.artifact.layers.baseColor, 0, 0)).toEqual([150, 75, 50, 255]);
    expect(composed.artifact.layers.height?.data).toEqual(proceduralArtifact().layers.height?.data);
  });

  it("rejects invalid artifacts and source mismatches before decoding", async () => {
    let decodeCount = 0;
    const decoder: PngLayerDecoder = async (input) => {
      decodeCount += 1;
      return makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128]);
    };

    const invalid = await remoteMaterialOverlayFromImageArtifact(
      { ...remoteArtifact(), image: { format: "jpeg", b64Json: "wrong-format" } },
      sourceRequest(),
      decoder
    );
    const mismatched = await remoteMaterialOverlayFromImageArtifact(
      remoteArtifact({ sourceId: "source.roof.primary" }),
      sourceRequest(),
      decoder
    );

    expect(decodeCount).toBe(0);
    expect(invalid.overlay).toBeUndefined();
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialImageBridge.invalidArtifact",
        severity: "error",
        path: "image.format"
      })
    );
    expect(mismatched.overlay).toBeUndefined();
    expect(mismatched.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialImageBridge.sourceMismatch",
        severity: "error",
        received: "source.roof.primary"
      })
    );
  });

  it("reports decoder dimension mismatches without returning an overlay", async () => {
    const result = await remoteMaterialOverlayFromImageArtifact(
      remoteArtifact(),
      sourceRequest(),
      async () => makeLayer(2, 2, [200, 50, 0, 128])
    );

    expect(result.overlay).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialImageBridge.decodedLayerDimensionMismatch",
        severity: "error",
        received: "2x2",
        allowedValues: ["4x2"]
      })
    );
  });
});
