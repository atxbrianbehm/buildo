import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const span = z.number().finite().positive().max(100);
const coordinate = z.number().finite().min(-1000).max(1000);
const depth = z.number().finite().min(0).max(0.4);
const profilePoint = z.object({ yM: coordinate, depthM: depth }).strict();
const face = z.enum(["front", "right", "rear", "left"]);
const jsonValue = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

export const ConstructionCorniceAssemblySchema = z.enum(["moulded", "dentil-course", "bracket-course"]);
const requestShape = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-cornice-detail-request"),
  assembly: ConstructionCorniceAssemblySchema,
  building: z.object({ widthM: span, depthM: span, heightM: span }).strict(),
  cornice: z.object({ heightM: z.number().finite().min(0.1).max(0.6), projectionM: z.number().finite().min(0.08).max(0.4) }).strict()
}).strict();

/** Independent geometric planning, not yet a construction graph instruction. */
export const ConstructionCorniceDetailRequestSchema = jsonValue.pipe(requestShape);
export type ConstructionCorniceDetailRequest = z.infer<typeof ConstructionCorniceDetailRequestSchema>;

const recipe = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("dentil"), widthM: span, bottomM: coordinate, topM: coordinate,
    backDepthM: span, frontDepthM: span, bevelM: span }).strict(),
  z.object({ kind: z.literal("bracket"), widthM: span, backDepthM: span,
    profile: z.array(profilePoint).min(2).max(32) }).strict()
]);
const planShape = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-cornice-detail-plan"),
  source: requestShape, unitBudget: z.literal(512),
  envelopeProfile: z.array(profilePoint).min(3).max(32),
  backingProfile: z.array(profilePoint).min(3).max(32), recipe,
  faces: z.array(z.object({ face, spanM: span, count: z.number().int().min(0).max(512),
    pitchM: z.number().finite().min(0).max(100), endInsetM: z.number().finite().min(0).max(100),
    occupiedM: z.number().finite().min(0).max(100), marginM: z.number().finite().min(0).max(100), firstCenterM: coordinate }).strict()).length(4),
  units: z.array(z.object({ id: z.string().regex(/^(front|right|rear|left)\/[0-9]+$/), face,
    ordinal: z.number().int().min(0).max(511), centerAlongM: coordinate }).strict()).max(512)
}).strict();

/** Shape admission only; readConstructionCorniceDetailPlan verifies all derived data. */
export const ConstructionCorniceDetailPlanSchema = jsonValue.pipe(planShape);
export type ConstructionCorniceDetailPlan = z.infer<typeof ConstructionCorniceDetailPlanSchema>;
