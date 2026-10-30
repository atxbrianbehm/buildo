import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionAwningPlanSchema } from "./constructionAwning";

const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-support-request"),
  awning: ConstructionAwningPlanSchema, anchorRiseM: z.number().finite().min(0.15).max(0.6), thicknessM: z.number().finite().min(0.015).max(0.06) }).strict();
const rod = z.object({ side: z.enum(["left", "right"]), wall: point, canopy: point }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-support-plan"), source: request,
  rods: z.tuple([rod, rod]) }).strict();
export const ConstructionAwningSupportRequestSchema = json.pipe(request);
export const ConstructionAwningSupportPlanSchema = json.pipe(plan);
export type ConstructionAwningSupportPlan = z.infer<typeof ConstructionAwningSupportPlanSchema>;
