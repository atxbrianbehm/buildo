import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { createConstructionCheckpoint, readConstructionCheckpoint } from "../state/constructionCheckpoint";
import { hashCanonicalJson } from "../core/contentHash";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("stores a separate fabric source without changing the saved atlas during structural edits", async () => {
  const fixture = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const materials = await createBayConstructionMaterials(fixture, new AbortController().signal);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "fabric-one", pattern: "striped",
      primary: [222, 214, 191], secondary: [75, 102, 83], physicalSizeM: [1, 1] });
    const graph = createBuildingConstructionGraph(), old = await createBayConstructionProject(graph, materials.file);
    const first = await createBayConstructionProject(graph, materials.file, undefined, fabric);
    expect(first.schemaVersion).toBe("0.14.0"); expect(first.materialSource).toEqual(old.materialSource);
    const edited = structuredClone(graph); edited.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
    const second = await createBayConstructionProject(edited, materials.file, undefined, fabric);
    expect(second.awningFabric).toEqual(first.awningFabric); expect(second.materialSource).toEqual(first.materialSource);
    const reopened = await readBayConstructionProject(JSON.parse(JSON.stringify(second)));
    expect(reopened.project).toEqual(second); expect(reopened.project.awningFabric?.contentHash).toBe(fabric.contentHash);
    const bad = structuredClone(fabric); bad.source.seed = "changed";
    await expect(createBayConstructionProject(graph, materials.file, undefined, bad)).rejects.toThrow(/does not match/);
    await expect(readBayConstructionProject({ ...first, schemaVersion: "0.13.0" })).rejects.toThrow();
    const checkpoint = { schemaVersion: "0.1.0", kind: "construction-source-checkpoint", workspaceDocumentId: "fabric-proof",
      createdAt: "2026-10-30T00:00:00.000Z", project: second };
    const recovered = await readConstructionCheckpoint({ ...checkpoint, contentHash: await hashCanonicalJson(checkpoint) });
    expect(recovered.materials.awningFabric).toEqual(fabric);
    expect((await readBayConstructionProject(JSON.parse(JSON.stringify(old)))).project).toEqual(old);
    const storefront = withConstructionStorefrontDivision(withConstructionStorefront(graph, 1), { displayLights: 2, transomLights: 3 });
    const awningGraph = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const awningProject = await createBayConstructionProject(awningGraph, materials.file, undefined, fabric);
    expect(awningProject.schemaVersion).toBe("0.15.0");
    const supported = withConstructionAwningSupports(awningGraph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const supportProject = await createBayConstructionProject(supported, materials.file, undefined, fabric);
    expect(supportProject.schemaVersion).toBe("0.16.0");
    expect((await readBayConstructionProject(JSON.parse(JSON.stringify(supportProject)))).project).toEqual(supportProject);
    expect((await evaluateConstruction(supportProject.graph)).ir.meshBatches.filter(batch => batch.role === "awning.support")).toHaveLength(1);
    const supportCheckpoint = await createConstructionCheckpoint("support-workspace", supported, materials.file, undefined, fabric);
    expect((await readConstructionCheckpoint(JSON.parse(JSON.stringify(supportCheckpoint)))).project).toEqual(supportProject);
    await expect(createBayConstructionProject(supported, materials.file)).rejects.toThrow(/versions must agree/);
    await expect(readBayConstructionProject({ ...supportProject, schemaVersion: "0.15.0" })).rejects.toThrow();
    const awningReopened = (await readBayConstructionProject(JSON.parse(JSON.stringify(awningProject)))).project;
    expect(awningReopened).toEqual(awningProject);
    const awningCheckpoint = await createConstructionCheckpoint("awning-workspace", awningGraph, materials.file, undefined, fabric);
    expect((await readConstructionCheckpoint(JSON.parse(JSON.stringify(awningCheckpoint)))).materials.awningFabric).toEqual(fabric);
    expect((await evaluateConstruction(awningReopened.graph)).ir.meshBatches.filter(batch => batch.role.startsWith("awning."))).toHaveLength(2);
    const widened = structuredClone(awningGraph); widened.nodes.find(node => node.type === "Footprint")!.parameters.widthM += 1;
    const widenedProject = await createBayConstructionProject(widened, materials.file, undefined, fabric);
    expect(widenedProject.awningFabric).toEqual(awningProject.awningFabric); expect(widenedProject.materialSource).toEqual(awningProject.materialSource);
    await expect(createBayConstructionProject(awningGraph, materials.file)).rejects.toThrow(/versions must agree/);
    await expect(readBayConstructionProject({ ...awningProject, schemaVersion: "0.14.0" })).rejects.toThrow();
  } finally { fixture.familyRuntime.dispose(); }
}, 120000);
