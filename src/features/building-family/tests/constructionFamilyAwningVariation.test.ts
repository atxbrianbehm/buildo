import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { applyConstructionFamilyAwningVariation, readConstructionFamilyCompositionPlan, resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("varies extra awnings deterministically without overwriting the authored bay", async () => {
  const input = { schemaVersion: "0.5.0", kind: "construction-family-composition-request", familySeed: "awning-seed", openingLock: false,
    policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: true } };
  const plan = resolveConstructionFamilyComposition(input);
  expect(readConstructionFamilyCompositionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  expect(resolveConstructionFamilyComposition(input)).toEqual(plan);
  expect(() => resolveConstructionFamilyComposition({ ...input, openingLock: true })).toThrow(/Unlock openings/);
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 0, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]);
  const variants = Array.from({ length: 6 }, (_, i) => applyConstructionFamilyAwningVariation(graph, plan, i + 1));
  expect(new Set(variants.map(variant => variant.awnings!.length))).toEqual(new Set([1, 2, 3]));
  for (const variant of variants) {
    expect(variant.awnings!.find(awning => awning.bayIndex === 0)).toEqual(graph.awnings![0]);
    expect(new Set(variant.awnings!.map(awning => awning.bayIndex)).size).toBe(variant.awnings!.length);
    const result = await evaluateConstruction(variant);
    expect(result.ir.meshBatches.filter(batch => batch.role === "awning.canopy")).toHaveLength(variant.awnings!.length);
  }
  const tampered = structuredClone(plan); if (tampered.schemaVersion !== "0.5.0") throw new Error("Expected v5"); tampered.members[0].bayOffset = (tampered.members[0].bayOffset! + 1) % 20;
  expect(() => readConstructionFamilyCompositionPlan(tampered)).toThrow(/do not match/);
});
