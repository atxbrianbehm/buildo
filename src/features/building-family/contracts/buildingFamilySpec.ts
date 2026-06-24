import { z } from "zod";
import { DiagnosticSchema } from "../core/diagnostics";
import { SchemaVersion010, SeedsSchema, SemanticLockSchema, VariationScopeSchema } from "./shared";

export const BuildingFamilySpecSchema = z.object({
  schemaVersion: SchemaVersion010,
  familyId: z.string(),
  sourceIntentHash: z.string(),
  stylePackId: z.string(),
  seeds: SeedsSchema,
  massing: z.object({
    widthM: z.number().positive(),
    depthM: z.number().positive(),
    floorCount: z.number().int().positive(),
    floorHeightsM: z.array(z.number().positive()),
    parapetHeightM: z.number().nonnegative(),
    roof: z.object({
      type: z.enum(["flat", "gable"]),
      pitchDegrees: z.number().positive().optional()
    })
  }),
  facade: z.object({
    frontBayCount: z.number().int().positive(),
    sideBaySpacingM: z.number().positive(),
    groundFloorRatio: z.number().positive(),
    corniceHeightM: z.number().positive(),
    symmetry: z.number().min(0).max(1)
  }),
  selectedFamilies: z.object({
    wall: z.string(),
    roof: z.string(),
    window: z.string(),
    door: z.string(),
    cornice: z.string(),
    trim: z.string(),
    pilaster: z.string().optional(),
    ornament: z.string().optional()
  }),
  materialParameters: z.record(z.string(), z.unknown()),
  componentParameters: z.record(z.string(), z.unknown()),
  variationPolicy: z.record(z.string(), VariationScopeSchema),
  locks: z.array(SemanticLockSchema),
  diagnostics: z.array(DiagnosticSchema)
});

export type BuildingFamilySpec = z.infer<typeof BuildingFamilySpecSchema>;

