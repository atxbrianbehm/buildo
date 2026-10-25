import {
  boundsOverlap,
  createModuleSnapGrid,
  isAlignedToGrid,
  snapMeters,
  validateBoundsFit,
  validatePlacementGridAlignment,
  validateSameFacadeLayerOverlap,
  validateSameLayerOverlap
} from "../art-kit";

describe("module snap grid", () => {
  it("snaps meter values to the configured one meter grid", () => {
    const grid = createModuleSnapGrid();

    expect(grid.unitMeters).toBe(1);
    expect(snapMeters(2.49, grid)).toBe(2);
    expect(snapMeters(2.5, grid)).toBe(3);
    expect(snapMeters(-1.49, grid)).toBe(-1);
    expect(isAlignedToGrid(4.0000001, grid)).toBe(true);
    expect(isAlignedToGrid(4.25, grid)).toBe(false);
  });

  it("reports placements that are not aligned to the grid", () => {
    const diagnostics = validatePlacementGridAlignment(
      {
        id: "placement.wall.off-grid",
        moduleId: "wall-panel.brick.body",
        originMeters: [0.5, 0, 0],
        sizeMeters: [2, 3, 0.35]
      },
      createModuleSnapGrid()
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.originOffGrid",
        path: "placement.wall.off-grid.originMeters[0]",
        received: 0.5
      })
    );
  });

  it("checks module bounds fit within facade cells", () => {
    const diagnostics = validateBoundsFit(
      {
        id: "placement.window.too-wide",
        moduleId: "opening.window.rectangular",
        originMeters: [0, 0, 0],
        sizeMeters: [4, 2, 0.42]
      },
      {
        id: "cell.front.0.0",
        originMeters: [0, 0, 0],
        sizeMeters: [3, 4, 0.6]
      }
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.moduleDoesNotFit",
        path: "placement.window.too-wide.sizeMeters"
      })
    );
  });

  it("detects overlap only when placements share the same layer", () => {
    const first = {
      id: "placement.wall.0",
      moduleId: "wall-panel.brick.body",
      layer: "wall" as const,
      originMeters: [0, 0, 0] as [number, number, number],
      sizeMeters: [2, 3, 0.3] as [number, number, number]
    };
    const second = {
      ...first,
      id: "placement.wall.1",
      originMeters: [1, 0, 0] as [number, number, number]
    };
    const opening = {
      ...first,
      id: "placement.opening.0",
      layer: "opening" as const
    };

    expect(boundsOverlap(first, second)).toBe(true);
    expect(validateSameLayerOverlap([first, opening])).toEqual([]);
    expect(validateSameLayerOverlap([first, second])).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.sameLayerOverlap",
        received: ["placement.wall.0", "placement.wall.1"]
      })
    );
  });

  it("scopes facade overlap diagnostics to the same facade", () => {
    const front = {
      id: "placement.wall.front",
      moduleId: "wall-panel.brick.body",
      facade: "front",
      layer: "wall" as const,
      originMeters: [0, 0, 0] as [number, number, number],
      sizeMeters: [2, 3, 0.3] as [number, number, number]
    };
    const left = {
      ...front,
      id: "placement.wall.left",
      facade: "left",
      originMeters: [0, 0, 0] as [number, number, number]
    };

    expect(validateSameFacadeLayerOverlap([front, left])).toEqual([]);
    expect(
      validateSameFacadeLayerOverlap([
        front,
        { ...front, id: "placement.wall.front.2", originMeters: [1, 0, 0] }
      ])
    ).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.sameLayerOverlap",
        received: ["placement.wall.front", "placement.wall.front.2"]
      })
    );
  });
});
