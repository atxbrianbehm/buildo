import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionStorefrontPlanSchema } from "./constructionStorefront";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-request"),
  storefront: ConstructionStorefrontPlanSchema,
  projectionM: z.number().finite().min(0.4).max(2), dropM: z.number().finite().min(0.15).max(1.2),
  valanceHeightM: z.number().finite().min(0.08).max(0.4) }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-plan"), source: request,
  widthM: z.number().finite().positive(), centerAlongM: z.number().finite(), mountYM: z.number().finite(),
  frontYM: z.number().finite(), lowerEdgeYM: z.number().finite() }).strict();
export const ConstructionAwningRequestSchema = json.pipe(request);
export const ConstructionAwningPlanSchema = json.pipe(plan);
export type ConstructionAwningPlan = z.infer<typeof ConstructionAwningPlanSchema>;
