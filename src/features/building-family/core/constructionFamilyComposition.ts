import { BayConstructionGraphSchema, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionFamilyCompositionPlanSchema, ConstructionFamilyCompositionRequestSchema,
  type ConstructionFamilyCompositionChoice, type ConstructionFamilyCompositionPlan } from "../contracts/constructionFamilyComposition";
import { canonicalJson } from "./canonicalJson";
import { createSeedTree } from "./seedTree";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";
import { withConstructionWindowLayout } from "./constructionWindowVocabulary";
import { constructionHasStorefront, withConstructionStorefront } from "./constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "./constructionStorefrontDivisionGraph";
import { withConstructionCorniceLayout } from "./constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "./constructionParapetVocabulary";
import { withConstructionGroupedBays } from "./constructionGroupedBayGraph";

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
  const varyGroups = source.schemaVersion !== "0.1.0" && source.policy.groupedBays;
  const varyStorefrontLights = (source.schemaVersion === "0.3.0" || source.schemaVersion === "0.4.0") && source.policy.storefrontLights;
  const varyMassing = source.schemaVersion === "0.4.0" && source.policy.massing;
  if (source.openingLock && (source.policy.openings || source.policy.frontage || varyGroups || varyStorefrontLights))
    throw new Error("Unlock openings or keep opening and frontage variation off.");
  if (!source.policy.openings && !source.policy.frontage && !source.policy.roof && !varyGroups && !varyStorefrontLights && !varyMassing)
    throw new Error("Choose at least one architectural group to vary.");
  const offset = createSeedTree(source.familySeed).int(0, catalog.length - 1, "family/composition/catalog-offset");
  const members = Array.from({ length: 6 }, (_, index) => {
    const c = catalog[(index + offset) % catalog.length];
    return { ordinal: index + 1, head: source.policy.openings ? c.head : null, sash: source.policy.openings ? c.sash : null,
      frontage: source.policy.frontage ? c.frontage : null, cornice: source.policy.roof ? c.cornice : null, parapet: source.policy.roof ? c.parapet : null };
  });
  if (source.schemaVersion === "0.1.0") return ConstructionFamilyCompositionPlanSchema.parse({ schemaVersion: "0.1.0", kind: "construction-family-composition-plan",
    catalog: "commercial-demo-compositions-v1", source, members });
  const groupCatalog = [2, 3, 3, 0, 2, 0] as const;
  const groupedMembers = members.map((member, index) => ({ ...member,
    groupedBays: varyGroups ? (member.head === 1 ? 0 : groupCatalog[(index + offset) % catalog.length]) : null }));
  if (source.schemaVersion === "0.3.0" || source.schemaVersion === "0.4.0") {
    const lights = [{ displayLights: 1, transomLights: 1 }, { displayLights: 2, transomLights: 2 },
      { displayLights: 1, transomLights: 3 }, { displayLights: 2, transomLights: 3 },
      { displayLights: 1, transomLights: 2 }, { displayLights: 2, transomLights: 1 }] as const;
    const lightMembers = groupedMembers.map((member, index) => ({ ...member,
      storefrontLights: varyStorefrontLights && member.frontage !== 0 ? lights[(index + offset) % lights.length] : null }));
    if (source.schemaVersion === "0.3.0") return ConstructionFamilyCompositionPlanSchema.parse({ schemaVersion: "0.3.0", kind: "construction-family-composition-plan",
      catalog: "commercial-demo-compositions-v3", source, members: lightMembers });
    const masses = [{ floorCount: 2, bayCount: 3 }, { floorCount: 3, bayCount: 4 }, { floorCount: 4, bayCount: 5 },
      { floorCount: 2, bayCount: 5 }, { floorCount: 4, bayCount: 3 }, { floorCount: 3, bayCount: 5 }] as const;
    return ConstructionFamilyCompositionPlanSchema.parse({ schemaVersion: "0.4.0", kind: "construction-family-composition-plan",
      catalog: "commercial-demo-compositions-v4", source, members: lightMembers.map((member, index) => ({ ...member,
        massing: varyMassing ? masses[(index + offset) % masses.length] : null })) });
  }
  return ConstructionFamilyCompositionPlanSchema.parse({ schemaVersion: "0.2.0", kind: "construction-family-composition-plan",
    catalog: "commercial-demo-compositions-v2", source, members: groupedMembers });
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
  if (plan.schemaVersion === "0.4.0" && plan.members[ordinal - 1].massing) {
    const massing = plan.members[ordinal - 1].massing!;
    if (graph.nodes.find(node => node.type === "Storeys")?.parameters.count !== massing.floorCount ||
        graph.nodes.find(node => node.type === "SplitBays")?.parameters.count !== massing.bayCount)
      throw new Error("Resolve the member's massing through generation before applying its composition.");
  }
  if ((plan.schemaVersion === "0.3.0" || plan.schemaVersion === "0.4.0") && plan.source.policy.storefrontLights && graph.storefrontDivision)
    throw new Error("Storefront variation cannot overwrite authored divisions. Reset them or turn off storefront-light variation.");
  if (choice.head !== null) graph = withConstructionRoundHead(graph, choice.head);
  if (choice.sash !== null) graph = withConstructionWindowLayout(graph, "window", choice.sash);
  if (choice.frontage !== null) graph = withConstructionStorefront(graph, choice.frontage);
  if (choice.cornice !== null) graph = withConstructionCorniceLayout(graph, choice.cornice);
  if (choice.parapet !== null) graph = withConstructionParapetSilhouette(graph, choice.parapet);
  if (plan.schemaVersion !== "0.1.0") {
    const count = plan.members[ordinal - 1].groupedBays;
    if (count === 2 || count === 3) {
      const opening = graph.nodes.find(node => node.type === "PlaceOpening"), footprint = graph.nodes.find(node => node.type === "Footprint"),
        storeys = graph.nodes.find(node => node.type === "Storeys"), bays = graph.nodes.find(node => node.type === "SplitBays"),
        window = graph.nodes.find(node => node.type === "AssembleWindow"), edits = graph.nodes.find(node => node.type === "EditOpeningWidth");
      if (!opening || opening.bypassed || opening.parameters.upperFrontRoundHead || !footprint || !storeys || storeys.parameters.count < 2 || !bays || !window || window.bypassed)
        throw new Error("Grouped family variation requires flat upper-front openings and an active building window assembly.");
      const existing = graph.upperBayGroups ?? [];
      const bayIndex = Array.from({ length: bays.parameters.count }, (_, index) => index).find(index =>
        !existing.some(group => group.storeysNodeId === storeys.id && group.floorIndex === 1 && group.bayIndex === index) &&
        !(edits && !edits.bypassed && edits.overrides.some(({ target }) => target.storeysNodeId === storeys.id && target.face === "front" && target.floorIndex === 1 && target.bayIndex === index)));
      if (bayIndex === undefined) throw new Error("Grouped family variation needs an upper-front bay without an authored group or local width edit.");
      const pierWidthM = 0.24, available = footprint.parameters.widthM / bays.parameters.count;
      const memberWidthM = Math.floor(Math.min(0.6, (available - 0.26 - (count - 1) * pierWidthM) / count) * 100) / 100;
      if (memberWidthM <= window.parameters.frameWidthM * 4) throw new Error("The generated bay is too narrow for grouped windows and their frames.");
      graph = withConstructionGroupedBays(graph, [...existing, { storeysNodeId: storeys.id, floorIndex: 1, bayIndex, memberCount: count, memberWidthM, pierWidthM }]);
    }
  }
  if (plan.schemaVersion === "0.3.0" || plan.schemaVersion === "0.4.0") {
    const lights = plan.members[ordinal - 1].storefrontLights;
    if (lights && !constructionHasStorefront(graph)) throw new Error("Storefront-light variation requires an active storefront or ground-frontage variation.");
    if (lights && (lights.displayLights !== 1 || lights.transomLights !== 1)) graph = withConstructionStorefrontDivision(graph, lights);
  }
  return BayConstructionGraphSchema.parse(graph);
}
