import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import { applyConstructionEvidenceProposal } from "../core/constructionEvidenceApplication";
import { ConstructionHistory, readConstructionHistorySnapshot } from "../state/constructionHistory";

it("restores evidence with its exact graph on undo and redo, and drops it on a new edit", async () => {
  const graph = createBuildingConstructionGraph("history_evidence"), staged = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
    artifact: { inputId: "synthetic", claims: [{ claimId: "claim-1", text: "Synthetic rounded openings.", category: "architecture-and-streetscape", confidence: "low", sourceInputIds: ["input"], sourceChunkIds: ["chunk"], attributionMode: "inferred" }] } });
  const proposal = await createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph, claimId: "claim-1", choice: { target: "upper-front-opening-head", value: "round" } });
  const application = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal, sourceGraph: graph, generationSource: null });
  const history = new ConstructionHistory(), hash = "a".repeat(64);
  history.record(graph, hash); history.record(application.resultGraph, hash, false, null, application);
  expect(history.currentEvidenceApplication).toEqual(application);
  history.acceptTraversal("undo", graph); expect(history.currentEvidenceApplication).toBeNull();
  expect(history.targetEvidenceApplication("redo")).toEqual(application);
  history.acceptTraversal("redo", application.resultGraph); expect(history.currentEvidenceApplication).toEqual(application);
  const snapshot = history.snapshot()!; expect(snapshot.schemaVersion).toBe("0.3.0");
  expect((await readConstructionHistorySnapshot(JSON.parse(JSON.stringify(snapshot)))).evidenceApplications?.[1]).toEqual(application);
  const restored = new ConstructionHistory(await readConstructionHistorySnapshot(JSON.parse(JSON.stringify(snapshot))));
  expect(restored.currentEvidenceApplication).toEqual(application);
  const changed = structuredClone(application.resultGraph); changed.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
  expect(() => history.record(changed, hash, false, null, application)).toThrow(/must match/);
  history.record(changed, hash); expect(history.currentEvidenceApplication).toBeNull();
  history.acceptTraversal("undo", application.resultGraph); expect(history.currentEvidenceApplication).toEqual(application);
  history.acceptTraversal("undo", graph); const alternate = structuredClone(graph); alternate.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 2;
  history.record(alternate, hash); expect(history.canRedo).toBe(false);
  const corrupt = structuredClone(snapshot); corrupt.evidenceApplications![1]!.contentHash = "0".repeat(64);
  await expect(readConstructionHistorySnapshot(corrupt)).rejects.toThrow(/does not replay/);
});
