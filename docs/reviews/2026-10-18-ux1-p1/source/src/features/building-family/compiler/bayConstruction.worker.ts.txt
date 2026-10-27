/// <reference lib="webworker" />
import { evaluateConstruction } from "./evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "./bayConstructionWorkerProtocol";

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
  const request = BayConstructionWorkerRequestSchema.safeParse(event.data);
  if (!request.success) {
    const identity = typeof event.data === "object" && event.data !== null && "requestId" in event.data
      ? Number(event.data.requestId) : 0;
    self.postMessage({ schemaVersion: "0.1.0", type: "bay-error",
      requestId: Number.isSafeInteger(identity) && identity > 0 ? identity : 0,
      message: "Construction instructions are invalid." });
    return;
  }
  try {
    const result = await evaluateConstruction(request.data.graph, request.data.previewNodeId);
    const reply = BayConstructionWorkerReplySchema.parse({
      schemaVersion: request.data.schemaVersion, type: "bay-result", requestId: request.data.requestId, result
    });
    const buffers = [...result.ir.meshBatches, ...(result.prototypes ?? [])].flatMap(batch =>
      [batch.positions, batch.normals, batch.uvs, batch.indices].flatMap(array => array ? [array.buffer as ArrayBuffer] : []));
    buffers.push(...result.ir.instanceBatches.flatMap(batch => batch.transforms ? [batch.transforms.buffer as ArrayBuffer] : []));
    self.postMessage(reply, [...new Set(buffers)]);
  } catch (error) {
    self.postMessage({ schemaVersion: request.data.schemaVersion, type: "bay-error", requestId: request.data.requestId,
      message: error instanceof Error ? error.message : "Construction evaluation failed." });
  }
});

