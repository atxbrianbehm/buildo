import { ConstructionFamilyPlanSchema, ConstructionFamilyRequestSchema, type ConstructionFamilyPlan } from "../contracts/constructionFamilyPlan";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { createSeedTree } from "./seedTree";
import { canonicalJson } from "./canonicalJson";
import { constructionUsesOperator } from "./constructionSurfaceAuthoring";

/** Own and re-address source graphs; no material, compiler, renderer or provider work. */
export function resolveConstructionFamilyPlan(input: unknown): ConstructionFamilyPlan {
  const source = ConstructionFamilyRequestSchema.parse(input);
  if (!constructionUsesOperator(source.graph, "Footprint") || !constructionUsesOperator(source.graph, "Storeys")) {
    throw new Error("A family requires a connected whole-building construction.");
  }
  const tree = createSeedTree(source.familySeed);
  const members = Array.from({ length: 6 }, (_, index) => {
    const ordinal = index + 1, label = String(ordinal).padStart(2, "0");
    const documentId = `${source.familyId}_v${label}`;
    if (documentId === source.graph.documentId) throw new Error("A family member cannot replace the authored source document.");
    const graph = structuredClone(source.graph);
    graph.documentId = documentId;
    for (const node of graph.nodes) {
      if (node.type === "EditOpeningWidth") for (const edit of node.overrides) edit.target.documentId = documentId;
      if (node.type === "SetSurface") node.composition.documentId = documentId;
    }
    return { ordinal, documentId, buildingSeed: tree.fork(`member/${label}`).root, graph: BayConstructionGraphSchema.parse(graph) };
  });
  return ConstructionFamilyPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-family-plan", source, members });
}

/** Validate all source, member addresses, seeds and graph content on read. */
export function readConstructionFamilyPlan(input: unknown): ConstructionFamilyPlan {
  const plan = ConstructionFamilyPlanSchema.parse(input), expected = resolveConstructionFamilyPlan(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Family plan does not match its source.");
  return expected;
}
