import {
  computeBuildingInvalidation,
  invalidatedArtifactsFor,
  type BuildingControlSnapshot
} from "../core/invalidation";

const baseline: BuildingControlSnapshot = {
  prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
  stylePackId: "late-19c-commercial-demo",
  seeds: {
    family: "family-seed",
    building: "building-seed",
    material: "material-seed",
    trim: "trim-seed"
  },
  floorCount: 4,
  bayCount: 7,
  roofType: "flat",
  trimDensity: "ornate",
  weathering: 0.35,
  lockedComponentKeys: []
};

describe("computeBuildingInvalidation", () => {
  it("treats floor-count changes as structural-only and reuses material artifacts", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline,
      floorCount: 5
    });

    expect(invalidation.changedControls).toEqual(["floorCount"]);
    expect(invalidation.materialGenerationRequired).toBe(false);
    expect(invalidation.reusableArtifacts).toMatchObject({
      materialSources: true,
      packedAtlas: true,
      componentCatalog: true
    });
    expect(invalidation.stageImpacts).toMatchObject({
      psgEvaluation: "none",
      normalizedSpec: "partial",
      atlasPlan: "none",
      materialSources: "none",
      packedAtlas: "none",
      componentCatalog: "none",
      buildingGraph: "full",
      runtimeBuildingIr: "full",
      gpuScene: "full"
    });
  });

  it("treats new-building seed changes as building-scoped reuse of atlas and catalog", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline,
      seeds: {
        ...baseline.seeds,
        building: "building-seed-2"
      }
    });

    expect(invalidation.changedControls).toEqual(["buildingSeed"]);
    expect(invalidation.materialGenerationRequired).toBe(false);
    expect(invalidation.reusableArtifacts).toMatchObject({
      materialSources: true,
      packedAtlas: true,
      componentCatalog: true
    });
    expect(invalidation.stageImpacts).toMatchObject({
      materialSources: "none",
      packedAtlas: "none",
      componentCatalog: "none",
      buildingGraph: "full",
      runtimeBuildingIr: "full",
      gpuScene: "full"
    });
  });

  it("treats new-family seed changes as a full family artifact chain", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline,
      seeds: {
        ...baseline.seeds,
        family: "family-seed-2"
      }
    });

    expect(invalidation.changedControls).toEqual(["familySeed"]);
    expect(invalidation.materialGenerationRequired).toBe(true);
    expect(invalidation.reusableArtifacts).toMatchObject({
      materialSources: false,
      packedAtlas: false,
      componentCatalog: false
    });
    expect(Object.values(invalidation.stageImpacts)).toEqual([
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "full",
      "full"
    ]);
  });

  it("keeps material-seed invalidation out of graph and geometry work", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline,
      seeds: {
        ...baseline.seeds,
        material: "material-seed-2"
      }
    });

    expect(invalidation.changedControls).toEqual(["materialSeed"]);
    expect(invalidation.materialGenerationRequired).toBe(true);
    expect(invalidation.stageImpacts).toMatchObject({
      normalizedSpec: "partial",
      atlasPlan: "none",
      materialSources: "full",
      packedAtlas: "full",
      componentCatalog: "none",
      buildingGraph: "none",
      runtimeBuildingIr: "none",
      gpuScene: "materialRefresh"
    });
  });

  it("reports no invalidated stages when controls are unchanged", () => {
    const invalidation = computeBuildingInvalidation(baseline, baseline);

    expect(invalidation.changedControls).toEqual([]);
    expect(invalidation.invalidatedStages).toEqual([]);
    expect(invalidation.materialGenerationRequired).toBe(false);
  });
});

describe("invalidatedArtifactsFor", () => {
  it("preserves the legacy structural artifact summary for floor-count controls", () => {
    expect(invalidatedArtifactsFor("floorCount")).toEqual(["spec", "graph", "geometry"]);
  });
});
