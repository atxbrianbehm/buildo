import { render, screen } from "@testing-library/react";
import { planAtlas } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { FixtureMaterialProvider } from "../materials/providers/fixtureMaterialProvider";
import type { MaterialSourceArtifact, MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { AtlasLab } from "../ui/AtlasLab";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function packedFixture(): Promise<PackedAtlas> {
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
  const plan = await planAtlas(spec, { widthPx: 96, heightPx: 96, paddingPx: 4 });
  const provider = new FixtureMaterialProvider();
  const artifacts: MaterialSourceArtifact[] = await Promise.all(
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
  return packAtlas(plan, artifacts);
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  const binary = globalThis.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

describe("atlas debug export", () => {
  it("creates deterministic PNG debug exports for every packed atlas channel", async () => {
    const packed = await packedFixture();
    const first = await createAtlasDebugExport(packed);
    const second = await createAtlasDebugExport(packed);

    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.atlasId).toBe(packed.atlasId);
    expect(first.sourceContentHash).toBe(packed.contentHash);
    expect(first.exportHash).toBe(second.exportHash);
    expect(first.channels.map((channel) => channel.name)).toEqual(["baseColor", "normal", "orm", "height", "opacity"]);
    expect(first.channels.every((channel) => channel.pngDataUrl.startsWith("data:image/png;base64,"))).toBe(true);
    expect(first.channels.every((channel) => channel.widthPx === 96 && channel.heightPx === 96)).toBe(true);

    const signature = Array.from(dataUrlBytes(first.channels[0].pngDataUrl).slice(0, 8));
    expect(signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new Set(first.channels.map((channel) => channel.channelHash)).size).toBe(5);
  });

  it("includes semantic slot overlays tied to packed slot provenance", async () => {
    const packed = await packedFixture();
    const debugExport = await createAtlasDebugExport(packed);

    expect(debugExport.slotOverlays).toHaveLength(packed.manifest.slots.length);
    expect(debugExport.slotOverlays[0]).toEqual(
      expect.objectContaining({
        slotId: packed.manifest.slots[0].id,
        sourceId: packed.manifest.slots[0].materialSourceId,
        role: packed.manifest.slots[0].role,
        rectPx: packed.manifest.slots[0].rectPx
      })
    );
    expect(debugExport.slotOverlays[0].contentHash).toBe(packed.slotProvenance[0].contentHash);
  });

  it("renders the Atlas Lab summary from the exported atlas channels and overlays", async () => {
    const packed = await packedFixture();
    const debugExport = await createAtlasDebugExport(packed);

    render(<AtlasLab packedAtlas={packed} debugExport={debugExport} />);

    expect(screen.getByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByText(packed.atlasId)).toBeInTheDocument();
    expect(screen.getByText(packed.contentHash)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toHaveAttribute(
      "src",
      debugExport.channels[0].pngDataUrl
    );
    expect(screen.getByText(packed.manifest.slots[0].id)).toBeInTheDocument();
    expect(screen.getByText(packed.slotProvenance[0].contentHash)).toBeInTheDocument();
  });
});
