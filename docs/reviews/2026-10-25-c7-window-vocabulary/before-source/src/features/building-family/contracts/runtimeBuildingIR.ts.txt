import { z } from "zod";
import { AssemblyStageSchema, SchemaVersion010 } from "./shared";

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const MeshBatchIRSchema = z.object({
  batchId: z.string(),
  role: z.string(),
  positions: z.instanceof(Float32Array).optional(),
  normals: z.instanceof(Float32Array).optional(),
  uvs: z.instanceof(Float32Array).optional(),
  indices: z.instanceof(Uint32Array).or(z.instanceof(Uint16Array)).optional(),
  materialSlotId: z.string().optional()
});

export const InstanceBatchIRSchema = z.object({
  batchId: z.string(),
  recipeId: z.string(),
  materialSlotId: z.string(),
  transforms: z.instanceof(Float32Array).optional(),
  count: z.number().int().nonnegative()
});

export const RuntimeBuildingIRSchema = z.object({
  schemaVersion: SchemaVersion010,
  buildingId: z.string(),
  familyId: z.string(),
  sourceGraphHash: z.string(),
  bounds: z.object({
    min: Vec3Schema,
    max: Vec3Schema
  }),
  meshBatches: z.array(MeshBatchIRSchema),
  instanceBatches: z.array(InstanceBatchIRSchema),
  semanticIndex: z.array(
    z.object({
      semanticPath: z.string(),
      batchId: z.string(),
      elementIndex: z.number().int().nonnegative().optional(),
      stage: AssemblyStageSchema
    })
  ),
  metrics: z.object({
    vertexCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative()
  })
});

export type MeshBatchIR = z.infer<typeof MeshBatchIRSchema>;
export type InstanceBatchIR = z.infer<typeof InstanceBatchIRSchema>;
export type RuntimeBuildingIR = z.infer<typeof RuntimeBuildingIRSchema>;

