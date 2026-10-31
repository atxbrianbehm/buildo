import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: `test-results/al-p11-19-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__awningProviderCalls = (globalThis.__awningProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  let page = await context.newPage(), errors = []; const wire = () => page.on("pageerror", error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + `#document=combined-fabric-${api}`, root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function open(file) { await page.getByLabel("Open construction file").setInputFiles(file); await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initialHash = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initialHash);
  const storefrontHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(storefrontHash);
  const firstHash = await hash(), first = await save("first"); assert.equal(first.graph.awnings.length, 1); assert.equal(first.graph.awnings[0].bayIndex, 0);
  await page.getByRole("button", { name: "Add support rods" }).click(); await changed(firstHash);
  const rodHash = await hash(); await page.getByLabel("Awning bay").selectOption("1"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(rodHash);
  const secondHash = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(secondHash);
  const second = await save("second"), calls = await page.evaluate(() => globalThis.__awningProviderCalls ?? 0); assert.deepEqual(second.graph.awnings.map(x => x.bayIndex), [0, 1]); assert.deepEqual(second.awningFabric, first.awningFabric); assert.deepEqual(second.materialSource, first.materialSource); assert.equal(second.graph.signAwningGapM, 0.04);
  await page.getByLabel("Awning fabric pattern").selectOption("solid");
  await page.getByLabel("Awning primary color").fill("#992f2a");
  await page.getByRole("button", { name: "Apply awning fabric" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready();
  const solid = await save("solid"); assert.equal(solid.awningFabric.source.pattern, "solid"); assert.deepEqual(solid.awningFabric.source.primary, [153,47,42]);
  assert.deepEqual(solid.graph, second.graph); assert.deepEqual(solid.materialSource, second.materialSource); assert.notEqual(solid.awningFabric.contentHash, second.awningFabric.contentHash);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/solid.png` });
  await page.getByLabel("Awning fabric pattern").selectOption("striped"); await page.getByLabel("Awning primary color").fill("#e5d7b6"); await page.getByLabel("Awning stripe color").fill("#315a86");
  await page.getByRole("button", { name: "Apply awning fabric" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready();
  const striped = await save("striped"); assert.equal(striped.awningFabric.source.pattern, "striped"); assert.deepEqual(striped.awningFabric.source.secondary, [49,90,134]);
  assert.deepEqual(striped.graph, second.graph); assert.deepEqual(striped.materialSource, second.materialSource);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/striped.png` });
  await page.getByRole("region", { name: "Storefront awnings" }).screenshot({ path: `${out}/controls.png` });
  assert.equal(await page.evaluate(() => globalThis.__awningProviderCalls ?? 0), calls);
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 });
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.deepEqual(await save("recovered"), striped); await open(`${out}/striped.json`); assert.deepEqual(await save("reopened"), striped); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, solid: true, striped: true, unchangedGraph: true, unchangedAtlas: true, recovered: true, reopened: true, providerCallsDuringEdit: 0 })); await context.close();
} finally { await browser?.close(); await server.close(); }
