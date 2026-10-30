import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-bay-request"),
  scope: z.object({ id: z.string().min(1), face: z.literal("front"), floorIndex: z.number().int().min(1),
    bayIndex: z.number().int().nonnegative(), originM: point, sizeM: point }).strict(),
  parameters: z.object({ memberCount: z.union([z.literal(2), z.literal(3)]), memberWidthM: z.number().finite().positive(),
    heightM: z.number().finite().positive(), sillM: z.number().finite().nonnegative(), pierWidthM: z.number().finite().min(0.08),
    frameWidthM: z.number().finite().positive(), recessM: z.number().finite().nonnegative() }).strict() }).strict();
const member = z.object({ id: z.string().min(1), index: z.number().int().nonnegative(), centerAlongM: z.number().finite(),
  centerYM: z.number().finite(), widthM: z.number().finite().positive(), heightM: z.number().finite().positive() }).strict();
export const ConstructionGroupedBayRequestSchema = json.pipe(request);
export const ConstructionGroupedBayPlanSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-grouped-bay-plan"), source: request, members: z.array(member).min(2).max(3) }).strict());
export type ConstructionGroupedBayPlan = z.infer<typeof ConstructionGroupedBayPlanSchema>;
