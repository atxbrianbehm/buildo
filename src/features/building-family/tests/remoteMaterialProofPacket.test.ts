import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import {
  createRemoteMaterialProofPacket,
  parseRemoteMaterialProofPacket
} from "../materials/remoteMaterialProofPacket";
import { FixtureMaterialProvider } from "../materials/providers/fixtureMaterialProvider";
import type { MaterialSourceArtifact, MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import type { AssemblyHallRemoteMaterialApplication } from "../ui/assemblyHallFixture";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function packedFixture() {
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
  const packedAtlas = await packAtlas(plan, artifacts);
  return {
    packedAtlas,
    debugExport: await createAtlasDebugExport(packedAtlas)
  };
}

function generatedRemoteMaterialApplication(): AssemblyHallRemoteMaterialApplication {
  return {
    schemaVersion: "0.1.0",
    route: {
      schemaVersion: "0.1.0",
      status: "generated",
      providerId: "openai-image",
      requestHash: "route-request-hash",
      acceptedRequestCount: 1,
      cacheStatus: "miss"
    },
    remoteSources: [
      {
        sourceId: "source.wall.primary",
        providerId: "openai-image",
        requestHash: "remote-request-hash",
        contentHash: "remote-content-hash",
        revisedPrompt: "revised masonry prompt"
      }
    ],
    diagnostics: [
      {
        code: "remoteMaterialProvider.liveProofNote",
        message: `Captured without exposing ${["sk", "secret-provider-key"].join("-")}.`,
        severity: "info"
      }
    ]
  };
}

describe("remote material proof packet", () => {
  it("creates a sanitized proof packet for generated remote material output", async () => {
    const { packedAtlas, debugExport } = await packedFixture();
    const packet = createRemoteMaterialProofPacket({
      packedAtlas,
      debugExport,
      remoteMaterialApplication: generatedRemoteMaterialApplication(),
      now: () => new Date("2026-06-24T00:00:00.000Z")
    });
    const packetJson = JSON.stringify(packet);

    expect(packet).toEqual(
      expect.objectContaining({
        schemaVersion: "0.1.0",
        proofKind: "dynamic-building-family-remote-material-proof",
        createdAt: "2026-06-24T00:00:00.000Z",
        atlas: expect.objectContaining({
          atlasId: packedAtlas.atlasId,
          contentHash: packedAtlas.contentHash,
          debugExportHash: debugExport.exportHash
        }),
        route: {
          schemaVersion: "0.1.0",
          status: "generated",
          providerId: "openai-image",
          requestHash: "route-request-hash",
          acceptedRequestCount: 1,
          cacheStatus: "miss"
        },
        remoteSources: [
          {
            sourceId: "source.wall.primary",
            providerId: "openai-image",
            requestHash: "remote-request-hash",
            contentHash: "remote-content-hash",
            revisedPrompt: "revised masonry prompt"
          }
        ],
        evidence: {
          generatedSourceCount: 1,
          revisedPromptCount: 1,
          diagnosticCount: 1
        }
      })
    );
    expect(packet.knownLimitations).toEqual(
      expect.arrayContaining([
        "Provider secrets and raw remote image bytes are intentionally omitted from the proof packet."
      ])
    );
    expect(packetJson).not.toContain(["sk", "secret-provider-key"].join("-"));
    expect(parseRemoteMaterialProofPacket(JSON.parse(packetJson))).toEqual(packet);
  });

  it("rejects fallback route summaries as proof packets", async () => {
    const { packedAtlas, debugExport } = await packedFixture();

    expect(() =>
      createRemoteMaterialProofPacket({
        packedAtlas,
        debugExport,
        remoteMaterialApplication: {
          ...generatedRemoteMaterialApplication(),
          route: {
            schemaVersion: "0.1.0",
            status: "fallback",
            providerId: "procedural",
            requestHash: "fallback-route-hash",
            acceptedRequestCount: 1,
            cacheStatus: "not-checked"
          },
          remoteSources: []
        }
      })
    ).toThrow("Remote material proof packet requires generated remote material output");
  });
});
