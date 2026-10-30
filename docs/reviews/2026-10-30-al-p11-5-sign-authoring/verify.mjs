import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p11-5-${api}`, server: { host: "127.0.0.1", port: 0 } });
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
  await page.goto(server.resolvedUrls.local[0] + `#document=sign-author-${api}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initial);
  const storefrontHash = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(storefrontHash);
  const pierHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(pierHash);
  const before = await save("before"), beforeHash = await hash();
  await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click();
  await root().getByRole("alert").filter({ hasText: /shared clearance/ }).waitFor({ timeout: 120000 }); assert.equal(await hash(), beforeHash);
  await page.getByLabel("Sign bay").selectOption("2"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("after"); assert.equal(after.schemaVersion, "0.18.0"); assert.equal(after.graph.storefrontSign.bayIndex, 2);
  assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.graph.awnings, before.graph.awnings); assert.deepEqual(after.materialSource, before.materialSource); assert.deepEqual(after.awningFabric, before.awningFabric);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/authored.png` });
  await page.getByRole("button", { name: "Remove sign", exact: true }).click(); await changed(afterHash); const removed = await save("removed"); assert.deepEqual(removed.graph, before.graph); assert.deepEqual(removed.awningFabric, before.awningFabric);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 }); await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready(); assert.equal(await hash(), afterHash);
  assert.deepEqual(await save("recovered"), after); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), signBay: z.literal(2), collisionRejected: z.literal(true), pierRetained: z.literal(true),
    materialsRetained: z.literal(true), undoRedo: z.literal(true), recovered: z.literal(true) }).strict().parse(
    { schemaVersion: "0.1.0", api, signBay: 2, collisionRejected: true, pierRetained: true, materialsRetained: true, undoRedo: true, recovered: true });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
