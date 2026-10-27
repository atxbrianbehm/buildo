import type { ComponentRecipe } from "../contracts/componentRecipe";
import { openingGlazingCenterZ, openingPaneThicknessM } from "./openingSlotBinding";
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
/** A glass recipe owns thickness; its paired frame transform owns recess depth. */
export function buildOpeningGlassPrimitives(recipe: ComponentRecipe): PrimitiveGeometry[] {
  const isGlassRecipe = recipe.role === "windowGlass" || recipe.role === "doorGlass";
  const isDoor = recipe.role === "door";
  const width = recipe.dimensionsM.width * (isGlassRecipe ? 1 : isDoor ? 0.72 : 0.78);
  const height = isGlassRecipe
    ? recipe.dimensionsM.height
    : isDoor ? openingTransomGlazingBand(recipe).heightM : recipe.dimensionsM.height * 0.72;
  const depth = openingPaneThicknessM(isGlassRecipe ? recipe.dimensionsM.depth : undefined);
  return [
    buildBoxPrimitive({
      center: [
        0,
        isDoor ? openingTransomCenterY(recipe) : 0,
        isGlassRecipe ? 0 : openingGlazingCenterZ(recipe.dimensionsM.depth)
      ],
      size: [width, height, depth]
    })
  ];
}

/** Clear pane band between the separator's upper face and the top sash's lower face. */
export function openingTransomGlazingBand(recipe: ComponentRecipe): { centerY: number; heightM: number } {
  const transomHeight = midRange(recipe, "transomHeightM", 0.45);
  const thickness = midRange(recipe, "frameThicknessM", 0.13);
  const halfH = recipe.dimensionsM.height / 2;
  const bottomY = halfH - transomHeight - thickness * 0.2 + thickness * 0.85 / 2;
  const topY = halfH - thickness;
  return { centerY: (bottomY + topY) / 2, heightM: Math.max(0.05, topY - bottomY) };
}

export function openingTransomCenterY(recipe: ComponentRecipe): number {
  return openingTransomGlazingBand(recipe).centerY;
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
  const recessDepth = midRange(recipe, "recessDepthM", 0.45);
  const sillProjection = midRange(recipe, "sillProjectionM", 0.16);
  const hoodProjection = midRange(recipe, "hoodProjectionM", 0.2);
  const mullionDepth = midRange(recipe, "mullionDepthM", 0.12);
  const countX = Math.round(midRange(recipe, "mullionCountX", 1));
  const countY = Math.round(midRange(recipe, "mullionCountY", 1));
  // Outer casing proud (+Z); sash/glass deep in throat (−Z). V3 amplitude.
  const casingZ = depth * 0.12;
  const sashZ = -depth * 0.22;

  if (detail === "low") {
    return frameBars({
      width,
      height,
      depth: Math.max(0.14, depth * 0.85),
      thickness,
      z: -depth * 0.28
    });
  }

  const casingThickness = thickness * 1.4;
  const casingWidth = width + thickness * 1.75;
  const casingHeight = height + thickness * 1.65;
  const halfW = width / 2;
  const halfH = height / 2;
  const returnDepth = recessDepth * 0.85 + depth * 0.25;
  const returnThickness = thickness * 0.85;

  const primitives: PrimitiveGeometry[] = [
    // Side returns — vertical faces of the punch for raking-light shadow.
    buildBoxPrimitive({
      center: [-halfW - returnThickness * 0.15, 0, -returnDepth * 0.45],
      size: [returnThickness, height + thickness * 0.4, returnDepth]
    }),
    buildBoxPrimitive({
      center: [halfW + returnThickness * 0.15, 0, -returnDepth * 0.45],
      size: [returnThickness, height + thickness * 0.4, returnDepth]
    }),
    // Head return into the throat.
    buildBoxPrimitive({
      center: [0, halfH + returnThickness * 0.1, -returnDepth * 0.4],
      size: [width + thickness * 0.6, returnThickness, returnDepth * 0.9]
    }),
    // Outer casing / reveal — proud of the wall face for clay edge.
    ...frameBars({
      width: casingWidth,
      height: casingHeight,
      depth: depth * 0.38,
      thickness: casingThickness,
      z: casingZ
    }),
    // Inner sash frame set deep into the throat.
    ...frameBars({ width, height, depth: depth * 0.65, thickness, z: sashZ }),
    ...mullions({
      width,
      height,
      depth: mullionDepth,
      thickness: thickness * 0.78,
      countX: Math.max(1, countX),
      countY: Math.max(1, countY),
      z: sashZ - depth * 0.08
    }),
    // Sill body + drip edge (drip projects outward +Z).
    buildBoxPrimitive({
      center: [0, -halfH + thickness * 0.5, sillProjection * 0.2],
      size: [width + thickness * 1.35, thickness * 1.25, depth * 0.55 + sillProjection]
    }),
    buildBoxPrimitive({
      center: [0, -halfH + thickness * 0.18, sillProjection * 0.8],
      size: [width + thickness * 1.55, thickness * 0.4, sillProjection * 0.75]
    }),
    // Lintel / head hood — proud shelf for period clay shadow (Marx / Columbus).
    buildBoxPrimitive({
      center: [0, halfH - thickness * 0.15, hoodProjection * 0.55],
      size: [width + thickness * 1.6, thickness * 1.55, depth * 0.45 + hoodProjection]
    }),
    buildBoxPrimitive({
      center: [0, halfH + thickness * 0.05, hoodProjection * 0.95],
      size: [width + thickness * 1.75, thickness * 0.48, hoodProjection * 0.7]
    })
  ];

  if (arched) {
    primitives.push(
      ...archedCrown({
        width: width * 0.98,
        height,
        depth: depth * 0.9,
        steps: 7
      })
    );
    // Keystone mass at crown apex — readable silhouette cue in clay.
    primitives.push(
      buildBoxPrimitive({
        center: [0, halfH + thickness * 0.6, hoodProjection * 0.4],
        size: [thickness * 1.55, thickness * 2.0, depth * 0.6]
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
  const recessDepth = midRange(recipe, "recessDepthM", 0.42);
  const transomHeight = midRange(recipe, "transomHeightM", 0.45);
  const leafInset = midRange(recipe, "leafInsetM", 0.12);
  const leafHeight = Math.max(0.4, height - transomHeight - thickness * 1.5);
  // Preserve the requested inset while preventing the lower opaque leaf from
  // retreating behind the aperture backing. Its front stops at the glazing
  // center in the deepest case; its upper edge remains below the clear transom.
  const leafZ = Math.max(-leafInset - depth * 0.2, openingGlazingCenterZ(depth) - depth * 0.19);
  const leaf = buildBoxPrimitive({
    center: [0, -height / 2 + thickness + leafHeight / 2, leafZ],
    size: [Math.max(0.2, width - thickness * 2.2), leafHeight, depth * 0.38]
  });

  if (detail === "low") {
    return [
      ...frameBars({
        width,
        height,
        depth: Math.max(0.14, depth * 0.8),
        thickness,
        z: -depth * 0.2
      }),
      leaf
    ];
  }

  const casingThickness = thickness * 1.3;
  const halfW = width / 2;
  const returnDepth = recessDepth * 0.9 + depth * 0.2;
  return [
    // Side returns for punched storefront shadow.
    buildBoxPrimitive({
      center: [-halfW - thickness * 0.2, 0, -returnDepth * 0.45],
      size: [thickness * 0.9, height * 0.95, returnDepth]
    }),
    buildBoxPrimitive({
      center: [halfW + thickness * 0.2, 0, -returnDepth * 0.45],
      size: [thickness * 0.9, height * 0.95, returnDepth]
    }),
    // Projecting storefront surround (+Z exterior).
    ...frameBars({
      width: width + thickness * 1.5,
      height: height + thickness * 0.9,
      depth: depth * 0.45,
      thickness: casingThickness,
      z: depth * 0.16
    }),
    ...frameBars({ width, height, depth: depth * 0.72, thickness, z: -depth * 0.18 }),
    // Threshold / stoop (proud).
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.45, depth * 0.2],
      size: [width + 0.22, thickness * 1.1, depth * 0.9]
    }),
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness * 0.12, depth * 0.32],
      size: [width + 0.32, thickness * 0.42, depth * 0.6]
    }),
    // Door leaf + mid-stile (recessed deep into throat).
    leaf,
    buildBoxPrimitive({
      center: [0, -height / 2 + thickness + leafHeight / 2, leafZ + depth * 0.08],
      size: [thickness * 0.55, leafHeight * 0.92, depth * 0.2]
    }),
    // Transom bar + head.
    buildBoxPrimitive({
      center: [0, height / 2 - transomHeight - thickness * 0.2, -depth * 0.2],
      size: [Math.max(0.15, width - thickness * 2), thickness * 0.85, depth * 0.6]
    }),
    buildBoxPrimitive({
      center: [0, height / 2 - thickness * 0.3, depth * 0.14],
      size: [width + thickness * 0.95, thickness * 1.2, depth * 0.6]
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
  const glassFrontZ = openingGlazingCenterZ(recipe.dimensionsM.depth) + 0.01;
  return frame.bounds.max[2] - glassFrontZ;
}

export type { Vec3 };
