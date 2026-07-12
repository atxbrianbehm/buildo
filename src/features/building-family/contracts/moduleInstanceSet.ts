import { z } from "zod";
import { DiagnosticSchema } from "../core/diagnostics";
import { SchemaVersion010 } from "./shared";

export const ModuleInstanceSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  recipeRef: z.object({
    id: z.string().min(1),
    kind: z.string().min(1)
  }),
  facade: z.enum(["front", "rear", "left", "right"]),
  layer: z.enum(["wall", "opening", "trim", "roof", "corner"]),
  semanticPath: z.string().min(1),
  /** Column-major 4x4 translation (and later rotation) matrix. */
  transform: z.array(z.number()).length(16),
  boundsMeters: z.object({
    origin: z.tuple([z.number(), z.number(), z.number()]),
    size: z.tuple([z.number(), z.number(), z.number()])
  }),
  materialRoleBindings: z.record(z.string().min(1), z.string().min(1)),
  floorIndex: z.number().int().nonnegative(),
  bayIndex: z.number().int().nonnegative(),
  zone: z.string().min(1)
});

export const ModuleInstanceSetSchema = z.object({
  schemaVersion: SchemaVersion010,
  buildingId: z.string().min(1),
  familyId: z.string().min(1),
  sourcePlanHash: z.string().min(1),
  instances: z.array(ModuleInstanceSchema),
  diagnostics: z.array(DiagnosticSchema)
});

export type ModuleInstance = z.infer<typeof ModuleInstanceSchema>;
export type ModuleInstanceSet = z.infer<typeof ModuleInstanceSetSchema>;
