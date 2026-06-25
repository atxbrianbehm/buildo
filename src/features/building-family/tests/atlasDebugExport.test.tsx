import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { planAtlas } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { FixtureMaterialProvider } from "../materials/providers/fixtureMaterialProvider";
import type { MaterialSourceArtifact, MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { AtlasLab } from "../ui/AtlasLab";
import type { AssemblyHallRemoteMaterialApplication } from "../ui/assemblyHallFixture";
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
    const uniqueSources = new Set(packed.slotProvenance.map((entry) => entry.sourceId));

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
    expect(first.providerDiagnostics).toEqual([
      expect.objectContaining({
        schemaVersion: "0.1.0",
        providerId: "fixture",
        cacheStatus: "generated",
        sourceCount: uniqueSources.size,
        slotCount: packed.slotProvenance.length,
        warningCount: 0,
        errorCount: 0
      })
    ]);
    expect(first.providerDiagnostics[0].requestHashes).toContain(packed.slotProvenance[0].requestHash);
    expect(first.providerDiagnostics[0].contentHashes).toContain(packed.slotProvenance[0].contentHash);
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

    render(<AtlasLab packedAtlas={packed} debugExport={debugExport} materialSourceCacheHit={false} />);

    expect(screen.getByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByText(packed.atlasId)).toBeInTheDocument();
    expect(screen.getByText(packed.contentHash)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toHaveAttribute(
      "src",
      debugExport.channels[0].pngDataUrl
    );
    expect(screen.getByText(packed.manifest.slots[0].id)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Semantic Slots" })).toHaveTextContent(
      packed.slotProvenance[0].contentHash
    );
    const providerTable = screen.getByRole("table", { name: "Provider Diagnostics" });
    expect(providerTable).toHaveTextContent("fixture");
    expect(providerTable).toHaveTextContent("cache miss");
    expect(providerTable).toHaveTextContent("12 slots");
    expect(providerTable).toHaveTextContent("0 errors / 0 warnings");
  });

  it("surfaces remote material revised prompts and route diagnostics when present", async () => {
    const packed = await packedFixture();
    const debugExport = await createAtlasDebugExport(packed);
    const remoteMaterialApplication: AssemblyHallRemoteMaterialApplication = {
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
          revisedPrompt: "revised masonry prompt with patina and mortar detail"
        }
      ],
      diagnostics: [
        {
          code: "remoteMaterialApplicationCoordinator.missingRemoteArtifact",
          message: "Remote route omitted a requested cornice source.",
          severity: "warning",
          path: "sources.source.cornice.primary"
        }
      ]
    };

    render(
      <AtlasLab
        packedAtlas={packed}
        debugExport={debugExport}
        materialSourceCacheHit={false}
        remoteMaterialApplication={remoteMaterialApplication}
      />
    );

    expect(screen.getByRole("heading", { name: "Remote Material Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Remote material route summary")).toHaveTextContent("generated");
    expect(screen.getByLabelText("Remote material route summary")).toHaveTextContent("openai-image");
    expect(screen.getByLabelText("Remote material route summary")).toHaveTextContent("miss");
    expect(screen.getByRole("table", { name: "Remote Revised Prompts" })).toHaveTextContent("source.wall.primary");
    expect(screen.getByRole("table", { name: "Remote Revised Prompts" })).toHaveTextContent(
      "revised masonry prompt with patina and mortar detail"
    );
    expect(screen.getByRole("table", { name: "Remote Material Diagnostics" })).toHaveTextContent("warning");
    expect(screen.getByRole("table", { name: "Remote Material Diagnostics" })).toHaveTextContent(
      "remoteMaterialApplicationCoordinator.missingRemoteArtifact"
    );
  });

  it("downloads a sanitized remote material proof packet for generated remote route output", async () => {
    const packed = await packedFixture();
    const debugExport = await createAtlasDebugExport(packed);
    const remoteMaterialApplication: AssemblyHallRemoteMaterialApplication = {
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
          revisedPrompt: "revised masonry prompt with patina"
        }
      ],
      diagnostics: [
        {
          code: "remoteMaterialProvider.liveProofNote",
          message: "Captured without exposing sk-secret-provider-key.",
          severity: "info"
        }
      ]
    };
    const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      void blob;
      return "blob:remote-material-proof";
    });
    const revokeObjectURL = vi.fn();
    let downloadedFileName = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadedFileName = this.download;
    });

    try {
      render(
        <AtlasLab
          packedAtlas={packed}
          debugExport={debugExport}
          materialSourceCacheHit={false}
          remoteMaterialApplication={remoteMaterialApplication}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Download Remote Proof Packet" }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!(blob instanceof Blob)) {
        throw new Error("Expected remote material proof packet download to create a Blob");
      }
      const payload = JSON.parse(await blob.text());
      const payloadJson = JSON.stringify(payload);

      expect(blob.type).toBe("application/json");
      expect(payload).toMatchObject({
        schemaVersion: "0.1.0",
        proofKind: "dynamic-building-family-remote-material-proof",
        atlas: {
          atlasId: packed.atlasId,
          contentHash: packed.contentHash,
          debugExportHash: debugExport.exportHash
        },
        route: {
          status: "generated",
          providerId: "openai-image"
        },
        remoteSources: [
          {
            sourceId: "source.wall.primary",
            contentHash: "remote-content-hash"
          }
        ]
      });
      expect(payloadJson).not.toContain("sk-secret-provider-key");
      expect(downloadedFileName).toBe(`${packed.atlasId}-remote-material-proof.json`);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:remote-material-proof");
    } finally {
      click.mockRestore();
      if (previousCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (previousRevokeObjectUrl) {
        Object.defineProperty(URL, "revokeObjectURL", previousRevokeObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });
});
