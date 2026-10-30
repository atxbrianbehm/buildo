import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const server = await createServer({ cacheDir: "test-results/al-p11-2-worker-vite", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage(); await page.goto(server.resolvedUrls.local[0]);
  const receipt = await page.evaluate(async () => {
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionGroupedBays } = await import("/src/features/building-family/core/constructionGroupedBayGraph.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionStorefrontDivision } = await import("/src/features/building-family/core/constructionStorefrontDivisionGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { withConstructionFacadePiers } = await import("/src/features/building-family/core/constructionFacadePierGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
    const base = withConstructionStorefrontDivision(withConstructionGroupedBays(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0,
      memberCount: 2, memberWidthM: 0.6, pierWidthM: 0.24 }]), { displayLights: 2, transomLights: 3 });
    const graph = withConstructionAwnings(base, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(graph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const pierced = withConstructionFacadePiers(supported, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    const signed = withConstructionStorefrontSign(pierced, { bayIndex: 2, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 });
    const worker = new Worker("/src/features/building-family/compiler/bayConstruction.worker.ts", { type: "module" });
    try {
      const reply = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Worker timed out")), 30000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage({ schemaVersion: "0.16.0", type: "evaluate-bay", requestId: 17, graph: signed });
      });
      if (reply.type !== "bay-result") throw new Error(reply.message);
      const direct = await evaluateConstruction(signed);
      const canonical = value => ArrayBuffer.isView(value) ? Array.from(value) : Array.isArray(value) ? value.map(canonical)
        : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
      return { version: reply.schemaVersion, requestId: reply.requestId, hashMatches: reply.result.ir.sourceGraphHash === direct.ir.sourceGraphHash,
        pathsMatch: JSON.stringify(reply.result.ir.semanticIndex) === JSON.stringify(direct.ir.semanticIndex),
        geometryMatches: JSON.stringify(canonical(reply.result.ir.meshBatches)) === JSON.stringify(canonical(direct.ir.meshBatches)),
        awningMeshes: reply.result.ir.meshBatches.filter(batch => batch.materialSlotId === "supplemental.awning.fabric").length,
        signs: reply.result.ir.meshBatches.filter(batch => batch.role.startsWith("sign.")).length, supports: reply.result.ir.meshBatches.filter(batch => batch.role === "awning.support").length, piers: reply.result.ir.meshBatches.filter(batch => batch.role === "facade-pier").length,
        transferred: reply.result.ir.instanceBatches.every(batch => batch.transforms instanceof Float32Array && batch.transforms.length === batch.count*16) };
    } finally { worker.terminate(); }
  });
  assert.deepEqual(receipt, { version: "0.16.0", requestId: 17, hashMatches: true, pathsMatch: true, geometryMatches: true, awningMeshes: 2, signs: 2, supports: 1, piers: 10, transferred: true });
  process.stdout.write("Sign graph worker transport passed.\n");
} finally { await browser?.close(); await server.close(); }
