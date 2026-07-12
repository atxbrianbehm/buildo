import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentRecipe } from "../contracts/componentRecipe";
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
 * Multi-layer cornice stack for clay silhouette readability:
 * bed mold → frieze → modillion band → discrete brackets → crown → corona lip.
 */
export function buildCorniceProfilePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = Math.max(0.55, recipe.dimensionsM.height);
  const depth = Math.max(0.45, recipe.dimensionsM.depth);
  const center: Vec3 = [
    0,
    spec.massing.floorHeightsM.reduce((total, value) => total + value, 0) - height / 2,
    -spec.massing.depthM / 2 + depth / 2
  ];
  const projection = rangeValue(recipe, "projectionM", depth);
  const crown = Math.min(height * 0.28, rangeValue(recipe, "crownHeightM", height * 0.28));
  const bed = Math.max(0.06, height * 0.12);
  const frieze = Math.max(0.1, height * 0.22);
  const modillionBand = Math.max(0.08, height * 0.16);
  const body = Math.max(0.08, height - crown - bed - frieze - modillionBand);
  const bracketSpacing = rangeValue(recipe, "bracketSpacingM", 0.95);
  const bracketCount = Math.max(3, Math.floor(width / bracketSpacing));

  const layers: ProfileLayer[] = [
    {
      id: "cornice.bed-mold",
      offsetM: [0, -height / 2 + bed / 2, depth * 0.02],
      sizeM: [width + 0.06, bed, depth * 0.55]
    },
    {
      id: "cornice.frieze",
      offsetM: [0, -height / 2 + bed + frieze / 2, 0],
      sizeM: [width, frieze, depth * 0.7]
    },
    {
      id: "cornice.modillion-band",
      offsetM: [0, -height / 2 + bed + frieze + modillionBand / 2, depth * 0.08],
      sizeM: [width * 0.99, modillionBand, depth * 0.42]
    },
    {
      id: "cornice.body",
      offsetM: [0, height / 2 - crown - body / 2, -depth * 0.02],
      sizeM: [width + 0.04, body, depth * 0.78]
    },
    {
      id: "cornice.crown",
      offsetM: [0, height / 2 - crown / 2, -depth * 0.1],
      sizeM: [width + 0.16, crown, Math.min(projection, depth * 1.05)]
    },
    {
      id: "cornice.corona",
      offsetM: [0, height / 2 - crown * 0.22, -depth * 0.16],
      sizeM: [width + 0.22, crown * 0.28, Math.min(projection * 1.08, depth * 1.12)]
    }
  ];

  const primitives = buildProfiledRunPrimitives({
    id: recipe.id,
    center,
    size: [width, height, depth],
    layers
  });

  // Discrete brackets under the crown — readable as massing in clay mode.
  for (let index = 0; index < bracketCount; index += 1) {
    const t = bracketCount === 1 ? 0.5 : index / (bracketCount - 1);
    const x = -width / 2 + 0.28 + t * (width - 0.56);
    primitives.push(
      buildBoxPrimitive({
        center: [center[0] + x, center[1] - height * 0.08, center[2] + depth * 0.18],
        size: [0.14, height * 0.34, depth * 0.38]
      })
    );
  }

  return primitives;
}

/**
 * Belt courses at each intermediate floor line (not only the ground transition).
 */
export function buildHorizontalBeltCoursePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const cap = rangeValue(recipe, "capHeightM", recipe.dimensionsM.height * 0.28);
  const body = Math.max(0.06, recipe.dimensionsM.height - cap);
  const beltHeight = recipe.dimensionsM.height;
  const beltDepth = recipe.dimensionsM.depth;
  const width = recipe.dimensionsM.width;
  const primitives: PrimitiveGeometry[] = [];

  let floorTop = 0;
  for (let floor = 0; floor < spec.massing.floorCount - 1; floor += 1) {
    floorTop += spec.massing.floorHeightsM[floor] ?? 0;
    const center: Vec3 = [
      0,
      floorTop - beltHeight / 2,
      -spec.massing.depthM / 2 + beltDepth / 2
    ];
    primitives.push(
      ...buildProfiledRunPrimitives({
        id: `${recipe.id}.floor-${floor}`,
        center,
        size: [width, beltHeight, beltDepth],
        layers: [
          {
            id: `belt.body.floor-${floor}`,
            offsetM: [0, -beltHeight / 2 + body / 2, 0],
            sizeM: [width, body, beltDepth * 0.88]
          },
          {
            id: `belt.cap.floor-${floor}`,
            offsetM: [0, beltHeight / 2 - cap / 2, -beltDepth * 0.06],
            sizeM: [width + 0.1, cap, beltDepth]
          },
          {
            id: `belt.shadow.floor-${floor}`,
            offsetM: [0, -beltHeight / 2 + body * 0.15, beltDepth * 0.08],
            sizeM: [width * 0.995, body * 0.2, beltDepth * 0.35]
          }
        ]
      })
    );
  }

  return primitives;
}

export function buildRoofCapPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const center: Vec3 = [
    0,
    totalHeight + spec.massing.parapetHeightM + recipe.dimensionsM.height / 2,
    -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2
  ];

  return buildProfiledRunPrimitives({
    id: recipe.id,
    center,
    size: [recipe.dimensionsM.width, recipe.dimensionsM.height, recipe.dimensionsM.depth],
    layers: [
      {
        id: "roof-cap.base",
        offsetM: [0, -recipe.dimensionsM.height * 0.18, 0],
        sizeM: [recipe.dimensionsM.width + 0.08, recipe.dimensionsM.height * 0.5, recipe.dimensionsM.depth * 0.85]
      },
      {
        id: "roof-cap.coping",
        offsetM: [0, recipe.dimensionsM.height * 0.08, -recipe.dimensionsM.depth * 0.04],
        sizeM: [recipe.dimensionsM.width + 0.16, recipe.dimensionsM.height * 0.4, recipe.dimensionsM.depth]
      },
      {
        id: "roof-cap.lip",
        offsetM: [0, recipe.dimensionsM.height * 0.28, -recipe.dimensionsM.depth * 0.12],
        sizeM: [recipe.dimensionsM.width + 0.2, recipe.dimensionsM.height * 0.22, recipe.dimensionsM.depth * 0.7]
      }
    ]
  });
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
