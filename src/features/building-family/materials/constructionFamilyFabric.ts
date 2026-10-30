import { ConstructionFamilyFabricAssignmentsSchema, ConstructionFamilyFabricPayloadSchema, type ConstructionFamilyFabricAssignments } from "../contracts/constructionFamilyFabric";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { readConstructionAwningFabric } from "./constructionAwningFabric";

async function validate(payload: ReturnType<typeof ConstructionFamilyFabricPayloadSchema.parse>) {
  await readConstructionAwningFabric(payload.inheritedFabric);
  for (const member of payload.members) if (member.mode === "override") await readConstructionAwningFabric(member.fabric);
}
/** Capture the family assignment and its material sources before any asynchronous work. */
export async function createConstructionFamilyFabricAssignments(input: unknown): Promise<ConstructionFamilyFabricAssignments> {
  const owned = structuredClone(ConstructionFamilyFabricPayloadSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family fabric admission would change serialized fields.");
  await validate(owned);
  return ConstructionFamilyFabricAssignmentsSchema.parse({ ...owned, contentHash: await hashCanonicalJson(owned) });
}
export async function readConstructionFamilyFabricAssignments(input: unknown): Promise<ConstructionFamilyFabricAssignments> {
  const owned = structuredClone(ConstructionFamilyFabricAssignmentsSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family fabric admission would change serialized fields.");
  const { contentHash, ...payload } = owned;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Family fabric assignments do not match their saved hash.");
  await validate(payload);
  return owned;
}
/** Resolve only an explicitly named member; unknown identity is an error. */
export async function resolveConstructionFamilyMemberFabric(input: unknown, documentId: string) {
  const assignments = await readConstructionFamilyFabricAssignments(input);
  const member = assignments.members.find(value => value.documentId === documentId);
  if (!member) throw new Error("The requested building has no family fabric assignment.");
  return member.mode === "override" ? member.fabric : assignments.inheritedFabric;
}

/** Cross-check assignments against the owning family's identities and pinned inherited material. */
export async function validateConstructionFamilyFabricScope(input: unknown, scope: { familyId: string; sourceDocumentId: string; memberIds: string[]; inheritedFabricHash: string }) {
  const assignments = await readConstructionFamilyFabricAssignments(input);
  const expected = [...scope.memberIds].sort(), actual = assignments.members.map(member => member.documentId).sort();
  if (assignments.familyId !== scope.familyId || assignments.sourceDocumentId !== scope.sourceDocumentId ||
      assignments.inheritedFabric.contentHash !== scope.inheritedFabricHash || expected.length !== 6 || new Set(expected).size !== 6 || canonicalJson(actual) !== canonicalJson(expected))
    throw new Error("Fabric assignments do not match their owning family and inherited source.");
  return assignments;
}
