import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionAwningFabricArtifactSchema } from "./constructionAwningFabric";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const assignment = z.discriminatedUnion("mode", [
  z.object({ documentId: id, mode: z.literal("inherit") }).strict(),
  z.object({ documentId: id, mode: z.literal("override"), fabric: ConstructionAwningFabricArtifactSchema }).strict()
]);
const fields = { schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-fabric-assignments"),
  familyId: id, sourceDocumentId: id, inheritedFabric: ConstructionAwningFabricArtifactSchema, members: z.array(assignment).length(6) };
const identity = (value: { sourceDocumentId: string; members: Array<{ documentId: string }> }, context: z.RefinementCtx) => {
  const ids = value.members.map(member => member.documentId);
  if (new Set(ids).size !== 6 || ids.includes(value.sourceDocumentId)) context.addIssue({ code: "custom", message: "Fabric assignments require six unique member identities separate from the source." });
};
export const ConstructionFamilyFabricPayloadSchema = json.pipe(z.object(fields).strict().superRefine(identity));
export const ConstructionFamilyFabricAssignmentsSchema = json.pipe(z.object({ ...fields, contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().superRefine(identity));
export type ConstructionFamilyFabricPayload = z.infer<typeof ConstructionFamilyFabricPayloadSchema>;
export type ConstructionFamilyFabricAssignments = z.infer<typeof ConstructionFamilyFabricAssignmentsSchema>;
