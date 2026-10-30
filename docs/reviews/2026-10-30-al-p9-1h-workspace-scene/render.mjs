import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const output = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ cacheDir: "test-results/al-p9-1h-render-vite", server: { host: "127.0.0.1", port: 5199, strictPort: true } });
let browser;
try {
  await server.listen(); browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://127.0.0.1:5199/");
  await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionStorefrontDivision } = await import("/src/features/building-family/core/constructionStorefrontDivisionGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
    const { createConstructionAwningFabric } = await import("/src/features/building-family/materials/constructionAwningFabric.ts");
    const { createAssemblyHallFixture } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { createBayConstructionMaterials, prepareBayConstructionFixture } = await import("/src/features/building-family/ui/bayConstructionFixture.ts");
    const { defaultBuildingPromptControls } = await import("/src/features/building-family/state/buildingStore.ts");
    const graph = withConstructionAwnings(withConstructionStorefrontDivision(withConstructionStorefront(createBuildingConstructionGraph(), 1), { displayLights: 2, transomLights: 3 }), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, { bayIndex: 1, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]);
    const result = await evaluateConstruction(graph);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "demo-fabric", pattern: "striped", primary: [224,213,187], secondary: [69,99,78], physicalSizeM: [1,1] });
    const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    const materials = await createBayConstructionMaterials(base, new AbortController().signal, undefined, "building");
    const fixture = await prepareBayConstructionFixture(base, result, { ...materials, awningFabric: fabric }); const building = fixture.buildingRuntime;
    document.body.replaceChildren(); document.body.style.margin = "0"; const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1400,900); renderer.setClearColor(0xeae9e4); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(building.root); scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2)); const light = new THREE.DirectionalLight(0xffffff,2); light.position.set(-5,12,14); scene.add(light);
    const camera = new THREE.PerspectiveCamera(38, 1400/900, 0.1, 100); camera.position.set(-16,12,-27); camera.lookAt(0,5,0); renderer.render(scene,camera);
  });
  await page.screenshot({ path: path.join(output, "workspace-fixture.png") });
} finally { await browser?.close(); await server.close(); }
