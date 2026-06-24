import { planAtlas } from "../materials/atlasPlanner";
import {
  ProceduralMaterialProvider,
  type MaterialSourceRequest,
  type PixelLayer
} from "../materials/providers/proceduralMaterialProvider";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureRequests() {
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
  const plan = await planAtlas(spec, { widthPx: 1024, heightPx: 1024, paddingPx: 12 });

  return plan.materialSources.map(
    (source): MaterialSourceRequest => ({
      ...source,
      widthPx: 32,
      heightPx: 32
    })
  );
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const index = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(index, index + 4));
}

describe("ProceduralMaterialProvider", () => {
  it("generates deterministic source layers with request and content hashes", async () => {
    const provider = new ProceduralMaterialProvider();
    const [wallRequest] = await fixtureRequests();
    const first = await provider.generate(wallRequest, new AbortController().signal);
    const second = await provider.generate(wallRequest, new AbortController().signal);

    expect(first.providerId).toBe("procedural");
    expect(first.requestHash).toBe(second.requestHash);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.layers.baseColor.data).toEqual(second.layers.baseColor.data);
    expect(first.layers.height).toBeDefined();
    expect(first.layers.roughness).toBeDefined();
    expect(first.provenance.seedPath).toBe(wallRequest.seedPath);
  });

  it("generates all planned demo source families without returning a complete atlas", async () => {
    const provider = new ProceduralMaterialProvider();
    const requests = await fixtureRequests();
    const artifacts = await Promise.all(
      requests.map((request) => provider.generate(request, new AbortController().signal))
    );

    expect(artifacts).toHaveLength(12);
    expect(artifacts.map((artifact) => artifact.sourceId)).toEqual(
      requests.map((request) => request.sourceId)
    );
    expect(artifacts.every((artifact) => artifact.widthPx === 32 && artifact.heightPx === 32)).toBe(
      true
    );
    expect(new Set(artifacts.map((artifact) => artifact.contentHash)).size).toBeGreaterThan(6);
    expect(artifacts.some((artifact) => artifact.layers.opacity)).toBe(true);
  });

  it("matches periodic source edges for repeatable x and xy material sources", async () => {
    const provider = new ProceduralMaterialProvider();
    const requests = await fixtureRequests();
    const periodicRequests = requests.filter((request) => request.periodicity === "x" || request.periodicity === "xy");

    expect(periodicRequests.length).toBeGreaterThan(0);

    for (const request of periodicRequests) {
      const artifact = await provider.generate(request, new AbortController().signal);
      const baseColor = artifact.layers.baseColor;
      const height = artifact.layers.height;

      for (let y = 0; y < baseColor.heightPx; y += 1) {
        expect(pixel(baseColor, 0, y)).toEqual(pixel(baseColor, baseColor.widthPx - 1, y));
        if (height) {
          expect(pixel(height, 0, y)).toEqual(pixel(height, height.widthPx - 1, y));
        }
      }

      if (request.periodicity === "xy") {
        for (let x = 0; x < baseColor.widthPx; x += 1) {
          expect(pixel(baseColor, x, 0)).toEqual(pixel(baseColor, x, baseColor.heightPx - 1));
          if (height) {
            expect(pixel(height, x, 0)).toEqual(pixel(height, x, height.heightPx - 1));
          }
        }
      }
    }
  });

  it("changes content hash when the seed path changes and honors cancellation", async () => {
    const provider = new ProceduralMaterialProvider();
    const [wallRequest] = await fixtureRequests();
    const first = await provider.generate(wallRequest, new AbortController().signal);
    const second = await provider.generate(
      { ...wallRequest, seedPath: `${wallRequest.seedPath}/variant` },
      new AbortController().signal
    );

    expect(second.requestHash).not.toBe(first.requestHash);
    expect(second.contentHash).not.toBe(first.contentHash);

    const controller = new AbortController();
    controller.abort();
    await expect(provider.generate(wallRequest, controller.signal)).rejects.toThrow(/aborted/i);
  });
});
