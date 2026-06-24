import { chromium } from "@playwright/test";
import { createServer } from "vite";

/* global document, HTMLCanvasElement */

let browser;
let server;

try {
  server = await createServer({
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false
    }
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5173/";

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole("heading", { name: "Buildo" }).waitFor({ state: "visible" });
  await page.getByLabel("Project setup status").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Atlas Lab" }).waitFor({ state: "visible" });
  await page.getByRole("img", { name: "baseColor channel" }).waitFor({ state: "visible" });
  await page.getByRole("cell", { name: "wall.primary", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Assembly Hall" }).waitFor({ state: "visible" });
  const assemblyCanvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
  await assemblyCanvas.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    return canvas instanceof HTMLCanvasElement && canvas.dataset.rendered === "true";
  });
  const pixelProbe = await assemblyCanvas.evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      return { ok: false, reason: "No WebGL context was available for the Assembly Hall canvas." };
    }

    const samplePoints = [
      [0.5, 0.5],
      [0.35, 0.42],
      [0.62, 0.46],
      [0.48, 0.68],
      [0.72, 0.34]
    ];
    const pixels = [];
    for (const [xRatio, yRatio] of samplePoints) {
      const pixel = new Uint8Array(4);
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * xRatio)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * yRatio)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      pixels.push(Array.from(pixel));
    }

    const first = pixels[0];
    const variedSamples = pixels.filter((pixel) =>
      pixel.some((channel, index) => Math.abs(channel - first[index]) > 12)
    ).length;
    return {
      ok: variedSamples >= 1,
      variedSamples,
      pixels
    };
  });
  if (!pixelProbe.ok) {
    throw new Error(`Assembly Hall canvas pixel probe failed: ${JSON.stringify(pixelProbe)}`);
  }

  console.log(`E2E smoke passed at ${url}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
