import fixture from "../fixtures/legacy-v2.psg.json";
import { evaluatePsg } from "../core/evaluatePsg";
import { parsePsgDocument } from "../io/importPsg";

describe("evaluatePsg", () => {
  it("evaluates a PSG v2 graph with outputs, variables, and trace", () => {
    const document = parsePsgDocument(fixture);
    const result = evaluatePsg(document, { seed: "psg-seed" });

    expect(result.variables["building.floorCount"]).toBe(4);
    expect(result.variables["building.wallMaterial"]).toBe("brick-red");
    expect(result.outputs).toEqual([
      {
        nodeId: "output",
        value: "Commercial demo with brick-red walls"
      }
    ]);
    expect(result.trace.map((entry) => entry.nodeId)).toContain("wallChoice");
    expect(result.trace.find((entry) => entry.nodeId === "wallChoice")).toMatchObject({
      nodeType: "WeightedChoice",
      semanticPath: "building/wall-material",
      selectedChoiceIndex: 0
    });
  });
});

