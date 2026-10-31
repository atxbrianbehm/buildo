import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import { applyConstructionEvidenceProposal } from "../core/constructionEvidenceApplication";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createConstructionEvidenceProject, readConstructionEvidenceProject } from "../state/constructionEvidenceProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";

it("saves a compiled building with its application and exact material source, and rejects a different graph", async () => {
  const fixture = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const materials = await createBayConstructionMaterials(fixture, new AbortController().signal), graph = createBuildingConstructionGraph("evidence_project");
    const staged = await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION,
      artifact: { inputId: "synthetic", claims: [{ claimId: "claim-1", text: "Synthetic round-headed windows.", category: "architecture-and-streetscape", confidence: "low", sourceInputIds: ["input"], sourceChunkIds: ["chunk"], attributionMode: "inferred" }] } });
    const proposal = await createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph, claimId: "claim-1", choice: { target: "upper-front-opening-head", value: "round" } });
    const application = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal, sourceGraph: graph, generationSource: null });
    const project = await createBayConstructionProject(application.resultGraph, materials.file), archive = await createConstructionEvidenceProject(project, application);
    const reopened = await readConstructionEvidenceProject(JSON.parse(JSON.stringify(archive)));
    expect(reopened).toEqual(archive); expect(reopened.project.materialSource).toEqual(materials.file);
    expect(reopened.application.proposal.staged.artifact).toEqual(staged.artifact);
    expect(reopened.application.proposal.staged.candidates[0].review).toBe("unreviewed");
    const changed = structuredClone(application.resultGraph); changed.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
    const changedProject = await createBayConstructionProject(changed, materials.file);
    await expect(createConstructionEvidenceProject(changedProject, application)).rejects.toThrow(/must match/);
    const generation = await resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls);
    const sourced = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request", proposal, sourceGraph: graph, generationSource: generation.source });
    await expect(createConstructionEvidenceProject(project, sourced)).rejects.toThrow(/generation source/);
    const tampered = structuredClone(archive); tampered.application.proposal.claimId = "other";
    await expect(readConstructionEvidenceProject(tampered)).rejects.toThrow();
  } finally { fixture.familyRuntime.dispose(); }
}, 120000);
