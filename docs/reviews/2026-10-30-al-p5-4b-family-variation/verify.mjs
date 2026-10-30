import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p5-4b-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
  if (!id.replaceAll("\\", "/").endsWith("/materials/providers/proceduralMaterialProvider.ts")) return;
  return { code: code + "\nconst priorGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__variedFamilyCalls = (globalThis.__variedFamilyCalls ?? 0) + 1; return priorGenerate.apply(this, args); };", map: null };
} }], server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: "chromium", args: api === "webgpu" ? ["--enable-unsafe-webgpu"] : [] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); }, api === "webgl");
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const root = () => page.locator(".construction-workspace:visible");
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "false"), undefined, { timeout: 180000 });
  const hash = () => root().getAttribute("data-construction-hash");
  async function changed(before) { await page.waitForFunction(h => document.querySelector(".construction-workspace:not([hidden])")?.dataset.constructionHash !== h, before, { timeout: 180000 }); await ready(); }
  async function open(label, file) { await page.getByLabel(label).setInputFiles(file); await page.waitForFunction(() => [...document.querySelectorAll(".construction-workspace")].some(el => el.getClientRects().length && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute("aria-busy") === "true"), undefined, { timeout: 180000 }); await ready(); }
  async function save(button, name) { const download = page.waitForEvent("download", { timeout: 180000 }); await page.getByRole("button", { name: button, exact: true }).click(); await (await download).saveAs(`${out}/${name}.json`); return JSON.parse(await readFile(`${out}/${name}.json`, "utf8")); }
  await page.goto(server.resolvedUrls.local[0] + "#document=grouped-variety", { waitUntil: "domcontentloaded", timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator("canvas:visible").first().getAttribute("data-renderer-backend"), api);
  await page.locator("summary").filter({ hasText: /^Generate & vary$/ }).click();
  await page.getByLabel("Keep edited dimensions and assemblies").uncheck();
  const initialHash = await hash(); await page.getByRole("button", { name: "Generate building" }).click(); await changed(initialHash);
  await page.getByLabel("Keep edited dimensions and assemblies").check();
  const before = await save("Save construction", "before"), calls = await page.evaluate(() => globalThis.__variedFamilyCalls ?? 0); assert(before.generation && calls > 0);
  assert(!before.generation.source.intent.locks.some(lock => lock.semanticPath.startsWith("construction/opening/")));
  for (const label of ["Opening heads and sash", "Grouped upper windows", "Ground frontage", "Cornice and parapet"]) await page.getByRole("checkbox", { name: label }).check();
  await page.getByRole("button", { name: "Preview family" }).click();
  const outcome = await page.waitForFunction(() => { const workspace = document.querySelector('.construction-workspace:not([hidden])');
    const alert = workspace?.querySelector('[role="alert"]'); if (alert) return "error: " + alert.textContent;
    return workspace?.dataset.constructionPreview === "family" ? "ready" : false; }, undefined, { timeout: 180000 });
  const status = await outcome.jsonValue(); if (status !== "ready") throw new Error(status); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.schemaVersion, "0.4.0"); assert.equal(family.initialComposition.schemaVersion, "0.2.0");
  assert.equal(family.initialComposition.source.policy.groupedBays, true); assert.equal(family.materialSource.contentHash, before.materialSource.contentHash);
  assert.deepEqual(family.sourceGraph, before.graph);
  const counts = family.members.map(member => member.graph.upperBayGroups?.[0]?.memberCount ?? 0);
  assert(counts.includes(2) && counts.includes(3) && counts.includes(0));
  for (let i = 0; i < 6; i++) {
    const choice = family.initialComposition.members[i], graph = family.members[i].graph;
    assert.equal(counts[i], choice.groupedBays); if (choice.head === 1) assert.equal(counts[i], 0);
    assert.equal(graph.nodes.find(node => node.type === "PlaceOpening").parameters.upperFrontRoundHead, choice.head);
  }
  const selected = counts.findIndex(count => count === 2); assert(selected >= 0);
  await page.getByLabel("Family member").selectOption(String(selected));
  assert((await page.getByLabel("Selected building details").textContent()).includes("Pair at storey"));
  await page.getByRole("button", { name: "Edit selected building" }).click(); await page.getByRole("button", { name: "Back to family" }).waitFor({ timeout: 180000 }); await ready();
  const group = family.members[selected].graph.upperBayGroups[0]; await root().getByLabel("Grouped window storey").selectOption(String(group.floorIndex)); await root().getByLabel("Grouped window bay").selectOption(String(group.bayIndex));
  const width = Math.round((group.memberWidthM - 0.05) * 100) / 100; await root().getByLabel("Grouped window width").fill(String(width)); const beforeEdit = await hash();
  await root().getByRole("button", { name: "Apply window arrangement" }).click(); await changed(beforeEdit);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/member.png` });
  await page.getByRole("button", { name: "Back to family" }).click(); await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  const edited = await save("Save family", "edited"); assert.equal(edited.members[selected].graph.upperBayGroups[0].memberWidthM, width);
  for (let i = 0; i < 6; i++) if (i !== selected) assert.deepEqual(edited.members[i], family.members[i]);
  assert.deepEqual(edited.sourceGraph, family.sourceGraph); assert.deepEqual(edited.initialComposition, family.initialComposition); assert.equal(edited.materialSource.contentHash, family.materialSource.contentHash);
  await open("Open family file", `${out}/edited.json`); const reopened = await save("Save family", "reopened"); assert.deepEqual(reopened, edited);
  assert.equal(await page.evaluate(() => globalThis.__variedFamilyCalls ?? 0), calls); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), counts: z.array(z.union([z.literal(0),z.literal(2),z.literal(3)])).length(6),
    selected: z.number().int().min(0).max(5), memberEdit: z.literal(true), siblingsAndSourceUnchanged: z.literal(true), reopened: z.literal(true),
    materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), errors: z.array(z.string()).length(0) }).strict().parse({ schemaVersion: "0.1.0", api, counts, selected, memberEdit: true, siblingsAndSourceUnchanged: true, reopened: true, materialHash: family.materialSource.contentHash, providerCallsDelta: 0, errors });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
