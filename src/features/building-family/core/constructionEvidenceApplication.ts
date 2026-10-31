import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { ConstructionEvidenceApplicationRequestSchema, ConstructionEvidenceApplicationSchema } from "../contracts/constructionEvidenceApplication";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";
import { readConstructionEvidenceProposal } from "./constructionEvidenceProposal";
import { readConstructionGenerationSource } from "./constructionGenerationSource";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

const headPath = "construction/opening/upperFrontRoundHead";
/** Explicitly apply one proposal to a supplied graph and declared generation source. */
export async function applyConstructionEvidenceProposal(input: unknown) {
  const parsed = ConstructionEvidenceApplicationRequestSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Application admission would change serialized fields.");
  const owned = structuredClone(parsed);
  const proposal = await readConstructionEvidenceProposal(owned.proposal, owned.sourceGraph);
  const generationSource = owned.generationSource ? await readConstructionGenerationSource(owned.generationSource) : null;
  if (generationSource && generationSource.documentId !== owned.sourceGraph.documentId) throw new Error("Generation source belongs to a different building.");
  if (generationSource?.intent.locks.some(lock => lock.semanticPath === headPath || headPath.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(headPath + "/")))
    throw new Error("The opening head is pinned by the declared generation source.");
  const original = owned.sourceGraph, opening = original.nodes.find(node => node.id === "opening");
  if (opening?.type !== "PlaceOpening" || opening.bypassed) throw new Error("An active registered opening operator is required.");
  const value = proposal.choice.value === "round" ? 1 : 0;
  const modern = ["0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0", "0.16.0", "0.17.0"].includes(original.schemaVersion);
  const result = modern ? structuredClone(original) : withConstructionRoundHead(original, value);
  const target = result.nodes.find(node => node.id === "opening");
  if (target?.type !== "PlaceOpening") throw new Error("The opening operator is missing after migration.");
  target.parameters.upperFrontRoundHead = value;
  const resultGraph = BayConstructionGraphSchema.parse(result);
  const compiled = await evaluateConstruction(resultGraph);
  if (!compiled.trace.some(entry => entry.nodeId === "opening" && entry.openingCount > 0))
    throw new Error("The opening operator must reach the compiled building output.");
  const payload = { schemaVersion: "0.1.0" as const, kind: "construction-evidence-application" as const,
    proposal, sourceGraph: original, generationSource, resultGraph, resultGraphHash: await hashCanonicalJson(resultGraph) };
  return ConstructionEvidenceApplicationSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Replay the application and require exact agreement with its saved content. */
export async function readConstructionEvidenceApplication(input: unknown) {
  const parsed = ConstructionEvidenceApplicationSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Application admission would change serialized fields.");
  const owned = structuredClone(parsed);
  const replay = await applyConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-application-request",
    proposal: owned.proposal, sourceGraph: owned.sourceGraph, generationSource: owned.generationSource });
  if (canonicalJson(owned) !== canonicalJson(replay)) throw new Error("The saved application does not replay from its proposal and source.");
  return replay;
}
