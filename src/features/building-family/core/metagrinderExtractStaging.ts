import { MetagrinderExtractStagingRequestSchema, MetagrinderExtractStagingSchema } from "../contracts/metagrinderExtractStaging";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";

/** Stage exact upstream JSON and a deliberately unreviewed architecture-only index. */
export async function stageMetagrinderExtract(input: unknown) {
  const owned = structuredClone(MetagrinderExtractStagingRequestSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Extract staging admission would change serialized fields.");
  const claims = owned.artifact.claims ?? [];
  if (new Set(claims.map(claim => claim.claimId)).size !== claims.length) throw new Error("Extract claim IDs must be unique.");
  const candidates = claims.filter(claim => claim.category === "architecture-and-streetscape").map(claim => ({ claimId: claim.claimId, text: claim.text,
    sourceInputIds: claim.sourceInputIds, sourceChunkIds: claim.sourceChunkIds, attributionMode: claim.attributionMode, confidence: claim.confidence, review: "unreviewed" as const }));
  const payload = { schemaVersion: "0.1.0" as const, kind: "metagrinder-extract-staging" as const, declaredProducerRevision: owned.declaredProducerRevision,
    artifact: owned.artifact, architectureCoverage: "unknown" as const, candidates };
  return MetagrinderExtractStagingSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Recheck both the hash and the index; a recomputed hash cannot promote or rewrite a candidate. */
export async function readMetagrinderExtractStaging(input: unknown) {
  const owned = structuredClone(MetagrinderExtractStagingSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Extract staging admission would change serialized fields.");
  const { contentHash, ...payload } = owned;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Extract staging content does not match its saved hash.");
  const replay = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: owned.declaredProducerRevision, artifact: owned.artifact });
  if (canonicalJson(replay) !== canonicalJson(owned)) throw new Error("Extract staging candidates do not match the retained source.");
  return owned;
}
