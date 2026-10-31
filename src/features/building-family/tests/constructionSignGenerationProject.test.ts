import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { defaultConstructionGenerationControls, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { resolveConstructionSignGenerationStudy } from "../state/constructionSignGenerationStudy";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createConstructionCheckpoint, readConstructionCheckpoint } from "../state/constructionCheckpoint";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createReferenceConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("round-trips retained sign generation lineage, graph, fabric and materials", async () => {
  const base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  try {
    const storefront = withConstructionStorefront(createBuildingConstructionGraph("sign_generation_project"), 1);
    const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
    const generated = await resolveConstructionSignGenerationStudy(graph, null, defaultConstructionGenerationControls);
    const { materials, plan } = await createReferenceConstructionMaterials(base, generated.source, new AbortController().signal, base.spec);
    const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "sign-generation-fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
    const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage", source: generated.source,
      resolution: generated.resolution, materialPlan: plan, materialSourceHash: materials.file.contentHash };
    const project = await createBayConstructionProject(generated.graph, materials.file, lineage, fabric);
    const reopened = (await readBayConstructionProject(JSON.parse(JSON.stringify(project)))).project;
    expect(reopened).toEqual(project); expect(reopened.schemaVersion).toBe("0.19.0"); expect(reopened.graph.storefrontSign).toEqual(graph.storefrontSign);
    expect(reopened.graph.awnings).toEqual(graph.awnings); expect(reopened.graph.awningSupports).toEqual(graph.awningSupports); expect(reopened.graph.signAwningGapM).toBe(graph.signAwningGapM);
    expect(reopened.awningFabric).toEqual(fabric); expect(reopened.materialSource).toEqual(materials.file);
    expect((await evaluateConstruction(reopened.graph)).ir).toEqual((await evaluateConstruction(generated.graph)).ir);
    const checkpoint = await createConstructionCheckpoint("sign-generation-workspace", generated.graph, materials.file, lineage, fabric);
    expect((await readConstructionCheckpoint(JSON.parse(JSON.stringify(checkpoint)))).project).toEqual(project);
    const rerolled = await resolveConstructionSignGenerationStudy(reopened.graph, reopened.generation!, generated.controls, true);
    const rerollPlan = await planConstructionReferenceMaterials(base.spec, rerolled.source);
    expect(rerollPlan.materialInputsHash).toBe(plan.materialInputsHash); expect(rerollPlan.atlas.manifest).toEqual(plan.atlas.manifest);
    const nextLineage = { ...lineage, source: rerolled.source, resolution: rerolled.resolution, materialPlan: rerollPlan };
    const next = await createBayConstructionProject(rerolled.graph, materials.file, nextLineage, fabric);
    expect(next.materialSource).toEqual(project.materialSource); expect(next.awningFabric).toEqual(project.awningFabric); expect(next.graph.storefrontSign).toEqual(project.graph.storefrontSign);
    expect((await readBayConstructionProject(JSON.parse(JSON.stringify(next)))).project).toEqual(next);
    await expect(createBayConstructionProject(generated.graph, materials.file, { ...lineage, materialSourceHash: "b".repeat(64) }, fabric)).rejects.toThrow(/lineage does not match/);
    await expect(readBayConstructionProject({ ...project, generation: { ...lineage, materialSourceHash: "b".repeat(64) } })).rejects.toThrow();
  } finally { base.familyRuntime.dispose(); }
}, 180000);
