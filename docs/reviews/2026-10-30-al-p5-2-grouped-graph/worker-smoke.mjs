import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const server = await createServer({ server: { host: "127.0.0.1", port: 5199, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage(); await page.goto("http://127.0.0.1:5199/");
  const receipt = await page.evaluate(async () => {
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionGroupedBays } = await import("/src/features/building-family/core/constructionGroupedBayGraph.ts");
    const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
    const graph = withConstructionGroupedBays(createBuildingConstructionGraph(), [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0,
      memberCount: 2, memberWidthM: 0.9, pierWidthM: 0.24 }]);
    const worker = new Worker("/src/features/building-family/compiler/bayConstruction.worker.ts", { type: "module" });
    try {
      const reply = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Worker timed out")), 30000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage({ schemaVersion: "0.11.0", type: "evaluate-bay", requestId: 17, graph });
      });
      if (reply.type !== "bay-result") throw new Error(reply.message);
      const direct = await evaluateConstruction(graph);
      return { version: reply.schemaVersion, requestId: reply.requestId, hashMatches: reply.result.ir.sourceGraphHash === direct.ir.sourceGraphHash,
        pathsMatch: JSON.stringify(reply.result.ir.semanticIndex) === JSON.stringify(direct.ir.semanticIndex),
        memberFrames: reply.result.ir.semanticIndex.filter(entry => /\/bay\/0\/opening\/[01]\/frame$/.test(entry.semanticPath)).length,
        transferred: reply.result.ir.instanceBatches.every(batch => batch.transforms instanceof Float32Array && batch.transforms.length === batch.count*16) };
    } finally { worker.terminate(); }
  });
  assert.deepEqual(receipt, { version: "0.11.0", requestId: 17, hashMatches: true, pathsMatch: true, memberFrames: 2, transferred: true });
  process.stdout.write("Grouped-bay worker transport passed.\n");
} finally { await browser?.close(); await server.close(); }
