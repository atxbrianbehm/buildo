// Isolated compiler geometry proof; no product UI or textures are represented.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const output = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({ cacheDir: "test-results/al-p11-7-vite", server: { host: "127.0.0.1", port: 5201, strictPort: true } });
await server.listen(); let browser;
try {
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto("http://127.0.0.1:5201/");
  for (const mode of ["without", "both"]) {
    await page.evaluate(async mode => {
      const THREE = await import("/node_modules/three/build/three.module.js");
      const { resolveConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefront.ts");
      const { resolveConstructionStorefrontDivision } = await import("/src/features/building-family/core/constructionStorefrontDivision.ts");
      const { buildConstructionDividedStorefrontGeometry } = await import("/src/features/building-family/compiler/constructionStorefrontGeometry.ts");
      const { resolveConstructionSignAwningArrangement } = await import("/src/features/building-family/core/constructionSignAwningArrangement.ts");
      const { buildConstructionSignAwningArrangementGeometry } = await import("/src/features/building-family/compiler/constructionSignAwningArrangementGeometry.ts");
      const { constructionFacadeSolid } = await import("/src/features/building-family/compiler/buildingShellGeometry.ts");
      const parameters = { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 };
      const plans = ["display", "glazed-entrance"].map((assembly, i) => resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly,
        scope: { id: `front/0/${i}`, face: "front", floorIndex: 0, bayIndex: i, originM: [-2.8+i*2.8,0,-0.36], sizeM: [2.8,4,0.36] }, parameters }));
      const wallScopes = plans.map(plan => ({ facade: "front", floorIndex: 0, bayIndex: plan.source.scope.bayIndex, zone: "ground", originM: plan.source.scope.originM,
        sizeM: plan.source.scope.sizeM, opening: { kind: plan.source.assembly === "display" ? "window" : "door", widthM: plan.aperture.widthM, heightM: plan.aperture.heightM,
          centerAlongM: plan.aperture.leftM+plan.aperture.widthM/2, centerYM: plan.aperture.bottomM+plan.aperture.heightM/2 } }));
      document.body.replaceChildren(); document.body.style.margin = "0"; const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1400,800); renderer.setClearColor(0xeae9e4); document.body.append(renderer.domElement);
      const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2)); const light = new THREE.DirectionalLight(0xffffff,2); light.position.set(-4,8,10); scene.add(light);
      const camera = new THREE.OrthographicCamera(-4.375,4.375,2.5,-2.5,0.1,50); camera.position.set(0,2,12); camera.lookAt(0,2,0);
      const geometry = part => { const g = new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(part.positions,3)); g.setAttribute("normal",new THREE.Float32BufferAttribute(part.normals,3)); g.setAttribute("uv",new THREE.Float32BufferAttribute(part.uvs,2)); g.setIndex(part.indices); return g; };
      const materials = { wall: 0xa46a58, frame: 0xe2dbcb, glass: 0x647b83, leaf: 0x7b5a45, hardware: 0xb8a681, trim: 0xd5c5aa, canopy: 0x889681, sign: 0x374b4c, signFrame: 0xd9c69d };
      const add = (part, role, x = 0) => { const mesh = new THREE.Mesh(geometry(part),new THREE.MeshStandardMaterial({ color: materials[role], roughness: .8, side: THREE.DoubleSide })); mesh.position.x = x; scene.add(mesh); };
      add(constructionFacadeSolid(wallScopes), "wall");
      for (const plan of plans) {
        const division = resolveConstructionStorefrontDivision({ schemaVersion: "0.1.0", kind: "construction-storefront-division-request", storefront: plan,
          displayLights: plan.source.assembly === "display" ? 2 : 1, transomLights: 3 });
        const built = buildConstructionDividedStorefrontGeometry(division);
        const x = plan.aperture.leftM + plan.aperture.widthM/2;
        for (const role of ["frame","glass","leaf","hardware","trim"]) for (const part of built[role]) add(part, role, x);
        if (mode === "both") { const arrangement = resolveConstructionSignAwningArrangement({ schemaVersion: "0.1.0", kind: "construction-sign-awning-arrangement-request", storefront: plan, sign: { heightM: 0.3, projectionM: 0.08, frameWidthM: 0.035 }, awning: { projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, gapM: 0.04 }); const built = buildConstructionSignAwningArrangementGeometry(arrangement); const x = plan.source.scope.originM[0]; add(built.sign.panel, "sign", x); for (const part of built.sign.frame) add(part, "signFrame", x); add(built.awning.roof, "canopy", x); add(built.awning.valance, "canopy", x); }
      }
      renderer.render(scene,camera);
      globalThis.__storefrontClay = { renderer, scene, camera };
    }, mode);
    await page.screenshot({ path: path.join(output, `${mode}-clay.png`) });
    if (mode === "both") {
      await page.evaluate(() => { const { renderer, scene, camera } = globalThis.__storefrontClay; camera.position.set(4,3.2,12); camera.lookAt(0,2,0); renderer.render(scene,camera); });
      await page.screenshot({ path: path.join(output, "both-angle.png") });
    }
  }
} finally { await browser?.close(); await server.close(); }
