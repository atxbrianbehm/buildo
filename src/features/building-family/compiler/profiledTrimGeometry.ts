import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import {
  late19cBasePlinthProfile,
  late19cBeltProfile,
  late19cCorniceProfile,
  late19cPilasterProfile,
  late19cRoofCapProfile,
  scaleProfileToHeight
} from "./profileLibrary";
import { densifyProfile, horizontalMoldingFromProfile, sweepProfileToBoxPrimitives } from "./profileSweepGeometry";
import {
  buildBoxPrimitive,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";

export interface ProfileLayer {
  id: string;
  offsetM: [number, number, number];
  sizeM: [number, number, number];
}

export interface ProfiledRunInput {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  layers: ProfileLayer[];
}

function rangeValue(recipe: ComponentRecipe, key: string, fallback: number): number {
  const range = recipe.parameterRanges[key];
  if (!range) {
    return fallback;
  }
  return (range.min + range.max) / 2;
}

export function buildProfiledRunPrimitives(input: ProfiledRunInput): PrimitiveGeometry[] {
  return input.layers.map((layer) =>
    buildBoxPrimitive({
      center: [
        input.center[0] + layer.offsetM[0],
        input.center[1] + layer.offsetM[1],
        input.center[2] + layer.offsetM[2]
      ],
      size: layer.sizeM
    })
  );
}

/**
 * Cornice from authored profile polyline (densified) + discrete brackets.
 * Geometry-Nodes-like: profile point set → sweep expander → solid stack.
 */
export function buildCorniceProfilePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = Math.max(0.55, recipe.dimensionsM.height);
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const profile = densifyProfile(scaleProfileToHeight(late19cCorniceProfile, height), 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const center: Vec3 = [0, totalHeight - height / 2, -spec.massing.depthM / 2 + maxD * 0.35];
  const primitives = horizontalMoldingFromProfile({
    profile,
    center,
    widthM: width + 0.12
  });

  const bracketSpacing = rangeValue(recipe, "bracketSpacingM", 0.95);
  const bracketCount = Math.max(3, Math.floor(width / bracketSpacing));
  for (let index = 0; index < bracketCount; index += 1) {
    const t = bracketCount === 1 ? 0.5 : index / (bracketCount - 1);
    const x = -width / 2 + 0.28 + t * (width - 0.56);
    primitives.push(
      buildBoxPrimitive({
        center: [x, center[1] - height * 0.12, center[2] + maxD * 0.25],
        size: [0.14, height * 0.32, maxD * 0.45]
      })
    );
  }

  return primitives;
}

/**
 * Belt courses at each intermediate floor line from authored belt profile.
 */
export function buildHorizontalBeltCoursePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const beltHeight = Math.max(0.22, recipe.dimensionsM.height);
  const width = recipe.dimensionsM.width;
  const profile = densifyProfile(scaleProfileToHeight(late19cBeltProfile, beltHeight), 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const primitives: PrimitiveGeometry[] = [];

  let floorTop = 0;
  for (let floor = 0; floor < spec.massing.floorCount - 1; floor += 1) {
    floorTop += spec.massing.floorHeightsM[floor] ?? 0;
    const center: Vec3 = [0, floorTop - beltHeight / 2, -spec.massing.depthM / 2 + maxD * 0.4];
    primitives.push(
      ...horizontalMoldingFromProfile({
        profile,
        center,
        widthM: width
      })
    );
  }

  return primitives;
}

export function buildRoofCapPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const height = Math.max(0.18, recipe.dimensionsM.height);
  const profile = densifyProfile(scaleProfileToHeight(late19cRoofCapProfile, height), 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const center: Vec3 = [
    0,
    totalHeight + spec.massing.parapetHeightM + height / 2,
    -spec.massing.depthM / 2 + maxD * 0.4
  ];
  return horizontalMoldingFromProfile({
    profile,
    center,
    widthM: recipe.dimensionsM.width + 0.12
  });
}

/**
 * Full-height pilaster from authored half-profile + plinth/capital massing.
 */
export function buildVerticalPilasterPrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe,
  edgeX: number
): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const plinth = rangeValue(recipe, "plinthHeightM", Math.min(0.5, totalHeight * 0.09));
  const capital = Math.min(0.42, totalHeight * 0.07);
  const shaftHeight = Math.max(0.5, totalHeight - plinth - capital);
  const profile = densifyProfile(late19cPilasterProfile, 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const maxHalf = Math.max(...profile.points.map((point) => point.u), recipe.dimensionsM.width / 2);
  const z = -spec.massing.depthM / 2 + maxD * 0.55;
  const shaftCenter: Vec3 = [edgeX, plinth + shaftHeight / 2, z];

  const primitives = sweepProfileToBoxPrimitives({
    profile,
    center: shaftCenter,
    runLengthM: shaftHeight,
    runAxis: "y"
  });

  // Plinth block
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, plinth / 2, z + maxD * 0.1],
      size: [maxHalf * 2.4, plinth, maxD * 1.35]
    })
  );
  // Capital
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, totalHeight - capital / 2, z + maxD * 0.12],
      size: [maxHalf * 2.5, capital, maxD * 1.4]
    })
  );
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, totalHeight - capital * 0.3, z + maxD * 0.22],
      size: [maxHalf * 2.7, capital * 0.32, maxD * 0.9]
    })
  );

  return primitives;
}

/** Continuous ground-floor water-table / plinth along front facade. */
export function buildBasePlinthPrimitives(spec: BuildingFamilySpec): PrimitiveGeometry[] {
  const height = Math.min(0.7, (spec.massing.floorHeightsM[0] ?? 4) * 0.16);
  const profile = densifyProfile(scaleProfileToHeight(late19cBasePlinthProfile, height), 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const center: Vec3 = [0, height / 2, -spec.massing.depthM / 2 + maxD * 0.45];
  return horizontalMoldingFromProfile({
    profile,
    center,
    widthM: spec.massing.widthM + 0.16
  });
}

/**
 * Spandrel bands between stories on the front facade — solid mass under window lines.
 */
export function buildSpandrelBandPrimitives(
  spec: BuildingFamilySpec,
  options?: { bandHeightM?: number; projectionM?: number }
): PrimitiveGeometry[] {
  const bandHeight = options?.bandHeightM ?? 0.55;
  const projection = options?.projectionM ?? 0.08;
  const width = spec.massing.widthM;
  const depth = 0.2 + projection;
  const z = -spec.massing.depthM / 2 + depth / 2;
  const primitives: PrimitiveGeometry[] = [];
  let floorTop = 0;

  for (let floor = 0; floor < spec.massing.floorCount - 1; floor += 1) {
    floorTop += spec.massing.floorHeightsM[floor] ?? 0;
    // Sit just above the floor line so belts and spandrels stack as separate mass.
    const centerY = floorTop + bandHeight / 2 + 0.02;
    primitives.push(
      buildBoxPrimitive({
        center: [0, centerY, z],
        size: [width * 0.995, bandHeight, depth]
      })
    );
    primitives.push(
      buildBoxPrimitive({
        center: [0, centerY - bandHeight * 0.15, z + depth * 0.12],
        size: [width * 0.99, bandHeight * 0.35, depth * 0.45]
      })
    );
  }

  return primitives;
}

/**
 * Local-space pilaster for recipe/instance previews (centered at origin).
 */
export function buildVerticalPilasterLocalPrimitives(recipe: ComponentRecipe): PrimitiveGeometry[] {
  const height = Math.max(1, recipe.dimensionsM.height);
  const plinth = rangeValue(recipe, "plinthHeightM", Math.min(0.4, height * 0.12));
  const capital = Math.min(0.32, height * 0.1);
  const shaftHeight = Math.max(0.3, height - plinth - capital);
  const profile = densifyProfile(late19cPilasterProfile, 2);
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const maxHalf = Math.max(...profile.points.map((point) => point.u), recipe.dimensionsM.width / 2);
  const shaft = sweepProfileToBoxPrimitives({
    profile,
    center: [0, -height / 2 + plinth + shaftHeight / 2, maxD * 0.2],
    runLengthM: shaftHeight,
    runAxis: "y"
  });
  return [
    buildBoxPrimitive({
      center: [0, -height / 2 + plinth / 2, maxD * 0.15],
      size: [maxHalf * 2.4, plinth, maxD * 1.3]
    }),
    ...shaft,
    buildBoxPrimitive({
      center: [0, height / 2 - capital / 2, maxD * 0.12],
      size: [maxHalf * 2.5, capital, maxD * 1.35]
    })
  ];
}

export function buildCornerQuoinPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const halfWidth = recipe.dimensionsM.width / 2;
  const halfDepth = recipe.dimensionsM.depth / 2;
  const projection = rangeValue(recipe, "projectionM", 0.08);
  const frontZ = -spec.massing.depthM / 2 + halfDepth + projection * 0.35;
  const leftX = -spec.massing.widthM / 2 + halfWidth;
  const rightX = spec.massing.widthM / 2 - halfWidth;
  const course = rangeValue(recipe, "courseHeightM", 0.28);
  const courses = Math.max(3, Math.round(totalHeight / course));
  const primitives: PrimitiveGeometry[] = [];

  for (const x of [leftX, rightX]) {
    for (let index = 0; index < courses; index += 1) {
      const courseHeight = Math.min(course, totalHeight - index * course);
      if (courseHeight <= 0) {
        continue;
      }
      const centerY = index * course + courseHeight / 2;
      const longCourse = index % 2 === 0;
      // Keep quoin mass on the facade face; alternate courses read as stepped blocks
      // without escaping the building AABB (compiler integrity checks).
      primitives.push(
        buildBoxPrimitive({
          center: [x, centerY, frontZ],
          size: [
            recipe.dimensionsM.width * (longCourse ? 1 : 0.78),
            courseHeight * 0.9,
            recipe.dimensionsM.depth * (longCourse ? 1 : 0.85) + projection * 0.5
          ]
        })
      );
      primitives.push(
        buildBoxPrimitive({
          center: [
            x + (x < 0 ? projection * 0.15 : -projection * 0.15),
            centerY,
            -spec.massing.depthM / 2 + recipe.dimensionsM.depth * 0.55
          ],
          size: [
            recipe.dimensionsM.width * 0.55,
            courseHeight * 0.88,
            recipe.dimensionsM.depth * (longCourse ? 0.9 : 0.72)
          ]
        })
      );
    }
  }

  return primitives;
}
