import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { applyConstructionFamilyComposition, readConstructionFamilyCompositionPlan, resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("replays seeded entrance placement as real storefront geometry without mutating its source", async () => {
  const input = { schemaVersion: "0.6.0", kind: "construction-family-composition-request", familySeed: "entrance-family", openingLock: false,
    policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: false, entranceBay: true } };
  const plan = resolveConstructionFamilyComposition(input);
  if (plan.schemaVersion !== "0.6.0") throw new Error("Expected v6");
  expect(readConstructionFamilyCompositionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  const base = withConstructionStorefront(createBuildingConstructionGraph(), 1), snapshot = structuredClone(base);
  const variants = Array.from({ length: 6 }, (_, i) => applyConstructionFamilyComposition(base, plan, i + 1));
  expect(new Set(variants.map(variant => variant.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex)).size).toBe(4);
  const results = await Promise.all(variants.map(variant => evaluateConstruction(variant)));
  const doorGeometry = results.map(result => Array.from(result.ir.meshBatches.find(batch => batch.batchId.endsWith("/leaf"))!.positions!));
  expect(new Set(doorGeometry.map(positions => JSON.stringify(positions))).size).toBe(4);
  expect(new Set(Array.from({ length: 20 }, (_, index) => JSON.stringify(resolveConstructionFamilyComposition({ ...input, familySeed: `family-${index}` }).members))).size).toBeGreaterThan(1);
  expect(base).toEqual(snapshot);
  const tampered = structuredClone(plan); tampered.members[0].entranceOffset = (tampered.members[0].entranceOffset! + 1) % 20;
  expect(() => readConstructionFamilyCompositionPlan(tampered)).toThrow(/do not match/);
  expect(() => resolveConstructionFamilyComposition({ ...input, openingLock: true })).toThrow(/Unlock openings/);
  expect(() => resolveConstructionFamilyComposition({ ...input, policy: { ...input.policy, frontage: true } })).toThrow(/cannot be combined/);
  expect(() => applyConstructionFamilyComposition(createBuildingConstructionGraph(), plan, 1)).toThrow(/active storefront/);
  const awning = withConstructionAwnings(base, [{ bayIndex: 0, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]);
  expect(() => applyConstructionFamilyComposition(awning, plan, 1)).toThrow(/authored awnings/);
}, 30000);
