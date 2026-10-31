import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { resolveConstructionRetainedSignFamilyStudy } from "../state/constructionRetainedSignFamilyStudy";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { ConstructionRetainedSignFamilyStudyReceiptSchema } from "../contracts/constructionRetainedSignFamilyStudy";
import { hashCanonicalJson } from "../core/contentHash";

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
  it("rejects non-roof variation and release of authored choices", async () => {
    const { plan, lineage, composition } = await fixture();
    const mixed = resolveConstructionFamilyComposition({ ...composition.source, policy: { openings: true, frontage: false, roof: true } });
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, mixed)).rejects.toThrow(/roof and massing/);
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, { ...defaultConstructionGenerationControls, preserveAuthored: false }, composition)).rejects.toThrow(/requires preserving/);
    const controller = new AbortController(); controller.abort();
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
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
});
