import { describe, expect, it, vi } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { resolveConstructionFamilyPierVariation } from "../core/constructionFamilyPierVariation";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { createConstructionFamilySource, readConstructionFamilySource, withUpdatedConstructionFamilyMembers } from "../state/constructionFamilySource";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createReferenceConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { withConstructionFacadePiers, withoutConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { createConstructionFamilyFabricAssignments } from "../materials/constructionFamilyFabric";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";

describe("persistent construction family source", () => {
  it("owns, validates and round-trips six independent graphs with one shared material artifact", async () => {
    const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    try {
      const generated = await resolveWorkbenchGeneration(createBuildingConstructionGraph("authored"), null, defaultConstructionGenerationControls);
      const generatedMaterials = await createReferenceConstructionMaterials(base, generated.source, new AbortController().signal, base.spec);
      const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: generated.source,
        resolution: generated.resolution, materialPlan: generatedMaterials.plan, materialSourceHash: generatedMaterials.materials.file.contentHash };
      const target = { documentId: "authored", storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 2 };
      const edited = withConstructionOpeningWidth(generated.graph, { target, widthM: 1.8 });
      const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "family", familySeed: "seed", graph: edited });
      const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
      const groupedOriginal = withConstructionGroupedBays(edited, [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0,
        memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 }]);
      const groupedPlan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "grouped_family", familySeed: "seed", graph: groupedOriginal });
      const generatedGrouped = await resolveConstructionFamily(groupedPlan, lineage, defaultConstructionGenerationControls);
      expect(generatedGrouped.members).toHaveLength(6);
      expect(generatedGrouped.members.every(member => member.construction.graph.upperBayGroups?.[0].memberCount === 2)).toBe(true);
      expect(generatedGrouped.members.every(member => member.lineage.materialSourceHash === lineage.materialSourceHash)).toBe(true);
      const conflicting = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "seed", policy: { openings: true, frontage: false, roof: false }, openingLock: false });
      await expect(resolveConstructionFamily(groupedPlan, lineage, defaultConstructionGenerationControls, undefined, conflicting)).rejects.toThrow(/cannot currently coexist/);
      const input = { schemaVersion: "0.2.0" as const, kind: "construction-family-source" as const, familyId: "family", sourceDocumentId: "authored", familySeed: "seed",
        sourceGraph: edited, sourceGeneration: lineage, materialSource: generatedMaterials.materials.file,
        members: family.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) };
      const materialGeneration = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
      const pending = createConstructionFamilySource(input);
      input.familySeed = "changed-after-call";
      const saved = await pending;
      expect(saved.familySeed).toBe("seed");
      expect(saved.members).toHaveLength(6);
      expect(saved.members.every(member => member.generation.materialSourceHash === saved.materialSource.contentHash)).toBe(true);
      const restored = await readConstructionFamilySource(JSON.parse(JSON.stringify(saved)));
      const dividedGraph = withConstructionStorefrontDivision(withConstructionStorefront(edited, 1), { displayLights: 2, transomLights: 3 });
      const dividedMember = withConstructionStorefrontDivision(withConstructionStorefront(saved.members[0].graph, 1), { displayLights: 2, transomLights: 3 });
      const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "family-fabric", pattern: "striped", primary: [220, 210, 190], secondary: [60, 90, 70], physicalSizeM: [1, 1] });
      const awnings = [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }];
      const awningInput = { ...input, familySeed: "seed", schemaVersion: "0.8.0" as const, awningFabric: fabric, sourceGraph: withConstructionAwnings(dividedGraph, awnings),
        members: saved.members.map(member => ({ ...member, graph: withConstructionAwnings(withConstructionStorefrontDivision(withConstructionStorefront(member.graph, 1), { displayLights: 2, transomLights: 3 }), awnings) })) };
      const awningFamily = await createConstructionFamilySource(awningInput), awningReopened = await readConstructionFamilySource(JSON.parse(JSON.stringify(awningFamily)));
      expect(awningReopened).toEqual(awningFamily); expect(awningReopened.schemaVersion === "0.8.0" && awningReopened.awningFabric).toEqual(fabric);
      expect(awningReopened.materialSource).toEqual(saved.materialSource);
      expect((await evaluateConstruction(awningReopened.members[0].graph)).ir.meshBatches.filter(batch => batch.role.startsWith("awning."))).toHaveLength(2);
      const badFabric = structuredClone(fabric); badFabric.source.seed = "tampered";
      await expect(createConstructionFamilySource({ ...awningInput, awningFabric: badFabric })).rejects.toThrow(/does not match/);
      const { awningFabric: _fabric, ...withoutFabric } = awningInput; void _fabric;
      await expect(createConstructionFamilySource({ ...withoutFabric, schemaVersion: "0.5.0" })).rejects.toThrow(/Awning family graphs require/);
      const rods = [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }];
      const supportInput = { ...awningInput, schemaVersion: "0.10.0" as const, sourceGraph: withConstructionAwningSupports(awningInput.sourceGraph, rods),
        members: awningInput.members.map(member => ({ ...member, graph: withConstructionAwningSupports(member.graph, rods) })) };
      const oneMemberSupport = { ...supportInput, sourceGraph: awningInput.sourceGraph,
        members: awningInput.members.map((member, index) => index === 0 ? supportInput.members[0] : member) };
      const oneMemberFamily = await createConstructionFamilySource(oneMemberSupport);
      const { contentHash: _supportHash, ...oneMemberPayload } = oneMemberFamily; void _supportHash;
      const removedLast = withUpdatedConstructionFamilyMembers(oneMemberPayload, awningInput.members);
      expect(removedLast.schemaVersion).toBe("0.8.0"); expect((await createConstructionFamilySource(removedLast)).schemaVersion).toBe("0.8.0");
      const redFabric = await createConstructionAwningFabric({ ...fabric.source, pattern: "solid", primary: [150, 40, 35] });
      const fabricAssignments = await createConstructionFamilyFabricAssignments({ schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: supportInput.familyId,
        sourceDocumentId: supportInput.sourceDocumentId, inheritedFabric: fabric,
        members: supportInput.members.map((member, index) => index === 0 ? { documentId: member.documentId, mode: "override", fabric: redFabric } : { documentId: member.documentId, mode: "inherit" }) });
      const individualInput = { ...supportInput, schemaVersion: "0.11.0" as const, fabricAssignments };
      const entranceChoices = resolveConstructionFamilyComposition({ schemaVersion: "0.6.0", kind: "construction-family-composition-request", familySeed: "seed", openingLock: false,
        policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: false, entranceBay: true } });
      const entranceInput = { ...individualInput, schemaVersion: "0.12.0", initialComposition: entranceChoices };
      const entranceFamily = await createConstructionFamilySource(entranceInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(entranceFamily)))).toEqual(entranceFamily);
      expect(entranceFamily.schemaVersion === "0.12.0" && entranceFamily.fabricAssignments).toEqual(fabricAssignments);
      const { awningFabric: _entranceFabric, ...missingEntranceFabric } = entranceInput; void _entranceFabric;
      await expect(createConstructionFamilySource(missingEntranceFabric)).rejects.toThrow(/require their inherited fabric/);
      await expect(createConstructionFamilySource({ ...entranceInput, familySeed: "other" })).rejects.toThrow(/retain the family seed/);
      await expect(createConstructionFamilySource({ ...entranceInput, awningFabric: redFabric })).rejects.toThrow(/owning family/);
      const alteredEntrance = structuredClone(entranceFamily); if (alteredEntrance.schemaVersion !== "0.12.0") throw new Error("Wrong family version");
      alteredEntrance.initialComposition.members[0].entranceOffset = (alteredEntrance.initialComposition.members[0].entranceOffset! + 1) % 20;
      await expect(readConstructionFamilySource(alteredEntrance)).rejects.toThrow(/does not match/);
      const { contentHash: _entranceHash, ...entrancePayload } = entranceFamily; void _entranceHash;
      expect(withUpdatedConstructionFamilyMembers(entrancePayload, entrancePayload.members).schemaVersion).toBe("0.12.0");
      const noFabricInput = { ...input, familySeed: "seed", schemaVersion: "0.12.0", initialComposition: entranceChoices };
      const noFabric = await createConstructionFamilySource(noFabricInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(noFabric)))).toEqual(noFabric);
      await expect(createConstructionFamilySource({ ...noFabricInput, schemaVersion: "0.7.0" })).rejects.toThrow();
      const pierDirective = { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 };
      const pierInput = { ...individualInput, schemaVersion: "0.13.0", sourceGraph: withConstructionFacadePiers(individualInput.sourceGraph, pierDirective),
        members: individualInput.members.map(member => ({ ...member, graph: withConstructionFacadePiers(member.graph, pierDirective) })) };
      const pierFamily = await createConstructionFamilySource(pierInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(pierFamily)))).toEqual(pierFamily);
      const variation = resolveConstructionFamilyPierVariation({ schemaVersion: "0.1.0", kind: "construction-family-pier-variation-request", familySeed: "seed", enabled: true, openingLock: false });
      const variationInput = { ...pierInput, schemaVersion: "0.14.0", initialPierVariation: variation };
      const variationFamily = await createConstructionFamilySource(variationInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(variationFamily)))).toEqual(variationFamily);
      const { contentHash: _variationHash, ...variationPayload } = variationFamily; void _variationHash;
      const variationMembers = variationPayload.members.map((member, index) => index === 0 ? { ...member, graph: withoutConstructionFacadePiers(member.graph) } : member);
      const changedVariation = withUpdatedConstructionFamilyMembers(variationPayload, variationMembers);
      expect(changedVariation.schemaVersion).toBe("0.14.0");
      const changedSaved = await createConstructionFamilySource(changedVariation);
      expect(changedSaved.members[0].graph.facadePiers).toBeUndefined();
      expect(changedSaved.schemaVersion === "0.14.0" && changedSaved.initialPierVariation).toEqual(variation);
      await expect(createConstructionFamilySource({ ...variationInput, familySeed: "other" })).rejects.toThrow(/pier variation must retain/);
      const tamperedVariation = structuredClone(variation); tamperedVariation.members[0].treatment = tamperedVariation.members[0].treatment === "none" ? "slender" : "none";
      await expect(createConstructionFamilySource({ ...variationInput, initialPierVariation: tamperedVariation })).rejects.toThrow(/source and seed/);
      await expect(createConstructionFamilySource({ ...variationInput, schemaVersion: "0.13.0" })).rejects.toThrow();
      expect((await evaluateConstruction(pierFamily.members[0].graph)).ir.meshBatches.filter(batch => batch.role === "facade-pier")).toHaveLength(10);
      const { awningFabric: _pierFabric, ...pierMissingFabric } = pierInput; void _pierFabric;
      await expect(createConstructionFamilySource(pierMissingFabric)).rejects.toThrow(/require their inherited fabric/);
      await expect(createConstructionFamilySource({ ...pierInput, schemaVersion: "0.11.0" })).rejects.toThrow(/pier family graphs/);
      await expect(createConstructionFamilySource({ ...pierInput, awningFabric: redFabric })).rejects.toThrow(/owning family/);
      const { contentHash: _pierHash, ...pierPayload } = pierFamily; void _pierHash;
      expect(withUpdatedConstructionFamilyMembers(pierPayload, pierPayload.members).schemaVersion).toBe("0.13.0");
      const plainPierInput = { ...input, familySeed: "seed", schemaVersion: "0.13.0", sourceGraph: withConstructionFacadePiers(edited, pierDirective),
        members: saved.members.map(member => ({ ...member, graph: withConstructionFacadePiers(member.graph, pierDirective) })) };
      const plainPierFamily = await createConstructionFamilySource(plainPierInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(plainPierFamily)))).toEqual(plainPierFamily);
      const individualFamily = await createConstructionFamilySource(individualInput);
      const { contentHash: _individualHash, ...individualPayload } = individualFamily; void _individualHash;
      const upgradedMembers = individualPayload.members.map((member, index) => index === 0 ? { ...member, graph: withConstructionFacadePiers(member.graph, pierDirective) } : member);
      const upgraded = withUpdatedConstructionFamilyMembers(individualPayload, upgradedMembers);
      expect(upgraded.schemaVersion).toBe("0.13.0");
      expect((await createConstructionFamilySource(upgraded)).schemaVersion).toBe("0.13.0");
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(individualFamily)))).toEqual(individualFamily);
      await expect(createConstructionFamilySource({ ...individualInput, familyId: "wrong" })).rejects.toThrow(/owning family/);
      await expect(createConstructionFamilySource({ ...individualInput, awningFabric: redFabric })).rejects.toThrow(/owning family/);
      await expect(createConstructionFamilySource({ ...individualInput, schemaVersion: "0.10.0" })).rejects.toThrow();
      const supportFamily = await createConstructionFamilySource(supportInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(supportFamily)))).toEqual(supportFamily);
      expect((await evaluateConstruction(supportFamily.members[0].graph)).ir.meshBatches.filter(batch => batch.role === "awning.support")).toHaveLength(1);
      await expect(createConstructionFamilySource({ ...supportInput, schemaVersion: "0.8.0" })).rejects.toThrow(/Support family graphs require/);
      await expect(createConstructionFamilySource({ ...supportInput, awningFabric: badFabric })).rejects.toThrow(/does not match/);
      const awningPlan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "awning_family", familySeed: "seed", graph: awningInput.sourceGraph });
      const roofChoices = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "seed", policy: { openings: false, frontage: false, roof: true }, openingLock: false });
      const awningMembers = await resolveConstructionFamily(awningPlan, lineage, defaultConstructionGenerationControls, undefined, roofChoices);
      expect(awningMembers.members).toHaveLength(6);
      expect(awningMembers.members.every(member => JSON.stringify(member.construction.graph.awnings) === JSON.stringify(awnings))).toBe(true);
      const awningChoices = resolveConstructionFamilyComposition({ schemaVersion: "0.5.0", kind: "construction-family-composition-request", familySeed: "seed", openingLock: false,
        policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: true } });
      const withV5 = await createConstructionFamilySource({ ...oneMemberSupport, initialComposition: awningChoices });
      const { contentHash: _v5Hash, ...v5Payload } = withV5; void _v5Hash;
      const downgradedV5 = withUpdatedConstructionFamilyMembers(v5Payload, awningInput.members);
      expect(downgradedV5.schemaVersion).toBe("0.9.0"); expect((await createConstructionFamilySource(downgradedV5)).schemaVersion).toBe("0.9.0");
      const supportPlan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "support_family", familySeed: "seed", graph: supportInput.sourceGraph });
      const supportMembers = await resolveConstructionFamily(supportPlan, lineage, defaultConstructionGenerationControls, undefined, awningChoices);
      expect(supportMembers.members.every(member => JSON.stringify(member.construction.graph.awningSupports) === JSON.stringify(rods))).toBe(true);
      expect(new Set(supportMembers.members.map(member => member.construction.graph.awnings!.length))).toEqual(new Set([1, 2, 3]));
      const variedAwnings = await resolveConstructionFamily(awningPlan, lineage, defaultConstructionGenerationControls, undefined, awningChoices);
      expect(new Set(variedAwnings.members.map(member => member.construction.graph.awnings!.length))).toEqual(new Set([1, 2, 3]));
      const variedSource = await createConstructionFamilySource({ ...awningInput, schemaVersion: "0.9.0", initialComposition: awningChoices,
        members: variedAwnings.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) });
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(variedSource)))).toEqual(variedSource);
      const dividedInput = { ...input, familySeed: "seed", schemaVersion: "0.5.0", sourceGraph: dividedGraph,
        members: saved.members.map((member, index) => index === 0 ? { ...member, graph: dividedMember } : member) };
      const divided = await createConstructionFamilySource(dividedInput);
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(divided)))).toEqual(divided);
      await expect(createConstructionFamilySource({ ...dividedInput, schemaVersion: "0.2.0" })).rejects.toThrow(/require family source version/);
      expect(restored.contentHash).toBe(saved.contentHash);
      expect(restored.sourceGraph).toEqual(edited);
      expect(restored.sourceGeneration).toEqual(lineage);
      const originalProject = await createBayConstructionProject(restored.sourceGraph, restored.materialSource, restored.sourceGeneration);
      expect(originalProject.graph.documentId).toBe("authored");
      expect(restored.members.map(member => member.graph.documentId)).toEqual(family.members.map(member => member.documentId));
      for (const member of restored.members) {
        expect(member.graph.nodes.find(node => node.type === "EditOpeningWidth")?.overrides).toEqual([{ target: { ...target, documentId: member.documentId }, widthM: 1.8 }]);
        const project = await createBayConstructionProject(member.graph, restored.materialSource, member.generation);
        expect(project.materialSource.contentHash).toBe(restored.materialSource.contentHash);
      }
      const groupedMembers = saved.members.map((member, index) => index === 0 ? { ...member, graph: withConstructionGroupedBays(member.graph,
        [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 }]) } : member);
      const groupedFamily = await createConstructionFamilySource({ ...input, familySeed: "seed", members: groupedMembers });
      const reopenedGrouped = await readConstructionFamilySource(JSON.parse(JSON.stringify(groupedFamily)));
      expect(reopenedGrouped.members[0].graph.upperBayGroups).toEqual(groupedMembers[0].graph.upperBayGroups);
      expect(reopenedGrouped.materialSource).toEqual(saved.materialSource);
      expect((await evaluateConstruction(reopenedGrouped.members[0].graph)).ir.semanticIndex.some(entry => entry.semanticPath.includes("/bay/0/opening/0/frame"))).toBe(true);
      const corrupted = structuredClone(saved); corrupted.familySeed = "tampered";
      await expect(readConstructionFamilySource(corrupted)).rejects.toThrow(/content does not match/);
      const mismatch = structuredClone(saved); mismatch.members[0].documentId = mismatch.members[1].documentId;
      const { contentHash: _hash, ...mismatchInput } = mismatch; void _hash;
      await expect(createConstructionFamilySource(mismatchInput)).rejects.toThrow(/identities must be unique/);
      const wrongMaterial = structuredClone(saved); wrongMaterial.members[0].generation.materialSourceHash = "a".repeat(64);
      const { contentHash: _otherHash, ...wrongInput } = wrongMaterial; void _otherHash;
      await expect(createConstructionFamilySource(wrongInput)).rejects.toThrow(/does not match/);
      const wrongGraph = structuredClone(saved); wrongGraph.members[0].graph = structuredClone(wrongGraph.members[1].graph);
      const { contentHash: _graphHash, ...wrongGraphInput } = wrongGraph; void _graphHash;
      await expect(createConstructionFamilySource(wrongGraphInput)).rejects.toThrow(/identity does not match/);
      const wrongOrigin = structuredClone(saved); wrongOrigin.sourceDocumentId = "different_origin";
      const { contentHash: _originHash, ...wrongOriginInput } = wrongOrigin; void _originHash;
      await expect(createConstructionFamilySource(wrongOriginInput)).rejects.toThrow(/original building must match/);
      const roofOnly = structuredClone(saved);
      roofOnly.members[0].graph.nodes.push({ id: "isolated_scope", type: "FacadeScope", parameters: { widthM: 4, heightM: 4, wallDepthM: 0.3 } });
      roofOnly.members[0].graph.nodes.push({ id: "isolated_wall", type: "EmitWall", input: { nodeId: "isolated_scope", socket: "scope" } });
      const output = roofOnly.members[0].graph.nodes.find(node => node.type === "Output")!;
      output.inputs = [{ nodeId: "isolated_wall", socket: "geometry" }];
      const { contentHash: _roofHash, ...roofOnlyInput } = roofOnly; void _roofHash;
      await expect(createConstructionFamilySource(roofOnlyInput).then(() => true)).rejects.toThrow(/connected whole-building/);
      await expect(readConstructionFamilySource({ ...saved, unexpected: true })).rejects.toThrow();
      await expect(readConstructionFamilySource({ ...saved, schemaVersion: "0.1.0" })).rejects.toThrow(/lacks the original building/);
      expect(materialGeneration).not.toHaveBeenCalled(); materialGeneration.mockRestore();
      const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "seed", policy: { openings: true, frontage: true, roof: true }, openingLock: false });
      const composedAwningFamily = await createConstructionFamilySource({ ...awningInput, initialComposition: composition });
      expect(composedAwningFamily.schemaVersion === "0.8.0" && composedAwningFamily.initialComposition).toEqual(composition);
      await expect(createConstructionFamilySource({ ...awningInput, familySeed: "other", initialComposition: composition })).rejects.toThrow(/retain the family seed/);
      const composed = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
      const composedSource = await createConstructionFamilySource({ ...input, familySeed: "seed", schemaVersion: "0.3.0", initialComposition: composition,
        members: composed.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) });
      const reopened = await readConstructionFamilySource(JSON.parse(JSON.stringify(composedSource)));
      expect(reopened.schemaVersion).toBe("0.3.0");
      if (reopened.schemaVersion === "0.3.0") expect(reopened.initialComposition).toEqual(composition);
      const groupComposition = resolveConstructionFamilyComposition({ schemaVersion: "0.2.0", kind: "construction-family-composition-request", familySeed: "seed",
        policy: { openings: false, frontage: false, roof: false, groupedBays: true }, openingLock: false });
      if (groupComposition.schemaVersion !== "0.2.0") throw new Error("Expected grouped composition");
      const varied = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, groupComposition);
      const groupSource = await createConstructionFamilySource({ ...input, familySeed: "seed", schemaVersion: "0.4.0", initialComposition: groupComposition,
        members: varied.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) });
      const groupedReopen = await readConstructionFamilySource(JSON.parse(JSON.stringify(groupSource)));
      expect(groupedReopen).toEqual(groupSource); expect(groupedReopen.materialSource).toEqual(saved.materialSource);
      const lightPlan = resolveConstructionFamilyComposition({ schemaVersion: "0.3.0", kind: "construction-family-composition-request", familySeed: "seed",
        policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: true }, openingLock: false });
      const storefront = withConstructionStorefront(edited, 1);
      const storefrontPlan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "family", familySeed: "seed", graph: storefront });
      const storefrontFamily = await resolveConstructionFamily(storefrontPlan, lineage, defaultConstructionGenerationControls, undefined, lightPlan);
      const storefrontSource = await createConstructionFamilySource({ ...input, familySeed: "seed", schemaVersion: "0.6.0", sourceGraph: storefront, initialComposition: lightPlan,
        members: storefrontFamily.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) });
      expect(await readConstructionFamilySource(JSON.parse(JSON.stringify(storefrontSource)))).toEqual(storefrontSource);
      await expect(createConstructionFamilySource({ ...storefrontSource, schemaVersion: "0.5.0" })).rejects.toThrow();
      expect(new Set(varied.members.map(member => member.construction.graph.upperBayGroups?.[0]?.memberCount ?? 0))).toEqual(new Set([0, 2, 3]));
      await expect(createConstructionFamilySource({ ...groupSource, schemaVersion: "0.3.0" })).rejects.toThrow();
      const changed = structuredClone(composition); changed.members[0].head = changed.members[0].head === 0 ? 1 : 0;
      await expect(createConstructionFamilySource({ ...input, familySeed: "seed", schemaVersion: "0.3.0", initialComposition: changed,
        members: composedSource.members })).rejects.toThrow(/do not match/);
    } finally { vi.restoreAllMocks(); base.familyRuntime.dispose(); }
  }, 240000);
});
