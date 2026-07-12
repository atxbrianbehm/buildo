import { buildWindowFrameRecipe, buildWindowGlassRecipe } from "../components/openingAssemblyBuilder";
import {
  buildOpeningAssemblyGeometry,
  buildOpeningAssemblyPrimitives,
  openingAssemblyDepthExtent,
  openingGlassInsetFromExterior
} from "../compiler/openingGeometry";
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

describe("openingGeometry", () => {
  it("builds high-detail assemblies with measurable depth and glass inset", () => {
    const spec = fixtureSpec("tall-arched");
    const frame = buildWindowFrameRecipe(spec);
    const high = buildOpeningAssemblyPrimitives({ recipe: frame, detail: "high", part: "frame" });
    const low = buildOpeningAssemblyPrimitives({ recipe: frame, detail: "low", part: "frame" });
    const combined = buildOpeningAssemblyGeometry({ recipe: frame, detail: "high", part: "frame" });

    expect(high.length).toBeGreaterThan(low.length);
    expect(high.length).toBeGreaterThanOrEqual(12);
    expect(openingAssemblyDepthExtent(frame, "high")).toBeGreaterThan(0.28);
    expect(openingGlassInsetFromExterior(frame)).toBeGreaterThan(0.08);
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
  });
});
