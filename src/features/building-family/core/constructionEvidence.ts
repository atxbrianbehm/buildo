import { ConstructionEvidenceRequestSchema, ConstructionEvidenceSnapshotSchema,
  type ConstructionEvidenceSnapshot } from "../contracts/constructionEvidence";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}.`);
}

/** Own and preserve upstream evidence and a separately attributed human mapping. */
export async function createConstructionEvidenceSnapshot(input: unknown): Promise<ConstructionEvidenceSnapshot> {
  const source = structuredClone(ConstructionEvidenceRequestSchema.parse(input));
  const l = source.lifecycle;
  unique(l.sources.map(x => x.sourceId), "source ID");
  unique(l.evidence.map(x => x.evidenceId), "evidence ID");
  unique(l.claims.map(x => x.claimId), "claim ID");
  unique(l.citationReviews.map(x => x.claimId), "claim review");
  unique(source.mappings.map(x => x.mappingId), "mapping ID");
  unique(source.mappings.map(x => x.target), "mapped target; resolve conflicting mappings explicitly");
  const choices = source.mappings.map(mapping => {
    if (l.gates.rightsGate !== "pass" || l.integrityFlags.length) throw new Error("Source lifecycle gate or integrity flags prevent admission.");
    const claim = l.claims.find(x => x.claimId === mapping.claimId);
    if (!claim) throw new Error(`Missing claim ${mapping.claimId}.`);
    unique(claim.sourceIds, "claim source ID");
    unique(claim.evidenceIds, "claim evidence ID");
    const review = l.citationReviews.find(x => x.claimId === claim.claimId);
    if (!review || review.citationStatus !== "approved" || review.reviewTier !== "individual_human")
      throw new Error(`Claim ${claim.claimId} lacks an approved individual human citation review.`);
    const sources = claim.sourceIds.map(id => l.sources.find(x => x.sourceId === id));
    if (sources.some(x => !x || x.retracted)) throw new Error(`Claim ${claim.claimId} has missing or retracted sources.`);
    const evidence = claim.evidenceIds.map(id => l.evidence.find(x => x.evidenceId === id));
    if (evidence.some(x => !x || !claim.sourceIds.includes(x.sourceId))) throw new Error(`Claim ${claim.claimId} has missing or unrelated evidence.`);
    if (claim.sourceIds.some(id => !evidence.some(x => x?.sourceId === id))) throw new Error(`Claim ${claim.claimId} has an unsupported source.`);
    for (const item of evidence) {
      if (!item) throw new Error("Missing evidence.");
      if (item.provenance.verification !== "verified" || !["observed", "text_supported", "external_research"].includes(item.provenance.evidenceBasis))
        throw new Error(`Evidence ${item.evidenceId} is not verified source-based evidence.`);
      if (!item.locator?.trim() && item.provenance.spans.length === 0) throw new Error(`Evidence ${item.evidenceId} lacks a locator or span.`);
    }
    return { mappingId: mapping.mappingId, claimId: claim.claimId, target: mapping.target, value: mapping.value,
      sourceIds: [...claim.sourceIds], evidenceIds: [...claim.evidenceIds] };
  });
  return ConstructionEvidenceSnapshotSchema.parse({ schemaVersion: "0.1.0", kind: "construction-evidence-snapshot",
    source, sourceHash: await hashCanonicalJson(source), coverage: choices.length ? "mapped" : "unknown", choices });
}

/** Hash and recompute; a valid-looking edited result is not a valid replay. */
export async function readConstructionEvidenceSnapshot(input: unknown): Promise<ConstructionEvidenceSnapshot> {
  const snapshot = structuredClone(ConstructionEvidenceSnapshotSchema.parse(input));
  const expected = await createConstructionEvidenceSnapshot(snapshot.source);
  if (canonicalJson(snapshot) !== canonicalJson(expected)) throw new Error("Evidence snapshot does not match its source.");
  return expected;
}
