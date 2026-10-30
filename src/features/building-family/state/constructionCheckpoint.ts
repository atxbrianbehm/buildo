import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { CachedArtifactEntrySchema, type CachedArtifactEntry } from "../materials/artifactCache";
import { createIndexedDbArtifactPersistence, type IndexedDbArtifactPersistence } from "../materials/indexedDbArtifactPersistence";
import { BayConstructionProjectSchema, createBayConstructionProject, readBayConstructionProject } from "./bayConstructionProject";

export const CONSTRUCTION_CHECKPOINT_DATABASE = "buildo-construction-source-checkpoints";
export const CONSTRUCTION_CHECKPOINT_STORE = "constructionSources";
export const CONSTRUCTION_CHECKPOINT_TYPE = "construction-source-checkpoint";
const documentIdSchema = z.string().min(1).max(512).refine(value => value.trim() === value);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const payloadSchema = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-source-checkpoint"),
  workspaceDocumentId: documentIdSchema, createdAt: z.string().datetime(), project: BayConstructionProjectSchema }).strict();
function jsonBoundary() {
  return z.unknown().superRefine((input, context) => {
    const issue = findBuildingDocumentJsonIssue(input);
    if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });
}
export const ConstructionCheckpointSchema = jsonBoundary().pipe(payloadSchema.extend({ contentHash: hash }).strict());
export type ConstructionCheckpoint = z.infer<typeof ConstructionCheckpointSchema>;
export type ParsedConstructionCheckpoint = Awaited<ReturnType<typeof readConstructionCheckpoint>>;

/** Capture graph and encoded material authority synchronously, before nested validation yields. */
export async function createConstructionCheckpoint(workspaceDocumentId: string, graph: unknown, materialSource: unknown, generation?: unknown): Promise<ConstructionCheckpoint> {
  const documentId = documentIdSchema.parse(workspaceDocumentId);
  const projectPromise = createBayConstructionProject(graph, materialSource, generation), createdAt = new Date().toISOString();
  const payload = payloadSchema.parse({ schemaVersion: "0.1.0", kind: CONSTRUCTION_CHECKPOINT_TYPE,
    workspaceDocumentId: documentId, createdAt, project: await projectPromise });
  return ConstructionCheckpointSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}
export async function readConstructionCheckpoint(input: unknown) {
  const record = ConstructionCheckpointSchema.parse(input), { contentHash, ...payload } = record;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Construction checkpoint content does not match its saved hash.");
  const restored = await readBayConstructionProject(record.project);
  if (restored.project.awningFabric) throw new Error("This checkpoint contains supplemental awning fabric that the editor cannot yet retain.");
  return { record, project: restored.project, materials: { ...restored.materials, file: restored.project.materialSource } };
}
export interface ConstructionCheckpointPersistence {
  put(input: unknown): Promise<void>;
  get(workspaceDocumentId: string): Promise<ParsedConstructionCheckpoint | undefined>;
}
let defaultNative: IndexedDbArtifactPersistence | undefined;
export function createConstructionCheckpointPersistence(options: {
  persistence?: Pick<IndexedDbArtifactPersistence, "put" | "get">; indexedDb?: IDBFactory;
} = {}): ConstructionCheckpointPersistence {
  // One native connection per page; document writer lifetimes do not allocate more databases.
  const native = options.persistence ?? (options.indexedDb ? createIndexedDbArtifactPersistence({
    databaseName: CONSTRUCTION_CHECKPOINT_DATABASE, storeName: CONSTRUCTION_CHECKPOINT_STORE, indexedDb: options.indexedDb
  }) : defaultNative ??= createIndexedDbArtifactPersistence({ databaseName: CONSTRUCTION_CHECKPOINT_DATABASE, storeName: CONSTRUCTION_CHECKPOINT_STORE }));
  return {
    async put(input) {
      const { record } = await readConstructionCheckpoint(input);
      const entry: CachedArtifactEntry<ConstructionCheckpoint> = { schemaVersion: "0.1.0", artifactType: CONSTRUCTION_CHECKPOINT_TYPE,
        requestHash: record.workspaceDocumentId, contentHash: record.contentHash, createdAt: record.createdAt,
        dependencies: [record.project.contentHash], artifact: record };
      await native.put(entry);
    },
    async get(inputDocumentId) {
      const documentId = documentIdSchema.parse(inputDocumentId), stored = await native.get(CONSTRUCTION_CHECKPOINT_TYPE, documentId, "0.1.0");
      if (stored === undefined) return undefined;
      const entry = jsonBoundary().pipe(CachedArtifactEntrySchema.strict()).parse(stored);
      const parsed = await readConstructionCheckpoint(entry.artifact), record = parsed.record;
      if (entry.artifactType !== CONSTRUCTION_CHECKPOINT_TYPE || entry.schemaVersion !== "0.1.0" || entry.requestHash !== documentId ||
          record.workspaceDocumentId !== documentId || entry.contentHash !== record.contentHash || entry.createdAt !== record.createdAt ||
          canonicalJson(entry.dependencies) !== canonicalJson([record.project.contentHash])) throw new Error("Construction checkpoint storage identity does not match its source.");
      return parsed;
    }
  };
}
