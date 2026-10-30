import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const finite = z.number().finite();
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const floor = z.object({ floorIndex: z.number().int().min(1).max(11), bottomM: finite.min(0), topM: finite.max(100),
  openingSpans: z.array(z.tuple([finite, finite])).max(60) }).strict();
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-facade-pier-request"),
  facadeWidthM: finite.min(3).max(100), bayCount: z.number().int().min(2).max(20),
  floors: z.array(floor).min(1).max(11), pierWidthM: finite.min(0.16).max(0.8),
  projectionM: finite.min(0.05).max(0.4), endHeightM: finite.min(0.08).max(0.3), clearanceM: finite.min(0.02).max(0.5) }).strict();
const pier = z.object({ floorIndex: z.number().int(), edgeIndex: z.number().int(), centerXM: finite,
  bottomM: finite, topM: finite, shaftWidthM: finite, endWidthM: finite }).strict();
const plan = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-facade-pier-plan"), source: request,
  piers: z.array(pier).min(3).max(231) }).strict();
export const ConstructionFacadePierRequestSchema = json.pipe(request);
export const ConstructionFacadePierPlanSchema = json.pipe(plan);
export type ConstructionFacadePierPlan = z.infer<typeof ConstructionFacadePierPlanSchema>;
