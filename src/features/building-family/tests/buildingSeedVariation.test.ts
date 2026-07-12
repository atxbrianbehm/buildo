import stylePack from "../style-packs/late-19c-commercial-demo.json";
import {
  buildingCompositionKey,
  withBuildingSeedVariation
} from "../core/buildingSeedVariation";
import { normalizeBuildingSpec } from "../core/specNormalizer";
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
  seeds: { family: "fam", building: "building-seed", material: "mat", trim: "trim" },
  locks: [],
  psg: { evaluatedVariables: {}, traceId: "trace" }
};

describe("buildingSeedVariation", () => {
  it("keeps family identity stable while changing building composition", async () => {
    const base = await normalizeBuildingSpec(baseIntent, stylePack);
    const alt = withBuildingSeedVariation(base.spec, "building-seed-variant-07", stylePack);

    expect(alt.familyId).toBe(base.spec.familyId);
    expect(alt.seeds.material).toBe(base.spec.seeds.material);
    expect(alt.seeds.building).toBe("building-seed-variant-07");
    expect(buildingCompositionKey(alt)).not.toBe(buildingCompositionKey(base.spec));
  });

  it("produces multiple distinct compositions across sample building seeds", async () => {
    const base = await normalizeBuildingSpec(baseIntent, stylePack);
    const keys = new Set<string>();
    for (let index = 0; index < 16; index += 1) {
      const buildingSeed =
        index === 0 ? "building-seed" : `building-seed-variant-${index.toString().padStart(2, "0")}`;
      const variant = withBuildingSeedVariation(base.spec, buildingSeed, stylePack);
      keys.add(buildingCompositionKey(variant));
    }
    // Building seeds must not collapse to one or two near-clone massings.
    expect(keys.size).toBeGreaterThanOrEqual(6);
  });
});
