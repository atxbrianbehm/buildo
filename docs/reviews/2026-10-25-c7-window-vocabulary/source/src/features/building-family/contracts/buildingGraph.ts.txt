import { z } from "zod";
import { AssemblyStageSchema, SchemaVersion010 } from "./shared";

export const BuildingGraphNodeTypeSchema = z.enum([
  "CreateRectFootprint",
  "ExtrudeMassing",
  "ForEachFacade",
  "SplitFloors",
  "SplitBays",
  "EmitWallPanel",
  "PlaceOpening",
  "InstanceComponent",
  "SweepProfile",
  "EmitRoof",
  "Group",
  "OutputBuilding"
]);

export const BuildingGraphNodeSchema = z.object({
  id: z.string(),
  type: BuildingGraphNodeTypeSchema,
  parameters: z.record(z.string(), z.unknown()),
  upstreamIds: z.array(z.string()),
  semanticPathTemplate: z.string(),
  stage: AssemblyStageSchema
});

export const BuildingGraphSchema = z.object({
  schemaVersion: SchemaVersion010,
  graphId: z.string(),
  nodes: z.array(BuildingGraphNodeSchema),
  outputNodeId: z.string()
});

export type BuildingGraphNodeType = z.infer<typeof BuildingGraphNodeTypeSchema>;
export type BuildingGraphNode = z.infer<typeof BuildingGraphNodeSchema>;
export type BuildingGraph = z.infer<typeof BuildingGraphSchema>;

