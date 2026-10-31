import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { createSeedTree } from "./seedTree";
import { constructionHasStorefront } from "./constructionStorefrontGraph";

const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-clear-awning-study"),
  familySeed: z.string().min(1).max(128).refine(value => value.trim() === value), openingLock: z.boolean(),
  additionalCount: z.union([z.literal(0), z.literal(1), z.literal(2)]), graph: BayConstructionGraphSchema }).strict();

export function assertClearAwningLocks(locks: readonly { semanticPath: string }[]) {
  const affected = ["construction/opening/awning", "construction/frontage", "construction/awning"];
  for (const lock of locks) if (affected.some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/")))
    throw new Error(`Awning variation conflicts with the pinned lock ${lock.semanticPath}.`);
}

/** Demo additions use authored dimensions and avoid the door and adjacent canopies. */
export function resolveConstructionClearAwningStudy(input: unknown) {
  const source = request.parse(input), graph = structuredClone(source.graph);
  if (source.openingLock) throw new Error("Unlock openings before varying awnings.");
  if (graph.schemaVersion !== "0.17.0" || !graph.storefrontSign || !graph.awnings?.length || !constructionHasStorefront(graph))
    throw new Error("Choose a signed storefront with an authored awning and clearance.");
  const door = graph.nodes.find(node => node.type === "PlaceDoor"), bays = graph.nodes.find(node => node.type === "SplitBays");
  if (!door || door.bypassed || !bays || bays.bypassed) throw new Error("Awning variation requires an active entrance and bay layout.");
  const available = Array.from({ length: bays.parameters.count }, (_, index) => index).filter(index => index !== door.parameters.bayIndex && !graph.awnings!.some(awning => Math.abs(awning.bayIndex - index) <= 1));
  const combinations = source.additionalCount === 0 ? [[]] : source.additionalCount === 1 ? available.map(index => [index]) :
    available.flatMap((a, index) => available.slice(index + 1).filter(b => b - a > 1).map(b => [a, b]));
  if (!combinations.length) throw new Error("Awning variation needs enough separated bays without an entrance or adjacent authored awning.");
  const seed = createSeedTree(source.familySeed), ranked = combinations.sort((a, b) =>
    seed.uint32(`family/awning/clear/${graph.documentId}/bays/${a.join("-")}`) - seed.uint32(`family/awning/clear/${graph.documentId}/bays/${b.join("-")}`) || (a[0] ?? -1) - (b[0] ?? -1) || (a[1] ?? -1) - (b[1] ?? -1));
  const selectedBays = ranked[0], exemplar = graph.awnings[0];
  graph.awnings = [...graph.awnings, ...selectedBays.map(bayIndex => ({ ...exemplar, bayIndex }))].sort((a, b) => a.bayIndex - b.bayIndex);
  return { schemaVersion: "0.1.0" as const, kind: "construction-clear-awning-result" as const, source, availableBays: available,
    selectedBays, graph: BayConstructionGraphSchema.parse(graph) };
}
