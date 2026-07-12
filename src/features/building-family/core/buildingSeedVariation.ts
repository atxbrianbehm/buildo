import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { HistoricalStylePack } from "../contracts/historicalStylePack";
import { createSeedTree } from "./seedTree";

/**
 * Building-scoped structural variety within one family.
 *
 * Family seed / familyId / materials stay shared. Building seed must change
 * composition enough that Sample Gallery / stress variants are not near-clones.
 */
export interface BuildingCompositionFingerprint {
  buildingSeed: string;
  floorCount: number;
  frontBayCount: number;
  depthM: number;
  widthM: number;
  windowFamily: string;
  corniceFamily: string;
  bayRhythmSeed: number;
  windowJitterSeed: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickWeightedId(
  items: Array<{ id: string; weight: number }>,
  seedPath: string,
  seedRoot: string,
  fallback: string
): string {
  if (items.length === 0) {
    return fallback;
  }
  const tree = createSeedTree(seedRoot).fork(seedPath);
  return tree.chooseWeighted(
    items.map((item) => ({ value: item.id, weight: item.weight })),
    "pick"
  );
}

/**
 * Re-apply building-seed structural variation to a family-normalized spec.
 * Safe for stress variants and sample opens: does not change familyId or material seeds.
 */
export function withBuildingSeedVariation(
  baseSpec: BuildingFamilySpec,
  buildingSeed: string,
  stylePackInput: HistoricalStylePack | unknown
): BuildingFamilySpec {
  const stylePack = stylePackInput as HistoricalStylePack;
  const buildingTree = createSeedTree(buildingSeed).fork("building-variation");
  const familyTree = createSeedTree(baseSpec.seeds.family).fork("family-massing");

  // Prefer the family-normalized requested bay count so re-applying a different
  // building seed is not relative to a prior building-seeded bay count.
  const requestedBayCount = Number(
    baseSpec.componentParameters.requestedBayCount ?? baseSpec.facade.frontBayCount
  );
  const bayDelta = buildingTree.int(-1, 1, "facade/bay-delta");
  const frontBayCount = clamp(
    requestedBayCount + bayDelta,
    stylePack.facade.frontBayCount.min,
    stylePack.facade.frontBayCount.max
  );

  // Family contributes a shared depth band; building seed shifts within pack range.
  const familyDepth = clamp(
    16 + familyTree.int(0, 4, "massing/depth"),
    stylePack.massing.depthM.min,
    stylePack.massing.depthM.max
  );
  const depthM = Number(
    clamp(
      familyDepth + buildingTree.int(-2, 2, "massing/depth-delta"),
      stylePack.massing.depthM.min,
      stylePack.massing.depthM.max
    ).toFixed(3)
  );

  const widthM = Number(
    Math.min(stylePack.massing.widthM.max, frontBayCount * 3.8 + 2 + buildingTree.float01("massing/width-nudge")).toFixed(
      3
    )
  );

  const parapetHeightM = Number(
    clamp(
      stylePack.massing.parapetHeightM.min +
        buildingTree.float01("massing/parapet") *
          (stylePack.massing.parapetHeightM.max - stylePack.massing.parapetHeightM.min),
      stylePack.massing.parapetHeightM.min,
      stylePack.massing.parapetHeightM.max
    ).toFixed(3)
  );

  const symmetry = Number(
    clamp(
      stylePack.facade.symmetry.min +
        buildingTree.float01("facade/symmetry") *
          (stylePack.facade.symmetry.max - stylePack.facade.symmetry.min),
      stylePack.facade.symmetry.min,
      stylePack.facade.symmetry.max
    ).toFixed(3)
  );

  const sideBaySpacingM = Number(
    clamp(
      stylePack.facade.sideBaySpacingM.min +
        buildingTree.float01("facade/side-bay-spacing") *
          (stylePack.facade.sideBaySpacingM.max - stylePack.facade.sideBaySpacingM.min),
      stylePack.facade.sideBaySpacingM.min,
      stylePack.facade.sideBaySpacingM.max
    ).toFixed(3)
  );

  let windowFamily = baseSpec.selectedFamilies.window;
  if ((baseSpec.variationPolicy.window ?? "building") === "building") {
    const windowDist = stylePack.distributions.windowFamily ?? [];
    windowFamily = pickWeightedId(
      windowDist.length > 0
        ? windowDist
        : stylePack.componentFamilies.windows.map((id) => ({ id, weight: 1 })),
      "components/window-family",
      buildingSeed,
      baseSpec.selectedFamilies.window
    );
    if (!stylePack.componentFamilies.windows.includes(windowFamily)) {
      windowFamily = baseSpec.selectedFamilies.window;
    }
  }

  const windowJitterSeed = buildingTree.uint32("components/windows/jitter");
  const bayRhythmSeed = buildingTree.uint32("facade/front/bay-rhythm");

  return {
    ...baseSpec,
    seeds: {
      ...baseSpec.seeds,
      building: buildingSeed
    },
    massing: {
      ...baseSpec.massing,
      widthM,
      depthM,
      parapetHeightM
    },
    facade: {
      ...baseSpec.facade,
      frontBayCount,
      sideBaySpacingM,
      symmetry
    },
    selectedFamilies: {
      ...baseSpec.selectedFamilies,
      window: windowFamily
    },
    componentParameters: {
      ...baseSpec.componentParameters,
      requestedBayCount,
      windowJitterSeed,
      bayRhythmSeed,
      buildingBayDelta: bayDelta,
      buildingDepthM: depthM
    }
  };
}

export function buildingCompositionFingerprint(spec: BuildingFamilySpec): BuildingCompositionFingerprint {
  return {
    buildingSeed: spec.seeds.building,
    floorCount: spec.massing.floorCount,
    frontBayCount: spec.facade.frontBayCount,
    depthM: spec.massing.depthM,
    widthM: spec.massing.widthM,
    windowFamily: spec.selectedFamilies.window,
    corniceFamily: spec.selectedFamilies.cornice,
    bayRhythmSeed: Number(spec.componentParameters.bayRhythmSeed ?? 0),
    windowJitterSeed: Number(spec.componentParameters.windowJitterSeed ?? 0)
  };
}

/** Stable string for distinctness checks across sample / stress variants. */
export function buildingCompositionKey(spec: BuildingFamilySpec): string {
  const fp = buildingCompositionFingerprint(spec);
  return [
    fp.floorCount,
    fp.frontBayCount,
    fp.depthM.toFixed(2),
    fp.widthM.toFixed(2),
    fp.windowFamily,
    fp.corniceFamily,
    fp.bayRhythmSeed,
    fp.windowJitterSeed
  ].join("|");
}
