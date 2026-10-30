import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3];
assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p6-2-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__groupProviderCalls = (globalThis.__groupProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  let page = await context.newPage(); const errors = []; const wire = () => page.on("pageerror", error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + "#document=grouped-review", root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function open(file) { await page.getByLabel("Open construction file").setInputFiles(file); await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  async function shot(name) { await page.waitForTimeout(300); await root().locator("canvas:visible").first().screenshot({ path: `${out}/${name}.png` }); }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("test-results/c10-p2-2026-10-29/webgpu-04/raised-v10.json");
  const before = await save("before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__groupProviderCalls ?? 0); assert(calls > 0);
  await shot("before");
  await page.locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await page.getByLabel("Display lights").selectOption("2");
  await page.getByLabel("Transom lights").selectOption("3");
  await page.getByRole("button", { name: "Apply construction" }).click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("divided");
  assert.equal(after.schemaVersion, "0.13.0"); assert.deepEqual(after.graph.storefrontDivision, { displayLights: 2, transomLights: 3 });
  assert.equal(after.materialSource.contentHash, before.materialSource.contentHash);
  assert.equal(await page.evaluate(() => globalThis.__groupProviderCalls ?? 0), calls);
  await shot("divided-textured");
  await page.locator("summary").filter({ hasText: /^Ground floor$/ }).locator("..").screenshot({ path: `${out}/controls.png` });
  await page.locator("summary").filter({ hasText: /^View controls$/ }).click(); await page.locator('select:has(option[value="clay"])').selectOption("clay"); await shot("divided-clay");
  await page.locator('select:has(option[value="clay"])').selectOption("textured"); await page.locator("summary").filter({ hasText: /^View controls$/ }).click();
  const canvas = root().locator("canvas:visible").first(), box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .65); await page.mouse.wheel(0, -400); await page.waitForTimeout(1000); await shot("divided-close");
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.getByLabel("Display lights").selectOption("1"); await page.getByLabel("Transom lights").selectOption("1");
  await page.getByRole("button", { name: "Apply construction" }).click(); await changed(afterHash);
  const resetHash = await hash(), reset = await save("reset"); assert.equal(reset.graph.schemaVersion, "0.11.0"); assert.equal(reset.graph.storefrontDivision, undefined);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(resetHash); assert.equal(await hash(), afterHash);
  await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("0"); await page.getByRole("button", { name: "Apply construction" }).click(); await changed(afterHash);
  const punchedHash = await hash(), punched = await save("punched"); assert.equal(punched.graph.schemaVersion, "0.11.0"); assert.equal(punched.graph.storefrontDivision, undefined);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(punchedHash); assert.equal(await hash(), afterHash);
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  await open(`${out}/divided.json`); assert.equal(await hash(), afterHash); const reopened = await save("reopened"); assert.deepEqual(reopened, after); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), beforeHash: z.string().regex(/^[a-f0-9]{64}$/), afterHash: z.string().regex(/^[a-f0-9]{64}$/), materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), undoRedo: z.literal(true), freshPageOpen: z.literal(true), errors: z.array(z.string()).length(0) }).strict().parse({ schemaVersion: "0.1.0", api, beforeHash, afterHash, materialHash: after.materialSource.contentHash, providerCallsDelta: 0, undoRedo: true, freshPageOpen: true, errors });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
