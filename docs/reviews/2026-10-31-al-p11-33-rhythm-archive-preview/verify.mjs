import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const api = process.argv[2], out = process.argv[3];
assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p11-33-${api}`, server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 } });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  await page.goto(server.resolvedUrls.local[0] + `#document=rhythm-archive-preview-${api}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await root().waitFor({ timeout: 120000 });
  await page.waitForFunction(() => { const root = document.querySelector(".construction-workspace:not([hidden])"); return root?.dataset.constructionHash && root.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"; }, undefined, { timeout: 180000 });
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  const before = await root().getAttribute("data-construction-hash");
  const archive = await page.evaluate(async () => {
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { withConstructionSignAwningClearance } = await import("/src/features/building-family/core/constructionSignAwningGraph.ts");
    const { resolveConstructionFamilyPlan } = await import("/src/features/building-family/core/constructionFamilyPlan.ts");
    const { resolveConstructionFamilyComposition } = await import("/src/features/building-family/core/constructionFamilyComposition.ts");
    const { defaultConstructionGenerationControls, resolveWorkbenchGeneration } = await import("/src/features/building-family/state/constructionGenerationState.ts");
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { createBayConstructionProject } = await import("/src/features/building-family/state/bayConstructionProject.ts");
    const { createGroupedRhythmFamilyArchive } = await import("/src/features/building-family/state/constructionGroupedRhythmFamilyArchive.ts");
    const { createAssemblyHallFixture } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { createReferenceConstructionMaterials } = await import("/src/features/building-family/ui/bayConstructionFixture.ts");
    const { defaultBuildingPromptControls } = await import("/src/features/building-family/state/buildingStore.ts");
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("archive_browser"), null, defaultConstructionGenerationControls);
    const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    try {
      const { materials, plan: materialPlan } = await createReferenceConstructionMaterials(base, initial.source, new AbortController().signal, base.spec);
      const lineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: initial.source, resolution: initial.resolution, materialPlan, materialSourceHash: materials.file.contentHash };
      const storefront = withConstructionStorefront(initial.graph, 1), awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: .55, valanceHeightM: .2 }]);
      const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(awnings, { bayIndex: 0, heightM: .18, projectionM: .08, frameWidthM: .035 }), .04);
      const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "browser-preview", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
      const sourceProject = await createBayConstructionProject(graph, materials.file, lineage, fabric);
      const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "archive_browser_family", familySeed: "sign-family-seed", graph });
      const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
        policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
      return JSON.stringify(await createGroupedRhythmFamilyArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-family-archive-request", sourceProject, plan, composition,
        policy: { schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-family-policy", scope: "all-upper-front", memberCount: 2, memberWidthM: .55, pierWidthM: .24 }, controls: defaultConstructionGenerationControls }));
    } finally { base.familyRuntime.dispose(); }
  });
  await page.getByLabel("Open family file").setInputFiles({ name: "rhythm.json", mimeType: "application/json", buffer: Buffer.from(archive) });
  await page.getByText("Archived family preview is read-only.", { exact: false }).waitFor({ timeout: 180000 });
  assert.equal(await root().getAttribute("data-construction-preview"), "family"); assert(await page.getByRole("button", { name: "Save family" }).isDisabled());
  assert.equal(await page.getByRole("button", { name: "Edit selected building" }).count(), 0);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  await page.getByRole("button", { name: "Return to building" }).click();
  await page.waitForFunction(() => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionPreview === "output", undefined, { timeout: 180000 });
  assert.equal(await root().getAttribute("data-construction-hash"), before); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ api, readOnly: true, originalRetained: true, previewedMembers: 6 })); await context.close();
} finally { await browser?.close(); await server.close(); }
