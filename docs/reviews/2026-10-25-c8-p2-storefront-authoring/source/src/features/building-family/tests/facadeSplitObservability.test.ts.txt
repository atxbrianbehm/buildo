import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { buildFacadeSplitObservabilitySummary } from "../qa/facadeSplitObservability";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureInputs() {
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
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const atlasPlan = await planAtlas(spec);
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  return { spec, catalog };
}

describe("facadeSplitObservability", () => {
  it("exposes hash-stable split metrics for kit and proof modes", async () => {
    const { spec, catalog } = await fixtureInputs();

    const kit = await buildFacadeSplitObservabilitySummary({
      spec,
      catalog,
      fidelityMode: "kit"
    });
    const kit2 = await buildFacadeSplitObservabilitySummary({
      spec,
      catalog,
      fidelityMode: "kit"
    });
    const proof = await buildFacadeSplitObservabilitySummary({
      spec,
      catalog,
      fidelityMode: "proof"
    });

    expect(kit.contentHash).toBe(kit2.contentHash);
    expect(kit.openingCount).toBeGreaterThan(0);
    expect(kit.wallPieceCount).toBeGreaterThan(kit.scopeCount);
    expect(kit.storefrontScopeCount).toBe(spec.facade.frontBayCount);
    expect(proof.openingCount).toBe(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(proof.contentHash).not.toBe(kit.contentHash);
  });
});
