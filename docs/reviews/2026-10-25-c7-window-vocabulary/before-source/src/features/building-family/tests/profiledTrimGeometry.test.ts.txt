import {
  buildBasePlinthPrimitives,
  buildCorniceProfilePrimitives,
  buildCornerQuoinPrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildProfiledRunPrimitives,
  buildRoofCapPrimitives,
  buildSpandrelBandPrimitives,
  buildVerticalPilasterPrimitives
} from "../compiler/profiledTrimGeometry";
import {
  buildCorniceRecipe,
  buildProfiledHorizontalTrimRecipe,
  buildProfiledRoofCapRecipe,
  buildProfiledVerticalTrimRecipe
} from "../components/profiledTrimBuilder";
import { buildCornerQuoinRecipe } from "../components/quoinBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { FrontTrimClearance, VerticalTrimBand } from "../compiler/frontTrimClearance";
import type { PrimitiveGeometry } from "../compiler/primitiveGeometry";
import { late19cCorniceProfile, late19cBeltProfile } from "../compiler/profileLibrary";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-profiled-geometry",
    sourceIntentHash: "intent-profiled-geometry",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 28,
      depthM: 18,
      floorCount: 4,
      floorHeightsM: [4, 3, 3, 3],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 7,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

function fixtureClearance(): FrontTrimClearance {
  return {
    crownBand: { minYM: 13.05, maxYM: 14 },
    floorBands: [
      { floorIndex: 0, boundaryYM: 4, minYM: 3.75, maxYM: 4.25 },
      { floorIndex: 1, boundaryYM: 7, minYM: 6.84, maxYM: 7.16 },
      { floorIndex: 2, boundaryYM: 10, minYM: 9.84, maxYM: 10.16 }
    ]
  };
}

function expectInsideBand(primitives: PrimitiveGeometry[], band: VerticalTrimBand): void {
  for (const primitive of primitives) {
    expect(primitive.positions.length).toBeGreaterThan(0);
    for (let index = 1; index < primitive.positions.length; index += 3) {
      expect(primitive.positions[index]).toBeGreaterThanOrEqual(band.minYM - 1e-8);
      expect(primitive.positions[index]).toBeLessThanOrEqual(band.maxYM + 1e-8);
    }
  }
}

function projection(primitives: PrimitiveGeometry[], frontZ: number): number {
  return frontZ - Math.min(...primitives.map((primitive) => primitive.bounds.min[2]));
}

/** Profile strips/caps retain normalized UVs; box faces retain metre UVs. */
function expectSoundGeometry(primitives: PrimitiveGeometry[]): void {
  for (const primitive of primitives) {
    expect([...primitive.positions, ...primitive.normals, ...primitive.uvs].every(Number.isFinite)).toBe(true);
    const box = primitive.positions.length === 72 && primitive.indices.length === 36;
    if (!box) {
      expect(Math.min(...primitive.uvs)).toBe(0);
      expect(Math.max(...primitive.uvs)).toBe(1);
      expect(primitive.uvs.every((value) => value >= 0 && value <= 1)).toBe(true);
    }
    for (let vertex = 0; vertex < primitive.normals.length / 3; vertex += 1) {
      expect(Math.hypot(...primitive.normals.slice(vertex * 3, vertex * 3 + 3))).toBeCloseTo(1, 7);
    }
    for (let triangle = 0; triangle < primitive.indices.length; triangle += 3) {
      const a = primitive.indices[triangle];
      // Profile cap normals have a separate authored fan convention.
      if (!box && Math.abs(primitive.normals[a * 3]) > 0.99) continue;
      const [b, c] = primitive.indices.slice(triangle + 1, triangle + 3);
      const ab = [0, 1, 2].map((axis) => primitive.positions[b * 3 + axis] - primitive.positions[a * 3 + axis]);
      const ac = [0, 1, 2].map((axis) => primitive.positions[c * 3 + axis] - primitive.positions[a * 3 + axis]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...cross);
      expect(length).toBeGreaterThan(0);
      cross.forEach((value, axis) => expect(value / length).toBeCloseTo(primitive.normals[a * 3 + axis], 7));
      if (box) {
        for (const vertex of [b, c]) {
          const distanceM = Math.hypot(...[0, 1, 2].map((axis) => primitive.positions[vertex * 3 + axis] - primitive.positions[a * 3 + axis]));
          const uvDistanceM = Math.hypot(primitive.uvs[vertex * 2] - primitive.uvs[a * 2], primitive.uvs[vertex * 2 + 1] - primitive.uvs[a * 2 + 1]);
          expect(uvDistanceM).toBeCloseTo(distanceM, 7);
        }
      }
    }
  }
}

describe("profiled trim geometry", () => {
  it("builds multi-layer cornice, belt, roof-cap, and quoin primitives with normals", () => {
    const spec = fixtureSpec();
    const cornice = buildCorniceProfilePrimitives(spec, buildCorniceRecipe(spec));
    const belt = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec));
    const roofCap = buildRoofCapPrimitives(spec, buildProfiledRoofCapRecipe(spec));
    const quoins = buildCornerQuoinPrimitives(spec, buildCornerQuoinRecipe(spec));
    const pilaster = buildVerticalPilasterPrimitives(spec, buildProfiledVerticalTrimRecipe(spec), -spec.massing.widthM / 2);
    const spandrels = buildSpandrelBandPrimitives(spec);
    const plinth = buildBasePlinthPrimitives(spec);
    const stacked = buildProfiledRunPrimitives({
      id: "test-run",
      center: [0, 1, 0],
      size: [2, 1, 0.4],
      layers: [
        { id: "a", offsetM: [0, 0, 0], sizeM: [2, 0.5, 0.3] },
        { id: "b", offsetM: [0, 0.3, 0.05], sizeM: [2.1, 0.2, 0.35] }
      ]
    });

    // Cornice = extruded profile solid + bracket boxes.
    expect(cornice.length).toBeGreaterThanOrEqual(4);
    expect(cornice[0].positions.length / 3).toBeGreaterThan(40);
    // Intermediate floor belts (one extruded solid per floor break).
    expect(belt.length).toBeGreaterThanOrEqual(3);
    expect(roofCap.length).toBeGreaterThanOrEqual(1);
    expect(quoins.length).toBeGreaterThan(4);
    expect(pilaster.length).toBeGreaterThanOrEqual(3);
    expect(spandrels.length).toBeGreaterThanOrEqual(4);
    expect(plinth.length).toBeGreaterThanOrEqual(1);
    expect(stacked).toHaveLength(2);

    for (const primitive of [
      ...cornice,
      ...belt,
      ...roofCap,
      ...quoins,
      ...pilaster,
      ...spandrels,
      ...plinth,
      ...stacked
    ]) {
      expect(primitive.positions.length).toBeGreaterThan(0);
      expect(primitive.normals.length).toBe(primitive.positions.length);
      expect(primitive.indices.length % 3).toBe(0);
      expect(primitive.bounds.min[1]).toBeLessThan(primitive.bounds.max[1]);
    }
  });

  it("projects cornice and belt outward past the front facade face for clay crown read", () => {
    const spec = fixtureSpec();
    const frontZ = -spec.massing.depthM / 2;
    const cornice = buildCorniceProfilePrimitives(spec, buildCorniceRecipe(spec));
    const belt = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec));
    const plinth = buildBasePlinthPrimitives(spec);

    const corniceMinZ = Math.min(...cornice.map((primitive) => primitive.bounds.min[2]));
    const beltMinZ = Math.min(...belt.map((primitive) => primitive.bounds.min[2]));
    const plinthMinZ = Math.min(...plinth.map((primitive) => primitive.bounds.min[2]));

    // Front face is -depth/2; outward is more negative Z. Crown must clear the wall plane.
    expect(corniceMinZ).toBeLessThan(frontZ - 0.2);
    expect(beltMinZ).toBeLessThan(frontZ - 0.05);
    expect(plinthMinZ).toBeLessThan(frontZ - 0.05);
  });

  it("builds proud belt and spandrel bands for V4 mid-facade hierarchy", () => {
    const spec = fixtureSpec();
    const frontZ = -spec.massing.depthM / 2;
    const belts = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec));
    const spandrels = buildSpandrelBandPrimitives(spec);
    const beltMinZ = Math.min(...belts.map((primitive) => primitive.bounds.min[2]));
    const spandrelMinZ = Math.min(...spandrels.map((primitive) => primitive.bounds.min[2]));
    // Belts + drips + string courses: more than one primitive per floor break.
    expect(belts.length).toBeGreaterThanOrEqual(spec.massing.floorCount);
    expect(spandrels.length).toBeGreaterThanOrEqual((spec.massing.floorCount - 1) * 2);
    expect(frontZ - beltMinZ).toBeGreaterThanOrEqual(0.22);
    expect(frontZ - spandrelMinZ).toBeGreaterThanOrEqual(0.18);
  });

  it("builds a heavy layered crown that overhangs far enough for V2 silhouette (Marx target)", () => {
    const spec = {
      ...fixtureSpec(),
      facade: { ...fixtureSpec().facade, corniceHeightM: 1.7 },
      selectedFamilies: { ...fixtureSpec().selectedFamilies, cornice: "bracketed-metal" as const }
    };
    const recipe = {
      ...buildCorniceRecipe(spec),
      profileRecipeId: "profile.cornice.late19c.layered"
    };
    const cornice = buildCorniceProfilePrimitives(spec, recipe);
    const frontZ = -spec.massing.depthM / 2;
    const corniceMinZ = Math.min(...cornice.map((primitive) => primitive.bounds.min[2]));
    const overhang = frontZ - corniceMinZ;
    // ~0.7 m+ outward so skyline reads without forensic lighting.
    expect(overhang).toBeGreaterThanOrEqual(0.7);
    expect(cornice.length).toBeGreaterThanOrEqual(8);
  });

  it.each(["layered", "restrained"])("fits every %s crown part above the supplied head limit with correct normals and retained UV domains", (style) => {
    const spec = fixtureSpec();
    const recipe = { ...buildCorniceRecipe(spec), profileRecipeId: `profile.cornice.late19c.${style}` };
    const clearance = fixtureClearance();
    const crown = buildCorniceProfilePrimitives(spec, recipe, clearance);
    expect(crown.length).toBeGreaterThan(3);
    expectInsideBand(crown, clearance.crownBand!);
    expect(Math.max(...crown.map((primitive) => primitive.bounds.max[1]))).toBeCloseTo(clearance.crownBand!.maxYM, 8);
    expect(crown[0].bounds.max[1] - crown[0].bounds.min[1]).toBeCloseTo(0.95, 8);
    expect(crown[0].uvs).toEqual(buildCorniceProfilePrimitives(spec, recipe)[0].uvs);
    expectSoundGeometry(crown);
  });

  it("partitions all fitted belts/drips and spandrels with a clear joint and no mid-opening courses", () => {
    const spec = fixtureSpec();
    const clearance = fixtureClearance();
    const belts = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec), clearance);
    const spandrels = buildSpandrelBandPrimitives(spec, { clearance });
    expect(belts).toHaveLength(clearance.floorBands.length * 2);
    expect(spandrels).toHaveLength(clearance.floorBands.length * 3);
    clearance.floorBands.forEach((band, index) => {
      const splitYM = band.minYM + (band.maxYM - band.minYM) * 0.4;
      const belt = belts.slice(index * 2, index * 2 + 2);
      const spandrel = spandrels.slice(index * 3, index * 3 + 3);
      expectInsideBand(belt, { minYM: band.minYM, maxYM: splitYM - 0.01 });
      expectInsideBand(spandrel, { minYM: splitYM + 0.01, maxYM: band.maxYM });
      expect(Math.min(...spandrel.map((primitive) => primitive.bounds.min[1])) -
        Math.max(...belt.map((primitive) => primitive.bounds.max[1]))).toBeCloseTo(0.02, 8);
    });
    expectSoundGeometry([...belts, ...spandrels]);
  });

  it.each(["layered", "restrained"])("keeps intermediate systems subordinate to a narrow %s crown", (style) => {
    const spec = fixtureSpec();
    const clearance = { ...fixtureClearance(), crownBand: { minYM: 13.88, maxYM: 14 } };
    const frontZ = -spec.massing.depthM / 2;
    const crown = buildCorniceProfilePrimitives(spec,
      { ...buildCorniceRecipe(spec), profileRecipeId: `profile.cornice.late19c.${style}` }, clearance);
    const intermediate = [
      ...buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec), clearance),
      ...buildSpandrelBandPrimitives(spec, { clearance })
    ];
    expectInsideBand(crown, clearance.crownBand);
    expect(projection(intermediate, frontZ)).toBeLessThan(projection(crown, frontZ) * 0.4);
    expect(projection(crown, frontZ)).toBeLessThanOrEqual(0.12 * 1.25 + 1e-8);
    expectSoundGeometry([...crown, ...intermediate]);
  });

  it("omits unavailable or tiny bands without emitting degenerate primitives", () => {
    const spec = fixtureSpec();
    const corniceRecipe = buildCorniceRecipe(spec);
    const beltRecipe = buildProfiledHorizontalTrimRecipe(spec);
    for (const crownBand of [undefined, { minYM: 14, maxYM: 14 }, { minYM: 14, maxYM: 13 }, { minYM: 14, maxYM: 14.005 }]) {
      const clearance: FrontTrimClearance = { crownBand, floorBands: [] };
      expect(buildCorniceProfilePrimitives(spec, corniceRecipe, clearance)).toEqual([]);
      expect(buildHorizontalBeltCoursePrimitives(spec, beltRecipe, clearance)).toEqual([]);
      expect(buildSpandrelBandPrimitives(spec, { clearance })).toEqual([]);
    }
    const tinyFloor: FrontTrimClearance = { floorBands: [{ floorIndex: 0, boundaryYM: 4, minYM: 4, maxYM: 4.03 }] };
    expect(buildHorizontalBeltCoursePrimitives(spec, beltRecipe, tinyFloor)).toEqual([]);
    expect(buildSpandrelBandPrimitives(spec, { clearance: tinyFloor })).toEqual([]);
    const narrow: FrontTrimClearance = { crownBand: { minYM: 13.98, maxYM: 14 }, floorBands: [{ floorIndex: 0, boundaryYM: 4, minYM: 4, maxYM: 4.08 }] };
    const parts = [...buildCorniceProfilePrimitives(spec, corniceRecipe, narrow),
      ...buildHorizontalBeltCoursePrimitives(spec, beltRecipe, narrow), ...buildSpandrelBandPrimitives(spec, { clearance: narrow })];
    expect(parts.length).toBeGreaterThan(0);
    expectSoundGeometry(parts);
  });

  it("caps requested dimensions rather than filling a large blank band and retains immutable authored previews", () => {
    const spec = fixtureSpec();
    const recipe = buildCorniceRecipe(spec);
    const beltRecipe = buildProfiledHorizontalTrimRecipe(spec);
    const clearance: FrontTrimClearance = { crownBand: { minYM: 15, maxYM: 20 },
      floorBands: [{ floorIndex: 0, boundaryYM: 4, minYM: 3, maxYM: 7 }] };
    const before = structuredClone({ spec, recipe, beltRecipe, clearance, late19cCorniceProfile, late19cBeltProfile });
    const preview = buildCorniceProfilePrimitives(spec, recipe);
    const fitted = buildCorniceProfilePrimitives(spec, recipe, clearance);
    expect(fitted[0].bounds.max[1] - fitted[0].bounds.min[1]).toBeCloseTo(recipe.dimensionsM.height, 8);
    const belt = buildHorizontalBeltCoursePrimitives(spec, beltRecipe, clearance);
    expect(belt[0].bounds.max[1] - belt[0].bounds.min[1]).toBeCloseTo(beltRecipe.dimensionsM.height * 1.15, 8);
    const spandrel = buildSpandrelBandPrimitives(spec, { clearance });
    expect(spandrel[0].bounds.max[1] - spandrel[0].bounds.min[1]).toBeCloseTo(0.72, 8);
    expect({ spec, recipe, beltRecipe, clearance, late19cCorniceProfile, late19cBeltProfile }).toEqual(before);
    expect(buildCorniceProfilePrimitives(spec, recipe)).toEqual(preview);
    expect(buildCorniceProfilePrimitives(spec, recipe, clearance)).toEqual(fitted);
  });

  it("rejects nonfinite fit envelopes before geometry emission", () => {
    const spec = fixtureSpec();
    const clearance: FrontTrimClearance = { crownBand: { minYM: Number.NaN, maxYM: 14 }, floorBands: [] };
    expect(() => buildCorniceProfilePrimitives(spec, buildCorniceRecipe(spec), clearance)).toThrow(/finite/);
    const invalidFloor: FrontTrimClearance = { floorBands: [{ floorIndex: 0, boundaryYM: 4, minYM: 3.9, maxYM: Number.POSITIVE_INFINITY }] };
    expect(() => buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec), invalidFloor)).toThrow(/finite/);
    expect(() => buildSpandrelBandPrimitives(spec, { clearance: invalidFloor })).toThrow(/finite/);
  });
});
