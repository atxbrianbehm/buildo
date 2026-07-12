/**
 * CGA-style ground storefront vertical split (G3).
 *
 * ground bay
 *   ├─ bulkhead scope   (solid base under glazing)
 *   ├─ glazing scope    (opening slot: door or storefront window)
 *   └─ lintel / fascia  (solid band under 2nd floor)
 *
 * Pure helpers — no React/Three. Side/rear ground stay simpler (callers skip or use body rules).
 */

export interface StorefrontVerticalSplit {
  bulkheadHeightM: number;
  glazingHeightM: number;
  lintelHeightM: number;
  /** Absolute world Y of band centers given floor base Y. */
  bulkheadCenterYM: number;
  glazingCenterYM: number;
  lintelCenterYM: number;
  /** Glazing band vertical extents (world Y). */
  glazingBottomYM: number;
  glazingTopYM: number;
}

/**
 * Split a ground floor band into bulkhead / glazing / lintel.
 * Ratios are stable; heights scale with floorHeightM so hash/layout track massing.
 */
export function splitGroundStorefrontVertical(
  floorBaseYM: number,
  floorHeightM: number
): StorefrontVerticalSplit {
  const h = Math.max(2.4, floorHeightM);
  const bulkheadHeightM = Math.min(1.05, Math.max(0.55, h * 0.2));
  const lintelHeightM = Math.min(0.42, Math.max(0.22, h * 0.09));
  const glazingHeightM = Math.max(1.2, h - bulkheadHeightM - lintelHeightM);
  const glazingBottomYM = floorBaseYM + bulkheadHeightM;
  const glazingTopYM = glazingBottomYM + glazingHeightM;
  return {
    bulkheadHeightM,
    glazingHeightM,
    lintelHeightM,
    bulkheadCenterYM: floorBaseYM + bulkheadHeightM / 2,
    glazingCenterYM: glazingBottomYM + glazingHeightM / 2,
    lintelCenterYM: glazingTopYM + lintelHeightM / 2,
    glazingBottomYM,
    glazingTopYM
  };
}

/** Clamp opening height/center into the glazing band (door/window stay inside storefront module). */
export function clampOpeningToGlazingBand(
  opening: { heightM: number; centerYM: number },
  split: StorefrontVerticalSplit,
  kind: "window" | "door" = "window"
): { heightM: number; centerYM: number } {
  const maxH = split.glazingHeightM * (kind === "door" ? 0.98 : 0.92);
  const heightM = Math.min(Math.max(0.6, opening.heightM), maxH);
  const half = heightM / 2;
  const minCenter = split.glazingBottomYM + half + 0.02;
  const maxCenter = split.glazingTopYM - half - 0.02;
  const preferred =
    kind === "door"
      ? split.glazingBottomYM + heightM / 2 + 0.04
      : split.glazingCenterYM;
  const centerYM = Math.min(maxCenter, Math.max(minCenter, preferred));
  return { heightM, centerYM };
}
