import { createHash } from "node:crypto";
import { BayConstructionGraphSchema, createBayConstructionGraph, repeatBayAsFacade, type BayConstructionGraph, type BayConstructionNode } from "../contracts/bayConstructionGraph";
import { evaluateBayConstruction } from "../compiler/evaluateBayConstruction";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema, BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";

function node<T extends BayConstructionNode["type"]>(graph: BayConstructionGraph, type: T) {
  return graph.nodes.find(value => value.type === type) as Extract<BayConstructionNode, { type: T }>;
}
const facade = () => repeatBayAsFacade(createBayConstructionGraph());
const arrays = (batch: { positions?: Float32Array; normals?: Float32Array; uvs?: Float32Array; indices?: Uint16Array | Uint32Array }) =>
  [batch.positions, batch.normals, batch.uvs, batch.indices].map(value => [...value!]);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, v) => ArrayBuffer.isView(v)
  ? { type: v.constructor.name, bytes: [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)] } : v)).digest("hex");

describe("C2 connected facade construction", () => {
  it("retains the accepted C1 IR byte-for-byte and requires a version for new operators", async () => {
    expect(digest((await evaluateConstruction(createBayConstructionGraph())).ir)).toBe("3bb5499367a29417c7d9d4251e6461568fab00184de60e273aa3cc46d0ecac77");
    expect(BayConstructionGraphSchema.safeParse({ ...facade(), schemaVersion: "0.1.0" }).success).toBe(false);
    const legacy = createBayConstructionGraph(); Object.assign(node(legacy, "EmitWall"), { bypassed: true });
    expect(BayConstructionGraphSchema.safeParse(legacy).success).toBe(false);
  });
  it("executes 3 floors × 4 bays as 12 wall apertures and three actual shared instance prototypes", async () => {
    const result = await evaluateConstruction(facade());
    expect(result.trace.find(entry => entry.type === "SplitFloors")?.scopeCount).toBe(3);
    expect(result.trace.find(entry => entry.type === "SplitBays")?.scopeCount).toBe(12);
    expect(result.ir.meshBatches.filter(batch => batch.role === "wall")).toHaveLength(12);
    expect(result.prototypes).toHaveLength(3);
    expect(result.ir.instanceBatches.map(batch => batch.count)).toEqual([12, 12, 12]);
    expect(result.ir.metrics.instanceCount).toBe(36);
    const accepted = await evaluateBayConstruction(createBayConstructionGraph());
    for (const prototype of result.prototypes!) expect(arrays(prototype)).toEqual(arrays(accepted.ir.meshBatches.find(batch => batch.role === prototype.role)!));
    const frames = result.ir.instanceBatches.find(batch => batch.recipeId.includes(".frame."))!;
    for (let index = 0; index < frames.count; index++) {
      const x = frames.transforms![index * 16 + 12], y = frames.transforms![index * 16 + 13];
      expect(x).toBeCloseTo(-4.2 + (index % 4) * 2.8);
      expect(y).toBeCloseTo(Math.floor(index / 4) * 3.8);
      const wall = result.ir.meshBatches.filter(batch => batch.role === "wall")[index];
      // Every front-facing triangle remains outside the center of its opening.
      for (let t = 0; t < wall.indices!.length; t += 3) {
        const corners = [...wall.indices!.slice(t, t + 3)].map(v => [...wall.positions!.slice(v * 3, v * 3 + 3)]);
        const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0]));
        const minY = Math.min(...corners.map(p => p[1])), maxY = Math.max(...corners.map(p => p[1]));
        expect(minX < x - 0.01 && maxX > x + 0.01 && minY < y + 1.83 && maxY > y + 1.85).toBe(false);
      }
    }
  });
  it("count changes move actual transforms while retaining prototype bytes and surviving semantic addresses", async () => {
    const graph = facade(), before = await evaluateConstruction(graph);
    node(graph, "SplitFloors").parameters.count = 2; node(graph, "SplitBays").parameters.count = 5;
    const after = await evaluateConstruction(graph);
    expect(after.ir.instanceBatches.map(batch => batch.count)).toEqual([10, 10, 10]);
    expect(after.prototypes!.map(arrays)).toEqual(before.prototypes!.map(arrays));
    expect(after.prototypes!.map(p => p.batchId)).toEqual(before.prototypes!.map(p => p.batchId));
    expect([...after.ir.instanceBatches[0].transforms!]).not.toEqual([...before.ir.instanceBatches[0].transforms!]);
    const names = new Set(after.ir.semanticIndex.map(entry => entry.semanticPath));
    for (const entry of before.ir.semanticIndex.filter(entry => entry.semanticPath.includes("/floor/1/bay/0/"))) expect(names.has(entry.semanticPath)).toBe(true);
  });
  it("selects a named floor/bay and preserves actual per-instance semantic indices", async () => {
    const graph = facade(); node(graph, "SelectScopes").parameters = { floorIndex: 1, bayIndex: 2 };
    const result = await evaluateConstruction(graph);
    expect(result.ir.instanceBatches.map(batch => batch.count)).toEqual([1, 1, 1]);
    for (const batch of result.ir.instanceBatches) {
      expect(batch.transforms![12]).toBeCloseTo(1.4); expect(batch.transforms![13]).toBeCloseTo(3.8);
      expect(result.ir.semanticIndex.find(entry => entry.batchId === batch.batchId)?.elementIndex).toBe(0);
    }
    node(graph, "SelectScopes").parameters.floorIndex = 9;
    await expect(evaluateConstruction(graph)).rejects.toThrow("no matching");
  });
  it("bypasses optional bands and roof without changing walls or shared window geometry", async () => {
    const graph = facade(), before = await evaluateConstruction(graph);
    node(graph, "ProfileTrim").bypassed = true; node(graph, "RoofCap").bypassed = true;
    const after = await evaluateConstruction(graph);
    expect(after.ir.meshBatches.map(batch => batch.role).every(role => role === "wall")).toBe(true);
    expect(after.ir.meshBatches).toEqual(before.ir.meshBatches.filter(batch => batch.role === "wall"));
    expect(after.ir.instanceBatches).toEqual(before.ir.instanceBatches);
    expect(after.prototypes).toEqual(before.prototypes);
  });
  it.each(["bays", "facade"])("rejects windows behind uncut %s scopes, including a parent wall", async input => {
    const graph = facade(); node(graph, "EmitWall").input.nodeId = input;
    if (input === "facade") node(graph, "SelectScopes").parameters.floorIndex = 1;
    await expect(evaluateConstruction(graph)).rejects.toThrow("same opening layout");
  });
  it("previews scope and geometry nodes without replacing source graph/output identity", async () => {
    const graph = facade(), full = await evaluateConstruction(graph), scopes = await evaluateConstruction(graph, "bays"), windows = await evaluateConstruction(graph, "window");
    expect(scopes.graph).toEqual(graph); expect(scopes.previewNodeId).toBe("bays");
    expect(scopes.ir.sourceGraphHash).toBe(full.ir.sourceGraphHash);
    expect(scopes.ir.meshBatches).toHaveLength(12); expect(scopes.ir.instanceBatches).toHaveLength(0);
    expect(windows.ir.meshBatches).toHaveLength(0); expect(windows.ir.metrics.instanceCount).toBe(36);
    const legacy = await evaluateConstruction(createBayConstructionGraph(), "opening");
    expect(legacy.graph.schemaVersion).toBe("0.1.0");
    expect(legacy.ir.sourceGraphHash).toBe((await evaluateConstruction(createBayConstructionGraph())).ir.sourceGraphHash);
  });
  it.each(["cycle", "wrong-socket", "zero-count", "fractional-count", "double-split", "split-opening"])("rejects %s layouts instead of invoking a fixed generator", async kind => {
    const graph = facade();
    if (kind === "cycle") node(graph, "SplitFloors").input.nodeId = "bays";
    if (kind === "wrong-socket") node(graph, "SplitBays").input.nodeId = "window";
    if (kind === "zero-count") node(graph, "SplitFloors").parameters.count = 0;
    if (kind === "fractional-count") node(graph, "SplitBays").parameters.count = 2.5;
    if (kind === "double-split") { graph.nodes.push({ id: "floors2", type: "SplitFloors", input: { nodeId: "floors", socket: "scope" }, parameters: { count: 2 } }); node(graph, "SplitBays").input.nodeId = "floors2"; }
    if (kind === "split-opening") node(graph, "SplitBays").input.nodeId = "opening";
    await expect(evaluateConstruction(graph)).rejects.toThrow();
  });
  it("validates the transferred prototypes and matrices, and requires the new worker protocol", async () => {
    const graph = facade(), result = await evaluateConstruction(graph);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.1.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
    const reply = { schemaVersion: "0.2.0", type: "bay-result", requestId: 1, result };
    expect(BayConstructionWorkerReplySchema.safeParse(reply).success).toBe(true);
    const bad = structuredClone(reply); bad.result.prototypes![0].indices![0] = 999999;
    expect(BayConstructionWorkerReplySchema.safeParse(bad).success).toBe(false);
    const missing = structuredClone(reply); missing.result.ir.instanceBatches[0].recipeId = "missing";
    expect(BayConstructionWorkerReplySchema.safeParse(missing).success).toBe(false);
    const omitted = structuredClone(reply); delete omitted.result.prototypes;
    expect(BayConstructionWorkerReplySchema.safeParse(omitted).success).toBe(false);
  });
});
