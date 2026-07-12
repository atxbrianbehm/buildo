/**
 * Expander map (G6) — single home for pure geometry expand entry points.
 *
 * Kit compile path:
 *   FacadeModulePlan → FacadeSplitPlan → expanders → RuntimeBuildingIR
 *
 * `buildingCompiler.ts` orchestrates; expanders own geometry math.
 * No React / Three / Zustand / DOM here.
 */

export {
  buildOpeningAssemblyGeometry,
  buildOpeningAssemblyPrimitives,
  buildOpeningGlassPrimitives,
  buildDoorFramePrimitives,
  buildWindowFramePrimitives,
  openingAssemblyDepthExtent,
  openingGlassInsetFromExterior,
  type BuildOpeningGeometryInput,
  type OpeningGeometryDetail
} from "../openingGeometry";

export {
  OPENING_DEPTH_HIERARCHY,
  OPENING_SLOT_ALIGNMENT_EPS_M,
  FRAME_INSET_FROM_SLOT_M,
  bindOpeningToSlot,
  bindOpeningsFromSplitPlan,
  frameMatchesSlotWidth,
  planeCentersAligned,
  scaleTranslateMatrix,
  type BoundOpeningGeometry,
  type OpeningSlotBindingInput
} from "../openingSlotBinding";

export {
  buildFacadeSplitPlan,
  wallPrimitivesFromSplitPlan,
  openingTransformFromPlacement,
  type FacadeSplitPlan,
  type FacadeSplitOpeningPlacement
} from "../facadeSplitPlan";

export {
  buildFacadeBayScopes,
  expandBayWallPrimitives,
  buildSubdividedFacadeWallPrimitives,
  type FacadeBayScope,
  type OpeningSlot,
  type WallFacadeName
} from "../facadeWallSubdivision";

export {
  splitGroundStorefrontVertical,
  clampOpeningToGlazingBand,
  type StorefrontVerticalSplit
} from "../storefrontScopeSplit";

export {
  densifyProfile,
  horizontalMoldingFromProfile,
  sweepProfileToBoxPrimitives
} from "../profileSweepGeometry";

export {
  buildCorniceProfilePrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildVerticalPilasterPrimitives,
  buildVerticalPilasterLocalPrimitives,
  buildRoofCapPrimitives,
  buildBasePlinthPrimitives,
  buildSpandrelBandPrimitives,
  buildCornerQuoinPrimitives
} from "../profiledTrimGeometry";

export {
  getProfileDefinition,
  requireProfileDefinition,
  scaleProfileToHeight,
  listProfileDefinitions,
  type ProfileDefinition,
  type ProfilePoint2
} from "../profileLibrary";

import { buildOpeningAssemblyPrimitives, type OpeningGeometryDetail } from "../openingGeometry";
import {
  bindOpeningToSlot,
  type BoundOpeningGeometry,
  type OpeningSlotBindingInput
} from "../openingSlotBinding";
import type { ComponentRecipe } from "../../contracts/componentRecipe";
import {
  densifyProfile,
  horizontalMoldingFromProfile,
  sweepProfileToBoxPrimitives
} from "../profileSweepGeometry";
import { requireProfileDefinition, scaleProfileToHeight } from "../profileLibrary";
import type { PrimitiveGeometry, Vec3 } from "../primitiveGeometry";
import type { ProfileDefinition } from "../profileLibrary";

/**
 * Stable high-detail kit mesh batch ids (documented smoke list for G6/G8).
 * Order is not load-bearing; presence is.
 */
export const KIT_HIGH_DETAIL_MESH_BATCH_IDS = [
  "mesh.wall-panels",
  "mesh.base-plinth",
  "mesh.storefront-hierarchy",
  "mesh.cornice",
  "mesh.belt-course",
  "mesh.vertical-pilasters",
  "mesh.spandrels",
  "mesh.opening-pockets",
  "mesh.roof-cap",
  "mesh.corner-quoins",
  "mesh.roof"
] as const;

export const KIT_OPENING_INSTANCE_BATCH_IDS = [
  "instances.window",
  "instances.window.glass",
  "instances.door",
  "instances.door.glass"
] as const;

/** Unified opening expand: slot bind → optional local frame primitives for diagnostics. */
export function expandOpeningFromSlot(
  input: OpeningSlotBindingInput & {
    recipe: ComponentRecipe;
    detail?: OpeningGeometryDetail;
  }
): {
  binding: BoundOpeningGeometry;
  framePrimitives: PrimitiveGeometry[];
} {
  const binding = bindOpeningToSlot(input);
  const framePrimitives = buildOpeningAssemblyPrimitives({
    recipe: {
      ...input.recipe,
      dimensionsM: {
        width: binding.frameOuterSizeM[0],
        height: binding.frameOuterSizeM[1],
        depth: binding.frameOuterSizeM[2]
      }
    },
    detail: input.detail ?? "high",
    part: "frame"
  });
  return { binding, framePrimitives };
}

/**
 * Unified profile run expand: lookup profile id → densify → sweep along run axis.
 * New style packs add profiles by id without forking compiler conditionals.
 */
export function expandProfileRun(input: {
  profileId: string;
  center: Vec3;
  runLengthM: number;
  runAxis?: "x" | "y";
  facadeSign?: 1 | -1;
  targetHeightM?: number;
  densifySteps?: number;
}): { profile: ProfileDefinition; primitives: PrimitiveGeometry[] } {
  let profile = requireProfileDefinition(input.profileId);
  if (input.targetHeightM !== undefined) {
    profile = scaleProfileToHeight(profile, input.targetHeightM);
  }
  if (input.densifySteps !== undefined && input.densifySteps > 1) {
    profile = densifyProfile(profile, input.densifySteps);
  }
  const runAxis = input.runAxis === "y" ? "y" : "x";
  const primitives =
    runAxis === "x"
      ? horizontalMoldingFromProfile({
          profile,
          center: input.center,
          widthM: input.runLengthM,
          facadeSign: input.facadeSign
        })
      : sweepProfileToBoxPrimitives({
          profile,
          center: input.center,
          runLengthM: input.runLengthM,
          runAxis,
          facadeSign: input.facadeSign
        });
  return { profile, primitives };
}
