import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const out = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ cacheDir: "test-results/al-p11-74-render-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(server.resolvedUrls.local[0]);
  const evidence = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionRoundHead } = await import("/src/features/building-family/core/constructionRoundHeadVocabulary.ts");
    const { resolveConstructionRoundHead } = await import("/src/features/building-family/core/constructionRoundHead.ts");
    const { resolveConstructionArchHood } = await import("/src/features/building-family/core/constructionArchHood.ts");
    const { buildConstructionArchHood } = await import("/src/features/building-family/compiler/constructionArchHoodGeometry.ts");
    const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
    const { createAssemblyHallFixture } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { createBayConstructionMaterials, prepareBayConstructionFixture } = await import("/src/features/building-family/ui/bayConstructionFixture.ts");
    const { defaultBuildingPromptControls } = await import("/src/features/building-family/state/buildingStore.ts");
    const graph = withConstructionRoundHead(createBuildingConstructionGraph("hood_study"), 1), result = await evaluateConstruction(graph);
    const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    const materials = await createBayConstructionMaterials(base, new AbortController().signal, undefined, "building");
    const fixture = await prepareBayConstructionFixture(base, result, materials);
    const fp = graph.nodes.find(node => node.type === "Footprint").parameters, storeys = graph.nodes.find(node => node.type === "Storeys").parameters;
    const bays = graph.nodes.find(node => node.type === "SplitBays").parameters.count, opening = graph.nodes.find(node => node.type === "PlaceOpening").parameters;
    const windows = graph.nodes.find(node => node.type === "AssembleWindow").parameters, bayWidth = fp.widthM / bays;
    const material = fixture.familyRuntime.materialRegistry.getMaterial("trim.horizontal.primary").clone();
    const hood = new THREE.Group(), geometries = [];
    for (let floor = 1; floor < storeys.count; floor++) for (let bay = 0; bay < bays; bay++) {
      const plan = resolveConstructionRoundHead({ schemaVersion: "0.1.0", kind: "construction-round-head-request",
        scope: { id: `hood-demo/floor/${floor}/bay/${bay}`, face: "front", floorIndex: floor, bayIndex: bay,
          originM: [-fp.widthM / 2 + bay * bayWidth, storeys.groundHeightM + (floor - 1) * storeys.upperHeightM, -fp.wallDepthM], sizeM: [bayWidth, storeys.upperHeightM, fp.wallDepthM] },
        parameters: { widthM: opening.widthM, heightM: opening.heightM, sillM: opening.sillM, frameWidthM: windows.frameWidthM, revealDepthM: windows.recessM, masonryMarginM: 0.15 } });
      const stonePlan = resolveConstructionArchHood({ schemaVersion: "0.1.0", kind: "construction-arch-hood-request", opening: plan,
        bandM: 0.1, projectionM: 0.07, jointM: 0.012, keystoneRiseM: bay % 2 ? 0.04 : 0.025, stoneCount: bay % 2 ? 9 : 7 });
      for (const primitive of buildConstructionArchHood(stonePlan)) {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(primitive.positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(primitive.normals, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(primitive.uvs, 2));
        const indices = [...primitive.indices]; for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        geometry.setIndex(indices); geometry.scale(1, 1, -1); geometry.translate(0, 0, -fp.depthM / 2); geometries.push(geometry);
        hood.add(new THREE.Mesh(geometry, material));
      }
    }
    document.body.replaceChildren(); document.body.style.margin = "0"; const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1600, 900); renderer.setClearColor(0xeae9e4); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(fixture.familyRuntime.root); scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-5, 12, -14); scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, 1600 / 900, 0.1, 500); camera.position.set(0, 7.8, -32); camera.lookAt(0, 7.5, 0); renderer.render(scene, camera);
    globalThis.__hoodStudy = { renderer, scene, camera, hood, geometries, material, fixture, base };
    return { graphHash: result.ir.sourceGraphHash, hoodCount: (storeys.count - 1) * bays, stoneMeshes: hood.children.length, source: "synthetic demo" };
  });
  await page.screenshot({ path: path.join(out, "before.png") });
  await page.evaluate(() => { const { renderer, scene, camera, hood } = globalThis.__hoodStudy; scene.add(hood); renderer.render(scene, camera); });
  await page.screenshot({ path: path.join(out, "after.png") });
  await page.evaluate(() => { const { renderer, scene, camera } = globalThis.__hoodStudy; camera.position.set(-2.7, 7, -15); camera.lookAt(-2.7, 7, 0); renderer.render(scene, camera); });
  await page.screenshot({ path: path.join(out, "detail.png") });
  await page.evaluate(() => { const { renderer, scene, camera } = globalThis.__hoodStudy; camera.position.set(-7, 7.8, -15); camera.lookAt(-2.7, 7, 0); renderer.render(scene, camera); });
  await page.screenshot({ path: path.join(out, "angled.png") });
  await page.evaluate(() => { const { renderer, geometries, material, fixture, base } = globalThis.__hoodStudy; for (const geometry of geometries) geometry.dispose(); material.dispose(); fixture.familyRuntime.dispose(); base.familyRuntime.dispose(); renderer.dispose(); });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally { await browser?.close(); await server.close(); }
