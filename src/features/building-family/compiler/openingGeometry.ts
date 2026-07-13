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

/**
 * Local depth convention for opening assemblies:
 *   +Z = exterior (proud of facade face)
 *   −Z = into the wall (recess / glass throat)
 * Instance matrices map +Z onto each facade's outward normal.
 */
/** Build a thin glass pane deeper into the wall throat. */
export function buildOpeningGlassPrimitives(recipe: ComponentRecipe): PrimitiveGeometry[] {
  const width = recipe.dimensionsM.width;
  const height = recipe.dimensionsM.height;
  const depth = Math.max(0.015, recipe.dimensionsM.depth);
  return [
    buildBoxPrimitive({
      // Deeper into the recess (−Z) so clay reads a punched throat, not a surface pane.
      center: [0, 0, -depth * 0.58],
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
  const recessDepth = midRange(recipe, "recessDepthM", 0.3);
  const sillProjection = midRange(recipe, "sillProjectionM", 0.13);
  const mullionDepth = midRange(recipe, "mullionDepthM", 0.1);
  const countX = Math.round(midRange(recipe, "mullionCountX", 1));
  const countY = Math.round(midRange(recipe, "mullionCountY", 1));
  // Outer casing sits slightly proud (+Z); sash/glass sit deeper (−Z).
  const casingZ = depth * 0.1;
  const sashZ = -depth * 0.08;

  if (detail === "low") {
    return [
      buildBoxPrimitive({
        center: [0, 0, -depth * 0.15],
        size: [width, height, Math.max(0.1, depth * 0.7)]
      })
    ];
  }

  const casingThickness = thickness * 1.35;
  const casingWidth = width + thickness * 1.6;
  const casingHeight = height + thickness * 1.5;

  const primitives: PrimitiveGeometry[] = [
    // Recess pocket into the wall mass (−Z throat).
    buildBoxPrimitive({
      center: [0, 0, -recessDepth * 0.55 - depth * 0.12],
      size: [width + 0.26, height + 0.26, recessDepth * 1.1]
    }),
    // Outer casing / reveal — proud of the wall face for clay edge.
    ...frameBars({
      width: casingWidth,
      height: casingHeight,
      depth: depth * 0.42,
      thickness: casingThickness,
      z: casingZ
    }),
    // Inner sash frame set deeper into the throat.
    ...frameBars({ width, height, depth: depth * 0.7, thickness, z: sashZ }),
    ...mullions({
      width,
      height,
      depth: mullionDepth,
      thickness: thickness * 0.78,
      countX: Math.max(1, countX),
      countY: Math.max(1, countY),
      z: sashZ - depth * 0.04
    }),
    // Sill body + drip edge (drip projects outward +Z).
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.45, sillProjection * 0.15],
      size: [width + thickness * 1.2, thickness * 1.1, depth * 0.5 + sillProjection]
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.15, sillProjection * 0.65],
      size: [width + thickness * 1.35, thickness * 0.35, sillProjection * 0.6]
    }),
    // Lintel / head hood — proud band for period clay shadow (Marx / Columbus).
    buildBoxPrimitive({
      center: [0, height / 2 - thickness * 0.2, depth * 0.14],
      size: [width + thickness * 1.35, thickness * 1.45, depth * 0.55]
    }),
    buildBoxPrimitive({
      center: [0, height / 2 - thickness * 0.05, depth * 0.26],
      size: [width + thickness * 1.5, thickness * 0.42, depth * 0.32]
    })
  ];

  if (arched) {
    primitives.push(
      ...archedCrown({
        width: width * 0.98,
        height,
        depth: depth * 0.82,
        steps: 7
      })
    );
    // Keystone mass at crown apex — readable silhouette cue in clay.
    primitives.push(
      buildBoxPrimitive({
        center: [0, height / 2 + thickness * 0.55, depth * 0.12],
        size: [thickness * 1.4, thickness * 1.8, depth * 0.55]
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
  const recessDepth = midRange(recipe, "recessDepthM", 0.34);
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
  const casingThickness = thickness * 1.25;
  return [
    // Throat pocket into the wall (−Z).
    buildBoxPrimitive({
      center: [0, 0, -recessDepth * 0.55 - depth * 0.1],
      size: [width + 0.26, height + 0.16, recessDepth * 1.08]
    }),
    // Projecting storefront surround (+Z exterior).
    ...frameBars({
      width: width + thickness * 1.4,
      height: height + thickness * 0.8,
      depth: depth * 0.48,
      thickness: casingThickness,
      z: depth * 0.14
    }),
    ...frameBars({ width, height, depth: depth * 0.78, thickness, z: -depth * 0.04 }),
    // Threshold / stoop (proud).
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.45, depth * 0.18],
      size: [width + 0.18, thickness * 1.05, depth * 0.85]
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.12, depth * 0.28],
      size: [width + 0.28, thickness * 0.4, depth * 0.55]
    }),
    // Door leaf + mid-stile (recessed into throat).
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness + leafHeight / 2, -leafInset - depth * 0.08],
      size: [Math.max(0.2, width - thickness * 2.2), leafHeight, depth * 0.42]
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness + leafHeight / 2, -leafInset - depth * 0.04],
      size: [thickness * 0.55, leafHeight * 0.92, depth * 0.22]
    }),
    // Transom bar + head.
    buildBoxPrimitive({
      center: [0, height / 2 - transomHeight / 2 - thickness * 0.2, -depth * 0.06],
      size: [Math.max(0.15, width - thickness * 2), thickness * 0.85, depth * 0.65]
    }),
    buildBoxPrimitive({
      center: [0, height / 2 - thickness * 0.35, depth * 0.12],
      size: [width + thickness * 0.8, thickness * 1.1, depth * 0.55]
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
