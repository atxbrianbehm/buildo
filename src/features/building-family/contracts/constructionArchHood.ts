import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { ConstructionRoundHeadPlanSchema } from "./constructionRoundHead";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-arch-hood-request"), opening: ConstructionRoundHeadPlanSchema,
  bandM: z.number().finite().min(0.04).max(0.25), projectionM: z.number().finite().min(0.02).max(0.2),
  jointM: z.number().finite().min(0.004).max(0.03), keystoneRiseM: z.number().finite().min(0).max(0.1),
  stoneCount: z.union([z.literal(5), z.literal(7), z.literal(9), z.literal(11)]) }).strict();
export const ConstructionArchHoodRequestSchema = json.pipe(request);
export const ConstructionArchHoodPlanSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-arch-hood-plan"), source: request,
  centerM: z.tuple([z.number().finite(), z.number().finite()]), innerRadiusM: z.number().positive(),
  stones: z.array(z.object({ startRad: z.number().finite(), endRad: z.number().finite(), outerRadiusM: z.number().positive(), keystone: z.boolean() }).strict()).min(5).max(11) }).strict());
