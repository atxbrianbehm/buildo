import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { withConstructionStorefrontSign, withoutConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { ConstructionGenerationLineageSchema, resolveWorkbenchGeneration, type ConstructionGenerationControls, type ConstructionGenerationLineage } from "./constructionGenerationState";

/** Experimental retained-sign overlay; generated lineage remains independent of authored detail. */
export async function resolveConstructionSignGenerationStudy(input: unknown, previous: ConstructionGenerationLineage | null,
  controls: ConstructionGenerationControls, reroll = false, reference?: unknown) {
  const original = structuredClone(BayConstructionGraphSchema.parse(input));
  if ((original.schemaVersion !== "0.16.0" && original.schemaVersion !== "0.17.0") || !original.storefrontSign)
    throw new Error("Choose a sign-bearing building for this generation study.");
  if (!controls.preserveAuthored) throw new Error("This study requires preserving authored choices; release and imported lock behavior are not yet supported.");
  const prior = previous ? ConstructionGenerationLineageSchema.parse(previous) : null;
  const paths = ["construction/sign", "construction/storefrontSign", "construction/awning", "construction/awnings", "construction/awningSupports", "construction/facadePiers"];
  if (prior?.source.intent.locks.some(lock => paths.some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/"))))
    throw new Error("Imported sign, awning and pier locks are not yet supported in this study.");
  await evaluateConstruction(original);
  const result = await resolveWorkbenchGeneration(withoutConstructionStorefrontSign(original), prior, controls, reroll, reference);
  let graph = withConstructionStorefrontSign(result.graph, original.storefrontSign);
  if (original.schemaVersion === "0.17.0") graph = withConstructionSignAwningClearance(graph, original.signAwningGapM!);
  try { await evaluateConstruction(graph); }
  catch (failure) { throw new Error(`The retained sign and storefront do not fit the generated building: ${failure instanceof Error ? failure.message : "invalid construction"}`, { cause: failure }); }
  return { ...result, graph };
}
