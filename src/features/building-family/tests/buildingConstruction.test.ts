import { createBuildingConstructionGraph, BayConstructionGraphSchema, createBayConstructionGraph, repeatBayAsFacade } from "../contracts/bayConstructionGraph";
import { completeFacadeAsBuilding, constructionUsesOperator, emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { constructionFacadeSolid, constructionFacePose, constructionProfileRing, poseMatrix } from "../compiler/buildingShellGeometry";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import type { FacadeBayScope } from "../compiler/facadeWallSubdivision";

it("constructs four continuous walls, forty-seven shared window assemblies, a paneled entrance and a complete roof", async () => {
  const graph=createBuildingConstructionGraph(),result=await evaluateConstruction(graph);
  expect(result.ir.instanceBatches.map(batch=>batch.count)).toEqual([47,47,47]);expect(result.prototypes).toHaveLength(3);
  expect(result.ir.meshBatches.filter(batch=>batch.role==="wall")).toHaveLength(4);
  expect(result.ir.meshBatches.filter(batch=>batch.batchId.includes("/node/door/"))).toHaveLength(5);
  expect(result.ir.meshBatches.filter(batch=>batch.batchId.includes("/node/roof/"))).toHaveLength(3);
  expect(result.ir.bounds.max[1]).toBeCloseTo(12.045);expect(result.ir.bounds.max[2]).toBeGreaterThan(4.2);expect(result.ir.bounds.min[2]).toBeLessThan(-4.2);
  const paths=result.ir.semanticIndex.map(entry=>entry.semanticPath);
  for(const suffix of ["facade/floor/1/bay/1/frame","facade/right/floor/1/bay/1/frame","facade/rear/floor/1/bay/1/frame","facade/left/floor/1/bay/1/frame"])expect(paths.some(path=>path.endsWith(suffix))).toBe(true);
  expect(paths).not.toContain(`building/${graph.documentId}/node/window/facade/floor/0/bay/1/frame`);
  expect(paths).toContain(`building/${graph.documentId}/node/door/facade/floor/0/bay/1/frame`);
  expect(await evaluateConstruction(graph)).toEqual(result);
});
it("submits exact quarter-turn poses and retains accepted window solids with metric timber coordinates",async()=>{
  const graph=createBuildingConstructionGraph(),whole=await evaluateConstruction(graph),legacy=await evaluateConstruction(repeatBayAsFacade(createBayConstructionGraph()));
  for(const prototype of whole.prototypes!){const previous=legacy.prototypes!.find(batch=>batch.role===prototype.role)!;
    expect(prototype.positions).toEqual(previous.positions);expect(prototype.normals).toEqual(previous.normals);expect(prototype.indices).toEqual(previous.indices);
    if(prototype.role === 'frame'){expect(prototype.uvs!.some(value=>value>1)).toBe(true);expect(previous.uvs!.every(value=>value===0)).toBe(true);}
  }
  const frames=whole.ir.instanceBatches.find(batch=>batch.recipeId.includes("prototype.frame"))!;
  for(const face of ["front","right","rear","left"] as const){
    const suffix=face==="front"?"facade/floor/1/bay/0/frame":`facade/${face}/floor/1/bay/0/frame`;
    const entry=whole.ir.semanticIndex.find(entry=>entry.semanticPath.endsWith(suffix))!;
    const pose=constructionFacePose(face,{widthM:11.2,depthM:8.4,wallDepthM:.36}),span=face==="front"||face==="rear"?11.2:8.4;
    expect([...frames.transforms!.slice(entry.elementIndex!*16,(entry.elementIndex!+1)*16)]).toEqual([...new Float32Array(poseMatrix([-span/2+span/8,4,0],pose))]);
  }
  const old=poseMatrix([1,2,3]);expect(Object.is(old[2],-0)).toBe(false);
});
it("derives roof and all facade heights from storeys and responds causally to footprint changes",async()=>{
  const graph=createBuildingConstructionGraph(),base=await evaluateConstruction(graph);
  graph.nodes.find(node=>node.type==="Footprint")!.parameters.depthM=11.2;
  const deep=await evaluateConstruction(graph);expect(deep.ir.bounds.max[2]).toBeGreaterThan(base.ir.bounds.max[2]);expect(deep.prototypes).toEqual(base.prototypes);
  graph.nodes.find(node=>node.type==="Storeys")!.parameters.count=2;
  const short=await evaluateConstruction(graph);expect(short.ir.bounds.max[1]).toBeCloseTo(8.345);expect(short.ir.instanceBatches[0].count).toBe(31);
  const footprint=await evaluateConstruction(graph,"footprint");expect(footprint.ir.instanceBatches).toHaveLength(0);expect(footprint.previewNodeId).toBe("footprint");expect(footprint.surfaceComposition).toBeUndefined();
});
it("rejects old versions, wrong footprint ports, missing entrance bays and impossible door/recess dimensions",async()=>{
  const graph=createBuildingConstructionGraph();expect(BayConstructionGraphSchema.safeParse({...graph,schemaVersion:"0.3.0"}).success).toBe(false);
  const wrong=structuredClone(graph);wrong.nodes.find(node=>node.type==="Storeys")!.input.nodeId="window";expect(BayConstructionGraphSchema.safeParse(wrong).success).toBe(false);
  for(const kind of ["bay","leaf","recess"]){const invalid=structuredClone(graph);
    if(kind==="bay")invalid.nodes.find(node=>node.type==="PlaceDoor")!.parameters.bayIndex=19;
    if(kind==="leaf")invalid.nodes.find(node=>node.type==="AssembleDoor")!.parameters.leafHeightM=2.7;
    if(kind==="recess")invalid.nodes.find(node=>node.type==="AssembleDoor")!.parameters.recessM=.3;
    await expect(evaluateConstruction(invalid)).rejects.toThrow();
  }
});
it("requires the explicit full-building worker protocol and admits the actual pure result",async()=>{
  const graph=createBuildingConstructionGraph(),result=await evaluateConstruction(graph);
  const request={schemaVersion:"0.4.0",type:"evaluate-bay",requestId:1,graph};expect(BayConstructionWorkerRequestSchema.safeParse(request).success).toBe(true);expect(BayConstructionWorkerRequestSchema.safeParse({...request,schemaVersion:"0.3.0"}).success).toBe(false);
  const reply={schemaVersion:"0.4.0",type:"bay-result",requestId:1,result};expect(BayConstructionWorkerReplySchema.safeParse(reply).success).toBe(true);expect(BayConstructionWorkerReplySchema.safeParse({...reply,schemaVersion:"0.3.0"}).success).toBe(false);
});
it("omits internal wall caps and leaves a door aperture open down to the threshold",()=>{
  const scopes:FacadeBayScope[]=[0,1].map(bay=>({facade:"front",floorIndex:0,bayIndex:bay,zone:"ground",originM:[bay*2,0,-.36],sizeM:[2,4,.36]}));
  const solid=constructionFacadeSolid(scopes);expect(solid.normals.filter((_,i)=>i%3===0&&Math.abs(solid.normals[i])>.9)).toHaveLength(8);
  const door=structuredClone(scopes);door[0].opening={kind:"door",widthM:1,heightM:2.8,centerAlongM:1,centerYM:1.4};
  const punched=constructionFacadeSolid(door);
  for(let i=0;i<punched.positions.length;i+=12)if(punched.normals[i+2]>.9){const x=(punched.positions[i]+punched.positions[i+3])/2,y=(punched.positions[i+1]+punched.positions[i+7])/2;expect(x>.5&&x<1.5&&y<2.8).toBe(false);}
});
it("builds closed mitred profile rings with outward unit normals and shared corner coordinates",()=>{
  const ring=constructionProfileRing(10,8,[{y:3,offset:0},{y:3,offset:.2},{y:3.2,offset:.2},{y:3.2,offset:0}]);
  expect(ring.positions.length/3).toBe(64);expect(ring.indices.length/3).toBe(32);
  for(let i=0;i<ring.normals.length;i+=3)expect(Math.hypot(...ring.normals.slice(i,i+3))).toBeCloseTo(1);
  expect(ring.bounds).toEqual({min:[-5.2,3,-4.2],max:[5.2,3.2,4.2]});
});

it("completes the standard saved facade while retaining its front geometry parameters, finish authority and source",async()=>{
  const original=repeatBayAsFacade(createBayConstructionGraph()),comp=emptyConstructionComposition(original.documentId);comp.revision=8;
  const source=setConstructionSurface(original,comp),before=JSON.stringify(source),whole=completeFacadeAsBuilding(source);
  expect(JSON.stringify(source)).toBe(before);expect(whole.schemaVersion).toBe("0.4.0");expect(whole.documentId).toBe(source.documentId);
  expect(whole.nodes.find(node=>node.type==='SetSurface')!.composition).toEqual(comp);
  const old=await evaluateConstruction(source),next=await evaluateConstruction(whole);
  for(const prototype of next.prototypes!){const previous=old.prototypes!.find(batch=>batch.role===prototype.role)!;expect(prototype.positions).toEqual(previous.positions);expect(prototype.normals).toEqual(previous.normals);expect(prototype.indices).toEqual(previous.indices);}
  expect(whole.nodes.find(node=>node.type==='Storeys')!.parameters.groundHeightM).toBeCloseTo(3.8);
  const custom=structuredClone(source);custom.nodes.push({id:'custom',type:'FacadeScope',parameters:{widthM:2,heightM:3,wallDepthM:.3}});
  expect(()=>completeFacadeAsBuilding(custom)).toThrow('custom branches');
});
it("keeps unconnected whole-building operators transient on an original bay",async()=>{
  const original=createBayConstructionGraph(),before=await evaluateConstruction(original);
  const graph=BayConstructionGraphSchema.parse({...original,schemaVersion:'0.4.0',nodes:[...original.nodes,{id:'footprint',type:'Footprint',parameters:{widthM:10,depthM:8,wallDepthM:.36}}]});
  const after=await evaluateConstruction(graph);expect({...after.ir,sourceGraphHash:''}).toEqual({...before.ir,sourceGraphHash:''});expect(constructionUsesOperator(graph,'Footprint')).toBe(false);
});

it("gives timber reveals, end caps and horizontal profile faces nondegenerate physical texture coordinates",async()=>{
  const result=await evaluateConstruction(createBuildingConstructionGraph());
  const frame=result.prototypes!.find(prototype=>prototype.role==='frame')!;
  const band=result.ir.meshBatches.find(batch=>batch.batchId.includes('/node/bands/'))!;
  for(const mesh of [frame,band])for(let i=0;i<mesh.indices!.length;i+=3){
    const [a,b,c]=[...mesh.indices!.slice(i,i+3)].map(index=>index*2),uv=mesh.uvs!;
    const area=(uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[b+1]-uv[a+1])*(uv[c]-uv[a]);expect(Math.abs(area)).toBeGreaterThan(1e-12);
  }
});

it("keeps an older facade's prototypes and material coordinates literal when a footprint is unconnected",async()=>{
  const original=repeatBayAsFacade(createBayConstructionGraph()),before=await evaluateConstruction(original);
  const graph=BayConstructionGraphSchema.parse({...original,schemaVersion:'0.4.0',nodes:[...original.nodes,{id:'unused',type:'Footprint',parameters:{widthM:10,depthM:8,wallDepthM:.36}}]});
  const after=await evaluateConstruction(graph);expect({...after.ir,sourceGraphHash:''}).toEqual({...before.ir,sourceGraphHash:''});expect(after.prototypes).toEqual(before.prototypes);
});
