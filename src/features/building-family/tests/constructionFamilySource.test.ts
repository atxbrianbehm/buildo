import { describe, expect, it, vi } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { createConstructionFamilySource, readConstructionFamilySource } from "../state/constructionFamilySource";
import { createBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createReferenceConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";

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
      const input = { schemaVersion: "0.1.0" as const, kind: "construction-family-source" as const, familyId: "family", sourceDocumentId: "authored", familySeed: "seed",
        materialSource: generatedMaterials.materials.file, members: family.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) };
      const materialGeneration = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
      const pending = createConstructionFamilySource(input);
      input.familySeed = "changed-after-call";
      const saved = await pending;
      expect(saved.familySeed).toBe("seed");
      expect(saved.members).toHaveLength(6);
      expect(saved.members.every(member => member.generation.materialSourceHash === saved.materialSource.contentHash)).toBe(true);
      const restored = await readConstructionFamilySource(JSON.parse(JSON.stringify(saved)));
      expect(restored.contentHash).toBe(saved.contentHash);
      expect(restored.members.map(member => member.graph.documentId)).toEqual(family.members.map(member => member.documentId));
      for (const member of restored.members) {
        expect(member.graph.nodes.find(node => node.type === "EditOpeningWidth")?.overrides).toEqual([{ target: { ...target, documentId: member.documentId }, widthM: 1.8 }]);
        const project = await createBayConstructionProject(member.graph, restored.materialSource, member.generation);
        expect(project.materialSource.contentHash).toBe(restored.materialSource.contentHash);
      }
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
      const roofOnly = structuredClone(saved);
      roofOnly.members[0].graph.nodes.push({ id: "isolated_scope", type: "FacadeScope", parameters: { widthM: 4, heightM: 4, wallDepthM: 0.3 } });
      roofOnly.members[0].graph.nodes.push({ id: "isolated_wall", type: "EmitWall", input: { nodeId: "isolated_scope", socket: "scope" } });
      const output = roofOnly.members[0].graph.nodes.find(node => node.type === "Output")!;
      output.inputs = [{ nodeId: "isolated_wall", socket: "geometry" }];
      const { contentHash: _roofHash, ...roofOnlyInput } = roofOnly; void _roofHash;
      await expect(createConstructionFamilySource(roofOnlyInput).then(() => true)).rejects.toThrow(/connected whole-building/);
      await expect(readConstructionFamilySource({ ...saved, unexpected: true })).rejects.toThrow();
      expect(materialGeneration).not.toHaveBeenCalled(); materialGeneration.mockRestore();
    } finally { vi.restoreAllMocks(); base.familyRuntime.dispose(); }
  }, 180000);
});
