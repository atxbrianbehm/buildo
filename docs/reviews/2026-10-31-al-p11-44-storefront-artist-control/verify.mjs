import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p11-44-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst priorGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__signGenerationProviderCalls = (globalThis.__signGenerationProviderCalls ?? 0) + 1; return priorGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 180000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 180000 }); await ready(); }
  async function generated(before) { await page.waitForFunction(h => { const value = document.querySelector('[aria-label="Building generation"]')?.dataset.generationSource; return value && value !== h; }, before, { timeout: 180000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  const url = server.resolvedUrls.local[0] + `#document=storefront-control-${api}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click(); await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initial);
  const storefront = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(storefront);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click(); assert(await page.getByRole("button", { name: "Generate building", exact: true }).isDisabled());
  const signOnly = await hash(); await page.getByRole("button", { name: "Remove sign", exact: true }).click(); await changed(signOnly);
  await page.getByRole("button", { name: "Generate building", exact: true }).click(); await generated(null);
  const beforePiers = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(beforePiers);
  const generatedHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning", exact: true }).click(); await changed(generatedHash);
  const awningHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(awningHash);
  const rodHash = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(rodHash);
  assert(await page.getByLabel("Material seed").isDisabled()); assert(await page.getByRole("button", { name: "Preview grouped family" }).isEnabled());
  const before = await save("before"), beforeGraph = await hash(), calls = await page.evaluate(() => globalThis.__signGenerationProviderCalls ?? 0);
  assert(before.graph.storefrontSign && before.graph.awnings && before.graph.awningSupports && before.graph.facadePiers);
  await page.getByLabel("Display lights").selectOption("2");
  await page.getByLabel("Transom lights").selectOption("3");
  await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(beforeGraph);
  const afterHash = await hash(), after = await save("after");
  assert.deepEqual(after.graph.storefrontDivision, { displayLights: 2, transomLights: 3 });
  for (const field of ["storefrontSign", "awnings", "awningSupports", "facadePiers", "signAwningGapM"]) assert.deepEqual(after.graph[field], before.graph[field]);
  assert.deepEqual(after.materialSource, before.materialSource); assert.deepEqual(after.awningFabric, before.awningFabric);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/after.png` });
  await page.getByRole("button", { name: "Undo construction" }).first().click(); await changed(afterHash); assert.equal(await hash(), beforeGraph);
  await page.getByRole("button", { name: "Redo construction" }).first().click(); await changed(beforeGraph); assert.equal(await hash(), afterHash);
  await page.getByLabel("Open construction file").setInputFiles(`${out}/after.json`); await ready();
  assert.equal(await hash(), afterHash); assert.equal(await page.getByLabel("Display lights").inputValue(), "2"); assert.equal(await page.getByLabel("Transom lights").inputValue(), "3");
  const reopened = await save("reopened"); assert.deepEqual(reopened.graph, after.graph); assert.deepEqual(reopened.materialSource, before.materialSource);
  assert.equal(await page.evaluate(() => globalThis.__signGenerationProviderCalls ?? 0), calls); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, divisions: true, piers: true, sign: true, awning: true, supports: true, undoRedo: true, reopened: true, materialCalls: 0 })); await context.close();
} finally { await browser?.close(); await server.close(); }
