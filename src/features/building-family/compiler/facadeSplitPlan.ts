import type { ArtKitManifest } from "../art-kit/artKitContracts";
import type { FacadeModulePlan } from "../art-kit/facadeModulePlanner";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { hashCanonicalJson } from "../core/contentHash";
import {
  buildFacadeBayScopes,
  expandBayWallPrimitives,
  type FacadeBayScope,
  type OpeningSlot,
  type WallFacadeName
} from "./facadeWallSubdivision";
import { translationMatrix, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

/**
 * Unified CGA/GN-style facade split: one plan drives wall scopes and opening slots.
 * Schema-versioned so it can enter traces / QA later.
 */
export interface FacadeSplitOpeningPlacement {
  facade: WallFacadeName;
  floorIndex: number;
  bayIndex: number;
  kind: "window" | "door";
  moduleId?: string;
  semanticPath: string;
  /** World-space center for module instance transform. */
  centerM: Vec3;
  sizeM: Vec3;
}

export interface FacadeSplitPlan {
  schemaVersion: "0.1.0";
  familyId: string;
  wallDepthM: number;
  contentHash: string;
  scopes: FacadeBayScope[];
  openings: FacadeSplitOpeningPlacement[];
}

export interface BuildFacadeSplitPlanInput {
  spec: BuildingFamilySpec;
  wallDepthM: number;
  /** When set, openings come only from the art-kit plan (no default punched grids). */
  facadePlan?: FacadeModulePlan;
  kit?: ArtKitManifest;
  /**
   * Proof-mode defaults when no facade plan: front-only grid.
   * Ignored when `facadePlan` is set (strict kit openings).
   */
  defaultOpeningMode?: "front-only" | "multi-facade";
}

export interface OpeningSeed {
  facade: WallFacadeName;
  floorIndex: number;
  bayIndex: number;
  widthM: number;
  heightM: number;
  kind?: "window" | "door";
  moduleId?: string;
  semanticPath?: string;
}

function openingWorldCenter(scope: FacadeBayScope, _wallDepthM: number): Vec3 {
  const open = scope.opening!;
  const isSide = scope.facade === "left" || scope.facade === "right";
  // Sit frames slightly proud of the outer wall face (GN: instance on facade face).
  if (!isSide) {
    // Front: origin z is outer face, wall grows +Z inward. Rear: origin is inner, outer is origin+depth.
    const outerZ =
      scope.facade === "front"
        ? scope.originM[2] - 0.03
        : scope.originM[2] + scope.sizeM[2] + 0.03;
    return [open.centerAlongM, open.centerYM, outerZ];
  }
  const outerX =
    scope.facade === "left"
      ? scope.originM[0] - 0.03
      : scope.originM[0] + scope.sizeM[0] + 0.03;
  return [outerX, open.centerYM, open.centerAlongM];
}

function openingsFromFacadePlan(plan: FacadeModulePlan, kit?: ArtKitManifest): OpeningSeed[] {
  const seeds: OpeningSeed[] = [];
  for (const placement of plan.placements) {
    if (placement.layer !== "opening") {
      continue;
    }
    const module = kit?.modules.find((entry) => entry.id === placement.moduleId);
    const kind: "window" | "door" =
      placement.moduleId.includes("door") || module?.kind === "door" ? "door" : "window";
    // Placement size is oriented; height is always sizeMeters[1].
    const widthM =
      placement.facade === "left" || placement.facade === "right"
        ? placement.sizeMeters[2]
        : placement.sizeMeters[0];
    const heightM = placement.sizeMeters[1];
    seeds.push({
      facade: placement.facade,
      floorIndex: placement.floorIndex,
      bayIndex: placement.bayIndex,
      widthM: Math.max(0.4, widthM),
      heightM: Math.max(0.6, heightM),
      kind,
      moduleId: placement.moduleId,
      semanticPath: placement.semanticPath
    });
  }
  return seeds;
}

function attachOpeningMeta(
  scopes: FacadeBayScope[],
  seeds: OpeningSeed[],
  wallDepthM: number,
  familyId: string
): FacadeSplitOpeningPlacement[] {
  const seedMap = new Map(
    seeds.map((seed) => [`${seed.facade}:${seed.floorIndex}:${seed.bayIndex}`, seed])
  );
  const openings: FacadeSplitOpeningPlacement[] = [];

  for (const scope of scopes) {
    if (!scope.opening) {
      continue;
    }
    const key = `${scope.facade}:${scope.floorIndex}:${scope.bayIndex}`;
    const seed = seedMap.get(key);
    const resolvedKind: "window" | "door" =
      seed?.kind ?? scope.opening.kind ?? "window";
    const centerM = openingWorldCenter(scope, wallDepthM);
    const depth =
      scope.facade === "left" || scope.facade === "right" ? scope.sizeM[0] * 0.5 : scope.sizeM[2] * 0.55;
    openings.push({
      facade: scope.facade,
      floorIndex: scope.floorIndex,
      bayIndex: scope.bayIndex,
      kind: resolvedKind,
      moduleId: seed?.moduleId,
      semanticPath:
        seed?.semanticPath ??
        `building/${familyId}/facade/${scope.facade}/floor/${scope.floorIndex}/bay/${scope.bayIndex}/opening/${resolvedKind}`,
      centerM,
      sizeM: [scope.opening.widthM, scope.opening.heightM, depth]
    });
  }
  return openings;
}

/**
 * Kit mode: openings come only from the art-kit facade plan.
 * Proof mode: no plan → front-only default slots (same split drives walls + frames).
 */
export async function buildFacadeSplitPlan(
  input: BuildFacadeSplitPlanInput
): Promise<FacadeSplitPlan> {
  const hasKitPlan = Boolean(input.facadePlan);
  const seeds = input.facadePlan
    ? openingsFromFacadePlan(input.facadePlan, input.kit)
    : undefined;
  const scopes = buildFacadeBayScopes({
    spec: input.spec,
    wallDepthM: input.wallDepthM,
    openings: seeds,
    /** When kit plan is present, only punch openings the planner chose. */
    strictOpenings: hasKitPlan,
    defaultOpeningMode: hasKitPlan ? undefined : (input.defaultOpeningMode ?? "front-only")
  });
  const openings = attachOpeningMeta(
    scopes,
    seeds ?? [],
    input.wallDepthM,
    input.spec.familyId
  );

  if (hasKitPlan && seeds && openings.length !== seeds.length) {
    // Duplicate plan cells or failed attach — fail fast so dual authority cannot hide.
    throw new Error(
      `FacadeSplitPlan opening count ${openings.length} does not match kit plan opening seeds ${seeds.length}.`
    );
  }
  const contentHash = await hashCanonicalJson({
    familyId: input.spec.familyId,
    wallDepthM: input.wallDepthM,
    scopes: scopes.map((scope) => ({
      facade: scope.facade,
      floorIndex: scope.floorIndex,
      bayIndex: scope.bayIndex,
      zone: scope.zone,
      opening: scope.opening
    })),
    openings: openings.map((opening) => ({
      facade: opening.facade,
      floorIndex: opening.floorIndex,
      bayIndex: opening.bayIndex,
      kind: opening.kind,
      centerM: opening.centerM,
      sizeM: opening.sizeM
    }))
  });

  return {
    schemaVersion: "0.1.0",
    familyId: input.spec.familyId,
    wallDepthM: input.wallDepthM,
    contentHash,
    scopes,
    openings
  };
}

export function wallPrimitivesFromSplitPlan(plan: FacadeSplitPlan): PrimitiveGeometry[] {
  const primitives: PrimitiveGeometry[] = [];
  for (const scope of plan.scopes) {
    primitives.push(...expandBayWallPrimitives(scope));
  }
  return primitives;
}

export function openingTransformFromPlacement(placement: FacadeSplitOpeningPlacement): number[] {
  return translationMatrix(placement.centerM);
}

/** Re-export OpeningSlot typing for consumers. */
export type { FacadeBayScope, OpeningSlot, WallFacadeName };
