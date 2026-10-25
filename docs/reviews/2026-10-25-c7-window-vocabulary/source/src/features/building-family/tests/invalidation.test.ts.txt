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


describe("R2.P6 structural trim material reuse", () => {
  it("keeps the complete trim-only impact chain structural while reusing material artifacts", () => {
    const invalidation = computeBuildingInvalidation(baseline, { ...baseline, trimDensity: "restrained" });
    expect(invalidation.changedControls).toEqual(["trimDensity"]);
    expect(invalidation.materialGenerationRequired).toBe(false);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
    expect(invalidation.stageImpacts).toEqual({
      psgEvaluation: "none", normalizedSpec: "partial", atlasPlan: "partial",
      materialSources: "none", packedAtlas: "none", componentCatalog: "trimOnly",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
    expect(invalidation.invalidatedStages).toEqual(["normalizedSpec", "atlasPlan", "componentCatalog", "buildingGraph", "runtimeBuildingIr", "gpuScene"]);
    expect(invalidatedArtifactsFor("trimDensity")).toEqual(["spec", "componentCatalog", "graph", "geometry"]);
  });

  it("still regenerates materials when a material-seed change is merged with trim density", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline, trimDensity: "restrained", seeds: { ...baseline.seeds, material: "p6-material-seed-positive" }
    });
    expect(invalidation.changedControls).toEqual(["materialSeed", "trimDensity"]);
    expect(invalidation.materialGenerationRequired).toBe(true);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: false, packedAtlas: false, componentCatalog: false });
    expect(invalidation.stageImpacts).toEqual({
      psgEvaluation: "none", normalizedSpec: "partial", atlasPlan: "partial",
      materialSources: "full", packedAtlas: "full", componentCatalog: "trimOnly",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
  });
});

describe("R2.P8 roof catalog invalidation", () => {
  it("refreshes the roof catalog and structural consumers while retaining accepted materials", () => {
    const invalidation = computeBuildingInvalidation(baseline, { ...baseline, roofType: "gable" });
    expect(invalidation.changedControls).toEqual(["roofType"]);
    expect(invalidation.materialGenerationRequired).toBe(false);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
    expect(invalidation.stageImpacts).toEqual({
      psgEvaluation: "none", normalizedSpec: "partial", atlasPlan: "none",
      materialSources: "none", packedAtlas: "none", componentCatalog: "full",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
    expect(invalidation.invalidatedStages).toEqual(["normalizedSpec", "componentCatalog", "buildingGraph", "runtimeBuildingIr", "gpuScene"]);
  });

  it("retains material regeneration when a material-seed change accompanies a roof change", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline, roofType: "gable", seeds: { ...baseline.seeds, material: "p8-roof-material-positive" }
    });
    expect(invalidation.changedControls).toEqual(["materialSeed", "roofType"]);
    expect(invalidation.materialGenerationRequired).toBe(true);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: false, packedAtlas: false, componentCatalog: false });
    expect(invalidation.stageImpacts).toMatchObject({
      materialSources: "full", packedAtlas: "full", componentCatalog: "full",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
  });
});


describe("R2.P10 bay-dependent catalog invalidation", () => {
  it.each([{ from: 6, to: 7 }, { from: 7, to: 6 }])("rebuilds width-dependent recipes for $from to $to bays without refreshing materials", ({ from, to }) => {
    const previous = { ...baseline, bayCount: from };
    const invalidation = computeBuildingInvalidation(previous, { ...previous, bayCount: to });
    expect(invalidation.changedControls).toEqual(["bayCount"]);
    expect(invalidation.materialGenerationRequired).toBe(false);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
    expect(invalidation.stageImpacts).toEqual({
      psgEvaluation: "none", normalizedSpec: "partial", atlasPlan: "none",
      materialSources: "none", packedAtlas: "none", componentCatalog: "full",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
    expect(invalidation.invalidatedStages).toEqual(["normalizedSpec", "componentCatalog", "buildingGraph", "runtimeBuildingIr", "gpuScene"]);
    expect(invalidatedArtifactsFor("bayCount")).toEqual(["spec", "componentCatalog", "graph", "geometry"]);
  });

  it("retains the material-generation path when bay count and material seed change together", () => {
    const invalidation = computeBuildingInvalidation(baseline, {
      ...baseline, bayCount: 6, seeds: { ...baseline.seeds, material: "p10-material-positive" }
    });
    expect(invalidation.changedControls).toEqual(["materialSeed", "bayCount"]);
    expect(invalidation.materialGenerationRequired).toBe(true);
    expect(invalidation.reusableArtifacts).toEqual({ materialSources: false, packedAtlas: false, componentCatalog: false });
    expect(invalidation.stageImpacts).toEqual({
      psgEvaluation: "none", normalizedSpec: "partial", atlasPlan: "none",
      materialSources: "full", packedAtlas: "full", componentCatalog: "full",
      buildingGraph: "full", runtimeBuildingIr: "full", gpuScene: "full"
    });
  });
});
