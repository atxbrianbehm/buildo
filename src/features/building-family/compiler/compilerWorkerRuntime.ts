import { compileBuilding, type CompileBuildingInput } from "./buildingCompiler";
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
  if (
    typeof message === "object" &&
    message !== null &&
    "requestId" in message &&
    typeof (message as { requestId?: unknown }).requestId === "string"
  ) {
    return (message as { requestId: string }).requestId;
  }
  return "unknown-request";
}

export function createCompilerWorkerRuntime(options: CompilerWorkerRuntimeOptions): CompilerWorkerRuntime {
  const compile = options.compile ?? compileBuilding;
  const cancelledRequestIds = new Set<string>();
  let activeRequestId: string | undefined;

  async function handleMessage(message: unknown): Promise<void> {
    const parsed = CompilerWorkerRequestSchema.safeParse(message);

    if (!parsed.success) {
      options.postMessage({
        type: "error",
        requestId: requestIdFromUnknown(message),
        error: {
          name: "CompilerWorkerValidationError",
          message: parsed.error.issues.map((issue) => issue.message).join(", ")
        }
      });
      return;
    }

    const request: CompilerWorkerRequest = parsed.data;

    if (request.type === "cancel") {
      cancelledRequestIds.add(request.requestId);
      if (activeRequestId === request.requestId) {
        activeRequestId = undefined;
      }
      return;
    }

    activeRequestId = request.requestId;
    cancelledRequestIds.delete(request.requestId);
    options.postMessage({
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
        catalog: request.catalog
      });

      if (activeRequestId !== request.requestId || cancelledRequestIds.has(request.requestId)) {
        return;
      }

      options.postMessage({
        type: "progress",
        requestId: request.requestId,
        stage: "compilingGeometry",
        completed: 1,
        total: 1
      });
      options.postMessage(
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
      options.postMessage({
        type: "error",
        requestId: request.requestId,
        error: serializeCompilerError(error)
      });
      activeRequestId = undefined;
    }
  }

  return { handleMessage };
}
