import { vi } from "vitest";
import type { PngLayerDecoderInput, RemoteMaterialImageArtifact } from "../materials/remoteMaterialImageBridge";
import type { RemoteMaterialRouteResult } from "../state/remoteMaterialRouteClient";
import {
  ProceduralMaterialProvider,
  type MaterialGenerationProvider,
  type MaterialSourceRequest,
  type PixelLayer
} from "../materials/providers/proceduralMaterialProvider";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";

const createFixtureWithOptions = createAssemblyHallFixture as (input?: {
  promptControls?: {
    prompt: string;
    psgPresetId: "late19cCommercialDemo";
    stylePackId: "late-19c-commercial-demo";
    seeds: {
      family: string;
      building: string;
      material: string;
      trim: string;
    };
    floorCount: number;
    bayCount: number;
    detailLevel?: "high" | "low";
    roofType: "flat";
    trimDensity: "ornate";
    lockedComponentKeys: string[];
  };
  reusableArtifacts?: Pick<AssemblyHallFixture, "catalog" | "debugExport" | "packedAtlas">;
  materialProvider?: MaterialGenerationProvider;
  runId?: string;
  signal?: AbortSignal;
  remoteMaterial?: {
    selectRequests?: (requests: MaterialSourceRequest[]) => MaterialSourceRequest[];
    requestRemoteImages: (input: {
      runId: string;
      requests: MaterialSourceRequest[];
      signal?: AbortSignal;
    }) => Promise<RemoteMaterialRouteResult>;
    decodePngLayer: (input: PngLayerDecoderInput) => Promise<PixelLayer>;
  };
}) => Promise<AssemblyHallFixture>;

const explicitPromptControls = {
  prompt: "make a controlled building",
  psgPresetId: "late19cCommercialDemo" as const,
  stylePackId: "late-19c-commercial-demo" as const,
  seeds: {
    family: "family-seed",
    building: "building-seed-explicit",
    material: "material-seed",
    trim: "trim-seed"
  },
  floorCount: 6,
  bayCount: 5,
  detailLevel: "high" as const,
  roofType: "flat" as const,
  trimDensity: "ornate" as const,
  lockedComponentKeys: []
};

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

function remoteArtifactFor(request: MaterialSourceRequest): RemoteMaterialImageArtifact {
  return {
    schemaVersion: "0.1.0",
    sourceId: request.sourceId,
    providerId: "openai-image",
    image: {
      format: "png",
      b64Json: `remote-png-b64:${request.sourceId}`
    },
    revisedPrompt: `revised remote prompt for ${request.sourceId}`,
    requestHash: `remote-request-hash:${request.sourceId}`,
    contentHash: `remote-content-hash:${request.sourceId}`,
    provenance: {
      providerId: "openai-image",
      model: "gpt-image-test",
      endpoint: "https://api.openai.com/v1/images/generations",
      prompt: `remote prompt for ${request.sourceId}`,
      promptVocabulary: request.promptVocabulary,
      seedPath: request.seedPath,
      outputFormat: "png",
      quality: "low"
    }
  };
}

describe("assembly hall fixture", () => {
  it("builds a rendered-building fixture from the real atlas, compiler, gallery, and family runtime pipeline", async () => {
    const fixture = await createAssemblyHallFixture();
    const wallObject = fixture.buildingRuntime.objectsByBatchId.get("mesh.wall-panels")!;
    const windowObject = fixture.buildingRuntime.objectsByBatchId.get("instances.window")!;

    expect(fixture.schemaVersion).toBe("0.1.0");
    expect(fixture.familyRuntime.textureSet.contentHash).toBe(fixture.packedAtlas.contentHash);
    expect(fixture.familyRuntime.textureSet.channelHashes).toEqual(
      Object.fromEntries(fixture.debugExport.channels.map((channel) => [channel.name, channel.channelHash]))
    );
    expect(fixture.buildingRuntime.materialRegistry).toBe(fixture.familyRuntime.materialRegistry);
    expect(wallObject.material.map).toBe(fixture.familyRuntime.textureSet.textures.baseColor);
    expect(windowObject.isInstancedMesh).toBe(true);
    expect(fixture.componentGallery.entries.length).toBeGreaterThan(0);
    expect(fixture.metrics).toMatchObject({
      atlasContentHash: fixture.packedAtlas.contentHash,
      componentCount: fixture.componentGallery.entries.length,
      drawCallCount: fixture.buildingRuntime.renderables.length,
      textureCount: 5
    });
    expect(fixture.backendSupport.webgpu.importPath).toBe("three/webgpu");
    expect(fixture.backendSupport.webgl.importPath).toBe("three");
  });

  it("uses committed prompt controls instead of only the prompt fixture defaults", async () => {
    const fixture = await createFixtureWithOptions({ promptControls: explicitPromptControls });

    expect(fixture.prompt).toBe("make a controlled building");
    expect(fixture.spec.seeds.building).toBe("building-seed-explicit");
    expect(fixture.spec.massing.floorCount).toBe(6);
    expect(fixture.spec.facade.frontBayCount).toBe(5);
    expect(fixture.ir.metrics.instanceCount).toBeGreaterThan(6 * 5);

    fixture.familyRuntime.dispose();
  });

  it("passes low detail controls into the runtime fixture and variant stress summary", async () => {
    const highFixture = await createFixtureWithOptions({ promptControls: explicitPromptControls });
    const lowFixture = await createFixtureWithOptions({
      promptControls: {
        ...explicitPromptControls,
        detailLevel: "low"
      },
      reusableArtifacts: {
        packedAtlas: highFixture.packedAtlas,
        debugExport: highFixture.debugExport,
        catalog: highFixture.catalog
      }
    });

    expect(lowFixture.ir.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.roof"]);
    expect(lowFixture.ir.instanceBatches.map((batch) => batch.batchId)).toEqual(["instances.window", "instances.door"]);
    expect(lowFixture.ir.semanticIndex.some((entry) => entry.stage === "trim")).toBe(false);
    expect(lowFixture.metrics.triangleCount).toBeLessThan(highFixture.metrics.triangleCount);
    expect(lowFixture.metrics.instanceCount).toBeLessThan(highFixture.metrics.instanceCount);
    expect(lowFixture.variantStress.variants[0]).toMatchObject({
      triangleCount: lowFixture.ir.metrics.triangleCount,
      instanceCount: lowFixture.ir.metrics.instanceCount
    });
    expect(lowFixture.promptTrace.requestedControls).toEqual(
      expect.arrayContaining([{ name: "detailLevel", value: "low" }])
    );

    lowFixture.familyRuntime.dispose();
    highFixture.familyRuntime.dispose();
  });

  it("records a serializable prompt and PSG trace for Prompt Lab inspection", async () => {
    const fixture = await createAssemblyHallFixture();
    const promptTrace = (
      fixture as AssemblyHallFixture & {
        promptTrace?: {
          interpreterProvider: string;
          psgPresetId: string;
          traceId: string;
          evaluatedVariables: Array<{ name: string; value: string | number | boolean | null }>;
          psgTrace: Array<{ nodeId: string; nodeType: string; semanticPath: string; seed: string }>;
          requestedControls: Array<{ name: string; value: string | number }>;
        };
      }
    ).promptTrace;

    expect(promptTrace).toMatchObject({
      interpreterProvider: "local-rule",
      psgPresetId: "late19cCommercialDemo",
      traceId: expect.stringMatching(/^trace-/),
      requestedControls: expect.arrayContaining([
        { name: "floorCount", value: 4 },
        { name: "bayCount", value: 7 },
        { name: "roofType", value: "flat" },
        { name: "trimDensity", value: "ornate" }
      ])
    });
    expect(promptTrace?.evaluatedVariables).toEqual(
      expect.arrayContaining([
        { name: "building.stylePack", value: "late-19c-commercial-demo" },
        { name: "building.windowFamily", value: "tall-arched" },
        { name: "building.corniceFamily", value: "bracketed-metal" }
      ])
    );
    expect(promptTrace?.psgTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "windowFamily",
          nodeType: "SetVariable",
          semanticPath: "windowFamily",
          seed: "psg-seed/windowFamily"
        })
      ])
    );

    fixture.familyRuntime.dispose();
  });

  it("summarizes sixteen family variants that share atlas and catalog lineage", async () => {
    const fixture = await createAssemblyHallFixture();

    expect(fixture.variantStress).toMatchObject({
      schemaVersion: "0.1.0",
      variantCount: 16,
      sharedFamilyId: fixture.spec.familyId,
      sharedAtlasId: fixture.packedAtlas.atlasId,
      sharedAtlasContentHash: fixture.packedAtlas.contentHash,
      sharedCatalogId: fixture.catalog.catalogId,
      sharedSourceGraphHash: fixture.ir.sourceGraphHash
    });
    expect(fixture.variantStress.variants).toHaveLength(16);
    expect(new Set(fixture.variantStress.variants.map((variant) => variant.buildingId)).size).toBe(16);
    expect(new Set(fixture.variantStress.variants.map((variant) => variant.buildingSeed)).size).toBe(16);
    expect(new Set(fixture.variantStress.variants.map((variant) => variant.sourceGraphHash))).toEqual(
      new Set([fixture.ir.sourceGraphHash])
    );
    expect(fixture.variantStress.variants[0]).toMatchObject({
      index: 0,
      buildingId: fixture.ir.buildingId,
      buildingSeed: fixture.spec.seeds.building,
      triangleCount: fixture.ir.metrics.triangleCount,
      instanceCount: fixture.ir.metrics.instanceCount,
      semanticPathCount: fixture.ir.semanticIndex.length
    });
    expect(fixture.variantStress.aggregate.triangleCount).toBe(fixture.ir.metrics.triangleCount * 16);
    expect(fixture.variantStress.aggregate.instanceCount).toBe(fixture.ir.metrics.instanceCount * 16);

    fixture.familyRuntime.dispose();
  });

  it("records local component locks in the generated building spec", async () => {
    const fixture = await createFixtureWithOptions({
      promptControls: {
        ...explicitPromptControls,
        lockedComponentKeys: ["recipe.window.tall-arched.frame"]
      }
    });

    expect(fixture.spec.locks).toEqual([
      expect.objectContaining({
        semanticPath: "component/recipe.window.tall-arched.frame",
        scope: "building",
        lockedValue: {
          componentKey: "recipe.window.tall-arched.frame"
        }
      })
    ]);

    fixture.familyRuntime.dispose();
  });

  it("reuses family material and catalog artifacts for structural reruns", async () => {
    const baseline = await createFixtureWithOptions({ promptControls: explicitPromptControls });
    const failingProvider: MaterialGenerationProvider = {
      id: "failing-provider",
      generate: vi.fn(async () => {
        throw new Error("structural rerun regenerated material sources");
      })
    };
    const structuralPrompt = {
      ...explicitPromptControls,
      floorCount: explicitPromptControls.floorCount + 1
    };

    const fixture = await createFixtureWithOptions({
      promptControls: structuralPrompt,
      reusableArtifacts: {
        packedAtlas: baseline.packedAtlas,
        debugExport: baseline.debugExport,
        catalog: baseline.catalog
      },
      materialProvider: failingProvider
    });

    expect(failingProvider.generate).not.toHaveBeenCalled();
    expect(fixture.spec.massing.floorCount).toBe(7);
    expect(fixture.packedAtlas).toBe(baseline.packedAtlas);
    expect(fixture.debugExport).toBe(baseline.debugExport);
    expect(fixture.catalog).toBe(baseline.catalog);
    expect(fixture.ir.buildingId).not.toBe(baseline.ir.buildingId);

    fixture.familyRuntime.dispose();
    baseline.familyRuntime.dispose();
  });

  it("allows injectable providers for family-regenerating runs", async () => {
    const realProvider = new ProceduralMaterialProvider();
    const provider: MaterialGenerationProvider = {
      id: realProvider.id,
      generate: vi.fn((request, signal) => realProvider.generate(request, signal))
    };

    const fixture = await createFixtureWithOptions({
      promptControls: {
        ...explicitPromptControls,
        seeds: {
          ...explicitPromptControls.seeds,
          family: "family-seed-regenerated"
        }
      },
      materialProvider: provider
    });

    expect(provider.generate).toHaveBeenCalledTimes(fixture.packedAtlas.manifest.slots.length);

    fixture.familyRuntime.dispose();
  });

  it("can apply remote material overlays during fixture atlas generation without changing structural geometry", async () => {
    const baseline = await createFixtureWithOptions({ promptControls: explicitPromptControls });
    const routeCalls: Array<{ runId: string; requests: MaterialSourceRequest[] }> = [];
    const decodeCalls: PngLayerDecoderInput[] = [];

    const fixture = await createFixtureWithOptions({
      runId: "fixture-remote-material-run",
      promptControls: explicitPromptControls,
      remoteMaterial: {
        selectRequests: (requests) => requests.filter((request) => request.sourceId === "source.wall.primary"),
        requestRemoteImages: async (input) => {
          routeCalls.push(input);
          return {
            schemaVersion: "0.1.0",
            status: "generated",
            providerId: "openai-image",
            requestHash: "fixture-route-request-hash",
            acceptedRequestCount: input.requests.length,
            cacheStatus: "miss",
            artifacts: input.requests.map(remoteArtifactFor),
            diagnostics: []
          };
        },
        decodePngLayer: async (input) => {
          decodeCalls.push(input);
          return makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128]);
        }
      }
    });

    const remoteSlot = fixture.packedAtlas.slotProvenance.find(
      (entry) => entry.sourceId === "source.wall.primary"
    );

    expect(routeCalls).toHaveLength(1);
    expect(routeCalls[0]).toEqual(
      expect.objectContaining({
        runId: "fixture-remote-material-run",
        requests: [expect.objectContaining({ sourceId: "source.wall.primary" })],
        signal: expect.any(AbortSignal)
      })
    );
    expect(decodeCalls).toEqual([
      {
        b64Json: "remote-png-b64:source.wall.primary",
        widthPx: 32,
        heightPx: 32
      }
    ]);
    expect(fixture.ir.sourceGraphHash).toBe(baseline.ir.sourceGraphHash);
    expect(fixture.ir.metrics).toEqual(baseline.ir.metrics);
    expect(fixture.packedAtlas.contentHash).not.toBe(baseline.packedAtlas.contentHash);
    expect(remoteSlot).toEqual(
      expect.objectContaining({
        providerId: "procedural+remote-overlay",
        sourceId: "source.wall.primary"
      })
    );
    expect(fixture.debugExport.providerDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "procedural+remote-overlay",
          warningCount: 0,
          errorCount: 0
        })
      ])
    );
    expect(fixture.remoteMaterialApplication).toEqual(
      expect.objectContaining({
        route: expect.objectContaining({
          status: "generated",
          providerId: "openai-image",
          requestHash: "fixture-route-request-hash",
          cacheStatus: "miss"
        }),
        remoteSources: [
          {
            sourceId: "source.wall.primary",
            providerId: "openai-image",
            requestHash: "remote-request-hash:source.wall.primary",
            contentHash: "remote-content-hash:source.wall.primary",
            revisedPrompt: "revised remote prompt for source.wall.primary"
          }
        ],
        diagnostics: []
      })
    );

    fixture.familyRuntime.dispose();
    baseline.familyRuntime.dispose();
  });

  it("passes the fixture abort signal into remote material route requests", async () => {
    const abortController = new AbortController();
    const routeCalls: Array<{ runId: string; requests: MaterialSourceRequest[]; signal?: AbortSignal }> = [];

    const fixture = await createFixtureWithOptions({
      runId: "fixture-remote-material-signal-run",
      signal: abortController.signal,
      promptControls: explicitPromptControls,
      remoteMaterial: {
        selectRequests: (requests) => requests.filter((request) => request.sourceId === "source.wall.primary"),
        requestRemoteImages: async (input) => {
          routeCalls.push(input);
          return {
            schemaVersion: "0.1.0",
            status: "fallback",
            providerId: "procedural",
            requestHash: "fixture-route-fallback-hash",
            acceptedRequestCount: input.requests.length,
            cacheStatus: "not-checked",
            diagnostics: []
          };
        },
        decodePngLayer: async (input) => makeLayer(input.widthPx, input.heightPx, [200, 50, 0, 128])
      }
    });

    expect(routeCalls).toEqual([
      {
        runId: "fixture-remote-material-signal-run",
        requests: [expect.objectContaining({ sourceId: "source.wall.primary" })],
        signal: abortController.signal
      }
    ]);

    fixture.familyRuntime.dispose();
  });
});
