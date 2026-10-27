import { z } from "zod";
import { SchemaVersion010 } from "./shared";

export const GenerationStageSchema = z.enum([
  "idle",
  "resolvingPrompt",
  "evaluatingPsg",
  "normalizingSpec",
  "planningAtlas",
  "generatingMaterialSources",
  "compositingChannels",
  "packingAtlas",
  "buildingComponentCatalog",
  "buildingGraph",
  "compilingGeometry",
  "uploadingGpuResources",
  "complete",
  "failed",
  "cancelled"
]);

export const GenerationRunEventSchema = z.object({
  stage: GenerationStageSchema,
  startedAtMs: z.number().nonnegative(),
  endedAtMs: z.number().nonnegative().optional(),
  inputHash: z.string().optional(),
  outputArtifactId: z.string().optional(),
  provider: z.string().optional(),
  cacheHit: z.boolean().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional()
    })
    .optional()
});

export const GenerationRunSchema = z.object({
  schemaVersion: SchemaVersion010,
  runId: z.string(),
  stage: GenerationStageSchema,
  events: z.array(GenerationRunEventSchema)
});

export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationRunEvent = z.infer<typeof GenerationRunEventSchema>;
export type GenerationRun = z.infer<typeof GenerationRunSchema>;

