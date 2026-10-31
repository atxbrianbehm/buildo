import { z } from "zod";
import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";

import { ConstructionGenerationLineageSchema, type ConstructionGenerationLineage } from "./constructionGenerationState";
import { ConstructionEvidenceApplicationSchema } from "../contracts/constructionEvidenceApplication";
import { readConstructionEvidenceApplication } from "../core/constructionEvidenceApplication";
type EvidenceApplication = z.infer<typeof ConstructionEvidenceApplicationSchema>;

const limit = 64;
const sourceHash = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotShape = z.object({
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0"]), materialSourceHash: sourceHash,
  entries: z.array(BayConstructionGraphSchema).min(1).max(limit), generations: z.array(ConstructionGenerationLineageSchema.nullable()).max(limit).optional(),
  evidenceApplications: z.array(ConstructionEvidenceApplicationSchema.nullable()).max(limit).optional(), cursor: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (Boolean(value.generations) !== (value.schemaVersion !== "0.1.0")) context.addIssue({ code: "custom", message: "Generation history requires version 0.2.0 or later." });
  if (Boolean(value.evidenceApplications) !== (value.schemaVersion === "0.3.0")) context.addIssue({ code: "custom", message: "Evidence application history requires version 0.3.0." });
  if (value.generations?.some((lineage, index) => lineage && (lineage.materialSourceHash !== value.materialSourceHash || lineage.source.documentId !== value.entries[index]?.documentId)))
    context.addIssue({ code: "custom", message: "Generation history does not match its graph and material identity." });
  if (value.generations && value.generations.length !== value.entries.length) context.addIssue({ code: "custom", message: "Generation history entries must align with source entries." });
  if (value.evidenceApplications && value.evidenceApplications.length !== value.entries.length) context.addIssue({ code: "custom", message: "Evidence application entries must align with source entries." });
  if (value.evidenceApplications?.some((application, index) => application && (!value.entries[index] || canonicalJson(application.resultGraph) !== canonicalJson(value.entries[index]) || canonicalJson(application.generationSource) !== canonicalJson(value.generations?.[index]?.source ?? null))))
    context.addIssue({ code: "custom", message: "Evidence application history must match its graph and generation source." });
  if (value.cursor >= value.entries.length) context.addIssue({ code: "custom", message: "History cursor is out of range." });
});
export const ConstructionHistorySnapshotSchema = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(snapshotShape);
export type ConstructionHistorySnapshot = z.infer<typeof ConstructionHistorySnapshotSchema>;
/** Replay evidence before admitting a history snapshot from an external source. */
export async function readConstructionHistorySnapshot(input: unknown): Promise<ConstructionHistorySnapshot> {
  const parsed = ConstructionHistorySnapshotSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("History admission would change serialized fields.");
  const owned = structuredClone(parsed);
  for (const application of owned.evidenceApplications ?? []) if (application) await readConstructionEvidenceApplication(application);
  return owned;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Source instructions only. Callers must replay-validate evidence before recording it or restoring external snapshots. GPU objects, previews and drafts never enter history. */
export class ConstructionHistory {
  private entries: BayConstructionGraph[] = [];
  private cursor = 0;
  private generations: Array<ConstructionGenerationLineage | null> = [];
  private evidenceApplications: Array<EvidenceApplication | null> = [];
  private materialSourceHash: string | null = null;
  constructor(snapshot?: unknown) {
    if (snapshot === undefined || snapshot === null) return;
    const owned = structuredClone(ConstructionHistorySnapshotSchema.parse(snapshot));
    this.entries = owned.entries.map(freeze); this.generations = (owned.generations ?? this.entries.map(() => null)).map(freeze);
    this.evidenceApplications = (owned.evidenceApplications ?? this.entries.map(() => null)).map(freeze); this.cursor = owned.cursor; this.materialSourceHash = owned.materialSourceHash;
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
  get currentEvidenceApplication() { return this.evidenceApplications[this.cursor] ?? null; }
  targetEvidenceApplication(direction: "undo" | "redo") { return this.evidenceApplications[this.cursor + (direction === "undo" ? -1 : 1)] ?? null; }
  record(graph: unknown, materialHash: string, reset = false, generation: ConstructionGenerationLineage | null = null, application: EvidenceApplication | null = null): boolean {
    const owned = freeze(BayConstructionGraphSchema.parse(graph)), hash = sourceHash.parse(materialHash);
    const lineage = generation ? freeze(structuredClone(ConstructionGenerationLineageSchema.parse(generation))) : null;
    const evidence = application ? freeze(structuredClone(ConstructionEvidenceApplicationSchema.parse(application))) : null;
    if (lineage && (lineage.materialSourceHash !== hash || lineage.source.documentId !== owned.documentId))
      throw new Error("Generation history must match its graph identity and material source.");
    if (evidence && (canonicalJson(evidence.resultGraph) !== canonicalJson(owned) || canonicalJson(evidence.generationSource) !== canonicalJson(lineage?.source ?? null)))
      throw new Error("Evidence application history must match its graph and generation source.");
    if (reset || this.materialSourceHash !== hash || !this.entries.length) {
      this.entries = [owned]; this.generations = [lineage]; this.evidenceApplications = [evidence]; this.cursor = 0; this.materialSourceHash = hash; return true;
    }
    if (canonicalJson(this.current) === canonicalJson(owned) && canonicalJson(this.currentGeneration) === canonicalJson(lineage) && canonicalJson(this.currentEvidenceApplication) === canonicalJson(evidence)) return false;
    this.generations = [...this.generations.slice(0, this.cursor + 1), lineage].slice(-limit);
    this.evidenceApplications = [...this.evidenceApplications.slice(0, this.cursor + 1), evidence].slice(-limit);
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
    const hasEvidence = this.evidenceApplications.some(Boolean), hasGenerations = hasEvidence || this.generations.some(Boolean);
    return this.materialSourceHash && this.entries.length ? freeze({ schemaVersion: hasEvidence ? "0.3.0" : hasGenerations ? "0.2.0" : "0.1.0", materialSourceHash: this.materialSourceHash,
      entries: this.entries, ...(hasGenerations ? { generations: this.generations } : {}), ...(hasEvidence ? { evidenceApplications: this.evidenceApplications } : {}), cursor: this.cursor }) : null;
  }
}
