import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { applyConstructionFamilyComposition, readConstructionFamilyCompositionPlan, resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

const request = () => ({ schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed: "family-one",
  policy: { openings: true, frontage: true, roof: true }, openingLock: false });

describe("family architectural composition", () => {
  it("replays varied storefront lights, protects authored divisions and coordinates punched frontage", async () => {
    const input = { schemaVersion: "0.3.0", kind: "construction-family-composition-request", familySeed: "lights-seed",
      policy: { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: true }, openingLock: false };
    const plan = resolveConstructionFamilyComposition(input);
    if (plan.schemaVersion !== "0.3.0") throw new Error("Wrong plan version");
    expect(readConstructionFamilyCompositionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(new Set(plan.members.map(member => JSON.stringify(member.storefrontLights))).size).toBe(6);
    const base = withConstructionStorefront(createBuildingConstructionGraph(), 1), before = structuredClone(base);
    for (let ordinal = 1; ordinal <= 6; ordinal++) {
      const candidate = applyConstructionFamilyComposition(base, plan, ordinal), lights = plan.members[ordinal - 1].storefrontLights!;
      expect(candidate.storefrontDivision ?? { displayLights: 1, transomLights: 1 }).toEqual(lights);
      await evaluateConstruction(candidate);
    }
    expect(base).toEqual(before);
    expect(() => applyConstructionFamilyComposition(withConstructionStorefrontDivision(base, { displayLights: 2, transomLights: 3 }), plan, 1)).toThrow(/cannot overwrite/);
    expect(() => resolveConstructionFamilyComposition({ ...input, openingLock: true })).toThrow(/Unlock openings/);
    const tampered = structuredClone(plan); tampered.members[0].storefrontLights!.displayLights = tampered.members[0].storefrontLights!.displayLights === 1 ? 2 : 1;
    expect(() => readConstructionFamilyCompositionPlan(tampered)).toThrow(/do not match/);
    const coordinated = resolveConstructionFamilyComposition({ ...input, policy: { ...input.policy, frontage: true } });
    if (coordinated.schemaVersion !== "0.3.0") throw new Error("Wrong plan version");
    expect(coordinated.members.every(member => member.frontage !== 0 || member.storefrontLights === null)).toBe(true);
    for (let ordinal = 1; ordinal <= 6; ordinal++) {
      const candidate = applyConstructionFamilyComposition(base, coordinated, ordinal), chosen = coordinated.members[ordinal - 1];
      expect(candidate.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(chosen.frontage);
      if (chosen.frontage === 0) expect(candidate.storefrontDivision).toBeUndefined();
      else expect(candidate.storefrontDivision ?? { displayLights: 1, transomLights: 1 }).toEqual(chosen.storefrontLights);
      await evaluateConstruction(candidate);
    }
  }, 30000);
  it("gives six explicit repeatable coordinated demo choices with seed-dependent ordering", () => {
    const input = request(), plan = resolveConstructionFamilyComposition(input), before = structuredClone(input);
    expect(readConstructionFamilyCompositionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(new Set(plan.members.map(member => JSON.stringify({ ...member, ordinal: 0 }))).size).toBe(6);
    const sequences = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(resolveConstructionFamilyComposition({ ...input, familySeed: `seed-${i}` }).members)));
    expect(sequences.size).toBeGreaterThan(1);
    plan.source.policy.openings = false; expect(input).toEqual(before);
  });
  it("preserves explicitly unvaried categories and refuses an opening-lock conflict", () => {
    const input = request(); input.policy.openings = false; input.policy.frontage = false; input.openingLock = true;
    const plan = resolveConstructionFamilyComposition(input);
    expect(plan.members.every(member => member.head === null && member.sash === null && member.frontage === null)).toBe(true);
    expect(plan.members.every(member => member.cornice !== null && member.parapet !== null)).toBe(true);
    expect(() => resolveConstructionFamilyComposition({ ...input, policy: { ...input.policy, openings: true } })).toThrow(/Unlock openings/);
    expect(() => resolveConstructionFamilyComposition({ ...input, policy: { openings: false, frontage: false, roof: false } })).toThrow(/at least one/);
    const original = withConstructionStorefront(withConstructionWindowLayout(withConstructionRoundHead(createBuildingConstructionGraph(), 1), "window", 2), 1);
    for (let i = 1; i <= 6; i++) {
      const variant = applyConstructionFamilyComposition(original, plan, i);
      expect(variant.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
      expect(variant.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(2);
      expect(variant.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(1);
    }
  });
  it("owns and replays its choices and rejects tampering and malformed input", () => {
    const plan = resolveConstructionFamilyComposition(request()); plan.members[0].head = plan.members[0].head === 1 ? 0 : 1;
    expect(() => readConstructionFamilyCompositionPlan(plan)).toThrow(/do not match/);
    expect(() => resolveConstructionFamilyComposition({ ...request(), extra: undefined })).toThrow();
    expect(() => resolveConstructionFamilyComposition({ ...request(), schemaVersion: "0.2.0" })).toThrow();
    expect(() => applyConstructionFamilyComposition(createBuildingConstructionGraph(), resolveConstructionFamilyComposition(request()), 7)).toThrow(/1 to 6/);
  });
  it("applies real compatible choices without losing local targets or changing the source", async () => {
    const target = { documentId: "authored-building", storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 2 };
    const graph = withConstructionOpeningWidth(createBuildingConstructionGraph(), { target, widthM: 1.0 });
    const original = structuredClone(graph), plan = resolveConstructionFamilyComposition(request()), outputs = [];
    for (let ordinal = 1; ordinal <= 6; ordinal++) {
      const variant = applyConstructionFamilyComposition(graph, plan, ordinal), choice = plan.members[ordinal - 1];
      expect(variant.documentId).toBe(graph.documentId);
      expect(variant.nodes.find(node => node.type === "EditOpeningWidth")!.overrides).toEqual([{ target, widthM: 1.0 }]);
      expect(variant.nodes.find(node => node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(choice.head);
      expect(variant.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(choice.sash);
      expect(variant.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(choice.frontage);
      const compiled = await evaluateConstruction(variant);
      outputs.push(JSON.stringify({ meshes: compiled.ir.meshBatches.map(batch => Array.from(batch.positions ?? [])),
        prototypes: compiled.prototypes?.map(batch => Array.from(batch.positions ?? [])),
        instances: compiled.ir.instanceBatches.map(batch => Array.from(batch.transforms ?? [])) }));
    }
    expect(new Set(outputs).size).toBe(6); expect(graph).toEqual(original);
  }, 30000);
  it("coordinates seeded single, paired and triple additions without overwriting authored scopes", async () => {
    const input = { schemaVersion: "0.2.0", kind: "construction-family-composition-request", familySeed: "family-one",
      policy: { openings: false, frontage: false, roof: false, groupedBays: true }, openingLock: false };
    const plan = resolveConstructionFamilyComposition(input);
    expect(plan.schemaVersion).toBe("0.2.0");
    if (plan.schemaVersion !== "0.2.0") throw new Error("Wrong plan version");
    expect(new Set(plan.members.map(member => member.groupedBays))).toEqual(new Set([0, 2, 3]));
    expect(readConstructionFamilyCompositionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    const tampered = structuredClone(plan); tampered.members[0].groupedBays = tampered.members[0].groupedBays === 2 ? 3 : 2;
    expect(() => readConstructionFamilyCompositionPlan(tampered)).toThrow(/do not match/);
    expect(() => resolveConstructionFamilyComposition({ ...input, openingLock: true })).toThrow(/Unlock openings/);
    const target = { documentId: "authored-building", storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 1 };
    const graph = withConstructionGroupedBays(withConstructionOpeningWidth(createBuildingConstructionGraph(), { target, widthM: 1 }),
      [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 }]);
    const original = structuredClone(graph);
    for (let ordinal = 1; ordinal <= 6; ordinal++) {
      const candidate = applyConstructionFamilyComposition(graph, plan, ordinal), count = plan.members[ordinal-1].groupedBays;
      expect(candidate.upperBayGroups?.[0]).toEqual(graph.upperBayGroups?.[0]);
      if (count) expect(candidate.upperBayGroups?.[1]).toMatchObject({ floorIndex: 1, bayIndex: 2, memberCount: count });
      else expect(candidate.upperBayGroups).toHaveLength(1);
      await evaluateConstruction(candidate);
    }
    expect(graph).toEqual(original);
    const occupied = withConstructionGroupedBays(graph, [0, 2, 3].map(bayIndex => ({ storeysNodeId: "facade", floorIndex: 1, bayIndex,
      memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 })));
    const groupedOrdinal = plan.members.findIndex(member => member.groupedBays === 2) + 1;
    expect(() => applyConstructionFamilyComposition(occupied, plan, groupedOrdinal)).toThrow(/without an authored group or local width edit/);
    expect(() => applyConstructionFamilyComposition(withConstructionRoundHead(createBuildingConstructionGraph(), 1), plan, groupedOrdinal)).toThrow(/requires flat upper-front openings/);
    const coordinated = resolveConstructionFamilyComposition({ ...input, policy: { ...input.policy, openings: true } });
    if (coordinated.schemaVersion !== "0.2.0") throw new Error("Wrong plan version");
    expect(coordinated.members.every(member => member.head !== 1 || member.groupedBays === 0)).toBe(true);
  }, 30000);
});
