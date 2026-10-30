import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionStorefrontPlanSchema } from "./constructionStorefront";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const rect = z.object({ leftM: z.number().finite(), bottomM: z.number().finite(), widthM: z.number().finite().positive(), heightM: z.number().finite().positive() }).strict();
const division = z.object({ panes: z.array(rect).min(1).max(3), mullions: z.array(rect).max(2) }).strict();
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-storefront-division-request"),
  storefront: ConstructionStorefrontPlanSchema, displayLights: z.union([z.literal(1), z.literal(2)]),
  transomLights: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict();
export const ConstructionStorefrontDivisionRequestSchema = json.pipe(request);
export const ConstructionStorefrontDivisionPlanSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-storefront-division-plan"), source: request, transom: division, display: division.nullable() }).strict());
export type ConstructionStorefrontDivisionPlan = z.infer<typeof ConstructionStorefrontDivisionPlanSchema>;
