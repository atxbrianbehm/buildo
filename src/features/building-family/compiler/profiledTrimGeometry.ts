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

export function buildCorniceProfilePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = recipe.dimensionsM.height;
  const depth = recipe.dimensionsM.depth;
  const center: Vec3 = [
    0,
    spec.massing.floorHeightsM.reduce((total, value) => total + value, 0) - height / 2,
    -spec.massing.depthM / 2 + depth / 2
  ];
  const crown = rangeValue(recipe, "crownHeightM", height * 0.35);
  const body = Math.max(0.08, height - crown);
  const projection = rangeValue(recipe, "projectionM", depth);

  return buildProfiledRunPrimitives({
    id: recipe.id,
    center,
    size: [width, height, depth],
    layers: [
      {
        id: "cornice.body",
        offsetM: [0, -height / 2 + body / 2, 0],
        sizeM: [width, body, depth * 0.72]
      },
      {
        id: "cornice.crown",
        offsetM: [0, height / 2 - crown / 2, -depth * 0.08],
        sizeM: [width + 0.12, crown, Math.min(projection, depth)]
      },
      {
        id: "cornice.bracket-band",
        offsetM: [0, -height / 2 + body * 0.55, depth * 0.12],
        sizeM: [width * 0.98, body * 0.28, depth * 0.35]
      }
    ]
  });
}

export function buildHorizontalBeltCoursePrimitives(
  spec: BuildingFamilySpec,
  recipe: ComponentRecipe
): PrimitiveGeometry[] {
  const groundHeight = spec.massing.floorHeightsM[0] ?? recipe.dimensionsM.height;
  const center: Vec3 = [
    0,
    groundHeight - recipe.dimensionsM.height / 2,
    -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2
  ];
  const cap = rangeValue(recipe, "capHeightM", recipe.dimensionsM.height * 0.28);
  const body = Math.max(0.06, recipe.dimensionsM.height - cap);

  return buildProfiledRunPrimitives({
    id: recipe.id,
    center,
    size: [recipe.dimensionsM.width, recipe.dimensionsM.height, recipe.dimensionsM.depth],
    layers: [
      {
        id: "belt.body",
        offsetM: [0, -recipe.dimensionsM.height / 2 + body / 2, 0],
        sizeM: [recipe.dimensionsM.width, body, recipe.dimensionsM.depth * 0.85]
      },
      {
        id: "belt.cap",
        offsetM: [0, recipe.dimensionsM.height / 2 - cap / 2, -recipe.dimensionsM.depth * 0.05],
        sizeM: [recipe.dimensionsM.width + 0.08, cap, recipe.dimensionsM.depth]
      }
    ]
  });
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
        offsetM: [0, -recipe.dimensionsM.height * 0.15, 0],
        sizeM: [recipe.dimensionsM.width, recipe.dimensionsM.height * 0.55, recipe.dimensionsM.depth * 0.8]
      },
      {
        id: "roof-cap.lip",
        offsetM: [0, recipe.dimensionsM.height * 0.2, -recipe.dimensionsM.depth * 0.08],
        sizeM: [recipe.dimensionsM.width + 0.1, recipe.dimensionsM.height * 0.45, recipe.dimensionsM.depth]
      }
    ]
  });
}

export function buildCornerQuoinPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = spec.massing.floorHeightsM.reduce((total, value) => total + value, 0);
  const halfWidth = recipe.dimensionsM.width / 2;
  const halfDepth = recipe.dimensionsM.depth / 2;
  const y = totalHeight / 2;
  const frontZ = -spec.massing.depthM / 2 + halfDepth;
  const leftX = -spec.massing.widthM / 2 + halfWidth;
  const rightX = spec.massing.widthM / 2 - halfWidth;
  const course = rangeValue(recipe, "courseHeightM", 0.28);
  const courses = Math.max(2, Math.round(totalHeight / course));
  const primitives: PrimitiveGeometry[] = [];

  for (const x of [leftX, rightX]) {
    for (let index = 0; index < courses; index += 1) {
      const courseHeight = Math.min(course, totalHeight - index * course);
      if (courseHeight <= 0) {
        continue;
      }
      const centerY = index * course + courseHeight / 2;
      primitives.push(
        buildBoxPrimitive({
          center: [x, centerY, frontZ],
          size: [
            recipe.dimensionsM.width * (index % 2 === 0 ? 1 : 0.78),
            courseHeight * 0.92,
            recipe.dimensionsM.depth * (index % 2 === 0 ? 1 : 0.85)
          ]
        })
      );
    }
  }

  void y;
  return primitives;
}
