import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { supportsGroupedConstruction } from "../ui/constructionBuildingBindings";

it("keeps the head, sash, roof and selected width through registered editing", () => {
  let graph = withConstructionRoundHead(createBuildingConstructionGraph(), 1);
  graph = withConstructionWindowLayout(graph, "window", 2);
  graph = withConstructionCorniceLayout(graph, 2);
  graph = withConstructionParapetSilhouette(graph, 1);
  graph = withConstructionOpeningWidth(graph, { target: { documentId: graph.documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 1 }, widthM: 1.0 });
  expect(graph.schemaVersion).toBe("0.10.0"); expect(supportsGroupedConstruction(graph)).toBe(true);
  expect(graph.nodes.find(node=>node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
  expect(graph.nodes.find(node=>node.type === "AssembleWindow")!.parameters.layout).toBe(2);
  expect(graph.nodes.find(node=>node.type === "BuildingRoof")!.parameters.parapetSilhouette).toBe(1);
  expect(graph.nodes.find(node=>node.type === "EditOpeningWidth")!.overrides).toHaveLength(1);
});

it("retains or releases the head with authored changes and opening locks", async () => {
  const graph = withConstructionRoundHead(createBuildingConstructionGraph(), 1);
  const keep = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: true });
  const lock = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: true });
  const release = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false });
  for (const result of [keep, lock]) expect(result.graph.nodes.find(node=>node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(1);
  expect(release.graph.nodes.find(node=>node.type === "PlaceOpening")!.parameters.upperFrontRoundHead).toBe(0);
});
