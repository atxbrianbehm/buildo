import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";

it("saves and reopens the grouped graph with its literal material source", async () => {
  const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const materials = await createBayConstructionMaterials(base, new AbortController().signal);
    const graph = withConstructionGroupedBays(createBuildingConstructionGraph(), [{ storeysNodeId: "facade", floorIndex: 1,
      bayIndex: 0, memberCount: 2, memberWidthM: 0.9, pierWidthM: 0.24 }]);
    const project = await createBayConstructionProject(graph, materials.file);
    expect(project.schemaVersion).toBe("0.12.0");
    const restored = await readBayConstructionProject(JSON.parse(JSON.stringify(project)));
    expect(restored.project).toEqual(project); expect(restored.project.materialSource).toEqual(materials.file);
    expect((await evaluateConstruction(restored.project.graph)).ir.semanticIndex).toEqual((await evaluateConstruction(graph)).ir.semanticIndex);
  } finally { base.familyRuntime.dispose(); }
}, 120000);
