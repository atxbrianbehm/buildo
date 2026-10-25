import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { ConstructionGenerationLineageSchema, readConstructionGenerationLineage } from "./constructionGenerationState";
import { hashCanonicalJson } from "../core/contentHash";
import { BuildingSourceFileSchema, parseBuildingSourceFile } from "./buildingSourceFile";
import { validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";

const payloadSchema = z.object({
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0"]), kind: z.literal("bay-construction-project"),
  appearancePreset: z.enum(["restrained-bay-v1", "restrained-building-v1"]),
  graph: BayConstructionGraphSchema, materialSource: BuildingSourceFileSchema, generation: ConstructionGenerationLineageSchema.optional()
}).strict();
export const BayConstructionProjectSchema = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(payloadSchema.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).superRefine((project, context) => {
  if (project.appearancePreset !== (["0.4.0", "0.5.0", "0.6.0"].includes(project.graph.schemaVersion) ? "restrained-building-v1" : "restrained-bay-v1")) context.addIssue({ code: "custom", message: "Construction appearance preset must match its graph version." });
  if (project.schemaVersion === "0.7.0" ? project.graph.schemaVersion !== "0.6.0" : project.schemaVersion === "0.6.0" ? project.graph.schemaVersion !== "0.5.0" : project.schemaVersion === "0.5.0" ? project.graph.schemaVersion !== "0.4.0" || !project.generation : project.schemaVersion !== project.graph.schemaVersion || project.generation !== undefined) context.addIssue({ code: "custom", message: "Construction project and graph versions must agree." });
});
export type BayConstructionProject = z.infer<typeof BayConstructionProjectSchema>;

export async function createBayConstructionProject(graph: unknown, materialSource: unknown, generation?: unknown): Promise<BayConstructionProject> {
  if (generation === null) generation = undefined;
  // Capture graph and every encoded material channel before yielding.
  const ownedGraph = BayConstructionGraphSchema.parse(graph);
  const payload = structuredClone(payloadSchema.parse({ schemaVersion: ownedGraph.schemaVersion === "0.6.0" ? "0.7.0" : ownedGraph.schemaVersion === "0.5.0" ? "0.6.0" : generation === undefined ? ownedGraph.schemaVersion : "0.5.0", kind: "bay-construction-project",
    appearancePreset: ["0.4.0", "0.5.0", "0.6.0"].includes(ownedGraph.schemaVersion) ? "restrained-building-v1" : "restrained-bay-v1", graph: ownedGraph, materialSource, ...(generation === undefined ? {} : { generation }) }));
  const materials = await parseBuildingSourceFile(payload.materialSource);
  validateConstructionSurfaceSources(ownedGraph, materials.packedAtlas);
  await validateGeneration(payload, materials.packedAtlas.manifest);
  return BayConstructionProjectSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

export async function readBayConstructionProject(input: unknown) {
  const project = structuredClone(BayConstructionProjectSchema.parse(input));
  if (project.generation && canonicalJson(project) !== canonicalJson(input)) throw new Error("Generation project admission would change serialized fields.");
  const { contentHash, ...payload } = project;
  if (await hashCanonicalJson(payload) !== contentHash) throw new Error("Construction project content does not match its saved hash.");
  const materials = await parseBuildingSourceFile(project.materialSource);
  validateConstructionSurfaceSources(project.graph, materials.packedAtlas);
  await validateGeneration(project, materials.packedAtlas.manifest);
  return { project, materials };
}


async function validateGeneration(project: { graph: { documentId: string }; materialSource: { contentHash: string }; generation?: z.infer<typeof ConstructionGenerationLineageSchema> }, manifest: unknown) {
  if (!project.generation) return;
  const lineage = await readConstructionGenerationLineage(project.generation);
  if (lineage.source.documentId !== project.graph.documentId || lineage.materialSourceHash !== project.materialSource.contentHash ||
      canonicalJson(lineage.materialPlan.atlas.manifest) !== canonicalJson(manifest))
    throw new Error("Generation lineage does not match this graph identity and saved material source.");
}
