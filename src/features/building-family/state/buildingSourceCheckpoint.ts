import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { CachedArtifactEntrySchema, type CachedArtifactEntry } from "../materials/artifactCache";
import {
  createIndexedDbArtifactPersistence,
  type IndexedDbArtifactPersistence
} from "../materials/indexedDbArtifactPersistence";
import { BuildingSourceFileSchema, parseBuildingSourceFile } from "./buildingSourceFile";
import { BuildingSurfaceSourceFileSchema, parseBuildingSurfaceSourceFile } from "./buildingSurfaceSourceFile";

export const BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE = "building-source-checkpoint";
export const BUILDING_SOURCE_CHECKPOINT_DATABASE_NAME = "buildo-building-source-checkpoints";
export const BUILDING_SOURCE_CHECKPOINT_STORE_NAME = "sourceCheckpoints";

type CheckpointErrorCode =
  | "building.sourceCheckpointInvalid"
  | "building.sourceCheckpointReadFailed"
  | "building.sourceCheckpointWriteFailed";

export class BuildingSourceCheckpointError extends Error {
  readonly code: CheckpointErrorCode;

  constructor(code: CheckpointErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BuildingSourceCheckpointError";
    this.code = code;
  }
}

const nonempty = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const common = {
  schemaVersion: z.literal("0.1.0"),
  documentId: nonempty,
  createdAt: nonempty
};
const sourceShape = z.object({
  ...common,
  kind: z.literal("source"),
  sourceFile: z.union([BuildingSourceFileSchema, BuildingSurfaceSourceFileSchema])
}).strict();
const unavailableShape = z.object({
  ...common,
  kind: z.literal("source-unavailable"),
  reason: z.literal("completed-family-import"),
  // Together with documentId, this identifies a completed publication. It is
  // not a digest or validation proof of the completed packet's typed buffers.
  completedFamilyRef: z.object({
    runId: nonempty,
    createdAt: nonempty,
    requestHash: nonempty,
    contentHash: nonempty
  }).strict()
}).strict();

function jsonBoundary() {
  return z.unknown().superRefine((value, context) => {
    const issue = findBuildingDocumentJsonIssue(value);
    if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });
}

const payloadSchema = jsonBoundary().pipe(z.discriminatedUnion("kind", [sourceShape, unavailableShape]));
/** Structural JSON shape; parseBuildingSourceCheckpoint also verifies all receipts. */
export const BuildingSourceCheckpointSchema = jsonBoundary().pipe(z.discriminatedUnion("kind", [
  sourceShape.extend({ contentHash: hash }).strict(),
  unavailableShape.extend({ contentHash: hash }).strict()
]));
export type BuildingSourceCheckpoint = z.infer<typeof BuildingSourceCheckpointSchema>;
type CheckpointPayload = z.infer<typeof payloadSchema>;

function invalid(cause: unknown): BuildingSourceCheckpointError {
  if (cause instanceof BuildingSourceCheckpointError && cause.code === "building.sourceCheckpointInvalid") return cause;
  return new BuildingSourceCheckpointError(
    "building.sourceCheckpointInvalid", "Invalid building source checkpoint. The retained record is unchanged.", cause
  );
}

function capture<T>(schema: z.ZodType<T>, input: unknown): T {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) throw invalid(issue);
  // Validate descriptors first: canonicalJson alone reads object properties.
  const owned: unknown = JSON.parse(canonicalJson(input));
  const parsed = schema.parse(owned);
  if (canonicalJson(parsed) !== canonicalJson(owned)) throw new Error("Checkpoint contains unsupported fields.");
  return parsed;
}

async function validateSource<T extends CheckpointPayload>(payload: T): Promise<T> {
  if (payload.kind === "source") {
    const file = payload.sourceFile;
    const baseFile = file.schemaVersion === "0.6.0" ? file.baseFile : file;
    if (baseFile.source.document.documentId !== payload.documentId) {
      throw new Error("Checkpoint document does not match its portable source file.");
    }
    const parsed = file.schemaVersion === "0.6.0"
      ? await parseBuildingSurfaceSourceFile(file) : await parseBuildingSourceFile(file);
    return { ...payload, sourceFile: parsed.file };
  }
  return payload;
}

/** Creates a portable record only; geometry compilation and recovery are separate. */
export async function createBuildingSourceCheckpoint(input: unknown): Promise<BuildingSourceCheckpoint> {
  try {
    const payload = capture(payloadSchema, input);
    const validated = await validateSource(payload);
    return { ...validated, contentHash: await hashCanonicalJson(validated) };
  } catch (cause) {
    throw invalid(cause);
  }
}

export async function parseBuildingSourceCheckpoint(input: unknown): Promise<BuildingSourceCheckpoint> {
  try {
    const record = capture(BuildingSourceCheckpointSchema, input);
    const { contentHash, ...payload } = record;
    if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Checkpoint content hash mismatch.");
    return await validateSource(record);
  } catch (cause) {
    throw invalid(cause);
  }
}

function dependenciesFor(record: BuildingSourceCheckpoint): string[] {
  if (record.kind === "source-unavailable") return [record.completedFamilyRef.contentHash];
  const saved = record.sourceFile;
  const file = saved.schemaVersion === "0.6.0" ? saved.baseFile : saved;
  return [
    saved.contentHash,
    ...(saved.schemaVersion === "0.6.0" ? [file.contentHash] : []),
    file.source.sourceContentHash,
    file.source.document.intentRef.contentHash,
    file.source.document.stylePackRef.contentHash,
    file.materials.atlas.contentHash,
    file.materials.debugMetadata.exportHash
  ];
}

export interface BuildingSourceCheckpointPersistence {
  put(record: unknown): Promise<void>;
  get(documentId: string): Promise<BuildingSourceCheckpoint | undefined>;
}

export interface BuildingSourceCheckpointPersistenceOptions {
  persistence?: Pick<IndexedDbArtifactPersistence, "get" | "put">;
  indexedDb?: IDBFactory;
}

/** Single-writer storage only: no publication queue, cross-tab lock or CAS. */
export function createBuildingSourceCheckpointPersistence(
  options: BuildingSourceCheckpointPersistenceOptions = {}
): BuildingSourceCheckpointPersistence {
  const persistence = options.persistence ?? createIndexedDbArtifactPersistence({
    databaseName: BUILDING_SOURCE_CHECKPOINT_DATABASE_NAME,
    storeName: BUILDING_SOURCE_CHECKPOINT_STORE_NAME,
    indexedDb: options.indexedDb
  });

  return {
    async put(input) {
      // The parser owns the complete record synchronously before its first await.
      const record = await parseBuildingSourceCheckpoint(input);
      const entry: CachedArtifactEntry<BuildingSourceCheckpoint> = {
        schemaVersion: "0.1.0",
        artifactType: BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE,
        requestHash: record.documentId,
        contentHash: record.contentHash,
        dependencies: dependenciesFor(record),
        createdAt: record.createdAt,
        artifact: record
      };
      try {
        await persistence.put(entry);
      } catch (cause) {
        throw new BuildingSourceCheckpointError(
          "building.sourceCheckpointWriteFailed", "Building source checkpoint could not be stored. The prior record is retained.", cause
        );
      }
    },
    async get(inputDocumentId) {
      let documentId: string;
      try {
        documentId = capture(nonempty, inputDocumentId);
      } catch (cause) {
        throw invalid(cause);
      }
      let stored: CachedArtifactEntry<unknown> | undefined;
      try {
        stored = await persistence.get<unknown>(BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE, documentId, "0.1.0");
      } catch (cause) {
        throw new BuildingSourceCheckpointError(
          "building.sourceCheckpointReadFailed", "Building source checkpoint could not be read. The retained record is unchanged.", cause
        );
      }
      if (stored === undefined) return undefined;
      try {
        const entry = capture(CachedArtifactEntrySchema.strict(), stored);
        if (entry.schemaVersion !== "0.1.0" || entry.artifactType !== BUILDING_SOURCE_CHECKPOINT_ARTIFACT_TYPE ||
            entry.requestHash !== documentId) throw new Error("Checkpoint storage identity mismatch.");
        const record = await parseBuildingSourceCheckpoint(entry.artifact);
        if (record.documentId !== documentId || entry.contentHash !== record.contentHash || entry.createdAt !== record.createdAt ||
            canonicalJson(entry.dependencies) !== canonicalJson(dependenciesFor(record))) {
          throw new Error("Checkpoint storage metadata does not match its record.");
        }
        return record;
      } catch (cause) {
        throw invalid(cause);
      }
    }
  };
}
