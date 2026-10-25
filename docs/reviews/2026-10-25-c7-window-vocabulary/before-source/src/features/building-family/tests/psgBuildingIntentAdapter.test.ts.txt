import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";

describe("PsgBuildingIntentAdapter", () => {
  it("ignores unknown namespaced variables with diagnostics", () => {
    const result = adaptPsgEvaluationToBuildingIntent({
      prompt: "brick commercial building",
      seeds: { family: "fam", building: "bldg", material: "mat", trim: "trim" },
      evaluation: {
        outputs: [],
        variables: {
          "building.floorCount": 4,
          "building.unknownThing": "ignored"
        },
        trace: []
      }
    });

    expect(result.intent.requested.floorCount).toBe(4);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "psg.unknownBuildingVariable",
        path: "building.unknownThing",
        severity: "warning"
      })
    );
  });

  it("rejects invalid known variables with allowed values", () => {
    expect(() =>
      adaptPsgEvaluationToBuildingIntent({
        prompt: "bad trim building",
        seeds: { family: "fam", building: "bldg", material: "mat", trim: "trim" },
        evaluation: {
          outputs: [],
          variables: {
            "building.trimDensity": "maximal"
          },
          trace: []
        }
      })
    ).toThrow(/building.trimDensity.*restrained.*moderate.*ornate/);
  });
});

