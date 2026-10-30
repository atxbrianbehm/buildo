import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const [api, mode, out] = process.argv.slice(2);
assert(["webgpu", "webgl"].includes(api) && ["before", "after"].includes(mode) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p8-vite-${api}-${mode}`, plugins: [{ name: "sill-negative-control", enforce: "pre", transform(code, id) {
  const path = id.replaceAll("\\", "/");
  if (mode === "before" && path.endsWith("/compiler/evaluateBayConstruction.ts")) {
    const old = code; code = code.replace('...(options.metricTimberUvs && options.closedOpeningTrim ? [buildConstructionSillSeat(opening.widthM, opening.centerYM - opening.heightM / 2, recessM)] : [])', '...[]');
    assert.notEqual(code, old, "Negative control must remove the actual regular seat");
  }
  if (mode === "before" && path.endsWith("/compiler/evaluateFacadeConstruction.ts")) {
    const old = code; code = code.replace(', buildConstructionSillSeat(opening.widthM, sillM, p.recessM)', '');
    assert.notEqual(code, old, "Negative control must remove the actual round seat");
  }
  if (path.endsWith("/ui/bayConstructionFixture.ts")) return { code: code.replace("    return fixture;", "    (globalThis.__sillFixtures ??= []).push(fixture); return fixture;"), map: null };
  if (path.endsWith("/renderer-three/assemblyRendererFactory.ts")) {
    const observer = `const observedRender = renderer.render.bind(renderer); renderer.render = (scene, camera) => { observedRender(scene, camera); if (camera.isPerspectiveCamera) globalThis.__sillCamera = camera; };`;
    return { code: code.replace("  configurable.outputColorSpace = SRGBColorSpace;", observer + "\n  configurable.outputColorSpace = SRGBColorSpace;"), map: null };
  }
  return { code, map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible"), ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  await page.goto(server.resolvedUrls.local[0] + "#document=sill-seat-review", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  await page.getByLabel("Open construction file").setInputFiles("test-results/c10-p2-2026-10-29/webgpu-04/raised-v10.json");
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready();
  const canvas = root().locator("canvas:visible").first(); assert.equal(await canvas.getAttribute("data-renderer-backend"), api);
  const point = await page.evaluate(() => {
    const root = document.querySelector('.construction-workspace:not([hidden])');
    const fixture = globalThis.__sillFixtures.findLast(item => item.ir.sourceGraphHash === root.dataset.constructionHash && !item.familyRuntime.disposed);
    const glass = [...fixture.buildingRuntime.semanticLookup.values()].find(entry => entry.semanticPath.endsWith('/facade/floor/2/bay/1/glass'));
    if (!glass) throw new Error("Regular-window glass is missing.");
    const object = glass.object, positions = object.geometry.getAttribute('position'), low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.count; i++) for (let c = 0; c < 3; c++) { const v = positions.array[i * 3 + c]; low[c] = Math.min(low[c], v); high[c] = Math.max(high[c], v); }
    const center = object.position.clone().set(low[0] + (high[0] - low[0]) * .3, low[1] + (high[1] - low[1]) * .83, (low[2] + high[2]) / 2);
    object.updateWorldMatrix(true, false);
    if (object.isInstancedMesh) { const matrix = object.matrixWorld.clone(); object.getMatrixAt(glass.instanceIndex ?? glass.elementIndex, matrix); center.applyMatrix4(matrix); }
    center.applyMatrix4(object.matrixWorld).project(globalThis.__sillCamera);
    const rect = root.querySelector('canvas').getBoundingClientRect(); return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Focus frame", exact: true }).click(); await page.waitForTimeout(1300); await ready();
  await canvas.click({ position: { x: 5, y: 5 } }); await ready();
  await canvas.screenshot({ path: `${out}/textured.png` });
  const camera = await page.evaluate(() => ({ position: globalThis.__sillCamera.position.toArray(), inverse: globalThis.__sillCamera.matrixWorldInverse.toArray(), projection: globalThis.__sillCamera.projectionMatrix.toArray() }));
  await page.locator("summary").filter({ hasText: /^View controls$/ }).click(); await page.locator('select:has(option[value="clay"])').selectOption("clay"); await page.waitForTimeout(500);
  await canvas.screenshot({ path: `${out}/clay.png` });
  const file = JSON.parse(await readFile("test-results/c10-p2-2026-10-29/webgpu-04/raised-v10.json", "utf8"));
  assert.deepEqual(errors, []); await writeFile(`${out}/receipt.json`, JSON.stringify({ schemaVersion: "0.1.0", api, mode, camera, sourceHash: file.contentHash, errors }, null, 2));
  await context.close();
} finally { await browser?.close(); await server.close(); }
