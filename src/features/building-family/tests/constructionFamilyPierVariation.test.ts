import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { applyConstructionFamilyPierVariation, readConstructionFamilyPierVariation, resolveConstructionFamilyPierVariation } from "../core/constructionFamilyPierVariation";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";

const request = { schemaVersion: "0.1.0", kind: "construction-family-pier-variation-request", familySeed: "main-street", enabled: true, openingLock: false };

describe("family pier variation study", () => {
  it("replays a balanced, seeded choice and rejects altered or locked plans", () => {
    const plan = resolveConstructionFamilyPierVariation(request);
    expect(readConstructionFamilyPierVariation(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(plan.members.map(member => member.treatment).sort()).toEqual(["none", "none", "projecting", "projecting", "slender", "slender"]);
    const altered = structuredClone(plan); altered.members[0].treatment = altered.members[0].treatment === "none" ? "slender" : "none";
    expect(() => readConstructionFamilyPierVariation(altered)).toThrow(/source and seed/);
    expect(() => resolveConstructionFamilyPierVariation({ ...request, openingLock: true })).toThrow(/Unlock openings/);
    expect(resolveConstructionFamilyPierVariation({ ...request, enabled: false, openingLock: true }).members.every(member => member.treatment === null)).toBe(true);
  });
  it("adds real geometry while retaining authored choices and leaving the input untouched", async () => {
    const plan = resolveConstructionFamilyPierVariation(request), graph = createBuildingConstructionGraph("family_pier_study"), original = structuredClone(graph);
    const authored = withConstructionFacadePiers(graph, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    for (const member of plan.members) {
      const result = applyConstructionFamilyPierVariation(graph, plan, member.ordinal), compiled = await evaluateConstruction(result);
      expect(compiled.ir.meshBatches.some(batch => batch.role === "facade-pier")).toBe(member.treatment !== "none");
      expect(applyConstructionFamilyPierVariation(authored, plan, member.ordinal)).toEqual(authored);
    }
    expect(graph).toEqual(original);
    expect(() => applyConstructionFamilyPierVariation(graph, plan, 0)).toThrow(/existing family member/);
  }, 120000);
});
