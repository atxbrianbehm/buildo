import { createCompilerWorkerRuntime } from "./compilerWorkerRuntime";

type WorkerScope = {
  postMessage(message: unknown, transferables?: ArrayBuffer[]): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
};

const workerScope = globalThis as unknown as WorkerScope;
const runtime = createCompilerWorkerRuntime({
  postMessage: (message, transferables) => workerScope.postMessage(message, transferables)
});

workerScope.addEventListener("message", (event) => {
  void runtime.handleMessage(event.data);
});
