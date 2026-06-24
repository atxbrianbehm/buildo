import type { PngLayerDecoderInput } from "../materials/remoteMaterialImageBridge";
import type { PixelLayer } from "../materials/providers/proceduralMaterialProvider";

export class BrowserPngLayerDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserPngLayerDecodeError";
  }
}

export interface BrowserImageBitmap {
  width: number;
  height: number;
  close?: () => void;
}

export interface BrowserCanvas2dContext {
  drawImage: (
    image: BrowserImageBitmap,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) => void;
  getImageData: (x: number, y: number, width: number, height: number) => { data: Uint8ClampedArray };
}

export interface BrowserCanvas {
  getContext: (kind: "2d", options?: { willReadFrequently?: boolean }) => BrowserCanvas2dContext | null;
}

export interface BrowserPngDecodeRuntime {
  decodeBase64?: (b64Json: string) => Uint8Array;
  makeBlob?: (bytes: Uint8Array, type: string) => unknown;
  createImageBitmap?: (blob: unknown) => Promise<BrowserImageBitmap>;
  createCanvas?: (widthPx: number, heightPx: number) => BrowserCanvas;
}

function defaultDecodeBase64(b64Json: string): Uint8Array {
  if (typeof globalThis.atob !== "function") {
    throw new BrowserPngLayerDecodeError("Browser PNG decoding requires atob.");
  }

  const binary = globalThis.atob(b64Json);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function defaultMakeBlob(bytes: Uint8Array, type: string): Blob {
  if (typeof Blob === "undefined") {
    throw new BrowserPngLayerDecodeError("Browser PNG decoding requires Blob.");
  }

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function defaultCreateImageBitmap(blob: unknown): Promise<BrowserImageBitmap> {
  if (typeof globalThis.createImageBitmap !== "function") {
    throw new BrowserPngLayerDecodeError("Browser PNG decoding requires createImageBitmap.");
  }

  return globalThis.createImageBitmap(blob as Blob);
}

function defaultCreateCanvas(widthPx: number, heightPx: number): BrowserCanvas {
  if (typeof document === "undefined") {
    throw new BrowserPngLayerDecodeError("Browser PNG decoding requires document.createElement.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  return canvas as BrowserCanvas;
}

function runtimeWithDefaults(runtime: BrowserPngDecodeRuntime): Required<BrowserPngDecodeRuntime> {
  return {
    decodeBase64: runtime.decodeBase64 ?? defaultDecodeBase64,
    makeBlob: runtime.makeBlob ?? defaultMakeBlob,
    createImageBitmap: runtime.createImageBitmap ?? defaultCreateImageBitmap,
    createCanvas: runtime.createCanvas ?? defaultCreateCanvas
  };
}

function assertPositiveDimensions(input: PngLayerDecoderInput): void {
  if (!Number.isInteger(input.widthPx) || input.widthPx <= 0 || !Number.isInteger(input.heightPx) || input.heightPx <= 0) {
    throw new BrowserPngLayerDecodeError("Browser PNG decoding requires positive integer dimensions.");
  }
}

export async function decodeBrowserPngLayer(
  input: PngLayerDecoderInput,
  runtime: BrowserPngDecodeRuntime = {}
): Promise<PixelLayer> {
  assertPositiveDimensions(input);
  const resolvedRuntime = runtimeWithDefaults(runtime);
  const bytes = resolvedRuntime.decodeBase64(input.b64Json);
  const blob = resolvedRuntime.makeBlob(bytes, "image/png");
  const imageBitmap = await resolvedRuntime.createImageBitmap(blob);

  try {
    const canvas = resolvedRuntime.createCanvas(input.widthPx, input.heightPx);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new BrowserPngLayerDecodeError("Browser PNG decoding requires a 2D canvas context.");
    }

    context.drawImage(
      imageBitmap,
      0,
      0,
      imageBitmap.width,
      imageBitmap.height,
      0,
      0,
      input.widthPx,
      input.heightPx
    );

    const imageData = context.getImageData(0, 0, input.widthPx, input.heightPx);
    const expectedByteLength = input.widthPx * input.heightPx * 4;
    if (imageData.data.byteLength !== expectedByteLength) {
      throw new BrowserPngLayerDecodeError("Browser PNG decoding returned non-RGBA8 image data.");
    }

    const data = new Uint8ClampedArray(expectedByteLength);
    data.set(imageData.data);
    return {
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      channels: "rgba8",
      data
    };
  } finally {
    imageBitmap.close?.();
  }
}
