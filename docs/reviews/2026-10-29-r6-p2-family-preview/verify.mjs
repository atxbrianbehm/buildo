import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const api = process.argv[2], out = `test-results/r6-p2-preview/${api}`; await mkdir(out,{recursive:true});
const server=await createServer({cacheDir:`${out}/vite`,plugins:[{name:'observe-family',enforce:'pre',transform(code,id){
 if(id.replaceAll('\\','/').endsWith('/ui/BayConstructionWorkbench.tsx')) return {code:code.replace('const candidate = await prepareConstructionFamilyFixture(base, family.members.map(member => member.construction), source.materials, signal);', 'const candidate = await prepareConstructionFamilyFixture(base, family.members.map(member => member.construction), source.materials, signal); globalThis.__familyCandidate = candidate;'),map:null};
}}],server:{host:'127.0.0.1',port:0}});
let browser; const errors=[];
try {
 await server.listen(); browser=await chromium.launch({channel:'chromium',args:api==='webgpu'?['--enable-unsafe-webgpu']:[]});
 const context=await browser.newContext({viewport:{width:1800,height:1100}}); await context.addInitScript(disable=>{if(disable)Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true})},api==='webgl');
 const page=await context.newPage();await context.route('**/favicon.ico',route=>route.fulfill({status:204}));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(server.resolvedUrls.local[0]+'#document=r6-family-review',{waitUntil:'domcontentloaded',timeout:120000});
 const workspace=page.locator('.construction-workspace');await workspace.waitFor({timeout:120000});
 async function ready(){await page.waitForFunction(()=>document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute('aria-busy')==='false',undefined,{timeout:120000});}
 await ready();const input='test-results/c10-p2-2026-10-29/webgpu-04/raised-v10.json', source=JSON.parse(await readFile(input,'utf8'));
 await page.getByLabel('Open construction file').setInputFiles(input);await page.waitForFunction(()=>document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute('aria-busy')==='true',undefined,{timeout:120000});await ready();
 const started=Date.now();await page.getByRole('button',{name:'Preview family'}).click();await page.waitForFunction(()=>document.querySelector('.construction-workspace')?.dataset.constructionPreview==='family',undefined,{timeout:120000});await ready();const previewMs=Date.now()-started;
 const canvas=workspace.locator('canvas:visible').first();assert.equal(await canvas.getAttribute('data-renderer-backend'),api);
 const state=await page.evaluate(()=>{const f=globalThis.__familyCandidate;return {ids:f.familyRuntime.listBuildingIds(),metrics:f.familyRuntime.metrics,positions:[...f.familyRuntime.buildingRuntimes.values()].map(r=>r.root.position.x),shared:[...f.familyRuntime.buildingRuntimes.values()].every(r=>r.materialRegistry===f.familyRuntime.materialRegistry),atlas:f.packedAtlas.contentHash}});
 assert.equal(state.ids.length,6);assert(state.shared);await canvas.screenshot({path:out+'/family.png'});await page.screenshot({path:out+'/workspace.png'});
 await page.getByRole('button',{name:'Return to building'}).click();await page.waitForFunction(()=>document.querySelector('.construction-workspace')?.dataset.constructionPreview==='output',undefined,{timeout:120000});await ready();
 const disposed=await page.evaluate(()=>globalThis.__familyCandidate.familyRuntime.disposed);assert(disposed);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save construction',exact:true}).click();await (await download).saveAs(out+'/returned.json');
 const saved=JSON.parse(await readFile(out+'/returned.json','utf8'));assert.equal(saved.contentHash,source.contentHash);assert.equal(saved.materialSource.contentHash,source.materialSource.contentHash);
 await page.getByLabel('Open construction file').setInputFiles(out+'/returned.json');await page.waitForFunction(()=>document.querySelector('.construction-workspace [aria-label="Construction inspector"]')?.getAttribute('aria-busy')==='true',undefined,{timeout:120000});await ready();assert.deepEqual(errors,[]);
 await writeFile(out+'/receipt.json',JSON.stringify({state,disposed,previewMs,reopenedSourceHash:saved.contentHash,errors},null,2));console.log(JSON.stringify({api,...state,disposed,previewMs}));
} finally {await browser?.close();await server.close()}
