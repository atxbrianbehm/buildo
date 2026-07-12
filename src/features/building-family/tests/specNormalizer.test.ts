import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { canonicalJson } from "../core/canonicalJson";
import type { BuildingIntent } from "../contracts/buildingIntent";

const baseIntent: BuildingIntent = {
  schemaVersion: "0.1.0",
  prompt: "four floor brick commercial block",
  stylePackId: "late-19c-commercial-demo",
  requested: {
    floorCount: 4,
    bayCount: 7,
    wallMaterial: "brick-red",
    roofType: "flat",
    trimDensity: "ornate",
    windowFamily: "tall-arched",
    corniceFamily: "bracketed-metal"
  },
  seeds: { family: "fam", building: "bldg-a", material: "mat", trim: "trim" },
  locks: [],
  psg: { evaluatedVariables: {}, traceId: "trace" }
};

describe("normalizeBuildingSpec", () => {
  it("produces byte-equivalent canonical specs for the same seed and input", async () => {
    const first = await normalizeBuildingSpec(baseIntent, stylePack);
    const second = await normalizeBuildingSpec(baseIntent, stylePack);

    expect(canonicalJson(first.spec)).toBe(canonicalJson(second.spec));
    expect(first.spec.diagnostics).toHaveLength(0);
  });

  it("keeps family-scoped fields stable when only the building seed changes", async () => {
    const first = await normalizeBuildingSpec(baseIntent, stylePack);
    const second = await normalizeBuildingSpec(
      {
        ...baseIntent,
        seeds: { ...baseIntent.seeds, building: "bldg-b" }
      },
      stylePack
    );

    expect(second.spec.familyId).toBe(first.spec.familyId);
    expect(second.spec.materialParameters).toEqual(first.spec.materialParameters);
    expect(second.spec.selectedFamilies.wall).toBe(first.spec.selectedFamilies.wall);
    expect(second.spec.massing.floorCount).toBe(first.spec.massing.floorCount);
    // Building seed is allowed to change composition (bays/depth/window family).
    expect(second.spec.componentParameters.windowJitterSeed).not.toBe(
      first.spec.componentParameters.windowJitterSeed
    );
    const sameComposition =
      second.spec.facade.frontBayCount === first.spec.facade.frontBayCount &&
      second.spec.massing.depthM === first.spec.massing.depthM &&
      second.spec.selectedFamilies.window === first.spec.selectedFamilies.window;
    expect(sameComposition).toBe(false);
  });

  it("normalizes invalid combinations with diagnostics instead of silently accepting them", async () => {
    const result = await normalizeBuildingSpec(
      {
        ...baseIntent,
        requested: {
          ...baseIntent.requested,
          floorCount: 15,
          bayCount: 2,
          wallMaterial: "painted-stucco",
          roofType: "gable"
        }
      },
      stylePack
    );

    expect(result.spec.massing.floorCount).toBe(8);
    expect(result.spec.facade.frontBayCount).toBe(3);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "spec.clamped", path: "requested.floorCount" }),
        expect.objectContaining({ code: "spec.clamped", path: "requested.bayCount" }),
        expect.objectContaining({ code: "spec.incompatibleCombination" })
      ])
    );
  });
});

