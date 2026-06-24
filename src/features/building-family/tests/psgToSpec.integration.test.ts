import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

describe("PSG to BuildingFamilySpec integration", () => {
  it("resolves fixture PSG and prompt into a validated spec plus trace", async () => {
    const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
    const promptResult = await new LocalRulePromptInterpreter().interpret({
      prompt: "four floors, 7 bays, brick, flat roof, ornate trim"
    });

    const adapted = adaptPsgEvaluationToBuildingIntent({
      prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
      seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
      evaluation,
      promptOverrides: promptResult.overrides
    });

    const normalized = await normalizeBuildingSpec(adapted.intent, stylePack);

    expect(evaluation.trace.length).toBeGreaterThan(0);
    expect(normalized.spec.schemaVersion).toBe("0.1.0");
    expect(normalized.spec.stylePackId).toBe("late-19c-commercial-demo");
    expect(normalized.spec.massing.floorCount).toBe(4);
    expect(normalized.spec.facade.frontBayCount).toBe(7);
    expect(normalized.spec.selectedFamilies.wall).toBe("brick-red");
    expect(normalized.spec.diagnostics).toEqual([]);
  });
});
