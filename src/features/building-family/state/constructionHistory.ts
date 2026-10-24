import { z } from "zod";
import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";

import { ConstructionGenerationLineageSchema, type ConstructionGenerationLineage } from "./constructionGenerationState";

const limit = 64;
const sourceHash = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotShape = z.object({
  schemaVersion: z.enum(["0.1.0", "0.2.0"]), materialSourceHash: sourceHash,
  entries: z.array(BayConstructionGraphSchema).min(1).max(limit), generations: z.array(ConstructionGenerationLineageSchema.nullable()).max(limit).optional(), cursor: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (Boolean(value.generations) !== (value.schemaVersion === "0.2.0")) context.addIssue({ code: "custom", message: "Generation history requires version 0.2.0." });
  if (value.generations?.some((lineage, index) => lineage && (lineage.materialSourceHash !== value.materialSourceHash || lineage.source.documentId !== value.entries[index]?.documentId)))
    context.addIssue({ code: "custom", message: "Generation history does not match its graph and material identity." });
  if (value.generations && value.generations.length !== value.entries.length) context.addIssue({ code: "custom", message: "Generation history entries must align with source entries." });
  if (value.cursor >= value.entries.length) context.addIssue({ code: "custom", message: "History cursor is out of range." });
});
export const ConstructionHistorySnapshotSchema = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(snapshotShape);
export type ConstructionHistorySnapshot = z.infer<typeof ConstructionHistorySnapshotSchema>;
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Source instructions only. GPU objects, previews and unapplied drafts never enter history. */
export class ConstructionHistory {
  private entries: BayConstructionGraph[] = [];
  private cursor = 0;
  private generations: Array<ConstructionGenerationLineage | null> = [];
  private materialSourceHash: string | null = null;
  constructor(snapshot?: unknown) {
    if (snapshot === undefined || snapshot === null) return;
    const owned = structuredClone(ConstructionHistorySnapshotSchema.parse(snapshot));
    this.entries = owned.entries.map(freeze); this.generations = (owned.generations ?? this.entries.map(() => null)).map(freeze); this.cursor = owned.cursor; this.materialSourceHash = owned.materialSourceHash;
  }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.entries.length > this.cursor + 1; }
  get undoCount() { return this.cursor; }
  get redoCount() { return Math.max(0, this.entries.length - this.cursor - 1); }
  get current(): BayConstructionGraph | null { return this.entries[this.cursor] ?? null; }
  target(direction: "undo" | "redo"): BayConstructionGraph | null {
    return this.entries[this.cursor + (direction === "undo" ? -1 : 1)] ?? null;
  }
  get currentGeneration() { return this.generations[this.cursor] ?? null; }
  targetGeneration(direction: "undo" | "redo") { return this.generations[this.cursor + (direction === "undo" ? -1 : 1)] ?? null; }
  record(graph: unknown, materialHash: string, reset = false, generation: ConstructionGenerationLineage | null = null): boolean {
    const owned = freeze(BayConstructionGraphSchema.parse(graph)), hash = sourceHash.parse(materialHash);
    const lineage = generation ? freeze(structuredClone(ConstructionGenerationLineageSchema.parse(generation))) : null;
    if (lineage && (lineage.materialSourceHash !== hash || lineage.source.documentId !== owned.documentId))
      throw new Error("Generation history must match its graph identity and material source.");
    if (reset || this.materialSourceHash !== hash || !this.entries.length) {
      this.entries = [owned]; this.generations = [lineage]; this.cursor = 0; this.materialSourceHash = hash; return true;
    }
    if (canonicalJson(this.current) === canonicalJson(owned) && canonicalJson(this.currentGeneration) === canonicalJson(lineage)) return false;
    this.generations = [...this.generations.slice(0, this.cursor + 1), lineage].slice(-limit);
    this.entries = [...this.entries.slice(0, this.cursor + 1), owned].slice(-limit);
    this.cursor = this.entries.length - 1; return true;
  }
  /** Move only after the corresponding source has passed compilation and viewer preparation. */
  acceptTraversal(direction: "undo" | "redo", acceptedGraph: BayConstructionGraph): void {
    const target = this.target(direction);
    if (!target || canonicalJson(target) !== canonicalJson(acceptedGraph)) throw new Error("Construction history changed before the source was accepted.");
    this.cursor += direction === "undo" ? -1 : 1;
  }
  snapshot(): ConstructionHistorySnapshot | null {
    return this.materialSourceHash && this.entries.length ? freeze({ schemaVersion: this.generations.some(Boolean) ? "0.2.0" : "0.1.0", materialSourceHash: this.materialSourceHash,
      entries: this.entries, ...(this.generations.some(Boolean) ? { generations: this.generations } : {}), cursor: this.cursor }) : null;
  }
}
