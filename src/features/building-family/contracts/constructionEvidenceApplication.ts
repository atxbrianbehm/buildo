import { z } from "zod";
import { BayConstructionGraphSchema } from "./bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionGenerationSourceSchema } from "./constructionGeneration";
import { ConstructionEvidenceProposalSchema } from "./constructionEvidenceProposal";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const fields = { proposal: ConstructionEvidenceProposalSchema, sourceGraph: BayConstructionGraphSchema,
  generationSource: ConstructionGenerationSourceSchema.nullable() };
export const ConstructionEvidenceApplicationRequestSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-evidence-application-request"), ...fields }).strict());
export const ConstructionEvidenceApplicationSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-evidence-application"), ...fields, resultGraph: BayConstructionGraphSchema,
  resultGraphHash: z.string().regex(/^[a-f0-9]{64}$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
