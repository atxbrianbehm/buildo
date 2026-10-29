import { describe, expect, it } from "vitest";
import { buildSteppedParapetSolid, buildSteppedParapetCoping } from "../compiler/constructionSteppedParapetGeometry";
import type { PrimitiveGeometry } from "../compiler/primitiveGeometry";
import { resolveConstructionParapetSilhouette } from "../core/constructionParapetSilhouette";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { resolveConstructionCorniceDetail } from "../core/constructionCorniceDetail";
import { buildConstructionCorniceGeometry } from "../compiler/constructionCorniceGeometry";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";

function plan(widthM = 12, depthM = 10, heightM = 11, parapet = 0.8, coping = 0.08) {
  return resolveConstructionParapetSilhouette({ schemaVersion: "0.1.0", kind: "construction-parapet-silhouette-request", treatment: "raised-center",
    building: { widthM, depthM, heightM }, parapet: { heightM: parapet, copingProjectionM: coping } });
}

function inspectClosed(g: PrimitiveGeometry) {
  const edges = new Map<string, { count: number; orientation: number }>(); let volume = 0;
  const vertex = (i: number) => g.positions.slice(i * 3, i * 3 + 3);
  const key = (v: number[]) => v.map(x => Math.round(x * 1e8)).join(",");
  for (let i = 0; i < g.indices.length; i += 3) {
    const ids = g.indices.slice(i, i + 3), [a, b, c] = ids.map(vertex);
    const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    expect(Math.hypot(...n)).toBeGreaterThan(1e-10);
    expect(n.reduce((sum, x, k) => sum + x * g.normals[ids[0] * 3 + k], 0)).toBeGreaterThan(0);
    const uv = ids.map(id => g.uvs.slice(id * 2, id * 2 + 2));
    const uvArea = Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]));
    expect(uvArea / Math.hypot(...n)).toBeCloseTo(1, 7);
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let j = 0; j < 3; j++) {
      const x = key(vertex(ids[j])), y = key(vertex(ids[(j + 1) % 3]));
      const forward = x < y, edge = forward ? `${x}|${y}` : `${y}|${x}`;
      const prev = edges.get(edge) ?? { count: 0, orientation: 0 }; prev.count++; prev.orientation += forward ? 1 : -1; edges.set(edge, prev);
    }
  }
  expect([...edges.values()].every(e => e.count === 2 && e.orientation === 0)).toBe(true);
  expect(volume).toBeGreaterThan(0);
  expect([...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite)).toBe(true);
  expect(g.uvs.length).toBe(g.positions.length / 3 * 2);
}

describe("stepped parapet geometry", () => {
  it.each([[3, 3, 2.5, 0.2, 0.02], [12, 10, 11, 0.8, 0.08], [100, 100, 100, 1.2, 0.2]])("builds one closed outward parapet and continuous coping for %s × %s", (w, d, h, parapet, coping) => {
    const p = plan(w, d, h, parapet, coping), solid = buildSteppedParapetSolid(p), cap = buildSteppedParapetCoping(p);
    inspectClosed(solid); inspectClosed(cap);
    expect(solid.bounds.min[1]).toBeCloseTo(p.baseM); expect(solid.bounds.max[1]).toBeCloseTo(p.highTopM);
    expect(solid.bounds.min[0]).toBeCloseTo(-w / 2); expect(solid.bounds.max[0]).toBeCloseTo(w / 2);
    for (let i = 0; i < solid.positions.length / 3; i++) if (solid.normals[i * 3 + 2] === -1 && solid.positions[i * 3 + 2] === -d / 2) {
      expect(solid.uvs[i * 2]).toBe(solid.positions[i * 3]);
      expect(solid.uvs[i * 2 + 1]).toBe(solid.positions[i * 3 + 1]);
    }
    expect(cap.bounds.max[1]).toBeCloseTo(p.highTopM + 0.095);
    expect(cap.bounds.min[2]).toBeCloseTo(-d / 2 - coping);
    expect(buildSteppedParapetCoping(p)).toEqual(cap);
  });
});

describe("parapet graph and compiler admission", () => {
  it("retains storefront, window assembly and selected-opening edits in the raised building", async () => {
    const base = withConstructionStorefront(withConstructionWindowLayout(createBuildingConstructionGraph(), "window", 2), 1);
    const edited = withConstructionOpeningWidth(base, { target: { documentId: base.documentId, storeysNodeId: "facade", windowNodeId: "window",
      face: "front", floorIndex: 1, bayIndex: 2 }, widthM: 1.8 });
    const old = withConstructionCorniceLayout(edited, 2), graph = withConstructionParapetSilhouette(old, 1);
    const before = await evaluateConstruction(old), after = await evaluateConstruction(graph);
    expect(after.ir.instanceBatches).toEqual(before.ir.instanceBatches); expect(after.prototypes).toEqual(before.prototypes);
    expect(after.ir.semanticIndex).toEqual(before.ir.semanticIndex); expect(after.surfaceComposition).toEqual(before.surfaceComposition);
    for (const batch of before.ir.meshBatches) if (!batch.batchId.endsWith("/parapet") && !batch.batchId.endsWith("/cornice")) {
      expect(after.ir.meshBatches.find(item => item.batchId === batch.batchId)).toEqual(batch);
    }
  });
  it.each([[8, 7, 2, 0.2, 0.02], [20, 15, 8, 1.2, 0.2]])("recomputes raised geometry for a %s × %s building with %s storeys", async (widthM, depthM, count, heightM, copingProjectionM) => {
    const graph = withConstructionParapetSilhouette(withConstructionCorniceLayout(createBuildingConstructionGraph(), 0), 1);
    const footprint = graph.nodes.find(node => node.type === "Footprint");
    const storeys = graph.nodes.find(node => node.type === "Storeys");
    const roof = graph.nodes.find(node => node.type === "BuildingRoof");
    if (footprint?.type !== "Footprint" || storeys?.type !== "Storeys" || roof?.type !== "BuildingRoof") throw new Error("Missing building nodes");
    footprint.parameters.widthM = widthM; footprint.parameters.depthM = depthM; storeys.parameters.count = count;
    roof.parameters.parapetHeightM = heightM; roof.parameters.copingProjectionM = copingProjectionM;
    const result = await evaluateConstruction(graph);
    const base = storeys.parameters.groundHeightM + (count - 1) * storeys.parameters.upperHeightM;
    const parapet = result.ir.meshBatches.find(batch => batch.batchId.endsWith("/parapet"))!;
    const ys = Array.from(parapet.positions!).filter((_value, index) => index % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(base + 1.75 * heightM, 4);
    expect(result.ir.bounds.max[1]).toBeCloseTo(base + 1.75 * heightM + 0.095, 4);
  });

  it.each([0, 1, 2] as const)("preserves cornice treatment %s and the flat baseline while producing a taller raised front", async layout => {
    const old = withConstructionCorniceLayout(createBuildingConstructionGraph(), layout), saved = structuredClone(old);
    const baseline = await evaluateConstruction(old);
    const flatGraph = withConstructionParapetSilhouette(old, 0), raisedGraph = withConstructionParapetSilhouette(old, 1);
    const flat = await evaluateConstruction(flatGraph), raised = await evaluateConstruction(raisedGraph);
    expect(old).toEqual(saved); expect(flatGraph.schemaVersion).toBe("0.9.0");
    expect(flat.ir.meshBatches).toEqual(baseline.ir.meshBatches);
    expect(flat.ir.instanceBatches).toEqual(baseline.ir.instanceBatches); expect(flat.prototypes).toEqual(baseline.prototypes);
    expect(raised.ir.instanceBatches).toEqual(flat.ir.instanceBatches); expect(raised.prototypes).toEqual(flat.prototypes);
    expect(raised.surfaceComposition).toEqual(flat.surfaceComposition);
    for (const batch of flat.ir.meshBatches) {
      const next = raised.ir.meshBatches.find(item => item.batchId === batch.batchId)!;
      if (!batch.batchId.endsWith("/parapet") && !batch.batchId.endsWith("/cornice")) expect(next).toEqual(batch);
    }
    const parapet = (result: typeof flat) => result.ir.meshBatches.find(batch => batch.batchId.endsWith("/parapet"))!;
    expect(parapet(raised).positions!.length).toBeGreaterThan(parapet(flat).positions!.length);
    expect(raised.ir.bounds.max[1]).toBeGreaterThan(flat.ir.bounds.max[1]);
    const baseCornice = flat.ir.meshBatches.find(batch => batch.batchId.endsWith("/cornice"))!;
    const newCornice = raised.ir.meshBatches.find(batch => batch.batchId.endsWith("/cornice"))!;
    const roof = old.nodes.find(node => node.type === "BuildingRoof")!;
    if (roof.type !== "BuildingRoof") throw new Error("Expected roof");
    const footprint = old.nodes.find(node => node.type === "Footprint")!;
    const storeys = old.nodes.find(node => node.type === "Storeys")!;
    if (footprint.type !== "Footprint" || storeys.type !== "Storeys") throw new Error("Expected building dimensions");
    const h = storeys.parameters.groundHeightM + (storeys.parameters.count - 1) * storeys.parameters.upperHeightM;
    const cornicePlan = resolveConstructionCorniceDetail({ schemaVersion: "0.1.0", kind: "construction-cornice-detail-request",
      assembly: layout === 0 ? "moulded" : layout === 1 ? "dentil-course" : "bracket-course",
      building: { widthM: footprint.parameters.widthM, depthM: footprint.parameters.depthM, heightM: h },
      cornice: { heightM: roof.parameters.corniceHeightM, projectionM: roof.parameters.corniceProjectionM } });
    const parts = buildConstructionCorniceGeometry(cornicePlan);
    const backingLength = parts.backing.positions.length, detailLength = parts.units.reduce((sum, unit) => sum + unit.positions.length, 0);
    expect(Array.from(newCornice.positions!.slice(0, backingLength))).toEqual(Array.from(baseCornice.positions!.slice(0, backingLength)));
    if (detailLength) expect(Array.from(newCornice.positions!.slice(-detailLength))).toEqual(Array.from(baseCornice.positions!.slice(-detailLength)));
    const raisedPositions = parapet(raised).positions!, roofTop = h + roof.parameters.parapetHeightM;
    const raisedZ: number[] = [];
    for (let i = 0; i < raisedPositions.length; i += 3) if (raisedPositions[i + 1] > roofTop + 0.001) raisedZ.push(raisedPositions[i + 2]);
    expect(raisedZ.length).toBeGreaterThan(0);
    expect(Math.max(...raisedZ)).toBeLessThan(0);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.9.0", type: "evaluate-bay", requestId: 1, graph: raisedGraph }).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.9.0", type: "bay-result", requestId: 1, result: raised }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.8.0", type: "evaluate-bay", requestId: 1, graph: raisedGraph }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...raisedGraph, schemaVersion: "0.8.0" }).success).toBe(false);
  });
});
