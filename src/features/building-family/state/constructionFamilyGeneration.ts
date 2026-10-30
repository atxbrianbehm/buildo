import { z } from "zod";
import { readConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { createSeedTree } from "../core/seedTree";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { ConstructionGenerationLineageSchema, readConstructionGenerationLineage, resolveWorkbenchGeneration,
  type ConstructionGenerationControls, type ConstructionGenerationLineage } from "./constructionGenerationState";
import { applyConstructionFamilyComposition, readConstructionFamilyCompositionPlan } from "../core/constructionFamilyComposition";

const controlsSchema = z.object({ recipeId: z.string().min(1).max(512).optional(), floorCount: z.number().int().min(2).max(6),
  bayCount: z.number().int().min(3).max(6), buildingSeed: z.string().trim().min(1).max(256),
  materialSeed: z.string().trim().min(1).max(256), trimSeed: z.string().trim().min(1).max(256),
  lockFootprint: z.boolean(), lockStoreys: z.boolean(), lockOpenings: z.boolean(), preserveAuthored: z.boolean() }).strict();
const receiptSchema = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-evaluation"),
  familyId: z.string().min(1), sourceDocumentId: z.string().min(1), materialSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  referenceContentHash: z.string().regex(/^[a-f0-9]{64}$/), members: z.array(z.object({ documentId: z.string().min(1),
    buildingSeed: z.string().min(1), sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/), geometryHash: z.string().regex(/^[a-f0-9]{64}$/), shapeHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(6) }).strict();

function abort(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("Family generation cancelled.", "AbortError"); }

/** Hash executed geometry and transforms without document-specific semantic IDs. */
async function geometryHash(result: Awaited<ReturnType<typeof evaluateConstruction>>) {
  const batch = (value: NonNullable<typeof result.prototypes>[number]) => ({ role: value.role, materialSlotId: value.materialSlotId,
    positions: value.positions ? Array.from(value.positions) : null, normals: value.normals ? Array.from(value.normals) : null,
    uvs: value.uvs ? Array.from(value.uvs) : null, indices: value.indices ? Array.from(value.indices) : null });
  return hashCanonicalJson({ meshes: result.ir.meshBatches.map(batch), prototypes: (result.prototypes ?? []).map(batch),
    instances: result.ir.instanceBatches.map(value => ({ count: value.count, transforms: value.transforms ? Array.from(value.transforms) : null })) });
}

/** Resolve a complete owned family or fail without publishing a partial result. */
export async function resolveConstructionFamily(input: unknown, lineageInput: unknown, controlsInput: ConstructionGenerationControls, signal?: AbortSignal, compositionInput?: unknown) {
  const plan = readConstructionFamilyPlan(input);
  const lineage = structuredClone(ConstructionGenerationLineageSchema.parse(lineageInput));
  const controls = controlsSchema.parse(controlsInput);
  if (!controls.preserveAuthored) throw new Error("Family generation requires preserving authored choices.");
  abort(signal);
  const original = await readConstructionGenerationLineage(lineage); abort(signal);
  const composition = compositionInput === undefined ? null : readConstructionFamilyCompositionPlan(compositionInput);
  if (plan.source.graph.upperBayGroups?.length && composition?.source.policy.openings)
    throw new Error("Opening-head variation cannot currently coexist with retained grouped bays. Disable that variation or explicitly remove the groups.");
  if (composition) {
    if (composition.source.familySeed !== plan.source.familySeed || composition.source.openingLock !== controls.lockOpenings)
      throw new Error("Family composition seed and opening-lock state must match the active family request.");
    const affected = [
      ...(composition.source.policy.openings ? ["construction/opening/upperFrontRoundHead", "construction/window/layout"] : []),
      ...(composition.source.policy.frontage ? ["construction/frontage/mode"] : []),
      ...(composition.source.policy.roof ? ["construction/roof/corniceAssembly", "construction/roof/parapetSilhouette"] : [])
    ];
    for (const lock of original.source.intent.locks) if (affected.some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/")))
      throw new Error(`Family composition conflicts with the pinned lock ${lock.semanticPath}.`);
  }
  if (original.source.documentId !== plan.source.graph.documentId) throw new Error("Family source identity does not match its pinned generation lineage.");
  if (controls.materialSeed !== original.source.intent.seeds.material || controls.trimSeed !== original.source.intent.seeds.trim) {
    throw new Error("Family generation must retain the pinned material and trim seeds.");
  }
  const members: Array<{ documentId: string; buildingSeed: string; lineage: ConstructionGenerationLineage;
    construction: Awaited<ReturnType<typeof evaluateConstruction>>; geometryHash: string; shapeHash: string }> = [];
  const usedGeometry = new Set<string>(), usedShapes = new Set<string>();
  for (const member of plan.members) {
    const old = original.source;
    const rebased = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: member.documentId,
      intent: old.intent, recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    abort(signal);
    const resolution = await resolveConstructionGeneration(rebased); abort(signal);
    const materialPlan = await planConstructionReferenceMaterials(original.materialPlan.templateSpec, rebased, original.materialPlan.options); abort(signal);
    if (materialPlan.materialInputsHash !== original.materialPlan.materialInputsHash || canonicalJson(materialPlan.atlas.manifest) !== canonicalJson(original.materialPlan.atlas.manifest)) {
      throw new Error("Family members must reuse the pinned material plan.");
    }
    const baseLineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage",
      source: rebased, resolution, materialPlan, materialSourceHash: original.materialSourceHash };
    let accepted: typeof members[number] | undefined;
    for (let attempt = 0; attempt < 12; attempt++) {
      abort(signal);
      const buildingSeed = createSeedTree(member.buildingSeed).fork(`candidate/${attempt}`).root;
      const generated = await resolveWorkbenchGeneration(member.graph, baseLineage, { ...controls, buildingSeed }, false); abort(signal);
      const nextMaterial = await planConstructionReferenceMaterials(original.materialPlan.templateSpec, generated.source, original.materialPlan.options); abort(signal);
      if (nextMaterial.materialInputsHash !== original.materialPlan.materialInputsHash || canonicalJson(nextMaterial.atlas.manifest) !== canonicalJson(original.materialPlan.atlas.manifest)) {
        throw new Error("Family variation would change the pinned material plan.");
      }
      const candidateGraph = composition ? applyConstructionFamilyComposition(generated.graph, composition, member.ordinal) : generated.graph;
      const construction = await evaluateConstruction(candidateGraph); abort(signal);
      BayConstructionWorkerReplySchema.parse({ schemaVersion: candidateGraph.schemaVersion, type: "bay-result", requestId: member.ordinal, result: construction });
      for (const layer of construction.surfaceComposition?.layers ?? []) {
        const target = layer.target;
        if (target.kind === "element" && !construction.ir.semanticIndex.some(entry =>
          entry.semanticPath === `building/${member.documentId}/${target.relativePath}`)) {
          throw new Error(`Family member ${member.ordinal} no longer contains the target for surface layer ${layer.id}.`);
        }
      }
      const fingerprint = await geometryHash(construction); abort(signal);
      const shape = candidateGraph.nodes.filter(node => ["Footprint", "Storeys", "SplitBays"].includes(node.type))
        .map(node => ({ type: node.type, parameters: "parameters" in node ? node.parameters : null }));
      const shapeHash = await hashCanonicalJson(shape); abort(signal);
      if (usedGeometry.has(fingerprint) || (!composition && usedShapes.has(shapeHash))) continue;
      usedGeometry.add(fingerprint); usedShapes.add(shapeHash);
      accepted = { documentId: member.documentId, buildingSeed, geometryHash: fingerprint, shapeHash, construction,
        lineage: { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: generated.source,
          resolution: generated.resolution, materialPlan: nextMaterial, materialSourceHash: original.materialSourceHash } };
      break;
    }
    if (!accepted) throw new Error(`Family member ${member.ordinal} could not produce distinct geometry without changing authored constraints.`);
    members.push(accepted);
  }
  const receipt = receiptSchema.parse({ schemaVersion: "0.1.0", kind: "construction-family-evaluation", familyId: plan.source.familyId,
    sourceDocumentId: plan.source.graph.documentId, materialSourceHash: original.materialSourceHash, referenceContentHash: original.source.referenceContentHash,
    members: members.map(member => ({ documentId: member.documentId, buildingSeed: member.buildingSeed,
      sourceContentHash: member.lineage.source.contentHash, geometryHash: member.geometryHash, shapeHash: member.shapeHash })) });
  return { receipt, members };
}
