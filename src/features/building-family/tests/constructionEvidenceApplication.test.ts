import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import { applyConstructionEvidenceProposal, readConstructionEvidenceApplication } from "../core/constructionEvidenceApplication";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";

async function makeProposal(graph: ReturnType<typeof createBuildingConstructionGraph>) {
  const staged = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
    artifact: { inputId: "synthetic", claims: [{ claimId: "claim-1", text: "Synthetic round-headed windows.", category: "architecture-and-streetscape", confidence: "low", sourceInputIds: ["input"], sourceChunkIds: ["chunk"], attributionMode: "inferred" }] } });
  return createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph, claimId: "claim-1", choice: { target: "upper-front-opening-head", value: "round" } });
}
function request(graph: ReturnType<typeof createBuildingConstructionGraph>, proposal: Awaited<ReturnType<typeof makeProposal>>, generationSource: unknown = null) {
  return { schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal, sourceGraph: graph, generationSource };
}

it("applies a proposed shape through the compiler and replays the retained source", async () => {
  const graph = createBuildingConstructionGraph("application_building"), proposal = await makeProposal(graph), before = structuredClone(graph);
  const application = await applyConstructionEvidenceProposal(request(graph, proposal));
  const flat = await evaluateConstruction(graph), round = await evaluateConstruction(application.resultGraph);
  expect(graph).toEqual(before); expect(application.proposal.staged.candidates[0].review).toBe("unreviewed");
  expect(application.resultGraph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
  expect(round.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"))?.positions)
    .not.toEqual(flat.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"))?.positions);
  expect(await readConstructionEvidenceApplication(JSON.parse(JSON.stringify(application)))).toEqual(application);
  const altered = structuredClone(application); altered.resultGraph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead = 0;
  await expect(readConstructionEvidenceApplication(altered)).rejects.toThrow(/does not replay/);
});

it("preserves sign, awning and supports in a modern graph and rejects pinned or stale choices", async () => {
  const base = withConstructionStorefront(createBuildingConstructionGraph("application_modern"), 1);
  const awnings = withConstructionAwnings(base, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  const proposal = await makeProposal(graph), result = await applyConstructionEvidenceProposal(request(graph, proposal));
  expect(result.resultGraph.schemaVersion).toBe("0.17.0"); expect(result.resultGraph.awnings).toEqual(graph.awnings);
  expect(result.resultGraph.awningSupports).toEqual(graph.awningSupports); expect(result.resultGraph.storefrontSign).toEqual(graph.storefrontSign);
  expect(result.resultGraph.signAwningGapM).toBe(graph.signAwningGapM);
  const changed = structuredClone(graph); changed.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
  await expect(applyConstructionEvidenceProposal(request(changed, proposal))).rejects.toThrow(/changed building graph/);
  const bypassed = structuredClone(graph); bypassed.nodes.find(node => node.type === "PlaceOpening")!.bypassed = true;
  await expect(applyConstructionEvidenceProposal(request(bypassed, await makeProposal(bypassed)))).rejects.toThrow(/active registered opening/);
  const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("application_modern"), null, defaultConstructionGenerationControls);
  const pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: initial.source.documentId,
    intent: { ...initial.source.intent, locks: [{ semanticPath: "construction/opening/upperFrontRoundHead", scope: "family", lockedValue: 0 }] },
    recipe: initial.source.recipe, reference: initial.source.reference, intentionalExceptions: initial.source.intentionalExceptions });
  await expect(applyConstructionEvidenceProposal(request(graph, proposal, pinned))).rejects.toThrow(/pinned/);
  const foreign = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: "different_building",
    intent: initial.source.intent, recipe: initial.source.recipe, reference: initial.source.reference, intentionalExceptions: initial.source.intentionalExceptions });
  await expect(applyConstructionEvidenceProposal(request(graph, proposal, foreign))).rejects.toThrow(/different building/);
}, 120000);
