import {
  OPENING_SLOT_ALIGNMENT_EPS_M,
  FRAME_INSET_FROM_SLOT_M,
  OPENING_DEPTH_HIERARCHY,
  bindOpeningToSlot,
  bindOpeningsFromSplitPlan,
  openingPaneThicknessM,
  frameMatchesSlotWidth,
  planeCentersAligned
} from "../compiler/openingSlotBinding";
import { applyWindowWidthOverride, buildFacadeSplitPlan, type FacadeSplitOpeningPlacement, type FacadeSplitPlan } from "../compiler/facadeSplitPlan";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

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

async function p3BindingPlan(): Promise<FacadeSplitPlan> {
  const spec: BuildingFamilySpec = {
    schemaVersion: "0.1.0", familyId: "family-width-binding", sourceIntentHash: "intent-width-binding", stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: { widthM: 24, depthM: 16, floorCount: 3, floorHeightsM: [4.2, 3.2, 3.2], parapetHeightM: 1, roof: { type: "flat" } },
    facade: { frontBayCount: 5, sideBaySpacingM: 4, groundFloorRatio: 0.26, corniceHeightM: 1, symmetry: 0.9 },
    selectedFamilies: { wall: "brick-red", roof: "flat-membrane", window: "tall-arched", door: "recessed-storefront", cornice: "bracketed-metal", trim: "pressed-metal" },
    materialParameters: {}, componentParameters: {}, variationPolicy: {}, locks: [], diagnostics: []
  };
  return buildFacadeSplitPlan({ spec, wallDepthM: 0.34, defaultOpeningMode: "multi-facade" });
}

describe("R3.P3 narrowed aperture binding", () => {
  let plan: FacadeSplitPlan;
  const recipes = { window: { width: 1.35, height: 2.45, depth: 0.58, glazingThicknessM: 0.02 }, door: { width: 1.6, height: 2.9, depth: 0.62, glazingThicknessM: 0.02 } };
  beforeAll(async () => { plan = await p3BindingPlan(); });

  it("derives aligned frame, glazing, backing and perimeter-return metrics from the edited slot on all facades", async () => {
    const original = structuredClone(plan), previous = bindOpeningsFromSplitPlan(plan.openings, plan.wallDepthM, recipes);
    for (const facade of ["front", "rear", "left", "right"] as const) {
      const index = plan.openings.findIndex(opening => opening.facade === facade && opening.floorIndex === 1 && opening.kind === "window");
      expect(index).toBeGreaterThanOrEqual(0);
      const opening = plan.openings[index], widthM = 0.6;
      const next = await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: { schemaVersion: "0.1.0", facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex }, widthM });
      const bound = bindOpeningsFromSplitPlan(next.openings, next.wallDepthM, recipes);
      expect(bound).toHaveLength(previous.length);
      for (let other = 0; other < bound.length; other += 1) if (other !== index) expect(bound[other]).toEqual(previous[other]);
      const selected = bound[index], old = previous[index], along = facade === "left" || facade === "right" ? 2 : 0;
      const frameWidth = widthM - 2 * FRAME_INSET_FROM_SLOT_M;
      expect(next.openings[index].sizeM).toEqual([widthM, opening.sizeM[1], opening.sizeM[2]]);
      expect(selected.frameOuterSizeM[0]).toBe(frameWidth);
      expect(frameMatchesSlotWidth(selected.frameOuterSizeM[0], widthM)).toBe(true);
      expect(selected.frameOuterSizeM.slice(1)).toEqual(old.frameOuterSizeM.slice(1));
      for (const field of ["frameCenterM", "glazingCenterM", "backingCenterM", "pocketCenterM", "revealCenterM"] as const) expect(selected[field]).toEqual(old[field]);
      expect(selected.glazingThicknessM).toBe(recipes.window.glazingThicknessM);
      expect(selected.backingSizeM[along]).toBe(frameWidth);
      expect(selected.pocketSizeM[along]).toBe(frameWidth * OPENING_DEPTH_HIERARCHY.pocketPadWindow.width);
      expect(selected.revealSizeM[along]).toBe(selected.pocketSizeM[along] + OPENING_DEPTH_HIERARCHY.revealPadM);
      for (const field of ["pocketSizeM", "backingSizeM", "revealSizeM"] as const) {
        for (const axis of [0, 1, 2]) if (axis !== along) expect(selected[field][axis]).toBe(old[field][axis]);
      }
      expect(Math.hypot(...selected.transform.slice(0, 3)) * recipes.window.width).toBeCloseTo(frameWidth, 12);
      for (let component = 3; component < 16; component += 1) expect(selected.transform[component]).toBe(old.transform[component]);
      expect(selected.transform.slice(12, 15)).toEqual(opening.centerM);
      expect(plan).toEqual(original);
    }
  });

  it("admits the exact minimum slot without slot or frame width clamping", async () => {
    const widthM = 0.23;
    for (const facade of ["front", "rear", "left", "right"] as const) {
      const opening = plan.openings.find(entry => entry.facade === facade && entry.floorIndex === 1 && entry.kind === "window")!;
      const next = await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: { schemaVersion: "0.1.0", facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex }, widthM });
      const selected = next.openings.find(entry => entry.semanticPath === opening.semanticPath)!;
      const bound = bindOpeningToSlot({ placement: selected, wallDepthM: next.wallDepthM, recipeWidthM: recipes.window.width, recipeHeightM: recipes.window.height, recipeDepthM: recipes.window.depth, glazingThicknessM: recipes.window.glazingThicknessM });
      expect(selected.sizeM[0]).toBe(widthM);
      expect(bound.frameOuterSizeM[0]).toBe(widthM - 2 * FRAME_INSET_FROM_SLOT_M);
      expect(bound.frameOuterSizeM[0]).toBeCloseTo(0.15, 14);
      expect(bound.backingSizeM[facade === "left" || facade === "right" ? 2 : 0]).toBe(bound.frameOuterSizeM[0]);
      expect(bound.frameCenterM).toEqual(opening.centerM);
    }
  });
});

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
    expect(bound.pocketSizeM[2]).toBeGreaterThanOrEqual(0.34 * OPENING_DEPTH_HIERARCHY.pocketDepthOfWall);
    expect(bound.pocketCenterM[2] + bound.pocketSizeM[2] / 2).toBeGreaterThanOrEqual(
      bound.glazingCenterM[2] + bound.glazingThicknessM / 2 +
      OPENING_DEPTH_HIERARCHY.backingClearanceM
    );
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
    const expectedSz = bound.frameOuterSizeM[2] / 0.4;
    // A proper half-turn maps local +X and +Z to world −X and −Z.
    expect(bound.transform[0]).toBeCloseTo(-expectedSx, 5);
    expect(bound.transform[5]).toBeCloseTo(expectedSy, 5);
    // Front facade flips local +Z (exterior) onto world −Z.
    expect(bound.transform[10]).toBeCloseTo(-expectedSz, 5);
    expect(bound.transform[12]).toBeCloseTo(slot.centerM[0], 5);
    expect(bound.transform[13]).toBeCloseTo(slot.centerM[1], 5);
    expect(bound.transform[14]).toBeCloseTo(slot.centerM[2], 5);
  });

  it("orients left-facade openings so local exterior maps onto −X", () => {
    const slot = placement({
      facade: "left",
      centerM: [-9, 5.5, 2],
      sizeM: [1.4, 2.2, 0.22]
    });
    const bound = bindOpeningToSlot({
      placement: slot,
      wallDepthM: 0.34,
      recipeWidthM: 1.2,
      recipeHeightM: 2.0,
      recipeDepthM: 0.4
    });
    // Local +Z column points along world −X for left facade.
    expect(bound.transform[8]).toBeLessThan(0);
    expect(Math.abs(bound.transform[8])).toBeCloseTo(bound.scale[2], 5);
  });

  it.each(["front", "rear", "left", "right"] as const)(
    "keeps backing behind the glazing rear face for thin walls and deep frames on %s",
    (facade) => {
      const inward = facade === "front" ? [0, 0, 1] : facade === "rear" ? [0, 0, -1] :
        facade === "left" ? [1, 0, 0] : [-1, 0, 0];
      const depthAxis = facade === "left" || facade === "right" ? 0 : 2;
      for (const wallDepthM of [0.05, 0.34, 0.7]) {
        for (const recipeDepthM of [0.1, 0.58, 1.2]) {
          for (const glazingThicknessM of [0, 0.02, 0.04, 0.08]) {
            const slot = placement({ facade });
            const bound = bindOpeningToSlot({
              placement: slot, wallDepthM, recipeWidthM: 1.35, recipeHeightM: 2.45, recipeDepthM, glazingThicknessM
            });
            const context = `${facade}: wall ${wallDepthM} m, frame ${recipeDepthM} m, glass ${glazingThicknessM} m`;
            const inwardDepth = (center: number[]) => center.reduce(
              (total, coordinate, axis) => total + (coordinate - slot.centerM[axis]!) * inward[axis]!, 0
            );
            const glazingDepth = inwardDepth(bound.glazingCenterM);
            const backingExterior = inwardDepth(bound.backingCenterM) - bound.backingSizeM[depthAxis] / 2;
            const pocketExterior = inwardDepth(bound.pocketCenterM) - bound.pocketSizeM[depthAxis] / 2;
            const pocketInterior = inwardDepth(bound.pocketCenterM) + bound.pocketSizeM[depthAxis] / 2;
            const revealExterior = inwardDepth(bound.revealCenterM) - bound.revealSizeM[depthAxis] / 2;
            const m = bound.transform;
            const determinant = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
              m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
              m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);

            expect(glazingDepth, context).toBeCloseTo(bound.frameOuterSizeM[2] * 0.72, 8);
            expect(bound.glazingThicknessM, context).toBe(glazingThicknessM);
            expect(backingExterior - glazingDepth - bound.glazingThicknessM / 2, context).toBeGreaterThanOrEqual(0.02 - 1e-9);
            expect(determinant, context).toBeGreaterThan(0);
            expect(backingExterior, context).toBeGreaterThanOrEqual(wallDepthM - 1e-9);
            expect(bound.backingSizeM[depthAxis], context).toBeGreaterThanOrEqual(0.02);
            expect(pocketExterior, context).toBeGreaterThanOrEqual(-1e-9);
            expect(revealExterior, context).toBeGreaterThanOrEqual(-1e-9);
            expect(pocketInterior, context).toBeGreaterThanOrEqual(backingExterior - 1e-9);
            expect(bound.pocketSizeM[depthAxis], context).toBeGreaterThanOrEqual(wallDepthM * 0.92 - 1e-9);
            for (const axis of [0, 1, 2]) {
              if (axis !== depthAxis) {
                expect(bound.glazingCenterM[axis], context).toBe(slot.centerM[axis]);
                expect(bound.backingCenterM[axis], context).toBe(slot.centerM[axis]);
              }
            }
          }
        }
      }
    }
  );

  it("preserves legal pane thickness and rejects invalid depth values", () => {
    expect(openingPaneThicknessM(undefined)).toBe(0.02);
    for (const thickness of [0, 0.02, 0.04, 0.08]) {
      expect(openingPaneThicknessM(thickness)).toBe(thickness);
    }
    for (const thickness of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => openingPaneThicknessM(thickness)).toThrow();
    }
  });
});
