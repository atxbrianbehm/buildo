import { z } from "zod";
import { BayConstructionGraphSchema } from "./bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/);
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-request"),
  familyId: identifier, familySeed: z.string().min(1).max(128).refine(s => s.trim() === s), graph: BayConstructionGraphSchema }).strict();
export const ConstructionFamilyRequestSchema = json.pipe(request);
const member = z.object({ ordinal: z.number().int().min(1).max(6), documentId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/),
  buildingSeed: z.string().min(1).max(256), graph: BayConstructionGraphSchema }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-plan"), source: request,
  members: z.array(member).length(6) }).strict();
export const ConstructionFamilyPlanSchema = json.pipe(plan);
export type ConstructionFamilyPlan = z.infer<typeof ConstructionFamilyPlanSchema>;
