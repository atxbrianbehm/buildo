import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { upgradeConstructionWindowVocabulary, withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { buildBayWindowGeometry } from "../compiler/bayWindowGeometry";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { hashCanonicalJson } from "../core/contentHash";
import { constructionRecipeReference } from "../core/constructionRecipeCatalog";
import { ConstructionHistory } from "../state/constructionHistory";
import { setConstructionSurface } from "../core/constructionSurfaceAuthoring";

const windowOf = (graph: ReturnType<typeof createBuildingConstructionGraph>) => graph.nodes.find(node => node.type === "AssembleWindow")!;
describe("versioned procedural window vocabulary", () => {
  it("pins the corrected legacy-source compiler result and all original recipes", async () => {
    expect(await hashCanonicalJson(await evaluateConstruction(createBuildingConstructionGraph()))).toBe("3fa73210cad319eb1a5f3320fac9907af68a4cee766298c7bdc06961968a0c47");
    for (const [id,hash] of [["restrained-masonry-rectangular","49ea533925dba5b5b0a59612bc8449685dc84437f990e2388f80acd946766add"],["deep-reveal-masonry","36a9abd965c3325b5aee39f38c8d6ddb8fccbc884b55005ecf6b00a8fbfcf3c3"],["projecting-cornice-masonry","c3f453f7f39c52cdae80e08d7b48635a1f2de1980fd45f4db5bda4841714dee3"]])
      expect((await constructionRecipeReference(id)).contentHash).toBe(hash);
  });
  it("migrates only by explicit action and owns every parameter", async () => {
    const original=createBuildingConstructionGraph(),before=structuredClone(original),graph=upgradeConstructionWindowVocabulary(original);
    expect(graph.schemaVersion).toBe("0.5.0");expect(windowOf(graph).parameters.layout).toBe(0);
    windowOf(graph).parameters.recessM=.2;expect(original).toEqual(before);
    expect(windowOf(BayConstructionGraphSchema.parse(original)).parameters).not.toHaveProperty("layout");
    const a=await evaluateConstruction(original),b=await evaluateConstruction(upgradeConstructionWindowVocabulary(original));
    expect(a.ir.meshBatches).toEqual(b.ir.meshBatches);
    expect(a.prototypes!.map(({positions,normals,uvs,indices})=>({positions,normals,uvs,indices}))).toEqual(b.prototypes!.map(({positions,normals,uvs,indices})=>({positions,normals,uvs,indices})));
  });
  it.each([-1,3,.5,"1",null])("rejects an unsupported serialized assembly code %s",value=>{
    const graph=upgradeConstructionWindowVocabulary(createBuildingConstructionGraph());Object.assign(windowOf(graph).parameters,{layout:value});expect(BayConstructionGraphSchema.safeParse(graph).success).toBe(false);
  });
  it("rejects downgrade, missing layout, unknown fields and unsupported migration roots",()=>{
    const graph=upgradeConstructionWindowVocabulary(createBuildingConstructionGraph());expect(BayConstructionGraphSchema.safeParse({...graph,schemaVersion:"0.4.0"}).success).toBe(false);
    delete windowOf(graph).parameters.layout;expect(BayConstructionGraphSchema.safeParse(graph).success).toBe(false);
    expect(()=>withConstructionWindowLayout(createBuildingConstructionGraph(),"roof",1)).toThrow("actual window");
    const custom=upgradeConstructionWindowVocabulary(createBuildingConstructionGraph());Object.assign(windowOf(custom).parameters,{mystery:1});expect(BayConstructionGraphSchema.safeParse(custom).success).toBe(false);
  });
  it("uses distinct shared prototypes with unchanged walls, doors, roof, transforms and semantic addresses",async()=>{
    const original=createBuildingConstructionGraph(),a=await evaluateConstruction(original),b=await evaluateConstruction(withConstructionWindowLayout(original,"window",1)),c=await evaluateConstruction(withConstructionWindowLayout(original,"window",2));
    expect(b.ir.meshBatches).toEqual(a.ir.meshBatches);expect(c.ir.meshBatches).toEqual(a.ir.meshBatches);
    const addresses=(x:typeof a)=>x.ir.semanticIndex.map(({semanticPath,stage,elementIndex})=>({semanticPath,stage,elementIndex}));
    expect(addresses(b)).toEqual(addresses(a));expect(addresses(c)).toEqual(addresses(a));
    expect(b.ir.instanceBatches.map(x=>({count:x.count,transforms:x.transforms}))).toEqual(a.ir.instanceBatches.map(x=>({count:x.count,transforms:x.transforms})));
    expect(c.ir.instanceBatches.map(x=>x.count)).toEqual([47,47,47]);
    const glass=(x:typeof a)=>x.prototypes!.find(p=>p.role==="glass")!.positions!;
    expect(glass(b)).not.toEqual(glass(a));expect(glass(c)).toHaveLength(6*24*3);expect(glass(b)).toHaveLength(2*24*3);
    expect(b.prototypes!.map(x=>x.materialSlotId)).toEqual(a.prototypes!.map(x=>x.materialSlotId));
    expect(await evaluateConstruction(withConstructionWindowLayout(original,"window",2))).toEqual(c);
  });
  it.each([1,2] as const)("builds finite, outward, nondegenerate metre-UV geometry for layout %i",layout=>{
    const parts=buildBayWindowGeometry(1.22,2.12,.055,.14,1.84,true,layout);
    expect(parts.glass).toHaveLength(layout===2?6:2);
    for(const part of [...parts.frame,...parts.glass]) {
      expect([...part.positions,...part.normals,...part.uvs].every(Number.isFinite)).toBe(true);
      for(let i=0;i<part.indices.length;i+=3) {
        const ids=part.indices.slice(i,i+3),v=ids.map(j=>part.positions.slice(j*3,j*3+3));
        const ab=v[1].map((x,j)=>x-v[0][j]),ac=v[2].map((x,j)=>x-v[0][j]);
        const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
        expect(Math.hypot(...cross)).toBeGreaterThan(1e-12);
        const n=part.normals.slice(ids[0]*3,ids[0]*3+3);expect(cross.reduce((sum,x,j)=>sum+x*n[j],0)).toBeGreaterThan(0);
        const uv=ids.map(j=>part.uvs.slice(j*2,j*2+2));expect(Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))).toBeGreaterThan(1e-12);
      }
    }
  });
  it("rejects infeasible glazing without mutating an accepted source",async()=>{
    const graph=withConstructionWindowLayout(createBuildingConstructionGraph(),"window",2);windowOf(graph).parameters.frameWidthM=.2;graph.nodes.find(n=>n.type==="PlaceOpening")!.parameters.widthM=.9;const before=structuredClone(graph);
    await expect(evaluateConstruction(graph)).rejects.toThrow("Casement glazing does not fit");expect(graph).toEqual(before);
  });
  it("requires matching worker protocol and retains surface instructions",async()=>{
    const graph=withConstructionWindowLayout(createBuildingConstructionGraph(),"window",2),result=await evaluateConstruction(graph);
    const request={schemaVersion:"0.5.0",type:"evaluate-bay",requestId:1,graph};expect(BayConstructionWorkerRequestSchema.safeParse(request).success).toBe(true);expect(BayConstructionWorkerRequestSchema.safeParse({...request,schemaVersion:"0.4.0"}).success).toBe(false);
    const reply={schemaVersion:"0.5.0",type:"bay-result",requestId:1,result};expect(BayConstructionWorkerReplySchema.safeParse(reply).success).toBe(true);expect(BayConstructionWorkerReplySchema.safeParse({...reply,schemaVersion:"0.4.0"}).success).toBe(false);
  });
  it("preserves schema, composition and legacy undo through serialized history",()=>{
    const old=createBuildingConstructionGraph(),one=withConstructionWindowLayout(old,"window",1),two=withConstructionWindowLayout(one,"window",2),history=new ConstructionHistory();
    history.record(old,"a".repeat(64));history.record(one,"a".repeat(64));history.record(two,"a".repeat(64));const restored=new ConstructionHistory(JSON.parse(JSON.stringify(history.snapshot())));
    expect(restored.target("undo")).toEqual(one);restored.acceptTraversal("undo",one);expect(restored.target("undo")).toEqual(old);expect(restored.target("redo")).toEqual(two);
    const composition=structuredClone(two.nodes.find(n=>n.type==="SetSurface")!.composition);composition.revision++;
    const finished=setConstructionSurface(two,composition);expect(finished.schemaVersion).toBe("0.5.0");expect(windowOf(finished).parameters.layout).toBe(2);expect(finished.nodes.find(n=>n.type==="SetSurface")!.composition).toEqual(composition);
  });
});
