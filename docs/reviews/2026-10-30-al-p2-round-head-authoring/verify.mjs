import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { z } from 'zod';

const api = process.argv[2], out = process.argv[3];
assert(['webgpu', 'webgl'].includes(api) && out);
await mkdir(out, { recursive: false });
const server = await createServer({ cacheDir: `${out}/.vite`, plugins: [{ name: 'observe-material-calls', enforce: 'pre', transform(code, id) {
  if (!id.replaceAll('\\', '/').endsWith('/materials/providers/proceduralMaterialProvider.ts')) return;
  return { code: code + '\nconst observedGenerate = ProceduralMaterialProvider.prototype.generate; ProceduralMaterialProvider.prototype.generate = function(...args) { globalThis.__archProviderCalls = (globalThis.__archProviderCalls ?? 0) + 1; return observedGenerate.apply(this, args); };', map: null };
} }], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chromium', args: api === 'webgpu' ? ['--enable-unsafe-webgpu'] : [] });
  const context = await browser.newContext({ viewport: { width: 1493, height: 1054 }, acceptDownloads: true });
  await context.addInitScript(disable => { if (disable) Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }); }, api === 'webgl');
  let page = await context.newPage(), errors = [];
  const wire = () => page.on('pageerror', error => errors.push(error.message)); wire();
  const url = server.resolvedUrls.local[0] + '#document=arch-review';
  const root = () => page.locator('.construction-workspace:visible');
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll('.construction-workspace')].some(el => el.getClientRects().length && el.dataset.constructionHash && el.querySelector('[aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'false'), undefined, { timeout: 120000 });
  const hash = () => root().getAttribute('data-construction-hash');
  async function open(file) {
    await page.getByLabel('Open construction file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'true', undefined, { timeout: 120000 });
    await ready();
  }
  async function save(name) {
    const download = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: 'Save construction', exact: true }).click();
    await (await download).saveAs(`${out}/${name}.json`);
    return JSON.parse(await readFile(`${out}/${name}.json`, 'utf8'));
  }
  async function waitChanged(before) { await page.waitForFunction(h => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionHash !== h, before, { timeout: 120000 }); await ready(); }
  async function shot(name) { await page.waitForTimeout(300); await root().locator('canvas:visible').first().screenshot({ path: `${out}/${name}.png` }); }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  assert.equal(await root().locator('canvas:visible').first().getAttribute('data-renderer-backend'), api);
  await open('test-results/c10-p2-2026-10-29/webgpu-04/raised-v10.json');
  const before = await save('before'), beforeHash = await hash(), providerCalls = await page.evaluate(() => globalThis.__archProviderCalls ?? 0);
  assert(providerCalls > 0, 'Provider observer must see initial setup before claiming no new calls');
  await shot('flat');
  await page.getByLabel('Upper front opening head').selectOption('1');
  await page.getByRole('button', { name: 'Apply construction', exact: true }).click(); await waitChanged(beforeHash);
  const archedHash = await hash(), arched = await save('arched');
  assert.equal(arched.schemaVersion, '0.11.0'); assert.equal(arched.graph.schemaVersion, '0.10.0');
  assert.equal(arched.graph.nodes.find(node => node.type === 'PlaceOpening').parameters.upperFrontRoundHead, 1);
  assert.equal(arched.materialSource.contentHash, before.materialSource.contentHash);
  assert.equal(await page.evaluate(() => globalThis.__archProviderCalls ?? 0), providerCalls);
  await shot('arched-whole');
  await page.locator('summary').filter({ hasText: /^View controls$/ }).click(); await page.locator('select:has(option[value="clay"])').selectOption('clay'); await shot('arched-clay-whole');
  await page.locator('select:has(option[value="clay"])').selectOption('textured'); await page.locator('summary').filter({ hasText: /^View controls$/ }).click();
  const canvas = root().locator('canvas:visible').first(), box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .58, box.y + box.height * .45); await page.mouse.wheel(0, -550); await page.waitForTimeout(1000); await shot('arched-close');
  await page.locator('summary').filter({ hasText: /^View controls$/ }).click(); await page.locator('select:has(option[value="clay"])').selectOption('clay'); await shot('arched-clay-close');
  await page.locator('select:has(option[value="clay"])').selectOption('textured'); await page.locator('summary').filter({ hasText: /^View controls$/ }).click();
  await page.getByRole('button', { name: 'Undo construction' }).click(); await waitChanged(archedHash); assert.equal(await hash(), beforeHash);
  await page.getByRole('button', { name: 'Redo construction' }).click(); await waitChanged(beforeHash); assert.equal(await hash(), archedHash);
  await open(`${out}/arched.json`); assert.equal(await hash(), archedHash);
  await page.close(); page = await context.newPage(); wire(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }); await root().waitFor({ timeout: 120000 }); await ready();
  await open(`${out}/arched.json`); assert.equal(await hash(), archedHash); const cold = await save('cold');
  assert.deepEqual(cold, arched); assert.deepEqual(errors, []);
  const receipt = z.object({ schemaVersion: z.literal('0.1.0'), api: z.enum(['webgpu', 'webgl']), beforeHash: z.string().regex(/^[a-f0-9]{64}$/), archedHash: z.string().regex(/^[a-f0-9]{64}$/), beforeMaterialHash: z.string().regex(/^[a-f0-9]{64}$/), archedMaterialHash: z.string().regex(/^[a-f0-9]{64}$/), projectVersion: z.literal('0.11.0'), graphVersion: z.literal('0.10.0'), providerCallsDelta: z.literal(0), undoRedo: z.literal(true), reopen: z.literal(true), freshPageOpen: z.literal(true), savedSourceEqual: z.literal(true), errors: z.array(z.string()).length(0) }).strict().parse({ schemaVersion: '0.1.0', api, beforeHash, archedHash, beforeMaterialHash: before.materialSource.contentHash, archedMaterialHash: arched.materialSource.contentHash, projectVersion: arched.schemaVersion, graphVersion: arched.graph.schemaVersion, providerCallsDelta: 0, undoRedo: true, reopen: true, freshPageOpen: true, savedSourceEqual: true, errors });
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ api, beforeHash, archedHash, errors })); await context.close();
} finally { await browser?.close(); await server.close(); }
