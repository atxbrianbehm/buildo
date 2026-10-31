import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal, readConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import { hashCanonicalJson } from "../core/contentHash";

async function fixture() {
  const staged = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
    artifact: { inputId: "synthetic", claims: [{ claimId: "claim-1", text: "Synthetic example, not historical evidence.", category: "architecture-and-streetscape",
      confidence: "low", sourceInputIds: ["source-a", "source-b"], sourceChunkIds: ["chunk-a", "chunk-b"], attributionMode: "inferred" }] } });
  return { schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph: createBuildingConstructionGraph("proposal_test"), claimId: "claim-1",
    choice: { target: "upper-front-opening-head", value: "round" } };
}

it("records an explicit proposed choice against an exact graph without reviewing evidence or editing geometry", async () => {
  const input = await fixture(), snapshot = structuredClone(input), pending = createConstructionEvidenceProposal(input);
  input.graph.nodes.find(node => node.type === "Footprint")!.parameters.widthM = 20;
  const proposal = await pending;
  expect(proposal.status).toBe("proposed"); expect(proposal.staged.candidates[0].review).toBe("unreviewed"); expect(proposal.staged.architectureCoverage).toBe("unknown");
  expect(proposal.targetDocumentId).toBe(snapshot.graph.documentId); expect(proposal.sourceGraphHash).toBe(await hashCanonicalJson(snapshot.graph));
  expect(await readConstructionEvidenceProposal(JSON.parse(JSON.stringify(proposal)), snapshot.graph)).toEqual(proposal);
  await expect(readConstructionEvidenceProposal(proposal, input.graph)).rejects.toThrow(/changed building graph/);
  expect(snapshot.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBeUndefined();
});

it("rejects missing candidates, changed content, promoted status, and unsafe graph values", async () => {
  const input = await fixture(), proposal = await createConstructionEvidenceProposal(input);
  await expect(createConstructionEvidenceProposal({ ...input, claimId: "missing" })).rejects.toThrow(/architecture candidate/);
  const altered = structuredClone(proposal); altered.claimId = "missing";
  const { contentHash: _old, ...body } = altered; void _old; altered.contentHash = await hashCanonicalJson(body);
  await expect(readConstructionEvidenceProposal(altered, input.graph)).rejects.toThrow(/candidate is missing/);
  const promoted = structuredClone(proposal) as unknown as { status: string }; promoted.status = "accepted";
  await expect(readConstructionEvidenceProposal(promoted, input.graph)).rejects.toThrow();
  const tampered = structuredClone(proposal); tampered.choice.value = "flat";
  await expect(readConstructionEvidenceProposal(tampered, input.graph)).rejects.toThrow(/saved hash/);
  await expect(readConstructionEvidenceProposal(proposal, createBuildingConstructionGraph("another_building"))).rejects.toThrow(/different or changed building graph/);
  const unsafe = structuredClone(input.graph); let invoked = false;
  Object.defineProperty(unsafe, "unsafe", { enumerable: true, get() { invoked = true; return 1; } });
  await expect(readConstructionEvidenceProposal(proposal, unsafe)).rejects.toThrow(/plain JSON/); expect(invoked).toBe(false);
});
