import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3], reuse = process.argv[4] === "reuse"; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p11-16-${api}`, server: { host: "127.0.0.1", port: 0 } });
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
  await page.goto(server.resolvedUrls.local[0] + `#document=sign-first-awning-${api}-${reuse}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const initial = await hash(); await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await page.getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(initial);
  const storefrontHash = await hash(); await page.getByRole("button", { name: "Add facade piers" }).click(); await changed(storefrontHash);
  if (reuse) { const previous = await hash(); await page.getByLabel("Awning bay").selectOption("1"); await page.getByRole("button", { name: "Add awning", exact: true }).click(); await changed(previous); }
  const pierHash = await hash(); await page.getByLabel("Sign bay").selectOption("0"); await page.getByRole("button", { name: "Add sign", exact: true }).click(); await changed(pierHash);
  const before = await save("before"), beforeHash = await hash(); assert.equal(before.schemaVersion, "0.18.0"); assert.equal(Boolean(before.awningFabric), reuse);
  assert(await page.getByLabel("Awning bay").isDisabled()); await page.getByRole("button", { name: "Add awning", exact: true }).click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("after"); assert.equal(after.schemaVersion, "0.19.0"); assert.equal(after.graph.storefrontSign.bayIndex, 0); assert.equal(after.graph.signAwningGapM, 0.04);
  assert.deepEqual(after.graph.storefrontSign, before.graph.storefrontSign); assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.materialSource, before.materialSource); assert(after.awningFabric); assert.equal(after.graph.awnings[0].bayIndex, 0);
  if (reuse) { assert.deepEqual(after.awningFabric, before.awningFabric); assert.deepEqual(after.graph.awnings.find(awning => awning.bayIndex === 1), before.graph.awnings[0]); }
  await page.getByLabel("Awning drop").fill("1.2"); await page.getByLabel("Awning valance height").fill("0.4"); await page.getByRole("button", { name: "Apply awning dimensions" }).click();
  await root().getByRole("alert").filter({ hasText: /ground clearance/ }).waitFor({ timeout: 120000 }); assert.equal(await hash(), afterHash);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/authored.png` });
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 }); await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready(); assert.equal(await hash(), afterHash);
  assert.deepEqual(await save("recovered"), after); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), signBay: z.literal(0), collisionRejected: z.literal(true), pierRetained: z.literal(true),
    materialsRetained: z.literal(true), undoRedo: z.literal(true), recovered: z.literal(true) }).strict().parse(
    { schemaVersion: "0.1.0", api, signBay: 0, collisionRejected: true, pierRetained: true, materialsRetained: true, undoRedo: true, recovered: true });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
