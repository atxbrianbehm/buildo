import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { resolveConstructionSignGenerationStudy } from "../state/constructionSignGenerationStudy";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";

const combined = () => {
  const base = withConstructionStorefront(createBuildingConstructionGraph("sign_generation_study"), 1);
  const awnings = withConstructionAwnings(base, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const pierced = withConstructionFacadePiers(supported, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
  return withConstructionSignAwningClearance(withConstructionStorefrontSign(pierced, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
};

describe("retained sign generation study", () => {
  it("replays and rerolls while preserving the authored combined treatment", async () => {
    const graph = combined(), snapshot = structuredClone(graph), controls = { ...defaultConstructionGenerationControls, preserveAuthored: true };
    const first = await resolveConstructionSignGenerationStudy(graph, null, controls), replay = await resolveConstructionSignGenerationStudy(graph, null, controls);
    expect(replay).toEqual(first); expect(graph).toEqual(snapshot);
    const rerolled = await resolveConstructionSignGenerationStudy(graph, null, controls, true);
    expect(rerolled.source.intent.seeds.building).not.toBe(first.source.intent.seeds.building);
    for (const result of [first, rerolled]) {
      expect(result.graph.storefrontSign).toEqual(graph.storefrontSign); expect(result.graph.signAwningGapM).toBe(graph.signAwningGapM);
      expect(result.graph.awnings).toEqual(graph.awnings); expect(result.graph.awningSupports).toEqual(graph.awningSupports); expect(result.graph.facadePiers).toEqual(graph.facadePiers);
      const compiled = await evaluateConstruction(result.graph);
      expect(compiled.ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
      expect(compiled.ir.meshBatches.some(batch => batch.role === "awning.support")).toBe(true);
    }
    expect(first.source.reference.architectureCoverage).toBe("unknown");
    await expect(resolveWorkbenchGeneration(graph, null, controls)).rejects.toThrow(/not yet supported/);
    await expect(resolveConstructionSignGenerationStudy(graph, null, { ...controls, preserveAuthored: false })).rejects.toThrow(/requires preserving/);
  });
  it("rejects generated layouts that cannot retain the authored bay", async () => {
    const base = withConstructionStorefront(createBuildingConstructionGraph("distant_sign"), 1);
    const initial = await resolveWorkbenchGeneration(base, null, { ...defaultConstructionGenerationControls, bayCount: 6 });
    const template = (await normalizeBuildingSpec(initial.source.intent, stylePack)).spec;
    const previous = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: initial.source, resolution: initial.resolution,
      materialPlan: await planConstructionReferenceMaterials(template, initial.source), materialSourceHash: "a".repeat(64) };
    const graph = withConstructionStorefrontSign(initial.graph, { bayIndex: 5, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 });
    await evaluateConstruction(graph);
    const locked = structuredClone(previous); locked.source.intent.locks.push({ semanticPath: "construction/storefrontSign/heightM", scope: "building", lockedValue: 0.4, reason: "Imported pin" });
    await expect(resolveConstructionSignGenerationStudy(graph, locked, defaultConstructionGenerationControls)).rejects.toThrow(/Imported sign, awning and pier locks/);
    await expect(resolveConstructionSignGenerationStudy(graph, previous, { ...defaultConstructionGenerationControls, bayCount: 3, preserveAuthored: true })).rejects.toThrow(/retained sign/i);
  });
});
