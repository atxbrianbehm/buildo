import { createSeedTree } from "../core/seedTree";
import { baySemanticPath } from "../core/semanticPaths";

describe("SeedTree", () => {
  it("returns stable values by semantic path instead of call order", () => {
    const tree = createSeedTree("family-seed");
    const lowerFloorPath = baySemanticPath({
      buildingId: "b-001",
      facade: "front",
      floor: 1,
      bay: 2,
      role: "window",
      subrole: "frame"
    });

    const before = tree.fork("building/b-001").uint32(lowerFloorPath);
    tree.fork("building/b-001").uint32("building/b-001/facade/front/floor/7/bay/2/window/frame");
    const after = tree.fork("building/b-001").uint32(lowerFloorPath);

    expect(after).toBe(before);
  });

  it("chooses weighted items deterministically", () => {
    const tree = createSeedTree("family-seed");

    expect(
      tree.chooseWeighted(
        [
          { value: "brick", weight: 2 },
          { value: "stucco", weight: 1 }
        ],
        "wall"
      )
    ).toBe("brick");
  });
});

