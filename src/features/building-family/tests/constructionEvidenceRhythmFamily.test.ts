import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import { applyConstructionEvidenceProposal } from "../core/constructionEvidenceApplication";
import { hashCanonicalJson } from "../core/contentHash";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { resolveConstructionFamilyFabricStudy } from "../materials/constructionFamilyFabricStudy";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createGroupedRhythmFamilyArchive } from "../state/constructionGroupedRhythmFamilyArchive";
import { createGroupedRhythmFabricArchive } from "../state/constructionGroupedRhythmFabricArchive";
import { createConstructionEvidenceRhythmFamily, readConstructionEvidenceRhythmFamily } from "../state/constructionEvidenceRhythmFamily";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createReferenceConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";

it("retains a source interpretation with a replayed family without promoting member claims", async () => {
  const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("evidence_family"), null, defaultConstructionGenerationControls);
    const { materials, plan: materialPlan } = await createReferenceConstructionMaterials(base, initial.source, new AbortController().signal, base.spec);
    const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: initial.source,
      resolution: initial.resolution, materialPlan, materialSourceHash: materials.file.contentHash };
    const storefront = withConstructionStorefront(initial.graph, 1), awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(awnings, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
    const staged = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
      artifact: { inputId: "synthetic", claims: [{ claimId: "claim-1", text: "Synthetic round upper openings.", category: "architecture-and-streetscape", confidence: "low", sourceInputIds: ["input"], sourceChunkIds: ["chunk"], attributionMode: "inferred" }] } });
    const proposal = await createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph, claimId: "claim-1", choice: { target: "upper-front-opening-head", value: "round" } });
    const application = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal, sourceGraph: graph, generationSource: lineage.source });
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "evidence-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const sourceProject = await createBayConstructionProject(application.resultGraph, materials.file, lineage, fabric);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "evidence_family_set", familySeed: "evidence-seed", graph: application.resultGraph });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const archive = await createGroupedRhythmFamilyArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-family-archive-request", sourceProject, plan, composition,
      policy: { schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-family-policy", scope: "all-upper-front", memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 }, controls: defaultConstructionGenerationControls });
    const linked = await createConstructionEvidenceRhythmFamily({ schemaVersion: "0.1.0", kind: "construction-evidence-rhythm-family-request", family: archive, application });
    expect(await readConstructionEvidenceRhythmFamily(JSON.parse(JSON.stringify(linked)))).toEqual(linked);
    expect(linked.application.proposal.staged.candidates[0].review).toBe("unreviewed"); expect(linked.members).toHaveLength(6);
    expect(new Set(linked.members.map(member => member.openingHead))).toEqual(new Set(["matches-source", "differs-from-source"]));
    for (const [index, member] of archive.result.members.entries()) expect(linked.members[index].openingHead).toBe(member.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead === 1 ? "matches-source" : "differs-from-source");
    const assignments = await resolveConstructionFamilyFabricStudy({ schemaVersion: "0.1.0", kind: "construction-family-fabric-study-request", familyId: plan.source.familyId,
      sourceDocumentId: application.resultGraph.documentId, memberIds: archive.result.members.map(member => member.graph.documentId), materialSeed: "fabric", inheritedFabric: fabric });
    const fabricArchive = await createGroupedRhythmFabricArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-fabric-archive", family: archive, fabricAssignments: assignments });
    expect((await createConstructionEvidenceRhythmFamily({ schemaVersion: "0.1.0", kind: "construction-evidence-rhythm-family-request", family: fabricArchive, application })).members).toEqual(linked.members);
    const changed = structuredClone(linked); changed.members[0].openingHead = changed.members[0].openingHead === "matches-source" ? "differs-from-source" : "matches-source";
    const { contentHash: _old, ...changedBody } = changed; void _old; changed.contentHash = await hashCanonicalJson(changedBody);
    await expect(readConstructionEvidenceRhythmFamily(changed)).rejects.toThrow(/does not replay/);
    const otherGraph = structuredClone(graph); otherGraph.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
    const otherProposal = await createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph: otherGraph, claimId: "claim-1", choice: { target: "upper-front-opening-head", value: "round" } });
    const unrelated = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal: otherProposal, sourceGraph: otherGraph, generationSource: lineage.source });
    await expect(createConstructionEvidenceRhythmFamily({ schemaVersion: "0.1.0", kind: "construction-evidence-rhythm-family-request", family: archive, application: unrelated })).rejects.toThrow(/must match/);
  } finally { base.familyRuntime.dispose(); }
}, 120000);
