import { hashCanonicalJson } from "../core/contentHash";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";
import { InMemoryArtifactCache, type CachedArtifactEntry } from "./artifactCache";
import { createAtlasDebugExport, type AtlasDebugExport } from "./atlasDebugExport";
import { packAtlas, type PackedAtlas } from "./atlasPacker";
import { planAtlas } from "./atlasPlanner";
import { ProceduralMaterialProvider } from "./providers/proceduralMaterialProvider";
import type { MaterialSourceRequest } from "./providers/proceduralMaterialProvider";

const prompt = "four floors, 7 bays, brick, flat roof, ornate trim";
const seeds = {
  family: "family-seed",
  building: "building-seed",
  material: "material-seed",
  trim: "trim-seed"
};

export interface AtlasLabFixture {
  schemaVersion: "0.1.0";
  prompt: string;
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  cacheEntries: CachedArtifactEntry<unknown>[];
  provenanceEntryCount: number;
}

export async function createAtlasLabFixture(): Promise<AtlasLabFixture> {
  const cache = new InMemoryArtifactCache<unknown>({
    now: () => "2026-06-24T00:00:00.000Z"
  });
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt,
    seeds,
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const plan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const provider = new ProceduralMaterialProvider();
  const sourceRequests = plan.materialSources.map(
    (source): MaterialSourceRequest => ({
      ...source,
      widthPx: 32,
      heightPx: 32
    })
  );
  const materialSources = await Promise.all(
    sourceRequests.map((request) => provider.generate(request, new AbortController().signal))
  );
  const materialSourceHash = await hashCanonicalJson({
    providerId: provider.id,
    contentHashes: materialSources.map((artifact) => [artifact.sourceId, artifact.contentHash])
  });
  cache.put({
    artifactType: "materialSources",
    requestHash: await hashCanonicalJson(sourceRequests),
    contentHash: materialSourceHash,
    dependencies: sourceRequests.map((request) => request.seedPath),
    artifact: materialSources
  });

  const packedAtlas = await packAtlas(plan, materialSources);
  cache.put({
    artifactType: "packedAtlas",
    requestHash: await hashCanonicalJson({
      atlasId: plan.manifest.atlasId,
      materialSourceHash
    }),
    contentHash: packedAtlas.contentHash,
    dependencies: materialSources.map((artifact) => artifact.contentHash),
    artifact: packedAtlas
  });

  const debugExport = await createAtlasDebugExport(packedAtlas);
  cache.put({
    artifactType: "atlasDebugExport",
    requestHash: await hashCanonicalJson({
      atlasId: packedAtlas.atlasId,
      sourceContentHash: packedAtlas.contentHash
    }),
    contentHash: debugExport.exportHash,
    dependencies: [packedAtlas.contentHash],
    artifact: debugExport
  });

  return {
    schemaVersion: "0.1.0",
    prompt,
    packedAtlas,
    debugExport,
    cacheEntries: cache.list(),
    provenanceEntryCount:
      materialSources.length + packedAtlas.slotProvenance.length + debugExport.channels.length + 1
  };
}
