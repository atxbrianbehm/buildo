import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const common = { kind: z.literal("construction-retained-sign-family-study"), familyId: z.string().min(1), sourceGraphHash: hash,
  materialSourceHash: hash, referenceContentHash: hash, members: z.array(z.object({ documentId: z.string().min(1),
    sourceContentHash: hash, geometryHash: hash }).strict()).length(6) };
const v1 = z.object({ schemaVersion: z.literal("0.1.0"), ...common }).strict();
const v2 = z.object({ schemaVersion: z.literal("0.2.0"), ...common, familySeed: z.string().min(1).max(128), compositionHash: hash }).strict();
const v3 = z.object({ schemaVersion: z.literal("0.3.0"), ...common, familySeed: z.string().min(1).max(128), compositionHash: hash, pierVariationHash: hash }).strict();
export const ConstructionRetainedSignFamilyStudyReceiptSchema = json.pipe(z.discriminatedUnion("schemaVersion", [v1, v2, v3]).superRefine((receipt, context) => {
  if (new Set(receipt.members.map(member => member.documentId)).size !== 6 || new Set(receipt.members.map(member => member.geometryHash)).size !== 6)
    context.addIssue({ code: "custom", path: ["members"], message: "Family members and their final geometries must be distinct." });
}));
