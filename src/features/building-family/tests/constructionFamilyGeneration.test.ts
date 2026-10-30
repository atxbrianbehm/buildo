import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";

async function fixture() {
  const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("authored"), null, defaultConstructionGenerationControls);
  const template = (await normalizeBuildingSpec(initial.source.intent, stylePack)).spec;
  const materialPlan = await planConstructionReferenceMaterials(template, initial.source);
  const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: initial.source,
    resolution: initial.resolution, materialPlan, materialSourceHash: "a".repeat(64) };
  const graph = withConstructionParapetSilhouette(withConstructionCorniceLayout(initial.graph, 2), 1);
  const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "town_family", familySeed: "family-one", graph });
  return { initial, lineage, graph, plan };
}

describe("authored construction family generation", () => {
  it("compiles six reproducible distinct buildings while preserving roof choices and pinned materials", async () => {
    const { lineage, graph, plan } = await fixture(), before = structuredClone({ plan, lineage, graph });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    expect(family.members).toHaveLength(6); expect(new Set(family.members.map(member => member.geometryHash)).size).toBe(6);
    expect(new Set(family.members.map(member => member.shapeHash)).size).toBe(6);
    for (const member of family.members) {
      expect(member.construction.ir.buildingId).toBe(member.documentId);
      expect(member.lineage.source.documentId).toBe(member.documentId);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
      expect(member.lineage.source.referenceContentHash).toBe(lineage.source.referenceContentHash);
      const roof = member.construction.graph.nodes.find(node => node.type === "BuildingRoof")!;
      expect(roof.parameters.corniceAssembly).toBe(2); expect(roof.parameters.parapetSilhouette).toBe(1);
    }
    expect({ plan, lineage, graph }).toEqual(before);
    const repeat = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    expect(repeat.receipt).toEqual(family.receipt);
  }, 90000);

  it("retains local opening, window and storefront choices with rebased targets in every member", async () => {
    const { lineage, graph } = await fixture();
    const target = { documentId: graph.documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 2 };
    const edited = withConstructionOpeningWidth(withConstructionStorefront(withConstructionWindowLayout(graph, "window", 2), 1), { target, widthM: 1.8 });
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "edited_family", familySeed: "seed-edited", graph: edited });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    for (const member of family.members) {
      const g = member.construction.graph;
      expect(g.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(2);
      expect(g.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(1);
      expect(g.nodes.find(node => node.type === "EditOpeningWidth")!.overrides).toEqual([{ target: { ...target, documentId: member.documentId }, widthM: 1.8 }]);
    }
  }, 90000);

  it("retains a rebased surface composition without replacing the source", async () => {
    const { lineage, graph } = await fixture();
    const compiled = await evaluateConstruction(graph);
    const semantic = compiled.ir.semanticIndex.find(entry => entry.semanticPath.includes("/floor/1/bay/2/frame"));
    expect(semantic).toBeDefined();
    const composition = { ...emptyConstructionComposition(graph.documentId),
      sources: [{ id: "finish", slotId: "frame.primary", atlasContentHash: "a".repeat(64) }],
      layers: [{ id: "local-finish", sourceId: "finish", target: { kind: "element" as const,
        relativePath: semantic!.semanticPath.slice(`building/${graph.documentId}/`.length), expectedRole: "frame" as const },
        mask: { kind: "constant" as const, value: 1 }, opacity: 1, blend: "replace" as const,
        physicalSizeM: { width: 1, height: 1 }, channels: ["baseColor" as const] }] };
    const edited = setConstructionSurface(graph, composition), before = structuredClone(edited);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "surface_family", familySeed: "seed-surface", graph: edited });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    for (const member of family.members) {
      const surface = member.construction.graph.nodes.find(node => node.type === "SetSurface");
      expect(surface?.composition).toEqual({ ...composition, documentId: member.documentId });
    }
    expect(edited).toEqual(before);
  });

  it("rejects a missing local surface target instead of silently dropping the finish", async () => {
    const { lineage, graph } = await fixture();
    const composition = { ...emptyConstructionComposition(graph.documentId),
      sources: [{ id: "finish", slotId: "frame.primary", atlasContentHash: "a".repeat(64) }],
      layers: [{ id: "local-finish", sourceId: "finish", target: { kind: "element" as const, relativePath: "node/missing/frame", expectedRole: "frame" as const },
        mask: { kind: "constant" as const, value: 1 }, opacity: 1, blend: "replace" as const,
        physicalSizeM: { width: 1, height: 1 }, channels: ["baseColor" as const] }] };
    const edited = setConstructionSurface(graph, composition), before = structuredClone(edited);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "missing_surface", familySeed: "seed", graph: edited });
    await expect(resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls)).rejects.toThrow(/no longer contains the target.*local-finish/);
    expect(edited).toEqual(before);
  });

  it("rejects different material seeds, non-preserving choices, altered plans, and cancellation", async () => {
    const { lineage, plan } = await fixture();
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls, materialSeed: "different" })).rejects.toThrow(/pinned material/);
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls, preserveAuthored: false })).rejects.toThrow(/preserving authored/);
    const altered = structuredClone(plan); altered.members[0].buildingSeed = "fake";
    await expect(resolveConstructionFamily(altered, lineage, defaultConstructionGenerationControls)).rejects.toThrow(/does not match/);
    const controller = new AbortController(); controller.abort();
    await expect(resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const pending = new AbortController();
    const result = resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, pending.signal);
    pending.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports insufficient variation when locked dimensions cannot yield a family", async () => {
    const { lineage, plan } = await fixture(), before = structuredClone({ lineage, plan });
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls,
      lockFootprint: true, lockStoreys: true, lockOpenings: true })).rejects.toThrow(/could not produce distinct geometry/);
    expect({ lineage, plan }).toEqual(before);
  }, 90000);
});
