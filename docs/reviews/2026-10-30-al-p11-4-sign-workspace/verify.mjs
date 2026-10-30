import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.argv[2]; assert(["webgpu", "webgl"].includes(api));
const server = await createServer({ cacheDir: "test-results/al-p11-4-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] }); const page = await browser.newPage();
  await page.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  await page.goto(server.resolvedUrls.local[0] + "#document=sign-workspace", { waitUntil: "domcontentloaded", timeout: 120000 });
  const root = page.locator(".construction-workspace:visible"); await root.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => { const root = document.querySelector('.construction-workspace:not([hidden])'); return root?.dataset.constructionHash && root.querySelector('[aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'false'; }, undefined, { timeout: 120000 });
  const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click();
  const filePath = "test-results/al-p11-4-starter.json"; await (await download).saveAs(filePath); const source = JSON.parse(await readFile(filePath, "utf8"));
  const project = await page.evaluate(async source => {
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { withConstructionFacadePiers } = await import("/src/features/building-family/core/constructionFacadePierGraph.ts");
    const { createBayConstructionProject } = await import("/src/features/building-family/state/bayConstructionProject.ts");
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "demo-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const graph = withConstructionAwnings(withConstructionStorefront(source.graph, 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(graph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const pierced = withConstructionFacadePiers(supported, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    return createBayConstructionProject(withConstructionStorefrontSign(pierced, { bayIndex: 2, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), source.materialSource, source.generation, fabric);
  }, source);
  assert.equal(project.schemaVersion, "0.18.0"); const file = "test-results/al-p11-4-project.json"; await writeFile(file, JSON.stringify(project));
  await page.getByLabel("Open construction file").setInputFiles(file);
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true", undefined, { timeout: 120000 });
  const ready = () => page.waitForFunction(() => { const r = document.querySelector('.construction-workspace:not([hidden])'); return r?.dataset.constructionHash && r.querySelector('[aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'false'; }, undefined, { timeout: 120000 });
  await ready(); const beforeHash = await root.getAttribute("data-construction-hash");
  assert.equal(await root.locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  assert(await page.getByLabel("Window to edit").isDisabled()); assert(await page.getByLabel("Grouped window arrangement").isDisabled()); assert(await page.getByRole("button", { name: "Preview family" }).isDisabled());
  await root.locator("summary").filter({ hasText: /^Shape$/ }).click(); const width = root.getByLabel("Width (m)").first(); const previous = Number(await width.inputValue()); await width.fill(String(previous + 1));
  await page.getByRole("button", { name: "Apply construction" }).first().click(); await page.waitForFunction(h => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionHash !== h, beforeHash, { timeout: 120000 }); await ready();
  const afterHash = await root.getAttribute("data-construction-hash");
  async function save(name) { const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click(); const path = `test-results/al-p11-4-${name}.json`; await (await download).saveAs(path); return JSON.parse(await readFile(path, "utf8")); }
  const edited = await save("edited"); assert.deepEqual(edited.graph.storefrontSign, project.graph.storefrontSign); assert.deepEqual(edited.graph.facadePiers, project.graph.facadePiers); assert.deepEqual(edited.graph.awnings, project.graph.awnings); assert.deepEqual(edited.awningFabric, project.awningFabric); assert.deepEqual(edited.materialSource, project.materialSource);
  await page.getByRole("button", { name: "Undo construction" }).click(); await page.waitForFunction(h => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionHash === h, beforeHash, { timeout: 120000 }); await ready();
  await page.getByRole("button", { name: "Redo construction" }).click(); await page.waitForFunction(h => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionHash === h, afterHash, { timeout: 120000 }); await ready();
  await root.locator("canvas:visible").first().screenshot({ path: `docs/reviews/2026-10-30-al-p11-4-sign-workspace/${api}.png` });
  await page.locator('[aria-label="Construction recovery"][data-construction-recovery="saved"]').waitFor({ timeout: 120000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 }); await root.waitFor({ timeout: 120000 }); await ready(); assert.equal(await root.getAttribute("data-construction-hash"), afterHash);
  assert.deepEqual(await save("recovered"), edited);
  console.log("Sign project opened, edited, retained materials, survived undo, redo and recovery; unsupported controls remained guarded.");

} finally { await browser?.close(); await server.close(); }
