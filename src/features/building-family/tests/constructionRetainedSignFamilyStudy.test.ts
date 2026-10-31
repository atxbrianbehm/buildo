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
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, mixed)).rejects.toThrow(/roof-only/);
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, { ...defaultConstructionGenerationControls, preserveAuthored: false }, composition)).rejects.toThrow(/requires preserving/);
    const controller = new AbortController(); controller.abort();
    await expect(resolveConstructionRetainedSignFamilyStudy(plan, lineage, defaultConstructionGenerationControls, composition, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  }, 120000);
});
