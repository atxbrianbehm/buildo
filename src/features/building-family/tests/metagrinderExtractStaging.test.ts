import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { readMetagrinderExtractStaging, stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { hashCanonicalJson } from "../core/contentHash";

const claim = { claimId: "claim-1", text: "Synthetic example: a shop has a canopy.", category: "architecture-and-streetscape",
  confidence: "medium", sourceInputIds: ["source-1", "source-2"], sourceChunkIds: ["chunk-1", "chunk-2"], attributionMode: "inferred", claimType: "observation", futureField: { preserved: true } };
const request = () => ({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
  artifact: { inputId: "synthetic-input", claims: [claim, { ...claim, claimId: "claim-2", category: "wardrobe" }], evidence: [{ evidenceId: "synthetic", text: "Not a historical source." }], unknownFutureField: [1, 2] } });

it("retains the complete extract while indexing architecture claims without upgrading their status", async () => {
  const input = structuredClone(request()), expected = structuredClone(input), pending = stageMetagrinderExtract(input);
  input.artifact.claims[0].sourceInputIds.push("late-mutation");
  const staged = await pending;
  expect(staged.artifact).toEqual(expected.artifact); expect(staged.architectureCoverage).toBe("unknown");
  expect(staged.candidates).toEqual([{ claimId: "claim-1", text: claim.text, sourceInputIds: ["source-1", "source-2"], sourceChunkIds: ["chunk-1", "chunk-2"], attributionMode: "inferred", confidence: "medium", review: "unreviewed" }]);
  expect(await readMetagrinderExtractStaging(JSON.parse(JSON.stringify(staged)))).toEqual(staged);
  const untouched = await stageMetagrinderExtract({ ...request(), artifact: { inputId: "empty" } });
  expect(untouched.artifact).toEqual({ inputId: "empty" }); expect(untouched.candidates).toEqual([]); expect(untouched.architectureCoverage).toBe("unknown");
});

it("rejects tampering, promotion, ambiguous IDs, unsupported revisions and non-JSON inputs", async () => {
  const staged = await stageMetagrinderExtract(request());
  const edited = structuredClone(staged); edited.candidates[0].text = "rewritten";
  const { contentHash: _hash, ...body } = edited; void _hash; edited.contentHash = await hashCanonicalJson(body);
  await expect(readMetagrinderExtractStaging(edited)).rejects.toThrow(/do not match/);
  const promoted = structuredClone(staged) as unknown as { candidates: Array<{ review: string }> }; promoted.candidates[0].review = "reviewed";
  await expect(readMetagrinderExtractStaging(promoted)).rejects.toThrow();
  await expect(stageMetagrinderExtract({ ...request(), declaredProducerRevision: "unknown" })).rejects.toThrow();
  await expect(stageMetagrinderExtract({ ...request(), artifact: { ...request().artifact, claims: [claim, claim] } })).rejects.toThrow(/unique/);
  await expect(stageMetagrinderExtract({ ...request(), artifact: { ...request().artifact, claims: [{ ...claim, sourceChunkIds: [] }] } })).rejects.toThrow();
  await expect(stageMetagrinderExtract({ ...request(), artifact: { ...request().artifact, invalid: NaN } })).rejects.toThrow();
});
