import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p9-2q-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
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
  await page.goto(server.resolvedUrls.local[0] + "#document=member-fabric-guard", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
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
  const individual = await page.evaluate(async family => {
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { createConstructionFamilyFabricAssignments } = await import("/src/features/building-family/materials/constructionFamilyFabric.ts");
    const { createConstructionFamilySource } = await import("/src/features/building-family/state/constructionFamilySource.ts");
    const { contentHash, ...payload } = family; void contentHash;
    const red = await createConstructionAwningFabric({ ...payload.awningFabric.source, pattern: "solid", primary: [150,40,35] });
    const fabricAssignments = await createConstructionFamilyFabricAssignments({ schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: payload.familyId,
      sourceDocumentId: payload.sourceDocumentId, inheritedFabric: payload.awningFabric, members: payload.members.map((member, index) => index === 0 ? { documentId: member.documentId, mode: "override", fabric: red } : { documentId: member.documentId, mode: "inherit" }) });
    return createConstructionFamilySource({ ...payload, schemaVersion: "0.11.0", fabricAssignments });
  }, family);
  await writeFile(`${out}/individual-family.json`, JSON.stringify(individual));
  await page.getByRole("button", { name: "Return to building" }).click();
  await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview !== "family", undefined, { timeout: 180000 }); await ready();
  const priorHash = await hash(); await page.getByLabel("Open family file").setInputFiles(`${out}/individual-family.json`);
  await root().getByRole("alert").filter({ hasText: /Families with individual fabrics cannot yet be opened/i }).waitFor({ timeout: 180000 });
  assert.equal(await hash(), priorHash); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ familyVersion: individual.schemaVersion, members: individual.members.length, retainedBuilding: true, editorGuard: true })); await context.close();
} finally { await browser?.close(); await server.close(); }
