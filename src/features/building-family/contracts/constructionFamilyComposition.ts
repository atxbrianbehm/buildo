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
const requestV3 = requestV2.extend({ schemaVersion: z.literal("0.3.0"),
  policy: z.object({ openings: z.boolean(), frontage: z.boolean(), roof: z.boolean(), groupedBays: z.boolean(), storefrontLights: z.boolean() }).strict() }).strict();
const requestV4 = requestV3.extend({ schemaVersion: z.literal("0.4.0"),
  policy: z.object({ openings: z.boolean(), frontage: z.boolean(), roof: z.boolean(), groupedBays: z.boolean(), storefrontLights: z.boolean(), massing: z.boolean() }).strict() }).strict();
const requestV5 = requestV4.extend({ schemaVersion: z.literal("0.5.0"),
  policy: requestV4.shape.policy.extend({ awnings: z.boolean() }).strict() }).strict();
const requestV6 = requestV5.extend({ schemaVersion: z.literal("0.6.0"),
  policy: requestV5.shape.policy.extend({ entranceBay: z.boolean() }).strict() }).strict();
const choice = z.object({ ordinal: z.number().int().min(1).max(6), head: binary.nullable(), sash: three.nullable(),
  frontage: binary.nullable(), cornice: three.nullable(), parapet: binary.nullable() }).strict();
const groupCount = z.union([z.literal(0), z.literal(2), z.literal(3)]);
const choiceV2 = choice.extend({ groupedBays: groupCount.nullable() }).strict();
const lightChoice = z.object({ displayLights: z.union([z.literal(1), z.literal(2)]), transomLights: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict();
const choiceV3 = choiceV2.extend({ storefrontLights: lightChoice.nullable() }).strict();
const massingChoice = z.object({ floorCount: z.union([z.literal(2), z.literal(3), z.literal(4)]), bayCount: z.union([z.literal(3), z.literal(4), z.literal(5)]) }).strict();
const choiceV4 = choiceV3.extend({ massing: massingChoice.nullable() }).strict();
const choiceV5 = choiceV4.extend({ extraAwnings: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable(), bayOffset: z.number().int().min(0).max(19).nullable() }).strict();
const choiceV6 = choiceV5.extend({ entranceOffset: z.number().int().min(0).max(19).nullable() }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-family-composition-plan"), catalog: z.literal("commercial-demo-compositions-v1"), source: request,
  members: z.array(choice).length(6) }).strict();
const planV2 = z.object({ schemaVersion: z.literal("0.2.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v2"), source: requestV2, members: z.array(choiceV2).length(6) }).strict();
const planV3 = z.object({ schemaVersion: z.literal("0.3.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v3"), source: requestV3, members: z.array(choiceV3).length(6) }).strict();
const planV4 = z.object({ schemaVersion: z.literal("0.4.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v4"), source: requestV4, members: z.array(choiceV4).length(6) }).strict();
const planV5 = z.object({ schemaVersion: z.literal("0.5.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v5"), source: requestV5, members: z.array(choiceV5).length(6) }).strict();
const planV6 = z.object({ schemaVersion: z.literal("0.6.0"), kind: z.literal("construction-family-composition-plan"),
  catalog: z.literal("commercial-demo-compositions-v6"), source: requestV6, members: z.array(choiceV6).length(6) }).strict();
export const ConstructionFamilyCompositionRequestSchema = json.pipe(z.discriminatedUnion("schemaVersion", [request, requestV2, requestV3, requestV4, requestV5, requestV6]));
export const ConstructionFamilyCompositionPlanV1Schema = json.pipe(plan);
export const ConstructionFamilyCompositionPlanV2Schema = json.pipe(planV2);
export const ConstructionFamilyCompositionPlanV3Schema = json.pipe(planV3);
export const ConstructionFamilyCompositionPlanV4Schema = json.pipe(planV4);
export const ConstructionFamilyCompositionPlanV5Schema = json.pipe(planV5);
export const ConstructionFamilyCompositionPlanV6Schema = json.pipe(planV6);
export const ConstructionFamilyCompositionPlanSchema = json.pipe(z.discriminatedUnion("schemaVersion", [plan, planV2, planV3, planV4, planV5, planV6]));
export type ConstructionFamilyCompositionPlan = z.infer<typeof ConstructionFamilyCompositionPlanSchema>;
export type ConstructionFamilyCompositionChoice = z.infer<typeof choice> | z.infer<typeof choiceV2> | z.infer<typeof choiceV3> | z.infer<typeof choiceV4> | z.infer<typeof choiceV5> | z.infer<typeof choiceV6>;
