import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { constructionUsesOperator, validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";
import { BuildingSourceFileSchema, parseBuildingSourceFile } from "./buildingSourceFile";
import { ConstructionGenerationLineageSchema } from "./constructionGenerationState";
import { validateGeneration } from "./bayConstructionProject";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const payload = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-source"),
  familyId: id, sourceDocumentId: id, familySeed: z.string().min(1).max(128).refine(value => value.trim() === value),
  materialSource: BuildingSourceFileSchema,
  members: z.array(z.object({ documentId: id, graph: BayConstructionGraphSchema, generation: ConstructionGenerationLineageSchema }).strict()).length(6)
}).strict();
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const ConstructionFamilySourceSchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
export type ConstructionFamilySource = z.infer<typeof ConstructionFamilySourceSchema>;

async function validate(source: z.infer<typeof payload>) {
  const ids = new Set(source.members.map(member => member.documentId));
  if (ids.size !== 6 || ids.has(source.sourceDocumentId)) throw new Error("Family member identities must be unique and separate from the source building.");
  const seeds = new Set(source.members.map(member => member.generation.source.intent.seeds.building));
  if (seeds.size !== 6) throw new Error("Family members must retain distinct building seeds.");
  const reference = source.members[0].generation.source.referenceContentHash;
  const materialInputs = source.members[0].generation.materialPlan.materialInputsHash;
  const materials = await parseBuildingSourceFile(source.materialSource);
  for (const member of source.members) {
    if (member.documentId !== member.graph.documentId) throw new Error("Family member identity does not match its graph.");
    if (!["0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0"].includes(member.graph.schemaVersion))
      throw new Error("Family members must use a whole-building graph version that supports generation lineage.");
    if (!constructionUsesOperator(member.graph, "Footprint") || !constructionUsesOperator(member.graph, "Storeys") || !constructionUsesOperator(member.graph, "EmitWall"))
      throw new Error("Family members must retain a connected whole-building graph.");
    if (member.generation.source.referenceContentHash !== reference || member.generation.materialPlan.materialInputsHash !== materialInputs)
      throw new Error("Family members must share pinned reference and material inputs.");
    validateConstructionSurfaceSources(member.graph, materials.packedAtlas);
    await validateGeneration({ graph: member.graph, materialSource: source.materialSource, generation: member.generation }, materials.packedAtlas.manifest);
  }
}

/** Capture the source before the first asynchronous validation. */
export async function createConstructionFamilySource(input: unknown): Promise<ConstructionFamilySource> {
  const owned = structuredClone(json.pipe(payload).parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family source admission would change serialized fields.");
  await validate(owned);
  return ConstructionFamilySourceSchema.parse({ ...owned, contentHash: await hashCanonicalJson(owned) });
}

/** Recheck the full source, including material bytes and each member lineage. */
export async function readConstructionFamilySource(input: unknown): Promise<ConstructionFamilySource> {
  const owned = structuredClone(ConstructionFamilySourceSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family source admission would change serialized fields.");
  const { contentHash, ...source } = owned;
  if (await hashCanonicalJson(source) !== contentHash) throw new Error("Family source content does not match its saved hash.");
  await validate(source);
  return owned;
}
