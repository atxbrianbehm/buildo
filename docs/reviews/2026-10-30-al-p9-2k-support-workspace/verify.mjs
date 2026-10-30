import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: `test-results/al-p9-2k-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__awningProviderCalls = (globalThis.__awningProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  let page = await context.newPage(), errors = []; const wire = () => page.on("pageerror", error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + `#document=support-continuity-${api}`, root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function open(file) { await page.getByLabel("Open construction file").setInputFiles(file); await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 }); await ready(); }
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const source = JSON.parse(await readFile("docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json", "utf8"));
  const project = await page.evaluate(async source => {
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { createBayConstructionProject } = await import("/src/features/building-family/state/bayConstructionProject.ts");
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "demo-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const graph = withConstructionAwnings(source.graph, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, { bayIndex: 1, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]);
    return createBayConstructionProject(withConstructionAwningSupports(graph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]), source.materialSource, source.generation, fabric);
  }, source);
  await writeFile(`${out}/input.json`, JSON.stringify(project)); await open(`${out}/input.json`);
  const before = await save("before"), beforeHash = await hash(), calls = await page.evaluate(() => globalThis.__awningProviderCalls ?? 0);
  assert.equal(before.schemaVersion, "0.16.0"); assert(await page.getByRole("button", { name: "Remove awning" }).isDisabled()); assert.deepEqual(before.awningFabric, project.awningFabric);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/before.png` });
  await page.locator("summary").filter({ hasText: /^Shape$/ }).click();
  const width = page.getByLabel("Width (m)").first(), initialWidth = Number(await width.inputValue()); await width.fill(String(initialWidth + 1));
  await page.getByRole("button", { name: "Apply construction" }).first().click(); await changed(beforeHash);
  const afterHash = await hash(), after = await save("after"); assert.deepEqual(after.graph.awningSupports, before.graph.awningSupports); assert.deepEqual(after.awningFabric, before.awningFabric); assert.deepEqual(after.materialSource, before.materialSource);
  assert.equal(await page.evaluate(() => globalThis.__awningProviderCalls ?? 0), calls);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/after.png` });
  await page.getByRole("button", { name: "Undo construction" }).click(); await changed(afterHash); assert.equal(await hash(), beforeHash);
  await page.getByRole("button", { name: "Redo construction" }).click(); await changed(beforeHash); assert.equal(await hash(), afterHash);
  await page.getByRole("button", { name: "Preview family" }).click();
  await root().getByRole("alert").filter({ hasText: /Awning support graphs cannot yet be regenerated/i }).waitFor({ timeout: 120000 });
  assert.equal(await hash(), afterHash);
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 });
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await hash(), afterHash); const recovered = await save("recovered"); assert.deepEqual(recovered, after);
  await open(`${out}/after.json`); assert.equal(await hash(), afterHash); const reopened = await save("reopened"); assert.deepEqual(reopened, after); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, beforeHash, afterHash, fabricHash: after.awningFabric.contentHash, atlasHash: after.materialSource.contentHash, materialProviderCallsDuringEdit: 0, undoRedo: true, recovered: true, reopened: true }));
  await context.close();
} finally { await browser?.close(); await server.close(); }
