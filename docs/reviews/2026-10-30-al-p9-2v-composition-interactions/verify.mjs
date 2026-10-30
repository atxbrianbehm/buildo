import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3], retainFabric = process.argv.includes("fabric"), varyMassing = process.argv.includes("massing"); assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p9-2u-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst priorGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__entranceCalls = (globalThis.__entranceCalls ?? 0) + 1; return priorGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  const hash = () => root().getAttribute("data-construction-hash");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 180000 }); await ready(); }
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 180000 });
  async function open(label, file) { await page.getByLabel(label).setInputFiles(file); await page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true"), undefined, { timeout: 180000 }); await ready(); }
  async function save(button, name) { const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: button, exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  await page.goto(server.resolvedUrls.local[0] + "#document=entrance-family", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("Open construction file", "docs/reviews/2026-10-30-al-p6-2c-storefront-family/webgl-01/before.json");
  if (retainFabric) {
    let previous = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(previous);
    previous = await hash(); await page.getByRole("button", { name: "Remove awning" }).click(); await changed(previous);
  }
  const before = await save("Save construction", "before"), calls = await page.evaluate(() => globalThis.__entranceCalls ?? 0);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  await page.getByLabel("Entrance position").check();
  await page.getByLabel("Cornice and parapet").check();
  await page.getByLabel("Opening heads and sash").check();
  await page.getByRole("checkbox", { name: "Grouped upper windows" }).check();
  await page.getByLabel("Storefront pane divisions").check();
  if (varyMassing) await page.getByLabel("Storey and bay counts").check();
  await page.getByRole("button", { name: "Preview family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family" || document.querySelector('.construction-workspace:not([hidden]) [role="alert"]'), undefined, { timeout: 180000 });
  const alert = root().getByRole("alert"); if (await alert.count()) throw new Error(await alert.innerText()); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.schemaVersion, "0.12.0"); assert.equal(family.initialComposition.schemaVersion, "0.6.0");
  const bays = family.members.map(member => member.graph.nodes.find(node => node.type === "PlaceDoor").parameters.bayIndex);
  const heads = family.members.map(member => member.graph.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead);
  const sashes = family.members.map(member => member.graph.nodes.find(node => node.type === "AssembleWindow").parameters.layout);
  const groups = family.members.map(member => member.graph.upperBayGroups?.[0]?.memberCount ?? 0);
  const lights = family.members.map(member => member.graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 });
  const floors = family.members.map(member => member.graph.nodes.find(node => node.type === "Storeys").parameters.count);
  assert.deepEqual([...new Set(heads)].sort(), [0, 1]); assert.equal(new Set(sashes).size, 3); assert.deepEqual([...new Set(groups)].sort(), [0, 2, 3]); assert.equal(new Set(lights.map(value => JSON.stringify(value))).size, 6);
  assert(new Set(bays).size > 1); assert(family.members.some(member => member.graph.upperBayGroups?.length)); assert(family.members.some(member => member.graph.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead === 1)); if (varyMassing) assert(new Set(family.members.map(member => member.graph.nodes.find(node => node.type === "Storeys").parameters.count)).size > 1); assert.deepEqual(family.materialSource, before.materialSource); assert.equal(Boolean(family.awningFabric), retainFabric); if (retainFabric) assert.deepEqual(family.awningFabric, before.awningFabric);
  await page.getByLabel("Family member").selectOption("1"); await page.getByRole("button", { name: "Edit selected building" }).click();
  await page.getByRole("button", { name: "Back to family" }).waitFor({ timeout: 180000 }); await ready();
  await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  const selectedBay = (bays[1] + 1) % family.members[1].graph.nodes.find(node => node.type === "SplitBays").parameters.count;
  await root().getByLabel("Entrance bay").selectOption(String(selectedBay)); const previousHash = await hash();
  await root().getByRole("button", { name: "Apply construction" }).click(); await changed(previousHash);
  if (retainFabric) {
    const previous = await hash(); await root().getByLabel("Awning bay").selectOption("0"); await root().getByRole("button", { name: "Add awning" }).click(); await changed(previous);
  }
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/member.png` });
  await page.getByRole("button", { name: "Back to family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  if (retainFabric) {
    await page.getByLabel("Family fabric pattern").selectOption("solid"); await page.getByLabel("Family fabric primary color").fill("#992f2a");
    await page.getByRole("button", { name: "Apply individual fabric" }).click();
    await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 180000 }); await ready();
  }
  const returned = await save("Save family", "returned");
  if (retainFabric) { assert.equal(returned.schemaVersion, "0.12.0"); assert.equal(returned.fabricAssignments.members[1].mode, "override"); assert.deepEqual(returned.awningFabric, family.awningFabric); assert.equal(returned.members[1].graph.awnings.length, 1); }
  assert.equal(returned.members[1].graph.nodes.find(node => node.type === "PlaceDoor").parameters.bayIndex, selectedBay);
  for (const index of [0, 2, 3, 4, 5]) assert.deepEqual(returned.members[index], family.members[index]);
  assert.deepEqual(returned.sourceGraph, family.sourceGraph); assert.deepEqual(returned.initialComposition, family.initialComposition); assert.deepEqual(returned.materialSource, family.materialSource);
  await open("Open family file", `${out}/returned.json`); const reopened = await save("Save family", "reopened"); assert.deepEqual(reopened, returned);
  assert.equal(await page.evaluate(() => globalThis.__entranceCalls ?? 0), calls); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), entranceBays: z.array(z.number().int().nonnegative()).length(6), heads: z.array(z.number()).length(6), sashes: z.array(z.number()).length(6), groups: z.array(z.number()).length(6), lights: z.array(z.object({ displayLights: z.number(), transomLights: z.number() }).strict()).length(6), floors: z.array(z.number()).length(6), materialPreserved: z.literal(true), memberEdit: z.literal(true), siblingsUnchanged: z.literal(true), reopened: z.literal(true), providerCallsDelta: z.literal(0), retainedFabric: z.boolean(), varyMassing: z.boolean() }).strict().parse({ schemaVersion: "0.1.0", api, entranceBays: bays, heads, sashes, groups, lights, floors, materialPreserved: true, memberEdit: true, siblingsUnchanged: true, reopened: true, providerCallsDelta: 0, retainedFabric: retainFabric, varyMassing });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
