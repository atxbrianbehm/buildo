import { z } from "zod";
import { ConstructionAwningFabricArtifactSchema } from "../contracts/constructionAwningFabric";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { createSeedTree } from "../core/seedTree";
import { createConstructionAwningFabric } from "./constructionAwningFabric";
import { createConstructionFamilyFabricAssignments } from "./constructionFamilyFabric";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const request = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-family-fabric-study-request"),
  familyId: id, sourceDocumentId: id, memberIds: z.array(id).length(6), materialSeed: z.string().trim().min(1).max(128),
  inheritedFabric: ConstructionAwningFabricArtifactSchema }).strict().superRefine((value, context) => {
    if (new Set(value.memberIds).size !== 6 || value.memberIds.includes(value.sourceDocumentId))
      context.addIssue({ code: "custom", path: ["memberIds"], message: "Choose six distinct family members separate from the source." });
  }));

// A visible demo palette, not an evidence-backed historical assignment.
const palette = [null,
  { pattern: "striped", primary: [226, 216, 194], secondary: [61, 88, 120] },
  { pattern: "solid", primary: [129, 55, 46], secondary: [129, 55, 46] },
  { pattern: "striped", primary: [226, 216, 194], secondary: [107, 54, 46] },
  { pattern: "solid", primary: [65, 95, 79], secondary: [65, 95, 79] },
  { pattern: "striped", primary: [224, 211, 177], secondary: [77, 72, 67] }
] as const;

/** Prepare opt-in member materials without changing structural or inherited material sources. */
export async function resolveConstructionFamilyFabricStudy(input: unknown) {
  const owned = structuredClone(request.parse(input));
  const tree = createSeedTree(owned.materialSeed), offset = tree.int(0, palette.length - 1, "family/fabric/demo-offset");
  const members = await Promise.all(owned.memberIds.map(async (documentId, index) => {
    const choice = palette[(index + offset) % palette.length];
    if (!choice) return { documentId, mode: "inherit" as const };
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request",
      seed: String(tree.uint32(`family/fabric/member/${documentId}`)), pattern: choice.pattern,
      primary: [...choice.primary], secondary: [...choice.secondary], physicalSizeM: owned.inheritedFabric.source.physicalSizeM });
    return { documentId, mode: "override" as const, fabric };
  }));
  return createConstructionFamilyFabricAssignments({ schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: owned.familyId,
    sourceDocumentId: owned.sourceDocumentId, inheritedFabric: owned.inheritedFabric, members });
}
