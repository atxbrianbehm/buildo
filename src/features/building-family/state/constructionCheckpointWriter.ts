import { ConstructionCheckpointSchema, createConstructionCheckpoint, createConstructionCheckpointPersistence,
  type ConstructionCheckpoint, type ConstructionCheckpointPersistence, type ParsedConstructionCheckpoint } from "./constructionCheckpoint";

export const CONSTRUCTION_CHECKPOINT_LOCK_PREFIX = "buildo-construction-source:";
export interface ConstructionCheckpointWriter {
  readonly workspaceDocumentId: string;
  read(): Promise<ParsedConstructionCheckpoint | undefined>;
  put(record: unknown): Promise<void>;
  close(): Promise<void>;
}
/** A separate namespace from the retained legacy building source writer. */
export async function acquireConstructionCheckpointWriter(options: {
  workspaceDocumentId: string; locks?: Pick<LockManager, "request">;
  createPersistence?: () => ConstructionCheckpointPersistence;
}): Promise<ConstructionCheckpointWriter | undefined> {
  const documentId = options.workspaceDocumentId;
  if (!documentId || documentId.trim() !== documentId || documentId.length > 512) throw new Error("Invalid construction workspace identity.");
  const manager = options.locks ?? globalThis.navigator?.locks;
  if (!manager || typeof manager.request !== "function") return undefined;
  const name = CONSTRUCTION_CHECKPOINT_LOCK_PREFIX + JSON.stringify(documentId);
  type Acquisition = { writer: ConstructionCheckpointWriter } | { unavailable: true } | { error: unknown };
  let ready!: (value: Acquisition) => void, release!: () => void, finish!: () => void;
  const readiness = new Promise<Acquisition>(resolve => { ready = resolve; });
  const holding = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  let held = false, closing = false, returned = false, settled = false, operations = 0;
  let failure: unknown, writer: ConstructionCheckpointWriter | undefined, closePromise: Promise<void> | undefined;
  const quiesce = () => { if (closing && operations === 0) release(); };
  const check = () => { if (!held || closing) throw new Error("The construction source writer is closed."); };
  const granted = (lock: Lock | null): Promise<void> => {
    if (settled) return Promise.resolve();
    if (!lock) { closing = true; ready({ unavailable: true }); quiesce(); return holding; }
    try {
      if (lock.name !== name || lock.mode !== "exclusive") throw new Error("Construction writer lock identity does not match.");
      const persistence = (options.createPersistence ?? createConstructionCheckpointPersistence)();
      held = true;
      writer = {
        workspaceDocumentId: documentId,
        async read() {
          check(); operations++;
          try { const result = await persistence.get(documentId); if (!held) throw new Error("Construction source ownership was lost."); return result; }
          finally { operations--; quiesce(); }
        },
        async put(input) {
          check(); const owned = ConstructionCheckpointSchema.parse(input);
          if (owned.workspaceDocumentId !== documentId) throw new Error("Construction source belongs to another workspace.");
          operations++;
          try { await persistence.put(owned); if (!held) throw new Error("Construction source ownership was lost before acknowledgement."); }
          finally { operations--; quiesce(); }
        },
        close() {
          closing = true; quiesce();
          closePromise ??= finished.then(() => { if (failure) throw failure; });
          void closePromise.catch(() => undefined); return closePromise;
        }
      };
      if (returned) ready({ writer });
    } catch (error) { failure = error; closing = true; ready({ error }); quiesce(); }
    return holding;
  };
  const finishRequest = (error?: unknown) => {
    settled = true;
    if (error || !closing) failure = error ?? new Error("Construction source ownership ended unexpectedly.");
    held = false; closing = true; quiesce(); finish();
    if (!writer) ready(failure ? { error: failure } : { unavailable: true });
  };
  try {
    const request = manager.request.call(manager, name, { mode: "exclusive", ifAvailable: true }, granted);
    returned = true;
    void Promise.resolve(request).then(() => finishRequest(), error => finishRequest(error));
    if (writer && held && !settled) ready({ writer });
  } catch (error) { finishRequest(error); }
  const acquisition = await readiness;
  if ("error" in acquisition) throw acquisition.error;
  if ("unavailable" in acquisition) return undefined;
  await Promise.resolve();
  if (!held || settled || failure) { closing = true; quiesce(); throw failure ?? new Error("Construction source ownership is unavailable."); }
  return acquisition.writer;
}

export type ConstructionSaveEvent = { state: "saving" } | { state: "saved"; sourceKey: string; projectHash: string } | { state: "failed"; message: string };
/** Latest accepted source wins; actual persistence and lock acknowledgements remain serialized. */
export class ConstructionCheckpointQueue {
  private latest: { sequence: number; sourceKey: string; record: Promise<ConstructionCheckpoint> } | null = null;
  private sequence = 0;
  private running: Promise<void> | null = null;
  private closed = false;
  private acknowledgedKey: string | null;
  private acknowledgedHash: string | null;
  constructor(private writer: ConstructionCheckpointWriter, private notify: (event: ConstructionSaveEvent) => void,
    initial?: { sourceKey: string; projectHash: string }) {
    this.acknowledgedKey = initial?.sourceKey ?? null; this.acknowledgedHash = initial?.projectHash ?? null;
  }
  save(sourceKey: string, graph: unknown, materialSource: unknown, generation?: unknown, awningFabric?: unknown): void {
    if (this.closed) return;
    if (!this.running && !this.latest && sourceKey === this.acknowledgedKey) return;
    // The codec owns graph/material JSON before its first await. Superseded promises are observed too.
    const record = createConstructionCheckpoint(this.writer.workspaceDocumentId, graph, materialSource, generation, awningFabric);
    void record.catch(() => undefined);
    this.latest = { sequence: ++this.sequence, sourceKey, record }; this.notify({ state: "saving" }); this.pump();
  }
  private pump(): void {
    if (this.running) return;
    this.running = (async () => {
      while (this.latest) {
        const item = this.latest; this.latest = null;
        try {
          const record = await item.record;
          if (item.sequence !== this.sequence) continue;
          if (item.sourceKey !== this.acknowledgedKey) {
            await this.writer.put(record); this.acknowledgedKey = item.sourceKey; this.acknowledgedHash = record.project.contentHash;
          }
          if (item.sequence === this.sequence) this.notify({ state: "saved", sourceKey: item.sourceKey, projectHash: this.acknowledgedHash! });
        } catch (error) {
          this.acknowledgedKey = null; this.acknowledgedHash = null;
          if (item.sequence === this.sequence) this.notify({ state: "failed", message: error instanceof Error ? error.message : "Construction source could not be saved." });
        }
      }
    })().finally(() => { this.running = null; if (this.latest) this.pump(); });
    void this.running.catch(() => undefined);
  }
  async drain(): Promise<void> { while (this.running) await this.running; }
  async close(): Promise<void> { this.closed = true; await this.drain(); await this.writer.close(); }
}
