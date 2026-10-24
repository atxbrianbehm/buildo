import {
  buildFacadeBayScopes,
  expandBayWallPrimitives,
  type FacadeBayScope,
  type WallFacadeName
} from "../compiler/facadeWallSubdivision";
import type { PrimitiveGeometry } from "../compiler/primitiveGeometry";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-wall-split",
    sourceIntentHash: "intent-wall-split",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4.2, 3.2, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 5,
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

/** Intersect actual world triangles with an inward ray from the exterior face. */
function wallRayHits(
  scope: FacadeBayScope,
  pieces: PrimitiveGeometry[],
  alongM: number,
  yM: number
): number[] {
  const side = scope.facade === "left" || scope.facade === "right";
  const alongAxis = side ? 2 : 0;
  const depthAxis = side ? 0 : 2;
  const outwardSign = scope.facade === "front" || scope.facade === "left" ? -1 : 1;
  const outerDepth = scope.originM[depthAxis] + (outwardSign === 1 ? scope.sizeM[depthAxis] : 0);
  const rayDepth = outerDepth + outwardSign * 0.5;
  const hits: number[] = [];
  for (const piece of pieces) {
    for (let index = 0; index < piece.indices.length; index += 3) {
      const vertices = [0, 1, 2].map((offset) => {
        const vertex = piece.indices[index + offset] * 3;
        return [piece.positions[vertex + alongAxis], piece.positions[vertex + 1], piece.positions[vertex + depthAxis]];
      });
      const [a, b, c] = vertices;
      const determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      // Triangles parallel to this ray have no projected area.
      if (Math.abs(determinant) < 1e-10) continue;
      const u = ((b[1] - c[1]) * (alongM - c[0]) + (c[0] - b[0]) * (yM - c[1])) / determinant;
      const v = ((c[1] - a[1]) * (alongM - c[0]) + (a[0] - c[0]) * (yM - c[1])) / determinant;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-8) continue;
      const depth = u * a[2] + v * b[2] + w * c[2];
      const distance = (depth - rayDepth) * -outwardSign;
      if (distance >= 0) hits.push(distance);
    }
  }
  return hits;
}

describe("facadeWallSubdivision", () => {
  it("splits facades into floor×bay scopes with ground/body zones", () => {
    const spec = fixtureSpec();
    const scopes = buildFacadeBayScopes({ spec, wallDepthM: 0.34 });
    const front = scopes.filter((scope) => scope.facade === "front");
    expect(front).toHaveLength(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(front.every((scope) => scope.floorIndex === 0 || scope.zone === "body" || scope.zone === "ground")).toBe(
      true
    );
    expect(front.filter((scope) => scope.zone === "ground")).toHaveLength(spec.facade.frontBayCount);
    expect(front.some((scope) => scope.opening !== undefined)).toBe(true);
  });

  it("expands a bay with an opening into pier/sill/head pieces instead of one slab", () => {
    const scopes = buildFacadeBayScopes({
      spec: fixtureSpec(),
      wallDepthM: 0.34,
      openings: [{ facade: "front", floorIndex: 1, bayIndex: 2, widthM: 1.4, heightM: 2.2 }]
    });
    const target = scopes.find(
      (scope) => scope.facade === "front" && scope.floorIndex === 1 && scope.bayIndex === 2
    );
    expect(target?.opening).toBeDefined();
    const pieces = expandBayWallPrimitives(target!);
    // Left pier, right pier, sill and head provide full-depth perimeter returns.
    expect(pieces).toHaveLength(4);
    const solidBay = scopes.find(
      (scope) => scope.facade === "rear" && scope.floorIndex === 0 && scope.bayIndex === 0
    );
    expect(expandBayWallPrimitives(solidBay!).length).toBe(1);
  });

  it.each<[WallFacadeName, number, "window" | "door"]>([
    ["front", 0, "window"],
    ["front", 0, "door"],
    ["front", 1, "window"],
    ["rear", 0, "window"],
    ["rear", 1, "window"],
    ["left", 1, "window"],
    ["right", 1, "window"]
  ])("leaves the %s floor %i %s aperture clear while retaining structural wall extents", (facade, floorIndex, kind) => {
    const scopes = buildFacadeBayScopes({
      spec: fixtureSpec(),
      wallDepthM: 0.34,
      openings: [{ facade, floorIndex, bayIndex: 2, widthM: 1.4, heightM: 2.2, kind }],
      strictOpenings: true
    });
    const scope = scopes.find((entry) => entry.facade === facade && entry.floorIndex === floorIndex && entry.bayIndex === 2)!;
    const untouchedScope = structuredClone(scope);
    const pieces = expandBayWallPrimitives(scope);
    const opening = scope.opening!;

    // Inspect a grid inside the opening, beyond a single central ray or box count.
    for (const alongFraction of [-0.45, 0, 0.45]) {
      for (const upFraction of [-0.45, 0, 0.45]) {
        expect(wallRayHits(
          scope,
          pieces,
          opening.centerAlongM + opening.widthM * alongFraction,
          opening.centerYM + opening.heightM * upFraction
        )).toHaveLength(0);
      }
    }

    // The aperture repair must not shrink the wall bay, its depth or outer face.
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.min(...pieces.map((piece) => piece.bounds.min[axis]))).toBeCloseTo(scope.originM[axis], 8);
      expect(Math.max(...pieces.map((piece) => piece.bounds.max[axis]))).toBeCloseTo(scope.originM[axis] + scope.sizeM[axis], 8);
    }
    const alongAxis = facade === "left" || facade === "right" ? 2 : 0;
    const pierAlongM = (scope.originM[alongAxis] + opening.centerAlongM - opening.widthM / 2) / 2;
    expect(wallRayHits(scope, pieces, pierAlongM, opening.centerYM).length).toBeGreaterThan(0);
    const sillYM = scope.storefront?.bulkheadCenterYM ?? (scope.originM[1] + opening.centerYM - opening.heightM / 2) / 2;
    const headYM = scope.storefront?.lintelCenterYM ?? (scope.originM[1] + scope.sizeM[1] + opening.centerYM + opening.heightM / 2) / 2;
    expect(wallRayHits(scope, pieces, opening.centerAlongM, sillYM).length).toBeGreaterThan(0);
    expect(wallRayHits(scope, pieces, opening.centerAlongM, headYM).length).toBeGreaterThan(0);
    expect(scope).toEqual(untouchedScope);
    expect(expandBayWallPrimitives(scope)).toEqual(pieces);

    const solidNeighbor = scopes.find((entry) => entry.facade === facade && entry.floorIndex === floorIndex && entry.bayIndex === 1)!;
    expect(solidNeighbor.opening).toBeUndefined();
    expect(wallRayHits(
      solidNeighbor,
      expandBayWallPrimitives(solidNeighbor),
      solidNeighbor.originM[alongAxis] + solidNeighbor.sizeM[alongAxis] / 2,
      solidNeighbor.originM[1] + solidNeighbor.sizeM[1] / 2
    ).length).toBeGreaterThan(0);
  });
});
