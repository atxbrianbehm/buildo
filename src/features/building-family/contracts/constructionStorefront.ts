import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const coordinate = z.number().finite().min(-1000).max(1000);
const span = z.number().finite().positive().max(100);
const rectangle = z.object({ leftM: coordinate, bottomM: coordinate, widthM: span, heightM: span }).strict();
const jsonValue = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

const requestShape = z.object({
  schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-storefront-request"),
  scope: z.object({
    id: z.string().min(1).max(512),
    face: z.enum(["front", "right", "rear", "left"]),
    floorIndex: z.number().int().min(0).max(11),
    bayIndex: z.number().int().min(0).max(19),
    originM: z.tuple([coordinate, coordinate, coordinate]),
    sizeM: z.tuple([span, span, span])
  }).strict(),
  assembly: z.enum(["display", "glazed-entrance"]),
  parameters: z.object({
    pierWidthM: z.number().finite().min(0.08).max(0.8),
    bulkheadHeightM: z.number().finite().min(0.2).max(1.2),
    headHeightM: z.number().finite().min(0.15).max(1.2),
    transomBaseM: z.number().finite().min(1.9).max(3),
    frameWidthM: z.number().finite().min(0.04).max(0.2),
    recessM: z.number().finite().min(0.02).max(2),
    entranceWidthM: z.number().finite().min(0.7).max(2.5)
  }).strict()
}).strict();

/** Independent planning artifact; not yet an admitted construction graph operator. */
export const ConstructionStorefrontRequestSchema = jsonValue.pipe(requestShape);
export type ConstructionStorefrontRequest = z.infer<typeof ConstructionStorefrontRequestSchema>;

const planShape = z.object({
  schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-storefront-plan"),
  source: requestShape,
  aperture: rectangle,
  lowerClearRegion: rectangle,
  transomRail: rectangle,
  transomClearRegion: rectangle
}).strict();

/** Shape admission only. Use readConstructionStorefrontPlan to verify derived dimensions. */
export const ConstructionStorefrontPlanSchema = jsonValue.pipe(planShape);
export type ConstructionStorefrontPlan = z.infer<typeof ConstructionStorefrontPlanSchema>;
