import { summarizeArtKitFacadePlanFromGraph } from "../art-kit";
import type { BuildingGraph } from "../contracts/buildingGraph";

describe("summarizeArtKitFacadePlanFromGraph", () => {
  it("returns an empty summary when the graph has no art-kit plan node", () => {
    const graph: BuildingGraph = {
      schemaVersion: "0.1.0",
      graphId: "graph-empty",
      outputNodeId: "node.output",
      nodes: [
        {
          id: "node.output",
          type: "OutputBuilding",
          parameters: {},
          upstreamIds: [],
          semanticPathTemplate: "building/demo/output",
          stage: "roof"
        }
      ]
    };

    expect(summarizeArtKitFacadePlanFromGraph(graph)).toEqual({
      schemaVersion: "0.1.0",
      present: false,
      cellCount: 0,
      placementCount: 0,
      placementsByFacade: {},
      diagnostics: [],
      samplePlacements: []
    });
  });

  it("summarizes art-kit plan node parameters for UI provenance", () => {
    const graph: BuildingGraph = {
      schemaVersion: "0.1.0",
      graphId: "graph-plan",
      outputNodeId: "node.output",
      nodes: [
        {
          id: "node.art-kit-facade-plan",
          type: "Group",
          parameters: {
            artKitManifestId: "late-19c-apartment-kit",
            plannerId: "seeded-greedy",
            unitMeters: 1,
            cellCount: 4,
            placementCount: 5,
            diagnostics: [
              {
                code: "artKit.snapGrid.moduleDoesNotFit",
                message: "too big",
                severity: "error",
                path: "placement.x"
              }
            ],
            placements: [
              {
                id: "placement.wall.front.0",
                moduleId: "wall-panel.brick.body",
                facade: "front",
                layer: "wall",
                floorIndex: 0,
                bayIndex: 0
              },
              {
                id: "placement.opening.front.0",
                moduleId: "opening.window.rectangular",
                facade: "front",
                layer: "opening",
                floorIndex: 0,
                bayIndex: 0
              },
              {
                id: "placement.wall.rear.0",
                moduleId: "wall-panel.brick.body",
                facade: "rear",
                layer: "wall",
                floorIndex: 0,
                bayIndex: 0
              }
            ]
          },
          upstreamIds: ["node.bays"],
          semanticPathTemplate: "building/demo/art-kit/facade-plan",
          stage: "facade"
        }
      ]
    };

    const summary = summarizeArtKitFacadePlanFromGraph(graph);
    expect(summary.present).toBe(true);
    expect(summary.artKitManifestId).toBe("late-19c-apartment-kit");
    expect(summary.plannerId).toBe("seeded-greedy");
    expect(summary.cellCount).toBe(4);
    expect(summary.placementCount).toBe(5);
    expect(summary.placementsByFacade).toEqual({ front: 2, rear: 1 });
    expect(summary.diagnostics).toHaveLength(1);
    expect(summary.samplePlacements[0]?.moduleId).toBe("wall-panel.brick.body");
  });
});
