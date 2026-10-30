import { describe, expect, it } from "vitest";
import { createConstructionEvidenceSnapshot, readConstructionEvidenceSnapshot } from "../core/constructionEvidence";

// Synthetic shape only: these are not historical records or actual human reviews.
function request() {
  const date = "2026-01-01T00:00:00.000Z";
  return { schemaVersion: "0.1.0", kind: "construction-evidence-request", lifecycle: {
    artifact: "source-lifecycle", schemaVersion: "0.1.0", runId: "synthetic-run", inputId: "synthetic-input", createdAt: date,
    sources: [{ sourceId: "s", title: "SYNTHETIC TEST", sourceFamily: "other", rightsProfile: "unknown", approvedBy: "synthetic-reviewer", approvedAt: date, retracted: false, extraUpstreamField: "preserved" }],
    evidence: [{ evidenceId: "e", sourceId: "s", excerptText: "synthetic claim", locator: "synthetic locator", confidence: "medium", provenance: {
      sourceInputIds: ["input"], sourceChunkIds: ["chunk"], spans: [{ chunkId: "chunk", start: 0, end: 3 }], attributionMode: "quoted",
      evidenceBasis: "observed", confidence: "medium", verification: "verified" } }],
    claims: [{ claimId: "c", text: "synthetic claim", evidenceIds: ["e"], sourceIds: ["s"], confidence: "medium", closesGapIds: [] }],
    citationReviews: [{ claimId: "c", citationStatus: "approved", reviewTier: "individual_human", reviewerId: "synthetic-reviewer", reviewedAt: date }],
    integrityFlags: [], gates: { rightsGate: "pass" } }, mappings: [{ mappingId: "m", claimId: "c", target: "upper-front-opening-head", value: "round",
      reviewerId: "synthetic-mapper", mappedAt: date, rationale: "SYNTHETIC TEST mapping" }] };
}

describe("construction evidence intake", () => {
  it("owns and literally replays the upstream source and explicit attribution", async () => {
    const input = request(), pending = createConstructionEvidenceSnapshot(input);
    input.lifecycle.sources[0].title = "changed after admission";
    const snapshot = await pending;
    expect(snapshot.source.lifecycle.sources[0].title).toBe("SYNTHETIC TEST");
    expect(snapshot.source.lifecycle.sources[0].extraUpstreamField).toBe("preserved");
    expect(snapshot.choices[0]).toMatchObject({ claimId: "c", value: "round", evidenceIds: ["e"], sourceIds: ["s"] });
    expect(await readConstructionEvidenceSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
  it("leaves non-architectural and unmapped text unknown without keyword inference", async () => {
    const input = request(); input.mappings = []; input.lifecycle.claims[0].text = "round window and motorsport wardrobe";
    const snapshot = await createConstructionEvidenceSnapshot(input);
    expect(snapshot.coverage).toBe("unknown"); expect(snapshot.choices).toEqual([]);
  });
  it.each([
    ["retracted source", (x: ReturnType<typeof request>) => { x.lifecycle.sources[0].retracted = true; }],
    ["missing evidence", (x: ReturnType<typeof request>) => { x.lifecycle.claims[0].evidenceIds = ["missing"]; }],
    ["cross-source evidence", (x: ReturnType<typeof request>) => { x.lifecycle.evidence[0].sourceId = "other"; }],
    ["unreviewed claim", (x: ReturnType<typeof request>) => { x.lifecycle.citationReviews[0].citationStatus = "needs_review"; }],
    ["automated review", (x: ReturnType<typeof request>) => { x.lifecycle.citationReviews[0].reviewTier = "automated_internal"; }],
    ["unverified evidence", (x: ReturnType<typeof request>) => { x.lifecycle.evidence[0].provenance.verification = "downgraded"; }],
    ["inferred basis", (x: ReturnType<typeof request>) => { x.lifecycle.evidence[0].provenance.evidenceBasis = "inferred"; }],
    ["malformed source family", (x: ReturnType<typeof request>) => { x.lifecycle.sources[0].sourceFamily = "invented"; }],
    ["missing locator", (x: ReturnType<typeof request>) => { x.lifecycle.evidence[0].locator = ""; x.lifecycle.evidence[0].provenance.spans = []; }],
    ["invalid span", (x: ReturnType<typeof request>) => { x.lifecycle.evidence[0].provenance.spans[0].end = -1; }],
    ["integrity flag", (x: ReturnType<typeof request>) => { x.lifecycle.integrityFlags.push({ code: "broken", message: "broken reference", recordIds: ["c"] } as never); }],
    ["pending rights gate", (x: ReturnType<typeof request>) => { x.lifecycle.gates.rightsGate = "pending"; }],
    ["conflicting mapping", (x: ReturnType<typeof request>) => { x.mappings.push({ ...x.mappings[0], mappingId: "m2", value: "flat" }); }],
    ["duplicate source", (x: ReturnType<typeof request>) => { x.lifecycle.sources.push({ ...x.lifecycle.sources[0] }); }]
  ])("rejects %s", async (_label, mutate) => { const input = request(); mutate(input); await expect(createConstructionEvidenceSnapshot(input)).rejects.toThrow(); });
  it("rejects altered results and sources on replay", async () => {
    const snapshot = await createConstructionEvidenceSnapshot(request());
    snapshot.choices[0].value = "flat";
    await expect(readConstructionEvidenceSnapshot(snapshot)).rejects.toThrow("does not match");
    const other = await createConstructionEvidenceSnapshot(request()); other.source.lifecycle.claims[0].text = "tampered";
    await expect(readConstructionEvidenceSnapshot(other)).rejects.toThrow("does not match");
  });
});
