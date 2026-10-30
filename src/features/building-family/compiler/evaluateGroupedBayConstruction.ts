import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { ConstructionGroupedBayPlanSchema } from "../contracts/constructionGroupedBay";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { evaluateFacadeConstruction } from "./evaluateFacadeConstruction";
import { DEFAULT_BAY_MATERIALS, type BayConstructionMaterials } from "./evaluateBayConstruction";

const json = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export const GroupedBayGeometryRequestSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"),
  kind: z.literal("construction-grouped-geometry-request"), graph: BayConstructionGraphSchema,
  groups: z.array(ConstructionGroupedBayPlanSchema).min(1).max(220) }).strict());

/** Explicit replayable compiler experiment; the source includes the graph and plans. */
export async function evaluateGroupedBayConstruction(input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS) {
  const source = structuredClone(GroupedBayGeometryRequestSchema.parse(input));
  const result = await evaluateFacadeConstruction(source.graph, materials, undefined, source.groups);
  return { source, result };
}
