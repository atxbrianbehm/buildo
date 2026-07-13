import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import {
  late19cBasePlinthProfile,
  late19cBeltProfile,
  late19cCorniceProfile,
  late19cPilasterProfile,
  late19cRoofCapProfile,
  getProfileDefinition,
  scaleProfileProjection,
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

/**
 * Front exterior wall face (building mass is +Z of this plane).
 * Profile `d` and proud trim must project with facadeSign -1 (outward, -Z)
 * so cornice/belt read in clay instead of burying inside the mass.
 */
function frontFacadeExteriorZM(spec: BuildingFamilySpec): number {
  return -spec.massing.depthM / 2;
}

/** Outward normal on the front facade in world Z. */
const FRONT_FACADE_SIGN = -1 as const;

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
  const height = Math.max(0.7, recipe.dimensionsM.height);
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  // Profile id is the style switch — no per-style compiler branches (G7).
  const profileDef =
    (recipe.profileRecipeId ? getProfileDefinition(recipe.profileRecipeId) : undefined) ??
    late19cCorniceProfile;
  const isRestrained = profileDef.id.includes("restrained");
  const projectionScale = rangeValue(recipe, "projectionScale", isRestrained ? 1.1 : 1.32);
  const profile = densifyProfile(
    scaleProfileProjection(scaleProfileToHeight(profileDef, height), projectionScale),
    3
  );
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const frontZ = frontFacadeExteriorZM(spec);
  // Anchor on the exterior face; sweep `d` outward so crown is clay-visible.
  // Sit the band so its top meets the roof line and most mass hangs as a crown.
  const center: Vec3 = [0, totalHeight - height * 0.42, frontZ];
  const primitives = horizontalMoldingFromProfile({
    profile,
    center,
    widthM: width + 0.2,
    facadeSign: FRONT_FACADE_SIGN
  });

  // Brackets under the crown (layered always; restrained gets a lighter row for clay read).
  const bracketSpacing = rangeValue(recipe, "bracketSpacingM", isRestrained ? 1.15 : 0.8);
  const bracketCount = Math.max(isRestrained ? 3 : 4, Math.floor(width / bracketSpacing));
  const bracketDepth = maxD * (isRestrained ? 0.42 : 0.55);
  const bracketHeight = height * (isRestrained ? 0.28 : 0.38);
  const bracketWidth = isRestrained ? 0.14 : 0.2;
  for (let index = 0; index < bracketCount; index += 1) {
    const t = bracketCount === 1 ? 0.5 : index / (bracketCount - 1);
    const x = -width / 2 + 0.32 + t * (width - 0.64);
    primitives.push(
      buildBoxPrimitive({
        center: [x, center[1] - height * 0.22, frontZ - maxD * 0.42],
        size: [bracketWidth, bracketHeight, bracketDepth]
      })
    );
    if (!isRestrained) {
      // Secondary step under each bracket — multi-layer shadow under the crown.
      primitives.push(
        buildBoxPrimitive({
          center: [x, center[1] - height * 0.34, frontZ - maxD * 0.28],
          size: [bracketWidth * 1.25, bracketHeight * 0.35, bracketDepth * 0.55]
        })
      );
    }
  }

  // Continuous fascia bar under the profile — sells a dark crown band even in soft light.
  primitives.push(
    buildBoxPrimitive({
      center: [0, center[1] - height * 0.38, frontZ - maxD * 0.18],
      size: [width + 0.28, height * 0.12, Math.max(0.18, maxD * 0.28)]
    })
  );

  return primitives;
}

/**
 * Belt courses at each intermediate floor line from authored belt profile.
 * V4: scaled projection + drip bar so floor lines read as horizontal shadow systems.
 */
export function buildHorizontalBeltCoursePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const beltHeight = Math.max(0.32, recipe.dimensionsM.height);
  const width = recipe.dimensionsM.width;
  const projectionScale = rangeValue(recipe, "projectionScale", 1.35);
  const profile = densifyProfile(
    scaleProfileProjection(scaleProfileToHeight(late19cBeltProfile, beltHeight), projectionScale),
    3
  );
  const maxD = Math.max(...profile.points.map((point) => point.d));
  const primitives: PrimitiveGeometry[] = [];

  const frontZ = frontFacadeExteriorZM(spec);
  let floorTop = 0;
  for (let floor = 0; floor < spec.massing.floorCount - 1; floor += 1) {
    floorTop += spec.massing.floorHeightsM[floor] ?? 0;
    // Ground→body belt is heavier; upper belts slightly lighter but still proud.
    const weight = floor === 0 ? 1.15 : 1;
    const height = beltHeight * weight;
    const center: Vec3 = [0, floorTop - height / 2, frontZ];
    const runProfile =
      floor === 0
        ? densifyProfile(
            scaleProfileProjection(
              scaleProfileToHeight(late19cBeltProfile, height),
              projectionScale * 1.12
            ),
            3
          )
        : profile;
    const runMaxD = Math.max(...runProfile.points.map((point) => point.d));
    primitives.push(
      ...horizontalMoldingFromProfile({
        profile: runProfile,
        center,
        widthM: width + (floor === 0 ? 0.16 : 0.08),
        facadeSign: FRONT_FACADE_SIGN
      })
    );
    // Continuous drip under the belt — sells a dark floor line in soft light.
    primitives.push(
      buildBoxPrimitive({
        center: [0, center[1] - height * 0.42, frontZ - runMaxD * 0.35],
        size: [width + 0.2, height * 0.18, Math.max(0.12, runMaxD * 0.4)]
      })
    );
  }

  // Mid-body string courses (between belts) on upper floors — third horizontal system.
  floorTop = spec.massing.floorHeightsM[0] ?? 0;
  for (let floor = 1; floor < spec.massing.floorCount; floor += 1) {
    const floorH = spec.massing.floorHeightsM[floor] ?? 3.2;
    const stringY = floorTop + floorH * 0.42;
    const stringH = Math.min(0.22, floorH * 0.07);
    const stringD = Math.max(0.14, maxD * 0.45);
    primitives.push(
      buildBoxPrimitive({
        center: [0, stringY, frontZ - stringD * 0.55],
        size: [width * 0.995, stringH, stringD]
      })
    );
    floorTop += floorH;
  }

  return primitives;
}

export function buildRoofCapPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const height = Math.max(0.18, recipe.dimensionsM.height);
  const profile = densifyProfile(scaleProfileToHeight(late19cRoofCapProfile, height), 2);
  const frontZ = frontFacadeExteriorZM(spec);
  const center: Vec3 = [
    0,
    totalHeight + spec.massing.parapetHeightM + height / 2,
    frontZ
  ];
  return horizontalMoldingFromProfile({
    profile,
    center,
    widthM: recipe.dimensionsM.width + 0.12,
    facadeSign: FRONT_FACADE_SIGN
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
  const frontZ = frontFacadeExteriorZM(spec);
  const shaftCenter: Vec3 = [edgeX, plinth + shaftHeight / 2, frontZ];

  const primitives = sweepProfileToBoxPrimitives({
    profile,
    center: shaftCenter,
    runLengthM: shaftHeight,
    runAxis: "y",
    facadeSign: FRONT_FACADE_SIGN
  });

  // Plinth block (proud of exterior face)
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, plinth / 2, frontZ - maxD * 0.45],
      size: [maxHalf * 2.4, plinth, maxD * 1.35]
    })
  );
  // Capital
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, totalHeight - capital / 2, frontZ - maxD * 0.5],
      size: [maxHalf * 2.5, capital, maxD * 1.4]
    })
  );
  primitives.push(
    buildBoxPrimitive({
      center: [edgeX, totalHeight - capital * 0.3, frontZ - maxD * 0.55],
      size: [maxHalf * 2.7, capital * 0.32, maxD * 0.9]
    })
  );

  return primitives;
}

/** Continuous ground-floor water-table / plinth along front facade. */
export function buildBasePlinthPrimitives(spec: BuildingFamilySpec): PrimitiveGeometry[] {
  // Scale with commercial base so plinth reads as part of the tall ground band (V1).
  const groundH = spec.massing.floorHeightsM[0] ?? 4;
  const height = Math.min(0.95, Math.max(0.55, groundH * 0.14));
  const profile = densifyProfile(scaleProfileToHeight(late19cBasePlinthProfile, height), 2);
  const frontZ = frontFacadeExteriorZM(spec);
  const center: Vec3 = [0, height / 2, frontZ];
  return horizontalMoldingFromProfile({
    profile,
    center,
    widthM: spec.massing.widthM + 0.16,
    facadeSign: FRONT_FACADE_SIGN
  });
}

/**
 * Spandrel bands between stories on the front facade — solid mass under window lines.
 * V4: taller, more proud panels so body floors are not a flat stamp between openings.
 */
export function buildSpandrelBandPrimitives(
  spec: BuildingFamilySpec,
  options?: { bandHeightM?: number; projectionM?: number }
): PrimitiveGeometry[] {
  const bandHeight = options?.bandHeightM ?? 0.72;
  const projection = options?.projectionM ?? 0.16;
  const width = spec.massing.widthM;
  const depth = 0.28 + projection;
  // Proud of the front exterior face (outward = -Z).
  const frontZ = frontFacadeExteriorZM(spec);
  const z = frontZ - depth / 2;
  const primitives: PrimitiveGeometry[] = [];
  let floorTop = 0;

  for (let floor = 0; floor < spec.massing.floorCount - 1; floor += 1) {
    floorTop += spec.massing.floorHeightsM[floor] ?? 0;
    // Sit just above the floor line so belts and spandrels stack as separate mass.
    const centerY = floorTop + bandHeight / 2 + 0.04;
    primitives.push(
      buildBoxPrimitive({
        center: [0, centerY, z],
        size: [width * 0.995, bandHeight, depth]
      })
    );
    primitives.push(
      buildBoxPrimitive({
        center: [0, centerY - bandHeight * 0.12, z - depth * 0.18],
        size: [width * 0.99, bandHeight * 0.4, depth * 0.55]
      })
    );
    // Upper ledge on the spandrel — second shadow edge within the body band.
    primitives.push(
      buildBoxPrimitive({
        center: [0, centerY + bandHeight * 0.32, z - depth * 0.22],
        size: [width * 0.992, bandHeight * 0.16, depth * 0.4]
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
  const exteriorZ = frontFacadeExteriorZM(spec);
  // Quoin depth mostly on the facade, with a small proud step for clay shadow.
  const frontZ = exteriorZ - halfDepth - projection * 0.35;
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
      // Stepped quoin blocks proud of the front face for clay corner read.
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
            exteriorZ - recipe.dimensionsM.depth * 0.55
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
