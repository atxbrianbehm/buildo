import { chromium } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { createServer } from "vite";

/* global document, HTMLCanvasElement */

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function decodePng(buffer) {
  for (let index = 0; index < pngSignature.length; index += 1) {
    if (buffer[index] !== pngSignature[index]) {
      throw new Error("Screenshot probe expected a PNG image.");
    }
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format for screenshot probe: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  let inputOffset = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const current = new Uint8Array(stride);

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 0) {
        current[x] = raw;
      } else if (filter === 1) {
        current[x] = (raw + left) & 0xff;
      } else if (filter === 2) {
        current[x] = (raw + up) & 0xff;
      } else if (filter === 3) {
        current[x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        current[x] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter type: ${filter}`);
      }
    }

    inputOffset += stride;
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = current[source];
      pixels[target + 1] = current[source + 1];
      pixels[target + 2] = current[source + 2];
      pixels[target + 3] = channels === 4 ? current[source + 3] : 255;
    }
    previous = current;
  }

  return { width, height, pixels };
}

function screenshotPixelProbe(buffer) {
  const image = decodePng(buffer);
  const pixels = [];

  for (const yRatio of [0.25, 0.4, 0.55, 0.7]) {
    for (const xRatio of [0.25, 0.4, 0.55, 0.7]) {
      const x = Math.max(0, Math.min(image.width - 1, Math.floor(image.width * xRatio)));
      const y = Math.max(0, Math.min(image.height - 1, Math.floor(image.height * yRatio)));
      const offset = (y * image.width + x) * 4;
      pixels.push(Array.from(image.pixels.slice(offset, offset + 4)));
    }
  }

  const opaquePixels = pixels.filter((pixel) => pixel[3] > 16);
  const first = opaquePixels[0] ?? pixels[0];
  const variedSamples = opaquePixels.filter((pixel) =>
    pixel.some((channel, index) => index < 3 && Math.abs(channel - first[index]) > 12)
  ).length;

  return {
    ok: opaquePixels.length >= 4 && variedSamples >= 1,
    variedSamples,
    opaqueSamples: opaquePixels.length,
    pixels
  };
}

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
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page.getByLabel("Roof Type").selectOption("gable");
  await page.getByLabel("Invalidation preview").getByText("roofType").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("Material sources reusable").waitFor({ state: "visible" });
  await page.getByLabel("Trim Density").selectOption("moderate");
  await page.getByLabel("Material Seed").fill("material-seed-smoke");
  await page.getByLabel("Trim Seed").fill("trim-seed-smoke");
  await page.getByLabel("Invalidation preview").getByText("trimDensity").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("materialSeed").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("trimSeed").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("Material sources regenerate").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Run Current" }).click();
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Atlas Lab" }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Artifact Trace" }).waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Registered artifacts" })
    .getByRole("cell", { name: "runtime-building-ir", exact: true })
    .first()
    .waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Run event artifact trace" })
    .getByRole("cell", { name: /^packed-atlas:/ })
    .first()
    .waitFor({ state: "visible" });
  await page.getByRole("img", { name: "baseColor channel" }).waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Semantic Slots" })
    .getByRole("cell", { name: "wall.primary", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Component Forge" }).waitFor({ state: "visible" });
  const componentSelector = page.getByRole("combobox", { name: "Component selector" });
  await componentSelector.selectOption("component-gallery.recipe.window.tall-arched.frame");
  const forgeRecipe = page.getByLabel("Selected component recipe");
  await forgeRecipe.getByText("Window frame").waitFor({ state: "visible" });
  const forgeAtlasSlots = page.getByRole("table", { name: "Selected atlas slots" });
  await forgeAtlasSlots.getByRole("cell", { name: "glass.primary", exact: true }).waitFor({ state: "visible" });
  await forgeAtlasSlots.getByRole("cell", { name: "frame.primary", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Lock selected component" }).click();
  await page
    .getByLabel("Component lock status")
    .getByText("recipe.window.tall-arched.frame")
    .waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("localComponentLock").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("branchOrFullMvp").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "New Building" }).click();
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page
    .getByLabel("Component lock status")
    .getByText("recipe.window.tall-arched.frame")
    .waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Assembly Hall" }).waitFor({ state: "visible" });
  await page.getByRole("combobox", { name: "Reveal through stage" }).selectOption("facade");
  await page.getByLabel("Assembly stage visibility").getByText("openings").waitFor({ state: "visible" });
  await page.getByLabel("Assembly stage visibility").getByText("hidden").first().waitFor({ state: "visible" });
  const semanticElementSelect = page.getByRole("combobox", { name: "Semantic element" });
  await semanticElementSelect.waitFor({ state: "visible" });
  const windowOptionValue = await semanticElementSelect
    .locator("option", { hasText: "openings / Window frame / #0" })
    .first()
    .getAttribute("value");
  if (!windowOptionValue) {
    throw new Error("Assembly Hall semantic selection smoke could not find the Window frame option.");
  }
  await semanticElementSelect.selectOption(windowOptionValue);
  const selectedSemanticElement = page.locator('[aria-label="Selected semantic element"]');
  await selectedSemanticElement.getByText("instances.window").waitFor({ state: "visible" });
  await selectedSemanticElement.getByText("glass.primary").waitFor({ state: "visible" });
  await selectedSemanticElement.getByText("InstancedMesh").waitFor({ state: "visible" });
  const assemblyCanvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
  await assemblyCanvas.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    return (
      canvas instanceof HTMLCanvasElement &&
      canvas.dataset.rendered === "true" &&
      canvas.dataset.revealThroughStage === "facade" &&
      !!canvas.dataset.rendererBackend
    );
  });
  const activeBackend = await assemblyCanvas.getAttribute("data-renderer-backend");
  if (activeBackend !== "webgpu" && activeBackend !== "webgl") {
    throw new Error(`Unexpected Assembly Hall renderer backend: ${activeBackend}`);
  }
  await page
    .getByLabel("Assembly Hall renderer metrics")
    .getByText(`${activeBackend} active`)
    .waitFor({ state: "visible" });
  await assemblyCanvas.scrollIntoViewIfNeeded();
  const pixelProbe =
    activeBackend === "webgpu"
      ? screenshotPixelProbe(
          await page.screenshot({
            clip: await assemblyCanvas.boundingBox()
          })
        )
      : await assemblyCanvas.evaluate((canvas) => {
          const samplePoints = [
            [0.5, 0.5],
            [0.35, 0.42],
            [0.62, 0.46],
            [0.48, 0.68],
            [0.72, 0.34]
          ];
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (!gl) {
            return { ok: false, reason: "No WebGL context was available for the Assembly Hall canvas." };
          }
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
