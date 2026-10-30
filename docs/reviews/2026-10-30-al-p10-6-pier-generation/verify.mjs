import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: `test-results/al-p10-6-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__awningProviderCalls = (globalThis.__awningProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  let page = await context.newPage(), errors = []; const wire = () => page.on("pageerror", error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + `#document=pier-generation-${api}`, root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function open(file) { await page.getByLabel("Open construction file").setInputFiles(file); await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json");
  const initialHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(initialHash);
  const awningHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(awningHash);
  const supportHash = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(supportHash);
  const before = await save("before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__awningProviderCalls ?? 0);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  assert(await page.getByLabel("Keep edited dimensions and assemblies").isChecked());
  await page.getByRole("button", { name: "Reroll unlocked" }).click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("rerolled"); assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.graph.awnings, before.graph.awnings); assert.deepEqual(after.graph.awningSupports, before.graph.awningSupports); assert.deepEqual(after.awningFabric, before.awningFabric); assert.deepEqual(after.materialSource, before.materialSource);
  assert.equal(await page.evaluate(() => globalThis.__awningProviderCalls ?? 0), calls);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/rerolled.png` });
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  assert(await page.getByRole("button", { name: "Preview family" }).isDisabled());
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 });
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await hash(), afterHash); assert.deepEqual(await save("recovered"), after);
  await open(`${out}/rerolled.json`); assert.equal(await hash(), afterHash); assert.deepEqual(await save("reopened"), after); assert.deepEqual(errors, []);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  const freshCalls = await page.evaluate(() => globalThis.__awningProviderCalls ?? 0);
  await page.getByLabel("Keep edited dimensions and assemblies").uncheck();
  await page.getByRole("button", { name: "Reroll unlocked" }).click(); await changed(afterHash);
  const released = await save("released"); assert.equal(released.graph.facadePiers, undefined); assert.equal(released.graph.awnings, undefined);
  assert.deepEqual(released.awningFabric, before.awningFabric); assert.deepEqual(released.materialSource, before.materialSource);
  assert.equal(await page.evaluate(() => globalThis.__awningProviderCalls ?? 0), freshCalls);
  console.log(JSON.stringify({ api, beforeHash, afterHash, fabricHash: after.awningFabric.contentHash, atlasHash: after.materialSource.contentHash, providerCallsDelta: 0, undoRedo: true, recovered: true, reopened: true }));
  await context.close();
} finally { await browser?.close(); await server.close(); }
