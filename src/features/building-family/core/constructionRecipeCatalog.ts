import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { hashCanonicalJson } from "./contentHash";

const RESOLVER_VERSION = "construction-generation-resolver-v1" as const;
const definitionSchema = z.object({
  schemaVersion: z.literal("0.1.0"), id: z.string().min(1), version: z.literal("1"),
  resolverVersion: z.enum([RESOLVER_VERSION, "construction-generation-resolver-v2"]), baseGraph: BayConstructionGraphSchema,
  choices: z.record(z.string(), z.array(z.number().finite()).min(1)),
  parameterChoices: z.record(z.string(), z.object({ seedDomain: z.enum(["building", "trim"]), values: z.array(z.number().finite()).min(1).max(64) }).strict()).optional(),
  trimProfiles: z.object({ restrained: z.record(z.string(), z.number().finite()), moderate: z.record(z.string(), z.number().finite()) }).strict().optional()
}).strict();
const definition = definitionSchema.parse({
  schemaVersion: "0.1.0", id: "restrained-masonry-rectangular", version: "1", resolverVersion: RESOLVER_VERSION,
  baseGraph: createBuildingConstructionGraph("recipe-template"),
  choices: {
    floorCount: [2, 3, 4], bayCount: [3, 4, 5], bayPitchM: [2.6, 2.8, 3], depthM: [8.4, 9.8, 11.2],
    groundHeightM: [3.7, 4, 4.3], upperHeightM: [3.3, 3.5, 3.7], openingWidthM: [1.1, 1.22, 1.28], openingHeightM: [1.95, 2.12, 2.25]
  }
});

export const DEFAULT_CONSTRUCTION_RECIPE_ID = "restrained-masonry-rectangular";
export type ConstructionRecipeDefinition = z.infer<typeof definitionSchema>;

function variant(id: string, patch: Record<string, Record<string, number>>, choices: ConstructionRecipeDefinition["choices"],
  parameterChoices: NonNullable<ConstructionRecipeDefinition["parameterChoices"]>, trimProfiles: NonNullable<ConstructionRecipeDefinition["trimProfiles"]>) {
  const baseGraph = createBuildingConstructionGraph("recipe-template");
  for (const node of baseGraph.nodes) if ("parameters" in node && patch[node.id]) Object.assign(node.parameters, patch[node.id]);
  return definitionSchema.parse({ schemaVersion: "0.1.0", id, version: "1", resolverVersion: "construction-generation-resolver-v2",
    baseGraph: BayConstructionGraphSchema.parse(baseGraph), choices, parameterChoices, trimProfiles });
}
const deepReveals = variant("deep-reveal-masonry", {
  footprint: { wallDepthM: .48 }, window: { recessM: .24, frameWidthM: .075, sillProjectionM: .22 },
  door: { recessM: .22, frameWidthM: .09, thresholdProjectionM: .2 }, roof: { parapetHeightM: .65, copingProjectionM: .08 }
}, { ...definition.choices, groundHeightM: [4, 4.2, 4.4], upperHeightM: [3.8, 3.9, 4],
  openingWidthM: [1.08, 1.18, 1.22], openingHeightM: [2.15, 2.25, 2.35] }, {
  "construction/footprint/wallDepthM": { seedDomain: "building", values: [.44, .48, .52] },
  "construction/window/recessM": { seedDomain: "building", values: [.22, .25, .28] },
  "construction/window/frameWidthM": { seedDomain: "building", values: [.07, .075, .08] },
  "construction/window/sillProjectionM": { seedDomain: "trim", values: [.18, .22, .26] }
}, {
  restrained: { "construction/bands/heightM": .1, "construction/bands/projectionM": .07, "construction/roof/corniceHeightM": .28, "construction/roof/corniceProjectionM": .22 },
  moderate: { "construction/bands/heightM": .14, "construction/bands/projectionM": .1, "construction/roof/corniceHeightM": .34, "construction/roof/corniceProjectionM": .28 }
});
const projectingCornice = variant("projecting-cornice-masonry", {
  footprint: { wallDepthM: .42 }, window: { recessM: .16, frameWidthM: .065, sillProjectionM: .18 },
  roof: { parapetHeightM: .75, copingProjectionM: .1 }, door: { frameWidthM: .085, thresholdProjectionM: .18 }
}, { ...definition.choices, bayPitchM: [3, 3.2, 3.4], depthM: [9.8, 11.2, 12], groundHeightM: [4.1, 4.3, 4.5], upperHeightM: [3.9, 4, 4.1],
  openingWidthM: [1.28, 1.36, 1.4], openingHeightM: [2.12, 2.25, 2.35] }, {
  "construction/window/sillProjectionM": { seedDomain: "trim", values: [.16, .2, .24] },
  "construction/roof/parapetHeightM": { seedDomain: "trim", values: [.65, .75, .85] },
  "construction/roof/copingProjectionM": { seedDomain: "trim", values: [.08, .1, .12] }
}, {
  restrained: { "construction/bands/heightM": .14, "construction/bands/projectionM": .09, "construction/roof/corniceHeightM": .36, "construction/roof/corniceProjectionM": .28 },
  moderate: { "construction/bands/heightM": .18, "construction/bands/projectionM": .12, "construction/roof/corniceHeightM": .48, "construction/roof/corniceProjectionM": .38 }
});
const definitions = [definition, deepReveals, projectingCornice];
const options = z.array(z.object({ schemaVersion: z.literal("0.1.0"), id: z.string(), version: z.literal("1"), label: z.string(), description: z.string() }).strict()).parse([
  { schemaVersion: "0.1.0", id: definition.id, version: "1", label: "Restrained masonry", description: "The accepted C5 proportions, double-hung windows and continuous restrained profiles." },
  { schemaVersion: "0.1.0", id: deepReveals.id, version: "1", label: "Deep reveals", description: "Thicker masonry, deeper window recesses, wider frames and projecting sills." },
  { schemaVersion: "0.1.0", id: projectingCornice.id, version: "1", label: "Projecting cornice", description: "Broader bays, a taller parapet and stronger continuous cornice and belt profiles." }
]);

// Internal data is validated against the same executable graph, not an independent mesh catalog.
for (const item of definitions) {
  const parameters = new Set(item.baseGraph.nodes.flatMap(node => "parameters" in node ? Object.keys(node.parameters).map(field => "construction/" + node.id + "/" + field) : []));
  const targets = [...Object.keys(item.parameterChoices ?? {}), ...Object.values(item.trimProfiles ?? {}).flatMap(profile => Object.keys(profile))];
  if (targets.some(target => !parameters.has(target))) throw new Error("Construction recipe targets an unavailable operator parameter.");
}
/** Return owned data so a UI or caller cannot rewrite the registered recipe behind a saved pin. */
export function getConstructionRecipeDefinition(id: string = DEFAULT_CONSTRUCTION_RECIPE_ID): ConstructionRecipeDefinition {
  const found = definitions.find(item => item.id === id);
  if (!found) throw new Error("Generation recipe ID, version or content hash is unavailable or mismatched.");
  return structuredClone(found);
}
export function getConstructionRecipeOptions() { return structuredClone(options); }
export async function constructionRecipeReference(id: string = DEFAULT_CONSTRUCTION_RECIPE_ID) {
  const owned = getConstructionRecipeDefinition(id);
  return { id: owned.id, version: owned.version, contentHash: await hashCanonicalJson(owned) };
}
