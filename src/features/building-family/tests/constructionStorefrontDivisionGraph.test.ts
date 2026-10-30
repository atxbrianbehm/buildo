import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";

const base = () => withConstructionGroupedBays(withConstructionStorefront(createBuildingConstructionGraph(), 1), []);
describe("storefront division graph", () => {
  it("retains legacy geometry for one light and executes divided geometry", async () => {
    const prior = base(), one = withConstructionStorefrontDivision(prior, { displayLights: 1, transomLights: 1 });
    const divided = withConstructionStorefrontDivision(prior, { displayLights: 2, transomLights: 3 });
    const [a,b,c] = await Promise.all([evaluateConstruction(prior), evaluateConstruction(one), evaluateConstruction(divided)]);
    expect(b.ir.meshBatches).toEqual(a.ir.meshBatches); expect(b.prototypes).toEqual(a.prototypes);
    expect(c.prototypes).not.toEqual(a.prototypes);
    expect(c.ir.semanticIndex.map(entry => entry.semanticPath)).toEqual(a.ir.semanticIndex.map(entry => entry.semanticPath));
    expect((await evaluateConstruction(JSON.parse(JSON.stringify(divided)))).prototypes).toEqual(c.prototypes);
  });
  it("requires matching versions and an active storefront and retains other choices", async () => {
    const graph = withConstructionStorefrontDivision(base(), { displayLights: 2, transomLights: 3 });
    const result = await evaluateConstruction(graph);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.12.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.11.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.12.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.11.0" }).success).toBe(false);
    expect(() => withConstructionStorefrontDivision(withConstructionStorefront(createBuildingConstructionGraph(), 0), { displayLights: 2, transomLights: 3 })).toThrow();
    expect(withConstructionCorniceLayout(graph, 1).storefrontDivision).toEqual(graph.storefrontDivision);
    expect((await resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls)).graph.storefrontDivision).toEqual(graph.storefrontDivision);
    const disconnected = structuredClone(graph);
    const window = disconnected.nodes.find(node => node.type === "AssembleWindow")!;
    window.bypassed = true;
    await expect(evaluateConstruction(disconnected)).rejects.toThrow(/matching wall, frame and glazing/);
  });
  it("round trips the graph and literal material source in a project", async () => {
    const fixture = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
    try {
      const materials = await createBayConstructionMaterials(fixture, new AbortController().signal);
      const graph = withConstructionStorefrontDivision(base(), { displayLights: 2, transomLights: 3 });
      const project = await createBayConstructionProject(graph, materials.file);
      expect(project.schemaVersion).toBe("0.13.0");
      const reopened = await readBayConstructionProject(JSON.parse(JSON.stringify(project)));
      expect(reopened.project).toEqual(project); expect(reopened.project.materialSource).toEqual(materials.file);
      expect((await evaluateConstruction(reopened.project.graph)).prototypes).toEqual((await evaluateConstruction(graph)).prototypes);
    } finally { fixture.familyRuntime.dispose(); }
  }, 120000);
  it("retains divisions for authored or locked generation and releases them when requested", async () => {
    const graph = withConstructionStorefrontDivision(base(), { displayLights: 2, transomLights: 3 });
    const kept = await resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls);
    expect(kept.graph.storefrontDivision).toEqual(graph.storefrontDivision);
    const locked = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: true });
    expect(locked.graph.storefrontDivision).toEqual(graph.storefrontDivision);
    const released = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: false });
    expect(released.graph.storefrontDivision).toBeUndefined();
  }, 120000);
});
