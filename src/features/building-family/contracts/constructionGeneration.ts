import { z } from "zod";
import { BuildingIntentSchema } from "./buildingIntent";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { TextureDescriptionGraphSchema } from "../utdg/textureDescriptionContracts";

const text = z.string().trim().min(1).max(2048);
const identifier = z.string().min(1).max(512).refine(value => value.trim() === value, "Identifiers cannot have surrounding whitespace.");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const json = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

/** No lossy admission, implicit defaults, accessors, or caller-owned unknown values. */
function exactJson<T extends z.ZodType>(shape: T) {
  return json.transform((input, context): z.output<T> => {
    const result = shape.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) context.addIssue({ ...issue });
      return z.NEVER;
    }
    if (canonicalJson(input) !== canonicalJson(result.data)) {
      context.addIssue({ code: "custom", message: "Generation source must contain only explicit supported JSON fields." });
      return z.NEVER;
    }
    return structuredClone(result.data);
  });
}

const claim = z.object({
  id: identifier,
  subject: identifier,
  statement: text,
  sourceId: identifier,
  locator: text,
  basis: z.enum(["demo", "observed", "inferred", "generated"]),
  confidence: z.number().finite().min(0).max(1).nullable(),
  review: z.enum(["unreviewed", "reviewed", "rejected"])
}).strict();

const referenceShape = z.object({
  schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-reference-snapshot"),
  id: identifier,
  revision: identifier,
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("local-demo"), locator: text }).strict(),
    z.object({
      kind: z.literal("utdg-snapshot"), snapshotId: identifier,
      contentHash: hash, locator: text
    }).strict()
  ]),
  architectureCoverage: z.enum(["unknown", "partial", "supported"]),
  coverageNotes: text,
  claims: z.array(claim).max(1024),
  materialBrief: TextureDescriptionGraphSchema
}).strict().superRefine((reference, context) => {
  if (new Set(reference.claims.map(value => value.id)).size !== reference.claims.length)
    context.addIssue({ code: "custom", path: ["claims"], message: "Reference claim IDs must be unique." });
  if (reference.materialBrief.status === "retired")
    context.addIssue({ code: "custom", path: ["materialBrief"], message: "Retired material briefs cannot seed a new generation." });
  if (reference.origin.kind === "local-demo") {
    if (reference.architectureCoverage !== "unknown" ||
        reference.claims.some(value => value.basis !== "demo" || value.confidence !== null || value.review !== "unreviewed"))
      context.addIssue({ code: "custom", message: "Demo references must retain unknown architecture coverage and unreviewed demo claims." });
  } else if (reference.architectureCoverage !== "unknown" && !reference.claims.some(value =>
    value.subject === "architecture" && value.basis === "observed" && value.review === "reviewed" &&
    value.confidence !== null && value.confidence > 0))
    context.addIssue({ code: "custom", message: "Architectural coverage needs a reviewed observed architecture claim with explicit confidence." });
});

/** Buildo's normalized boundary, not an upstream UTDG service or record schema. */
export const ConstructionReferenceSnapshotSchema = exactJson(referenceShape);
export type ConstructionReferenceSnapshot = z.infer<typeof ConstructionReferenceSnapshotSchema>;

const common = {
  schemaVersion: z.literal("0.1.0"),
  documentId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/),
  intent: BuildingIntentSchema,
  recipe: z.object({ id: identifier, version: identifier, contentHash: hash }).strict(),
  reference: referenceShape,
  intentionalExceptions: z.array(z.object({ claimId: identifier, reason: text }).strict()).max(1024)
};
type Relations = {
  intent: { locks: Array<{ semanticPath: string }> };
  reference: z.infer<typeof referenceShape>;
  intentionalExceptions: Array<{ claimId: string }>;
};
function validateRelations(value: Relations, context: z.RefinementCtx) {
  const locks = value.intent.locks.map(lock => lock.semanticPath);
  if (locks.some(path => !path.trim() || path !== path.trim()) || new Set(locks).size !== locks.length)
    context.addIssue({ code: "custom", path: ["intent", "locks"], message: "Generation locks need unique explicit semantic paths." });
  const claims = new Set(value.reference.claims.map(item => item.id));
  const exceptions = value.intentionalExceptions.map(item => item.claimId);
  if (exceptions.some(id => !claims.has(id)) || new Set(exceptions).size !== exceptions.length)
    context.addIssue({ code: "custom", path: ["intentionalExceptions"], message: "Intentional exceptions need distinct existing claim IDs." });
}
export const ConstructionGenerationInputSchema = exactJson(z.object({
  ...common, kind: z.literal("construction-generation-input")
}).strict().superRefine(validateRelations));

/** Input lineage only: the authored construction graph remains separately authoritative. */
export const ConstructionGenerationSourceSchema = exactJson(z.object({
  ...common, kind: z.literal("construction-generation-source"),
  referenceContentHash: hash, contentHash: hash
}).strict().superRefine(validateRelations));
export type ConstructionGenerationInput = z.infer<typeof ConstructionGenerationInputSchema>;
export type ConstructionGenerationSource = z.infer<typeof ConstructionGenerationSourceSchema>;
