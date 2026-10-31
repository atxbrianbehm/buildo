import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const output = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ cacheDir: "test-results/al-p11-29-render-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(server.resolvedUrls.local[0]);
  const evidence = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { withConstructionSignAwningClearance } = await import("/src/features/building-family/core/constructionSignAwningGraph.ts");
    const { resolveConstructionFamilyPlan } = await import("/src/features/building-family/core/constructionFamilyPlan.ts");
    const { resolveConstructionFamilyComposition } = await import("/src/features/building-family/core/constructionFamilyComposition.ts");
    const { defaultConstructionGenerationControls, resolveWorkbenchGeneration } = await import("/src/features/building-family/state/constructionGenerationState.ts");
    const { resolveConstructionRetainedSignFamilyStudy } = await import("/src/features/building-family/state/constructionRetainedSignFamilyStudy.ts");
    const { compileConstructionGroupedFacadeRhythmStudy } = await import("/src/features/building-family/state/constructionGroupedFacadeRhythmStudy.ts");
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { createAssemblyHallFixture } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { createReferenceConstructionMaterials, prepareConstructionFamilyFixture } = await import("/src/features/building-family/ui/bayConstructionFixture.ts");
    const { defaultBuildingPromptControls } = await import("/src/features/building-family/state/buildingStore.ts");
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("sign_family_render"), null, defaultConstructionGenerationControls);
    const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    const { materials, plan: materialPlan } = await createReferenceConstructionMaterials(base, initial.source, new AbortController().signal, base.spec);
    const lineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: initial.source, resolution: initial.resolution, materialPlan, materialSourceHash: materials.file.contentHash };
    const storefront = withConstructionStorefront(initial.graph, 1), awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: .55, valanceHeightM: .2 }]);
    const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: .15, thicknessM: .03 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: .18, projectionM: .08, frameWidthM: .035 }), .04);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "sign_family_rendered", familySeed: "sign-family-seed", graph });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: "sign-family-seed", openingLock: false, policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const family = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "demo-fabric", pattern: "striped", primary: [224,213,187], secondary: [69,99,78], physicalSizeM: [1,1] });
    const constructions = [];
    for (const member of family.members) {
      const g = member.construction.graph, head = g.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead;
      if (head === 1) { constructions.push(member.construction); continue; }
      const floors = g.nodes.find(node => node.type === "Storeys").parameters.count, bays = g.nodes.find(node => node.type === "SplitBays").parameters.count;
      const rhythm = await compileConstructionGroupedFacadeRhythmStudy({ schemaVersion: "0.1.0", kind: "construction-grouped-facade-rhythm-study", graph: g,
        firstFloor: 1, lastFloor: floors - 1, firstBay: 0, lastBay: bays - 1, memberCount: 2, memberWidthM: .55, pierWidthM: .24 });
      constructions.push(rhythm.construction);
    }
    const fixture = await prepareConstructionFamilyFixture(base, constructions, { ...materials, awningFabric: fabric });
    document.body.replaceChildren(); document.body.style.margin = "0"; const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1600,900); renderer.setClearColor(0xeae9e4); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(fixture.familyRuntime.root); scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2)); const light = new THREE.DirectionalLight(0xffffff,2); light.position.set(-5,12,14); scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, 1600/900, .1, 500); camera.position.set(0,22,-135); camera.lookAt(0,7,0); renderer.render(scene,camera);
    return { count: constructions.length, renderedGraphHashes: constructions.map(construction => construction.ir.sourceGraphHash), massing: family.members.map(member => ({ floors: member.construction.graph.nodes.find(node => node.type === "Storeys").parameters.count, bays: member.construction.graph.nodes.find(node => node.type === "SplitBays").parameters.count })), coverage: family.members[0].lineage.source.reference.architectureCoverage };
  });
  await page.screenshot({ path: path.join(output, "family.png") }); process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally { await browser?.close(); await server.close(); }
