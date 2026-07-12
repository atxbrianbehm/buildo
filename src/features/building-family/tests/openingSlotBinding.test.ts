import {
  OPENING_SLOT_ALIGNMENT_EPS_M,
  FRAME_INSET_FROM_SLOT_M,
  OPENING_DEPTH_HIERARCHY,
  bindOpeningToSlot,
  bindOpeningsFromSplitPlan,
  frameMatchesSlotWidth,
  planeCentersAligned
} from "../compiler/openingSlotBinding";
import type { FacadeSplitOpeningPlacement } from "../compiler/facadeSplitPlan";

function placement(overrides: Partial<FacadeSplitOpeningPlacement> = {}): FacadeSplitOpeningPlacement {
  return {
    facade: "front",
    floorIndex: 1,
    bayIndex: 2,
    kind: "window",
    semanticPath: "building/test/facade/front/floor/1/bay/2/opening/window",
    centerM: [1.2, 5.5, -8.03],
    sizeM: [1.5, 2.4, 0.2],
    ...overrides
  };
}

describe("openingSlotBinding", () => {
  it("locks frame outer width to slot inset within ε", () => {
    const slot = placement({ sizeM: [1.6, 2.5, 0.22] });
    const bound = bindOpeningToSlot({
      placement: slot,
      wallDepthM: 0.34,
      recipeWidthM: 1.35,
      recipeHeightM: 2.45,
      recipeDepthM: 0.42
    });

    expect(frameMatchesSlotWidth(bound.frameOuterSizeM[0], slot.sizeM[0])).toBe(true);
    expect(Math.abs(bound.frameOuterSizeM[0] - (slot.sizeM[0] - 2 * FRAME_INSET_FROM_SLOT_M))).toBeLessThan(
      OPENING_SLOT_ALIGNMENT_EPS_M
    );
    expect(Math.abs(bound.frameOuterSizeM[1] - (slot.sizeM[1] - 2 * FRAME_INSET_FROM_SLOT_M))).toBeLessThan(
      OPENING_SLOT_ALIGNMENT_EPS_M
    );
  });

  it("places pocket center on the same X/Y as the slot (facade plane)", () => {
    const slot = placement();
    const bound = bindOpeningToSlot({
      placement: slot,
      wallDepthM: 0.34,
      recipeWidthM: 1.35,
      recipeHeightM: 2.45,
      recipeDepthM: 0.42
    });

    expect(planeCentersAligned(bound.pocketCenterM, slot.centerM)).toBe(true);
    expect(planeCentersAligned(bound.frameCenterM, slot.centerM)).toBe(true);
    // Pocket is deeper into the wall than the frame (front: +Z inward).
    expect(bound.pocketCenterM[2]).toBeGreaterThan(bound.frameCenterM[2]);
    expect(bound.pocketSizeM[2]).toBeCloseTo(0.34 * OPENING_DEPTH_HIERARCHY.pocketDepthOfWall, 5);
  });

  it("emits oversize diagnostic and clamps instead of overflowing the slot", () => {
    const slot = placement({ sizeM: [1.0, 1.8, 0.2] });
    const bound = bindOpeningToSlot({
      placement: slot,
      wallDepthM: 0.34,
      recipeWidthM: 2.4,
      recipeHeightM: 3.0,
      recipeDepthM: 0.42
    });

    expect(bound.diagnostics.some((d) => d.code === "opening.module-oversize")).toBe(true);
    expect(bound.frameOuterSizeM[0]).toBeLessThanOrEqual(slot.sizeM[0]);
    expect(bound.frameOuterSizeM[1]).toBeLessThanOrEqual(slot.sizeM[1]);
    expect(bound.scale[0]).toBeLessThan(1);
    expect(bound.scale[1]).toBeLessThan(1);
  });

  it("binds 1:1 from a list of split openings", () => {
    const openings: FacadeSplitOpeningPlacement[] = [
      placement({ bayIndex: 0, kind: "door", sizeM: [1.8, 2.8, 0.22] }),
      placement({ bayIndex: 1, kind: "window" })
    ];
    const bound = bindOpeningsFromSplitPlan(openings, 0.34, {
      window: { width: 1.35, height: 2.45, depth: 0.42 },
      door: { width: 1.6, height: 2.9, depth: 0.45 }
    });
    expect(bound).toHaveLength(2);
    expect(bound[0]?.kind).toBe("door");
    expect(bound[1]?.kind).toBe("window");
  });

  it("scales transform so recipe maps onto frame outer size", () => {
    const slot = placement({ sizeM: [2.0, 3.0, 0.25] });
    const recipeW = 1.0;
    const recipeH = 1.5;
    const bound = bindOpeningToSlot({
      placement: slot,
      wallDepthM: 0.34,
      recipeWidthM: recipeW,
      recipeHeightM: recipeH,
      recipeDepthM: 0.4
    });
    const expectedSx = bound.frameOuterSizeM[0] / recipeW;
    const expectedSy = bound.frameOuterSizeM[1] / recipeH;
    expect(bound.transform[0]).toBeCloseTo(expectedSx, 5);
    expect(bound.transform[5]).toBeCloseTo(expectedSy, 5);
    expect(bound.transform[12]).toBeCloseTo(slot.centerM[0], 5);
    expect(bound.transform[13]).toBeCloseTo(slot.centerM[1], 5);
    expect(bound.transform[14]).toBeCloseTo(slot.centerM[2], 5);
  });
});
