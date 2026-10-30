import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const binary = z.union([z.literal(0), z.literal(1)]);
const three = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-composition-request"),
  familySeed: z.string().min(1).max(128).refine(value => value.trim() === value),
  policy: z.object({ openings: z.boolean(), frontage: z.boolean(), roof: z.boolean() }).strict(),
  openingLock: z.boolean() }).strict();
const requestV2 = request.extend({ schemaVersion: z.literal("0.2.0"),
  policy: z.object({ openings: z.boolean(), frontage: z.boolean(), roof: z.boolean(), groupedBays: z.boolean() }).strict() }).strict();
const choice = z.object({ ordinal: z.number().int().min(1).max(6), head: binary.nullable(), sash: three.nullable(),
  frontage: binary.nullable(), cornice: three.nullable(), parapet: binary.nullable() }).strict();
const groupCount = z.union([z.literal(0), z.literal(2), z.literal(3)]);
const choiceV2 = choice.extend({ groupedBays: groupCount.nullable() }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-family-composition-plan"), catalog: z.literal("commercial-demo-compositions-v1"), source: request,
  members: z.array(choice).length(6) }).strict();
const planV2 = z.object({ schemaVersion: z.literal("0.2.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v2"), source: requestV2, members: z.array(choiceV2).length(6) }).strict();
export const ConstructionFamilyCompositionRequestSchema = json.pipe(z.discriminatedUnion("schemaVersion", [request, requestV2]));
export const ConstructionFamilyCompositionPlanV1Schema = json.pipe(plan);
export const ConstructionFamilyCompositionPlanV2Schema = json.pipe(planV2);
export const ConstructionFamilyCompositionPlanSchema = json.pipe(z.discriminatedUnion("schemaVersion", [plan, planV2]));
export type ConstructionFamilyCompositionPlan = z.infer<typeof ConstructionFamilyCompositionPlanSchema>;
export type ConstructionFamilyCompositionChoice = z.infer<typeof choice> | z.infer<typeof choiceV2>;
