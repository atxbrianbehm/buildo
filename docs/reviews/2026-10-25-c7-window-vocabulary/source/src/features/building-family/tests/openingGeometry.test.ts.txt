import { buildDoorRecipe, buildWindowFrameRecipe, buildWindowGlassRecipe } from "../components/openingAssemblyBuilder";
import {
  buildOpeningAssemblyGeometry,
  buildOpeningAssemblyPrimitives,
  openingAssemblyDepthExtent,
  openingGlassInsetFromExterior,
  openingTransomCenterY,
  openingTransomGlazingBand
} from "../compiler/openingGeometry";
import { bindOpeningToSlot, openingGlazingCenterZ } from "../compiler/openingSlotBinding";
import { buildBoxPrimitive, type PrimitiveGeometry } from "../compiler/primitiveGeometry";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(windowFamily = "tall-arched"): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-opening-geo",
    sourceIntentHash: "intent-opening-geo",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 28,
      depthM: 18,
      floorCount: 3,
      floorHeightsM: [4, 3, 3],
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
      window: windowFamily,
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

/** Intersect emitted triangles with an exterior ray pointing along local -Z. */
function firstExteriorHitZ(geometry: PrimitiveGeometry, x: number, y: number): number | undefined {
  let nearest: number | undefined;
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const a = geometry.indices[index]! * 3;
    const b = geometry.indices[index + 1]! * 3;
    const c = geometry.indices[index + 2]! * 3;
    const ax = geometry.positions[a]!;
    const ay = geometry.positions[a + 1]!;
    const bx = geometry.positions[b]!;
    const by = geometry.positions[b + 1]!;
    const cx = geometry.positions[c]!;
    const cy = geometry.positions[c + 1]!;
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-12) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
    const w = 1 - u - v;
    if (Math.min(u, v, w) < -1e-8) continue;
    const z = u * geometry.positions[a + 2]! + v * geometry.positions[b + 2]! + w * geometry.positions[c + 2]!;
    nearest = nearest === undefined ? z : Math.max(nearest, z);
  }
  return nearest;
}

describe("openingGeometry", () => {
  it("builds high-detail assemblies with measurable depth and glass inset", () => {
    const spec = fixtureSpec("tall-arched");
    const frame = buildWindowFrameRecipe(spec);
    const high = buildOpeningAssemblyPrimitives({ recipe: frame, detail: "high", part: "frame" });
    const low = buildOpeningAssemblyPrimitives({ recipe: frame, detail: "low", part: "frame" });
    const combined = buildOpeningAssemblyGeometry({ recipe: frame, detail: "high", part: "frame" });

    expect(high.length).toBeGreaterThan(low.length);
    expect(high.length).toBeGreaterThanOrEqual(14);
    // V3: total assembly depth and glass inset must read without forensic lighting.
    expect(openingAssemblyDepthExtent(frame, "high")).toBeGreaterThan(0.55);
    expect(openingGlassInsetFromExterior(frame)).toBeGreaterThan(0.2);
    // Glass sits deeper (−Z) than the proud exterior face (+Z casing/hood).
    const glass = buildOpeningAssemblyGeometry({
      recipe: buildWindowGlassRecipe(spec),
      detail: "high",
      part: "glass"
    });
    expect(glass.bounds.max[2]).toBeLessThan(combined.bounds.max[2] - 0.18);
    expect(combined.bounds.min[2]).toBeLessThan(-0.25);
    expect(combined.normals.every((value) => Number.isFinite(value))).toBe(true);
    expect(combined.indices.length % 3).toBe(0);
  });

  it("uses more crown primitives for arched families than rectangular ones", () => {
    const arched = buildOpeningAssemblyPrimitives({
      recipe: buildWindowFrameRecipe(fixtureSpec("tall-arched")),
      detail: "high",
      part: "frame",
      arched: true
    });
    const rect = buildOpeningAssemblyPrimitives({
      recipe: buildWindowFrameRecipe(fixtureSpec("tall-rectangular")),
      detail: "high",
      part: "frame",
      arched: false
    });
    expect(arched.length).toBeGreaterThan(rect.length);
  });

  it("builds glass planes as thin inset panels", () => {
    const glassRecipe = buildWindowGlassRecipe(fixtureSpec());
    const glass = buildOpeningAssemblyGeometry({ recipe: glassRecipe, detail: "high", part: "glass" });
    expect(glass.bounds.max[2] - glass.bounds.min[2]).toBeLessThan(0.05);
    expect((glass.bounds.max[2] + glass.bounds.min[2]) / 2).toBe(0);
  });

  it.each(["tall-arched", "tall-rectangular"])("leaves each central %s glazing cell clear at both detail levels", (family) => {
    const frameRecipe = buildWindowFrameRecipe(fixtureSpec(family));
    const pane = buildOpeningAssemblyGeometry({ recipe: frameRecipe, part: "glass" });
    const expectedFrontZ = openingGlazingCenterZ(frameRecipe.dimensionsM.depth) + 0.01;
    for (const detail of ["high", "low"] as const) {
      const frame = buildOpeningAssemblyGeometry({ recipe: frameRecipe, detail, part: "frame" });
      for (const xRatio of [-0.24, 0, 0.24]) {
        for (const yRatio of [-0.22, 0, 0.22]) {
          const x = frameRecipe.dimensionsM.width * xRatio;
          const y = frameRecipe.dimensionsM.height * yRatio;
          expect(firstExteriorHitZ(pane, x, y)).toBeCloseTo(expectedFrontZ, 6);
          // These cell interiors exclude intentional mullions and perimeter bars.
          // A solid throat or low-detail substitute would intersect every ray.
          expect(firstExteriorHitZ(frame, x, y)).toBeUndefined();
        }
      }
    }
  });

  it("keeps an upper door transom clear while retaining an opaque leaf below it", () => {
    const recipe = buildDoorRecipe(fixtureSpec());
    const glass = buildOpeningAssemblyGeometry({ recipe, part: "glass" });
    const transomY = openingTransomCenterY(recipe);
    const band = openingTransomGlazingBand(recipe);
    expect(glass.bounds.max[1] - glass.bounds.min[1]).toBeCloseTo(band.heightM, 6);
    const expectedFrontZ = openingGlazingCenterZ(recipe.dimensionsM.depth) + 0.01;
    for (const detail of ["high", "low"] as const) {
      const frame = buildOpeningAssemblyGeometry({ recipe, detail, part: "frame" });
      for (const xRatio of [-0.24, 0, 0.24]) {
        for (const yRatio of [-0.43, 0, 0.43]) {
          const x = recipe.dimensionsM.width * xRatio;
          const y = transomY + band.heightM * yRatio;
          expect(firstExteriorHitZ(glass, x, y)).toBeCloseTo(expectedFrontZ, 6);
          expect(firstExteriorHitZ(frame, x, y)).toBeUndefined();
        }
      }
      expect(firstExteriorHitZ(frame, recipe.dimensionsM.width * 0.13,
        -recipe.dimensionsM.height * 0.25)).toBeDefined();
    }
  });

  it.each([0, 0.02, 0.04, 0.08])("shows the lower door leaf before backing with a %s m pane", (paneThickness) => {
    const sourceRecipe = buildDoorRecipe(fixtureSpec());
    for (const leafInset of [0.12, 1]) {
      const recipe = { ...sourceRecipe, parameterRanges: { ...sourceRecipe.parameterRanges,
        leafInsetM: { min: leafInset, max: leafInset } } };
      const { width, height, depth } = recipe.dimensionsM;
      const binding = bindOpeningToSlot({
        placement: { facade: "rear", floorIndex: 0, bayIndex: 0, kind: "door",
          semanticPath: "door/leaf-probe", centerM: [0, 0, 0], sizeM: [width + 0.08, height + 0.08, 0.34] },
        wallDepthM: 0.34, recipeWidthM: width, recipeHeightM: height, recipeDepthM: depth,
        glazingThicknessM: paneThickness
      });
      const backing = buildBoxPrimitive({ center: binding.backingCenterM, size: binding.backingSizeM });
      for (const detail of ["high", "low"] as const) {
        const frame = buildOpeningAssemblyGeometry({ recipe, detail, part: "frame" });
        for (const xRatio of [-0.25, 0.13, 0.25]) {
          for (const yRatio of [-0.3, -0.1]) {
            const x = width * xRatio;
            const y = height * yRatio;
            const leafHit = firstExteriorHitZ(frame, x, y);
            const backingHit = firstExteriorHitZ(backing, x, y);
            expect(leafHit).toBeDefined();
            expect(backingHit).toBeDefined();
            expect(leafHit!).toBeGreaterThan(backingHit! + 0.001);
          }
        }
      }
    }
  });

  it("derives recess from the frame depth while standalone glass thickness remains independent", () => {
    const recipe = buildWindowFrameRecipe(fixtureSpec());
    const deeper = { ...recipe, dimensionsM: { ...recipe.dimensionsM, depth: recipe.dimensionsM.depth * 1.5 } };
    const shallowPane = buildOpeningAssemblyGeometry({ recipe, part: "glass" });
    const deeperPane = buildOpeningAssemblyGeometry({ recipe: deeper, part: "glass" });
    expect(shallowPane.bounds.max[2] - shallowPane.bounds.min[2]).toBeCloseTo(0.02, 6);
    expect(deeperPane.bounds.max[2] - deeperPane.bounds.min[2]).toBeCloseTo(0.02, 6);
    expect(deeperPane.bounds.max[2]).toBeLessThan(shallowPane.bounds.max[2]);
    expect(openingGlassInsetFromExterior(deeper)).toBeGreaterThan(openingGlassInsetFromExterior(recipe));
  });
});
