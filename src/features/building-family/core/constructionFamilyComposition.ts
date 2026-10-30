import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionFamilyCompositionPlanSchema, ConstructionFamilyCompositionRequestSchema,
  type ConstructionFamilyCompositionChoice, type ConstructionFamilyCompositionPlan } from "../contracts/constructionFamilyComposition";
import { canonicalJson } from "./canonicalJson";
import { createSeedTree } from "./seedTree";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";
import { withConstructionWindowLayout } from "./constructionWindowVocabulary";
import { withConstructionStorefront } from "./constructionStorefrontGraph";
import { withConstructionCorniceLayout } from "./constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "./constructionParapetVocabulary";

// A bounded demo catalog of coordinated choices, not sourced historical styles.
const catalog = [
  { head: 0, sash: 0, frontage: 1, cornice: 0, parapet: 0 },
  { head: 1, sash: 2, frontage: 1, cornice: 1, parapet: 1 },
  { head: 0, sash: 1, frontage: 0, cornice: 2, parapet: 0 },
  { head: 1, sash: 0, frontage: 0, cornice: 0, parapet: 0 },
  { head: 0, sash: 2, frontage: 1, cornice: 1, parapet: 1 },
  { head: 1, sash: 1, frontage: 0, cornice: 2, parapet: 1 }
] as const;

/** An explicit opt-in varies only selected groups; a conflict never weakens a lock. */
export function resolveConstructionFamilyComposition(input: unknown): ConstructionFamilyCompositionPlan {
  const source = ConstructionFamilyCompositionRequestSchema.parse(input);
  if (source.openingLock && (source.policy.openings || source.policy.frontage))
    throw new Error("Unlock openings or keep opening and frontage variation off.");
  if (!source.policy.openings && !source.policy.frontage && !source.policy.roof)
    throw new Error("Choose at least one architectural group to vary.");
  const offset = createSeedTree(source.familySeed).int(0, catalog.length - 1, "family/composition/catalog-offset");
  const members = Array.from({ length: 6 }, (_, index) => {
    const c = catalog[(index + offset) % catalog.length];
    return { ordinal: index + 1, head: source.policy.openings ? c.head : null, sash: source.policy.openings ? c.sash : null,
      frontage: source.policy.frontage ? c.frontage : null, cornice: source.policy.roof ? c.cornice : null, parapet: source.policy.roof ? c.parapet : null };
  });
  return ConstructionFamilyCompositionPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-family-composition-plan",
    catalog: "commercial-demo-compositions-v1", source, members });
}

export function readConstructionFamilyCompositionPlan(input: unknown): ConstructionFamilyCompositionPlan {
  const plan = ConstructionFamilyCompositionPlanSchema.parse(input), expected = resolveConstructionFamilyComposition(plan.source);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Family composition choices do not match their source and seed.");
  return expected;
}

/** Apply only admitted choices to an owned graph; topology helpers preserve local targets. */
export function applyConstructionFamilyComposition(graphInput: unknown, planInput: unknown, ordinal: number): BayConstructionGraph {
  let graph = structuredClone(BayConstructionGraphSchema.parse(graphInput));
  const plan = readConstructionFamilyCompositionPlan(planInput);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 6) throw new Error("Choose an existing family member from 1 to 6.");
  const choice: ConstructionFamilyCompositionChoice = plan.members[ordinal - 1];
  if (choice.head !== null) graph = withConstructionRoundHead(graph, choice.head);
  if (choice.sash !== null) graph = withConstructionWindowLayout(graph, "window", choice.sash);
  if (choice.frontage !== null) graph = withConstructionStorefront(graph, choice.frontage);
  if (choice.cornice !== null) graph = withConstructionCorniceLayout(graph, choice.cornice);
  if (choice.parapet !== null) graph = withConstructionParapetSilhouette(graph, choice.parapet);
  return BayConstructionGraphSchema.parse(graph);
}
