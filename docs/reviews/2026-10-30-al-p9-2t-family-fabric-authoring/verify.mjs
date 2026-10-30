import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p9-2t-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
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
  await page.goto(server.resolvedUrls.local[0] + "#document=family-fabric-authoring", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await open("Open construction file", "docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json");
  const initialHash = await hash(); await page.getByLabel("Awning bay").selectOption("0"); await page.getByRole("button", { name: "Add awning" }).click(); await changed(initialHash);
  const before = await save("Save construction", "before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0);
  assert(before.generation && before.graph.awnings.length === 1 && calls > 0);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  assert(await page.getByLabel("Keep edited dimensions and assemblies").isChecked());
  await page.getByRole("button", { name: "Reroll unlocked" }).click(); await changed(beforeHash);
  const after = await save("Save construction", "rerolled"); assert.deepEqual(after.graph.awnings, before.graph.awnings); assert.deepEqual(after.awningFabric, before.awningFabric);
  await page.getByLabel("Additional storefront awnings").check();
  await page.getByRole("button", { name: "Preview family" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family" || document.querySelector('.construction-workspace:not([hidden]) [role="alert"]'), undefined, { timeout: 180000 });
  const alert = root().getByRole("alert"); if (await alert.count()) throw new Error(await alert.innerText()); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.members.length, 6); assert.equal(family.schemaVersion, "0.9.0"); assert.equal(family.initialComposition.schemaVersion, "0.5.0");
  assert(family.members.every(member => JSON.stringify(member.graph.awnings.find(awning => awning.bayIndex === 0)) === JSON.stringify(before.graph.awnings[0]))); assert.deepEqual([...new Set(family.members.map(member => member.graph.awnings.length))].sort(), [1, 2, 3]); assert.deepEqual(family.awningFabric, before.awningFabric); assert.deepEqual(family.materialSource, before.materialSource);
  async function applyFabric(pattern, primary, secondary) {
    await page.getByLabel("Family fabric pattern").selectOption(pattern); await page.getByLabel("Family fabric primary color").fill(primary); await page.getByLabel("Family fabric stripe color").fill(secondary);
    await page.getByRole("button", { name: "Apply individual fabric" }).click();
    await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 180000 }); await ready();
  }
  await page.getByLabel("Family member").selectOption("0"); await applyFabric("solid", "#992f2a", "#45634e");
  const red = await save("Save family", "red"); assert.equal(red.schemaVersion, "0.11.0"); assert.equal(red.fabricAssignments.members[0].mode, "override"); assert.deepEqual(red.fabricAssignments.members[0].fabric.source.primary, [153,47,42]);
  assert.deepEqual(red.sourceGraph, family.sourceGraph); assert.deepEqual(red.members, family.members); assert.deepEqual(red.awningFabric, family.awningFabric); assert.deepEqual(red.materialSource, family.materialSource);
  await page.getByLabel("Family member").selectOption("1"); await applyFabric("striped", "#e5d7b6", "#315a86");
  const varied = await save("Save family", "varied"); assert.equal(varied.fabricAssignments.members[1].mode, "override"); assert.deepEqual(varied.fabricAssignments.members[1].fabric.source.secondary, [49,90,134]);
  assert.deepEqual(varied.fabricAssignments.members[0], red.fabricAssignments.members[0]); assert.deepEqual(varied.members, family.members);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  await page.getByLabel("Family member").selectOption("0"); await page.getByRole("button", { name: "Use shared fabric" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 180000 }); await ready();
  const reset = await save("Save family", "reset"); assert.equal(reset.fabricAssignments.members[0].mode, "inherit"); assert.deepEqual(reset.fabricAssignments.members[1], varied.fabricAssignments.members[1]);
  await open("Open family file", `${out}/varied.json`); assert.deepEqual(await save("Save family", "reopened"), varied);
  const reordered = await page.evaluate(async family => {
    const { createConstructionFamilyFabricAssignments } = await import("/src/features/building-family/materials/constructionFamilyFabric.ts");
    const { createConstructionFamilySource } = await import("/src/features/building-family/state/constructionFamilySource.ts");
    const { contentHash, ...payload } = family; void contentHash;
    const { contentHash: assignmentHash, ...assignment } = payload.fabricAssignments; void assignmentHash;
    const fabricAssignments = await createConstructionFamilyFabricAssignments({ ...assignment, members: [...assignment.members].reverse() });
    return createConstructionFamilySource({ ...payload, fabricAssignments });
  }, varied);
  await writeFile(`${out}/reordered.json`, JSON.stringify(reordered)); await open("Open family file", `${out}/reordered.json`);
  await page.getByLabel("Family member").selectOption("0"); assert.equal(await page.getByLabel("Family fabric pattern").inputValue(), "solid"); assert.equal(await page.getByLabel("Family fabric primary color").inputValue(), "#992f2a");
  assert.equal(await page.evaluate(() => globalThis.__groupFamilyCalls ?? 0), calls); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, twoOverrides: true, resetIndividual: true, siblingsRetained: true, reorderedAssignments: true, graphAndAtlasUnchanged: true, reopened: true, providerCallsDelta: 0 })); await context.close();
} finally { await browser?.close(); await server.close(); }
