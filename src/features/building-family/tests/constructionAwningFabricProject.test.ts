import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { readConstructionCheckpoint } from "../state/constructionCheckpoint";
import { hashCanonicalJson } from "../core/contentHash";

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
    await expect(readConstructionCheckpoint({ ...checkpoint, contentHash: await hashCanonicalJson(checkpoint) })).rejects.toThrow(/cannot yet retain/);
    expect((await readBayConstructionProject(JSON.parse(JSON.stringify(old)))).project).toEqual(old);
  } finally { fixture.familyRuntime.dispose(); }
}, 120000);
