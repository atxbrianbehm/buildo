import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
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
  it("generates seeded entrance positions while protecting authored and pinned choices", async () => {
    const { lineage, graph } = await fixture();
    const storefront = withConstructionStorefront(graph, 1);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "entrance_family", familySeed: "entrance-seed", graph: storefront });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.6.0", kind: "construction-family-composition-request", familySeed: "entrance-seed", openingLock: false,
      policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: false, entranceBay: true } });
    if (composition.schemaVersion !== "0.6.0") throw new Error("Wrong plan version");
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
    for (const [index, member] of family.members.entries()) {
      const graph = member.construction.graph, bays = graph.nodes.find(node => node.type === "SplitBays")!.parameters.count;
      expect(graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex).toBe(composition.members[index].entranceOffset! % bays);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    }
    expect(new Set(family.members.map(member => member.construction.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex)).size).toBeGreaterThan(1);
    const edited = structuredClone(storefront); edited.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex = 0;
    await expect(resolveConstructionFamily(resolveConstructionFamilyPlan({ ...plan.source, graph: edited }), lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/authored entrance/);
    const awning = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    await expect(resolveConstructionFamily(resolveConstructionFamilyPlan({ ...plan.source, graph: awning }), lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/authored awnings/);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/entrance/bayIndex", scope: "building", lockedValue: 1, reason: "Imported pin" }] }, recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    await expect(resolveConstructionFamily(plan, pinnedLineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/conflicts with the pinned lock/);
  }, 120000);
  it("generates massing through each member's source and respects count constraints", async () => {
    const { lineage, graph } = await fixture();
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "massing_family", familySeed: "massing-seed", graph });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: "massing-seed",
      policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: true }, openingLock: false });
    if (composition.schemaVersion !== "0.4.0") throw new Error("Wrong plan version");
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
    for (const [index, member] of family.members.entries()) {
      const choice = composition.members[index].massing!;
      expect(member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count).toBe(choice.floorCount);
      expect(member.construction.graph.nodes.find(node => node.type === "SplitBays")!.parameters.count).toBe(choice.bayCount);
      expect(member.lineage.source.intent.requested).toMatchObject(choice);
      expect(member.lineage.resolution.graph.nodes.find(node => node.type === "Storeys")!.parameters.count).toBe(choice.floorCount);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
    }
    expect(new Set(family.members.map(member => member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count))).toEqual(new Set([2, 3, 4]));
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls, lockStoreys: true }, undefined, composition)).rejects.toThrow(/Unlock footprint and storeys/);
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls, lockFootprint: true }, undefined, composition)).rejects.toThrow(/Unlock footprint and storeys/);
    const edited = structuredClone(graph); edited.nodes.find(node => node.type === "Storeys")!.parameters.count = 4;
    await expect(resolveConstructionFamily(resolveConstructionFamilyPlan({ ...plan.source, graph: edited }), lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/cannot overwrite authored/);
    const grouped = withConstructionGroupedBays(graph, [{ storeysNodeId: "facade", floorIndex: 2, bayIndex: 0, memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 }]);
    await expect(resolveConstructionFamily(resolveConstructionFamilyPlan({ ...plan.source, graph: grouped }), lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/retained grouped bay/);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/facade/count", scope: "building", lockedValue: 3, reason: "Imported pin" }] }, recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    await expect(resolveConstructionFamily(plan, pinnedLineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/conflicts with the pinned lock/);
  }, 120000);
  it("generates diverse storefront lights and refuses authored divisions and imported opening pins", async () => {
    const { lineage, graph } = await fixture();
    const storefront = withConstructionStorefront(graph, 1);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "lights_family", familySeed: "lights-seed", graph: storefront });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.3.0", kind: "construction-family-composition-request", familySeed: "lights-seed",
      policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: true }, openingLock: false });
    if (composition.schemaVersion !== "0.3.0") throw new Error("Wrong plan version");
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
    expect(family.members.map(member => member.construction.graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 })).toEqual(composition.members.map(member => member.storefrontLights));
    const authored = withConstructionStorefrontDivision(storefront, { displayLights: 2, transomLights: 3 });
    const authoredPlan = resolveConstructionFamilyPlan({ ...plan.source, graph: authored });
    await expect(resolveConstructionFamily(authoredPlan, lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/cannot overwrite/);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/widthM", scope: "building", lockedValue: 1.22, reason: "Imported pin" }] }, recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    await expect(resolveConstructionFamily(plan, pinnedLineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/conflicts with the pinned lock/);
  }, 120000);
  it("retains divided storefronts for all family members and rejects conflicting frontage variation", async () => {
    const { lineage, graph } = await fixture();
    const authored = withConstructionStorefrontDivision(withConstructionStorefront(graph, 1), { displayLights: 2, transomLights: 3 });
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "storefront_family", familySeed: "storefront-seed", graph: authored });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls);
    expect(family.members).toHaveLength(6);
    for (const member of family.members) expect(member.construction.graph.storefrontDivision).toEqual(authored.storefrontDivision);
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "storefront-seed", policy: { openings: false, frontage: true, roof: false }, openingLock: false });
    await expect(resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/cannot currently coexist/);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input",
      documentId: old.documentId, intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/widthM", scope: "building", lockedValue: 1.22, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    const retained = await resolveWorkbenchGeneration(authored, pinnedLineage, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: false });
    expect(retained.graph.storefrontDivision).toEqual(authored.storefrontDivision);
  }, 120000);
  it("keeps authored groups while varying an available bay and rejects pinned opening locks", async () => {
    const { lineage, graph } = await fixture();
    const authored = withConstructionGroupedBays(graph, [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.5, pierWidthM: 0.24 }]);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "grouped_family", familySeed: "family-one", graph: authored });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.2.0", kind: "construction-family-composition-request", familySeed: "family-one",
      policy: { openings: false, frontage: false, roof: false, groupedBays: true }, openingLock: false });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
    expect(family.members.every(member => member.construction.graph.upperBayGroups?.[0].bayIndex === 0)).toBe(true);
    expect(family.members.some(member => member.construction.graph.upperBayGroups?.[1]?.bayIndex === 1)).toBe(true);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input",
      documentId: old.documentId, intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/widthM", scope: "building", lockedValue: 1.22, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned),
      materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned, lineage.materialPlan.options) };
    await expect(resolveConstructionFamily(plan, pinnedLineage, defaultConstructionGenerationControls, undefined, composition)).rejects.toThrow(/pinned lock/);
    const coordinated = resolveConstructionFamilyComposition({ schemaVersion: "0.2.0", kind: "construction-family-composition-request", familySeed: "family-one",
      policy: { openings: true, frontage: false, roof: false, groupedBays: true }, openingLock: false });
    await expect(resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, coordinated)).rejects.toThrow(/cannot currently coexist/);
  }, 90000);
  it("generates recorded architectural compositions without replacing material lineage", async () => {
    const { lineage, plan } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed,
      policy: { openings: true, frontage: true, roof: true }, openingLock: false });
    const family = await resolveConstructionFamily(plan, lineage, defaultConstructionGenerationControls, undefined, composition);
    for (const [index, member] of family.members.entries()) {
      const graph = member.construction.graph, choice = composition.members[index];
      expect(graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(choice.head);
      expect(graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(choice.sash);
      expect(graph.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(choice.frontage);
      expect(graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.corniceAssembly).toBe(choice.cornice);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
    }
    expect(new Set(family.members.map(member => member.geometryHash)).size).toBe(6);
    await expect(resolveConstructionFamily(plan, lineage, { ...defaultConstructionGenerationControls, lockOpenings: true }, undefined, composition)).rejects.toThrow(/opening-lock state/);
  }, 90000);
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
