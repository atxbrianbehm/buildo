import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionStorefrontPlanSchema } from "./constructionStorefront";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-sign-awning-arrangement-request"),
  storefront: ConstructionStorefrontPlanSchema,
  sign: z.object({ heightM: z.number().finite().min(0.16).max(0.8), projectionM: z.number().finite().min(0.04).max(0.3), frameWidthM: z.number().finite().min(0.02).max(0.12) }).strict(),
  awning: z.object({ projectionM: z.number().finite().min(0.4).max(2), dropM: z.number().finite().min(0.15).max(1.2), valanceHeightM: z.number().finite().min(0.08).max(0.4) }).strict(),
  gapM: z.number().finite().min(0.03).max(0.15) }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-sign-awning-arrangement-plan"), source: request,
  signBottomM: z.number().finite(), awningShiftYM: z.number().finite().max(0), lowerEdgeYM: z.number().finite() }).strict();
export const ConstructionSignAwningArrangementRequestSchema = json.pipe(request);
export const ConstructionSignAwningArrangementPlanSchema = json.pipe(plan);
export type ConstructionSignAwningArrangementPlan = z.infer<typeof ConstructionSignAwningArrangementPlanSchema>;
