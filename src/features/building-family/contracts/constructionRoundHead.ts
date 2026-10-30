import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const finite = z.number().finite().min(-1000).max(1000);
const positive = z.number().finite().positive().max(100);
const point = z.tuple([finite, finite]);
const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

const request = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-round-head-request"),
  scope: z.object({
    id: z.string().trim().min(1).max(512), face: z.enum(["front", "right", "rear", "left"]),
    floorIndex: z.number().int().min(1).max(11), bayIndex: z.number().int().min(0).max(19),
    originM: z.tuple([finite, finite, finite]), sizeM: z.tuple([positive, positive, positive])
  }).strict(),
  parameters: z.object({
    widthM: z.number().finite().min(0.5).max(5), heightM: z.number().finite().min(0.7).max(8),
    sillM: z.number().finite().min(0).max(5), frameWidthM: z.number().finite().min(0.02).max(0.2),
    revealDepthM: z.number().finite().min(0.02).max(2), masonryMarginM: z.number().finite().min(0.08).max(1)
  }).strict()
}).strict();

export const ConstructionRoundHeadRequestSchema = json.pipe(request);
export type ConstructionRoundHeadRequest = z.infer<typeof ConstructionRoundHeadRequestSchema>;
const contour = z.object({ pointsM: z.array(point).length(19), springY: finite, radiusM: positive }).strict();
export const ConstructionRoundHeadPlanSchema = json.pipe(z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-round-head-plan"), source: request,
  aperture: contour, glazing: contour, revealDepthM: positive
}).strict());
export type ConstructionRoundHeadPlan = z.infer<typeof ConstructionRoundHeadPlanSchema>;
