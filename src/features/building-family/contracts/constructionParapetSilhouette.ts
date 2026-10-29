import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const finite = z.number().finite();
const json = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const request = z.object({
  schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-parapet-silhouette-request"),
  treatment: z.enum(["flat", "raised-center"]),
  building: z.object({ widthM: finite.positive().max(100), depthM: finite.positive().max(100), heightM: finite.positive().max(100) }).strict(),
  parapet: z.object({ heightM: finite.min(0.2).max(1.2), copingProjectionM: finite.min(0.02).max(0.2) }).strict()
}).strict();
export const ConstructionParapetSilhouetteRequestSchema = json.pipe(request);
export type ConstructionParapetSilhouetteRequest = z.infer<typeof ConstructionParapetSilhouetteRequestSchema>;

const plan = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-parapet-silhouette-plan"),
  source: request,
  baseM: finite, lowTopM: finite, highTopM: finite,
  spans: z.array(z.object({ startM: finite, endM: finite, topM: finite }).strict()).min(1).max(3),
  copingPath: z.array(z.object({ alongM: finite, topM: finite }).strict()).min(2).max(6)
}).strict();
export const ConstructionParapetSilhouettePlanSchema = json.pipe(plan);
export type ConstructionParapetSilhouettePlan = z.infer<typeof ConstructionParapetSilhouettePlanSchema>;
