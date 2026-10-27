import { compileBuilding, readWindowWidthCompileOptions, type CompileBuildingInput } from "./buildingCompiler";
import {
  collectRuntimeIrTransferables,
  CompilerWorkerRequestSchema,
  serializeCompilerError,
  type CompilerWorkerRequest,
  type CompilerWorkerResponse
} from "./compilerWorkerProtocol";

export interface CompilerWorkerTransport {
  postMessage(message: CompilerWorkerResponse, transferables?: ArrayBuffer[]): void;
}

export interface CompilerWorkerRuntimeOptions extends CompilerWorkerTransport {
  compile?: (input: CompileBuildingInput) => Promise<Awaited<ReturnType<typeof compileBuilding>>>;
}

export interface CompilerWorkerRuntime {
  handleMessage(message: unknown): Promise<void>;
}

function requestIdFromUnknown(message: unknown): string {
  try {
    const descriptor = typeof message === "object" && message !== null
      ? Object.getOwnPropertyDescriptor(message, "requestId") : undefined;
    if (descriptor && "value" in descriptor && typeof descriptor.value === "string" && descriptor.value.length > 0) return descriptor.value;
  } catch { /* Invalid request metadata must not invoke an accessor while reporting failure. */ }
  return "unknown-request";
}

export function createCompilerWorkerRuntime(options: CompilerWorkerRuntimeOptions): CompilerWorkerRuntime {
  const compile = options.compile ?? compileBuilding;
  const postMessage = options.postMessage.bind(options);
  const cancelledRequestIds = new Set<string>();
  let activeRequestId: string | undefined;

  async function handleMessage(message: unknown): Promise<void> {
    try {
      if (typeof message === "object" && message !== null) readWindowWidthCompileOptions(message);
    } catch (error) {
      postMessage({ type: "error", requestId: requestIdFromUnknown(message), error: serializeCompilerError(error) });
      return;
    }
    const parsed = CompilerWorkerRequestSchema.safeParse(message);

    if (!parsed.success) {
      postMessage({
        type: "error",
        requestId: requestIdFromUnknown(message),
        error: {
          name: "CompilerWorkerValidationError",
          message: parsed.error.issues.map((issue) => issue.message).join(", ")
        }
      });
      return;
    }

    let request: CompilerWorkerRequest;
    try { request = structuredClone(parsed.data); }
    catch {
      postMessage({ type: "error", requestId: requestIdFromUnknown(message),
        error: { name: "CompilerWorkerValidationError", message: "Compiler request data must support structured cloning." } });
      return;
    }

    if (request.type === "cancel") {
      cancelledRequestIds.add(request.requestId);
      if (activeRequestId === request.requestId) {
        activeRequestId = undefined;
      }
      return;
    }

    activeRequestId = request.requestId;
    cancelledRequestIds.delete(request.requestId);
    postMessage({
      type: "progress",
      requestId: request.requestId,
      stage: "compilingGeometry",
      completed: 0,
      total: 1
    });

    try {
      const ir = await compile({
        spec: request.spec,
        graph: request.graph,
        catalog: request.catalog,
        ...(request.buildingId === undefined ? {} : { buildingId: request.buildingId }),
        ...(request.detailLevel === undefined ? {} : { detailLevel: request.detailLevel }),
        ...(request.fidelityMode === undefined ? {} : { fidelityMode: request.fidelityMode }),
        ...(request.type === "compile-window-width-batch"
          ? { windowWidthBatch: request.windowWidthBatch }
          : request.windowWidthOverrides === undefined ? {} : { windowWidthOverrides: request.windowWidthOverrides })
      });

      if (activeRequestId !== request.requestId || cancelledRequestIds.has(request.requestId)) {
        return;
      }

      postMessage({
        type: "progress",
        requestId: request.requestId,
        stage: "compilingGeometry",
        completed: 1,
        total: 1
      });
      postMessage(
        {
          type: "complete",
          requestId: request.requestId,
          ir
        },
        collectRuntimeIrTransferables(ir)
      );
      activeRequestId = undefined;
    } catch (error) {
      if (activeRequestId !== request.requestId || cancelledRequestIds.has(request.requestId)) {
        return;
      }
      postMessage({
        type: "error",
        requestId: request.requestId,
        error: serializeCompilerError(error)
      });
      activeRequestId = undefined;
    }
  }

  return { handleMessage };
}
