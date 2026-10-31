import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign, withoutConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { resolveConstructionFamilyPierVariation } from "../core/constructionFamilyPierVariation";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { resolveConstructionRetainedSignFamilyStudy } from "../state/constructionRetainedSignFamilyStudy";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { ConstructionRetainedSignFamilyStudyReceiptSchema } from "../contracts/constructionRetainedSignFamilyStudy";
import { hashCanonicalJson } from "../core/contentHash";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { resolveConstructionGroupedRhythmFamilyStudy } from "../state/constructionGroupedRhythmFamilyStudy";
import { GroupedRhythmFamilyReceiptSchema } from "../contracts/constructionGroupedRhythmFamilyStudy";

async function fixture() {
  const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("family_sign_source"), null, defaultConstructionGenerationControls);
  const template = (await normalizeBuildingSpec(initial.source.intent, stylePack)).spec;
  const materialPlan = await planConstructionReferenceMaterials(template, initial.source);
  const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: initial.source,
    resolution: initial.resolution, materialPlan, materialSourceHash: "a".repeat(64) };
  const storefront = withConstructionStorefront(initial.graph, 1);
  const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "sign_family", familySeed: "sign-family-seed", graph });
  const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "sign-family-seed", openingLock: false,
    policy: { openings: false, frontage: false, roof: true } });
  return { graph, plan, lineage, composition };
}

describe("retained-sign family study", () => {
  it("creates six distinct geometries with the sign, awning and material identity retained", async () => {
    const { graph, plan, lineage, composition } = await fixture(), snapshot = structuredClone(plan);
    const result = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(result.receipt.schemaVersion).toBe("0.1.0");
    expect(plan).toEqual(snapshot); expect(result.members).toHaveLength(6); expect(new Set(result.receipt.members.map(member => member.geometryHash)).size).toBe(6);
    const duplicate = structuredClone(result.receipt); duplicate.members[1].geometryHash = duplicate.members[0].geometryHash;
    expect(ConstructionRetainedSignFamilyStudyReceiptSchema.safeParse(duplicate).success).toBe(false);
    expect(result.receipt.materialSourceHash).toBe(lineage.materialSourceHash); expect(result.receipt.referenceContentHash).toBe(lineage.source.referenceContentHash);
    for (const member of result.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(member.construction.graph.awnings).toEqual(graph.awnings); expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash); expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
      expect(member.construction.ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
    }
    const replay = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(replay.receipt).toEqual(result.receipt);
  }, 120000);
  it("rejects unsupported variation and release of authored choices", async () => {
    const { plan, lineage, composition } = await fixture();
    const mixed = resolveConstructionFamilyComposition({ ...composition.source, policy: { openings: false, frontage: true, roof: true } });
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, mixed)).rejects.toThrow(/additional-awning/);
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, { ...defaultConstructionGenerationControls, preserveAuthored: false }, composition)).rejects.toThrow(/requires preserving/);
    const controller = new AbortController(); controller.abort();
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  }, 120000);
  it("varies upper openings and massing while preserving the signed storefront and opening locks", async () => {
    const { graph, plan, lineage } = await fixture();
    const request = { schemaVersion: "0.4.0" as const, kind: "construction-family-composition-request" as const, familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } };
    const composition = resolveConstructionFamilyComposition(request);
    const result = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(result.receipt.schemaVersion).toBe("0.2.0");
    if (result.receipt.schemaVersion !== "0.2.0") throw new Error("Expected expanded receipt.");
    expect(result.receipt.compositionHash).toBe(await hashCanonicalJson(composition));
    expect(new Set(result.members.map(member => member.construction.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead)).size).toBe(2);
    expect(new Set(result.members.map(member => member.construction.graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout)).size).toBeGreaterThan(1);
    expect(new Set(result.members.map(member => member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count)).size).toBeGreaterThan(1);
    for (const member of result.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports); expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
    }
    expect(() => resolveConstructionFamilyComposition({ ...request, openingLock: true })).toThrow(/Unlock openings/);
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, { ...defaultConstructionGenerationControls, lockOpenings: true }, composition)).rejects.toThrow(/lock|controls/i);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/upperFrontRoundHead", scope: "building", lockedValue: 0, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedResolution = await resolveConstructionGeneration(pinned);
    const pinnedLineage = { ...lineage, source: pinned, resolution: pinnedResolution, materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    expect(pinnedLineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, pinnedLineage, defaultConstructionGenerationControls, composition)).rejects.toThrow(/pinned lock/i);
    const openingsOnly = resolveConstructionFamilyComposition({ ...request, policy: { ...request.policy, massing: false } });
    const openingsResult = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, openingsOnly);
    expect(openingsResult.receipt.schemaVersion).toBe("0.2.0");
  }, 120000);
  it("varies massing without losing the signed storefront or pinned materials", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: false, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const result = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(result.receipt.schemaVersion).toBe("0.2.0");
    if (result.receipt.schemaVersion !== "0.2.0") throw new Error("Expected massing receipt.");
    expect(result.receipt.familySeed).toBe(plan.source.familySeed); expect(result.receipt.compositionHash).toBe(await hashCanonicalJson(composition));
    expect(new Set(result.members.map(member => member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count)).size).toBeGreaterThan(1);
    expect(new Set(result.members.map(member => member.construction.graph.nodes.find(node => node.type === "SplitBays")!.parameters.count)).size).toBeGreaterThan(1);
    for (const member of result.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports); expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(member.lineage.materialSourceHash).toBe(lineage.materialSourceHash);
    }
    const distant = structuredClone(graph); distant.storefrontSign!.bayIndex = 3; distant.awnings![0].bayIndex = 3; distant.awningSupports![0].bayIndex = 3;
    const distantPlan = resolveConstructionFamilyPlan({ ...plan.source, graph: distant });
    await expect(resolveConstructionRetainedSignFamilyStudy(distantPlan, lineage, defaultConstructionGenerationControls, composition)).rejects.toThrow(/retained awning|retain the storefront/i);
  }, 120000);
  it("retains a pinned upper head during signed-building rerolls and a roof-varying family", async () => {
    const { graph, plan, lineage, composition } = await fixture();
    for (const value of [0, 1] as const) {
      const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
        intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/upperFrontRoundHead", scope: "family", lockedValue: value, reason: "Imported pin" }] },
        recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
      const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
      const editedBase = structuredClone(pinnedLineage.resolution.graph);
      editedBase.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead = value === 0 ? 1 : 0;
      await expect(resolveWorkbenchGeneration(editedBase, pinnedLineage, defaultConstructionGenerationControls)).rejects.toThrow(/authored opening head conflicts/i);
      await expect(resolveWorkbenchGeneration(editedBase, pinnedLineage, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: true })).rejects.toThrow(/authored opening head conflicts/i);
      const released = await resolveWorkbenchGeneration(editedBase, pinnedLineage, { ...defaultConstructionGenerationControls, preserveAuthored: false }, true);
      expect(released.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(value);
      expect(released.source.intent.locks).toContainEqual(expect.objectContaining({ semanticPath: "construction/opening/upperFrontRoundHead", lockedValue: value }));
      const matching = structuredClone(graph);
      matching.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead = value;
      const signedPlan = resolveConstructionFamilyPlan({ ...plan.source, graph: matching });
      const result = await resolveConstructionRetainedSignFamilyStudy(signedPlan, pinnedLineage, defaultConstructionGenerationControls, composition);
      for (const member of result.members) {
        expect(member.construction.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(value);
        expect(member.construction.graph.storefrontSign).toEqual(matching.storefrontSign);
        expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
      }
      const conflict = structuredClone(matching);
      conflict.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead = value === 0 ? 1 : 0;
      await expect(resolveConstructionRetainedSignFamilyStudy(resolveConstructionFamilyPlan({ ...plan.source, graph: conflict }), pinnedLineage, defaultConstructionGenerationControls, composition)).rejects.toThrow(/authored opening head conflicts/i);
    }
  }, 120000);
  it("coordinates grouped bays and round heads with massing while retaining the storefront", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: true, storefrontLights: false, massing: true } });
    const result = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    const groups = result.members.flatMap(member => member.construction.graph.upperBayGroups ?? []);
    expect(new Set(groups.map(group => group.memberCount))).toEqual(new Set([2, 3]));
    expect(result.members.some(member => member.construction.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead === 1)).toBe(true);
    for (const member of result.members) {
      const head = member.construction.graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead;
      if (member.construction.graph.upperBayGroups?.length) expect(head).toBe(0);
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign);
      expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    }
    expect(result.receipt.schemaVersion).toBe("0.2.0");
  }, 120000);
  it("adds awnings only to free bays while retaining the signed awning and supports", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.5.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true, awnings: true } });
    const result = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(new Set(result.members.map(member => member.construction.graph.awnings?.length)).size).toBeGreaterThan(1);
    for (const member of result.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign);
      expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports);
      expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(member.construction.graph.awnings).toContainEqual(graph.awnings![0]);
      expect(member.construction.graph.awnings!.filter(awning => awning.bayIndex === graph.storefrontSign!.bayIndex)).toHaveLength(1);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    }
    const snapshot = structuredClone(result.receipt);
    expect((await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition)).receipt).toEqual(snapshot);
  }, 120000);
  it("varies facade piers while retaining the signed storefront and records its policy", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: false, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const variation = resolveConstructionFamilyPierVariation({ schemaVersion: "0.1.0", kind: "construction-family-pier-variation-request", familySeed: plan.source.familySeed, enabled: true, openingLock: false });
    const family = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, undefined, variation);
    expect(family.receipt.schemaVersion).toBe("0.3.0");
    if (family.receipt.schemaVersion !== "0.3.0") throw new Error("Expected pier variation receipt.");
    expect(family.receipt.pierVariationHash).toBe(await hashCanonicalJson(variation));
    expect(new Set(variation.members.map(member => member.treatment))).toEqual(new Set(["none", "slender", "projecting"]));
    for (const [index, member] of family.members.entries()) {
      expect(Boolean(member.construction.graph.facadePiers)).toBe(variation.members[index].treatment !== "none");
      expect(member.construction.ir.meshBatches.some(batch => batch.role === "facade-pier")).toBe(variation.members[index].treatment !== "none");
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports); expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    }
    expect((await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, undefined, variation)).receipt).toEqual(family.receipt);
    const mismatched = resolveConstructionFamilyPierVariation({ ...variation.source, familySeed: "another-seed" });
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, undefined, mismatched)).rejects.toThrow(/seed/);
    const directive = { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 };
    const authored = withConstructionSignAwningClearance(withConstructionStorefrontSign(withConstructionFacadePiers(withoutConstructionStorefrontSign(graph), directive), graph.storefrontSign!), graph.signAwningGapM!);
    const retained = await resolveConstructionRetainedSignFamilyStudy(resolveConstructionFamilyPlan({ ...plan.source, graph: authored }), lineage, defaultConstructionGenerationControls, composition, undefined, variation);
    expect(retained.members.every(member => JSON.stringify(member.construction.graph.facadePiers) === JSON.stringify(directive))).toBe(true);
  }, 120000);
  it("varies storefront glazing on a signed family without overwriting authored divisions", async () => {
    const { lineage } = await fixture();
    const storefront = withConstructionStorefront(createBuildingConstructionGraph("family_sign_source"), 1);
    const piers = withConstructionFacadePiers(storefront, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    const awnings = withConstructionAwnings(piers, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
    expect(graph.storefrontDivision).toBeUndefined();
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "signed_lights", familySeed: "sign-family-seed", graph });
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: false, frontage: false, roof: true, groupedBays: false, storefrontLights: true, massing: false } });
    const family = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    expect(new Set(family.members.map(member => JSON.stringify(member.construction.graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 }))).size).toBeGreaterThan(1);
    for (const member of family.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.construction.graph.awningSupports).toEqual(graph.awningSupports); expect(member.construction.graph.facadePiers).toEqual(graph.facadePiers);
      expect(member.construction.graph.signAwningGapM).toBe(graph.signAwningGapM); expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
    }
    expect((await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition)).receipt).toEqual(family.receipt);
    const authored = withConstructionStorefrontDivision(graph, { displayLights: 2, transomLights: 3 });
    await expect(resolveConstructionRetainedSignFamilyStudy(resolveConstructionFamilyPlan({ ...plan.source, graph: authored }), lineage, defaultConstructionGenerationControls, composition)).rejects.toThrow(/cannot overwrite authored divisions/);
    const authoredDefault = withConstructionStorefrontDivision(graph, { displayLights: 1, transomLights: 1 });
    await expect(resolveConstructionRetainedSignFamilyStudy(resolveConstructionFamilyPlan({ ...plan.source, graph: authoredDefault }), lineage, defaultConstructionGenerationControls, composition)).rejects.toThrow(/cannot overwrite authored divisions/);
  }, 120000);
  it("records final source-aware rhythm geometry across a mixed-head family", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const policy = { schemaVersion: "0.1.0" as const, kind: "construction-grouped-rhythm-family-policy" as const, scope: "all-upper-front" as const,
      memberCount: 2 as const, memberWidthM: 0.55, pierWidthM: 0.24 };
    const original = structuredClone(plan), base = await resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition);
    const result = await resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, policy);
    expect(plan).toEqual(original); expect(result.receipt.policyHash).toBe(await hashCanonicalJson(policy));
    expect(result.receipt.baseReceiptHash).toBe(await hashCanonicalJson(base.receipt));
    expect(result.members.filter(member => member.applied)).toHaveLength(3);
    for (const [index, member] of result.members.entries()) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign); expect(member.construction.graph.awnings).toEqual(graph.awnings);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
      expect(result.receipt.members[index].graphHash).toBe(member.construction.ir.sourceGraphHash);
      expect(result.receipt.members[index].geometryHash).toBe(member.geometryHash);
      if (member.applied) {
        expect(member.geometryHash).not.toBe(base.members[index].geometryHash);
        const floors = member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count;
        const bays = member.construction.graph.nodes.find(node => node.type === "SplitBays")!.parameters.count;
        expect(member.construction.graph.upperBayGroups).toHaveLength((floors - 1) * bays);
      } else expect(member.geometryHash).toBe(base.members[index].geometryHash);
    }
    expect((await resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, policy)).receipt).toEqual(result.receipt);
    const malformed = structuredClone(result.receipt); malformed.members[1].geometryHash = malformed.members[0].geometryHash;
    expect(GroupedRhythmFamilyReceiptSchema.safeParse(malformed).success).toBe(false);
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, { ...policy, memberWidthM: 20 })).rejects.toThrow();
    const overlapping = resolveConstructionFamilyComposition({ ...composition.source, policy: { ...composition.source.policy, groupedBays: true } });
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, overlapping, policy)).rejects.toThrow(/conflicts with an existing grouped bay/);
    const old = lineage.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/upperFrontRoundHead", scope: "family", lockedValue: 0, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(lineage.materialPlan.templateSpec, pinned) };
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, pinnedLineage, defaultConstructionGenerationControls, composition, policy)).rejects.toThrow(/pinned lock/);
    const controller = new AbortController(); controller.abort();
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, policy, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  }, 120000);
  it("limits grouped rhythm to the top upper storey with a versioned policy", async () => {
    const { graph, plan, lineage } = await fixture();
    const composition = resolveConstructionFamilyComposition({ schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed: plan.source.familySeed, openingLock: false,
      policy: { openings: true, frontage: false, roof: true, groupedBays: false, storefrontLights: false, massing: true } });
    const policy = { schemaVersion: "0.2.0" as const, kind: "construction-grouped-rhythm-family-policy" as const, scope: "top-upper-front" as const,
      memberCount: 2 as const, memberWidthM: 0.55, pierWidthM: 0.24 };
    const family = await resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, policy);
    expect(family.receipt.policyHash).toBe(await hashCanonicalJson(policy));
    expect(family.members.filter(member => member.applied)).toHaveLength(3);
    for (const member of family.members) {
      expect(member.construction.graph.storefrontSign).toEqual(graph.storefrontSign);
      expect(member.lineage.materialPlan.materialInputsHash).toBe(lineage.materialPlan.materialInputsHash);
      if (member.applied) {
        const floors = member.construction.graph.nodes.find(node => node.type === "Storeys")!.parameters.count;
        const bays = member.construction.graph.nodes.find(node => node.type === "SplitBays")!.parameters.count;
        expect(member.construction.graph.upperBayGroups).toHaveLength(bays);
        expect(member.construction.graph.upperBayGroups!.every(group => group.floorIndex === floors - 1)).toBe(true);
      }
    }
    expect((await resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, policy)).receipt).toEqual(family.receipt);
    await expect(resolveConstructionGroupedRhythmFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, { ...policy, schemaVersion: "0.1.0" })).rejects.toThrow();
  }, 120000);
});
