import { BayConstructionGraphSchema, createBayConstructionGraph, repeatBayAsFacade } from "../contracts/bayConstructionGraph";
import { emptyConstructionComposition, repeatConstructionWithSurfaces, setConstructionSurface, validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema, BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";

const bay = () => createBayConstructionGraph();
const finish = () => setConstructionSurface(bay(), emptyConstructionComposition(bay().documentId));
const withoutHash = (ir: Awaited<ReturnType<typeof evaluateConstruction>>["ir"]) => ({ ...ir, sourceGraphHash: "provenance" });
it.each(["bay", "facade"])("introduces an empty compositor without changing any %s geometry, semantic paths or native transforms", async kind => {
  const graph = kind === "bay" ? bay() : repeatBayAsFacade(bay());
  const original = await evaluateConstruction(graph), nextGraph = setConstructionSurface(graph, emptyConstructionComposition(graph.documentId));
  const next = await evaluateConstruction(nextGraph);
  expect(withoutHash(next.ir)).toEqual(withoutHash(original.ir)); expect(next.prototypes).toEqual(original.prototypes);
  expect(next.ir.sourceGraphHash).not.toBe(original.ir.sourceGraphHash);
  expect(next.surfaceComposition).toEqual(emptyConstructionComposition(graph.documentId));
  expect(next.trace.some(trace => trace.type === "SetSurface")).toBe(true);
});
it("owns layer data and rejects invalid versions, duplicate compositor nodes, cycles, foreign documents and broadened targets", () => {
  const graph = finish();
  expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.2.0" }).success).toBe(false);
  const surface = graph.nodes.find(node => node.type === "SetSurface")!;
  expect(BayConstructionGraphSchema.safeParse({ ...graph, nodes: [...graph.nodes, { ...surface, id: "another" }] }).success).toBe(false);
  expect(() => setConstructionSurface(graph, { ...surface.composition, documentId: "foreign" })).toThrow();
  expect(BayConstructionGraphSchema.safeParse({ ...graph, nodes: graph.nodes.map(node => node.type === "SetSurface" ? { ...node, input: { nodeId: "surface", socket: "geometry" } } : node) }).success).toBe(false);
  const owned = emptyConstructionComposition(graph.documentId), next = setConstructionSurface(graph, owned); owned.revision++;
  expect(next.nodes.find(node => node.type === "SetSurface")!.composition.revision).toBe(0);
});
it("emits finishes only from the connected, unbypassed surface output and never from a geometry preview", async () => {
  const graph = finish(), unconnected = structuredClone(graph), bypassed = structuredClone(graph);
  const output = unconnected.nodes.find(node => node.type === "Output")!; output.inputs = [{ nodeId: "join", socket: "geometry" }];
  bypassed.nodes.find(node => node.type === "SetSurface")!.bypassed = true;
  expect((await evaluateConstruction(unconnected)).surfaceComposition).toBeUndefined();
  expect((await evaluateConstruction(bypassed)).surfaceComposition).toBeUndefined();
  expect((await evaluateConstruction(graph, "join")).surfaceComposition).toBeUndefined();
  expect((await evaluateConstruction(graph, "surface")).surfaceComposition).toEqual(emptyConstructionComposition(graph.documentId));
});
it("rejects an indirect duplicate contribution without expanding a shared DAG", async () => {
  const graph = finish(), join = graph.nodes.find(node => node.type === "JoinGeometry")!;
  graph.nodes.push({ id: "duplicate", type: "JoinGeometry", inputs: [{ nodeId: "window", socket: "geometry" }] });
  join.inputs.push({ nodeId: "duplicate", socket: "geometry" });
  await expect(evaluateConstruction(graph)).rejects.toThrow("more than once");
});
it("retains ordered source on repeat and rejects source library drift", () => {
  const graph = finish(), surface = graph.nodes.find(node => node.type === "SetSurface")!;
  surface.composition.sources.push({ id: "wood", slotId: "frame.primary", atlasContentHash: "a".repeat(64) });
  expect(repeatConstructionWithSurfaces(graph).nodes.find(node => node.type === "SetSurface")!.composition).toEqual(surface.composition);
  validateConstructionSurfaceSources(graph, { contentHash: "a".repeat(64), manifest: { slots: [{ id: "frame.primary" }] } });
  expect(() => validateConstructionSurfaceSources(graph, { contentHash: "b".repeat(64), manifest: { slots: [{ id: "frame.primary" }] } })).toThrow("saved material library");
  expect(() => validateConstructionSurfaceSources(graph, { contentHash: "a".repeat(64), manifest: { slots: [] } })).toThrow();
});
it("requires the explicit worker version and exact executed finish metadata", async () => {
  const graph = finish(), result = await evaluateConstruction(graph);
  const request = { schemaVersion: "0.3.0", type: "evaluate-bay", requestId: 1, graph };
  expect(BayConstructionWorkerRequestSchema.safeParse(request).success).toBe(true);
  expect(BayConstructionWorkerRequestSchema.safeParse({ ...request, schemaVersion: "0.2.0" }).success).toBe(false);
  const reply = { schemaVersion: "0.3.0", type: "bay-result", requestId: 1, result };
  expect(BayConstructionWorkerReplySchema.safeParse(reply).success).toBe(true);
  expect(BayConstructionWorkerReplySchema.safeParse({ ...reply, result: { ...result, surfaceComposition: undefined } }).success).toBe(false);
  expect(BayConstructionWorkerReplySchema.safeParse({ ...reply, result: { ...result, surfaceComposition: { ...result.surfaceComposition, revision: 1 } } }).success).toBe(false);
});
