import { describe, expect, it } from "vitest";
import { resolveConstructionRoundHead } from "../core/constructionRoundHead";
import { buildConstructionRoundHeadSpandrel, buildConstructionRoundHeadWindow } from "../compiler/constructionRoundHeadGeometry";
import { createBuildingConstructionGraph, BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";

const request = () => ({ schemaVersion: "0.1.0", kind: "construction-round-head-request",
  scope: { id: "building/a/front/floor/1/bay/2", face: "front", floorIndex: 1, bayIndex: 2, originM: [2, 4, -0.36], sizeM: [2.8, 3.4, 0.36] },
  parameters: { widthM: 1.4, heightM: 2.2, sillM: 0.6, frameWidthM: 0.08, revealDepthM: 0.14, masonryMarginM: 0.15 } });

describe("round-headed opening geometry", () => {
  it("builds matching frame and glazing with finite unit normals and actual depth", () => {
    const plan = resolveConstructionRoundHead(request()), { frame, glass } = buildConstructionRoundHeadWindow(plan);
    expect(frame.bounds.min[0]).toBeCloseTo(plan.aperture.pointsM[0][0]);
    expect(frame.bounds.max[1]).toBeCloseTo(plan.aperture.springY + plan.aperture.radiusM);
    expect(glass.bounds.max[1]).toBeCloseTo(plan.glazing.springY + plan.glazing.radiusM);
    expect(frame.bounds.max[2]).toBeCloseTo(-0.14); expect(frame.bounds.min[2]).toBeCloseTo(-0.22);
    for (const mesh of [frame, glass]) {
      expect(mesh.indices.length).toBeGreaterThan(0);
      expect(mesh.uvs.length).toBe(mesh.positions.length / 3 * 2);
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
      const edges = new Map<string, number>();
      const vertex = (index: number) => mesh.positions.slice(index*3,index*3+3).map(v => v.toFixed(8)).join(",");
      for (let i = 0; i < mesh.indices.length; i += 3) for (let j = 0; j < 3; j++) {
        const key = [vertex(mesh.indices[i+j]),vertex(mesh.indices[i+(j+1)%3])].sort().join("|");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      expect([...edges.values()].every(count => count === 2)).toBe(true);
    }
  });
  it("fills the wall above the arc with a reveal, without filling the opening below it", () => {
    const plan = resolveConstructionRoundHead(request()), wall = buildConstructionRoundHeadSpandrel(plan);
    expect(wall.bounds.min[1]).toBeCloseTo(plan.aperture.springY);
    expect(wall.bounds.max[1]).toBeCloseTo(plan.aperture.springY + plan.aperture.radiusM);
    expect(wall.bounds.min[2]).toBeCloseTo(-0.36); expect(wall.bounds.max[2]).toBe(0);
    expect(wall.indices.length).toBeGreaterThan(0);
    for (let i = 0; i < wall.normals.length; i += 3) expect(Math.hypot(...wall.normals.slice(i, i + 3))).toBeCloseTo(1);
  });
  it("rejects a frame that extends beyond the wall and a tampered plan", () => {
    const input = request(); input.parameters.revealDepthM = 0.3;
    expect(() => buildConstructionRoundHeadWindow(resolveConstructionRoundHead(input))).toThrow(/frame depth/);
    const bad = resolveConstructionRoundHead(request()); bad.glazing.pointsM[4][0] += 0.01;
    expect(() => buildConstructionRoundHeadWindow(bad)).toThrow(/does not match/);
  });
});

it("compiles upper front round heads through a versioned graph with a real changed wall and window", async () => {
  const base = withConstructionParapetSilhouette(createBuildingConstructionGraph(), 0);
  const graph = BayConstructionGraphSchema.parse({ ...base, schemaVersion: "0.10.0", nodes: base.nodes.map(node =>
    node.type === "PlaceOpening" ? { ...node, parameters: { ...node.parameters, upperFrontRoundHead: 1 } } : node) });
  const compiled = await evaluateConstruction(graph), original = await evaluateConstruction(base);
  expect(compiled.ir.instanceBatches.some(batch => batch.recipeId.includes("construction.prototype.frame"))).toBe(true);
  expect(compiled.prototypes?.some(batch => batch.batchId.includes("construction.prototype.frame"))).toBe(true);
  const wall = compiled.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"));
  expect(wall?.positions?.length).toBeGreaterThan(0);
  const covers = (x: number, y: number) => {
    const p = wall!.positions!, indices = wall!.indices!;
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = [...indices.slice(i, i + 3)].map(index => [p[index*3], p[index*3+1], p[index*3+2]]);
      if (vertices.some(vertex => Math.abs(vertex[2] + 4.2) > 1e-5)) continue;
      const cross = (a: number[], b: number[]) => (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
      const signs = [cross(vertices[0],vertices[1]),cross(vertices[1],vertices[2]),cross(vertices[2],vertices[0])];
      if (signs.every(v=>v>=-1e-7) || signs.every(v=>v<=1e-7)) return true;
    }
    return false;
  };
  // First upper-front bay: the shoulder is masonry, but the curved opening remains empty.
  expect(covers(-4.2 + 0.49, 6.29 + 0.48)).toBe(true);
  expect(covers(-4.2 + 0.49, 6.29 + 0.25)).toBe(false);
  const sillEntry = compiled.ir.semanticIndex.find(item => item.semanticPath.includes("/facade/floor/1/bay/0/trim"))!;
  const sillBatch = compiled.ir.instanceBatches.find(item => item.batchId === sillEntry.batchId)!;
  const sill = compiled.prototypes!.find(item => item.batchId === sillBatch.recipeId)!;
  const z = [...sill.positions!].filter((_, index) => index % 3 === 2);
  expect(Math.max(...z)).toBeCloseTo(graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.recessM); expect(Math.min(...z)).toBeLessThan(-0.1);
  expect(compiled.ir.sourceGraphHash).not.toBe(original.ir.sourceGraphHash);
  expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.10.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
  expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.9.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
  expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.10.0", type: "bay-result", requestId: 1, result: compiled }).success).toBe(true);
});

it("keeps rectangular geometry literal when the new head choice is disabled", async () => {
  const base = withConstructionParapetSilhouette(createBuildingConstructionGraph(), 0);
  const candidate = BayConstructionGraphSchema.parse({ ...base, schemaVersion: "0.10.0", nodes: base.nodes.map(node =>
    node.type === "PlaceOpening" ? { ...node, parameters: { ...node.parameters, upperFrontRoundHead: 0 } } : node) });
  const legacy = await evaluateConstruction(base), current = await evaluateConstruction(candidate);
  expect(current.ir.meshBatches).toEqual(legacy.ir.meshBatches);
  expect(current.ir.instanceBatches).toEqual(legacy.ir.instanceBatches);
  expect(current.prototypes).toEqual(legacy.prototypes);
  expect(current.ir.semanticIndex).toEqual(legacy.ir.semanticIndex);
});

it("compiles each sash layout while rejecting old-version round-head fields", async () => {
  const base = withConstructionParapetSilhouette(createBuildingConstructionGraph(), 0);
  const nodes = base.nodes.map(node => node.type === "PlaceOpening" ? { ...node, parameters: { ...node.parameters, upperFrontRoundHead: 1 as const } } :
    node.type === "AssembleWindow" ? { ...node, parameters: { ...node.parameters, layout: 1 as const } } : node);
  expect(BayConstructionGraphSchema.safeParse({ ...base, nodes }).success).toBe(false);
  const casement = await evaluateConstruction({ ...base, schemaVersion: "0.10.0", nodes });
  expect(casement.prototypes?.some(batch => batch.role === "frame")).toBe(true);
  const other = await evaluateConstruction({ ...base, schemaVersion: "0.10.0", nodes: nodes.map(node => node.type === "AssembleWindow" ? { ...node, parameters: { ...node.parameters, layout: 2 } } : node) });
  const upperFrame = (result: typeof casement) => {
    const entry = result.ir.semanticIndex.find(item => item.semanticPath.includes("/facade/floor/1/bay/0/frame"))!;
    const batch = result.ir.instanceBatches.find(item => item.batchId === entry.batchId)!;
    return result.prototypes?.find(item => item.batchId === batch.recipeId)?.positions;
  };
  expect(upperFrame(casement)).not.toEqual(upperFrame(other));
});

it("retains an individually narrowed round-headed opening through wall and window scopes", async () => {
  const base = withConstructionOpeningWidth(createBuildingConstructionGraph(), { target: { documentId: "authored-building", storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 2 }, widthM: 1.0 });
  const roof = withConstructionParapetSilhouette(base, 0);
  const graph = { ...roof, schemaVersion: "0.10.0", nodes: roof.nodes.map(node => node.type === "PlaceOpening" ? { ...node, parameters: { ...node.parameters, upperFrontRoundHead: 1 } } : node) };
  const result = await evaluateConstruction(graph);
  expect(result.ir.semanticIndex.some(entry => entry.semanticPath.includes("floor/1/bay/2/frame"))).toBe(true);
});
