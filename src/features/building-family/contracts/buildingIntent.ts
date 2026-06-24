import { z } from "zod";
import { SchemaVersion010, SeedsSchema, SemanticLockSchema } from "./shared";

export const TrimDensitySchema = z.enum(["restrained", "moderate", "ornate"]);

export const BuildingIntentSchema = z.object({
  schemaVersion: SchemaVersion010,
  prompt: z.string(),
  stylePackId: z.string().optional(),
  requested: z.object({
    floorCount: z.number().int().optional(),
    bayCount: z.number().int().optional(),
    wallMaterial: z.string().optional(),
    roofType: z.string().optional(),
    windowFamily: z.string().optional(),
    trimDensity: TrimDensitySchema.optional(),
    corniceFamily: z.string().optional(),
    weathering: z.number().min(0).max(1).optional(),
    symmetry: z.number().min(0).max(1).optional()
  }),
  seeds: SeedsSchema,
  locks: z.array(SemanticLockSchema),
  psg: z.object({
    sourceDocumentId: z.string().optional(),
    evaluatedVariables: z.record(z.string(), z.unknown()),
    traceId: z.string()
  })
});

export type TrimDensity = z.infer<typeof TrimDensitySchema>;
export type BuildingIntent = z.infer<typeof BuildingIntentSchema>;

