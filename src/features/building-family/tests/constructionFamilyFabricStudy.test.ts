import { expect, it } from "vitest";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { readConstructionFamilyFabricAssignments, validateConstructionFamilyFabricScope } from "../materials/constructionFamilyFabric";
import { resolveConstructionFamilyFabricStudy } from "../materials/constructionFamilyFabricStudy";

it("creates reproducible opt-in fabric assignments without changing the inherited source", async () => {
  const inherited = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "original", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
  const request = { schemaVersion: "0.1.0", kind: "construction-family-fabric-study-request", familyId: "family", sourceDocumentId: "source", memberIds: Array.from({ length: 6 }, (_, i) => `member${i}`), materialSeed: "fabric-seed", inheritedFabric: inherited };
  const before = structuredClone(request), pending = resolveConstructionFamilyFabricStudy(request); request.memberIds[0] = "mutated";
  const result = await pending; expect(result.inheritedFabric).toEqual(inherited); expect(result.members.map(member => member.documentId)).toEqual(before.memberIds);
  expect(result.members.filter(member => member.mode === "inherit")).toHaveLength(1);
  expect(new Set(result.members.filter(member => member.mode === "override").map(member => member.mode === "override" && member.fabric.contentHash)).size).toBe(5);
  expect(await resolveConstructionFamilyFabricStudy(before)).toEqual(result);
  expect(await readConstructionFamilyFabricAssignments(JSON.parse(JSON.stringify(result)))).toEqual(result);
  await expect(validateConstructionFamilyFabricScope(result, { familyId: "family", sourceDocumentId: "source", memberIds: before.memberIds, inheritedFabricHash: inherited.contentHash })).resolves.toEqual(result);
  await expect(resolveConstructionFamilyFabricStudy({ ...before, memberIds: Array(6).fill("same") })).rejects.toThrow();
  const corrupt = structuredClone(inherited); corrupt.source.seed = "changed";
  await expect(resolveConstructionFamilyFabricStudy({ ...before, inheritedFabric: corrupt })).rejects.toThrow(/does not match/);
});
