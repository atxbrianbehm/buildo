import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { hashCanonicalJson } from "../core/contentHash";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createGroupedRhythmFamilyArchive, readGroupedRhythmFamilyArchive } from "../state/constructionGroupedRhythmFamilyArchive";
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
    const top = await createGroupedRhythmFamilyArchive({ ...request, policy: { ...request.policy, schemaVersion: "0.2.0", scope: "top-upper-front" } });
    const reopenedTop = await readGroupedRhythmFamilyArchive(JSON.parse(JSON.stringify(top)));
    expect(reopenedTop).toEqual(top);
    expect(reopenedTop.result.members.some(member => (member.graph.upperBayGroups ?? []).length > 0 && member.graph.upperBayGroups!.every(group => group.floorIndex === member.graph.nodes.find(node => node.type === "Storeys")!.parameters.count - 1))).toBe(true);
    const edited = structuredClone(archive); edited.result.members[0].graph.nodes.find(node => node.type === "Storeys")!.parameters.count = 6;
    const { contentHash: _old, ...payload } = edited; void _old; edited.contentHash = await hashCanonicalJson(payload);
    await expect(readGroupedRhythmFamilyArchive(edited)).rejects.toThrow(/does not replay/);
    const badFabric = structuredClone(archive); badFabric.request.sourceProject.awningFabric!.contentHash = "b".repeat(64);
    const { contentHash: _archiveHash, ...fabricPayload } = badFabric; void _archiveHash; badFabric.contentHash = await hashCanonicalJson(fabricPayload);
    await expect(readGroupedRhythmFamilyArchive(badFabric)).rejects.toThrow();
    const mismatched = structuredClone(request); mismatched.plan.source.graph.documentId = "different";
    await expect(createGroupedRhythmFamilyArchive(mismatched)).rejects.toThrow();
  } finally { base.familyRuntime.dispose(); }
}, 180000);
