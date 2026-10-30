import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials, prepareBayConstructionFixture } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";

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
  } finally { base.familyRuntime.dispose(); }
}, 120000);
