import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { planAtlas, validateAtlasPlan } from "../materials/atlasPlanner";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";

const requiredSlotIds = [
  "wall.primary",
  "wall.secondary",
  "roof.primary",
  "glass.primary",
  "frame.primary",
  "door.primary",
  "trim.horizontal.primary",
  "trim.horizontal.secondary",
  "trim.vertical.primary",
  "cornice.primary",
  "ornament.primary",
  "utility.mask"
];

async function fixtureSpec() {
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim"
  });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: "trim-seed"
    },
    evaluation,
    promptOverrides: promptResult.overrides
  });

  return (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
}

describe("AtlasPlanner", () => {
  it("produces a deterministic semantic manifest with the required initial slots", async () => {
    const spec = await fixtureSpec();
    const first = await planAtlas(spec, { widthPx: 1024, heightPx: 1024, paddingPx: 12 });
    const second = await planAtlas(spec, { widthPx: 1024, heightPx: 1024, paddingPx: 12 });

    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.schemaVersion).toBe("0.1.0");
    expect(first.manifest.channels).toEqual(["baseColor", "normal", "orm", "height", "opacity"]);
    expect(first.manifest.paddingPx).toBe(12);
    expect(first.manifest.slots.map((slot) => slot.id)).toEqual(requiredSlotIds);
    expect(first.diagnostics).toEqual([]);
  });

  it("validates slot bounds, overlap, padding, and source/profile references", async () => {
    const spec = await fixtureSpec();
    const plan = await planAtlas(spec);

    expect(validateAtlasPlan(plan)).toEqual([]);

    const overlapPlan = structuredClone(plan);
    overlapPlan.manifest.slots[1].rectPx = { ...overlapPlan.manifest.slots[0].rectPx };
    expect(validateAtlasPlan(overlapPlan)).toContainEqual(
      expect.objectContaining({ code: "atlas.slotOverlap" })
    );

    const outsidePlan = structuredClone(plan);
    outsidePlan.manifest.slots[0].rectPx.x = outsidePlan.manifest.widthPx;
    expect(validateAtlasPlan(outsidePlan)).toContainEqual(
      expect.objectContaining({ code: "atlas.slotOutOfBounds" })
    );

    const paddingPlan = structuredClone(plan);
    paddingPlan.manifest.slots[0].rectPx.x = 0;
    expect(validateAtlasPlan(paddingPlan)).toContainEqual(
      expect.objectContaining({ code: "atlas.paddingViolation" })
    );

    const missingSourcePlan = structuredClone(plan);
    missingSourcePlan.manifest.slots[0].materialSourceId = "missing.source";
    expect(validateAtlasPlan(missingSourcePlan)).toContainEqual(
      expect.objectContaining({ code: "atlas.unknownMaterialSource" })
    );

    const missingProfilePlan = structuredClone(plan);
    missingProfilePlan.manifest.slots[9].profileRecipeId = "missing.profile";
    expect(validateAtlasPlan(missingProfilePlan)).toContainEqual(
      expect.objectContaining({ code: "atlas.unknownProfileRecipe" })
    );
  });
});
