import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionSignAwningArrangementPlanSchema } from "./constructionSignAwningArrangement";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-sign-awning-support-request"),
  arrangement: ConstructionSignAwningArrangementPlanSchema,
  anchorRiseM: z.number().finite().min(0.15).max(0.6), thicknessM: z.number().finite().min(0.015).max(0.06) }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-sign-awning-support-plan"), source: request,
  awningShiftYM: z.number().finite().max(0), lowerEdgeYM: z.number().finite(), anchorTopYM: z.number().finite(), anchorBottomYM: z.number().finite() }).strict();
export const ConstructionSignAwningSupportRequestSchema = json.pipe(request);
export const ConstructionSignAwningSupportPlanSchema = json.pipe(plan);
export type ConstructionSignAwningSupportPlan = z.infer<typeof ConstructionSignAwningSupportPlanSchema>;
