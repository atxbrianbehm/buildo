import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p10-15-${api}`, server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  await page.goto(server.resolvedUrls.local[0] + `#document=pier-group-${api}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(initial);
  const before = await save("before"), beforeHash = await hash();
  const arrangement = page.getByLabel("Grouped window arrangement"); assert(await arrangement.isEnabled());
  await arrangement.selectOption("2"); await page.getByLabel("Grouped window width").fill("0.55");
  await page.getByRole("button", { name: "Apply window arrangement" }).click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("after"); assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.materialSource, before.materialSource);
  assert.equal(after.graph.upperBayGroups[0].memberCount, 2); assert.equal(after.graph.upperBayGroups[0].memberWidthM, 0.55);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/edited.png` });
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.getByLabel("Open construction file").setInputFiles(`${out}/after.json`);
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready();
  const reopened = await save("reopened"); assert.deepEqual(reopened, after); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), pierRetained: z.literal(true),
    memberCount: z.literal(2), materialsRetained: z.literal(true), undoRedo: z.literal(true), reopened: z.literal(true) }).strict().parse(
    { schemaVersion: "0.1.0", api, pierRetained: true, memberCount: 2, materialsRetained: true, undoRedo: true, reopened: true });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
