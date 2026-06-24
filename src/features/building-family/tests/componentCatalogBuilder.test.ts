import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

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

describe("buildComponentCatalog", () => {
  it("builds a deterministic recipe catalog that validates against component contracts", async () => {
    const spec = await fixtureSpec();
    const plan = await planAtlas(spec);
    const first = await buildComponentCatalog(spec, plan.manifest);
    const second = await buildComponentCatalog(spec, plan.manifest);

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.catalogId).toMatch(/^catalog-/);
    expect(first.familyId).toBe(spec.familyId);
    expect(first.atlasId).toBe(plan.manifest.atlasId);
    expect(first.recipes.map((recipe) => recipe.id)).toEqual([
      "recipe.wall.panel.primary",
      "recipe.window.tall-arched.frame",
      "recipe.opening.window.recess",
      "recipe.door.recessed-storefront",
      "recipe.trim.pressed-metal.horizontal",
      "recipe.trim.pressed-metal.vertical",
      "recipe.cornice.bracketed-metal.primary",
      "recipe.roof.flat-membrane"
    ]);

    for (const recipe of first.recipes) {
      expect(ComponentRecipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.lowDetailRecipeId).toBeTruthy();
      expect(first.recipes.some((candidate) => candidate.id === recipe.lowDetailRecipeId)).toBe(true);
    }
  });

  it("keeps cornice profile geometry separate from atlas pixels", async () => {
    const spec = await fixtureSpec();
    const plan = await planAtlas(spec);
    const catalog = await buildComponentCatalog(spec, plan.manifest);
    const cornice = catalog.recipes.find((recipe) => recipe.role === "cornice") as
      | (typeof catalog.recipes)[number] & { profileRecipeId?: string }
      | undefined;

    expect(cornice).toBeDefined();
    expect(cornice?.kind).toBe("profileSweep");
    expect(cornice?.atlasSlotIds).toEqual(["cornice.primary"]);
    expect(cornice?.profileRecipeId).toBe("profile.cornice.bracketed-metal.primary");
    expect(cornice?.variationScope).toBe("family");
  });

  it("maps recipe dimensions and variation scopes from the normalized spec", async () => {
    const spec = await fixtureSpec();
    const plan = await planAtlas(spec);
    const catalog = await buildComponentCatalog(spec, plan.manifest);
    const wall = catalog.recipes.find((recipe) => recipe.id === "recipe.wall.panel.primary");
    const windowFrame = catalog.recipes.find((recipe) => recipe.role === "window");
    const roof = catalog.recipes.find((recipe) => recipe.role === "roof");

    expect(wall?.dimensionsM.width).toBeCloseTo(spec.massing.widthM / spec.facade.frontBayCount, 5);
    expect(wall?.dimensionsM.height).toBeCloseTo(spec.massing.floorHeightsM[1] ?? spec.massing.floorHeightsM[0], 5);
    expect(wall?.atlasSlotIds).toEqual(["wall.primary"]);
    expect(wall?.variationScope).toBe("family");
    expect(windowFrame?.atlasSlotIds).toEqual(["glass.primary", "frame.primary"]);
    expect(windowFrame?.variationScope).toBe("building");
    expect(roof?.kind).toBe("flatRoof");
    expect(roof?.atlasSlotIds).toEqual(["roof.primary"]);
  });
});
