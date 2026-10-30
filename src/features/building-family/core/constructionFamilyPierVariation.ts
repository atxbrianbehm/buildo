import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionFamilyPierVariationPlanSchema, ConstructionFamilyPierVariationRequestSchema, type ConstructionFamilyPierVariationPlan } from "../contracts/constructionFamilyPierVariation";
import { canonicalJson } from "./canonicalJson";
import { withConstructionFacadePiers } from "./constructionFacadePierGraph";
import { createSeedTree } from "./seedTree";

// A bounded demonstration catalog, not a claim about historical designs.
const catalog = ["none", "slender", "projecting", "none", "slender", "projecting"] as const;
const dimensions = {
  slender: { pierWidthM: 0.24, projectionM: 0.12, endHeightM: 0.12, clearanceM: 0.04 },
  projecting: { pierWidthM: 0.32, projectionM: 0.22, endHeightM: 0.18, clearanceM: 0.04 }
} as const;

export function resolveConstructionFamilyPierVariation(input: unknown): ConstructionFamilyPierVariationPlan {
  const source = ConstructionFamilyPierVariationRequestSchema.parse(input);
  if (source.enabled && source.openingLock) throw new Error("Unlock openings before adding family pier variation.");
  const offset = createSeedTree(source.familySeed).int(0, catalog.length - 1, "family/pier/catalog-offset");
  return ConstructionFamilyPierVariationPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-family-pier-variation-plan",
    catalog: "demo-front-piers-v1", source, members: catalog.map((_, index) => ({ ordinal: index + 1,
      treatment: source.enabled ? catalog[(index + offset) % catalog.length] : null })) });
}

export function readConstructionFamilyPierVariation(input: unknown): ConstructionFamilyPierVariationPlan {
  const plan = ConstructionFamilyPierVariationPlanSchema.parse(input), expected = resolveConstructionFamilyPierVariation(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Family pier choices do not match their source and seed.");
  return expected;
}

/** Authored piers are always retained. Fit is checked by the building compiler. */
export function applyConstructionFamilyPierVariation(input: unknown, planInput: unknown, ordinal: number): BayConstructionGraph {
  const graph = BayConstructionGraphSchema.parse(input), plan = readConstructionFamilyPierVariation(planInput);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 6) throw new Error("Choose an existing family member from 1 to 6.");
  const treatment = plan.members[ordinal - 1].treatment;
  if (graph.facadePiers || treatment === null || treatment === "none") return structuredClone(graph);
  return withConstructionFacadePiers(graph, dimensions[treatment]);
}
