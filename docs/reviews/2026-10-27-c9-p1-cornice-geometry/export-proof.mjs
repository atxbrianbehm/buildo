import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='test-results/c9-p1-cornice-geometry-2026-10-27';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const server=await createServer({cacheDir:out+'/.vite',appType:'custom',server:{middlewareMode:true,hmr:false,host:'127.0.0.1'}});
try {
 const {withConstructionCorniceLayout}=await server.ssrLoadModule('/src/features/building-family/core/constructionCorniceVocabulary.ts');
 const {evaluateConstruction}=await server.ssrLoadModule('/src/features/building-family/compiler/evaluateConstruction.ts');
 const bytes=await readFile('test-results/t2-regular-trim-recovery-2026-10-26/final-02-webgl/final-textured-v8.json');
 const project=JSON.parse(bytes),original=JSON.stringify(project),before=await evaluateConstruction(project.graph);
 const protectedResult=r=>({meshes:r.ir.meshBatches.filter(b=>!b.batchId.endsWith('/cornice')),prototypes:r.prototypes,instances:r.ir.instanceBatches,semantics:r.ir.semanticIndex,bounds:r.ir.bounds,surface:r.surfaceComposition});
 const cases=[];await mkdir(out+'/graphs',{recursive:true});
 for(const [layout,name] of [[0,'moulded'],[1,'dentil-course'],[2,'bracket-course']]){
  const graph=withConstructionCorniceLayout(project.graph,layout),result=await evaluateConstruction(graph);
  assert.deepEqual(protectedResult(result),protectedResult(before));assert.equal(JSON.stringify(project),original);
  const cornice=result.ir.meshBatches.find(b=>b.batchId.endsWith('/cornice'));
  if(layout===0)assert.deepEqual(cornice,before.ir.meshBatches.find(b=>b.batchId.endsWith('/cornice')));
  assert.deepEqual(await evaluateConstruction(graph),result);
  await writeFile(out+'/graphs/'+name+'.json',JSON.stringify(graph,null,2));
  cases.push({layout,name,graphVersion:graph.schemaVersion,corniceVertices:cornice.positions.length/3,corniceTriangles:cornice.indices.length/3,corniceHash:hash(cornice),protectedHash:hash(protectedResult(result)),protectedPartsExact:true,mouldedExact:layout===0?true:null,repeatedEvaluationExact:true,graphSha256:hash(graph)});
 }
 const proof={schemaVersion:'0.1.0',kind:'cornice-p1-compiler-proof',sourceProjectSha256:createHash('sha256').update(bytes).digest('hex'),originalSourceExact:true,providerOrMaterialCalls:0,productControlsAndPortableContinuationPendingP2:true,cases};
 await writeFile(out+'/compiler-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}finally{await server.close();}
