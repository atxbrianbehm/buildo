import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";

describe("LocalRulePromptInterpreter", () => {
  it("extracts local prompt overrides without remote providers", async () => {
    const interpreter = new LocalRulePromptInterpreter();
    const result = await interpreter.interpret({
      prompt: "Make a four story brick building with 7 bays, flat roof, ornate trim"
    });

    expect(result.overrides).toMatchObject({
      floorCount: 4,
      bayCount: 7,
      wallMaterial: "brick-red",
      roofType: "flat",
      trimDensity: "ornate"
    });
    expect(result.provider).toBe("local-rule");
  });
});

