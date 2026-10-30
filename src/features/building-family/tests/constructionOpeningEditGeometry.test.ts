import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningEdits, withConstructionOpeningWidth, withoutConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema, BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";
import { hashCanonicalJson } from "../core/contentHash";
import { setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import type { BayConstructionResult } from "../compiler/evaluateBayConstruction";
import { extrudeConstructionOpeningTrim } from "../compiler/constructionOpeningTrimGeometry";

const base = () => withConstructionStorefront(createBuildingConstructionGraph(), 1);
const target = () => ({ documentId: base().documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 2 });
const edit = () => ({ target: target(), widthM: 1.8 });
const edited = () => withConstructionOpeningWidth(base(), edit());
const operation = (graph: ReturnType<typeof edited>) => graph.nodes.find(node => node.type === "EditOpeningWidth")!;
const framePath = () => `building/${target().documentId}/node/window/facade/floor/1/bay/2/frame`;
function part(result: BayConstructionResult, path: string) {
  const semantic = result.ir.semanticIndex.find(entry => entry.semanticPath === path)!;
  expect(semantic).toBeDefined();
  const instances = result.ir.instanceBatches.find(batch => batch.batchId === semantic.batchId)!;
  return { prototype: result.prototypes!.find(batch => batch.batchId === instances.recipeId)!,
    transform: instances.transforms!.slice(semantic.elementIndex! * 16, (semantic.elementIndex! + 1) * 16) };
}
function frontArea(result: BayConstructionResult) {
  const wall = result.ir.meshBatches.find(batch => batch.batchId.endsWith("/facade/wall"))!;
  let area = 0;
  for (let i=0; i<wall.indices!.length; i+=3) {
    const ids = Array.from(wall.indices!.slice(i,i+3));
    const points = ids.map(id => Array.from(wall.positions!.slice(id*3,id*3+3)));
    if (!ids.every(id => wall.normals![id*3+2]<-.99) || !points.every(point=>Math.abs(point[2]+4.2)<1e-5)) continue;
    const [a,b,c]=points;
    area += Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  }
  return area;
}

describe("selected opening scope compiler", () => {
  it("closes the edited trim with exact profile-area caps and two incident faces per welded edge", () => {
    const points=[{u:0,d:.015},{u:.025,d:.096},{u:.045,d:.12},{u:.1,d:.12},{u:.14,d:.025}];
    const solid=extrudeConstructionOpeningTrim({profile:{id:"test",label:"Sloped sill",points},center:[0,3,0],runLengthM:2});
    const edges=new Map<string,number>(), key=(id:number)=>solid.positions.slice(id*3,id*3+3).join(",");
    let capArea=0;
    for(let i=0;i<solid.indices.length;i+=3) {
      const ids=solid.indices.slice(i,i+3), v=ids.map(id=>solid.positions.slice(id*3,id*3+3));
      for(let j=0;j<3;j++) {const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join("|");edges.set(edge,(edges.get(edge)??0)+1);}
      if(v.every(p=>p[0]===1)) capArea+=Math.abs((v[1][1]-v[0][1])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][1]-v[0][1]))/2;
    }
    expect([...edges.values()].every(count=>count===2)).toBe(true);
    const expected=points.slice(1).reduce((sum,p,i)=>sum+(p.u-points[i].u)*(p.d+points[i].d)/2,0);
    expect(capArea).toBeCloseTo(expected,12);
  });
  it("migrates explicitly with one shared scope authority and owned data", () => {
    const old = base(), before = structuredClone(old), graph = withConstructionOpeningEdits(old);
    expect(old).toEqual(before); expect(graph.schemaVersion).toBe("0.7.0");
    expect(operation(graph)).toMatchObject({ input: { nodeId: "frontage", socket: "scope" }, overrides: [] });
    for (const id of ["wall","selection","door"]) expect(graph.nodes.find(node=>node.id===id)).toMatchObject({ input: { nodeId: "openingEdits", socket: "scope" } });
    expect(withConstructionOpeningEdits(graph)).toEqual(graph);
    for (const oldVersion of [createBuildingConstructionGraph(), withConstructionWindowLayout(createBuildingConstructionGraph(),"window",2)]) {
      expect(withConstructionOpeningEdits(oldVersion).schemaVersion).toBe("0.7.0");
    }
  });
  it("preserves exact old geometry with no overrides or bypassed edits and retains the legacy golden", async () => {
    const before=await evaluateConstruction(base());
    const bypassed=edited(); operation(bypassed).bypassed=true;
    for (const graph of [withConstructionOpeningEdits(base()), bypassed]) {
      const result=await evaluateConstruction(graph);
      expect(result.ir.meshBatches).toEqual(before.ir.meshBatches);
      expect(result.ir.instanceBatches).toEqual(before.ir.instanceBatches);
      expect(result.ir.semanticIndex).toEqual(before.ir.semanticIndex);
      expect(result.prototypes).toEqual(before.prototypes);
    }
    expect(await hashCanonicalJson(await evaluateConstruction(createBuildingConstructionGraph()))).toBe("3fa73210cad319eb1a5f3320fac9907af68a4cee766298c7bdc06961968a0c47");
  });
  it("changes one real aperture, frame, glazing and sill while retaining every unrelated part", async () => {
    const old=await evaluateConstruction(base()), source=edited(), before=structuredClone(source), next=await evaluateConstruction(source);
    expect(source).toEqual(before); expect(await evaluateConstruction(source)).toEqual(next);
    expect(new Set(next.ir.semanticIndex.map(value=>value.semanticPath))).toEqual(new Set(old.ir.semanticIndex.map(value=>value.semanticPath)));
    for (const role of ["frame","glass","trim"]) {
      const path=framePath().replace(/frame$/,role);
      expect(part(next,path).prototype.positions).not.toEqual(part(old,path).prototype.positions);
      expect(part(next,path).transform).toEqual(part(old,path).transform);
    }
    for (const entry of old.ir.semanticIndex.filter(value=>value.elementIndex!==undefined && !value.semanticPath.startsWith(framePath().replace(/frame$/,"")))) {
      expect(part(next,entry.semanticPath)).toEqual(part(old,entry.semanticPath));
    }
    for (const mesh of old.ir.meshBatches.filter(value=>!value.batchId.endsWith("/facade/wall"))) expect(next.ir.meshBatches.find(value=>value.batchId===mesh.batchId)).toEqual(mesh);
    expect(frontArea(old)-frontArea(next)).toBeCloseTo((1.8-1.22)*2.12,4);
    expect(next.ir.semanticIndex.filter(entry=>entry.semanticPath.endsWith("/frame"))).toHaveLength(48);
  });
  it("resets one override to the exact current shared width and sorts edits deterministically", async () => {
    const first=edit(), second={target:{...target(),bayIndex:0},widthM:1.6};
    const a=withConstructionOpeningWidth(withConstructionOpeningWidth(base(),first),second);
    const b=withConstructionOpeningWidth(withConstructionOpeningWidth(base(),second),first);
    expect(a).toEqual(b); expect(operation(withConstructionOpeningWidth(a,{...first,widthM:1.9})).overrides).toHaveLength(2);
    const reset=withoutConstructionOpeningWidth(withConstructionOpeningWidth(base(),first),first.target);
    const result=await evaluateConstruction(reset), old=await evaluateConstruction(base());
    expect(result.ir.meshBatches).toEqual(old.ir.meshBatches); expect(result.prototypes).toEqual(old.prototypes);
    expect(result.ir.instanceBatches).toEqual(old.ir.instanceBatches);
  });
  it.each([{floorIndex:11},{bayIndex:19}])("rejects a missing target %j", async patch => {
    const graph=withConstructionOpeningWidth(base(),{...edit(),target:{...target(),...patch}}), before=structuredClone(graph);
    await expect(evaluateConstruction(graph)).rejects.toThrow(/missing or ambiguous/); expect(graph).toEqual(before);
  });
  it("rejects target duplicates, cross-document identity, invalid nodes and downgrade", () => {
    const graph=edited(); operation(graph).overrides.push(edit());
    expect(BayConstructionGraphSchema.safeParse(graph).success).toBe(false);
    expect(()=>withConstructionOpeningWidth(base(),{...edit(),target:{...target(),documentId:"other"}})).toThrow(/construction document/);
    expect(()=>withConstructionOpeningWidth(base(),{...edit(),target:{...target(),windowNodeId:"door"}})).toThrow(/existing storeys and window/);
    expect(BayConstructionGraphSchema.safeParse({...edited(),schemaVersion:"0.6.0"}).success).toBe(false);
    expect(()=>withoutConstructionOpeningWidth(edited(),{...target(),documentId:"other"})).toThrow(/this construction/);
    let calls=0;
    const malicious=Object.defineProperty(edit(),"widthM",{get(){calls++;return 1.8;}});
    expect(()=>withConstructionOpeningWidth(base(),malicious)).toThrow(/data properties/); expect(calls).toBe(0);
  });
  it("rejects custom topology and a target assembly that bypasses the edited scope", async () => {
    const custom=base(); custom.nodes.find(node=>node.type==="EmitWall")!.input.nodeId="entrance";
    expect(()=>withConstructionOpeningEdits(custom)).toThrow(/registered/);
    const mismatch=edited(); mismatch.nodes.find(node=>node.type==="AssembleWindow")!.input.nodeId="frontage";
    await expect(evaluateConstruction(mismatch)).rejects.toThrow(/consume its edited opening/);
  });
  it("rejects a mismatched wall branch, detached operation and output missing its window or wall", async () => {
    const wall=edited(); wall.nodes.find(node=>node.type==="EmitWall")!.input.nodeId="frontage";
    await expect(evaluateConstruction(wall)).rejects.toThrow(/same opening layout/);
    const detached=edited();
    for (const node of detached.nodes) if ("input" in node && node.input.nodeId==="openingEdits") node.input.nodeId="frontage";
    await expect(evaluateConstruction(detached)).rejects.toThrow(/not connected/);
    for (const missing of ["window","wall"]) {
      const graph=edited(), join=graph.nodes.find(node=>node.type==="JoinGeometry")!;
      join.inputs=join.inputs.filter(input=>input.nodeId!==missing);
      await expect(evaluateConstruction(graph)).rejects.toThrow(/one final window and its matching wall aperture/);
    }
  });
  it("rejects infeasible widths without clamping", async () => {
    for (const widthM of [0.1,2.7]) await expect(evaluateConstruction(withConstructionOpeningWidth(base(),{...edit(),widthM}))).rejects.toThrow(/piers|frame/);
  });
  it("preserves C7 assemblies and surface instructions without downgrading", async () => {
    const graph=withConstructionWindowLayout(edited(),"window",2), composition=graph.nodes.find(node=>node.type==="SetSurface")!.composition;
    composition.revision=1;
    const finished=setConstructionSurface(graph,composition), result=await evaluateConstruction(finished);
    expect(finished.schemaVersion).toBe("0.7.0"); expect(result.surfaceComposition).toEqual(composition);
    expect(part(result,framePath()).prototype.indices!.length).toBeGreaterThan(0);
  });
  it("requires exact graph/worker version admission for real compiled results", async () => {
    const graph=edited(), result=await evaluateConstruction(graph);
    expect(BayConstructionWorkerRequestSchema.safeParse({schemaVersion:"0.7.0",type:"evaluate-bay",requestId:1,graph}).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({schemaVersion:"0.7.0",type:"bay-result",requestId:1,result}).success).toBe(true);
    for (const schemaVersion of ["0.4.0","0.5.0","0.6.0"]) {
      expect(BayConstructionWorkerRequestSchema.safeParse({schemaVersion,type:"evaluate-bay",requestId:1,graph}).success).toBe(false);
      expect(BayConstructionWorkerReplySchema.safeParse({schemaVersion,type:"bay-result",requestId:1,result}).success).toBe(false);
    }
    expect(BayConstructionWorkerRequestSchema.safeParse({schemaVersion:"0.7.0",type:"evaluate-bay",requestId:1,graph:base()}).success).toBe(false);
  });
  it.each([0,1,2] as const)("retains finite wound geometry and noncollapsed metre UVs for assembly %s", async layout => {
    const result=await evaluateConstruction(withConstructionWindowLayout(edited(),"window",layout));
    for (const role of ["frame","glass","trim"]) {
      const geometry=part(result,framePath().replace(/frame$/,role)).prototype;
      expect([...geometry.positions!,...geometry.normals!,...geometry.uvs!].every(Number.isFinite)).toBe(true);
      for (let i=0; i<geometry.indices!.length; i+=3) {
        const ids=Array.from(geometry.indices!.slice(i,i+3));
        const points=ids.map(id=>Array.from(geometry.positions!.slice(id*3,id*3+3)));
        const ab=points[1].map((v,j)=>v-points[0][j]), ac=points[2].map((v,j)=>v-points[0][j]);
        const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
        const normal=geometry.normals!.slice(ids[0]*3,ids[0]*3+3);
        expect(cross.reduce((sum,v,j)=>sum+v*normal[j],0),`${role} triangle ${i/3}`).toBeGreaterThan(0);
        const uv=ids.map(id=>geometry.uvs!.slice(id*2,id*2+2));
        expect(Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))).toBeGreaterThan(1e-12);
      }
    }
  });
});
