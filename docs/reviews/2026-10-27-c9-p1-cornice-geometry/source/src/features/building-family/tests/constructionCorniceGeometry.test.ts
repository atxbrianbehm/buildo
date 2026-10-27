import { describe, expect, it } from "vitest";
import { buildConstructionBevelledBox } from "../compiler/constructionBevelledBox";
import { buildConstructionCorniceGeometry } from "../compiler/constructionCorniceGeometry";
import { resolveConstructionCorniceDetail } from "../core/constructionCorniceDetail";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { hashCanonicalJson } from "../core/contentHash";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import type { PrimitiveGeometry } from "../compiler/primitiveGeometry";

function inspect(g: PrimitiveGeometry) {
  expect([...g.positions,...g.normals,...g.uvs].every(Number.isFinite)).toBe(true);
  const edges = new Map<string,number>(), key=(id:number)=>g.positions.slice(id*3,id*3+3).join(",");
  let volume=0;
  for(let i=0;i<g.indices.length;i+=3) {
    const ids=g.indices.slice(i,i+3),v=ids.map(id=>g.positions.slice(id*3,id*3+3));
    const ab=v[1].map((x,j)=>x-v[0][j]),ac=v[2].map((x,j)=>x-v[0][j]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const n=g.normals.slice(ids[0]*3,ids[0]*3+3);expect(Math.hypot(...n)).toBeCloseTo(1,10);
    expect(cross.reduce((sum,x,j)=>sum+x*n[j],0)).toBeGreaterThan(1e-12);
    const uv=ids.map(id=>g.uvs.slice(id*2,id*2+2));
    const uvArea=Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]));
    expect(uvArea/Math.hypot(...cross)).toBeCloseTo(1,7);
    for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join("|");edges.set(edge,(edges.get(edge)??0)+1);}
    volume+=(v[0][0]*(v[1][1]*v[2][2]-v[1][2]*v[2][1])+v[0][1]*(v[1][2]*v[2][0]-v[1][0]*v[2][2])+v[0][2]*(v[1][0]*v[2][1]-v[1][1]*v[2][0]))/6;
  }
  expect([...edges.values()].every(count=>count===2)).toBe(true);expect(volume).toBeGreaterThan(0);return volume;
}
const source = (assembly: "moulded"|"dentil-course"|"bracket-course", heightM=.3,projectionM=.24) => ({
  schemaVersion:"0.1.0",kind:"construction-cornice-detail-request",assembly,
  building:{widthM:11.2,depthM:8.4,heightM:11.4},cornice:{heightM,projectionM}
});
const roofOf=(graph:ReturnType<typeof createBuildingConstructionGraph>)=>graph.nodes.find(node=>node.type==="BuildingRoof")!;
const modern = () => {
  const graph=withConstructionStorefront(withConstructionWindowLayout(createBuildingConstructionGraph(),"window",2),1);
  return withConstructionOpeningWidth(graph,{target:{documentId:graph.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front",floorIndex:1,bayIndex:2},widthM:1.8});
};

describe("closed procedural cornice geometry", () => {
  it.each([[.16,.04,.1,.003],[.065,.015,.0284,.0012],[.39,.09,.134,.0072]])("builds a true bevelled block %s/%s/%s",(x,y,z,bevelM)=>{
    const g=buildConstructionBevelledBox({center:[0,0,0],size:[x,y,z],bevelM});
    expect(g.indices.length/3).toBe(44);
    expect(inspect(g)).toBeCloseTo(x*y*z-2*bevelM**2*(x+y+z)+16/3*bevelM**3,12);
    expect(g.bounds).toEqual({min:[-x/2,-y/2,-z/2],max:[x/2,y/2,z/2]});
  });
  it("rejects collapsed, non-finite and overlarge bevels before geometry allocation",()=>{
    for(const bevelM of [0,-.01,.05,NaN,Infinity])expect(()=>buildConstructionBevelledBox({center:[0,0,0],size:[.1,.1,.1],bevelM})).toThrow();
    expect(()=>buildConstructionBevelledBox({center:[0,Infinity,0],size:[.1,.1,.1],bevelM:.01})).toThrow();
    expect(()=>Reflect.apply(buildConstructionBevelledBox,null,[{center:[0,0],size:[.1,.1,.1],bevelM:.01}])).toThrow();
  });
  it.each(["moulded","dentil-course","bracket-course"] as const)("closes %s backing and units with noncollapsed physical UVs",assembly=>{
    const plan=resolveConstructionCorniceDetail(source(assembly)),before=structuredClone(plan),g=buildConstructionCorniceGeometry(plan);
    inspect(g.backing);expect(g.units).toHaveLength(plan.units.length);expect(plan).toEqual(before);
    for(const face of plan.faces) {
      const first=plan.units.findIndex(unit=>unit.face===face.face);
      if(first>=0){inspect(g.units[first]);inspect(g.units[first+face.count-1]);}
    }
    if(g.units.length>1){g.units[0].uvs[0]=999;expect(g.units[1].uvs[0]).not.toBe(999);}
  });
  it.each([[.1,.08],[.6,.4]])("retains real corner clearance and envelope containment at %s/%s",(heightM,projectionM)=>{
    for(const assembly of ["dentil-course","bracket-course"] as const){
      const plan=resolveConstructionCorniceDetail(source(assembly,heightM,projectionM)),g=buildConstructionCorniceGeometry(plan),b=plan.source.building;
      function outer(y:number){const p=plan.envelopeProfile;for(let j=0;j<p.length-2;j++)if(y>=p[j].yM-1e-9&&y<=p[j+1].yM+1e-9)
        return p[j].depthM+(p[j+1].depthM-p[j].depthM)*(y-p[j].yM)/(p[j+1].yM-p[j].yM);throw new Error("Outside envelope");}
      for(const [i,unit] of plan.units.entries()){
        const face=plan.faces.find(face=>face.face===unit.face)!,p=g.units[i].positions;
        for(let j=0;j<p.length;j+=3){const [x,y,z]=p.slice(j,j+3);
          const depth=unit.face==="front"?z-b.depthM/2:unit.face==="rear"?-z-b.depthM/2:unit.face==="right"?x-b.widthM/2:-x-b.widthM/2;
          const along=unit.face==="front"?x:unit.face==="rear"?-x:unit.face==="right"?-z:z;
          expect(depth).toBeGreaterThan(0);expect(depth).toBeLessThanOrEqual(outer(y)+1e-9);
          expect(Math.abs(along)).toBeLessThanOrEqual(face.spanM/2-face.endInsetM+1e-9);
        }
      }
    }
  });
  it("rejects a tampered derived plan rather than generating a repaired mesh",()=>{
    const plan=resolveConstructionCorniceDetail(source("dentil-course"));plan.units[0].centerAlongM+=.01;
    expect(()=>buildConstructionCorniceGeometry(plan)).toThrow(/does not match/);
  });
  it("gives the bracket exact trapezoid-area end caps and physical solid volume",()=>{
    const plan=resolveConstructionCorniceDetail(source("bracket-course"));
    if(plan.recipe.kind!=="bracket")throw new Error("Expected bracket");
    const recipe=plan.recipe,g=buildConstructionCorniceGeometry(plan).units[0],areas=[0,0];
    const expected=recipe.profile.slice(1).reduce((sum,p,i)=>sum+(p.yM-recipe.profile[i].yM)*(p.depthM+recipe.profile[i].depthM-2*recipe.backDepthM)/2,0);
    for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),n=g.normals[ids[0]*3];if(Math.abs(n)<.99)continue;
      const v=ids.map(id=>g.positions.slice(id*3,id*3+3));areas[n>0?1:0]+=Math.abs((v[1][1]-v[0][1])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][1]-v[0][1]))/2;}
    for(const area of areas)expect(area).toBeCloseTo(expected,11);
    expect(inspect(g)).toBeCloseTo(expected*recipe.widthM,10);
  });
  it("honours the full 512-unit allocation boundary with bounded valid indices",()=>{
    const input=source("dentil-course"),width=input.cornice.heightM*.65;
    input.building.widthM=input.building.depthM=127*width*2+width+.24;
    const plan=resolveConstructionCorniceDetail(input),g=buildConstructionCorniceGeometry(plan);
    expect(g.units).toHaveLength(512);expect(g.units.reduce((sum,unit)=>sum+unit.positions.length/3,0)).toBe(512*96);
    for(const unit of [g.units[0],g.units.at(-1)!])expect(unit.indices.every(index=>index<unit.positions.length/3)).toBe(true);
  });
});

describe("explicit cornice graph and worker admission",()=>{
  it("owns migration, retains authored assemblies/widths/finishes and preserves every non-cornice buffer",async()=>{
    const base=modern(),before=structuredClone(base),old=await evaluateConstruction(base);
    for(const layout of [0,1,2] as const){
      const graph=withConstructionCorniceLayout(base,layout),result=await evaluateConstruction(graph);expect(base).toEqual(before);expect(graph.schemaVersion).toBe("0.8.0");
      expect(roofOf(graph).parameters.corniceAssembly).toBe(layout);expect(result.ir.bounds).toEqual(old.ir.bounds);
      expect(result.prototypes).toEqual(old.prototypes);expect(result.ir.instanceBatches).toEqual(old.ir.instanceBatches);expect(result.ir.semanticIndex).toEqual(old.ir.semanticIndex);
      for(const batch of old.ir.meshBatches)if(!batch.batchId.endsWith("/cornice"))expect(result.ir.meshBatches.find(next=>next.batchId===batch.batchId)).toEqual(batch);
      expect(result.surfaceComposition).toEqual(old.surfaceComposition);
      const cornice=(value:typeof result)=>value.ir.meshBatches.find(batch=>batch.batchId.endsWith("/cornice"))!;
      if(layout===0)expect(cornice(result)).toEqual(cornice(old));else expect(cornice(result).indices!.length).toBeGreaterThan(cornice(old).indices!.length);
      expect(await evaluateConstruction(graph)).toEqual(result);
    }
  });
  it("keeps literal old readers/default output and supports explicit oldest/current migration",async()=>{
    const old=createBuildingConstructionGraph(),before=structuredClone(old);
    expect(BayConstructionGraphSchema.parse(old)).toEqual(old);
    expect(await hashCanonicalJson(await evaluateConstruction(old))).toBe("6d29b0a682efe0139bfe0016355bdc34ae0a914c1912a9bf01359ea4d4900691");
    const graph=withConstructionCorniceLayout(old,1);expect(old).toEqual(before);
    expect(withConstructionCorniceLayout(graph,2).schemaVersion).toBe("0.8.0");expect(roofOf(withConstructionCorniceLayout(graph,0)).parameters.corniceAssembly).toBe(0);
  });
  it("rejects downgrade, missing/invalid treatment, hostile source and custom topology",()=>{
    const graph=withConstructionCorniceLayout(modern(),1),missing=structuredClone(graph);delete roofOf(missing).parameters.corniceAssembly;
    expect(BayConstructionGraphSchema.safeParse(missing).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({...graph,schemaVersion:"0.7.0"}).success).toBe(false);
    for(const value of [-1,3,.5,"1",null])expect(()=>withConstructionCorniceLayout(modern(),value as 1)).toThrow();
    const custom=modern();custom.nodes.find(node=>node.type==="EmitWall")!.input.nodeId="frontage";
    expect(()=>withConstructionCorniceLayout(custom,1)).toThrow(/registered/);
    let calls=0;const hostile=Object.defineProperty(modern(),"schemaVersion",{get(){calls++;return "0.7.0";}});
    expect(()=>withConstructionCorniceLayout(hostile,1)).toThrow();expect(calls).toBe(0);
  });
  it("matches actual compiled graph/worker0.8 and rejects older protocol tags",async()=>{
    const graph=withConstructionCorniceLayout(modern(),2),result=await evaluateConstruction(graph);
    expect(BayConstructionWorkerRequestSchema.safeParse({schemaVersion:"0.8.0",type:"evaluate-bay",requestId:1,graph}).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({schemaVersion:"0.8.0",type:"bay-result",requestId:1,result}).success).toBe(true);
    for(const schemaVersion of ["0.4.0","0.5.0","0.6.0","0.7.0"]){
      expect(BayConstructionWorkerRequestSchema.safeParse({schemaVersion,type:"evaluate-bay",requestId:1,graph}).success).toBe(false);
      expect(BayConstructionWorkerReplySchema.safeParse({schemaVersion,type:"bay-result",requestId:1,result}).success).toBe(false);
    }
  });
  it("changes only cornice geometry for height/projection and rejects over-budget active details while respecting bypass",async()=>{
    const graph=withConstructionCorniceLayout(modern(),1),before=await evaluateConstruction(graph);
    roofOf(graph).parameters.corniceHeightM=.45;roofOf(graph).parameters.corniceProjectionM=.3;
    const after=await evaluateConstruction(graph);
    for(const batch of before.ir.meshBatches)if(!batch.batchId.endsWith("/cornice"))expect(after.ir.meshBatches.find(next=>next.batchId===batch.batchId)).toEqual(batch);
    expect(after.prototypes).toEqual(before.prototypes);expect(after.ir.instanceBatches).toEqual(before.ir.instanceBatches);
    expect(after.ir.meshBatches.find(batch=>batch.batchId.endsWith("/cornice"))!.positions).not.toEqual(before.ir.meshBatches.find(batch=>batch.batchId.endsWith("/cornice"))!.positions);
    const large=withConstructionCorniceLayout(createBuildingConstructionGraph(),1),footprint=large.nodes.find(node=>node.type==="Footprint")!;
    footprint.parameters.widthM=footprint.parameters.depthM=100;roofOf(large).parameters.corniceHeightM=.1;
    await expect(evaluateConstruction(large)).rejects.toThrow(/512-unit/);
    roofOf(large).bypassed=true;expect((await evaluateConstruction(large)).ir.meshBatches.some(batch=>batch.batchId.includes("/node/roof/"))).toBe(false);
  });
});
