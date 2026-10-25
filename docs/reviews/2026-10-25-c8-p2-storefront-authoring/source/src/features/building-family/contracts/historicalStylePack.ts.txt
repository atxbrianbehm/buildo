import { z } from "zod";
import { SchemaVersion010, VariationScopeSchema } from "./shared";

const RangeSchema = z.object({
  min: z.number(),
  max: z.number()
});

const WeightedStringSchema = z.object({
  id: z.string(),
  weight: z.number().positive()
});

export const HistoricalStylePackSchema = z.object({
  schemaVersion: SchemaVersion010,
  id: z.string(),
  label: z.string(),
  region: z.string(),
  dateRange: z.object({
    startYear: z.number().int(),
    endYear: z.number().int()
  }),
  typologies: z.array(z.string()),
  curation: z.object({
    status: z.enum(["draft", "demo", "reviewed"]),
    author: z.string(),
    reviewer: z.string().nullable(),
    notes: z.string(),
    references: z.array(z.string())
  }),
  massing: z.object({
    floorCount: RangeSchema,
    floorHeightM: z.object({
      ground: z.number().positive(),
      typical: RangeSchema
    }),
    widthM: RangeSchema,
    depthM: RangeSchema,
    parapetHeightM: RangeSchema,
    roofTypes: z.array(z.enum(["flat", "gable"]))
  }),
  facade: z.object({
    frontBayCount: RangeSchema,
    sideBaySpacingM: RangeSchema,
    groundFloorRatio: RangeSchema,
    corniceHeightM: RangeSchema,
    symmetry: RangeSchema
  }),
  componentFamilies: z.object({
    windows: z.array(z.string()),
    doors: z.array(z.string()),
    trims: z.array(z.string()),
    roofs: z.array(z.string()),
    pilasters: z.array(z.string()),
    cornices: z.array(z.string()),
    walls: z.array(z.string()),
    ornaments: z.array(z.string())
  }),
  compatibility: z.object({
    forbidden: z.array(
      z.object({
        when: z.record(z.string(), z.string()),
        reason: z.string()
      })
    )
  }),
  materialPalette: z.object({
    wall: z.array(WeightedStringSchema),
    roof: z.array(WeightedStringSchema),
    frame: z.array(WeightedStringSchema),
    glass: z.array(WeightedStringSchema),
    door: z.array(WeightedStringSchema)
  }),
  distributions: z.record(z.string(), z.array(WeightedStringSchema)),
  materialPromptVocabulary: z.record(z.string(), z.array(z.string())),
  componentParameterRanges: z.record(z.string(), z.record(z.string(), RangeSchema)),
  variationPolicy: z.record(z.string(), VariationScopeSchema),
  defaults: z.object({
    floorCount: z.number().int(),
    bayCount: z.number().int(),
    wallMaterial: z.string(),
    roofType: z.enum(["flat", "gable"]),
    windowFamily: z.string(),
    doorFamily: z.string(),
    corniceFamily: z.string(),
    trimFamily: z.string(),
    pilasterFamily: z.string().optional(),
    ornamentFamily: z.string().optional(),
    trimDensity: z.enum(["restrained", "moderate", "ornate"]),
    weathering: z.number().min(0).max(1),
    symmetry: z.number().min(0).max(1)
  })
});

export type HistoricalStylePack = z.infer<typeof HistoricalStylePackSchema>;

