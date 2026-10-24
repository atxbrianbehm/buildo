import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

export interface VerticalTrimBand {
  minYM: number;
  maxYM: number;
}

export interface FrontTrimFloorBand extends VerticalTrimBand {
  floorIndex: number;
  boundaryYM: number;
}

export interface FrontTrimClearance {
  crownBand?: VerticalTrimBand;
  floorBands: FrontTrimFloorBand[];
}

/** Actual transformed front opening geometry, never nominal slot dimensions. */
export interface FrontOpeningEnvelope extends VerticalTrimBand {
  floorIndex: number;
}

export const FRONT_TRIM_OPENING_CLEARANCE_M = 0.05;
const MIN_TRIM_BAND_M = 0.005;

function availableBands(search: VerticalTrimBand, blocked: readonly VerticalTrimBand[]): VerticalTrimBand[] {
  const result: VerticalTrimBand[] = [];
  let cursor = search.minYM;
  for (const interval of blocked) {
    if (interval.maxYM <= cursor) continue;
    if (interval.minYM >= search.maxYM) break;
    if (interval.minYM - cursor >= MIN_TRIM_BAND_M) {
      result.push({ minYM: cursor, maxYM: Math.min(interval.minYM, search.maxYM) });
    }
    cursor = Math.max(cursor, interval.maxYM);
    if (cursor >= search.maxYM) break;
  }
  if (search.maxYM - cursor >= MIN_TRIM_BAND_M) result.push({ minYM: cursor, maxYM: search.maxYM });
  return result;
}

/**
 * Reserve clear vertical space for full-width front trim using the existing
 * opening authority's emitted envelopes. This does not place any openings.
 * Floor runs stay local to their floor break even when a storey has no windows.
 */
export function deriveFrontTrimClearance(
  spec: BuildingFamilySpec,
  openings: readonly FrontOpeningEnvelope[]
): FrontTrimClearance {
  for (const opening of openings) {
    if (!Number.isFinite(opening.minYM) || !Number.isFinite(opening.maxYM) ||
        opening.maxYM < opening.minYM || !Number.isInteger(opening.floorIndex) ||
        opening.floorIndex < 0 || opening.floorIndex >= spec.massing.floorCount) {
      throw new Error("Front trim requires finite, ordered opening envelopes with valid floor indices.");
    }
  }
  const blocked = openings.map((opening) => ({
    minYM: opening.minYM - FRONT_TRIM_OPENING_CLEARANCE_M,
    maxYM: opening.maxYM + FRONT_TRIM_OPENING_CLEARANCE_M
  })).sort((first, second) => first.minYM - second.minYM || first.maxYM - second.maxYM);
  const merged: VerticalTrimBand[] = [];
  for (const interval of blocked) {
    const previous = merged.at(-1);
    if (previous && interval.minYM <= previous.maxYM) previous.maxYM = Math.max(previous.maxYM, interval.maxYM);
    else merged.push({ ...interval });
  }
  const totalHeightM = spec.massing.floorHeightsM.reduce((total, height) => total + height, 0);
  const highestOpeningM = openings.reduce((maximum, opening) => Math.max(maximum, opening.maxYM), 0);
  const crownBodyAllowanceM = Math.min(0.35, (spec.massing.floorHeightsM.at(-1) ?? 0) * 0.12);
  const crownMinYM = Math.max(totalHeightM - crownBodyAllowanceM, highestOpeningM + FRONT_TRIM_OPENING_CLEARANCE_M);
  const crownMaxYM = totalHeightM + spec.massing.parapetHeightM;
  const crownBand = crownMaxYM - crownMinYM >= MIN_TRIM_BAND_M
    ? { minYM: crownMinYM, maxYM: crownMaxYM }
    : undefined;
  const floorBands: FrontTrimFloorBand[] = [];
  let boundaryYM = 0;
  for (let floorIndex = 0; floorIndex < spec.massing.floorCount - 1; floorIndex += 1) {
    boundaryYM += spec.massing.floorHeightsM[floorIndex] ?? 0;
    const neighbourhoodM = Math.min(0.8,
      (spec.massing.floorHeightsM[floorIndex] ?? 0) * 0.25,
      (spec.massing.floorHeightsM[floorIndex + 1] ?? 0) * 0.25);
    const candidates = availableBands({ minYM: boundaryYM - neighbourhoodM, maxYM: boundaryYM + neighbourhoodM }, merged);
    const distance = (band: VerticalTrimBand) => Math.max(band.minYM - boundaryYM, boundaryYM - band.maxYM, 0);
    candidates.sort((first, second) => distance(first) - distance(second) ||
      (second.maxYM - second.minYM) - (first.maxYM - first.minYM) || first.minYM - second.minYM);
    const available = candidates[0];
    if (!available) continue;
    const heightM = Math.min(floorIndex === 0 ? 0.58 : 0.32, available.maxYM - available.minYM);
    const minYM = Math.max(available.minYM, Math.min(boundaryYM - heightM * 0.4, available.maxYM - heightM));
    floorBands.push({ floorIndex, boundaryYM, minYM, maxYM: minYM + heightM });
  }
  return { ...(crownBand ? { crownBand } : {}), floorBands };
}
