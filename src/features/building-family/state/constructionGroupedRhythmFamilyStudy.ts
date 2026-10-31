import { GroupedRhythmFamilyPolicySchema, GroupedRhythmFamilyReceiptSchema } from "../contracts/constructionGroupedRhythmFamilyStudy";
import { hashCanonicalJson } from "../core/contentHash";
import { BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { resolveConstructionRetainedSignFamilyStudy } from "./constructionRetainedSignFamilyStudy";
import { compileSourceAwareGroupedFacadeRhythmStudy } from "./constructionGroupedFacadeRhythmStudy";
import type { ConstructionGenerationControls, ConstructionGenerationLineage } from "./constructionGenerationState";

/** Explicit demo policy; report hashes from the final signed geometry, not the intermediate family. */
export async function resolveConstructionGroupedRhythmFamilyStudy(input: unknown, lineage: ConstructionGenerationLineage,
  controls: ConstructionGenerationControls, composition: unknown, policyInput: unknown, signal?: AbortSignal) {
  const policy = GroupedRhythmFamilyPolicySchema.parse(policyInput);
  const abort = () => { if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError"); };
  abort();
  const base = await resolveConstructionRetainedSignFamilyStudy(input, lineage, controls, composition, signal,
    policy.schemaVersion === "0.3.0" ? policy.pierVariation : undefined), members = [];
  for (const member of base.members) {
    abort();
    const graph = member.construction.graph, opening = graph.nodes.find(node => node.type === "PlaceOpening"),
      storeys = graph.nodes.find(node => node.type === "Storeys"), bays = graph.nodes.find(node => node.type === "SplitBays");
    if (!opening || !storeys || !bays) throw new Error("Family member lacks the operators needed for a facade rhythm.");
    const applied = opening.parameters.upperFrontRoundHead !== 1;
    const construction = applied ? (await compileSourceAwareGroupedFacadeRhythmStudy({ schemaVersion: "0.1.0", kind: "construction-grouped-facade-rhythm-study", graph,
      firstFloor: policy.scope === "top-upper-front" ? storeys.parameters.count - 1 : 1, lastFloor: storeys.parameters.count - 1, firstBay: 0, lastBay: bays.parameters.count - 1,
      memberCount: policy.memberCount, memberWidthM: policy.memberWidthM, pierWidthM: policy.pierWidthM }, member.lineage, { lockOpenings: controls.lockOpenings })).construction : member.construction;
    abort();
    BayConstructionWorkerReplySchema.parse({ schemaVersion: construction.graph.schemaVersion, type: "bay-result", requestId: members.length + 1, result: construction });
    const batch = (value: NonNullable<typeof construction.prototypes>[number]) => ({ role: value.role, materialSlotId: value.materialSlotId,
      positions: value.positions ? Array.from(value.positions) : null, normals: value.normals ? Array.from(value.normals) : null,
      uvs: value.uvs ? Array.from(value.uvs) : null, indices: value.indices ? Array.from(value.indices) : null });
    const geometryHash = await hashCanonicalJson({ meshes: construction.ir.meshBatches.map(batch), prototypes: (construction.prototypes ?? []).map(batch),
      instances: construction.ir.instanceBatches.map(value => ({ count: value.count, transforms: value.transforms ? Array.from(value.transforms) : null })) });
    members.push({ ...member, construction, geometryHash, applied });
  }
  const receipt = GroupedRhythmFamilyReceiptSchema.parse({ schemaVersion: "0.1.0", kind: "construction-grouped-rhythm-family-receipt", familyId: base.receipt.familyId,
    baseReceiptHash: await hashCanonicalJson(base.receipt), policyHash: await hashCanonicalJson(policy), materialSourceHash: base.receipt.materialSourceHash,
    referenceContentHash: base.receipt.referenceContentHash, members: members.map(member => ({ documentId: member.documentId, applied: member.applied,
      graphHash: member.construction.ir.sourceGraphHash, geometryHash: member.geometryHash })) });
  abort();
  return { receipt, members };
}
