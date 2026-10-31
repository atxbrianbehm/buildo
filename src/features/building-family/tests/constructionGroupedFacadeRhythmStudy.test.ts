import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { compileConstructionGroupedFacadeRhythmStudy, compileSourceAwareGroupedFacadeRhythmStudy } from "../state/constructionGroupedFacadeRhythmStudy";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";

function fixture(documentId = "rhythm_study") {
  const storefront = withConstructionStorefront(createBuildingConstructionGraph(documentId), 1);
  const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(awnings, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  return { schemaVersion: "0.1.0" as const, kind: "construction-grouped-facade-rhythm-study" as const, graph,
    firstFloor: 1, lastFloor: 2, firstBay: 0, lastBay: 3, memberCount: 2 as const, memberWidthM: 0.6, pierWidthM: 0.24 };
}

describe("grouped facade rhythm study", () => {
  it("compiles a deterministic two-storey rhythm while retaining the signed storefront", async () => {
    const request = fixture(), original = structuredClone(request);
    const result = await compileConstructionGroupedFacadeRhythmStudy(request);
    expect(request).toEqual(original);
    expect(result.graph.upperBayGroups).toHaveLength(8);
    expect(result.graph.storefrontSign).toEqual(request.graph.storefrontSign);
    expect(result.graph.awnings).toEqual(request.graph.awnings);
    expect(result.graph.signAwningGapM).toBe(request.graph.signAwningGapM);
    expect(result.construction.ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
    expect((await compileConstructionGroupedFacadeRhythmStudy(request)).construction.ir.sourceGraphHash).toBe(result.construction.ir.sourceGraphHash);
  });
  it("rejects invalid extents, overlapping authored groups and invalid physical fit", async () => {
    const request = fixture();
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, lastFloor: 20 })).rejects.toThrow(/range/);
    const first = await compileConstructionGroupedFacadeRhythmStudy(request);
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, graph: first.graph })).rejects.toThrow(/conflicts/);
    const edited = structuredClone(request.graph), edits = edited.nodes.find(node => node.type === "EditOpeningWidth")!;
    edits.overrides.push({ target: { documentId: edited.documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 1 }, widthM: 1.1 });
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, graph: edited })).rejects.toThrow(/local width edit/);
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, memberWidthM: 20 })).rejects.toThrow();
  });
  it("requires the new explicit request version to group round heads", async () => {
    const request = fixture(), graph = structuredClone(request.graph);
    graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead = 1;
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, graph })).rejects.toThrow(/flat upper openings/);
    const result = await compileConstructionGroupedFacadeRhythmStudy({ ...request, graph, schemaVersion: "0.2.0", allowRoundHeads: true });
    expect(result.graph.upperBayGroups).toHaveLength(8);
    expect(result.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
    expect(result.graph.storefrontSign).toEqual(graph.storefrontSign);
  });
  it("replays source lineage and protects imported and workbench opening locks", async () => {
    const request = fixture();
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph(request.graph.documentId), null, defaultConstructionGenerationControls);
    const template = (await normalizeBuildingSpec(initial.source.intent, stylePack)).spec;
    const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: initial.source,
      resolution: initial.resolution, materialPlan: await planConstructionReferenceMaterials(template, initial.source), materialSourceHash: "a".repeat(64) };
    const snapshot = structuredClone(lineage);
    const result = await compileSourceAwareGroupedFacadeRhythmStudy(request, lineage, { lockOpenings: false });
    expect(result.graph.upperBayGroups).toHaveLength(8); expect(lineage).toEqual(snapshot);
    await expect(compileSourceAwareGroupedFacadeRhythmStudy(request, lineage, { lockOpenings: true })).rejects.toThrow(/Unlock openings/);
    await expect(compileSourceAwareGroupedFacadeRhythmStudy(fixture("different-document"), lineage, { lockOpenings: false })).rejects.toThrow(/same document/);
    for (const [semanticPath, lockedValue] of [["construction/opening/widthM", 1.22], ["construction/opening/upperFrontRoundHead", 0]] as const) {
      const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
        intent: { ...old.intent, locks: [{ semanticPath, scope: "family", lockedValue, reason: "Imported pin" }] },
        recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
      const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(template, pinned) };
      await expect(compileSourceAwareGroupedFacadeRhythmStudy(request, pinnedLineage, { lockOpenings: false })).rejects.toThrow(/pinned lock/);
    }
    const old = lineage.source, roofPinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/roof/parapetHeightM", scope: "family", lockedValue: 0.6, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const roofLineage = { ...lineage, source: roofPinned, resolution: await resolveConstructionGeneration(roofPinned), materialPlan: await planConstructionReferenceMaterials(template, roofPinned) };
    expect(roofLineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    const matchingRoof = structuredClone(request); matchingRoof.graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetHeightM = 0.6;
    expect((await compileSourceAwareGroupedFacadeRhythmStudy(matchingRoof, roofLineage, { lockOpenings: false })).graph.upperBayGroups).toHaveLength(8);
    const mismatchedRoof = structuredClone(matchingRoof); mismatchedRoof.graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetHeightM = 0.8;
    await expect(compileSourceAwareGroupedFacadeRhythmStudy(mismatchedRoof, roofLineage, { lockOpenings: false })).rejects.toThrow(/does not retain the pinned lock/);
    const tampered = structuredClone(lineage); tampered.resolution.graph.documentId = "tampered";
    await expect(compileSourceAwareGroupedFacadeRhythmStudy(request, tampered, { lockOpenings: false })).rejects.toThrow();
  }, 120000);
});
