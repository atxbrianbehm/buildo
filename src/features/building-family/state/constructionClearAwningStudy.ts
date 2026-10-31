import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { assertClearAwningLocks, resolveConstructionClearAwningStudy } from "../core/constructionClearAwningStudy";
import { readConstructionGenerationLineage } from "./constructionGenerationState";

/** Bind the demonstration to validated source lineage before varying signed geometry. */
export async function resolveSourceAwareClearAwningStudy(input: unknown, lineageInput: unknown) {
  const result = resolveConstructionClearAwningStudy(input), lineage = await readConstructionGenerationLineage(lineageInput);
  if (result.graph.documentId !== lineage.source.documentId) throw new Error("Awning graph and generation lineage must identify the same document.");
  assertClearAwningLocks(lineage.source.intent.locks);
  const graph = BayConstructionGraphSchema.parse(result.source.graph);
  for (const lock of lineage.source.intent.locks) {
    const [root, id, field, ...rest] = lock.semanticPath.split("/");
    const node = graph.nodes.find(item => item.id === id);
    if (root !== "construction" || rest.length || !node || !("parameters" in node) || (node.parameters as Record<string, unknown>)[field] !== lock.lockedValue)
      throw new Error(`Awning graph does not retain the pinned lock ${lock.semanticPath}.`);
  }
  return result;
}
