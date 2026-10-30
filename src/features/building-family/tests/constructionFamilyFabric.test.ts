import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { createConstructionFamilyFabricAssignments, readConstructionFamilyFabricAssignments, resolveConstructionFamilyMemberFabric, validateConstructionFamilyFabricScope } from "../materials/constructionFamilyFabric";

it("owns explicit member overrides while preserving inherited fabric and family scope", async () => {
  const request = { schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "fabric", pattern: "striped", primary: [220, 210, 190], secondary: [60, 90, 70], physicalSizeM: [1, 1] };
  const inherited = await createConstructionAwningFabric(request), override = await createConstructionAwningFabric({ ...request, pattern: "solid", primary: [150, 40, 35] });
  const members = Array.from({ length: 6 }, (_, i) => i === 2 ? { documentId: `member${i}`, mode: "override" as const, fabric: override } : { documentId: `member${i}`, mode: "inherit" as const });
  const input = { schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: "family", sourceDocumentId: "original", inheritedFabric: inherited, members };
  const savedInput = structuredClone(input), pending = createConstructionFamilyFabricAssignments(input); input.members[0].documentId = "mutated";
  const assignments = await pending; expect(assignments.members[0].documentId).toBe("member0");
  expect(await readConstructionFamilyFabricAssignments(JSON.parse(JSON.stringify(assignments)))).toEqual(assignments);
  expect((await resolveConstructionFamilyMemberFabric(assignments, "member0")).contentHash).toBe(inherited.contentHash);
  expect((await resolveConstructionFamilyMemberFabric(assignments, "member2")).contentHash).toBe(override.contentHash);
  const scope = { familyId: "family", sourceDocumentId: "original", memberIds: savedInput.members.map(member => member.documentId), inheritedFabricHash: inherited.contentHash };
  expect(await validateConstructionFamilyFabricScope(assignments, scope)).toEqual(assignments);
  await expect(validateConstructionFamilyFabricScope(assignments, { ...scope, memberIds: [...scope.memberIds.slice(0, 5), "other"] })).rejects.toThrow(/owning family/);
  await expect(validateConstructionFamilyFabricScope(assignments, { ...scope, inheritedFabricHash: override.contentHash })).rejects.toThrow(/owning family/);
  await expect(resolveConstructionFamilyMemberFabric(assignments, "unknown")).rejects.toThrow(/no family fabric/);
  const tampered = structuredClone(assignments); tampered.members[0].documentId = "altered";
  await expect(readConstructionFamilyFabricAssignments(tampered)).rejects.toThrow(/saved hash/);
  await expect(createConstructionFamilyFabricAssignments({ ...savedInput, members: [...savedInput.members.slice(0, 5), savedInput.members[0]] })).rejects.toThrow(/unique member/);
  const corrupt = structuredClone(override); corrupt.source.seed = "tampered";
  await expect(createConstructionFamilyFabricAssignments({ ...savedInput, members: savedInput.members.map((member, i) => i === 2 ? { ...member, mode: "override", fabric: corrupt } : member) })).rejects.toThrow(/does not match/);
});
