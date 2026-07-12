import { BuildingGraphSchema, type BuildingGraph } from "../contracts/buildingGraph";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph, validateBuildingGraph } from "../compiler/buildingGraphBuilder";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureInputs() {
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim"
  });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: "trim-seed"
    },
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const plan = await planAtlas(spec);
  const catalog = await buildComponentCatalog(spec, plan.manifest);
  return { spec, catalog };
}

describe("buildBuildingGraph", () => {
  it("builds a deterministic acyclic graph with semantic stages and output node", async () => {
    const { spec, catalog } = await fixtureInputs();
    const first = await buildBuildingGraph(spec, catalog);
    const second = await buildBuildingGraph(spec, catalog);

    expect(first).toEqual(second);
    expect(BuildingGraphSchema.safeParse(first).success).toBe(true);
    expect(validateBuildingGraph(first)).toEqual([]);
    expect(first.graphId).toMatch(/^graph-/);
    expect(first.nodes.at(-1)?.id).toBe(first.outputNodeId);
    expect(first.nodes.map((node) => node.type)).toEqual([
      "CreateRectFootprint",
      "ExtrudeMassing",
      "ForEachFacade",
      "SplitFloors",
      "SplitBays",
      "Group",
      "EmitWallPanel",
      "PlaceOpening",
      "InstanceComponent",
      "InstanceComponent",
      "SweepProfile",
      "EmitRoof",
      "OutputBuilding"
    ]);

    const artKitNode = first.nodes.find((node) => node.id === "node.art-kit-facade-plan");
    expect(artKitNode).toEqual(
      expect.objectContaining({
        type: "Group",
        stage: "facade",
        upstreamIds: ["node.bays"]
      })
    );
    expect(artKitNode?.parameters.artKitManifestId).toBe("late-19c-apartment-kit");
    expect(artKitNode?.parameters.placementCount).toBeGreaterThan(0);
    expect(artKitNode?.parameters.diagnostics).toEqual([]);
    expect(artKitNode?.parameters.placements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: "wall-panel.brick.body",
          layer: "wall",
          facade: "front"
        })
      ])
    );

    for (const node of first.nodes) {
      expect(node.semanticPathTemplate).toContain("building/");
      expect(["massing", "facade", "openings", "trim", "roof"]).toContain(node.stage);
    }
  });

  it("plans repeated windows as instance component work rather than duplicated mesh recipes", async () => {
    const { spec, catalog } = await fixtureInputs();
    const graph = await buildBuildingGraph(spec, catalog);
    const windowNode = graph.nodes.find(
      (node) => node.type === "InstanceComponent" && node.parameters.role === "window"
    );
    const trimNode = graph.nodes.find(
      (node) => node.type === "InstanceComponent" && node.parameters.role === "verticalTrim"
    );

    expect(windowNode?.parameters.recipeId).toBe("recipe.window.tall-arched.frame");
    expect(windowNode?.parameters.instanceCount).toBe(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(windowNode?.parameters.semanticPathTemplate).toBe(
      `building/${spec.familyId}/facade/front/floor/{floor}/bay/{bay}/window/frame`
    );
    expect(trimNode?.parameters.instanceCount).toBe(spec.facade.frontBayCount + 1);
    expect(catalog.recipes.filter((recipe) => recipe.role === "window")).toHaveLength(1);
  });

  it("validates missing upstream nodes and graph cycles", async () => {
    const { spec, catalog } = await fixtureInputs();
    const graph = await buildBuildingGraph(spec, catalog);
    const missingUpstreamGraph: BuildingGraph = structuredClone(graph);
    missingUpstreamGraph.nodes[1].upstreamIds = ["missing-node"];

    expect(validateBuildingGraph(missingUpstreamGraph)).toContainEqual(
      expect.objectContaining({
        code: "buildingGraph.missingUpstream",
        severity: "error",
        received: "missing-node"
      })
    );

    const cyclicGraph: BuildingGraph = structuredClone(graph);
    cyclicGraph.nodes[0].upstreamIds = [graph.outputNodeId];
    expect(validateBuildingGraph(cyclicGraph)).toContainEqual(
      expect.objectContaining({
        code: "buildingGraph.cycle",
        severity: "error"
      })
    );
  });
});
