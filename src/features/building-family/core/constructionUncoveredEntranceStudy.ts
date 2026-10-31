import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { createSeedTree } from "./seedTree";
import { constructionHasStorefront } from "./constructionStorefrontGraph";

const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-uncovered-entrance-study"),
  familySeed: z.string().min(1).max(128).refine(value => value.trim() === value), openingLock: z.boolean(), graph: BayConstructionGraphSchema }).strict();

/** A family source may pin a door through any of the supported semantic paths. */
export function assertUncoveredEntranceLocks(locks: readonly { semanticPath: string }[]) {
  const affected = ["construction/opening/entrance/bayIndex", "construction/entrance/bayIndex", "construction/door/bayIndex", "construction/frontage/mode"];
  for (const lock of locks) if (affected.some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/")))
    throw new Error(`Entrance variation conflicts with the pinned lock ${lock.semanticPath}.`);
}

/** Isolated demo: keep the authored awnings and put the door in a bay without one. */
export function resolveConstructionUncoveredEntranceStudy(input: unknown) {
  const source = request.parse(input), graph = structuredClone(source.graph);
  if (source.openingLock) throw new Error("Unlock openings before varying the entrance.");
  if (!constructionHasStorefront(graph)) throw new Error("Entrance variation requires an active storefront.");
  const door = graph.nodes.find(node => node.type === "PlaceDoor"), bays = graph.nodes.find(node => node.type === "SplitBays");
  if (!door || door.bypassed || !bays || bays.bypassed) throw new Error("Entrance variation requires an active door and bay layout.");
  const available = Array.from({ length: bays.parameters.count }, (_, index) => index).filter(index => !graph.awnings?.some(awning => awning.bayIndex === index));
  if (!available.length) throw new Error("Entrance variation needs a bay without an authored awning.");
  const selected = createSeedTree(source.familySeed).int(0, available.length - 1, `family/entrance/uncovered/${graph.documentId}`);
  door.parameters.bayIndex = available[selected];
  return { schemaVersion: "0.1.0" as const, kind: "construction-uncovered-entrance-result" as const,
    source, availableBays: available, selectedBay: available[selected], graph: BayConstructionGraphSchema.parse(graph) };
}
