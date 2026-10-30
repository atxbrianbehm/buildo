import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionStorefrontPlanSchema } from "./constructionStorefront";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-storefront-sign-request"),
  storefront: ConstructionStorefrontPlanSchema, heightM: z.number().finite().min(0.16).max(0.8),
  projectionM: z.number().finite().min(0.04).max(0.3), frameWidthM: z.number().finite().min(0.02).max(0.12),
  awningPresent: z.boolean() }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-storefront-sign-plan"), source: request,
  centerAlongM: z.number().finite(), bottomM: z.number().finite(), widthM: z.number().finite().positive() }).strict();
export const ConstructionStorefrontSignRequestSchema = json.pipe(request);
export const ConstructionStorefrontSignPlanSchema = json.pipe(plan);
export type ConstructionStorefrontSignPlan = z.infer<typeof ConstructionStorefrontSignPlanSchema>;
