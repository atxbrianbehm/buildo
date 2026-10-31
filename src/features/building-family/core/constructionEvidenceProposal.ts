import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { ConstructionEvidenceProposalRequestSchema, ConstructionEvidenceProposalSchema } from "../contracts/constructionEvidenceProposal";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";
import { readMetagrinderExtractStaging } from "./metagrinderExtractStaging";

/** Record a caller-supplied interpretation, never an evidence review or automatic graph edit. */
export async function createConstructionEvidenceProposal(input: unknown) {
  const owned = structuredClone(ConstructionEvidenceProposalRequestSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Proposal admission would change serialized fields.");
  const staged = await readMetagrinderExtractStaging(owned.staged);
  if (!staged.candidates.some(candidate => candidate.claimId === owned.claimId)) throw new Error("Choose an architecture candidate from this staged extract.");
  const payload = { schemaVersion: "0.1.0" as const, kind: "construction-evidence-proposal" as const, staged, claimId: owned.claimId,
    targetDocumentId: owned.graph.documentId, sourceGraphHash: await hashCanonicalJson(owned.graph), choice: owned.choice, status: "proposed" as const };
  return ConstructionEvidenceProposalSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Admit a proposal only for the exact graph it was authored against. */
export async function readConstructionEvidenceProposal(input: unknown, graphInput: unknown) {
  if (findBuildingDocumentJsonIssue(graphInput)) throw new Error("The building graph must be plain JSON.");
  const owned = structuredClone(ConstructionEvidenceProposalSchema.parse(input)), graph = structuredClone(BayConstructionGraphSchema.parse(graphInput));
  if (canonicalJson(owned) !== canonicalJson(input) || canonicalJson(graph) !== canonicalJson(graphInput)) throw new Error("Proposal admission would change serialized fields.");
  const { contentHash, ...payload } = owned;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Proposal content does not match its saved hash.");
  const staged = await readMetagrinderExtractStaging(owned.staged);
  if (!staged.candidates.some(candidate => candidate.claimId === owned.claimId)) throw new Error("The selected architecture candidate is missing.");
  if (owned.targetDocumentId !== graph.documentId || owned.sourceGraphHash !== await hashCanonicalJson(graph)) throw new Error("The proposal belongs to a different or changed building graph.");
  return owned;
}
