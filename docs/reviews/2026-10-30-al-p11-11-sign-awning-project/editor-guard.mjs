import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer({ cacheDir: "test-results/al-p11-11-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium" }); const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0] + "#document=sign-awning-project-guard", { waitUntil: "domcontentloaded", timeout: 120000 });
  const root = page.locator(".construction-workspace:visible"); await root.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => { const root = document.querySelector('.construction-workspace:not([hidden])'); return root?.dataset.constructionHash && root.querySelector('[aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'false'; }, undefined, { timeout: 120000 });
  const download = page.waitForEvent("download", { timeout: 120000 }); await page.getByRole("button", { name: "Save construction", exact: true }).click();
  const filePath = "test-results/al-p11-11-starter.json"; await (await download).saveAs(filePath); const source = JSON.parse(await readFile(filePath, "utf8"));
  const project = await page.evaluate(async source => {
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { withConstructionSignAwningClearance } = await import("/src/features/building-family/core/constructionSignAwningGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { withConstructionFacadePiers } = await import("/src/features/building-family/core/constructionFacadePierGraph.ts");
    const { createBayConstructionProject } = await import("/src/features/building-family/state/bayConstructionProject.ts");
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "demo-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const graph = withConstructionAwnings(withConstructionStorefront(source.graph, 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(graph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const pierced = withConstructionFacadePiers(supported, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    return createBayConstructionProject(withConstructionSignAwningClearance(withConstructionStorefrontSign(pierced, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04), source.materialSource, source.generation, fabric);
  }, source);
  assert.equal(project.schemaVersion, "0.19.0"); const file = "test-results/al-p11-11-project.json"; await writeFile(file, JSON.stringify(project));
  const hash = await root.getAttribute("data-construction-hash"); await page.getByLabel("Open construction file").setInputFiles(file);
  await root.getByRole("alert").filter({ hasText: /combined sign and awning project is not yet supported/i }).waitFor({ timeout: 120000 });
  assert.equal(await root.getAttribute("data-construction-hash"), hash);
  await page.evaluate(async project => {
    const { createConstructionCheckpoint, createConstructionCheckpointPersistence } = await import("/src/features/building-family/state/constructionCheckpoint.ts");
    const checkpoint = await createConstructionCheckpoint("sign-awning-recovery-guard", project.graph, project.materialSource, project.generation, project.awningFabric);
    await createConstructionCheckpointPersistence().put(checkpoint);
  }, project);
  await page.goto(server.resolvedUrls.local[0] + "#document=sign-awning-recovery-guard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("The saved construction could not be recovered. Its saved copy has been retained.").waitFor({ timeout: 120000 });
  const saved = await page.evaluate(async () => { const { createConstructionCheckpointPersistence } = await import("/src/features/building-family/state/constructionCheckpoint.ts"); return (await createConstructionCheckpointPersistence().get("sign-awning-recovery-guard"))?.project; });
  assert.deepEqual(saved, project);
  console.log("Combined project and checkpoint are guarded without losing the current building or saved source.");
} finally { await browser?.close(); await server.close(); }
