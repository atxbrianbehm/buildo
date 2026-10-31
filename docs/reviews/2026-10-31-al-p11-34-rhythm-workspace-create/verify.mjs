import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p11-34-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
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
  const generationHash = () => page.getByRole("region", { name: "Building generation" }).getAttribute("data-generation-source");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 180000 }); await ready(); }
  async function generated(before) { await page.waitForFunction(h => { const value = document.querySelector('[aria-label="Building generation"]')?.dataset.generationSource; return value && value !== h; }, before, { timeout: 180000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  const url = server.resolvedUrls.local[0] + `#document=rhythm-workspace-create-${api}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click(); await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initial);
  const storefront = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(storefront);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click(); assert(await page.getByRole("button", { name: "Generate building", exact: true }).isDisabled());
  const signOnly = await hash(); await page.getByRole("button", { name: "Remove sign", exact: true }).click(); await changed(signOnly);
  await page.getByRole("button", { name: "Generate building", exact: true }).click(); await generated(null);
  const generatedHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning", exact: true }).click(); await changed(generatedHash);
  const awningHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(awningHash);
  const rodHash = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(rodHash);
  assert(await page.getByLabel("Material seed").isDisabled()); assert(await page.getByRole("button", { name: "Preview grouped family" }).isEnabled());
  const before = await save("before"), beforeSource = await generationHash(), beforeGraph = await hash(), calls = await page.evaluate(() => globalThis.__signGenerationProviderCalls ?? 0);
  assert(before.generation && before.awningFabric); assert.equal(before.graph.signAwningGapM, 0.04);
  await page.getByLabel("Lock openings").check(); await page.getByRole("button", { name: "Preview grouped family" }).click();
  await root().getByRole("alert").filter({ hasText: /Unlock openings/ }).waitFor({ timeout: 180000 }); assert.equal(await hash(), beforeGraph);
  await page.getByLabel("Lock openings").uncheck();
  await page.getByRole("button", { name: "Preview grouped family" }).click();
  await page.getByText("Archived family preview is read-only.", { exact: false }).waitFor({ timeout: 180000 });
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: "Save family" }).click();
  await (await download).saveAs(`${out}/family.json`); const archive = JSON.parse(await readFile(`${out}/family.json`, "utf8"));
  assert.equal(archive.kind, "construction-grouped-rhythm-family-archive"); assert.equal(archive.result.members.length, 6);
  assert.deepEqual(archive.request.sourceProject.graph, before.graph); assert.deepEqual(archive.request.sourceProject.materialSource, before.materialSource);
  assert.deepEqual(archive.request.sourceProject.awningFabric, before.awningFabric); assert.equal(await page.evaluate(() => globalThis.__signGenerationProviderCalls ?? 0), calls);
  await page.getByRole("button", { name: "Return to building" }).click(); await ready(); assert.equal(await hash(), beforeGraph); assert.equal(await generationHash(), beforeSource);
  await page.getByLabel("Open family file").setInputFiles(`${out}/family.json`);
  await page.getByText("Archived family preview is read-only.", { exact: false }).waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Return to building" }).click(); await ready(); assert.equal(await hash(), beforeGraph); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, created: true, exported: true, reopened: true, sourceRetained: true, materialCalls: 0 })); await context.close();
} finally { await browser?.close(); await server.close(); }
