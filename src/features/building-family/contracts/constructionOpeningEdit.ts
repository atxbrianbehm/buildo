import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const coordinate = z.number().finite().min(-1000).max(1000);
const span = z.number().finite().positive().max(100);
const jsonValue = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

/** A structural address, never an instance-array index or nearest surviving window. */
export const ConstructionOpeningTargetSchema = z.object({
  documentId: id, storeysNodeId: id, windowNodeId: id, face: z.literal("front"),
  floorIndex: z.number().int().min(1).max(11), bayIndex: z.number().int().min(0).max(19)
}).strict();
export type ConstructionOpeningTarget = z.infer<typeof ConstructionOpeningTargetSchema>;

export const ConstructionOpeningWidthOverrideSchema = z.object({
  target: ConstructionOpeningTargetSchema, widthM: span
}).strict();

const opening = z.object({ kind: z.literal("window"), widthM: span, heightM: span,
  centerAlongM: coordinate, centerYM: coordinate }).strict();
const requestShape = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-opening-width-request"),
  ...ConstructionOpeningWidthOverrideSchema.shape,
  scope: z.object({ id: z.string().min(1).max(512), face: z.literal("front"),
    floorIndex: z.number().int().min(1).max(11), bayIndex: z.number().int().min(0).max(19),
    originM: z.tuple([coordinate, coordinate, coordinate]), sizeM: z.tuple([span, span, span]), opening
  }).strict(),
  frameWidthM: z.number().finite().min(0.025).max(0.2)
}).strict();

export const ConstructionOpeningWidthRequestSchema = jsonValue.pipe(requestShape);
export type ConstructionOpeningWidthRequest = z.infer<typeof ConstructionOpeningWidthRequestSchema>;

export const ConstructionOpeningWidthPlanSchema = jsonValue.pipe(z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-opening-width-plan"),
  source: requestShape, opening, leftPierM: span, rightPierM: span
}).strict());
export type ConstructionOpeningWidthPlan = z.infer<typeof ConstructionOpeningWidthPlanSchema>;

export const ConstructionOpeningSelectionSchema = jsonValue.pipe(z.object({
  documentId: id, storeysNodeId: id, windowNodeId: id, semanticPath: z.string().min(1).max(512)
}).strict());
