import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding, type CompileBuildingInput } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { packAtlas } from "../materials/atlasPacker";
import { planAtlas, type AtlasPlan } from "../materials/atlasPlanner";
import {
  compositeRemoteMaterialOverlay,
  type RemoteMaterialOverlay
} from "../materials/remoteMaterialOverlay";
import { FixtureMaterialProvider } from "../materials/providers/fixtureMaterialProvider";
import type {
  MaterialSourceArtifact,
  MaterialSourceRequest,
  PixelLayer
} from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

function makeLayer(
  widthPx: number,
  heightPx: number,
  rgba: [number, number, number, number]
): PixelLayer {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { widthPx, heightPx, channels: "rgba8", data };
}

function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const index = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(index, index + 4));
}

function proceduralArtifact(): MaterialSourceArtifact {
  const widthPx = 2;
  const heightPx = 2;
  return {
    sourceId: "source.wall.primary",
    providerId: "procedural",
    widthPx,
    heightPx,
    layers: {
      baseColor: makeLayer(widthPx, heightPx, [100, 100, 100, 255]),
      height: makeLayer(widthPx, heightPx, [42, 42, 42, 255]),
      roughness: makeLayer(widthPx, heightPx, [123, 123, 123, 255]),
      metalness: makeLayer(widthPx, heightPx, [7, 7, 7, 255]),
      opacity: makeLayer(widthPx, heightPx, [201, 201, 201, 201])
    },
    requestHash: "procedural-request-hash",
    contentHash: "procedural-content-hash",
    provenance: {
      providerId: "procedural",
      seedPath: "atlas/source/wall.primary/brick",
      promptVocabulary: ["brick"],
      algorithm: "fixture-procedural"
    }
  };
}

function remoteOverlay(widthPx = 2, heightPx = 2): RemoteMaterialOverlay {
  return {
    sourceId: "source.wall.primary",
    providerId: "openai-image",
    widthPx,
    heightPx,
    layer: makeLayer(widthPx, heightPx, [200, 50, 0, 128]),
    requestHash: "remote-request-hash",
    contentHash: "remote-content-hash",
    revisedPrompt: "tileable brick patina overlay",
    provenance: {
      providerId: "openai-image",
      seedPath: "atlas/source/wall.primary/brick",
      promptVocabulary: ["brick", "patina"],
      algorithm: "test-remote-overlay"
    }
  };
}

async function fixturePipeline(): Promise<{
  plan: AtlasPlan;
  artifacts: MaterialSourceArtifact[];
  compilerInput: CompileBuildingInput;
}> {
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
  const catalog = await buildComponentCatalog(spec, plan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);

  return { plan, artifacts, compilerInput: { spec, catalog, graph } };
}

function serializableStructuralIr(ir: RuntimeBuildingIR) {
  return {
    sourceGraphHash: ir.sourceGraphHash,
    bounds: ir.bounds,
    metrics: ir.metrics,
    meshBatches: ir.meshBatches.map((batch) => ({
      ...batch,
      positions: Array.from(batch.positions ?? []),
      normals: Array.from(batch.normals ?? []),
      uvs: Array.from(batch.uvs ?? []),
      indices: Array.from(batch.indices ?? [])
    })),
    instanceBatches: ir.instanceBatches.map((batch) => ({
      ...batch,
      transforms: Array.from(batch.transforms ?? [])
    })),
    semanticIndex: ir.semanticIndex
  };
}

describe("remote material overlay compositing", () => {
  it("alpha-composites remote color detail while preserving procedural structure layers", async () => {
    const procedural = proceduralArtifact();
    const result = await compositeRemoteMaterialOverlay(procedural, remoteOverlay());

    expect(result.diagnostics).toEqual([]);
    expect(result.artifact.sourceId).toBe(procedural.sourceId);
    expect(result.artifact.providerId).toBe("procedural+remote-overlay");
    expect(result.artifact.requestHash).not.toBe(procedural.requestHash);
    expect(result.artifact.contentHash).not.toBe(procedural.contentHash);
    expect(result.artifact.provenance.algorithm).toBe("remote-overlay-over-procedural-v0.1");
    expect(pixel(result.artifact.layers.baseColor, 0, 0)).toEqual([150, 75, 50, 255]);
    expect(result.artifact.layers.height?.data).toEqual(procedural.layers.height?.data);
    expect(result.artifact.layers.roughness?.data).toEqual(procedural.layers.roughness?.data);
    expect(result.artifact.layers.metalness?.data).toEqual(procedural.layers.metalness?.data);
    expect(result.artifact.layers.opacity?.data).toEqual(procedural.layers.opacity?.data);
  });

  it("reports dimension mismatches without replacing the procedural artifact", async () => {
    const procedural = proceduralArtifact();
    const result = await compositeRemoteMaterialOverlay(procedural, remoteOverlay(4, 2));

    expect(result.artifact.contentHash).toBe(procedural.contentHash);
    expect(result.artifact.layers.baseColor.data).toEqual(procedural.layers.baseColor.data);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "remoteMaterialOverlay.dimensionMismatch",
        severity: "error",
        received: "4x2"
      })
    );
  });

  it("changes packed atlas content without changing structural geometry", async () => {
    const { plan, artifacts, compilerInput } = await fixturePipeline();
    const baseAtlas = await packAtlas(plan, artifacts);
    const baseIr = await compileBuilding(compilerInput);
    const targetArtifact = artifacts.find((artifact) => artifact.sourceId === "source.wall.primary");

    expect(targetArtifact).toBeDefined();

    const overlay = remoteOverlay(targetArtifact!.widthPx, targetArtifact!.heightPx);
    const overlayResult = await compositeRemoteMaterialOverlay(targetArtifact!, overlay);
    const overlayArtifacts = artifacts.map((artifact) =>
      artifact.sourceId === overlayResult.artifact.sourceId ? overlayResult.artifact : artifact
    );
    const overlayAtlas = await packAtlas(plan, overlayArtifacts);
    const overlayIr = await compileBuilding(compilerInput);

    expect(overlayResult.diagnostics).toEqual([]);
    expect(overlayAtlas.contentHash).not.toBe(baseAtlas.contentHash);
    expect(overlayAtlas.channels.baseColor.data).not.toEqual(baseAtlas.channels.baseColor.data);
    expect(serializableStructuralIr(overlayIr)).toEqual(serializableStructuralIr(baseIr));
  });
});
