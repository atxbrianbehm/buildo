import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { CompileBuildingInput } from "./buildingCompiler";
import {
  CompilerWorkerResponseSchema,
  type CompilerWorkerRequest,
  type CompilerWorkerResponse,
  type CompilerWorkerProgressResponse
} from "./compilerWorkerProtocol";

export interface CompilerClientEndpoint {
  postMessage(message: CompilerWorkerRequest): void;
  subscribe(listener: (message: CompilerWorkerResponse) => void): () => void;
}

export interface CompilerAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface CompilerClientCompileOptions {
  requestId?: string;
  signal?: CompilerAbortSignal;
  onProgress?: (progress: CompilerWorkerProgressResponse) => void;
}

export interface CompilerClientOptions {
  createRequestId?: () => string;
}

interface ActiveCompileRequest {
  requestId: string;
  resolve: (ir: RuntimeBuildingIR) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: CompilerWorkerProgressResponse) => void;
  signal?: CompilerAbortSignal;
  abortListener?: () => void;
}

let nextCompilerRequestId = 0;

function defaultRequestId(): string {
  nextCompilerRequestId += 1;
  return `compile-${nextCompilerRequestId.toString(36)}`;
}

function compilerClientError(message: string, name: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export class CompilerClient {
  private readonly endpoint: CompilerClientEndpoint;
  private readonly createRequestId: () => string;
  private readonly unsubscribe: () => void;
  private activeRequest: ActiveCompileRequest | undefined;

  constructor(endpoint: CompilerClientEndpoint, options: CompilerClientOptions = {}) {
    this.endpoint = endpoint;
    this.createRequestId = options.createRequestId ?? defaultRequestId;
    this.unsubscribe = endpoint.subscribe((message) => this.handleResponse(message));
  }

  compile(input: CompileBuildingInput, options: CompilerClientCompileOptions = {}): Promise<RuntimeBuildingIR> {
    const requestId = options.requestId ?? this.createRequestId();

    if (this.activeRequest) {
      const previous = this.activeRequest;
      this.cleanupActiveRequest();
      this.endpoint.postMessage({ type: "cancel", requestId: previous.requestId });
      previous.reject(
        compilerClientError(
          `Compiler request ${previous.requestId} was superseded by ${requestId}.`,
          "CompilerRequestSupersededError"
        )
      );
    }

    if (options.signal?.aborted) {
      return Promise.reject(compilerClientError(`Compiler request ${requestId} was aborted.`, "CompilerRequestAbortError"));
    }

    const promise = new Promise<RuntimeBuildingIR>((resolve, reject) => {
      const activeRequest: ActiveCompileRequest = {
        requestId,
        resolve,
        reject,
        onProgress: options.onProgress,
        signal: options.signal
      };

      if (options.signal) {
        activeRequest.abortListener = () => {
          if (this.activeRequest?.requestId !== requestId) {
            return;
          }
          this.cleanupActiveRequest();
          this.endpoint.postMessage({ type: "cancel", requestId });
          reject(compilerClientError(`Compiler request ${requestId} was aborted.`, "CompilerRequestAbortError"));
        };
        options.signal.addEventListener("abort", activeRequest.abortListener, { once: true });
      }

      this.activeRequest = activeRequest;
      this.endpoint.postMessage({
        type: "compile",
        requestId,
        spec: input.spec,
        graph: input.graph,
        catalog: input.catalog
      });
    });

    return promise;
  }

  dispose(): void {
    if (this.activeRequest) {
      const requestId = this.activeRequest.requestId;
      this.cleanupActiveRequest();
      this.endpoint.postMessage({ type: "cancel", requestId });
    }
    this.unsubscribe();
  }

  private handleResponse(message: CompilerWorkerResponse): void {
    const parsed = CompilerWorkerResponseSchema.safeParse(message);
    if (!parsed.success || !this.activeRequest || parsed.data.requestId !== this.activeRequest.requestId) {
      return;
    }

    const activeRequest = this.activeRequest;
    const response = parsed.data;

    if (response.type === "progress") {
      activeRequest.onProgress?.(response);
      return;
    }

    this.cleanupActiveRequest();

    if (response.type === "complete") {
      activeRequest.resolve(response.ir);
      return;
    }

    activeRequest.reject(compilerClientError(response.error.message, response.error.name ?? "CompilerWorkerError"));
  }

  private cleanupActiveRequest(): void {
    const activeRequest = this.activeRequest;
    if (activeRequest?.signal && activeRequest.abortListener) {
      activeRequest.signal.removeEventListener("abort", activeRequest.abortListener);
    }
    this.activeRequest = undefined;
  }
}
