import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { constructionUsesOperator, validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";
import { BuildingSourceFileSchema, parseBuildingSourceFile } from "./buildingSourceFile";
import { ConstructionGenerationLineageSchema } from "./constructionGenerationState";
import { validateGeneration } from "./bayConstructionProject";
import { ConstructionFamilyCompositionPlanV1Schema, ConstructionFamilyCompositionPlanV2Schema, ConstructionFamilyCompositionPlanV3Schema, ConstructionFamilyCompositionPlanV4Schema, ConstructionFamilyCompositionPlanV5Schema } from "../contracts/constructionFamilyComposition";
import { readConstructionFamilyCompositionPlan } from "../core/constructionFamilyComposition";
import { ConstructionAwningFabricArtifactSchema } from "../contracts/constructionAwningFabric";
import { readConstructionAwningFabric } from "../materials/constructionAwningFabric";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const common = {
  kind: z.literal("construction-family-source"),
  familyId: id, sourceDocumentId: id, familySeed: z.string().min(1).max(128).refine(value => value.trim() === value),
  sourceGraph: BayConstructionGraphSchema, sourceGeneration: ConstructionGenerationLineageSchema, materialSource: BuildingSourceFileSchema,
  members: z.array(z.object({ documentId: id, graph: BayConstructionGraphSchema, generation: ConstructionGenerationLineageSchema }).strict()).length(6)
};
const legacyPayload = z.object({ schemaVersion: z.literal("0.2.0"), ...common }).strict();
const composedPayload = z.object({ schemaVersion: z.literal("0.3.0"), ...common, initialComposition: ConstructionFamilyCompositionPlanV1Schema }).strict();
const groupedPayload = z.object({ schemaVersion: z.literal("0.4.0"), ...common, initialComposition: ConstructionFamilyCompositionPlanV2Schema }).strict();
const dividedPayload = z.object({ schemaVersion: z.literal("0.5.0"), ...common,
  initialComposition: z.union([ConstructionFamilyCompositionPlanV1Schema, ConstructionFamilyCompositionPlanV2Schema]).optional() }).strict();
const variedStorefrontPayload = z.object({ schemaVersion: z.literal("0.6.0"), ...common, initialComposition: ConstructionFamilyCompositionPlanV3Schema }).strict();
const massingPayload = z.object({ schemaVersion: z.literal("0.7.0"), ...common, initialComposition: ConstructionFamilyCompositionPlanV4Schema }).strict();
const awningPayload = z.object({ schemaVersion: z.literal("0.8.0"), ...common, awningFabric: ConstructionAwningFabricArtifactSchema,
  initialComposition: z.union([ConstructionFamilyCompositionPlanV1Schema, ConstructionFamilyCompositionPlanV2Schema, ConstructionFamilyCompositionPlanV3Schema, ConstructionFamilyCompositionPlanV4Schema]).optional() }).strict();
const variedAwningPayload = z.object({ schemaVersion: z.literal("0.9.0"), ...common, awningFabric: ConstructionAwningFabricArtifactSchema, initialComposition: ConstructionFamilyCompositionPlanV5Schema }).strict();
const supportPayload = z.object({ schemaVersion: z.literal("0.10.0"), ...common, awningFabric: ConstructionAwningFabricArtifactSchema,
  initialComposition: z.union([ConstructionFamilyCompositionPlanV1Schema, ConstructionFamilyCompositionPlanV2Schema, ConstructionFamilyCompositionPlanV3Schema, ConstructionFamilyCompositionPlanV4Schema, ConstructionFamilyCompositionPlanV5Schema]).optional() }).strict();
const payload = z.discriminatedUnion("schemaVersion", [legacyPayload, composedPayload, groupedPayload, dividedPayload, variedStorefrontPayload, massingPayload, awningPayload, variedAwningPayload, supportPayload]);
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const ConstructionFamilySourceSchema = json.pipe(z.discriminatedUnion("schemaVersion", [
  legacyPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  composedPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  groupedPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  dividedPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  variedStorefrontPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  massingPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  awningPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  variedAwningPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  supportPayload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
]));
export type ConstructionFamilySource = z.infer<typeof ConstructionFamilySourceSchema>;
export type ConstructionFamilyPayload = z.infer<typeof payload>;

function requireBuildingGraph(graph: z.infer<typeof BayConstructionGraphSchema>) {
  if (!["0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0"].includes(graph.schemaVersion))
    throw new Error("Family buildings must use a whole-building graph version that supports generation lineage.");
  if (!constructionUsesOperator(graph, "Footprint") || !constructionUsesOperator(graph, "Storeys") || !constructionUsesOperator(graph, "EmitWall"))
    throw new Error("Family buildings must retain a connected whole-building graph.");
}

async function validate(source: z.infer<typeof payload>) {
  if (source.schemaVersion === "0.3.0" || source.schemaVersion === "0.4.0" || source.schemaVersion === "0.6.0" || source.schemaVersion === "0.7.0" || source.schemaVersion === "0.9.0" || (source.schemaVersion === "0.5.0" || source.schemaVersion === "0.8.0" || source.schemaVersion === "0.10.0") && source.initialComposition) {
    const composition = readConstructionFamilyCompositionPlan(source.initialComposition);
    if (composition.source.familySeed !== source.familySeed) throw new Error("Family composition must retain the family seed.");
  }
  if (source.schemaVersion === "0.8.0" || source.schemaVersion === "0.9.0" || source.schemaVersion === "0.10.0") await readConstructionAwningFabric(source.awningFabric);
  if (source.schemaVersion !== "0.8.0" && source.schemaVersion !== "0.9.0" && source.schemaVersion !== "0.10.0" && [source.sourceGraph, ...source.members.map(member => member.graph)].some(graph => graph.schemaVersion === "0.13.0"))
    throw new Error("Awning family graphs require family source version 0.8.0 and its fabric.");
  const supportedGraphs = [source.sourceGraph, ...source.members.map(member => member.graph)].some(graph => graph.schemaVersion === "0.14.0");
  if ((source.schemaVersion === "0.10.0") !== supportedGraphs) throw new Error("Support family graphs require family source version 0.10.0.");
  if (source.schemaVersion !== "0.5.0" && source.schemaVersion !== "0.6.0" && source.schemaVersion !== "0.7.0" && source.schemaVersion !== "0.8.0" && source.schemaVersion !== "0.9.0" && source.schemaVersion !== "0.10.0" && [source.sourceGraph, ...source.members.map(member => member.graph)].some(graph => graph.schemaVersion === "0.12.0"))
    throw new Error("Divided storefront family graphs require family source version 0.5.0.");
  const ids = new Set(source.members.map(member => member.documentId));
  if (ids.size !== 6 || ids.has(source.sourceDocumentId)) throw new Error("Family member identities must be unique and separate from the source building.");
  const seeds = new Set(source.members.map(member => member.generation.source.intent.seeds.building));
  if (seeds.size !== 6) throw new Error("Family members must retain distinct building seeds.");
  const reference = source.members[0].generation.source.referenceContentHash;
  const materialInputs = source.members[0].generation.materialPlan.materialInputsHash;
  const materials = await parseBuildingSourceFile(source.materialSource);
  if (source.sourceGraph.documentId !== source.sourceDocumentId || source.sourceGeneration.source.referenceContentHash !== reference ||
      source.sourceGeneration.materialPlan.materialInputsHash !== materialInputs)
    throw new Error("The original building must match the family identity and pinned reference and material inputs.");
  requireBuildingGraph(source.sourceGraph);
  validateConstructionSurfaceSources(source.sourceGraph, materials.packedAtlas);
  await validateGeneration({ graph: source.sourceGraph, materialSource: source.materialSource, generation: source.sourceGeneration }, materials.packedAtlas.manifest);
  for (const member of source.members) {
    if (member.documentId !== member.graph.documentId) throw new Error("Family member identity does not match its graph.");
    requireBuildingGraph(member.graph);
    if (member.generation.source.referenceContentHash !== reference || member.generation.materialPlan.materialInputsHash !== materialInputs)
      throw new Error("Family members must share pinned reference and material inputs.");
    validateConstructionSurfaceSources(member.graph, materials.packedAtlas);
    await validateGeneration({ graph: member.graph, materialSource: source.materialSource, generation: member.generation }, materials.packedAtlas.manifest);
  }
}

/** Capture the source before the first asynchronous validation. */
export async function createConstructionFamilySource(input: unknown): Promise<ConstructionFamilySource> {
  const owned = structuredClone(json.pipe(payload).parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family source admission would change serialized fields.");
  await validate(owned);
  return ConstructionFamilySourceSchema.parse({ ...owned, contentHash: await hashCanonicalJson(owned) });
}

/** Recheck the full source, including material bytes and each member lineage. */
export async function readConstructionFamilySource(input: unknown): Promise<ConstructionFamilySource> {
  json.parse(input);
  if (input && typeof input === "object" && "schemaVersion" in input && input.schemaVersion === "0.1.0")
    throw new Error("Family source version 0.1.0 lacks the original building; regenerate it from the original construction before reopening.");
  const owned = structuredClone(ConstructionFamilySourceSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Family source admission would change serialized fields.");
  const { contentHash, ...source } = owned;
  if (await hashCanonicalJson(source) !== contentHash) throw new Error("Family source content does not match its saved hash.");
  await validate(source);
  return owned;
}
