// Isolated geometry study: no product graph, texture, or historical attribution.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const output = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ cacheDir: "test-results/al-p10-pier-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 840 } });
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { resolveConstructionFacadePiers } = await import("/src/features/building-family/core/constructionFacadePier.ts");
    const { buildConstructionFacadePierGeometry } = await import("/src/features/building-family/compiler/constructionFacadePierGeometry.ts");
    const { constructionFacadeSolid } = await import("/src/features/building-family/compiler/buildingShellGeometry.ts");
    const { buildBoxPrimitive } = await import("/src/features/building-family/compiler/primitiveGeometry.ts");
    document.body.replaceChildren(); document.body.style.margin = "0";
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1500, 840); renderer.setClearColor(0xeae9e4); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x858585, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-6, 10, 15); scene.add(light);
    const camera = new THREE.OrthographicCamera(-13.7, 13.7, 7.67, -7.67, .1, 100); camera.position.set(1.5, 7, 35); camera.lookAt(0, 3.25, 0);
    const make = part => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(part.positions, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(part.normals, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(part.uvs, 2)); g.setIndex(part.indices); return g; };
    const add = (part, color, offset) => { const mesh = new THREE.Mesh(make(part), new THREE.MeshStandardMaterial({ color, roughness: .85, side: THREE.DoubleSide })); mesh.position.x = offset; scene.add(mesh); };
    const centers = [-4.5, -1.5, 1.5, 4.5];
    const floors = [1,2].map((floorIndex, index) => ({ floorIndex, bottomM: .1 + index * 3.3, topM: 3.1 + index * 3.3,
      openingSpans: centers.map(x => [x - 1, x + 1]) }));
    const plan = resolveConstructionFacadePiers({ schemaVersion: "0.1.0", kind: "construction-facade-pier-request", facadeWidthM: 12, bayCount: 4, floors, pierWidthM: .3, projectionM: .18, endHeightM: .18, clearanceM: .06 });
    const scopes = floors.flatMap((floor, row) => centers.map((x, bayIndex) => ({ facade: "front", floorIndex: row, bayIndex, zone: "upper", originM: [x - 1.5, row * 3.3, -.36], sizeM: [3, 3.3, .36],
      opening: { kind: "window", widthM: 2, heightM: 2, centerAlongM: x, centerYM: row * 3.3 + 1.65 } })));
    for (const offset of [-6.7, 6.7]) {
      add(constructionFacadeSolid(scopes), 0xa27362, offset);
      for (let row = 0; row < 2; row++) for (const x of centers) {
        const y = row * 3.3 + 1.65;
        add(buildBoxPrimitive({ center: [x,y,-.08], size: [1.95,1.95,.04] }), 0x667c82, offset);
        for (const side of [-1, 1]) { add(buildBoxPrimitive({ center: [x + side * .98,y,.015], size: [.08,2.08,.1] }), 0xd7cfc0, offset); add(buildBoxPrimitive({ center: [x,y + side * 1.02,.015], size: [2.04,.08,.1] }), 0xd7cfc0, offset); }
      }
      if (offset > 0) for (const pier of buildConstructionFacadePierGeometry(plan)) for (const part of pier.parts) add(part, 0xc4a995, offset);
    }
    renderer.render(scene, camera); globalThis.__pierStudy = { renderer, scene, camera };
  });
  await page.screenshot({ path: path.join(output, "pier-study.png") });
  await page.evaluate(() => { const { renderer, scene, camera } = globalThis.__pierStudy; camera.position.set(10, 7, 32); camera.lookAt(0, 3.25, 0); renderer.render(scene, camera); });
  await page.screenshot({ path: path.join(output, "pier-study-angle.png") });
} finally { await browser?.close(); await server.close(); }
