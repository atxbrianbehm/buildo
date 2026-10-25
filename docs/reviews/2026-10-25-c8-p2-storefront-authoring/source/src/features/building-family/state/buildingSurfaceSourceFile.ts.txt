import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { BuildingSurfaceCompositionSchema, type BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { BuildingSourceFileSchema, parseBuildingSourceFile } from "./buildingSourceFile";

export class BuildingSurfaceSourceError extends Error {
  readonly name = "BuildingSurfaceSourceError";
  constructor(readonly code: "surfaceSource.invalidInput" | "surfaceSource.invalidFile" |
    "surfaceSource.documentMismatch" | "surfaceSource.sourcePinMismatch" | "surfaceSource.unsupportedOperation", message: string) {
    super(message);
  }
}
function fail(code: BuildingSurfaceSourceError["code"], message: string): never {
  throw new BuildingSurfaceSourceError(code, message);
}
function ownJson(value: unknown): unknown {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) fail("surfaceSource.invalidInput", issue.path.join(".") + ": " + issue.message);
  return JSON.parse(canonicalJson(value)) as unknown;
}
const jsonBoundary = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const envelope = z.object({
  schemaVersion: z.literal("0.6.0"),
  model: z.literal("building-surface-source-v6"),
  baseFile: BuildingSourceFileSchema,
  composition: BuildingSurfaceCompositionSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
export const BuildingSurfaceSourceFileSchema = jsonBoundary.pipe(envelope);
export type BuildingSurfaceSourceFile = z.infer<typeof BuildingSurfaceSourceFileSchema>;

function freezeJson<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
function checkComposition(file: BuildingSurfaceSourceFile): void {
  const source = file.baseFile.source.document, composition = file.composition;
  if (source.documentId !== composition.documentId || source.revision !== composition.revision)
    fail("surfaceSource.documentMismatch", "Surface and structural source must name the same document and revision.");
  const atlas = file.baseFile.materials.atlas;
  const slots = new Map(atlas.manifest.slots.map(slot => [slot.id, slot]));
  for (const reference of composition.sources)
    if (reference.atlasContentHash !== atlas.contentHash || !slots.has(reference.slotId))
      fail("surfaceSource.sourcePinMismatch", "Pinned surface atlas source is unavailable: " + reference.id);
  for (const layer of composition.layers) {
    if (layer.blend === "multiply" && layer.channels.includes("normal"))
      fail("surfaceSource.unsupportedOperation", "Normal-map multiplication is not supported.");
    if (layer.target.kind === "slot" && !slots.has(layer.target.slotId))
      fail("surfaceSource.sourcePinMismatch", "The target atlas slot is unavailable.");
  }
}
function parseShape(value: unknown): BuildingSurfaceSourceFile {
  const result = BuildingSurfaceSourceFileSchema.safeParse(value);
  if (!result.success) fail("surfaceSource.invalidFile", "Surface source envelope is invalid.");
  // Every supported field must survive validation literally; no stripping or migration by accident.
  if (canonicalJson(result.data) !== canonicalJson(value))
    fail("surfaceSource.invalidFile", "Surface source contains unsupported data.");
  checkComposition(result.data);
  return result.data;
}
function payload(baseFile: BuildingSurfaceSourceFile["baseFile"], composition: BuildingSurfaceComposition) {
  return { schemaVersion: "0.6.0" as const, model: "building-surface-source-v6" as const, baseFile, composition };
}
export interface ParsedBuildingSurfaceSource {
  file: BuildingSurfaceSourceFile;
  sourceSnapshot: Awaited<ReturnType<typeof parseBuildingSourceFile>>["sourceSnapshot"];
  packedAtlas: Awaited<ReturnType<typeof parseBuildingSourceFile>>["packedAtlas"];
  debugExport: Awaited<ReturnType<typeof parseBuildingSourceFile>>["debugExport"];
  /** Legacy admission is explicit in this reader; old readers/files remain unchanged. */
  legacyInput: boolean;
}

/** Capture the complete JSON source before nested decoding or any hash await. */
export async function parseBuildingSurfaceSourceFile(input: unknown): Promise<ParsedBuildingSurfaceSource> {
  const owned = ownJson(input);
  const version = owned && typeof owned === "object" && !Array.isArray(owned)
    ? (owned as Record<string, unknown>).schemaVersion : undefined;
  if (version !== "0.6.0") {
    const base = await parseBuildingSourceFile(owned);
    const composition: BuildingSurfaceComposition = { schemaVersion: "0.1.0",
      documentId: base.sourceSnapshot.document.documentId, revision: base.sourceSnapshot.document.revision,
      sources: [], layers: [] };
    const contents = payload(base.file, composition);
    const file = parseShape({ ...contents, contentHash: await hashCanonicalJson(contents) });
    return { file: freezeJson(file), sourceSnapshot: base.sourceSnapshot, packedAtlas: base.packedAtlas,
      debugExport: base.debugExport, legacyInput: true };
  }
  const file = parseShape(owned), { contentHash, ...contents } = file;
  const base = await parseBuildingSourceFile(file.baseFile);
  if (await hashCanonicalJson(contents) !== contentHash)
    fail("surfaceSource.invalidFile", "Surface source content hash does not match its captured payload.");
  return { file: freezeJson(file), sourceSnapshot: base.sourceSnapshot, packedAtlas: base.packedAtlas,
    debugExport: base.debugExport, legacyInput: false };
}

/**
 * Wrap accepted structural/material JSON plus editable surface instructions.
 * Semantic target admission occurs against compiled IR in the restore adapter.
 */
export async function createBuildingSurfaceSourceFile(input: unknown): Promise<BuildingSurfaceSourceFile> {
  const shape = z.object({ baseFile: BuildingSourceFileSchema, composition: BuildingSurfaceCompositionSchema }).strict();
  const parsed = shape.safeParse(ownJson(input));
  if (!parsed.success) fail("surfaceSource.invalidInput", "Expected a base source file and surface composition.");
  const captured = parsed.data;
  // Validate identity/source pins before async nested source verification.
  parseShape({ ...payload(captured.baseFile, captured.composition), contentHash: "0".repeat(64) });
  const base = await parseBuildingSourceFile(captured.baseFile), contents = payload(base.file, captured.composition);
  const file = parseShape({ ...contents, contentHash: await hashCanonicalJson(contents) });
  return freezeJson(file);
}

