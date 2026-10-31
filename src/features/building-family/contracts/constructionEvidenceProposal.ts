import { z } from "zod";
import { BayConstructionGraphSchema } from "./bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { MetagrinderExtractStagingSchema } from "./metagrinderExtractStaging";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const choice = z.object({ target: z.literal("upper-front-opening-head"), value: z.enum(["flat", "round"]) }).strict();
export const ConstructionEvidenceProposalRequestSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-proposal-request"),
  staged: MetagrinderExtractStagingSchema, graph: BayConstructionGraphSchema, claimId: z.string().min(1), choice }).strict());
export const ConstructionEvidenceProposalSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-proposal"),
  staged: MetagrinderExtractStagingSchema, claimId: z.string().min(1), targetDocumentId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/),
  sourceGraphHash: z.string().regex(/^[a-f0-9]{64}$/), choice, status: z.literal("proposed"), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
