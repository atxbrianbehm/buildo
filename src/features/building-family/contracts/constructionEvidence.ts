import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const id = z.string().min(1);
const confidence = z.enum(["low", "medium", "high"]);
const span = z.object({ chunkId: id, start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
  .passthrough().refine(value => value.end >= value.start, "Invalid byte span.");
const provenance = z.object({ sourceInputIds: z.array(id), sourceChunkIds: z.array(id), spans: z.array(span),
  attributionMode: z.enum(["quoted", "paraphrased", "inferred", "web_retrieved"]),
  evidenceBasis: z.enum(["observed", "text_supported", "external_research", "proxy_analysis", "inferred", "generated"]),
  confidence, verification: z.enum(["unverified", "verified", "downgraded", "rejected"]),
  excerptText: z.string().optional(), reasoningNote: z.string().optional() }).passthrough();
const lifecycle = z.object({ artifact: z.literal("source-lifecycle"), schemaVersion: z.literal("0.1.0"), runId: id, inputId: id,
  createdAt: z.string().datetime(), sources: z.array(z.object({ sourceId: id, title: id,
    sourceFamily: z.enum(["commercial_print", "photography_collection", "newspaper", "institutional_collection", "other"]),
    rightsProfile: z.enum(["unknown", "public-domain", "unrestricted", "attribution-required", "non-commercial", "reference-only", "restricted"]),
    url: z.string().optional(), sourceSystem: z.string().optional(), sourceRecordId: z.string().optional(), publicationDate: z.string().optional(),
    rightsStatement: z.string().optional(), retrievedAt: z.string().datetime().optional(), approvedBy: id,
    approvedAt: z.string().datetime(), retracted: z.boolean(), retractionReason: z.string().optional() }).passthrough()),
  evidence: z.array(z.object({ evidenceId: id, sourceId: id, excerptText: id, locator: z.string().optional(), confidence, provenance }).passthrough()),
  claims: z.array(z.object({ claimId: id, text: id, evidenceIds: z.array(id).min(1), sourceIds: z.array(id).min(1), confidence,
    closesGapIds: z.array(z.string()).optional() }).passthrough()),
  citationReviews: z.array(z.object({ claimId: id, citationStatus: z.enum(["approved", "rejected", "needs_review"]),
    reviewTier: z.enum(["none", "automated_internal", "batch_contact_sheet", "individual_human"]), reviewerId: id,
    reviewedAt: z.string().datetime(), reviewerRole: z.string().optional(), rationale: z.string().optional() }).passthrough()),
  integrityFlags: z.array(z.object({ code: id, message: id, recordIds: z.array(id) }).passthrough()),
  gates: z.object({ rightsGate: z.enum(["pending", "pass", "fail"]) }).passthrough() }).passthrough();
const mapping = z.object({ mappingId: id, claimId: id, target: z.literal("upper-front-opening-head"),
  value: z.enum(["flat", "round"]), reviewerId: id, mappedAt: z.string().datetime(), rationale: id }).strict();
const source = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-request"),
  lifecycle, mappings: z.array(mapping) }).strict();
const choice = z.object({ mappingId: id, claimId: id, target: z.literal("upper-front-opening-head"),
  value: z.enum(["flat", "round"]), sourceIds: z.array(id), evidenceIds: z.array(id) }).strict();
export const ConstructionEvidenceRequestSchema = json.pipe(source);
export const ConstructionEvidenceSnapshotSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-evidence-snapshot"), source, sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  coverage: z.enum(["unknown", "mapped"]), choices: z.array(choice) }).strict());
export type ConstructionEvidenceSnapshot = z.infer<typeof ConstructionEvidenceSnapshotSchema>;
