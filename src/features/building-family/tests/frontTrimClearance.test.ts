import { readFileSync } from "node:fs";
import path from "node:path";
import {
  deriveFrontTrimClearance,
  type FrontOpeningEnvelope,
  type FrontTrimClearance,
  type VerticalTrimBand
} from "../compiler/frontTrimClearance";
import { BuildingFamilySpecSchema, type BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";

const acceptanceCard = R1AcceptanceCardSchema.parse(JSON.parse(readFileSync(
  path.resolve("docs/reviews/2026-10-14-r1-s2/acceptance-card.json"), "utf8"
)));

function fixtureSpec(floorHeightsM?: number[], parapetHeightM?: number): BuildingFamilySpec {
  const spec = structuredClone(acceptanceCard.resolvedSpec);
  if (floorHeightsM) {
    spec.massing.floorCount = floorHeightsM.length;
    spec.massing.floorHeightsM = [...floorHeightsM];
  }
  if (parapetHeightM !== undefined) spec.massing.parapetHeightM = parapetHeightM;
  return BuildingFamilySpecSchema.parse(spec);
}

function bandsOf(result: FrontTrimClearance): VerticalTrimBand[] {
  return [...result.floorBands, ...(result.crownBand ? [result.crownBand] : [])];
}

/** Compare geometric intervals directly, independently of the production search/union. */
function expectClearIntervals(result: FrontTrimClearance, openings: readonly FrontOpeningEnvelope[]): void {
  for (const band of bandsOf(result)) {
    expect(Number.isFinite(band.minYM)).toBe(true);
    expect(Number.isFinite(band.maxYM)).toBe(true);
    expect(band.maxYM).toBeGreaterThan(band.minYM);
    for (const opening of openings) {
      const distance = band.maxYM <= opening.minYM
        ? opening.minYM - band.maxYM
        : band.minYM - opening.maxYM;
      expect(distance).toBeGreaterThanOrEqual(0.05 - 1e-10);
    }
  }
}

function freezeRecursively<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeRecursively(child);
    Object.freeze(value);
  }
  return value;
}

describe("frontTrimClearance", () => {
  it("clears the measured canonical top casing rather than just the nominal glazing head", () => {
    const spec = fixtureSpec();
    // S2's measured transformed top-front geometry: glazing ends at15.47273m,
    // while the arched frame/casing extends to16.26276m. The crown needs both.
    const openings: FrontOpeningEnvelope[] = [
      { floorIndex: 3, minYM: 14.11787, maxYM: 15.47273 },
      { floorIndex: 3, minYM: 13.70926, maxYM: 16.26276 }
    ];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.crownBand).toBeDefined();
    expect(result.crownBand!.minYM).toBeGreaterThanOrEqual(16.31276 - 1e-10);
    expect(result.crownBand!.maxYM).toBeLessThanOrEqual(17.705 + 1e-10);
    expectClearIntervals(result, openings);
  });

  it("uses the exact canonical floor breaks and bounded ground/upper trim heights", () => {
    const spec = fixtureSpec();
    expect(spec.massing.floorHeightsM).toEqual([5.6, 3.606, 3.606, 3.606]);
    const result = deriveFrontTrimClearance(spec, []);
    expect(result.floorBands.map((band) => band.floorIndex)).toEqual([0, 1, 2]);
    const boundaries = [5.6, 9.206, 12.812];
    for (const [index, band] of result.floorBands.entries()) {
      expect(band.boundaryYM).toBeCloseTo(boundaries[index]!, 12);
      expect(band.maxYM - band.minYM).toBeLessThanOrEqual((index === 0 ? 0.58 : 0.32) + 1e-10);
      expect(band.minYM).toBeGreaterThanOrEqual(boundaries[index]! - 0.8 - 1e-10);
      expect(band.maxYM).toBeLessThanOrEqual(boundaries[index]! + 0.8 + 1e-10);
    }
    expectClearIntervals(result, []);
  });

  it("keeps trim local to a break beside short blank floors instead of filling a tall empty storey", () => {
    const spec = fixtureSpec([8, 1, 1, 8]);
    const result = deriveFrontTrimClearance(spec, []);
    expect(result.floorBands).toHaveLength(3);
    for (const [index, band] of result.floorBands.entries()) {
      const boundary = [8, 9, 10][index]!;
      expect(band.boundaryYM).toBe(boundary);
      expect(band.minYM).toBeGreaterThanOrEqual(boundary - 0.25 - 1e-10);
      expect(band.maxYM).toBeLessThanOrEqual(boundary + 0.25 + 1e-10);
      expect(band.maxYM - band.minYM).toBeLessThanOrEqual((index === 0 ? 0.58 : 0.32) + 1e-10);
    }
  });

  it("clears overlapping envelopes and gives the same result as their known geometric union", () => {
    const spec = fixtureSpec();
    const overlapping: FrontOpeningEnvelope[] = [
      { floorIndex: 0, minYM: 4.9, maxYM: 5.62 },
      { floorIndex: 1, minYM: 5.45, maxYM: 6.0 },
      { floorIndex: 1, minYM: 5.8, maxYM: 6.1 },
      { floorIndex: 2, minYM: 9.6, maxYM: 10.5 },
      { floorIndex: 3, minYM: 14.2, maxYM: 16.26276 }
    ];
    const union: FrontOpeningEnvelope[] = [
      { floorIndex: 0, minYM: 4.9, maxYM: 6.1 },
      overlapping[3]!, overlapping[4]!
    ];
    const result = deriveFrontTrimClearance(spec, overlapping);
    expect(result).toEqual(deriveFrontTrimClearance(spec, union));
    expect(result).toEqual(deriveFrontTrimClearance(spec, [...overlapping].reverse()));
    expect(result).toEqual(deriveFrontTrimClearance(spec, [overlapping[2]!, overlapping[4]!,
      overlapping[1]!, overlapping[0]!, overlapping[3]!, overlapping[2]!]));
    expectClearIntervals(result, overlapping);
  });

  it("leaves deeply frozen spec and envelope inputs unchanged", () => {
    const spec = freezeRecursively(fixtureSpec());
    const openings = freezeRecursively([
      { floorIndex: 3, minYM: 13.70926, maxYM: 16.26276 },
      { floorIndex: 0, minYM: 1.0, maxYM: 4.2 },
      { floorIndex: 1, minYM: 6.2, maxYM: 8.5 }
    ]);
    const specBefore = structuredClone(spec);
    const openingsBefore = structuredClone(openings);
    const first = deriveFrontTrimClearance(spec, openings);
    expect(deriveFrontTrimClearance(spec, openings)).toEqual(first);
    expect(spec).toEqual(specBefore);
    expect(openings).toEqual(openingsBefore);
    expectClearIntervals(first, openings);
  });

  it("omits a floor band when an actual envelope covers its entire local neighbourhood", () => {
    const spec = fixtureSpec([3, 3]);
    const openings = [{ floorIndex: 0, minYM: 2.1, maxYM: 3.9 }];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.floorBands).toEqual([]);
    expect(result.crownBand).toBeDefined();
    expectClearIntervals(result, openings);
  });

  it("omits the crown safely when casing reaches beyond the available roof/parapet space", () => {
    const spec = fixtureSpec([3, 3], 0.1);
    const openings = [{ floorIndex: 1, minYM: 4.8, maxYM: 6.2 }];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.crownBand).toBeUndefined();
    expect(result.floorBands).toHaveLength(1);
    expectClearIntervals(result, openings);
  });

  it("uses only the small clear head gap with a legal zero-height parapet", () => {
    const spec = fixtureSpec([3, 3], 0);
    const openings = [{ floorIndex: 1, minYM: 4.8, maxYM: 5.93 }];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.crownBand).toBeDefined();
    expect(result.crownBand!.minYM).toBeGreaterThanOrEqual(5.98 - 1e-10);
    expect(result.crownBand!.maxYM).toBeLessThanOrEqual(6);
    expect(result.crownBand!.maxYM - result.crownBand!.minYM).toBeLessThanOrEqual(0.02 + 1e-10);
    expectClearIntervals(result, openings);
  });

  it("omits an unusably thin crown gap instead of spilling below the required head clearance", () => {
    const spec = fixtureSpec([3, 3], 0);
    const openings = [{ floorIndex: 1, minYM: 4.8, maxYM: 5.946 }];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.crownBand).toBeUndefined();
    expectClearIntervals(result, openings);
  });

  it("reserves clearance around a zero-height geometry envelope", () => {
    const spec = fixtureSpec([3, 3]);
    const openings = [{ floorIndex: 0, minYM: 3, maxYM: 3 }];
    const result = deriveFrontTrimClearance(spec, openings);
    expect(result.floorBands).toHaveLength(1);
    expectClearIntervals(result, openings);
  });

  it.each([
    { label: "NaN minimum", minYM: Number.NaN, maxYM: 2, floorIndex: 0 },
    { label: "infinite maximum", minYM: 1, maxYM: Number.POSITIVE_INFINITY, floorIndex: 0 },
    { label: "negative infinite minimum", minYM: Number.NEGATIVE_INFINITY, maxYM: 2, floorIndex: 0 },
    { label: "reversed interval", minYM: 2, maxYM: 1, floorIndex: 0 },
    { label: "fractional floor", minYM: 1, maxYM: 2, floorIndex: 0.5 },
    { label: "negative floor", minYM: 1, maxYM: 2, floorIndex: -1 },
    { label: "out-of-range floor", minYM: 1, maxYM: 2, floorIndex: 4 },
    { label: "nonfinite floor", minYM: 1, maxYM: 2, floorIndex: Number.NaN }
  ])("rejects $label before emitting bands", ({ minYM, maxYM, floorIndex }) => {
    expect(() => deriveFrontTrimClearance(fixtureSpec(), [{ minYM, maxYM, floorIndex }]))
      .toThrow(/finite, ordered opening envelopes with valid floor indices/);
  });
});
