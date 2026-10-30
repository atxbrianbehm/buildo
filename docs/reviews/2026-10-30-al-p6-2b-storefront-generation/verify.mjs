import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p6-2b-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst priorGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__groupFamilyCalls = (globalThis.__groupFamilyCalls ?? 0) + 1; return priorGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 180000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 180000 }); await ready(); }
  async function open(label, file) { await page.getByLabel(label).setInputFiles(file); await page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true"), undefined, { timeout: 180000 }); await ready(); }
  async function save(button, name) { const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: button, exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  await page.goto(server.resolvedUrls.local[0] + "#document=grouped-family", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("Open construction file", "docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json");
  const before = await save("Save construction", "before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0);
  assert(before.generation && before.graph.storefrontDivision.displayLights === 2 && before.graph.storefrontDivision.transomLights === 3 && calls > 0);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  assert(await page.getByLabel("Keep edited dimensions and assemblies").isChecked());
  await page.getByRole("button", { name: "Reroll unlocked" }).click(); await changed(beforeHash);
  const after = await save("Save construction", "rerolled");
  assert.deepEqual(after.graph.storefrontDivision, before.graph.storefrontDivision); assert.equal(after.materialSource.contentHash, before.materialSource.contentHash);
  await page.getByRole("button", { name: "Preview family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.members.length, 6); assert.equal(family.schemaVersion, "0.5.0");
  assert(family.members.every(member => JSON.stringify(member.graph.storefrontDivision) === JSON.stringify(before.graph.storefrontDivision)));
  assert.equal(family.materialSource.contentHash, before.materialSource.contentHash);
  await page.getByLabel("Family member").selectOption("1"); await page.getByRole("button", { name: "Edit selected building" }).click();
  await page.getByRole("button", { name: "Back to family" }).waitFor({ timeout: 180000 }); await ready();
  await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  assert.equal(await root().getByLabel("Display lights").inputValue(), "2");
  await root().getByLabel("Transom lights").selectOption("2"); const memberHash = await hash();
  await root().getByRole("button", { name: "Apply construction" }).click(); await changed(memberHash);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/member.png` });
  await page.getByRole("button", { name: "Back to family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  const edited = await save("Save family", "edited");
  assert.equal(edited.members[1].graph.storefrontDivision.transomLights, 2);
  for (const i of [0, 2, 3, 4, 5]) assert.deepEqual(edited.members[i], family.members[i]);
  assert.deepEqual(edited.sourceGraph, family.sourceGraph); assert.equal(edited.materialSource.contentHash, family.materialSource.contentHash);
  await open("Open family file", `${out}/edited.json`);
  const reopened = await save("Save family", "reopened"); assert.deepEqual(reopened, edited);
  assert.equal(await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0), calls); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), members: z.literal(6), rerollRetained: z.literal(true),
    memberEdit: z.literal(true), siblingAndSourceUnchanged: z.literal(true), reopened: z.literal(true), materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), errors: z.array(z.string()).length(0) }).strict().parse({ schemaVersion: "0.1.0", api, members: 6, rerollRetained: true, memberEdit: true, siblingAndSourceUnchanged: true, reopened: true, materialHash: family.materialSource.contentHash, providerCallsDelta: 0, errors });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
