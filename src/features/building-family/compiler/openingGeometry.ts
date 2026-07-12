import type { ComponentRecipe } from "../contracts/componentRecipe";
import {
  buildBoxPrimitive,
  combinePrimitiveGeometry,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";

export type OpeningGeometryDetail = "high" | "low";

export interface BuildOpeningGeometryInput {
  recipe: ComponentRecipe;
  detail?: OpeningGeometryDetail;
  arched?: boolean;
  part?: "frame" | "glass";
}

function midRange(recipe: ComponentRecipe, key: string, fallback: number): number {
  const range = recipe.parameterRanges[key];
  if (!range) {
    return fallback;
  }
  return (range.min + range.max) / 2;
}

function isArchedRecipe(recipe: ComponentRecipe, arched?: boolean): boolean {
  if (arched !== undefined) {
    return arched;
  }
  return /arch/i.test(recipe.id) || /arch/i.test(recipe.profileRecipeId ?? "");
}

/** Build a thin glass pane centered near the opening mid-depth. */
export function buildOpeningGlassPrimitives(recipe: ComponentRecipe): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = recipe.dimensionsM.height;
  const depth = Math.max(0.015, recipe.dimensionsM.depth);
  return [
    buildBoxPrimitive({
      // Push glass deeper into the recess so exterior reads as framed architecture.
      center: [0, 0, -depth * 0.45],
      size: [width, height, Math.min(0.03, depth)]
    })
  ];
}

function frameBars(input: {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  z: number;
}): PrimitiveGeometry[] {
  const { width, height, depth, thickness, z } = input;
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    buildBoxPrimitive({
      center: [-halfW + thickness / 2, 0, z],
      size: [thickness, height, depth]
    }),
    buildBoxPrimitive({
      center: [halfW - thickness / 2, 0, z],
      size: [thickness, height, depth]
    }),
    buildBoxPrimitive({
      center: [0, halfH - thickness / 2, z],
      size: [Math.max(0.05, width - thickness * 2), thickness, depth]
    }),
    buildBoxPrimitive({
      center: [0, -halfH + thickness / 2, z],
      size: [Math.max(0.05, width - thickness * 2), thickness, depth]
    })
  ];
}

function mullions(input: {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  countX: number;
  countY: number;
  z: number;
}): PrimitiveGeometry[] {
  const primitives: PrimitiveGeometry[] = [];
  const innerW = Math.max(0.05, input.width - input.thickness * 2);
  const innerH = Math.max(0.05, input.height - input.thickness * 2);
  for (let i = 1; i <= input.countX; i += 1) {
    const t = i / (input.countX + 1);
    const x = -innerW / 2 + t * innerW;
    primitives.push(
      buildBoxPrimitive({
        center: [x, 0, input.z],
        size: [input.thickness * 0.7, innerH, input.depth * 0.85]
      })
    );
  }
  for (let i = 1; i <= input.countY; i += 1) {
    const t = i / (input.countY + 1);
    const y = -innerH / 2 + t * innerH;
    primitives.push(
      buildBoxPrimitive({
        center: [0, y, input.z],
        size: [innerW, input.thickness * 0.7, input.depth * 0.85]
      })
    );
  }
  return primitives;
}

function archedCrown(input: {
  width: number;
  height: number;
  depth: number;
  steps: number;
}): PrimitiveGeometry[] {
  const primitives: PrimitiveGeometry[] = [];
  const baseY = input.height / 2;
  for (let step = 0; step < input.steps; step += 1) {
    const t = step / input.steps;
    const nextT = (step + 1) / input.steps;
    const widthScale = 1 - t * 0.55;
    const nextWidthScale = 1 - nextT * 0.55;
    const segmentHeight = (input.height * 0.12) / input.steps + 0.04;
    const y = baseY + step * segmentHeight + segmentHeight / 2;
    const width = input.width * ((widthScale + nextWidthScale) / 2);
    primitives.push(
      buildBoxPrimitive({
        center: [0, y, 0],
        size: [Math.max(0.12, width), segmentHeight, input.depth * (0.75 + t * 0.15)]
      })
    );
  }
  return primitives;
}

export function buildWindowFramePrimitives(
  recipe: ComponentRecipe,
  detail: OpeningGeometryDetail,
  arched: boolean
): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = recipe.dimensionsM.height;
  const depth = recipe.dimensionsM.depth;
  const thickness = midRange(recipe, "frameThicknessM", 0.11);
  const recessDepth = midRange(recipe, "recessDepthM", 0.26);
  const sillProjection = midRange(recipe, "sillProjectionM", 0.13);
  const mullionDepth = midRange(recipe, "mullionDepthM", 0.1);
  const countX = Math.round(midRange(recipe, "mullionCountX", 1));
  const countY = Math.round(midRange(recipe, "mullionCountY", 1));
  const frameZ = 0.02;

  if (detail === "low") {
    return [
      buildBoxPrimitive({
        center: [0, 0, 0],
        size: [width, height, Math.max(0.1, depth * 0.6)]
      })
    ];
  }

  const primitives: PrimitiveGeometry[] = [
    buildBoxPrimitive({
      center: [0, 0, -recessDepth / 2 - depth * 0.18],
      size: [width + 0.18, height + 0.18, recessDepth]
    }),
    ...frameBars({ width, height, depth: depth * 0.78, thickness, z: frameZ }),
    ...mullions({
      width,
      height,
      depth: mullionDepth,
      thickness: thickness * 0.78,
      countX: Math.max(1, countX),
      countY: Math.max(1, countY),
      z: frameZ + depth * 0.04
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.4, sillProjection * 0.4],
      size: [width + 0.1, thickness * 1.05, depth * 0.6 + sillProjection]
    }),
    buildBoxPrimitive({
      center: [0, height / 2 - thickness * 0.25, -depth * 0.06],
      size: [width + 0.08, thickness * 1.25, depth * 0.8]
    })
  ];

  if (arched) {
    primitives.push(
      ...archedCrown({
        width: width * 0.98,
        height,
        depth: depth * 0.78,
        steps: 6
      })
    );
  }

  return primitives;
}

export function buildDoorFramePrimitives(
  recipe: ComponentRecipe,
  detail: OpeningGeometryDetail
): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = recipe.dimensionsM.height;
  const depth = recipe.dimensionsM.depth;
  const thickness = midRange(recipe, "frameThicknessM", 0.13);
  const recessDepth = midRange(recipe, "recessDepthM", 0.3);
  const transomHeight = midRange(recipe, "transomHeightM", 0.45);
  const leafInset = midRange(recipe, "leafInsetM", 0.09);

  if (detail === "low") {
    return [
      buildBoxPrimitive({
        center: [0, 0, 0],
        size: [width, height, Math.max(0.12, depth * 0.65)]
      })
    ];
  }

  const leafHeight = Math.max(0.4, height - transomHeight - thickness * 1.5);
  return [
    buildBoxPrimitive({
      center: [0, 0, -recessDepth / 2 - depth * 0.14],
      size: [width + 0.2, height + 0.12, recessDepth]
    }),
    ...frameBars({ width, height, depth: depth * 0.82, thickness, z: 0.02 }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.45, depth * 0.14],
      size: [width + 0.12, thickness * 0.95, depth * 0.75]
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness + leafHeight / 2, -leafInset],
      size: [Math.max(0.2, width - thickness * 2.2), leafHeight, depth * 0.4]
    }),
    buildBoxPrimitive({
      center: [0, height / 2 - transomHeight / 2 - thickness * 0.2, -0.02],
      size: [Math.max(0.15, width - thickness * 2), thickness * 0.8, depth * 0.6]
    })
  ];
}

export function buildOpeningAssemblyPrimitives(input: BuildOpeningGeometryInput): PrimitiveGeometry[] {
  const detail = input.detail ?? "high";
  const part = input.part ?? (input.recipe.role.includes("Glass") || input.recipe.role === "windowGlass" || input.recipe.role === "doorGlass"
    ? "glass"
    : "frame");

  if (part === "glass" || input.recipe.role === "windowGlass" || input.recipe.role === "doorGlass") {
    return buildOpeningGlassPrimitives(input.recipe);
  }

  if (input.recipe.role === "door") {
    return buildDoorFramePrimitives(input.recipe, detail);
  }

  return buildWindowFramePrimitives(input.recipe, detail, isArchedRecipe(input.recipe, input.arched));
}

export function buildOpeningAssemblyGeometry(input: BuildOpeningGeometryInput): PrimitiveGeometry {
  const primitives = buildOpeningAssemblyPrimitives(input);
  const combined = combinePrimitiveGeometry(primitives);
  return {
    positions: Array.from(combined.positions),
    normals: Array.from(combined.normals),
    uvs: Array.from(combined.uvs),
    indices: Array.from(combined.indices),
    bounds: combined.bounds
  };
}

export function openingAssemblyDepthExtent(recipe: ComponentRecipe, detail: OpeningGeometryDetail = "high"): number {
  const geometry = buildOpeningAssemblyGeometry({ recipe, detail, part: "frame" });
  return geometry.bounds.max[2] - geometry.bounds.min[2];
}

export function openingGlassInsetFromExterior(recipe: ComponentRecipe): number {
  const frame = buildOpeningAssemblyGeometry({ recipe, detail: "high", part: "frame" });
  const glass = buildOpeningAssemblyGeometry({
    recipe: {
      ...recipe,
      role: "windowGlass",
      dimensionsM: {
        width: recipe.dimensionsM.width * 0.78,
        height: recipe.dimensionsM.height * 0.72,
        depth: 0.02
      }
    },
    detail: "high",
    part: "glass"
  });
  return frame.bounds.max[2] - glass.bounds.max[2];
}

export type { Vec3 };
