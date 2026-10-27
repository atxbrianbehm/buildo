import {
  BrowserPngLayerDecodeError,
  decodeBrowserPngLayer,
  type BrowserPngDecodeRuntime
} from "../ui/browserPngLayerDecoder";

function encoded(value: string): string {
  return globalThis.btoa(value);
}

describe("browser PNG layer decoder", () => {
  it("decodes a base64 PNG through browser image and canvas APIs into an RGBA8 layer", async () => {
    const calls: string[] = [];
    const imageBitmap = {
      width: 8,
      height: 8,
      close: () => calls.push("close")
    };
    const imageData = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 128
    ]);
    const runtime: BrowserPngDecodeRuntime = {
      decodeBase64: (input) => {
        calls.push(`decode:${input}`);
        return new Uint8Array([137, 80, 78, 71]);
      },
      makeBlob: (bytes, type) => {
        calls.push(`blob:${type}:${Array.from(bytes).join(",")}`);
        return { bytes, type };
      },
      createImageBitmap: async (blob) => {
        calls.push(`bitmap:${(blob as { type: string }).type}`);
        return imageBitmap;
      },
      createCanvas: (widthPx, heightPx) => {
        calls.push(`canvas:${widthPx}x${heightPx}`);
        return {
          getContext: (kind) => {
            calls.push(`context:${kind}`);
            return {
              drawImage: (_image, sx, sy, sw, sh, dx, dy, dw, dh) => {
                calls.push(`draw:${sx},${sy},${sw},${sh}->${dx},${dy},${dw},${dh}`);
              },
              getImageData: (x, y, width, height) => {
                calls.push(`imageData:${x},${y},${width},${height}`);
                return { data: imageData };
              }
            };
          }
        };
      }
    };

    const layer = await decodeBrowserPngLayer(
      { b64Json: encoded("png-bytes"), widthPx: 1, heightPx: 2 },
      runtime
    );

    expect(layer).toEqual({
      widthPx: 1,
      heightPx: 2,
      channels: "rgba8",
      data: imageData
    });
    expect(layer.data).not.toBe(imageData);
    expect(Array.from(layer.data)).toEqual(Array.from(imageData));
    expect(calls).toEqual([
      `decode:${encoded("png-bytes")}`,
      "blob:image/png:137,80,78,71",
      "bitmap:image/png",
      "canvas:1x2",
      "context:2d",
      "draw:0,0,8,8->0,0,1,2",
      "imageData:0,0,1,2",
      "close"
    ]);
  });

  it("throws a decode error when browser decode primitives are unavailable", async () => {
    await expect(
      decodeBrowserPngLayer(
        { b64Json: encoded("png-bytes"), widthPx: 1, heightPx: 1 },
        {
          decodeBase64: () => new Uint8Array([1]),
          makeBlob: (bytes, type) => ({ bytes, type })
        }
      )
    ).rejects.toMatchObject({
      name: "BrowserPngLayerDecodeError",
      message: expect.stringContaining("createImageBitmap")
    });
  });

  it("throws a decode error when the canvas returns non-RGBA dimensions", async () => {
    const runtime: BrowserPngDecodeRuntime = {
      decodeBase64: () => new Uint8Array([1]),
      makeBlob: (bytes, type) => ({ bytes, type }),
      createImageBitmap: async () => ({ width: 1, height: 1 }),
      createCanvas: () => ({
        getContext: () => ({
          drawImage: () => undefined,
          getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3]) })
        })
      })
    };

    await expect(
      decodeBrowserPngLayer({ b64Json: encoded("png-bytes"), widthPx: 1, heightPx: 1 }, runtime)
    ).rejects.toBeInstanceOf(BrowserPngLayerDecodeError);
  });
});
