// Compiler-only clay proof; this is not the application authoring workflow.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const output = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ server: { host: "127.0.0.1", port: 5199, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5199/");
  for (const mode of ["single", "grouped"]) {
    await page.evaluate(async mode => {
      const THREE = await import("/node_modules/three/build/three.module.js");
      const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
      const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
      const { evaluateGroupedBayConstruction } = await import("/src/features/building-family/compiler/evaluateGroupedBayConstruction.ts");
      const { resolveConstructionGroupedBay } = await import("/src/features/building-family/core/constructionGroupedBay.ts");
      const graph = createBuildingConstructionGraph(), plan = resolveConstructionGroupedBay({ schemaVersion: "0.1.0", kind: "construction-grouped-bay-request",
        scope: { id: "facade/floor/1/bay/0", face: "front", floorIndex: 1, bayIndex: 0, originM: [-5.6,4,-0.36], sizeM: [2.8,3.7,0.36] },
        parameters: { memberCount: 2, memberWidthM: 0.9, heightM: 2.12, sillM: 0.78, pierWidthM: 0.24, frameWidthM: 0.055, recessM: 0.14 } });
      const result = mode === "single" ? await evaluateConstruction(graph) : (await evaluateGroupedBayConstruction({ schemaVersion: "0.1.0", kind: "construction-grouped-geometry-request", graph, groups: [plan] })).result;
      document.body.replaceChildren(); document.body.style.margin = "0";
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1200,900); renderer.setClearColor(0xe8e7e2); document.body.append(renderer.domElement);
      const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff,0x888080,2));
      const light = new THREE.DirectionalLight(0xffffff,2); light.position.set(-8,16,-15); scene.add(light);
      const camera = new THREE.PerspectiveCamera(30,1200/900,0.1,100); camera.position.set(-8,9,-25); camera.lookAt(-2.1,6.5,-4.2);
      const geometry = batch => { const g = new THREE.BufferGeometry(); g.setAttribute("position",new THREE.BufferAttribute(batch.positions,3)); g.setAttribute("normal",new THREE.BufferAttribute(batch.normals,3)); g.setAttribute("uv",new THREE.BufferAttribute(batch.uvs,2)); g.setIndex(new THREE.BufferAttribute(batch.indices,1)); return g; };
      const material = role => new THREE.MeshStandardMaterial({ color: role === "glass" ? 0x647783 : role === "frame" ? 0xd9d8cf : role === "wall" ? 0xa65e4b : 0xc5b7a7, roughness: 0.85, side: THREE.DoubleSide });
      for (const batch of result.ir.meshBatches) if (batch.positions) scene.add(new THREE.Mesh(geometry(batch), material(batch.role)));
      for (const batch of result.ir.instanceBatches) {
        const prototype = result.prototypes.find(item => item.batchId === batch.recipeId); if (!prototype) throw new Error("Missing prototype");
        const mesh = new THREE.InstancedMesh(geometry(prototype),material(prototype.role),batch.count);
        for (let i = 0; i < batch.count; i++) mesh.setMatrixAt(i,new THREE.Matrix4().fromArray(batch.transforms,i*16));
        mesh.instanceMatrix.needsUpdate = true; scene.add(mesh);
      }
      renderer.render(scene,camera);
    }, mode);
    await page.screenshot({ path: path.join(output, `${mode}-clay.png`) });
  }
} finally {
  await browser?.close(); await server.close();
}
