import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { BayConstructionGraphSchema } from "./bayConstructionGraph";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const ConstructionFacadePierStudyRequestSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-facade-pier-study-request"), graph: BayConstructionGraphSchema,
  pierWidthM: z.number().finite().min(0.16).max(0.8), projectionM: z.number().finite().min(0.05).max(0.4),
  endHeightM: z.number().finite().min(0.08).max(0.3), clearanceM: z.number().finite().min(0.02).max(0.5) }).strict());
export type ConstructionFacadePierStudyRequest = z.infer<typeof ConstructionFacadePierStudyRequestSchema>;
