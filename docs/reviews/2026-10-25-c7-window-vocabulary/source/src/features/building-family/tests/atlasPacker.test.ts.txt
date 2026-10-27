import { planAtlas } from "../materials/atlasPlanner";
import { packAtlas } from "../materials/atlasPacker";
import { normalFromHeight } from "../materials/normalFromHeight";
import { blendPeriodicEdges } from "../materials/periodicBlend";
import { FixtureMaterialProvider } from "../materials/providers/fixtureMaterialProvider";
import type { MaterialSourceArtifact, MaterialSourceRequest, PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixturePlan() {
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
  return planAtlas(spec, { widthPx: 96, heightPx: 96, paddingPx: 4 });
}

async function fixtureArtifacts(): Promise<{
  plan: Awaited<ReturnType<typeof planAtlas>>;
  artifacts: MaterialSourceArtifact[];
}> {
  const plan = await fixturePlan();
  const provider = new FixtureMaterialProvider();
  const artifacts = await Promise.all(
    plan.materialSources.map((source) =>
      provider.generate(
        {
          ...source,
          widthPx: 8,
          heightPx: 8
        } satisfies MaterialSourceRequest,
        new AbortController().signal
      )
    )
  );
  return { plan, artifacts };
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const index = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(index, index + 4));
}

function makeSolidLayer(value: number, widthPx = 4, heightPx = 4): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { widthPx, heightPx, channels: "rgba8", data };
}

describe("AtlasPacker", () => {
  it("composites fixture material sources into deterministic atlas channels", async () => {
    const { plan, artifacts } = await fixtureArtifacts();
    const first = await packAtlas(plan, artifacts);
    const second = await packAtlas(plan, artifacts);

    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.manifest).toEqual(plan.manifest);
    expect(first.diagnostics).toEqual([]);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.slotProvenance).toHaveLength(plan.manifest.slots.length);
    expect(first.slotProvenance.map((entry) => entry.slotId)).toEqual(plan.manifest.slots.map((slot) => slot.id));

    for (const channel of Object.values(first.channels)) {
      expect(channel.widthPx).toBe(plan.manifest.widthPx);
      expect(channel.heightPx).toBe(plan.manifest.heightPx);
      expect(channel.data.byteLength).toBe(plan.manifest.widthPx * plan.manifest.heightPx * 4);
    }

    expect(first.channels.baseColor.data).toEqual(second.channels.baseColor.data);
    expect(first.channels.normal.data).toEqual(second.channels.normal.data);
    expect(first.channels.orm.data).toEqual(second.channels.orm.data);
  });

  it("dilates slot edge pixels into atlas padding", async () => {
    const { plan, artifacts } = await fixtureArtifacts();
    const packed = await packAtlas(plan, artifacts);
    const slot = plan.manifest.slots[0];
    const sampleY = slot.rectPx.y + 3;
    const sampleX = slot.rectPx.x + 3;

    expect(pixel(packed.channels.baseColor, slot.rectPx.x - 1, sampleY)).toEqual(
      pixel(packed.channels.baseColor, slot.rectPx.x, sampleY)
    );
    expect(pixel(packed.channels.baseColor, sampleX, slot.rectPx.y - 1)).toEqual(
      pixel(packed.channels.baseColor, sampleX, slot.rectPx.y)
    );
    expect(pixel(packed.channels.height, slot.rectPx.x - 1, sampleY)).toEqual(
      pixel(packed.channels.height, slot.rectPx.x, sampleY)
    );
  });

  it("reports missing source artifacts instead of silently packing an incomplete atlas", async () => {
    const { plan, artifacts } = await fixtureArtifacts();
    const packed = await packAtlas(plan, artifacts.slice(1));

    expect(packed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "atlasPacker.missingMaterialSource",
        severity: "error",
        received: plan.manifest.slots[0].materialSourceId
      })
    );
  });

  it("derives neutral normals from flat height and can blend periodic layer edges", () => {
    const flatNormal = normalFromHeight(makeSolidLayer(128));
    expect(flatNormal.widthPx).toBe(4);
    expect(flatNormal.heightPx).toBe(4);
    expect(pixel(flatNormal, 1, 1)).toEqual([128, 128, 255, 255]);

    const periodic = makeSolidLayer(0, 4, 2);
    for (let y = 0; y < periodic.heightPx; y += 1) {
      const right = (y * periodic.widthPx + periodic.widthPx - 1) * 4;
      periodic.data[right] = 200;
      periodic.data[right + 1] = 40;
      periodic.data[right + 2] = 20;
    }

    const blended = blendPeriodicEdges(periodic, "x");
    expect(pixel(blended, 0, 0)).toEqual(pixel(blended, blended.widthPx - 1, 0));
    expect(pixel(blended, 0, 1)).toEqual(pixel(blended, blended.widthPx - 1, 1));
  });
});
