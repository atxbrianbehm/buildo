import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalJson } from "../core/canonicalJson";
import type { BayConstructionSession } from "../ui/BayConstructionWorkbench";
import { acquireConstructionCheckpointWriter, ConstructionCheckpointQueue, type ConstructionCheckpointWriter } from "./constructionCheckpointWriter";

export interface ConstructionRecoveryStatus {
  state: "loading" | "ready" | "saving" | "saved" | "recovered" | "busy" | "unsupported" | "failed";
  message?: string; projectHash?: string;
}
export function constructionRecoveryText(status: ConstructionRecoveryStatus): string {
  const copy: Record<ConstructionRecoveryStatus["state"], string> = {
    loading: "Checking construction recovery…", ready: "Construction edits will be saved automatically.",
    saving: "Saving construction…", saved: "Construction saved.", recovered: "Recovered saved construction.",
    busy: "This construction is open in another tab. Save construction to keep manual changes.",
    unsupported: "Automatic recovery is unavailable here. Save construction to keep a copy.",
    failed: "Automatic saving failed. Save construction to keep your changes."
  };
  return status.message ?? copy[status.state];
}
const closingDocuments = new Map<string, Promise<void>>();
const sourceKey = (session: BayConstructionSession) => canonicalJson({ graph: session.graph, materialSourceHash: session.materials.file.contentHash, ...(session.materials.awningFabric ? { awningFabricHash: session.materials.awningFabric.contentHash } : {}), ...(session.generation ? { generation: session.generation } : {}) });
interface WorkspaceState { documentId: string; mode: boolean; session: BayConstructionSession | null; status: ConstructionRecoveryStatus; recovering: boolean }

/** Keeps accepted source alive across room changes; page recovery creates fresh renderer resources. */
export function useConstructionWorkspace(documentId: string) {
  const [state, setState] = useState<WorkspaceState>(() => ({ documentId, mode: false, session: null, status: { state: "loading" }, recovering: false }));
  const ownerRef = useRef<{ documentId: string; queue: ConstructionCheckpointQueue | null } | null>(null);
  useEffect(() => {
    let active = true, writer: ConstructionCheckpointWriter | undefined, queue: ConstructionCheckpointQueue | undefined;
    const owner = { documentId, queue: null as ConstructionCheckpointQueue | null }; ownerRef.current = owner;
    let finishAcquisition!: () => void;
    const acquisitionFinished = new Promise<void>(resolve => { finishAcquisition = resolve; });
    const update = (change: Partial<WorkspaceState>) => {
      if (active) setState(previous => previous.documentId === documentId ? { ...previous, ...change }
        : { documentId, mode: false, session: null, status: { state: "loading" }, recovering: false, ...change });
    };
    void (async () => {
      try {
        await closingDocuments.get(documentId);
        if (!active) return;
        if (typeof globalThis.navigator?.locks?.request !== "function" || !globalThis.indexedDB) {
          update({ status: { state: "unsupported" } }); return;
        }
        writer = await acquireConstructionCheckpointWriter({ workspaceDocumentId: documentId });
        if (!active) return;
        if (!writer) { update({ status: { state: "busy" } }); return; }
        const parsed = await writer.read();
        if (parsed?.project.graph.schemaVersion === "0.15.0") throw new Error("Facade pier graphs are not yet supported in construction recovery.");
        if (!active) return;
        const session: BayConstructionSession | null = parsed ? { graph: parsed.project.graph, materials: parsed.materials, ...(parsed.project.generation ? { generation: parsed.project.generation } : {}) } : null;
        queue = new ConstructionCheckpointQueue(writer, event => {
          if (!active) return;
          update({ status: event.state === "failed" ? { state: "failed" } : event.state === "saved"
            ? { state: "saved", projectHash: event.projectHash } : { state: "saving" } });
        }, parsed && session ? { sourceKey: sourceKey(session), projectHash: parsed.project.contentHash } : undefined);
        owner.queue = queue;
        update({ session, mode: Boolean(session), recovering: Boolean(session),
          status: session ? { state: "recovered", projectHash: parsed!.project.contentHash } : { state: "ready" } });
      } catch {
        if (writer) await writer.close().catch(() => undefined);
        update({ mode: false, session: null, recovering: false, status: { state: "failed",
          message: "The saved construction could not be recovered. Its saved copy has been retained." } });
      } finally { finishAcquisition(); }
    })();
    return () => {
      active = false; if (ownerRef.current === owner) ownerRef.current = null;
      const close = (async () => { await acquisitionFinished; if (queue) await queue.close(); else await writer?.close(); })();
      const terminal = close.catch(() => undefined); closingDocuments.set(documentId, terminal);
      void terminal.then(() => { if (closingDocuments.get(documentId) === terminal) closingDocuments.delete(documentId); });
    };
  }, [documentId]);
  const acceptSession = useCallback((session: BayConstructionSession) => {
    const owner = ownerRef.current; if (!owner || owner.documentId !== documentId) return;
    setState(previous => previous.documentId === documentId ? { ...previous, session, recovering: false } : previous);
    if (session.materials.awningFabric) owner.queue?.save(sourceKey(session), session.graph, session.materials.file, session.generation ?? undefined, session.materials.awningFabric);
    else if (session.generation) owner.queue?.save(sourceKey(session), session.graph, session.materials.file, session.generation);
    else owner.queue?.save(sourceKey(session), session.graph, session.materials.file);
  }, [documentId]);
  const setMode = useCallback((mode: boolean) => {
    setState(previous => previous.documentId === documentId ? { ...previous, mode } : previous);
  }, [documentId]);
  const failRecovery = useCallback(() => {
    const owner = ownerRef.current;
    if (owner?.documentId === documentId && owner.queue) { void owner.queue.close().catch(() => undefined); owner.queue = null; }
    setState(previous => previous.documentId === documentId ? { ...previous, mode: false, session: null, recovering: false,
      status: { state: "failed", message: "The saved construction could not be displayed. Its saved copy has been retained." } } : previous);
  }, [documentId]);
  const current = state.documentId === documentId ? state : { documentId, mode: false, session: null, recovering: false, status: { state: "loading" as const } };
  return { ...current, acceptSession, setMode, failRecovery };
}
