import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: `test-results/al-p9-2l-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__awningProviderCalls = (globalThis.__awningProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  let page = await context.newPage(), errors = []; const wire = () => page.on("pageerror", error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + `#document=support-authoring-${api}`, root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function open(file) { await page.getByLabel("Open construction file").setInputFiles(file); await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json");
  const initial = await save("initial"), initialHash = await hash(), calls = await page.evaluate(() => globalThis.__awningProviderCalls ?? 0);
  await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(initialHash);
  const firstHash = await hash(), first = await save("first"); assert.equal(first.graph.awnings.length, 1); assert.equal(first.graph.awnings[0].bayIndex, 0);
  await page.getByLabel("Awning bay").selectOption("1"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(firstHash);
  const secondHash = await hash(), second = await save("second"); assert.deepEqual(second.graph.awnings.map(x => x.bayIndex), [0, 1]); assert.deepEqual(second.awningFabric, first.awningFabric); assert.deepEqual(second.materialSource, initial.materialSource);
  await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(secondHash);
  const supportedHash = await hash(), supported = await save("supported"); assert.equal(supported.schemaVersion, "0.16.0"); assert.deepEqual(supported.graph.awningSupports.map(x => x.bayIndex), [0]);
  assert.deepEqual(supported.graph.awnings, second.graph.awnings); assert.deepEqual(supported.awningFabric, second.awningFabric); assert.deepEqual(supported.materialSource, second.materialSource);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/supported.png` });
  await page.getByLabel("Awning projection").fill("1.2"); await page.getByRole("button", { name: "Apply awning dimensions" }).click(); await changed(supportedHash);
  const editedHash = await hash(), edited = await save("edited"); assert.deepEqual(edited.graph.awningSupports, supported.graph.awningSupports);
  await page.getByRole("button", { name: "Remove awning" }).click(); await changed(editedHash);
  const removedHash = await hash(), removed = await save("removed"); assert.equal(removed.schemaVersion, "0.15.0"); assert.equal(removed.graph.awningSupports, undefined); assert.deepEqual(removed.graph.awnings, [second.graph.awnings[1]]);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(removedHash); assert.equal(await hash(), editedHash);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(editedHash); assert.equal(await hash(), supportedHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(supportedHash); assert.equal(await hash(), editedHash);
  await page.getByRole("button", { name: "Remove support rods" }).click(); await changed(editedHash);
  const noSupportHash = await hash(), noSupport = await save("no-support"); assert.equal(noSupport.graph.awningSupports, undefined); assert.equal(noSupport.graph.awnings.length, 2);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(noSupportHash); assert.equal(await hash(), editedHash);
  assert.equal(await page.evaluate(() => globalThis.__awningProviderCalls ?? 0), calls);
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 });
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await hash(), editedHash); assert.deepEqual(await save("recovered"), edited); await open(`${out}/edited.json`); assert.deepEqual(await save("reopened"), edited); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, supported: true, dimensionRetained: true, removedWithAwning: true, independentRemoval: true, undoRedo: true, recovered: true, reopened: true, providerCallsDuringEdit: 0 })); await context.close();
} finally { await browser?.close(); await server.close(); }
