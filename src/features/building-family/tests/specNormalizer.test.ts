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

  it("makes ground floor clearly taller than typical floors for commercial base (V1)", async () => {
    const { spec } = await normalizeBuildingSpec(baseIntent, stylePack);
    const ground = spec.massing.floorHeightsM[0]!;
    const typical = spec.massing.floorHeightsM[1]!;
    expect(ground).toBeGreaterThanOrEqual(5.2);
    expect(typical).toBeLessThanOrEqual(3.8);
    expect(ground / typical).toBeGreaterThanOrEqual(1.45);
    const total = spec.massing.floorHeightsM.reduce((sum, h) => sum + h, 0);
    expect(spec.facade.groundFloorRatio).toBeCloseTo(ground / total, 3);
  });

  it("preserves explicitly requested bays across building seeds", async () => {
    for (const building of ["building-seed", "bldg-a", "bldg-b", "building-seed-variant-07"]) {
      const { spec } = await normalizeBuildingSpec(
        { ...baseIntent, seeds: { ...baseIntent.seeds, building } },
        stylePack
      );

      expect(spec.facade.frontBayCount).toBe(7);
      expect(spec.componentParameters.buildingBayDelta).toBe(0);
    }
  });

  it("keeps clamped bay requests at the diagnosed boundary across seeds", async () => {
    for (const [bayCount, expected] of [[2, 3], [99, 10]]) {
      for (const building of ["building-seed", "bldg-b"]) {
        const { spec, diagnostics } = await normalizeBuildingSpec(
          {
            ...baseIntent,
            requested: { ...baseIntent.requested, bayCount },
            seeds: { ...baseIntent.seeds, building }
          },
          stylePack
        );

        expect(spec.facade.frontBayCount).toBe(expected);
        expect(diagnostics).toContainEqual(expect.objectContaining({
          code: "spec.clamped",
          path: "requested.bayCount",
          received: bayCount,
          allowedValues: [3, 10]
        }));
      }
    }
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
    expect(second.spec.facade.frontBayCount).toBe(7);
    // Explicit bays stay fixed; depth/window family/rhythm can still vary.
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



describe("R2.P8.1 stable roof family namespace", () => {
  // Captured from the frozen pre-edit pure normalizer; deliberately a static receipt.
  const legacyFlat = {
  "input": {
    "intent": {
      "schemaVersion": "0.1.0",
      "prompt": "four floor brick commercial block",
      "stylePackId": "late-19c-commercial-demo",
      "requested": {
        "floorCount": 4,
        "bayCount": 7,
        "wallMaterial": "brick-red",
        "roofType": "flat",
        "trimDensity": "ornate",
        "windowFamily": "tall-arched",
        "corniceFamily": "bracketed-metal"
      },
      "seeds": {
        "family": "fam",
        "building": "bldg-a",
        "material": "mat",
        "trim": "trim"
      },
      "locks": [],
      "psg": {
        "evaluatedVariables": {},
        "traceId": "trace"
      }
    },
    "stylePack": {
      "schemaVersion": "0.1.0",
      "id": "late-19c-commercial-demo",
      "label": "Late 19th Century Commercial Demo",
      "region": "North American downtown demo",
      "dateRange": {
        "startYear": 1870,
        "endYear": 1905
      },
      "typologies": [
        "commercial block",
        "main street storefront"
      ],
      "curation": {
        "status": "demo",
        "author": "Buildo scaffold",
        "reviewer": null,
        "notes": "Demo-only proportions and compatibility rules. Not historically authoritative.",
        "references": []
      },
      "massing": {
        "floorCount": {
          "min": 2,
          "max": 8
        },
        "floorHeightM": {
          "ground": 5.6,
          "typical": {
            "min": 3.4,
            "max": 3.7
          }
        },
        "widthM": {
          "min": 12,
          "max": 42
        },
        "depthM": {
          "min": 12,
          "max": 28
        },
        "parapetHeightM": {
          "min": 0.8,
          "max": 1.4
        },
        "roofTypes": [
          "flat",
          "gable"
        ]
      },
      "facade": {
        "frontBayCount": {
          "min": 3,
          "max": 10
        },
        "sideBaySpacingM": {
          "min": 3.6,
          "max": 4.8
        },
        "groundFloorRatio": {
          "min": 0.3,
          "max": 0.42
        },
        "corniceHeightM": {
          "min": 1.15,
          "max": 1.85
        },
        "symmetry": {
          "min": 0.6,
          "max": 1
        }
      },
      "componentFamilies": {
        "windows": [
          "tall-arched",
          "tall-rectangular"
        ],
        "doors": [
          "recessed-storefront"
        ],
        "trims": [
          "pressed-metal",
          "simple-stone"
        ],
        "roofs": [
          "flat-membrane",
          "simple-gable"
        ],
        "pilasters": [
          "brick-pilaster"
        ],
        "cornices": [
          "bracketed-metal",
          "simple-stepped"
        ],
        "walls": [
          "brick-red",
          "painted-stucco"
        ],
        "ornaments": [
          "shallow-floral-mask"
        ]
      },
      "compatibility": {
        "forbidden": [
          {
            "when": {
              "wallMaterial": "painted-stucco",
              "roofType": "gable"
            },
            "reason": "The demo pack keeps painted stucco storefronts on flat roof massing for the MVP."
          }
        ]
      },
      "materialPalette": {
        "wall": [
          {
            "id": "brick-red",
            "weight": 4
          },
          {
            "id": "painted-stucco",
            "weight": 1
          }
        ],
        "roof": [
          {
            "id": "flat-membrane",
            "weight": 4
          },
          {
            "id": "simple-gable",
            "weight": 1
          }
        ],
        "frame": [
          {
            "id": "painted-metal-dark",
            "weight": 3
          },
          {
            "id": "painted-wood-cream",
            "weight": 1
          }
        ],
        "glass": [
          {
            "id": "slightly-wavy-green",
            "weight": 1
          }
        ],
        "door": [
          {
            "id": "painted-wood-door",
            "weight": 1
          }
        ]
      },
      "distributions": {
        "trimDensity": [
          {
            "id": "restrained",
            "weight": 1
          },
          {
            "id": "moderate",
            "weight": 3
          },
          {
            "id": "ornate",
            "weight": 2
          }
        ],
        "windowFamily": [
          {
            "id": "tall-arched",
            "weight": 3
          },
          {
            "id": "tall-rectangular",
            "weight": 2
          }
        ]
      },
      "materialPromptVocabulary": {
        "brick-red": [
          "running bond red brick",
          "aged mortar",
          "subtle soot"
        ],
        "painted-stucco": [
          "painted stucco",
          "hairline cracks",
          "weathered surface"
        ],
        "flat-membrane": [
          "dark flat roof membrane",
          "patched tar"
        ],
        "simple-gable": [
          "simple roof tile",
          "muted roof ridge"
        ]
      },
      "componentParameterRanges": {
        "tall-arched": {
          "widthM": {
            "min": 1.1,
            "max": 1.6
          },
          "heightM": {
            "min": 2.1,
            "max": 2.8
          }
        },
        "pressed-metal": {
          "depthM": {
            "min": 0.08,
            "max": 0.24
          }
        }
      },
      "variationPolicy": {
        "wall": "family",
        "roof": "family",
        "window": "building",
        "door": "building",
        "cornice": "family",
        "trim": "family",
        "pilaster": "building",
        "ornament": "element"
      },
      "defaults": {
        "floorCount": 4,
        "bayCount": 7,
        "wallMaterial": "brick-red",
        "roofType": "flat",
        "windowFamily": "tall-arched",
        "doorFamily": "recessed-storefront",
        "corniceFamily": "bracketed-metal",
        "trimFamily": "pressed-metal",
        "pilasterFamily": "brick-pilaster",
        "ornamentFamily": "shallow-floral-mask",
        "trimDensity": "moderate",
        "weathering": 0.25,
        "symmetry": 0.9
      }
    }
  },
  "result": {
    "spec": {
      "schemaVersion": "0.1.0",
      "familyId": "family-134cdf734be1a184",
      "sourceIntentHash": "e9606fecada2b6b719a3855baac0d69e550240e3fe7bdc2870a1f7dcedd328b2",
      "stylePackId": "late-19c-commercial-demo",
      "seeds": {
        "family": "fam",
        "building": "bldg-a",
        "material": "mat",
        "trim": "trim"
      },
      "massing": {
        "widthM": 28.729,
        "depthM": 17,
        "floorCount": 4,
        "floorHeightsM": [
          5.6,
          3.547,
          3.547,
          3.547
        ],
        "parapetHeightM": 1.019,
        "roof": {
          "type": "flat"
        }
      },
      "facade": {
        "frontBayCount": 7,
        "sideBaySpacingM": 4.283,
        "groundFloorRatio": 0.3448,
        "corniceHeightM": 1.85,
        "symmetry": 0.87
      },
      "selectedFamilies": {
        "wall": "brick-red",
        "roof": "flat-membrane",
        "window": "tall-arched",
        "door": "recessed-storefront",
        "cornice": "bracketed-metal",
        "trim": "pressed-metal",
        "pilaster": "brick-pilaster",
        "ornament": "shallow-floral-mask"
      },
      "materialParameters": {
        "wallWeathering": 0.25,
        "materialSeed": 2499868787
      },
      "componentParameters": {
        "trimDensity": "ornate",
        "requestedBayCount": 7,
        "requestedFloorCount": 4,
        "windowJitterSeed": 1044931567,
        "bayRhythmSeed": 89769178,
        "buildingBayDelta": 0,
        "buildingDepthM": 17
      },
      "variationPolicy": {
        "wall": "family",
        "roof": "family",
        "window": "building",
        "door": "building",
        "cornice": "family",
        "trim": "family",
        "pilaster": "building",
        "ornament": "element"
      },
      "locks": [],
      "diagnostics": []
    },
    "diagnostics": []
  }
};

  it("preserves the complete legacy flat spec and deterministic input ownership", async () => {
    const input = structuredClone(legacyFlat.input);
    const before = canonicalJson(input);
    const first = await normalizeBuildingSpec(input.intent, input.stylePack);
    const second = await normalizeBuildingSpec(input.intent, input.stylePack);
    expect(canonicalJson(first.spec)).toBe(canonicalJson(legacyFlat.result.spec));
    expect(canonicalJson(second.spec)).toBe(canonicalJson(legacyFlat.result.spec));
    expect(first.diagnostics).toEqual(legacyFlat.result.diagnostics);
    expect(second.diagnostics).toEqual(legacyFlat.result.diagnostics);
    expect(canonicalJson(input)).toBe(before);
  });

  it("keeps the flat family namespace while recording a real gable roof and source receipt", async () => {
    const { hashCanonicalJson } = await import("../core/contentHash");
    const intent = { ...structuredClone(legacyFlat.input.intent), requested: { ...legacyFlat.input.intent.requested, roofType: "gable" } };
    const { spec, diagnostics } = await normalizeBuildingSpec(intent, legacyFlat.input.stylePack);
    expect(spec.massing.roof).toEqual({ type: "gable", pitchDegrees: 28 });
    expect(spec.selectedFamilies.roof).toBe("simple-gable");
    expect(spec.sourceIntentHash).toBe(await hashCanonicalJson(intent));
    expect(spec.sourceIntentHash).not.toBe(legacyFlat.result.spec.sourceIntentHash);
    expect(diagnostics).toEqual(legacyFlat.result.diagnostics);
    expect(spec.familyId).toBe(legacyFlat.result.spec.familyId);
    expect(canonicalJson({ ...spec, sourceIntentHash: legacyFlat.result.spec.sourceIntentHash,
      massing: { ...spec.massing, roof: legacyFlat.result.spec.massing.roof },
      selectedFamilies: { ...spec.selectedFamilies, roof: legacyFlat.result.spec.selectedFamilies.roof }
    })).toBe(canonicalJson(legacyFlat.result.spec));
  });

  it("retains the other existing family identity inputs", async () => {
    const original = legacyFlat.input.intent;
    const variants = [
      { ...structuredClone(original), seeds: { ...original.seeds, family: "different-family" } },
      { ...structuredClone(original), seeds: { ...original.seeds, material: "different-material" } },
      { ...structuredClone(original), seeds: { ...original.seeds, trim: "different-trim" } },
      { ...structuredClone(original), requested: { ...original.requested, floorCount: 5 } },
      { ...structuredClone(original), requested: { ...original.requested, bayCount: 8 } },
      { ...structuredClone(original), requested: { ...original.requested, trimDensity: "restrained" } }
    ];
    for (const intent of variants) {
      const { spec } = await normalizeBuildingSpec(intent, legacyFlat.input.stylePack);
      expect(spec.familyId).not.toBe(legacyFlat.result.spec.familyId);
      expect(spec.massing.roof.type).toBe("flat");
    }
  });
});
