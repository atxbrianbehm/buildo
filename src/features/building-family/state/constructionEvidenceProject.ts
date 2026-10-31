import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { ConstructionEvidenceApplicationSchema } from "../contracts/constructionEvidenceApplication";
import { canonicalJson } from "../core/canonicalJson";
import { readConstructionEvidenceApplication } from "../core/constructionEvidenceApplication";
import { hashCanonicalJson } from "../core/contentHash";
import { BayConstructionProjectSchema, readBayConstructionProject } from "./bayConstructionProject";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const payload = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-evidence-project"),
  project: BayConstructionProjectSchema, application: ConstructionEvidenceApplicationSchema }).strict();
export const ConstructionEvidenceProjectSchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());

/** A snapshot wrapper, not a new version of the existing construction project. */
export async function createConstructionEvidenceProject(projectInput: unknown, applicationInput: unknown) {
  const parsed = payload.parse({ schemaVersion: "0.1.0", kind: "construction-evidence-project", project: projectInput, application: applicationInput });
  if (canonicalJson(parsed.project) !== canonicalJson(projectInput) || canonicalJson(parsed.application) !== canonicalJson(applicationInput))
    throw new Error("Evidence project admission would change serialized fields.");
  const owned = structuredClone(parsed);
  const { project } = await readBayConstructionProject(owned.project), application = await readConstructionEvidenceApplication(owned.application);
  if (canonicalJson(project.graph) !== canonicalJson(application.resultGraph)) throw new Error("The application result must match the saved project graph.");
  if (canonicalJson(project.generation?.source ?? null) !== canonicalJson(application.generationSource))
    throw new Error("The application must use the saved project's generation source.");
  const result = { ...owned, project, application };
  return ConstructionEvidenceProjectSchema.parse({ ...result, contentHash: await hashCanonicalJson(result) });
}

export async function readConstructionEvidenceProject(input: unknown) {
  const parsed = ConstructionEvidenceProjectSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Evidence project admission would change serialized fields.");
  const owned = structuredClone(parsed), replay = await createConstructionEvidenceProject(owned.project, owned.application);
  if (canonicalJson(owned) !== canonicalJson(replay)) throw new Error("The evidence project does not match its saved contents.");
  return replay;
}
