import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { MeshBatchIRSchema, RuntimeBuildingIRSchema } from "../contracts/runtimeBuildingIR";
import { BuildingSurfaceCompositionSchema } from "../contracts/surfaceComposition";
import { constructionSurfaceAt } from "./constructionSurfaceProgram";

export const BayConstructionWorkerRequestSchema = z.object({
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0"]), type: z.literal("evaluate-bay"),
  requestId: z.number().int().positive(), graph: BayConstructionGraphSchema,
  previewNodeId: z.string().min(1).max(80).optional()
}).strict().superRefine((request, context) => {
  if (request.schemaVersion === "0.1.0" && (request.graph.schemaVersion !== "0.1.0" || request.previewNodeId)) {
    context.addIssue({ code: "custom", message: "Facade graphs and previews require worker protocol 0.2.0." });
  }
  if ((request.graph.schemaVersion === "0.6.0") !== (request.schemaVersion === "0.6.0")) context.addIssue({ code: "custom", message: "Storefront graphs require matching worker protocol 0.6.0." });
  if ((request.graph.schemaVersion === "0.10.0") !== (request.schemaVersion === "0.10.0")) context.addIssue({ code: "custom", message: "Round-head graphs require matching worker protocol 0.10.0." });
  if ((request.graph.schemaVersion === "0.13.0") !== (request.schemaVersion === "0.13.0")) context.addIssue({ code: "custom", message: "Awning graphs require matching worker protocol 0.13.0." });
  if ((request.graph.schemaVersion === "0.12.0") !== (request.schemaVersion === "0.12.0")) context.addIssue({ code: "custom", message: "Divided storefront graphs require matching worker protocol 0.12.0." });
  if ((request.graph.schemaVersion === "0.11.0") !== (request.schemaVersion === "0.11.0")) context.addIssue({ code: "custom", message: "Grouped-bay graphs require matching worker protocol 0.11.0." });
  if ((request.graph.schemaVersion === "0.9.0") !== (request.schemaVersion === "0.9.0")) context.addIssue({ code: "custom", message: "Parapet graphs require matching worker protocol 0.9.0." });
  if ((request.graph.schemaVersion === "0.8.0") !== (request.schemaVersion === "0.8.0")) context.addIssue({ code: "custom", message: "Cornice graphs require matching worker protocol 0.8.0." });
  if ((request.graph.schemaVersion === "0.7.0") !== (request.schemaVersion === "0.7.0")) context.addIssue({ code: "custom", message: "Scoped opening graphs require matching worker protocol 0.7.0." });
  if (request.graph.schemaVersion === "0.5.0" && request.schemaVersion !== "0.5.0") context.addIssue({ code: "custom", message: "Window vocabulary graphs require worker protocol 0.5.0." });
  if (request.graph.schemaVersion === "0.4.0" && request.schemaVersion !== "0.4.0") context.addIssue({ code: "custom", message: "Whole-building graphs require worker protocol 0.4.0." });
  if (request.graph.schemaVersion === "0.3.0" && request.schemaVersion !== "0.3.0") context.addIssue({ code: "custom", message: "Surface graphs require worker protocol 0.3.0." });
});
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const BayConstructionWorkerReplySchema = z.discriminatedUnion("type", [
  z.object({ schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0"]), type: z.literal("bay-result"),
    requestId: z.number().int().positive(),
    result: z.object({ graph: BayConstructionGraphSchema, ir: RuntimeBuildingIRSchema,
      prototypes: z.array(MeshBatchIRSchema).max(512).optional(), previewNodeId: z.string().optional(),
      surfaceComposition: BuildingSurfaceCompositionSchema.optional(),
      trace: z.array(z.object({ nodeId: z.string(), type: z.enum(["FacadeScope", "PlaceOpening", "EmitWall", "AssembleWindow", "Output", "SplitFloors", "SplitBays", "SelectScopes", "ProfileTrim", "RoofCap", "JoinGeometry", "SetSurface", "Footprint", "Storeys", "PlaceDoor", "AssembleDoor", "BuildingRoof", "PlaceStorefront", "EditOpeningWidth"]),
        output: z.enum(["scope", "geometry", "footprint"]), openingCount: z.number().int().nonnegative(),
        meshCount: z.number().int().nonnegative(), bounds: z.object({ min: vector, max: vector }).strict(),
        scopeCount: z.number().int().nonnegative().max(256).optional(), scopeNames: z.array(z.string()).max(256).optional()
      }).strict()) }).strict()
  }).strict(),
  z.object({ schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0"]), type: z.literal("bay-error"),
    requestId: z.number().int().nonnegative(), message: z.string() }).strict()
]).superRefine((reply, context) => {
  if (reply.type !== "bay-result") return;
  const result = reply.result;
  if (reply.schemaVersion === "0.1.0" && (result.graph.schemaVersion !== "0.1.0" || result.prototypes || result.previewNodeId)) {
    context.addIssue({ code: "custom", message: "Facade results require worker protocol 0.2.0." });
  }
  if ((result.graph.schemaVersion === "0.6.0") !== (reply.schemaVersion === "0.6.0")) context.addIssue({ code: "custom", message: "Storefront results require matching worker protocol 0.6.0." });
  if ((result.graph.schemaVersion === "0.10.0") !== (reply.schemaVersion === "0.10.0")) context.addIssue({ code: "custom", message: "Round-head results require matching worker protocol 0.10.0." });
  if ((result.graph.schemaVersion === "0.13.0") !== (reply.schemaVersion === "0.13.0")) context.addIssue({ code: "custom", message: "Awning results require matching worker protocol 0.13.0." });
  if ((result.graph.schemaVersion === "0.12.0") !== (reply.schemaVersion === "0.12.0")) context.addIssue({ code: "custom", message: "Divided storefront results require matching worker protocol 0.12.0." });
  if ((result.graph.schemaVersion === "0.11.0") !== (reply.schemaVersion === "0.11.0")) context.addIssue({ code: "custom", message: "Grouped-bay results require matching worker protocol 0.11.0." });
  if ((result.graph.schemaVersion === "0.9.0") !== (reply.schemaVersion === "0.9.0")) context.addIssue({ code: "custom", message: "Parapet results require matching worker protocol 0.9.0." });
  if ((result.graph.schemaVersion === "0.8.0") !== (reply.schemaVersion === "0.8.0")) context.addIssue({ code: "custom", message: "Cornice results require matching worker protocol 0.8.0." });
  if ((result.graph.schemaVersion === "0.7.0") !== (reply.schemaVersion === "0.7.0")) context.addIssue({ code: "custom", message: "Scoped opening results require matching worker protocol 0.7.0." });
  if (result.graph.schemaVersion === "0.5.0" && reply.schemaVersion !== "0.5.0") context.addIssue({ code: "custom", message: "Window vocabulary results require worker protocol 0.5.0." });
  if (result.graph.schemaVersion === "0.4.0" && reply.schemaVersion !== "0.4.0") context.addIssue({ code: "custom", message: "Whole-building results require worker protocol 0.4.0." });
  if (!["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0"].includes(reply.schemaVersion) && (result.graph.schemaVersion === "0.3.0" || result.surfaceComposition)) context.addIssue({ code: "custom", message: "Surface results require worker protocol 0.3.0." });
  const expectedComposition = constructionSurfaceAt(result.graph, result.previewNodeId ?? result.graph.outputNodeId);
  if (JSON.stringify(result.surfaceComposition ?? null) !== JSON.stringify(expectedComposition ?? null)) context.addIssue({ code: "custom", message: "Surface instructions do not match the executed graph output." });
  if (!result.prototypes) {
    if (result.ir.instanceBatches.length) context.addIssue({ code: "custom", message: "Compiled instances require prototype geometry." });
    return;
  }
  const ids = new Set<string>();
  for (const prototype of result.prototypes) {
    const p = prototype.positions, n = prototype.normals, u = prototype.uvs, indices = prototype.indices;
    if (ids.has(prototype.batchId) || !p?.length || !n || !u || !indices?.length || p.length % 3 || n.length !== p.length || u.length !== p.length / 3 * 2 || indices.length % 3 ||
      !p.every(Number.isFinite) || !n.every(Number.isFinite) || !u.every(Number.isFinite) || !indices.every(index => index < p.length / 3)) {
      context.addIssue({ code: "custom", message: "Compiled instance geometry is invalid." });
    }
    ids.add(prototype.batchId);
  }
  for (const batch of result.ir.instanceBatches) if (!ids.has(batch.recipeId) || batch.transforms?.length !== batch.count * 16 || !batch.transforms?.every(Number.isFinite)) {
    context.addIssue({ code: "custom", message: "Instance transforms or prototype references are invalid." });
  }
});

