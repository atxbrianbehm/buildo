import { z } from "zod";
import { BayConstructionGraphSchema } from "./bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const ConstructionSignAwningBuildingStudyRequestSchema = json.pipe(z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-sign-awning-building-study-request"), graph: BayConstructionGraphSchema,
  bayIndex: z.number().int().min(0).max(19), heightM: z.number().finite().min(0.16).max(0.8),
  projectionM: z.number().finite().min(0.04).max(0.3), frameWidthM: z.number().finite().min(0.02).max(0.12),
  gapM: z.number().finite().min(0.03).max(0.15)
}).strict());
export type ConstructionSignAwningBuildingStudyRequest = z.infer<typeof ConstructionSignAwningBuildingStudyRequestSchema>;
