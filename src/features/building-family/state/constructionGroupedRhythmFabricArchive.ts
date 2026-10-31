import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { ConstructionFamilyFabricAssignmentsSchema } from "../contracts/constructionFamilyFabric";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { validateConstructionFamilyFabricScope } from "../materials/constructionFamilyFabric";
import { GroupedRhythmFamilyArchiveSchema, readGroupedRhythmFamilyArchive } from "./constructionGroupedRhythmFamilyArchive";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const payload = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-rhythm-fabric-archive"),
  family: GroupedRhythmFamilyArchiveSchema, fabricAssignments: ConstructionFamilyFabricAssignmentsSchema }).strict();
export const GroupedRhythmFabricArchiveSchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());

async function validate(value: z.infer<typeof payload>) {
  const family = await readGroupedRhythmFamilyArchive(value.family), fabric = family.request.sourceProject.awningFabric;
  if (!fabric) throw new Error("The family must contain its inherited awning fabric.");
  await validateConstructionFamilyFabricScope(value.fabricAssignments, { familyId: family.request.plan.source.familyId,
    sourceDocumentId: family.request.sourceProject.graph.documentId, memberIds: family.result.members.map(member => member.graph.documentId), inheritedFabricHash: fabric.contentHash });
}

/** Portable experimental wrapper; the existing family archive remains unchanged. */
export async function createGroupedRhythmFabricArchive(input: unknown) {
  const owned = structuredClone(json.pipe(payload).parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Fabric archive admission would change serialized fields.");
  await validate(owned);
  return GroupedRhythmFabricArchiveSchema.parse({ ...owned, contentHash: await hashCanonicalJson(owned) });
}

export async function readGroupedRhythmFabricArchive(input: unknown) {
  const owned = structuredClone(GroupedRhythmFabricArchiveSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Fabric archive admission would change serialized fields.");
  const { contentHash, ...body } = owned;
  if (await hashCanonicalJson(body) !== contentHash) throw new Error("Fabric archive content does not match its saved hash.");
  await validate(body);
  return owned;
}
