import { createServer } from "vite";
import { writeFile } from "node:fs/promises";
const server=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true},
  cacheDir:"test-results/ux2-p1-opening-geometry-2026-10-26/vite-cache",optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const {createBuildingConstructionGraph}=await server.ssrLoadModule("/src/features/building-family/contracts/bayConstructionGraph.ts");
  const {withConstructionStorefront}=await server.ssrLoadModule("/src/features/building-family/core/constructionStorefrontGraph.ts");
  const {withConstructionOpeningWidth}=await server.ssrLoadModule("/src/features/building-family/core/constructionOpeningEditGraph.ts");
  const {evaluateConstruction}=await server.ssrLoadModule("/src/features/building-family/compiler/evaluateConstruction.ts");
  const base=withConstructionStorefront(createBuildingConstructionGraph(),1);
  const target={documentId:base.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front",floorIndex:1,bayIndex:2};
  const path=`building/${base.documentId}/node/window/facade/floor/1/bay/2/`;
  const before=await evaluateConstruction(base), after=await evaluateConstruction(withConstructionOpeningWidth(base,{target,widthM:1.8}));
  function prototype(result,role) {
    const semantic=result.ir.semanticIndex.find(entry=>entry.semanticPath===path+role);
    const batch=result.ir.instanceBatches.find(entry=>entry.batchId===semantic.batchId);
    return result.prototypes.find(entry=>entry.batchId===batch.recipeId);
  }
  function reversed(geometry) {
    let count=0;
    for(let i=0;i<geometry.indices.length;i+=3) {
      const ids=Array.from(geometry.indices.slice(i,i+3)),v=ids.map(id=>Array.from(geometry.positions.slice(id*3,id*3+3)));
      const ab=v[1].map((x,j)=>x-v[0][j]),ac=v[2].map((x,j)=>x-v[0][j]);
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      if(cross.reduce((sum,x,j)=>sum+x*geometry.normals[ids[0]*3+j],0)<=0) count++;
    }
    return count;
  }
  const width=geometry=>Math.max(...geometry.positions.filter((_,i)=>i%3===0))-Math.min(...geometry.positions.filter((_,i)=>i%3===0));
  const semantic=result=>JSON.stringify(result.ir.semanticIndex.map(entry=>entry.semanticPath).sort());
  const report={schemaVersion:"0.1.0",kind:"selected-opening-compiler-probe",target,
    beforeFrameWidthM:width(prototype(before,"frame")),afterFrameWidthM:width(prototype(after,"frame")),
    legacyTrimReversedOrDegenerateTriangles:reversed(prototype(before,"trim")),editedTrimReversedOrDegenerateTriangles:reversed(prototype(after,"trim")),
    semanticIdentitiesPreserved:semantic(before)===semantic(after),beforeMetrics:before.ir.metrics,afterMetrics:after.ir.metrics};
  if(report.schemaVersion!=="0.1.0" || !report.semanticIdentitiesPreserved || report.editedTrimReversedOrDegenerateTriangles!==0 ||
     Math.abs(report.afterFrameWidthM-1.8)>1e-6 || report.legacyTrimReversedOrDegenerateTriangles<1) throw new Error("Probe validation failed");
  await writeFile("test-results/ux2-p1-opening-geometry-2026-10-26/compiler-probe.json",JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify(report)+"\n");
} finally {await server.close();}
