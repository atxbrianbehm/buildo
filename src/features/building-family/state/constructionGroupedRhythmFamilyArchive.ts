import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { ConstructionFamilyPlanSchema } from "../contracts/constructionFamilyPlan";
import { ConstructionFamilyCompositionPlanSchema } from "../contracts/constructionFamilyComposition";
import { GroupedRhythmFamilyPolicySchema, GroupedRhythmFamilyReceiptSchema } from "../contracts/constructionGroupedRhythmFamilyStudy";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { BayConstructionProjectSchema, readBayConstructionProject } from "./bayConstructionProject";
import { ConstructionGenerationLineageSchema } from "./constructionGenerationState";
import { resolveConstructionGroupedRhythmFamilyStudy } from "./constructionGroupedRhythmFamilyStudy";

const controls = z.object({ recipeId: z.string().min(1).max(512).optional(), floorCount: z.number().int().min(2).max(6), bayCount: z.number().int().min(3).max(6),
  buildingSeed: z.string().trim().min(1).max(256), materialSeed: z.string().trim().min(1).max(256), trimSeed: z.string().trim().min(1).max(256),
  lockFootprint: z.boolean(), lockStoreys: z.boolean(), lockOpenings: z.boolean(), preserveAuthored: z.boolean() }).strict();
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-rhythm-family-archive-request"),
  sourceProject: BayConstructionProjectSchema, plan: ConstructionFamilyPlanSchema, composition: ConstructionFamilyCompositionPlanSchema,
  policy: GroupedRhythmFamilyPolicySchema, controls }).strict();
const result = z.object({ receipt: GroupedRhythmFamilyReceiptSchema, members: z.array(z.object({ graph: BayConstructionGraphSchema,
  generation: ConstructionGenerationLineageSchema }).strict()).length(6) }).strict();
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const GroupedRhythmFamilyArchiveSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-rhythm-family-archive"),
  request, result, contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());

async function replay(input: z.infer<typeof request>) {
  const { project } = await readBayConstructionProject(input.sourceProject);
  if (project.schemaVersion !== "0.19.0" || !project.generation || !project.awningFabric) throw new Error("A signed source project with generation and fabric is required.");
  if (canonicalJson(project.graph) !== canonicalJson(input.plan.source.graph)) throw new Error("Family plan must use the archived source project graph.");
  const family = await resolveConstructionGroupedRhythmFamilyStudy(input.plan, project.generation, input.controls, input.composition, input.policy);
  return result.parse({ receipt: family.receipt, members: family.members.map(member => ({ graph: member.construction.graph, generation: member.lineage })) });
}

/** Portable experimental source: replays the signed family and carries materials once in the source project. */
export async function createGroupedRhythmFamilyArchive(input: unknown) {
  const owned = structuredClone(json.pipe(request).parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Archive request admission would change serialized fields.");
  const payload = { schemaVersion: "0.1.0" as const, kind: "construction-grouped-rhythm-family-archive" as const, request: owned, result: await replay(owned) };
  return GroupedRhythmFamilyArchiveSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Recheck the archive hash, source materials and each final member against deterministic replay. */
export async function readGroupedRhythmFamilyArchive(input: unknown) {
  const owned = structuredClone(GroupedRhythmFamilyArchiveSchema.parse(input));
  if (canonicalJson(owned) !== canonicalJson(input)) throw new Error("Archive admission would change serialized fields.");
  const { contentHash, ...payload } = owned;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Family archive content does not match its saved hash.");
  if (canonicalJson(await replay(owned.request)) !== canonicalJson(owned.result)) throw new Error("Family archive does not replay its final members and receipt.");
  return owned;
}
