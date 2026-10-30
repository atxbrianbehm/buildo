import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-pier-variation-request"),
  familySeed: z.string().min(1).max(128).refine(value => value.trim() === value), enabled: z.boolean(), openingLock: z.boolean() }).strict();
const choice = z.object({ ordinal: z.number().int().min(1).max(6), treatment: z.enum(["none", "slender", "projecting"]).nullable() }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-pier-variation-plan"),
  catalog: z.literal("demo-front-piers-v1"), source: request, members: z.array(choice).length(6) }).strict();
export const ConstructionFamilyPierVariationRequestSchema = json.pipe(request);
export const ConstructionFamilyPierVariationPlanSchema = json.pipe(plan);
export type ConstructionFamilyPierVariationPlan = z.infer<typeof ConstructionFamilyPierVariationPlanSchema>;
