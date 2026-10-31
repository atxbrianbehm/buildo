import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { resolveConstructionFamilyPierVariation } from "../core/constructionFamilyPierVariation";
import { hashCanonicalJson } from "../core/contentHash";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createGroupedRhythmFamilyArchive, readGroupedRhythmFamilyArchive } from "../state/constructionGroupedRhythmFamilyArchive";
import { createGroupedRhythmFabricArchive, readGroupedRhythmFabricArchive } from "../state/constructionGroupedRhythmFabricArchive";
import { resolveConstructionFamilyFabricStudy } from "../materials/constructionFamilyFabricStudy";
import { createConstructionFamilyFabricAssignments } from "../materials/constructionFamilyFabric";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { resolveConstructionGroupedRhythmFamilyStudy } from "../state/constructionGroupedRhythmFamilyStudy";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createReferenceConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";

it("replays a portable rhythm family with real material and fabric source and rejects tampering", async () => {
  const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("rhythm_archive"), null, defaultConstructionGenerationControls);
    const { materials, plan: materialPlan } = await createReferenceConstructionMaterials(base, initial.source, new AbortController().signal, base.spec);
    const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: initial.source,
      resolution: initial.resolution, materialPlan, materialSourceHash: materials.file.contentHash };
    const storefront = withConstructionStorefront(initial.graph, 1);
    const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(awnings, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "archive-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const sourceProject = await createBayConstructionProject(graph, materials.file, lineage, fabric);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "rhythm_archive_family", familySeed: "sign-family-seed", graph });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const request = { schemaVersion: "0.1.0" as const, kind: "construction-grouped-rhythm-family-archive-request" as const, sourceProject, plan, composition,
      policy: { schemaVersion: "0.1.0" as const, kind: "construction-grouped-rhythm-family-policy" as const, scope: "all-upper-front" as const, memberCount: 2 as const, memberWidthM: 0.55, pierWidthM: 0.24 }, controls: defaultConstructionGenerationControls };
    const archive = await createGroupedRhythmFamilyArchive(request), reopened = await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(archive)));
    expect(reopened).toEqual(archive); expect(reopened.request.sourceProject.materialSource).toEqual(materials.file); expect(reopened.request.sourceProject.awningFabric).toEqual(fabric);
    expect(reopened.result.members).toHaveLength(6); expect(reopened.result.members.filter(member => member.graph.upperBayGroups?.length)).toHaveLength(3);
    const assignments = await resolveConstructionFamilyFabricStudy({ schemaVersion: "0.1.0", kind: "construction-family-fabric-study-request", familyId: plan.source.familyId,
      sourceDocumentId: graph.documentId, memberIds: archive.result.members.map(member => member.graph.documentId), materialSeed: "demo-fabric", inheritedFabric: fabric });
    const fabricArchive = await createGroupedRhythmFabricArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-fabric-archive", family: archive, fabricAssignments: assignments });
    expect(await readGroupedRhythmFabricArchive(JSON.parse(JSON.stringify(fabricArchive)))).toEqual(fabricArchive);
    const alteredFabric = structuredClone(fabricArchive); alteredFabric.fabricAssignments.members[0].documentId = "changed";
    const { contentHash: _fabricArchiveHash, ...alteredBody } = alteredFabric; void _fabricArchiveHash; alteredFabric.contentHash = await hashCanonicalJson(alteredBody);
    await expect(readGroupedRhythmFabricArchive(alteredFabric)).rejects.toThrow(/saved hash/);
    const { contentHash: _assignmentHash, ...assignmentBody } = assignments; void _assignmentHash;
    const wrongFamily = await createConstructionFamilyFabricAssignments({ ...assignmentBody, familyId: "different_family" });
    await expect(createGroupedRhythmFabricArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-fabric-archive", family: archive, fabricAssignments: wrongFamily })).rejects.toThrow(/owning family/);
    const top = await createGroupedRhythmFamilyArchive({ ...request, policy: { ...request.policy, schemaVersion: "0.2.0", scope: "top-upper-front" } });
    const reopenedTop = await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(top)));
    expect(reopenedTop).toEqual(top);
    expect(reopenedTop.result.members.some(member => (member.graph.upperBayGroups ?? []).length > 0 && member.graph.upperBayGroups!.every(group => group.floorIndex === member.graph.nodes.find(node => node.type === "Storeys")!.parameters.count - 1))).toBe(true);
    const variation = resolveConstructionFamilyPierVariation({ schemaVersion: "0.1.0", kind: "construction-family-pier-variation-request", familySeed: plan.source.familySeed, enabled: true, openingLock: false });
    const withPiers = await createGroupedRhythmFamilyArchive({ ...request, policy: { ...request.policy, schemaVersion: "0.3.0", pierVariation: variation } });
    const reopenedPiers = await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(withPiers)));
    expect(reopenedPiers).toEqual(withPiers);
    expect(reopenedPiers.result.members.some(member => Boolean(member.graph.facadePiers))).toBe(true);
    expect(reopenedPiers.result.members.some(member => Boolean(member.graph.facadePiers) && Boolean(member.graph.upperBayGroups?.length))).toBe(true);
    expect(reopenedPiers.result.members.every(member => JSON.stringify(member.graph.storefrontSign) === JSON.stringify(graph.storefrontSign))).toBe(true);
    expect(reopenedPiers.request.sourceProject.materialSource).toEqual(materials.file);
    const entrancePolicy = { ...request.policy, schemaVersion: "0.4.0" as const, uncoveredEntrances: true as const };
    const withEntrances = await createGroupedRhythmFamilyArchive({ ...request, policy: entrancePolicy });
    expect(await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(withEntrances)))).toEqual(withEntrances);
    for (const member of withEntrances.result.members) {
      expect(member.graph.awnings).toEqual(graph.awnings);
      expect(member.graph.storefrontSign).toEqual(graph.storefrontSign);
      expect(member.graph.awnings!.map(awning => awning.bayIndex)).not.toContain(member.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex);
    }
    expect(withEntrances.request.sourceProject.materialSource).toEqual(materials.file);
    const entranceFabrics = await createGroupedRhythmFabricArchive({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-fabric-archive", family: withEntrances, fabricAssignments: assignments });
    expect(await readGroupedRhythmFabricArchive(JSON.parse(JSON.stringify(entranceFabrics)))).toEqual(entranceFabrics);
    const entranceAndPiers = await createGroupedRhythmFamilyArchive({ ...request, policy: { ...entrancePolicy, pierVariation: variation } });
    expect(await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(entranceAndPiers)))).toEqual(entranceAndPiers);
    expect(entranceAndPiers.result.members.some(member => Boolean(member.graph.facadePiers))).toBe(true);
    const badEntrance = structuredClone(withEntrances);
    badEntrance.result.members[0].graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex = 0;
    const { contentHash: _entranceHash, ...entrancePayload } = badEntrance; void _entranceHash;
    badEntrance.contentHash = await hashCanonicalJson(entrancePayload);
    await expect(readGroupedRhythmFamilyArchive(badEntrance)).rejects.toThrow(/does not replay/);
    await expect(createGroupedRhythmFamilyArchive({ ...request, policy: entrancePolicy, controls: { ...request.controls, lockOpenings: true } })).rejects.toThrow();
    const oldSource = lineage.source;
    const pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: oldSource.documentId,
      intent: { ...oldSource.intent, locks: [{ semanticPath: "construction/entrance/bayIndex", scope: "family", lockedValue: 0, reason: "Imported pin" }] },
      recipe: oldSource.recipe, reference: oldSource.reference, intentionalExceptions: oldSource.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(base.spec, pinned) };
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, pinnedLineage, defaultConstructionGenerationControls, composition, entrancePolicy)).rejects.toThrow(/pinned lock.*entrance/);
    const altered = structuredClone(withPiers);
    if (altered.request.policy.schemaVersion !== "0.3.0") throw new Error("Expected pier policy");
    altered.request.policy.pierVariation = resolveConstructionFamilyPierVariation({ ...variation.source, enabled: false });
    const { contentHash: _pierHash, ...pierPayload } = altered; void _pierHash; altered.contentHash = await hashCanonicalJson(pierPayload);
    await expect(readGroupedRhythmFamilyArchive(altered)).rejects.toThrow(/does not replay/);
    await expect(createGroupedRhythmFamilyArchive({ ...request, policy: { ...request.policy, schemaVersion: "0.3.0", pierVariation: resolveConstructionFamilyPierVariation({ ...variation.source, familySeed: "different" }) } })).rejects.toThrow(/seed/);
    const pierced = withConstructionFacadePiers(storefront, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    const piercedAwning = withConstructionAwnings(pierced, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const lightsGraph = withConstructionSignAwningClearance(withConstructionStorefrontSign(piercedAwning, graph.storefrontSign!), graph.signAwningGapM!);
    expect(lightsGraph.storefrontDivision).toBeUndefined();
    const lightsProject = await createBayConstructionProject(lightsGraph, materials.file, lineage, fabric);
    const lightsPlan = resolveConstructionFamilyPlan({ ...plan.source, graph: lightsGraph });
    const lightsComposition = resolveConstructionFamilyComposition({ ...composition.source, policy: { ...composition.source.policy, openings: false, storefrontLights: true, massing: false } });
    const lightsArchive = await createGroupedRhythmFamilyArchive({ ...request, sourceProject: lightsProject, plan: lightsPlan, composition: lightsComposition });
    const reopenedLights = await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(lightsArchive)));
    expect(reopenedLights).toEqual(lightsArchive);
    expect(new Set(reopenedLights.result.members.map(member => JSON.stringify(member.graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 }))).size).toBeGreaterThan(1);
    expect(reopenedLights.result.members.every(member => Boolean(member.graph.upperBayGroups?.length) && JSON.stringify(member.graph.storefrontSign) === JSON.stringify(lightsGraph.storefrontSign))).toBe(true);
    expect(reopenedLights.request.sourceProject.materialSource).toEqual(materials.file); expect(reopenedLights.request.sourceProject.awningFabric).toEqual(fabric);
    const edited = structuredClone(archive); edited.result.members[0].graph.nodes.find(node => node.type === "Storeys")!.parameters.count = 6;
    const { contentHash: _old, ...payload } = edited; void _old; edited.contentHash = await hashCanonicalJson(payload);
    await expect(readGroupedRhythmFamilyArchive(edited)).rejects.toThrow(/does not replay/);
    const badFabric = structuredClone(archive); badFabric.request.sourceProject.awningFabric!.contentHash = "b".repeat(64);
    const { contentHash: _archiveHash, ...fabricPayload } = badFabric; void _archiveHash; badFabric.contentHash = await hashCanonicalJson(fabricPayload);
    await expect(readGroupedRhythmFamilyArchive(badFabric)).rejects.toThrow();
    const mismatched = structuredClone(request); mismatched.plan.source.graph.documentId = "different";
    await expect(createGroupedRhythmFamilyArchive(mismatched)).rejects.toThrow();
  } finally { base.familyRuntime.dispose(); }
}, 240000);
