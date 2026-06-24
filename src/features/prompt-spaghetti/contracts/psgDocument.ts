import { z } from "zod";

const PsgBaseNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  inputIds: z.array(z.string()).optional(),
  semanticPath: z.string().optional()
});

export const PsgTextBlockNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("TextBlock"),
  value: z.string()
});

export const PsgWeightedChoiceNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("WeightedChoice"),
  choices: z.array(
    z.object({
      value: z.string(),
      weight: z.number().positive()
    })
  )
});

export const PsgConcatNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("Concat"),
  parts: z.array(z.string()).optional()
});

export const PsgOutputNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("Output"),
  value: z.string().optional(),
  outputKind: z.string().optional()
});

export const PsgSetVariableNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("SetVariable"),
  variableName: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
});

export const PsgGetVariableNodeSchema = PsgBaseNodeSchema.extend({
  type: z.literal("GetVariable"),
  variableName: z.string()
});

export const PsgNodeSchema = z.discriminatedUnion("type", [
  PsgTextBlockNodeSchema,
  PsgWeightedChoiceNodeSchema,
  PsgConcatNodeSchema,
  PsgOutputNodeSchema,
  PsgSetVariableNodeSchema,
  PsgGetVariableNodeSchema
]);

export const PsgDocumentSchema = z.object({
  schemaVersion: z.literal("2.0.0"),
  id: z.string().optional(),
  nodes: z.array(PsgNodeSchema)
});

export interface PsgEvaluationTraceEntry {
  nodeId: string;
  nodeType: string;
  semanticPath: string;
  inputValues: unknown[];
  outputValue: unknown;
  selectedChoiceIndex?: number;
  seed: string;
}

export interface PsgEvaluationResult {
  outputs: Array<{
    nodeId: string;
    value: string;
  }>;
  variables: Record<string, string | number | boolean | null>;
  trace: PsgEvaluationTraceEntry[];
}

export type PsgDocument = z.infer<typeof PsgDocumentSchema>;
export type PsgNode = z.infer<typeof PsgNodeSchema>;

