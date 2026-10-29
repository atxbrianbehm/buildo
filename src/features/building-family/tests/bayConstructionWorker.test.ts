import { BayConstructionClient, type BayConstructionWorkerEndpoint } from "../compiler/bayConstructionClient";
import { BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";
import { evaluateBayConstruction } from "../compiler/evaluateBayConstruction";
import { createBayConstructionGraph } from "../contracts/bayConstructionGraph";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";

class Endpoint implements BayConstructionWorkerEndpoint {
  messages: unknown[] = [];
  terminated = 0;
  listeners = { message: new Set<(event: MessageEvent | ErrorEvent) => void>(), error: new Set<(event: MessageEvent | ErrorEvent) => void>() };
  postMessage(message: unknown) { this.messages.push(structuredClone(message)); }
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void) { this.listeners[type].add(listener); }
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void) { this.listeners[type].delete(listener); }
  terminate() { this.terminated++; }
  emit(data: unknown) { for (const listener of this.listeners.message) listener(new MessageEvent("message", { data })); }
  fail() { for (const listener of [...this.listeners.error]) listener(new ErrorEvent("error")); }
  async complete(index: number) {
    const request = BayConstructionWorkerRequestSchema.parse(this.messages[index]);
    this.emit({ schemaVersion: "0.1.0", type: "bay-result", requestId: request.requestId,
      result: await evaluateBayConstruction(request.graph) });
  }
}
describe("owned construction worker client", () => {
  it("sends parapet protocol 0.9 and accepts the compiled raised silhouette", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const graph = withConstructionParapetSilhouette(withConstructionCorniceLayout(createBuildingConstructionGraph(), 2), 1);
    const pending = client.evaluate(graph), request = BayConstructionWorkerRequestSchema.parse(endpoint.messages[0]);
    expect(request.schemaVersion).toBe("0.9.0"); expect(request.graph).toEqual(graph);
    const result = await evaluateConstruction(request.graph);
    endpoint.emit({ schemaVersion: "0.9.0", type: "bay-result", requestId: request.requestId, result });
    expect(await pending).toEqual(result);
    client.dispose(); expect(endpoint.terminated).toBe(1);
  });
  it("sends cornice protocol0.8 and accepts the actual closed detail geometry", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const graph = withConstructionCorniceLayout(createBuildingConstructionGraph(), 2);
    const pending = client.evaluate(graph), request = BayConstructionWorkerRequestSchema.parse(endpoint.messages[0]);
    expect(request.schemaVersion).toBe("0.8.0");
    const result = await evaluateConstruction(request.graph);
    endpoint.emit({schemaVersion:"0.8.0",type:"bay-result",requestId:request.requestId,result});
    expect(await pending).toEqual(result);
    client.dispose(); expect(endpoint.terminated).toBe(1);
    expect(endpoint.listeners.message.size + endpoint.listeners.error.size).toBe(0);
  });
  it("sends a targeted opening with protocol 0.7 and accepts its actual geometry", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const base = withConstructionStorefront(createBuildingConstructionGraph(), 1);
    const graph = withConstructionOpeningWidth(base, { target: { documentId: base.documentId, storeysNodeId: "facade",
      windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 2 }, widthM: 1.8 });
    const pending = client.evaluate(graph), request = BayConstructionWorkerRequestSchema.parse(endpoint.messages[0]);
    expect(request.schemaVersion).toBe("0.7.0"); expect(request.graph).toEqual(graph);
    const result = await evaluateConstruction(request.graph);
    endpoint.emit({ schemaVersion: "0.7.0", type: "bay-result", requestId: request.requestId, result });
    expect(await pending).toEqual(result);
    client.dispose(); expect(endpoint.terminated).toBe(1);
    expect(endpoint.listeners.message.size + endpoint.listeners.error.size).toBe(0);
  });
  it("sends a storefront graph with protocol 0.6 and accepts its actual compiled reply", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const graph = withConstructionStorefront(createBuildingConstructionGraph(), 1), pending = client.evaluate(graph);
    const request = BayConstructionWorkerRequestSchema.parse(endpoint.messages[0]);
    expect(request.schemaVersion).toBe("0.6.0"); expect(request.graph).toEqual(graph);
    const result = await evaluateConstruction(request.graph);
    endpoint.emit({ schemaVersion: "0.6.0", type: "bay-result", requestId: request.requestId, result });
    expect(await pending).toEqual(result);
    client.dispose(); expect(endpoint.terminated).toBe(1);
    expect(endpoint.listeners.message.size + endpoint.listeners.error.size).toBe(0);
  });
  it("matches out-of-order replies to owned graph instructions", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint), graph = createBayConstructionGraph();
    const first = client.evaluate(graph);
    const facade = graph.nodes.find(node => node.type === "FacadeScope")!;
    facade.parameters.widthM = 4;
    const second = client.evaluate(graph);
    await endpoint.complete(1);
    const next = await second;
    expect(next.ir.bounds.max[0]).toBeCloseTo(2);
    await endpoint.complete(0);
    const old = await first;
    expect(old.ir.bounds.max[0]).toBeCloseTo(1.4);
    client.dispose();
  });
  it("rejects invalid instructions before posting", () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    expect(() => client.evaluate({ kind: "pretend" })).toThrow();
    expect(endpoint.messages).toHaveLength(0);
    client.dispose();
  });
  it("keeps a request error distinct from another pending result", async () => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const first = client.evaluate(createBayConstructionGraph()), rejection = expect(first).rejects.toThrow("does not fit");
    const second = client.evaluate(createBayConstructionGraph());
    endpoint.emit({ schemaVersion: "0.1.0", type: "bay-error", requestId: 1, message: "Opening does not fit" });
    await rejection;
    await endpoint.complete(1);
    expect((await second).ir.meshBatches).toHaveLength(4);
    // A reply from a retired request cannot affect the next compilation.
    await endpoint.complete(0);
    client.dispose();
  });
  it.each(["malformed", "worker-error", "dispose"])("settles pending work on %s and releases the worker once", async reason => {
    const endpoint = new Endpoint(), client = new BayConstructionClient(endpoint);
    const pending = client.evaluate(createBayConstructionGraph()), rejection = expect(pending).rejects.toThrow();
    if (reason === "malformed") endpoint.emit({ type: "fake-result" });
    else if (reason === "worker-error") endpoint.fail();
    else client.dispose();
    await rejection;
    client.dispose();
    expect(endpoint.terminated).toBe(1);
    expect(endpoint.listeners.message.size + endpoint.listeners.error.size).toBe(0);
    await expect(client.evaluate(createBayConstructionGraph())).rejects.toThrow("closed");
  });
});

