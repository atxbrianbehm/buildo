import { expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";

it("retains the raised parapet through existing window, storefront, local-opening, cornice and surface operations", () => {
  let graph = withConstructionParapetSilhouette(createBuildingConstructionGraph(), 1);
  graph = withConstructionWindowLayout(graph, "window", 2);
  graph = withConstructionStorefront(graph, 1);
  graph = withConstructionOpeningWidth(graph, { target: { documentId: graph.documentId, storeysNodeId: "facade", windowNodeId: "window",
    face: "front", floorIndex: 1, bayIndex: 2 }, widthM: 1.8 });
  graph = withConstructionCorniceLayout(graph, 2);
  graph = setConstructionSurface(graph, emptyConstructionComposition(graph.documentId));
  expect(graph.schemaVersion).toBe("0.9.0");
  const roof = graph.nodes.find(node => node.type === "BuildingRoof")!;
  expect(roof.parameters.parapetSilhouette).toBe(1); expect(roof.parameters.corniceAssembly).toBe(2);
  expect(graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(2);
  expect(graph.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(1);
  expect(graph.nodes.find(node => node.type === "EditOpeningWidth")!.overrides).toHaveLength(1);
  expect(graph.nodes.some(node => node.type === "SetSurface")).toBe(true);
});
