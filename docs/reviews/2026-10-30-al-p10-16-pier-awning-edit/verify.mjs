import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p10-16-${api}`, server: { host: "127.0.0.1", port: 0 } });
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
  await page.goto(server.resolvedUrls.local[0] + `#document=pier-awning-${api}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initial);
  const storefrontHash = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(storefrontHash);
  const before = await save("before"), beforeHash = await hash();
  await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(beforeHash);
  const awningHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(awningHash);
  const supportedHash = await hash(); await page.getByLabel("Awning projection").fill("0.9"); await page.getByRole("button", { name: "Apply awning dimensions" }).click(); await changed(supportedHash);
  const resizedHash = await hash(); await page.getByRole("button", { name: "Remove support rods" }).click(); await changed(resizedHash);
  const noRods = await save("no-rods"); assert.equal(noRods.graph.awningSupports, undefined); assert(noRods.graph.awnings.length === 1 && noRods.graph.facadePiers);
  const noRodsHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(noRodsHash);
  const afterHash = await hash(), after = await save("after"); assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.materialSource, before.materialSource);
  assert.equal(after.graph.awnings[0].projectionM, 0.9);
  assert(after.graph.awnings.length === 1 && after.graph.awningSupports.length === 1 && after.awningFabric);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/edited.png` });
  await page.getByRole("button", { name: "Remove awning" }).click(); await changed(afterHash);
  const removed = await save("removed"); assert.deepEqual(removed.graph.facadePiers, before.graph.facadePiers); assert.equal(removed.graph.awnings, undefined); assert.equal(removed.graph.awningSupports, undefined); assert.deepEqual(removed.awningFabric, after.awningFabric);
  const removedHash = await hash(); await page.getByRole("button", { name: "Undo construction" }).click(); await changed(removedHash); assert.equal(await hash(), afterHash);
  await page.getByLabel("Open construction file").setInputFiles(`${out}/after.json`);
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready();
  const reopened = await save("reopened"); assert.deepEqual(reopened, after); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), pierRetained: z.literal(true),
    awningAndRods: z.literal(true), removedTogether: z.literal(true), materialsRetained: z.literal(true), undo: z.literal(true), reopened: z.literal(true) }).strict().parse(
    { schemaVersion: "0.1.0", api, pierRetained: true, awningAndRods: true, removedTogether: true, materialsRetained: true, undo: true, reopened: true });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
