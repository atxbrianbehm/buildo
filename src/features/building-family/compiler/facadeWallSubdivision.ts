import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { buildBoxPrimitive, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";
import {
  clampOpeningToGlazingBand,
  splitGroundStorefrontVertical,
  type StorefrontVerticalSplit
} from "./storefrontScopeSplit";

/**
 * CGA / Geometry-Nodes-inspired facade wall subdivision.
 *
 * Instead of one slab per bay, each bay splits into structural wall scopes:
 * left pier | right pier | sill wall | head wall | (optional mid rail).
 * Opening centers stay empty for frame instances — closer to GN "grid + module".
 *
 * Ground front bays also carry an explicit storefront vertical split (G3):
 * bulkhead | glazing | lintel.
 */

export type WallFacadeName = "front" | "rear" | "left" | "right";

export interface OpeningSlot {
  widthM: number;
  heightM: number;
  /** Vertical center of the opening within the floor band (world Y). */
  centerYM: number;
  /** Horizontal center of the opening within the facade (world X or Z). */
  centerAlongM: number;
  kind?: "window" | "door";
}

export interface FacadeBayScope {
  facade: WallFacadeName;
  floorIndex: number;
  bayIndex: number;
  /** World min corner of the bay wall rectangle (along-facade, up, out). */
  originM: Vec3;
  sizeM: Vec3;
  zone: "ground" | "body";
  opening?: OpeningSlot;
  /** Present on ground front (and optional later) bays — storefront vertical bands. */
  storefront?: StorefrontVerticalSplit;
}

export interface SubdivideFacadeWallsInput {
  spec: BuildingFamilySpec;
  wallDepthM: number;
  /** Optional opening sizes by facade/floor/bay; missing cells stay solid. */
  openings?: Array<{
    facade: WallFacadeName;
    floorIndex: number;
    bayIndex: number;
    widthM: number;
    heightM: number;
    kind?: "window" | "door";
  }>;
  /**
   * When true, only `openings` entries are punched — no default front/rear grids.
   * Used when an art-kit facade plan is the opening authority (CGA/GN split).
   */
  strictOpenings?: boolean;
  /**
   * Default punched openings when not strict and no per-cell seed:
   * - `front-only`: proof-style full front grid (no rear/side defaults)
   * - `multi-facade`: front + rear body + sparse sides (legacy non-strict defaults)
   */
  defaultOpeningMode?: "front-only" | "multi-facade";
}

function floorBaseY(spec: BuildingFamilySpec, floorIndex: number): number {
  return spec.massing.floorHeightsM.slice(0, floorIndex).reduce((total, height) => total + height, 0);
}

function openingKey(facade: WallFacadeName, floor: number, bay: number): string {
  return `${facade}:${floor}:${bay}`;
}

/**
 * Build per-bay scopes for all facades (front/rear/left/right).
 * Front/rear use X as along-axis; left/right use Z as along-axis.
 */
export function buildFacadeBayScopes(input: SubdivideFacadeWallsInput): FacadeBayScope[] {
  const { spec, wallDepthM } = input;
  const strictOpenings = Boolean(input.strictOpenings);
  const defaultOpeningMode = input.defaultOpeningMode ?? "multi-facade";
  const openingMap = new Map(
    (input.openings ?? []).map((opening) => [
      openingKey(opening.facade, opening.floorIndex, opening.bayIndex),
      opening
    ])
  );
  const scopes: FacadeBayScope[] = [];
  const frontBayWidth = spec.massing.widthM / spec.facade.frontBayCount;
  const sideCount = Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));
  const sideBayDepth = spec.massing.depthM / sideCount;

  for (let floor = 0; floor < spec.massing.floorCount; floor += 1) {
    const floorHeight = spec.massing.floorHeightsM[floor] ?? 3;
    const y0 = floorBaseY(spec, floor);
    const zone: "ground" | "body" = floor === 0 ? "ground" : "body";
    const depth = wallDepthM + (floor === 0 ? Math.min(0.16, wallDepthM * 0.5) : 0);

    for (let bay = 0; bay < spec.facade.frontBayCount; bay += 1) {
      const x0 = -spec.massing.widthM / 2 + frontBayWidth * bay;
      for (const facade of ["front", "rear"] as const) {
        const z0 =
          facade === "front"
            ? -spec.massing.depthM / 2
            : spec.massing.depthM / 2 - depth;
        const openingSpec = openingMap.get(openingKey(facade, floor, bay));
        const defaultOpenW = Math.min(frontBayWidth * 0.62, 1.6);
        const defaultOpenH = Math.min(floorHeight * (zone === "ground" ? 0.58 : 0.48), 2.6);
        const hasDefaultOpening =
          !strictOpenings &&
          (defaultOpeningMode === "front-only"
            ? facade === "front"
            : facade === "front" || (facade === "rear" && zone === "body"));
        const doorBay = Math.floor(spec.facade.frontBayCount / 2);
        const storefront =
          facade === "front" && zone === "ground"
            ? splitGroundStorefrontVertical(y0, floorHeight)
            : undefined;
        let opening: OpeningSlot | undefined;
        if (openingSpec !== undefined) {
          const kind = openingSpec.kind ?? "window";
          const raw = {
            widthM: openingSpec.widthM,
            heightM: openingSpec.heightM,
            centerYM: y0 + floorHeight * (zone === "ground" ? 0.52 : 0.55),
            centerAlongM: x0 + frontBayWidth / 2,
            kind
          };
          if (storefront) {
            const clamped = clampOpeningToGlazingBand(raw, storefront, kind);
            opening = { ...raw, heightM: clamped.heightM, centerYM: clamped.centerYM };
          } else {
            opening = raw;
          }
        } else if (hasDefaultOpening) {
          const isDoor = floor === 0 && bay === doorBay && facade === "front";
          const kind = isDoor ? ("door" as const) : ("window" as const);
          const raw = {
            widthM: isDoor ? Math.min(frontBayWidth * 0.7, 2.0) : defaultOpenW,
            heightM: isDoor ? Math.min(floorHeight * 0.72, 3.0) : defaultOpenH,
            centerYM: y0 + floorHeight * (zone === "ground" ? 0.52 : 0.55),
            centerAlongM: x0 + frontBayWidth / 2,
            kind
          };
          if (storefront) {
            const clamped = clampOpeningToGlazingBand(raw, storefront, kind);
            opening = { ...raw, heightM: clamped.heightM, centerYM: clamped.centerYM };
          } else {
            opening = raw;
          }
        }

        scopes.push({
          facade,
          floorIndex: floor,
          bayIndex: bay,
          originM: [x0, y0, z0],
          sizeM: [frontBayWidth, floorHeight, depth],
          zone,
          opening,
          storefront
        });
      }
    }

    for (let bay = 0; bay < sideCount; bay += 1) {
      const z0 = -spec.massing.depthM / 2 + sideBayDepth * bay;
      for (const facade of ["left", "right"] as const) {
        const x0 =
          facade === "left" ? -spec.massing.widthM / 2 : spec.massing.widthM / 2 - depth;
        const sideOpeningSpec = openingMap.get(openingKey(facade, floor, bay));
        const sideOpening =
          sideOpeningSpec !== undefined
            ? {
                widthM: sideOpeningSpec.widthM,
                heightM: sideOpeningSpec.heightM,
                centerYM: y0 + floorHeight * 0.55,
                centerAlongM: z0 + sideBayDepth / 2
              }
            : !strictOpenings &&
                defaultOpeningMode === "multi-facade" &&
                zone === "body" &&
                (bay + floor) % 2 === 0
              ? {
                  widthM: Math.min(sideBayDepth * 0.55, 1.2),
                  heightM: Math.min(floorHeight * 0.45, 2.2),
                  centerYM: y0 + floorHeight * 0.55,
                  centerAlongM: z0 + sideBayDepth / 2
                }
              : undefined;
        scopes.push({
          facade,
          floorIndex: floor,
          bayIndex: bay,
          originM: [x0, y0, z0],
          sizeM: [depth, floorHeight, sideBayDepth],
          zone,
          opening: sideOpening
        });
      }
    }
  }

  return scopes;
}

/**
 * Expand one bay scope into wall solid pieces around an optional opening.
 * Empty center = slot for window/door module (GN instance on face).
 */
export function expandBayWallPrimitives(scope: FacadeBayScope): PrimitiveGeometry[] {
  const [ox, oy, oz] = scope.originM;
  const [sx, sy, sz] = scope.sizeM;
  const primitives: PrimitiveGeometry[] = [];
  const isSide = scope.facade === "left" || scope.facade === "right";

  if (!scope.opening) {
    const center: Vec3 = [ox + sx / 2, oy + sy / 2, oz + sz / 2];
    primitives.push(buildBoxPrimitive({ center, size: [sx, sy, sz] }));
    return primitives;
  }

  const open = scope.opening;
  // Pier thickness from opening to bay edge (along facade).
  const alongMin = isSide ? oz : ox;
  const alongSize = isSide ? sz : sx;
  const openAlong = open.centerAlongM;
  const openHalf = open.widthM / 2;
  const leftWidth = Math.max(0.08, openAlong - openHalf - alongMin);
  const rightWidth = Math.max(0.08, alongMin + alongSize - (openAlong + openHalf));
  const openBottom = open.centerYM - open.heightM / 2;
  const openTop = open.centerYM + open.heightM / 2;
  const sillHeight = Math.max(0.08, openBottom - oy);
  const headHeight = Math.max(0.08, oy + sy - openTop);

  if (!isSide) {
    const sf = scope.storefront;
    // Storefront ground front: full-width bulkhead + lintel bands, then piers beside glazing.
    if (sf && scope.zone === "ground" && scope.facade === "front") {
      // Bulkhead (full bay width)
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, sf.bulkheadCenterYM, oz + sz / 2],
          size: [sx, sf.bulkheadHeightM, sz]
        })
      );
      // Lintel band (full bay width under 2nd floor)
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, sf.lintelCenterYM, oz + sz / 2],
          size: [sx, sf.lintelHeightM, sz]
        })
      );
      // Left / right piers only within glazing band height
      if (leftWidth > 0.05) {
        primitives.push(
          buildBoxPrimitive({
            center: [alongMin + leftWidth / 2, sf.glazingCenterYM, oz + sz / 2],
            size: [leftWidth, sf.glazingHeightM, sz]
          })
        );
      }
      if (rightWidth > 0.05) {
        primitives.push(
          buildBoxPrimitive({
            center: [openAlong + openHalf + rightWidth / 2, sf.glazingCenterYM, oz + sz / 2],
            size: [rightWidth, sf.glazingHeightM, sz]
          })
        );
      }
      // Inner reveal at glazing slot
      primitives.push(
        buildBoxPrimitive({
          center: [openAlong, open.centerYM, oz + sz * 0.22],
          size: [open.widthM + 0.1, open.heightM + 0.1, sz * 0.28]
        })
      );
      return primitives;
    }

    // Left pier
    if (leftWidth > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [alongMin + leftWidth / 2, oy + sy / 2, oz + sz / 2],
          size: [leftWidth, sy, sz]
        })
      );
    }
    // Right pier
    if (rightWidth > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [openAlong + openHalf + rightWidth / 2, oy + sy / 2, oz + sz / 2],
          size: [rightWidth, sy, sz]
        })
      );
    }
    // Sill wall
    if (sillHeight > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [openAlong, oy + sillHeight / 2, oz + sz / 2],
          size: [open.widthM + 0.04, sillHeight, sz]
        })
      );
    }
    // Head wall / lintel mass
    if (headHeight > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [openAlong, openTop + headHeight / 2, oz + sz / 2],
          size: [open.widthM + 0.04, headHeight, sz]
        })
      );
    }
    // Inner reveal thickness toward exterior (reads as punched wall).
    primitives.push(
      buildBoxPrimitive({
        center: [openAlong, open.centerYM, oz + sz * 0.22],
        size: [open.widthM + 0.1, open.heightM + 0.1, sz * 0.28]
      })
    );
  } else {
    // Side facade: along-axis is Z
    if (leftWidth > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, oy + sy / 2, alongMin + leftWidth / 2],
          size: [sx, sy, leftWidth]
        })
      );
    }
    if (rightWidth > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, oy + sy / 2, openAlong + openHalf + rightWidth / 2],
          size: [sx, sy, rightWidth]
        })
      );
    }
    if (sillHeight > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, oy + sillHeight / 2, openAlong],
          size: [sx, sillHeight, open.widthM + 0.04]
        })
      );
    }
    if (headHeight > 0.05) {
      primitives.push(
        buildBoxPrimitive({
          center: [ox + sx / 2, openTop + headHeight / 2, openAlong],
          size: [sx, headHeight, open.widthM + 0.04]
        })
      );
    }
  }

  return primitives;
}

export function buildSubdividedFacadeWallPrimitives(input: SubdivideFacadeWallsInput): PrimitiveGeometry[] {
  const scopes = buildFacadeBayScopes(input);
  const primitives: PrimitiveGeometry[] = [];
  for (const scope of scopes) {
    primitives.push(...expandBayWallPrimitives(scope));
  }
  return primitives;
}
