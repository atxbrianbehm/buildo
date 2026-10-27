import { z } from "zod";
import { ComponentCatalogSchema } from "../components/componentCatalogBuilder";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { BuildingGraphSchema } from "../contracts/buildingGraph";
import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { BuildingWindowWidthBatchSchema, BuildingWindowWidthOverridesSchema } from "./buildingCompiler";

const compilerDomainErrorCode = z.enum([
  "building.windowSlot.invalidAddress", "building.windowSlot.unresolvedPath", "building.windowSlot.missingOpening",
  "building.windowSlot.ambiguousTarget", "building.windowSlot.notWindow",
  "building.windowWidth.invalidDirective", "building.windowWidth.unsupportedWidth", "building.windowWidth.missingScope",
  "building.windowWidth.ambiguousScope", "building.windowWidth.incoherentPlan"
]);

export const SerializedCompilerErrorSchema = z.object({
  name: z.string().optional(),
  message: z.string(),
  stack: z.string().optional(),
  code: compilerDomainErrorCode.optional()
});

export const CompilerWorkerCompileRequestSchema = z.object({
  type: z.literal("compile"),
  requestId: z.string().min(1),
  spec: BuildingFamilySpecSchema,
  graph: BuildingGraphSchema,
  catalog: ComponentCatalogSchema,
  buildingId: z.string().optional(),
  detailLevel: z.enum(["high", "low"]).optional(),
  fidelityMode: z.enum(["proof", "kit"]).optional(),
  windowWidthOverrides: BuildingWindowWidthOverridesSchema
}).strict();

export const CompilerWorkerWindowWidthBatchCompileRequestSchema = CompilerWorkerCompileRequestSchema
  .omit({ type: true, windowWidthOverrides: true })
  .extend({
    type: z.literal("compile-window-width-batch"),
    windowWidthBatch: BuildingWindowWidthBatchSchema
  }).strict();

export const CompilerWorkerCancelRequestSchema = z.object({
  type: z.literal("cancel"),
  requestId: z.string().min(1)
});

export const CompilerWorkerRequestSchema = z.discriminatedUnion("type", [
  CompilerWorkerCompileRequestSchema,
  CompilerWorkerWindowWidthBatchCompileRequestSchema,
  CompilerWorkerCancelRequestSchema
]);

export const CompilerWorkerProgressResponseSchema = z.object({
  type: z.literal("progress"),
  requestId: z.string().min(1),
  stage: z.string().min(1),
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive()
});

export const CompilerWorkerCompleteResponseSchema = z.object({
  type: z.literal("complete"),
  requestId: z.string().min(1),
  ir: RuntimeBuildingIRSchema
});

export const CompilerWorkerErrorResponseSchema = z.object({
  type: z.literal("error"),
  requestId: z.string().min(1),
  error: SerializedCompilerErrorSchema
});

export const CompilerWorkerResponseSchema = z.discriminatedUnion("type", [
  CompilerWorkerProgressResponseSchema,
  CompilerWorkerCompleteResponseSchema,
  CompilerWorkerErrorResponseSchema
]);

export type SerializedCompilerError = z.infer<typeof SerializedCompilerErrorSchema>;
export type CompilerWorkerCompileRequest = z.infer<typeof CompilerWorkerCompileRequestSchema>;
export type CompilerWorkerWindowWidthBatchCompileRequest = z.infer<typeof CompilerWorkerWindowWidthBatchCompileRequestSchema>;
export type CompilerWorkerCancelRequest = z.infer<typeof CompilerWorkerCancelRequestSchema>;
export type CompilerWorkerRequest = z.infer<typeof CompilerWorkerRequestSchema>;
export type CompilerWorkerProgressResponse = z.infer<typeof CompilerWorkerProgressResponseSchema>;
export type CompilerWorkerCompleteResponse = z.infer<typeof CompilerWorkerCompleteResponseSchema>;
export type CompilerWorkerErrorResponse = z.infer<typeof CompilerWorkerErrorResponseSchema>;
export type CompilerWorkerResponse = z.infer<typeof CompilerWorkerResponseSchema>;

function pushBuffer(buffer: ArrayBufferLike | undefined, transferables: ArrayBuffer[], seen: Set<ArrayBuffer>): void {
  if (buffer instanceof ArrayBuffer && !seen.has(buffer)) {
    seen.add(buffer);
    transferables.push(buffer);
  }
}

export function collectRuntimeIrTransferables(ir: RuntimeBuildingIR): ArrayBuffer[] {
  const transferables: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();

  for (const batch of ir.meshBatches) {
    pushBuffer(batch.positions?.buffer, transferables, seen);
    pushBuffer(batch.normals?.buffer, transferables, seen);
    pushBuffer(batch.uvs?.buffer, transferables, seen);
    pushBuffer(batch.indices?.buffer, transferables, seen);
  }

  for (const batch of ir.instanceBatches) {
    pushBuffer(batch.transforms?.buffer, transferables, seen);
  }

  return transferables;
}

export function serializeCompilerError(error: unknown): SerializedCompilerError {
  if (error instanceof Error) {
    const code = compilerDomainErrorCode.safeParse((error as Error & { code?: unknown }).code);
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(code.success ? { code: code.data } : {})
    };
  }

  return {
    message: String(error)
  };
}
