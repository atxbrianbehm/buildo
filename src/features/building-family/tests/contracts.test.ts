import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { AtlasManifestSchema } from "../contracts/atlasManifest";
import { BuildingGraphSchema } from "../contracts/buildingGraph";
import { BuildingIntentSchema } from "../contracts/buildingIntent";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import { GenerationRunSchema } from "../contracts/generationRun";
import { HistoricalStylePackSchema } from "../contracts/historicalStylePack";
import { RuntimeBuildingIRSchema } from "../contracts/runtimeBuildingIR";

describe("building-family contracts", () => {
  it("validates the demo style pack and representative serialized artifacts", () => {
    expect(HistoricalStylePackSchema.parse(stylePack).id).toBe("late-19c-commercial-demo");

    expect(() =>
      BuildingIntentSchema.parse({
        schemaVersion: "0.1.0",
        prompt: "four floor brick commercial block",
        requested: { floorCount: 4, trimDensity: "ornate" },
        seeds: { family: "fam", building: "bldg", material: "mat", trim: "trim" },
        locks: [],
        psg: { evaluatedVariables: {}, traceId: "trace" }
      })
    ).not.toThrow();

    expect(() =>
      BuildingFamilySpecSchema.parse({
        schemaVersion: "0.1.0",
        familyId: "family-hash",
        sourceIntentHash: "intent-hash",
        stylePackId: "late-19c-commercial-demo",
        seeds: { family: "fam", building: "bldg", material: "mat", trim: "trim" },
        massing: {
          widthM: 28,
          depthM: 18,
          floorCount: 4,
          floorHeightsM: [4.4, 3.8, 3.8, 3.8],
          parapetHeightM: 1.1,
          roof: { type: "flat" }
        },
        facade: {
          frontBayCount: 7,
          sideBaySpacingM: 4,
          groundFloorRatio: 0.26,
          corniceHeightM: 1.2,
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
        variationPolicy: { wall: "family", window: "building" },
        locks: [],
        diagnostics: []
      })
    ).not.toThrow();

    expect(() =>
      AtlasManifestSchema.parse({
        schemaVersion: "0.1.0",
        atlasId: "atlas",
        widthPx: 1024,
        heightPx: 1024,
        paddingPx: 12,
        channels: ["baseColor", "normal"],
        slots: []
      })
    ).not.toThrow();

    expect(() =>
      ComponentRecipeSchema.parse({
        schemaVersion: "0.1.0",
        id: "window.tall-arched",
        kind: "frame",
        role: "window",
        dimensionsM: { width: 1.4, height: 2.4, depth: 0.18 },
        parameterRanges: {},
        anchors: [],
        atlasSlotIds: ["glass.primary", "frame.primary"],
        uvBehavior: "stretch",
        variationScope: "building",
        lowDetailRecipeId: "window.tall-arched.low"
      })
    ).not.toThrow();

    expect(() =>
      BuildingGraphSchema.parse({
        schemaVersion: "0.1.0",
        graphId: "graph",
        nodes: [
          {
            id: "footprint",
            type: "CreateRectFootprint",
            parameters: {},
            upstreamIds: [],
            semanticPathTemplate: "building/{buildingId}",
            stage: "massing"
          }
        ],
        outputNodeId: "footprint"
      })
    ).not.toThrow();

    expect(() =>
      RuntimeBuildingIRSchema.parse({
        schemaVersion: "0.1.0",
        buildingId: "b-001",
        familyId: "family",
        sourceGraphHash: "hash",
        bounds: { min: [0, 0, 0], max: [1, 1, 1] },
        meshBatches: [],
        instanceBatches: [],
        semanticIndex: [],
        metrics: { vertexCount: 0, triangleCount: 0, instanceCount: 0 }
      })
    ).not.toThrow();

    expect(() =>
      GenerationRunSchema.parse({
        schemaVersion: "0.1.0",
        runId: "run",
        stage: "idle",
        events: []
      })
    ).not.toThrow();
  });
});

