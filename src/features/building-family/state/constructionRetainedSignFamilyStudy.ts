import { ConstructionRetainedSignFamilyStudyReceiptSchema } from "../contracts/constructionRetainedSignFamilyStudy";
import { readConstructionFamilyPlan, resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { readConstructionFamilyCompositionPlan } from "../core/constructionFamilyComposition";
import { withConstructionStorefrontSign, withoutConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { hashCanonicalJson } from "../core/contentHash";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { resolveConstructionFamily } from "./constructionFamilyGeneration";
import { resolveConstructionSignGenerationStudy } from "./constructionSignGenerationStudy";
import type { ConstructionGenerationControls, ConstructionGenerationLineage } from "./constructionGenerationState";

/** Experimental roof and massing family; the receipt describes the final signed geometry. */
export async function resolveConstructionRetainedSignFamilyStudy(input: unknown, lineage: ConstructionGenerationLineage,
  controls: ConstructionGenerationControls, compositionInput: unknown, signal?: AbortSignal) {
  const plan = readConstructionFamilyPlan(input), composition = readConstructionFamilyCompositionPlan(compositionInput), source = plan.source.graph;
  if (!source.storefrontSign || (source.schemaVersion !== "0.16.0" && source.schemaVersion !== "0.17.0")) throw new Error("Choose a sign-bearing family source.");
  const policy = composition.source.policy;
  if (!policy.roof || Object.entries(policy).some(([key, value]) => !["roof", "massing"].includes(key) && value)) throw new Error("This study supports roof and massing variation while retaining the storefront.");
  if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError");
  await resolveConstructionSignGenerationStudy(source, lineage, controls);
  const unsignedPlan = resolveConstructionFamilyPlan({ ...plan.source, graph: withoutConstructionStorefrontSign(source) });
  const family = await resolveConstructionFamily(unsignedPlan, lineage, controls, signal, composition);
  const members = [], hashes = new Set<string>();
  for (const member of family.members) {
    if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError");
    let graph = withConstructionStorefrontSign(member.construction.graph, source.storefrontSign);
    if (source.schemaVersion === "0.17.0") graph = withConstructionSignAwningClearance(graph, source.signAwningGapM!);
    let construction: Awaited<ReturnType<typeof evaluateConstruction>>;
    try { construction = await evaluateConstruction(graph); }
    catch (failure) { throw new Error(`A family member cannot retain the storefront: ${failure instanceof Error ? failure.message : "invalid construction"}`, { cause: failure }); }
    if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError");
    BayConstructionWorkerReplySchema.parse({ schemaVersion: graph.schemaVersion, type: "bay-result", requestId: members.length + 1, result: construction });
    const batch = (value: NonNullable<typeof construction.prototypes>[number]) => ({ role: value.role, materialSlotId: value.materialSlotId,
      positions: value.positions ? Array.from(value.positions) : null, normals: value.normals ? Array.from(value.normals) : null,
      uvs: value.uvs ? Array.from(value.uvs) : null, indices: value.indices ? Array.from(value.indices) : null });
    const geometryHash = await hashCanonicalJson({ meshes: construction.ir.meshBatches.map(batch), prototypes: (construction.prototypes ?? []).map(batch),
      instances: construction.ir.instanceBatches.map(value => ({ count: value.count, transforms: value.transforms ? Array.from(value.transforms) : null })) });
    if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError");
    if (hashes.has(geometryHash)) throw new Error("Retaining the storefront produced duplicate family geometry.");
    hashes.add(geometryHash); members.push({ ...member, construction, geometryHash });
  }
  const massing = "massing" in policy && policy.massing;
  const receipt = ConstructionRetainedSignFamilyStudyReceiptSchema.parse({ schemaVersion: massing ? "0.2.0" : "0.1.0", kind: "construction-retained-sign-family-study",
    familyId: plan.source.familyId, sourceGraphHash: await hashCanonicalJson(source), materialSourceHash: family.receipt.materialSourceHash,
    referenceContentHash: family.receipt.referenceContentHash, members: members.map(member => ({ documentId: member.documentId,
      sourceContentHash: member.lineage.source.contentHash, geometryHash: member.geometryHash })),
    ...(massing ? { familySeed: plan.source.familySeed, compositionHash: await hashCanonicalJson(composition) } : {}) });
  if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError");
  return { receipt, members };
}
