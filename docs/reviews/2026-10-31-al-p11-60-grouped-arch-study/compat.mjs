import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const filename = process.argv[2]; assert(filename, "Pass a family-fabric archive produced before this change.");
const input = JSON.parse(await readFile(filename, "utf8"));
const server = await createServer({ cacheDir: "test-results/al-p11-60-compat-vite", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async archive => {
    const { readGroupedRhythmFabricArchive } = await import("/src/features/building-family/state/constructionGroupedRhythmFabricArchive.ts");
    const reopened = await readGroupedRhythmFabricArchive(archive);
    return { same: JSON.stringify(reopened) === JSON.stringify(archive), roundHeads: reopened.family.result.members.filter(member => member.graph.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead === 1).length,
      flatGroups: reopened.family.result.members.filter(member => member.graph.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead === 0 && member.graph.upperBayGroups?.length).length };
  }, input);
  assert(result.same); assert(result.roundHeads > 0, "The compatibility fixture must include older ungrouped arches.");
  assert(result.flatGroups > 0, "The compatibility fixture must include older flat grouped windows.");
  console.log(JSON.stringify(result));
} finally { await browser?.close(); await server.close(); }
