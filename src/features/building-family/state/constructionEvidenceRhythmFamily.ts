import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { ConstructionEvidenceApplicationSchema } from "../contracts/constructionEvidenceApplication";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { createConstructionEvidenceProject } from "./constructionEvidenceProject";
import { GroupedRhythmFamilyArchiveSchema, readGroupedRhythmFamilyArchive } from "./constructionGroupedRhythmFamilyArchive";
import { GroupedRhythmFabricArchiveSchema, readGroupedRhythmFabricArchive } from "./constructionGroupedRhythmFabricArchive";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const family = z.union([GroupedRhythmFamilyArchiveSchema, GroupedRhythmFabricArchiveSchema]);
const relation = z.object({ documentId: z.string().min(1), openingHead: z.enum(["matches-source", "differs-from-source", "unavailable"]) }).strict();
const payload = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-rhythm-family"),
  family, application: ConstructionEvidenceApplicationSchema, members: z.array(relation).length(6) }).strict();
export const ConstructionEvidenceRhythmFamilySchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
const request = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-rhythm-family-request"),
  family, application: ConstructionEvidenceApplicationSchema }).strict());

/** Bind a source interpretation to an existing deterministic family without asserting member evidence. */
export async function createConstructionEvidenceRhythmFamily(input: unknown) {
  const parsed = request.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Evidence family admission would change serialized fields.");
  const owned = structuredClone(parsed);
  const archived = owned.family.kind === "construction-grouped-rhythm-fabric-archive" ? (await readGroupedRhythmFabricArchive(owned.family)).family
    : await readGroupedRhythmFamilyArchive(owned.family);
  await createConstructionEvidenceProject(archived.request.sourceProject, owned.application);
  const value = owned.application.proposal.choice.value === "round" ? 1 : 0;
  const members = archived.result.members.map(member => {
    const opening = member.graph.nodes.find(node => node.id === "opening");
    return { documentId: member.graph.documentId, openingHead: opening?.type !== "PlaceOpening" || opening.bypassed ? "unavailable" as const
      : (opening.parameters.upperFrontRoundHead ?? 0) === value ? "matches-source" as const : "differs-from-source" as const };
  });
  const body = { schemaVersion: "0.1.0" as const, kind: "construction-evidence-rhythm-family" as const, family: owned.family, application: owned.application, members };
  return ConstructionEvidenceRhythmFamilySchema.parse({ ...body, contentHash: await hashCanonicalJson(body) });
}

export async function readConstructionEvidenceRhythmFamily(input: unknown) {
  const parsed = ConstructionEvidenceRhythmFamilySchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Evidence family admission would change serialized fields.");
  const owned = structuredClone(parsed), replay = await createConstructionEvidenceRhythmFamily({ schemaVersion: "0.1.0", kind: "construction-evidence-rhythm-family-request", family: owned.family, application: owned.application });
  if (canonicalJson(owned) !== canonicalJson(replay)) throw new Error("The evidence family does not replay from its source and members.");
  return replay;
}
