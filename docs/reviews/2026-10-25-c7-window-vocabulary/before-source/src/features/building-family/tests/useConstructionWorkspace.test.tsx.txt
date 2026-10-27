import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { useConstructionWorkspace } from "../state/useConstructionWorkspace";
import type { BayConstructionSession } from "../ui/BayConstructionWorkbench";
import type { ConstructionCheckpointWriter } from "../state/constructionCheckpointWriter";
import type { ParsedConstructionCheckpoint } from "../state/constructionCheckpoint";

const ports = vi.hoisted(() => ({ acquire: vi.fn(), queues: [] as Array<{ save: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> }));
vi.mock("../state/constructionCheckpointWriter", () => ({
  acquireConstructionCheckpointWriter: ports.acquire,
  ConstructionCheckpointQueue: class {
    save = vi.fn();
    close: ReturnType<typeof vi.fn>;
    constructor(writer: ConstructionCheckpointWriter) { this.close = vi.fn(() => writer.close()); ports.queues.push(this); }
  }
}));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const source = { graph: { schemaVersion: "0.2.0", documentId: "authored-graph" },
  materials: { file: { contentHash: "a".repeat(64) } } } as BayConstructionSession;
const parsed = { project: { graph: source.graph, contentHash: "b".repeat(64) }, materials: source.materials } as ParsedConstructionCheckpoint;
function writer(documentId: string, value: ParsedConstructionCheckpoint | undefined = undefined) {
  return { workspaceDocumentId: documentId, read: vi.fn(async () => value), put: vi.fn(), close: vi.fn(async () => {}) };
}
beforeEach(() => {
  ports.acquire.mockReset(); ports.queues.length = 0;
  vi.stubGlobal("navigator", { locks: { request: vi.fn() } }); vi.stubGlobal("indexedDB", {});
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.unstubAllGlobals(); });

it("reports unsupported, busy and unreadable recovery without inventing a saved session", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const unsupported = renderHook(() => useConstructionWorkspace("unsupported"));
  await waitFor(() => expect(unsupported.result.current.status.state).toBe("unsupported"));
  expect(ports.acquire).not.toHaveBeenCalled(); unsupported.unmount();
  vi.stubGlobal("indexedDB", {}); ports.acquire.mockResolvedValueOnce(undefined);
  const busy = renderHook(() => useConstructionWorkspace("busy"));
  await waitFor(() => expect(busy.result.current.status.state).toBe("busy"));
  expect(busy.result.current.session).toBeNull(); busy.unmount();
  const broken = writer("broken"); broken.read.mockRejectedValueOnce(new Error("Corrupt source")); ports.acquire.mockResolvedValueOnce(broken);
  const failed = renderHook(() => useConstructionWorkspace("broken"));
  await waitFor(() => expect(failed.result.current.status.state).toBe("failed"));
  expect(failed.result.current.status.message).toContain("retained"); expect(failed.result.current.mode).toBe(false);
  expect(broken.close).toHaveBeenCalledTimes(1); expect(ports.queues).toHaveLength(0);
});

it("recovers source into construction mode and retains the accepted session across room changes", async () => {
  const owner = writer("recovered", parsed); ports.acquire.mockResolvedValueOnce(owner);
  const { result } = renderHook(() => useConstructionWorkspace("recovered"));
  await waitFor(() => expect(result.current.status.state).toBe("recovered"));
  expect(result.current.mode).toBe(true); expect(result.current.recovering).toBe(true);
  expect(result.current.session?.materials).toBe(source.materials);
  const accepted = { ...source, history: null };
  act(() => result.current.acceptSession(accepted));
  expect(result.current.recovering).toBe(false); expect(result.current.session).toBe(accepted);
  expect(ports.queues[0].save).toHaveBeenCalledWith(expect.any(String), accepted.graph, accepted.materials.file);
  act(() => result.current.setMode(false)); expect(result.current.mode).toBe(false); expect(result.current.session).toBe(accepted);
  act(() => result.current.setMode(true)); expect(result.current.mode).toBe(true); expect(ports.acquire).toHaveBeenCalledTimes(1);
});

it("discards stale document acquisition and closes its writer before another mount acquires the same document", async () => {
  const acquisition = deferred<ConstructionCheckpointWriter | undefined>(), closing = deferred<void>();
  const old = writer("switch-old", parsed); old.close.mockImplementation(() => closing.promise);
  ports.acquire.mockReturnValueOnce(acquisition.promise).mockResolvedValueOnce(writer("switch-new"));
  const view = renderHook(({ id }) => useConstructionWorkspace(id), { initialProps: { id: "switch-old" } });
  await waitFor(() => expect(ports.acquire).toHaveBeenCalledTimes(1)); view.rerender({ id: "switch-new" });
  await waitFor(() => expect(view.result.current.status.state).toBe("ready"));
  const replacement = renderHook(() => useConstructionWorkspace("switch-old"));
  await act(async () => { acquisition.resolve(old); });
  expect(old.read).not.toHaveBeenCalled(); expect(old.close).toHaveBeenCalledTimes(1);
  expect(ports.acquire).toHaveBeenCalledTimes(2); expect(replacement.result.current.status.state).toBe("loading");
  expect(view.result.current.documentId).toBe("switch-new"); expect(view.result.current.session).toBeNull();
  ports.acquire.mockResolvedValueOnce(writer("switch-old"));
  await act(async () => { closing.resolve(); });
  await waitFor(() => expect(replacement.result.current.status.state).toBe("ready"));
  expect(ports.acquire).toHaveBeenCalledTimes(3);
});

it("retains the saved copy when recovered source cannot be displayed and stops accepting checkpoint writes", async () => {
  ports.acquire.mockResolvedValueOnce(writer("display-failure", parsed));
  const { result } = renderHook(() => useConstructionWorkspace("display-failure"));
  await waitFor(() => expect(result.current.status.state).toBe("recovered"));
  act(() => result.current.failRecovery());
  expect(result.current.mode).toBe(false); expect(result.current.session).toBeNull();
  expect(result.current.status.state).toBe("failed"); expect(result.current.status.message).toContain("retained");
  act(() => result.current.acceptSession(source)); expect(ports.queues[0].save).not.toHaveBeenCalled();
});
