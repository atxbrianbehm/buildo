import { z } from "zod";
import { DiagnosticSchema } from "../core/diagnostics";

export const SchemaVersion010 = z.literal("0.1.0");

export const SemanticLockSchema = z.object({
  semanticPath: z.string(),
  scope: z.enum(["family", "building", "element"]).default("element"),
  lockedValue: z.unknown(),
  reason: z.string().optional()
});

export const SeedsSchema = z.object({
  family: z.string().min(1),
  building: z.string().min(1),
  material: z.string().min(1),
  trim: z.string().min(1)
});

export const VariationScopeSchema = z.enum(["family", "building", "element"]);

export const AssemblyStageSchema = z.enum(["massing", "facade", "openings", "trim", "roof"]);

export { DiagnosticSchema };

export type SemanticLock = z.infer<typeof SemanticLockSchema>;
export type Seeds = z.infer<typeof SeedsSchema>;
export type VariationScope = z.infer<typeof VariationScopeSchema>;
export type AssemblyStage = z.infer<typeof AssemblyStageSchema>;

