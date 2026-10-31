import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { createConstructionFamilyFabricAssignments } from "../materials/constructionFamilyFabric";
import { resolveConstructionFamilyFabricStudy } from "../materials/constructionFamilyFabricStudy";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials, prepareBayConstructionFixture, prepareConstructionFamilyFixture } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";

it("prepares and releases graph-generated awnings with the real construction fixture", async () => {
  const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const materials = await createBayConstructionMaterials(base, new AbortController().signal);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "workspace", pattern: "striped", primary: [220, 210, 190], secondary: [60, 90, 70], physicalSizeM: [1, 1] });
    const graph = withConstructionAwnings(withConstructionStorefrontDivision(withConstructionStorefront(createBuildingConstructionGraph(), 1), { displayLights: 2, transomLights: 3 }), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const result = await evaluateConstruction(graph);
    await expect(prepareBayConstructionFixture(base, result, materials)).rejects.toThrow(/requires its saved fabric/);
    const fixture = await prepareBayConstructionFixture(base, result, { ...materials, awningFabric: fabric });
    const awnings = [...fixture.buildingRuntime.semanticLookup.values()].filter(entry => entry.object.userData.role.startsWith("awning."));
    expect(awnings).toHaveLength(2); expect(awnings[0].object.material.userData.fabricContentHash).toBe(fabric.contentHash);
    expect(awnings[1].object.material).toBe(awnings[0].object.material);
    const disposed = vi.fn(); awnings[0].object.material.addEventListener("dispose", disposed);
    fixture.familyRuntime.dispose(); expect(disposed).toHaveBeenCalledOnce(); fixture.familyRuntime.dispose(); expect(disposed).toHaveBeenCalledOnce();
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "awning_family", familySeed: "seed", graph });
    const results = await Promise.all(plan.members.map(member => evaluateConstruction(member.graph)));
    const family = await prepareConstructionFamilyFixture(base, results, { ...materials, awningFabric: fabric });
    const familyMaterials = [...family.familyRuntime.buildingRuntimes.values()].map(runtime => [...runtime.semanticLookup.values()].find(entry => entry.object.userData.role === "awning.canopy")!.object.material);
    expect(familyMaterials).toHaveLength(6); expect(new Set(familyMaterials).size).toBe(1);
    const familyDisposed = vi.fn(); familyMaterials[0].addEventListener("dispose", familyDisposed);
    family.familyRuntime.dispose(); expect(familyDisposed).toHaveBeenCalledOnce();
    const red = await createConstructionAwningFabric({ ...fabric.source, pattern: "solid", primary: [150, 40, 35] });
    const assignments = await createConstructionFamilyFabricAssignments({ schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: plan.source.familyId,
      sourceDocumentId: graph.documentId, inheritedFabric: fabric, members: results.map((item, index) => index === 0
        ? { documentId: item.ir.buildingId, mode: "override", fabric: red } : { documentId: item.ir.buildingId, mode: "inherit" }) });
    const varied = await prepareConstructionFamilyFixture(base, results, { ...materials, awningFabric: fabric }, undefined, assignments);
    const variedMaterials = [...varied.familyRuntime.buildingRuntimes.values()].map(runtime => [...runtime.semanticLookup.values()].find(entry => entry.object.userData.role === "awning.canopy")!.object.material);
    expect(variedMaterials.map(material => material.userData.fabricContentHash)).toEqual([red.contentHash, ...Array(5).fill(fabric.contentHash)]);
    expect(new Set(variedMaterials).size).toBe(2);
    const redDisposed = vi.fn(), sharedDisposed = vi.fn(); variedMaterials[0].addEventListener("dispose", redDisposed); variedMaterials[1].addEventListener("dispose", sharedDisposed);
    varied.familyRuntime.dispose(); varied.familyRuntime.dispose(); expect(redDisposed).toHaveBeenCalledOnce(); expect(sharedDisposed).toHaveBeenCalledOnce();
    const { contentHash: _hash, ...assignmentPayload } = assignments; void _hash;
    const other = await createConstructionFamilyFabricAssignments({ ...assignmentPayload, members: assignmentPayload.members.map((member, index) => index === 1 ? { ...member, documentId: "wrong" } : member) });
    await expect(prepareConstructionFamilyFixture(base, results, { ...materials, awningFabric: fabric }, undefined, other)).rejects.toThrow(/do not match/);
    await expect(prepareConstructionFamilyFixture(base, results, { ...materials, awningFabric: red }, undefined, assignments)).rejects.toThrow(/do not match/);
    const geometry = () => results.map(result => ({ graph: result.ir.sourceGraphHash, meshes: result.ir.meshBatches.map(batch => ({ positions: Array.from(batch.positions ?? []), indices: Array.from(batch.indices ?? []) })),
      instances: result.ir.instanceBatches.map(batch => Array.from(batch.transforms ?? [])) }));
    const before = geometry(), study = await resolveConstructionFamilyFabricStudy({ schemaVersion: "0.1.0", kind: "construction-family-fabric-study-request", familyId: plan.source.familyId,
      sourceDocumentId: graph.documentId, memberIds: results.map(item => item.ir.buildingId), materialSeed: "demo-fabric", inheritedFabric: fabric });
    const studied = await prepareConstructionFamilyFixture(base, results, { ...materials, awningFabric: fabric }, undefined, study);
    const studiedMaterials = [...studied.familyRuntime.buildingRuntimes.values()].map(runtime => [...runtime.semanticLookup.values()].find(entry => entry.object.userData.role === "awning.canopy")!.object.material);
    expect(new Set(studiedMaterials.map(material => material.userData.fabricContentHash)).size).toBe(6); expect(geometry()).toEqual(before);
    const disposedStudy = studiedMaterials.map(material => { const spy = vi.fn(); material.addEventListener("dispose", spy); return spy; });
    studied.familyRuntime.dispose(); studied.familyRuntime.dispose(); expect(disposedStudy.every(spy => spy.mock.calls.length === 1)).toBe(true);
  } finally { base.familyRuntime.dispose(); }
}, 120000);
