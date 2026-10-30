import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";

const api = process.argv[2], out = process.argv[3]; assert(["webgpu", "webgl"].includes(api) && out); await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `test-results/al-p7-vite-${api}`, plugins: [{ name: "observe-material-calls", enforce: "pre", transform(code, id) {
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
  await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await root().getByRole("combobox", { name: "Ground frontage" }).selectOption("1"); const beforeStorefront = await hash();
  await root().getByRole("button", { name: "Apply construction" }).click(); await changed(beforeStorefront);
  const before = await save("Save construction", "before"), calls = await page.evaluate(() => globalThis.__variedFamilyCalls ?? 0); assert(before.generation && calls > 0);
  assert(!before.generation.source.intent.locks.some(lock => lock.semanticPath.startsWith("construction/opening/")));
  await page.getByRole("checkbox", { name: "Storefront pane divisions" }).check();
  await page.getByRole("checkbox", { name: "Storey and bay counts" }).check();
  await page.getByRole("button", { name: "Preview family" }).click();
  const outcome = await page.waitForFunction(() => { const workspace = document.querySelector('.construction-workspace:not([hidden])');
    const alert = workspace?.querySelector('[role="alert"]'); if (alert) return "error: " + alert.textContent;
    return workspace?.dataset.constructionPreview === "family" ? "ready" : false; }, undefined, { timeout: 180000 });
  const status = await outcome.jsonValue(); if (status !== "ready") throw new Error(status); await ready();
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/family.png` });
  const family = await save("Save family", "family"); assert.equal(family.schemaVersion, "0.7.0"); assert.equal(family.initialComposition.schemaVersion, "0.4.0");
  assert.equal(family.initialComposition.source.policy.storefrontLights, true); assert.equal(family.materialSource.contentHash, before.materialSource.contentHash);
  assert.deepEqual(family.sourceGraph, before.graph);
  const massing = family.members.map(member => ({ floorCount: member.graph.nodes.find(node => node.type === "Storeys").parameters.count, bayCount: member.graph.nodes.find(node => node.type === "SplitBays").parameters.count }));
  assert.deepEqual(massing, family.initialComposition.members.map(member => member.massing));
  assert.deepEqual(massing, family.members.map(member => ({ floorCount: member.generation.source.intent.requested.floorCount, bayCount: member.generation.source.intent.requested.bayCount })));
  assert.equal(new Set(massing.map(value => value.floorCount)).size, 3); assert.equal(new Set(massing.map(value => value.bayCount)).size, 3);
  const lights = family.members.map(member => member.graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 });
  assert.equal(new Set(lights.map(value => JSON.stringify(value))).size, 6);
  for (let i = 0; i < 6; i++) assert.deepEqual(lights[i], family.initialComposition.members[i].storefrontLights);
  const selected = lights.findIndex(value => value.displayLights === 2 && value.transomLights === 3); assert(selected >= 0);
  await page.getByLabel("Family member").selectOption(String(selected));
  assert((await page.getByLabel("Selected building details").textContent()).includes("2 display / 3 transom"));
  await page.getByRole("button", { name: "Edit selected building" }).click(); await page.getByRole("button", { name: "Back to family" }).waitFor({ timeout: 180000 }); await ready();
  await root().locator("summary").filter({ hasText: /^Ground floor$/ }).click();
  await root().getByLabel("Transom lights").selectOption("2"); const beforeEdit = await hash();
  await root().getByRole("button", { name: "Apply construction" }).click(); await changed(beforeEdit);
  await root().locator("canvas:visible").first().screenshot({ path: `${out}/member.png` });
  await page.getByRole("button", { name: "Back to family" }).click(); await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === "family", undefined, { timeout: 180000 }); await ready();
  const edited = await save("Save family", "edited"); assert.equal(edited.members[selected].graph.storefrontDivision.transomLights, 2);
  for (let i = 0; i < 6; i++) if (i !== selected) assert.deepEqual(edited.members[i], family.members[i]);
  assert.deepEqual(edited.sourceGraph, family.sourceGraph); assert.deepEqual(edited.initialComposition, family.initialComposition); assert.equal(edited.materialSource.contentHash, family.materialSource.contentHash);
  await open("Open family file", `${out}/edited.json`); const reopened = await save("Save family", "reopened"); assert.deepEqual(reopened, edited);
  assert.equal(await page.evaluate(() => globalThis.__variedFamilyCalls ?? 0), calls); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal("0.1.0"), api: z.enum(["webgpu", "webgl"]), massing: z.array(z.object({ floorCount: z.number(), bayCount: z.number() }).strict()).length(6), lights: z.array(z.object({ displayLights: z.number(), transomLights: z.number() }).strict()).length(6),
    selected: z.number().int().min(0).max(5), memberEdit: z.literal(true), siblingsAndSourceUnchanged: z.literal(true), reopened: z.literal(true),
    materialHash: z.string().regex(/^[a-f0-9]{64}$/), providerCallsDelta: z.literal(0), errors: z.array(z.string()).length(0) }).strict().parse({ schemaVersion: "0.1.0", api, massing, lights, selected, memberEdit: true, siblingsAndSourceUnchanged: true, reopened: true, materialHash: family.materialSource.contentHash, providerCallsDelta: 0, errors });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt)); await context.close();
} finally { await browser?.close(); await server.close(); }
