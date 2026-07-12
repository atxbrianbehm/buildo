/**
 * Slot-locked opening binding (G2).
 *
 * Pure helpers: frame outer size, pocket AABB, and instance transform all derive
 * from one FacadeSplitPlan opening slot — never from free-floating recipe size alone.
 *
 * Depth hierarchy (exterior → interior):
 *   wall outer face
 *     → frame (slightly proud of wall)
 *     → pocket recess into wall thickness
 *     → glass (deeper than frame sash; see openingGeometry glass z)
 */

import type { Diagnostic } from "../core/diagnostics";
import { translationMatrix, type Vec3 } from "./primitiveGeometry";
import type { FacadeSplitOpeningPlacement } from "./facadeSplitPlan";
import type { WallFacadeName } from "./facadeWallSubdivision";

/** Alignment tolerance for slot vs frame plane metrics (5 cm). */
export const OPENING_SLOT_ALIGNMENT_EPS_M = 0.05;

/** Frame outer is inset from punched slot so casing sits in the hole, not on the pier. */
export const FRAME_INSET_FROM_SLOT_M = 0.04;

/**
 * Documented depth hierarchy fractions of wall thickness / frame depth.
 * Values are intentional constants — not magic numbers scattered in the compiler.
 */
export const OPENING_DEPTH_HIERARCHY = {
  /** Pocket thickness as a fraction of wall depth. */
  pocketDepthOfWall: 0.72,
  /** Pocket center distance from frame center along inward wall normal (× wall depth). */
  pocketCenterInwardOfWall: 0.38,
  /** Outer reveal lip thickness (× wall depth). */
  revealDepthOfWall: 0.18,
  /** Reveal center distance from frame along inward normal (× wall depth). */
  revealCenterInwardOfWall: 0.1,
  /** Pocket plane scale vs frame outer (window). */
  pocketPadWindow: { width: 1.1, height: 1.08 },
  /** Pocket plane scale vs frame outer (door). */
  pocketPadDoor: { width: 1.06, height: 1.04 },
  /** Reveal pad beyond pocket plane size (meters). */
  revealPadM: 0.08
} as const;

export interface OpeningSlotBindingInput {
  placement: FacadeSplitOpeningPlacement;
  wallDepthM: number;
  /** Recipe nominal outer size used to compute instance scale. */
  recipeWidthM: number;
  recipeHeightM: number;
  recipeDepthM: number;
}

export interface BoundOpeningGeometry {
  kind: "window" | "door";
  facade: WallFacadeName;
  /** World center of the frame instance (same as slot center). */
  frameCenterM: Vec3;
  /** Outer frame size after slot inset (width, height, depth). */
  frameOuterSizeM: Vec3;
  /** Additive pocket mass center (into the wall). */
  pocketCenterM: Vec3;
  pocketSizeM: Vec3;
  /** Outer reveal lip on the facade plane. */
  revealCenterM: Vec3;
  revealSizeM: Vec3;
  /** Column-major TRS: scale recipe local geometry to frame outer, then translate. */
  transform: number[];
  scale: Vec3;
  /** Non-fatal notes (e.g. oversize recipe clamped to slot). */
  diagnostics: Diagnostic[];
}

function facadeInwardNormal(facade: WallFacadeName): Vec3 {
  switch (facade) {
    case "front":
      return [0, 0, 1];
    case "rear":
      return [0, 0, -1];
    case "left":
      return [1, 0, 0];
    case "right":
      return [-1, 0, 0];
    default:
      return [0, 0, 1];
  }
}

function offsetAlong(center: Vec3, normal: Vec3, distance: number): Vec3 {
  return [
    center[0] + normal[0] * distance,
    center[1] + normal[1] * distance,
    center[2] + normal[2] * distance
  ];
}

/**
 * Scale (sx,sy,sz) about origin then translate to position — column-major 4×4.
 * Matches Three.js Matrix4 / InstancedMesh convention used by the scene adapter.
 */
export function scaleTranslateMatrix(scale: Vec3, position: Vec3): number[] {
  return [
    scale[0],
    0,
    0,
    0,
    0,
    scale[1],
    0,
    0,
    0,
    0,
    scale[2],
    0,
    position[0],
    position[1],
    position[2],
    1
  ];
}

/**
 * Bind one split opening slot to frame outer size, pocket AABB, and instance transform.
 * Oversize recipes are clamped to the slot (with inset); a warning diagnostic is emitted.
 */
export function bindOpeningToSlot(input: OpeningSlotBindingInput): BoundOpeningGeometry {
  const { placement, wallDepthM } = input;
  const wallDepth = Math.max(0.05, wallDepthM);
  const slotW = Math.max(0.2, placement.sizeM[0]);
  const slotH = Math.max(0.2, placement.sizeM[1]);
  const slotDepth = Math.max(0.05, placement.sizeM[2]);
  const diagnostics: Diagnostic[] = [];

  const maxFrameW = Math.max(0.15, slotW - 2 * FRAME_INSET_FROM_SLOT_M);
  const maxFrameH = Math.max(0.15, slotH - 2 * FRAME_INSET_FROM_SLOT_M);

  const recipeW = Math.max(0.05, input.recipeWidthM);
  const recipeH = Math.max(0.05, input.recipeHeightM);
  const recipeD = Math.max(0.05, input.recipeDepthM);

  if (recipeW > slotW + OPENING_SLOT_ALIGNMENT_EPS_M || recipeH > slotH + OPENING_SLOT_ALIGNMENT_EPS_M) {
    diagnostics.push({
      code: "opening.module-oversize",
      severity: "warning",
      message: `Opening module ${recipeW.toFixed(2)}×${recipeH.toFixed(2)} m exceeds slot ${slotW.toFixed(2)}×${slotH.toFixed(2)} m; clamped to slot with inset.`,
      path: placement.semanticPath,
      received: { recipeW, recipeH, slotW, slotH }
    });
  }

  // Frame fills the slot inset — not the raw recipe size (scale maps recipe → frame).
  const frameW = maxFrameW;
  const frameH = maxFrameH;
  const frameD = Math.min(slotDepth, Math.max(recipeD, wallDepth * 0.45));
  const frameCenterM: Vec3 = [...placement.centerM];

  const pad =
    placement.kind === "door"
      ? OPENING_DEPTH_HIERARCHY.pocketPadDoor
      : OPENING_DEPTH_HIERARCHY.pocketPadWindow;
  const pocketAlong = frameW * pad.width;
  const pocketH = frameH * pad.height;
  const pocketDepth = wallDepth * OPENING_DEPTH_HIERARCHY.pocketDepthOfWall;
  const inward = facadeInwardNormal(placement.facade);
  const pocketCenterM = offsetAlong(
    frameCenterM,
    inward,
    wallDepth * OPENING_DEPTH_HIERARCHY.pocketCenterInwardOfWall
  );
  const revealCenterM = offsetAlong(
    frameCenterM,
    inward,
    wallDepth * OPENING_DEPTH_HIERARCHY.revealCenterInwardOfWall
  );
  const revealPad = OPENING_DEPTH_HIERARCHY.revealPadM;
  const revealDepth = wallDepth * OPENING_DEPTH_HIERARCHY.revealDepthOfWall;
  const isSide = placement.facade === "left" || placement.facade === "right";
  // Axis-aligned pocket box: wall thickness along X for side facades, Z for front/rear.
  const pocketSizeM: Vec3 = isSide
    ? [pocketDepth, pocketH, pocketAlong]
    : [pocketAlong, pocketH, pocketDepth];
  const revealSizeM: Vec3 = isSide
    ? [revealDepth, pocketH + revealPad, pocketAlong + revealPad]
    : [pocketAlong + revealPad, pocketH + revealPad, revealDepth];

  const scale: Vec3 = [frameW / recipeW, frameH / recipeH, frameD / recipeD];
  const transform = scaleTranslateMatrix(scale, frameCenterM);

  return {
    kind: placement.kind,
    facade: placement.facade,
    frameCenterM,
    frameOuterSizeM: [frameW, frameH, frameD],
    pocketCenterM,
    pocketSizeM,
    revealCenterM,
    revealSizeM,
    transform,
    scale,
    diagnostics
  };
}

/** Bind every split opening; preserves 1:1 order with `plan.openings`. */
export function bindOpeningsFromSplitPlan(
  openings: FacadeSplitOpeningPlacement[],
  wallDepthM: number,
  recipes: { window: { width: number; height: number; depth: number }; door: { width: number; height: number; depth: number } }
): BoundOpeningGeometry[] {
  return openings.map((placement) => {
    const recipe = placement.kind === "door" ? recipes.door : recipes.window;
    return bindOpeningToSlot({
      placement,
      wallDepthM,
      recipeWidthM: recipe.width,
      recipeHeightM: recipe.height,
      recipeDepthM: recipe.depth
    });
  });
}

/** Plane alignment check: |a - b| < ε on X and Y (facade-plane axes for front). */
export function planeCentersAligned(
  a: Vec3,
  b: Vec3,
  epsM: number = OPENING_SLOT_ALIGNMENT_EPS_M
): boolean {
  return Math.abs(a[0] - b[0]) < epsM && Math.abs(a[1] - b[1]) < epsM;
}

/** |frameOuter - (slot - 2×inset)| within ε. */
export function frameMatchesSlotWidth(
  frameWidthM: number,
  slotWidthM: number,
  epsM: number = OPENING_SLOT_ALIGNMENT_EPS_M
): boolean {
  const expected = Math.max(0.15, slotWidthM - 2 * FRAME_INSET_FROM_SLOT_M);
  return Math.abs(frameWidthM - expected) < epsM;
}

/** Identity translation (no scale) — retained for tests/compare. */
export function translationOnly(position: Vec3): number[] {
  return translationMatrix(position);
}
