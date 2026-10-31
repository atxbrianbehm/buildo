import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionFamilyPierVariationPlanSchema } from "./constructionFamilyPierVariation";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const policyFields = { kind: z.literal("construction-grouped-rhythm-family-policy"), memberCount: z.union([z.literal(2), z.literal(3)]),
  memberWidthM: z.number().finite().positive(), pierWidthM: z.number().finite().gt(0.2) };
export const GroupedRhythmFamilyPolicySchema = json.pipe(z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: z.literal("0.1.0"), ...policyFields, scope: z.literal("all-upper-front") }).strict(),
  z.object({ schemaVersion: z.literal("0.2.0"), ...policyFields, scope: z.enum(["all-upper-front", "top-upper-front"]) }).strict(),
  z.object({ schemaVersion: z.literal("0.3.0"), ...policyFields, scope: z.enum(["all-upper-front", "top-upper-front"]), pierVariation: ConstructionFamilyPierVariationPlanSchema }).strict()
]));
export const GroupedRhythmFamilyReceiptSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-rhythm-family-receipt"),
  familyId: z.string().min(1), baseReceiptHash: hash, policyHash: hash, materialSourceHash: hash, referenceContentHash: hash,
  members: z.array(z.object({ documentId: z.string().min(1), applied: z.boolean(), graphHash: hash, geometryHash: hash }).strict()).length(6) }).strict().superRefine((receipt, context) => {
    if (!receipt.members.some(member => member.applied) || new Set(receipt.members.map(member => member.documentId)).size !== 6 || new Set(receipt.members.map(member => member.geometryHash)).size !== 6)
      context.addIssue({ code: "custom", path: ["members"], message: "Family members must have distinct final geometry and at least one applied rhythm." });
  }));
