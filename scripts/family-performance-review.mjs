/* global document */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { z } from 'zod';

const [api, input, output] = process.argv.slice(2);
if (!['webgpu', 'webgl'].includes(api) || !input || !output || process.argv.length !== 5) {
  throw new Error('Usage: node scripts/family-performance-review.mjs <webgpu|webgl> <saved-family.json> <new-output-directory>');
}
const sourcePath = resolve(input);
const out = resolve(output);
const sourceHash = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
const scriptHash = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const receiptSchema = z.object({
  schemaVersion: z.literal('0.1.0'), recordedAt: z.iso.datetime(), revision: z.string().regex(/^[a-f0-9]{40,64}$/), trackedChanges: z.string(),
  scriptSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), api: z.enum(['webgpu', 'webgl']), chromiumVersion: z.string().min(1),
  system: z.object({ platform: z.string(), release: z.string(), architecture: z.string(), cpu: z.string().nullable(), logicalProcessors: z.number().int().positive(), totalMemoryBytes: z.number().positive(), userAgent: z.string(), hardwareConcurrency: z.number().positive(), deviceMemory: z.number().positive().nullable(), webgpuAdapter: z.object({ vendor: z.string(), architecture: z.string(), description: z.string() }).strict().nullable() }).strict(),
  viewport: z.object({ width: z.literal(1600), height: z.literal(1000) }).strict(), loadMs: z.number().nonnegative(),
  samples: z.array(z.object({ openMemberMs: z.number().nonnegative(), editMs: z.number().nonnegative(), returnMs: z.number().nonnegative(), saveMs: z.number().nonnegative() }).strict()).length(3), errors: z.array(z.string()).length(0)
}).strict();
// Refuse to overwrite an earlier review or a supplied source file.
await mkdir(out, { recursive: false });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
const server = await createServer({ cacheDir: `${out}/.vite`, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chromium', args: api === 'webgpu' ? ['--enable-unsafe-webgpu'] : [] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(forceWebgl => {
    if (forceWebgl) Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  }, api === 'webgl');
  await context.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}#document=family-performance`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const workspace = () => page.locator('.construction-workspace:visible');
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll('.construction-workspace')].some(root => root.getClientRects().length && root.querySelector('[aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'false'), undefined, { timeout: 120000 });
  await workspace().waitFor({ timeout: 120000 });
  await ready();
  if (await workspace().locator('canvas:visible').first().getAttribute('data-renderer-backend') !== api) throw new Error(`Expected ${api} renderer`);
  const loadStart = Date.now();
  await page.getByLabel('Open family file').setInputFiles(sourcePath);
  await page.waitForFunction(() => document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute('aria-busy') === 'true', undefined, { timeout: 120000 });
  await ready();
  if (await workspace().getAttribute('data-construction-preview') !== 'family') throw new Error('Family did not open');
  const loadMs = Date.now() - loadStart;
  await page.screenshot({ path: `${out}/family-before.png` });
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const openStart = Date.now();
    await page.getByRole('button', { name: 'Edit selected building' }).click();
    await page.getByRole('button', { name: 'Back to family' }).waitFor({ timeout: 120000 });
    await ready();
    const openMemberMs = Date.now() - openStart;
    await workspace().locator('summary').filter({ hasText: /^Shape$/ }).click();
    const width = page.getByLabel('Width (m)', { exact: true });
    const next = String(Number(await width.inputValue()) + (i % 2 ? -0.1 : 0.1));
    const old = await workspace().getAttribute('data-construction-hash');
    await width.fill(next);
    const editStart = Date.now();
    await page.getByRole('button', { name: 'Apply construction', exact: true }).click();
    await page.waitForFunction(hash => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionHash !== hash, old, { timeout: 120000 });
    await ready();
    const editMs = Date.now() - editStart;
    const returnStart = Date.now();
    await page.getByRole('button', { name: 'Back to family' }).click();
    await page.waitForFunction(() => document.querySelector('.construction-workspace:not([hidden])')?.dataset.constructionPreview === 'family', undefined, { timeout: 120000 });
    await ready();
    const returnMs = Date.now() - returnStart;
    const saveStart = Date.now();
    const download = page.waitForEvent('download', { timeout: 180000 });
    await page.getByRole('button', { name: 'Save family', exact: true }).click();
    await (await download).saveAs(`${out}/sample-${i}.json`);
    samples.push({ openMemberMs, editMs, returnMs, saveMs: Date.now() - saveStart });
  }
  const browserSystem = await page.evaluate(async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null, webgpuAdapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description } : null };
  });
  await page.screenshot({ path: `${out}/family-after.png` });
  if (errors.length) throw new Error(JSON.stringify(errors));
  const receipt = receiptSchema.parse({ schemaVersion: '0.1.0', recordedAt: new Date().toISOString(), revision, trackedChanges, scriptSha256: scriptHash, sourceSha256: sourceHash, api, chromiumVersion: browser.version(), system: { platform: os.platform(), release: os.release(), architecture: os.arch(), cpu: os.cpus()[0]?.model ?? null, logicalProcessors: os.cpus().length, totalMemoryBytes: os.totalmem(), ...browserSystem }, viewport: { width: 1600, height: 1000 }, loadMs, samples, errors });
  await writeFile(`${out}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
