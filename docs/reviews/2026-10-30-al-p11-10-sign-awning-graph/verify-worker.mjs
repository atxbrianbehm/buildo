import { createServer } from "vite";
import { chromium } from "@playwright/test";

const server = await createServer({ cacheDir: "test-results/al-p11-10-worker-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch();
  const page = await browser.newPage(); await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async () => {
    const { createBuildingConstructionGraph } = await import("/src/features/building-family/contracts/bayConstructionGraph.ts");
    const { withConstructionStorefront } = await import("/src/features/building-family/core/constructionStorefrontGraph.ts");
    const { withConstructionAwnings } = await import("/src/features/building-family/core/constructionAwningGraph.ts");
    const { withConstructionAwningSupports } = await import("/src/features/building-family/core/constructionAwningSupportGraph.ts");
    const { withConstructionStorefrontSign } = await import("/src/features/building-family/core/constructionStorefrontSignGraph.ts");
    const { withConstructionSignAwningClearance } = await import("/src/features/building-family/core/constructionSignAwningGraph.ts");
    const { evaluateConstruction } = await import("/src/features/building-family/compiler/evaluateConstruction.ts");
    const { canonicalJson } = await import("/src/features/building-family/core/canonicalJson.ts");
    const { BayConstructionClient } = await import("/src/features/building-family/compiler/bayConstructionClient.ts");
    const WorkerClass = (await import("/src/features/building-family/compiler/bayConstruction.worker.ts?worker")).default;
    const base = withConstructionAwningSupports(withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph("worker_combined"), 1),
      [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]), [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(base, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
    const direct = await evaluateConstruction(graph), client = new BayConstructionClient(new WorkerClass());
    try {
      const worker = await client.evaluate(graph);
      const same = canonicalJson(worker) === canonicalJson(direct);
      if (!same) throw new Error("Worker and direct compilation differ.");
      return { graphVersion: graph.schemaVersion, graphHash: worker.ir.sourceGraphHash, identical: same,
        roles: worker.ir.meshBatches.filter(batch => batch.role.startsWith("sign.") || batch.role.startsWith("awning.")).map(batch => batch.role) };
    } finally { client.dispose(); }
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally { await browser?.close(); await server.close(); }
