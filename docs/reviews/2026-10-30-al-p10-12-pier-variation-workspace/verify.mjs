import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p10-8-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
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
  await page.goto(server.resolvedUrls.local[0] + "#document=pier-family-workspace", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("Open construction file", "docs/reviews/2026-10-30-al-p9-2u-entrance-workspace/webgl-combined-02/before.json");
  const initialHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(initialHash);
  const awningHash = await hash(); await page.getByRole("button", { name: "Add support rods" }).click(); await changed(awningHash);
  const before = await save("Save construction", "before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0);
  assert(before.generation && before.graph.awnings.length === 1 && calls > 0);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  assert(await page.getByLabel("Keep edited dimensions and assemblies").isChecked());
  await page.getByRole("button", { name: "Reroll unlocked" }).click(); await changed(beforeHash);
  const after = await save("Save construction", "rerolled"); assert.deepEqual(after.graph.facadePiers, before.graph.facadePiers); assert.deepEqual(after.graph.awnings, before.graph.awnings); assert.deepEqual(after.graph.awningSupports, before.graph.awningSupports); assert.deepEqual(after.awningFabric, before.awningFabric);
  await page.getByLabel("Additional storefront awnings").check();
  await page.getByRole("checkbox", { name: "Upper facade piers", exact: true }).check();
  await page.getByRole("button", { name: "Preview family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family" || document.querySelector('.construction-workspace:not([hidden]) [role="alert"]'), undefined, { timeout: 180000 });
  const alert = root().getByRole("alert"); if (await alert.count()) throw new Error(await alert.innerText()); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.members.length, 6); assert.equal(family.schemaVersion, "0.14.0"); assert.equal(family.initialComposition.schemaVersion, "0.5.0");
  assert(family.members.every(member => JSON.stringify(member.graph.awningSupports) === JSON.stringify(before.graph.awningSupports)));
  assert(family.members.every(member => JSON.stringify(member.graph.awnings.find(awning => awning.bayIndex === 0)) === JSON.stringify(before.graph.awnings[0]))); assert.deepEqual([...new Set(family.members.map(member => member.graph.awnings.length))].sort(), [1, 2, 3]); assert.deepEqual(family.awningFabric, before.awningFabric); assert.deepEqual(family.materialSource, before.materialSource);
  assert.equal(family.members.filter(member => member.graph.facadePiers).length, 4);
  const targetIndex = family.members.findIndex(member => !member.graph.facadePiers); assert(targetIndex >= 0);
  await page.getByLabel("Family member").selectOption(String(targetIndex)); await page.getByRole("button", { name: "Edit selected building" }).click();
  await page.getByRole("button", { name: "Back to family" }).waitFor({ timeout: 180000 }); await ready();
  const memberHash = await hash(); await root().locator("summary").filter({ hasText: /^Shape$/ }).click();
  const width = root().getByLabel("Width (m)").first(), initialWidth = Number(await width.inputValue()); await width.fill(String(initialWidth + 1));
  await root().getByRole("button", { name: "Apply construction" }).first().click(); await changed(memberHash);
  const editedHash = await hash(); await root().getByRole("button", { name: "Add facade piers" }).click(); await changed(editedHash);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/member.png` });
  await page.getByRole("button", { name: "Back to family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  await page.getByLabel("Family fabric pattern").selectOption("solid"); await page.getByLabel("Family fabric primary color").fill("#992f2a");
  await page.getByRole("button", { name: "Apply individual fabric" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 180000 }); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/edited-family.png` });
  const edited = await save("Save family", "edited"); assert.equal(edited.schemaVersion, "0.14.0");
  assert.equal(edited.fabricAssignments.members[targetIndex].mode, "override"); assert(edited.members[targetIndex].graph.facadePiers); assert.deepEqual(edited.members[targetIndex].graph.awningSupports, family.members[targetIndex].graph.awningSupports);
  assert.equal(edited.members[targetIndex].graph.nodes.find(node => node.type === "Footprint").parameters.widthM, initialWidth + 1);
  assert.deepEqual(edited.awningFabric, family.awningFabric);
  for (const i of [0, 1, 2, 3, 4, 5].filter(value => value !== targetIndex)) assert.deepEqual(edited.members[i], family.members[i]);
  assert.deepEqual(edited.initialPierVariation, family.initialPierVariation);
  assert.deepEqual(edited.sourceGraph, family.sourceGraph); assert.deepEqual(edited.materialSource, family.materialSource);
  await open("Open family file", `${out}/edited.json`); const reopened = await save("Save family", "reopened"); assert.deepEqual(reopened, edited);
  assert.equal(await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0), calls); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), members: z.literal(6), retained: z.literal(true), supportsRetained: z.literal(true), variedCounts: z.tuple([z.literal(1), z.literal(2), z.literal(3)]), memberEdit: z.literal(true), memberPierAdded: z.literal(true), individualFabric: z.literal(true), siblingsUnchanged: z.literal(true), reopened: z.literal(true), fabricHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0) }).strict().parse({ schemaVersion: "0.1.0", api, members: 6, retained: true, supportsRetained: true, variedCounts: [1, 2, 3], memberEdit: true, memberPierAdded: true, individualFabric: true, siblingsUnchanged: true, reopened: true, fabricHash: family.awningFabric.contentHash, providerCallsDelta: 0 });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
