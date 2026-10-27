import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { createBuildingSourceFile, createBuildingSourceSnapshot, deriveBuildingSourceBayEdit, deriveBuildingSourceFloorEdit, deriveBuildingSourceRoofEdit, deriveBuildingSourceWindowEdit, parseBuildingSourceFile } from "../state/buildingSourceFile";
import { vi } from "vitest";
import * as psgEvaluator from "../../prompt-spaghetti/core/evaluatePsg";
import * as specNormalizer from "../core/specNormalizer";
import * as componentCatalogBuilder from "../components/componentCatalogBuilder";
import * as buildingGraphBuilder from "../compiler/buildingGraphBuilder";
import * as buildingCompiler from "../compiler/buildingCompiler";
import type { PngLayerDecoderInput, RemoteMaterialImageArtifact } from "../materials/remoteMaterialImageBridge";
import type { RemoteMaterialRouteResult } from "../state/remoteMaterialRouteClient";
import {
  ProceduralMaterialProvider,
  type MaterialGenerationProvider,
  type MaterialSourceRequest,
  type PixelLayer
} from "../materials/providers/proceduralMaterialProvider";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";

const createFixtureWithOptions = createAssemblyHallFixture as (input?: {
  promptControls?: typeof defaultBuildingPromptControls;
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
  ...defaultBuildingPromptControls,
  prompt: "make a controlled building",
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
    expect(wallObject.geometry.userData.atlasSlotUvRect).toEqual(
      wallObject.material.userData.atlasSlot.uvRect
    );
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

  it("switches between kit and proof fidelity modes for the same prompt controls", async () => {
    const kitFixture = await createAssemblyHallFixture({
      promptControls: {
        ...defaultBuildingPromptControls,
        fidelityMode: "kit"
      }
    });
    const proofFixture = await createAssemblyHallFixture({
      promptControls: {
        ...defaultBuildingPromptControls,
        fidelityMode: "proof"
      },
      reusableArtifacts: {
        packedAtlas: kitFixture.packedAtlas,
        debugExport: kitFixture.debugExport,
        catalog: kitFixture.catalog
      }
    });

    expect(kitFixture.fidelityMode).toBe("kit");
    expect(proofFixture.fidelityMode).toBe("proof");
    expect(kitFixture.graph.nodes.some((node) => node.id === "node.art-kit-facade-plan")).toBe(true);
    expect(proofFixture.graph.nodes.some((node) => node.id === "node.art-kit-facade-plan")).toBe(false);
    const kitWindows = kitFixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window")?.count ?? 0;
    const proofWindows =
      proofFixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window")?.count ?? 0;
    const proofDoors =
      proofFixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.door")?.count ?? 0;
    const frontCells =
      proofFixture.spec.massing.floorCount * proofFixture.spec.facade.frontBayCount;
    expect(kitWindows).toBeGreaterThan(proofWindows);
    // Proof uses front-only split: one ground door + windows on remaining front cells.
    expect(proofDoors).toBe(1);
    expect(proofWindows).toBe(frontCells - 1);
    expect(proofWindows + proofDoors).toBe(frontCells);

    kitFixture.familyRuntime.dispose();
    proofFixture.familyRuntime.dispose();
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

    expect(lowFixture.ir.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.opening-pockets", "mesh.roof"]);
    expect(lowFixture.ir.instanceBatches.map((batch) => batch.batchId)).toEqual([
      "instances.window",
      "instances.window.glass",
      "instances.door",
      "instances.door.glass"
    ]);
    expect(lowFixture.ir.semanticIndex.some((entry) => entry.stage === "trim")).toBe(false);
    expect(lowFixture.metrics.triangleCount).toBeLessThan(highFixture.metrics.triangleCount);
    // Opening instances share the same split slots; low detail only drops decorative mesh.
    expect(lowFixture.metrics.instanceCount).toBeLessThanOrEqual(highFixture.metrics.instanceCount);
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
    // Variants re-plan with distinct building seeds, so graph hashes are not forced-identical.
    expect(new Set(fixture.variantStress.variants.map((variant) => variant.sourceGraphHash)).size).toBeGreaterThan(1);
    // Composition keys capture bay/depth/window-family differences — not just renames.
    expect(
      new Set(fixture.variantStress.variants.map((variant) => variant.compositionKey)).size
    ).toBeGreaterThanOrEqual(6);
    expect(
      new Set(fixture.variantStress.variants.map((variant) => variant.frontBayCount)).size
    ).toBeGreaterThan(1);
    expect(fixture.variantStress.variants[0]).toMatchObject({
      index: 0,
      buildingId: fixture.ir.buildingId,
      buildingSeed: fixture.spec.seeds.building,
      triangleCount: fixture.ir.metrics.triangleCount,
      instanceCount: fixture.ir.metrics.instanceCount,
      semanticPathCount: fixture.ir.semanticIndex.length
    });
    expect(fixture.variantStress.aggregate.triangleCount).toBe(
      fixture.variantStress.variants.reduce((total, variant) => total + variant.triangleCount, 0)
    );
    expect(fixture.variantStress.aggregate.instanceCount).toBe(
      fixture.variantStress.variants.reduce((total, variant) => total + variant.instanceCount, 0)
    );

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

function p2AuthoredWindowControls(
  windowFamily = "tall-arched",
  buildingSeed = "building-seed-variant-07"
): typeof defaultBuildingPromptControls {
  const controls: typeof defaultBuildingPromptControls = {
    ...explicitPromptControls,
    seeds: { family: "fam", building: buildingSeed, material: "mat", trim: "trim" },
    windowFamily
  };
  return controls;
}
function p2MaterialSnapshot(fixture: AssemblyHallFixture) {
  return {
    packedAtlasJson: JSON.stringify(fixture.packedAtlas),
    debugExportJson: JSON.stringify(fixture.debugExport),
    rawChannels: Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => ({
      name,
      bytes: Array.from(layer.data)
    }))
  };
}

describe("R2.P2 authored window authority", () => {
  it("R2.P2 opposing-seed explicit window selection is authoritative", async () => {
    const normalizer = vi.spyOn(specNormalizer, "normalizeBuildingSpec");
    let fixture: AssemblyHallFixture | undefined;
    try {
      fixture = await createFixtureWithOptions({ promptControls: p2AuthoredWindowControls("tall-arched") });
      const actualNormalization = normalizer.mock.results.at(-1);
      if (!actualNormalization || actualNormalization.type !== "return") throw new Error("Expected actual normalization receipt");
      const legacy = await actualNormalization.value;
      // Keep the actual legacy call as a causality oracle: this seed opposes the artist's choice.
      expect(legacy.spec.selectedFamilies.window).toBe("tall-rectangular");
      expect(fixture.spec.selectedFamilies.window).toBe("tall-arched");
      expect(fixture.spec).toEqual({
        ...legacy.spec,
        selectedFamilies: { ...legacy.spec.selectedFamilies, window: "tall-arched" }
      });
      expect(fixture.catalog.recipes.find((recipe) => recipe.id === "recipe.window.tall-arched.frame")).toMatchObject({
        kind: "frame", role: "window", profileRecipeId: "profile.window.tall-arched.arched-assembly",
        subcomponentRecipeIds: ["recipe.window.tall-arched.glass"]
      });
      expect(fixture.catalog.recipes.find((recipe) => recipe.id === "recipe.window.tall-arched.glass")).toMatchObject({
        kind: "panel", role: "windowGlass"
      });
      expect(fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window")?.recipeId).toBe("recipe.window.tall-arched.frame");
      expect(fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window.glass")?.recipeId).toBe("recipe.window.tall-arched.glass");
      expect(fixture.buildingRuntime.objectsByBatchId.get("instances.window")?.userData.recipeId).toBe("recipe.window.tall-arched.frame");
      expect(fixture.buildingRuntime.objectsByBatchId.get("instances.window.glass")?.userData.recipeId).toBe("recipe.window.tall-arched.glass");
    } finally {
      fixture?.familyRuntime.dispose();
      normalizer.mockRestore();
    }
  });
  it("keeps an absent window choice exactly equal to legacy normalization", async () => {
    const normalizer = vi.spyOn(specNormalizer, "normalizeBuildingSpec");
    let fixture: AssemblyHallFixture | undefined;
    try {
      // Historical JavaScript callers can omit this required typed control; retain that runtime boundary.
      const runtimeControlsWithoutWindow = Object.fromEntries(
        Object.entries(p2AuthoredWindowControls()).filter(([key]) => key !== "windowFamily")
      );
      expect(runtimeControlsWithoutWindow).not.toHaveProperty("windowFamily");
      fixture = await Reflect.apply(createAssemblyHallFixture, undefined, [{ promptControls: runtimeControlsWithoutWindow }]);
      if (!fixture) throw new Error("Expected actual fixture from legacy runtime input");
      const actualNormalization = normalizer.mock.results.at(-1);
      if (!actualNormalization || actualNormalization.type !== "return") throw new Error("Expected actual normalization receipt");
      const legacy = await actualNormalization.value;
      expect(fixture.spec).toEqual(legacy.spec);
    } finally {
      fixture?.familyRuntime.dispose();
      normalizer.mockRestore();
    }
  });
  it("preserves the full legacy spec when seeded selection already agrees", async () => {
    const normalizer = vi.spyOn(specNormalizer, "normalizeBuildingSpec");
    try {
      for (const buildingSeed of ["building-seed", "bldg-a", "bldg-b"]) {
        let fixture: AssemblyHallFixture | undefined;
        normalizer.mockClear();
        try {
          fixture = await createFixtureWithOptions({ promptControls: p2AuthoredWindowControls("tall-arched", buildingSeed) });
          const actualNormalization = normalizer.mock.results.at(-1);
          if (!actualNormalization || actualNormalization.type !== "return") throw new Error("Expected actual normalization receipt");
          const legacy = await actualNormalization.value;
          expect(legacy.spec.selectedFamilies.window).toBe("tall-arched");
          expect(fixture.spec).toEqual(legacy.spec);
        } finally {
          fixture?.familyRuntime.dispose();
        }
      }
    } finally {
      normalizer.mockRestore();
    }
  });
  it("retains a compatible authored-window catalog across a structural edit", async () => {
    const controls = p2AuthoredWindowControls("tall-arched");
    const baseline = await createFixtureWithOptions({ promptControls: controls });
    const before = p2MaterialSnapshot(baseline);
    const provider = new ProceduralMaterialProvider();
    const generate = vi.spyOn(provider, "generate").mockRejectedValue(new Error("P2 must reuse material artifacts"));
    let changed: AssemblyHallFixture | undefined;
    try {
      changed = await createFixtureWithOptions({
        promptControls: { ...controls, floorCount: (controls.floorCount ?? 6) + 1 },
        reusableArtifacts: { catalog: baseline.catalog, packedAtlas: baseline.packedAtlas, debugExport: baseline.debugExport },
        materialProvider: provider
      });
      expect(changed.spec.selectedFamilies.window).toBe("tall-arched");
      expect(changed.catalog).toBe(baseline.catalog);
      expect(changed.packedAtlas).toBe(baseline.packedAtlas);
      expect(changed.debugExport).toBe(baseline.debugExport);
      const after = p2MaterialSnapshot(changed);
      expect(after.packedAtlasJson).toBe(before.packedAtlasJson);
      expect(after.debugExportJson).toBe(before.debugExportJson);
      expect(before.rawChannels).toHaveLength(5);
      expect(after.rawChannels).toHaveLength(5);
      expect(after.rawChannels).toEqual(before.rawChannels);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      changed?.familyRuntime.dispose();
      baseline.familyRuntime.dispose();
      generate.mockRestore();
    }
  });
  it("rebuilds an incompatible supplied window catalog while retaining all material bytes", async () => {
    const baseline = await createFixtureWithOptions({ promptControls: p2AuthoredWindowControls("tall-rectangular") });
    const before = p2MaterialSnapshot(baseline);
    const provider = new ProceduralMaterialProvider();
    const generate = vi.spyOn(provider, "generate").mockRejectedValue(new Error("P2 must reuse material artifacts"));
    let changed: AssemblyHallFixture | undefined;
    try {
      changed = await createFixtureWithOptions({
        promptControls: p2AuthoredWindowControls("tall-arched"),
        reusableArtifacts: { catalog: baseline.catalog, packedAtlas: baseline.packedAtlas, debugExport: baseline.debugExport },
        materialProvider: provider
      });
      expect(changed.spec.selectedFamilies.window).toBe("tall-arched");
      expect(changed.catalog).not.toBe(baseline.catalog);
      expect(changed.catalog.catalogId).not.toBe(baseline.catalog.catalogId);
      expect(changed.catalog.familyId).toBe(baseline.catalog.familyId);
      expect(changed.catalog.atlasId).toBe(baseline.catalog.atlasId);
      expect(changed.catalog.recipes.find((recipe) => recipe.id === "recipe.window.tall-arched.frame")).toMatchObject({
        kind: "frame", role: "window", profileRecipeId: "profile.window.tall-arched.arched-assembly",
        subcomponentRecipeIds: ["recipe.window.tall-arched.glass"]
      });
      expect(changed.catalog.recipes.find((recipe) => recipe.id === "recipe.window.tall-arched.glass")).toMatchObject({
        kind: "panel", role: "windowGlass"
      });
      expect(changed.packedAtlas).toBe(baseline.packedAtlas);
      expect(changed.debugExport).toBe(baseline.debugExport);
      const after = p2MaterialSnapshot(changed);
      expect(after.packedAtlasJson).toBe(before.packedAtlasJson);
      expect(after.debugExportJson).toBe(before.debugExportJson);
      expect(before.rawChannels).toHaveLength(5);
      expect(after.rawChannels).toHaveLength(5);
      expect(after.rawChannels).toEqual(before.rawChannels);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      changed?.familyRuntime.dispose();
      baseline.familyRuntime.dispose();
      generate.mockRestore();
    }
  });
  it("rejects an unsupported explicit window family before downstream work", async () => {
    const provider = new ProceduralMaterialProvider();
    const generate = vi.spyOn(provider, "generate").mockRejectedValue(new Error("Material generation must not be reached"));
    const catalog = vi.spyOn(componentCatalogBuilder, "buildComponentCatalog");
    const graph = vi.spyOn(buildingGraphBuilder, "buildBuildingGraph");
    const compile = vi.spyOn(buildingCompiler, "compileBuilding");
    try {
      await expect(createFixtureWithOptions({
        promptControls: p2AuthoredWindowControls("p2-unsupported-window-family"), materialProvider: provider
      })).rejects.toMatchObject({ code: "building.documentResolutionRejected" });
      expect(generate).not.toHaveBeenCalled();
      expect(catalog).not.toHaveBeenCalled();
      expect(graph).not.toHaveBeenCalled();
      expect(compile).not.toHaveBeenCalled();
    } finally {
      generate.mockRestore();
      catalog.mockRestore();
      graph.mockRestore();
      compile.mockRestore();
    }
  });
});


describe("R2.P3 captured source compilation", () => {
  it("captures the actual full controls before interpretation yields", async () => {
    const controls = { ...defaultBuildingPromptControls, seeds: { ...defaultBuildingPromptControls.seeds }, lockedComponentKeys: [...defaultBuildingPromptControls.lockedComponentKeys] };
    const expected = JSON.stringify(controls);
    const pending = createAssemblyHallFixture({ sourceIdentity: { documentId: "source-before-await", revision: 0 }, promptControls: controls });
    controls.prompt = "late prompt"; controls.windowFamily = "tall-rectangular"; controls.seeds.material = "late-material"; controls.lockedComponentKeys.push("late-lock");
    const fixture = await pending;
    try {
      expect(fixture.sourceSnapshot?.controlsView).toEqual(JSON.parse(expected) as unknown);
      expect(fixture.sourceSnapshot?.document.documentId).toBe("source-before-await");
      expect(fixture.sourceSnapshot?.document.revision).toBe(0);
      expect(fixture.spec.selectedFamilies.window).toBe(defaultBuildingPromptControls.windowFamily);
      expect(Object.isFrozen(fixture.sourceSnapshot?.intent)).toBe(true);
    } finally { fixture.familyRuntime.dispose(); }
  });

  it("opens original source through fresh compilation while retaining every saved material byte", async () => {
    const baseline = await createAssemblyHallFixture({ sourceIdentity: { documentId: "source-fresh-compile", revision: 12 }, promptControls: defaultBuildingPromptControls });
    let opened: AssemblyHallFixture | undefined;
    const provider: MaterialGenerationProvider = { id: "source-open-guard", generate: vi.fn(async () => { throw new Error("Source open must not generate materials"); }) };
    const interpreter = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret").mockRejectedValue(new Error("Source open must not reinterpret inputs"));
    try {
      if (!baseline.sourceSnapshot) throw new Error("Expected captured source");
      const file = await createBuildingSourceFile({ sourceSnapshot: baseline.sourceSnapshot, packedAtlas: baseline.packedAtlas, debugExport: baseline.debugExport });
      const parsed = await parseBuildingSourceFile(JSON.parse(JSON.stringify(file)) as unknown);
      opened = await createAssemblyHallFixture({ sourceSnapshot: parsed.sourceSnapshot, promptControls: parsed.sourceSnapshot.controlsView, reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport }, materialProvider: provider });
      expect(interpreter).not.toHaveBeenCalled(); expect(provider.generate).not.toHaveBeenCalled();
      expect(opened.spec).toEqual(baseline.spec);
      expect(opened.ir).not.toBe(baseline.ir);
      expect(opened.ir.meshBatches[0].positions).not.toBe(baseline.ir.meshBatches[0].positions);
      expect(opened.catalog).not.toBe(baseline.catalog);
      expect(opened.packedAtlas).toBe(parsed.packedAtlas); expect(opened.debugExport).toBe(parsed.debugExport);
      expect(opened.sourceSnapshot?.document.revision).toBe(12);
      expect(opened.promptTrace.psgTrace).toEqual([]);
      expect(opened.promptTrace.diagnostics.some((entry) => entry.code === "building.sourceOpened")).toBe(true);
      for (const name of ["baseColor", "normal", "orm", "height", "opacity"] as const) expect(Array.from(opened.packedAtlas.channels[name].data)).toEqual(Array.from(baseline.packedAtlas.channels[name].data));
    } finally { interpreter.mockRestore(); opened?.familyRuntime.dispose(); baseline.familyRuntime.dispose(); }
  });

  it("rejects a mismatched source controls view before catalog, graph, compiler or provider work", async () => {
    const baseline = await createAssemblyHallFixture({ promptControls: defaultBuildingPromptControls });
    const catalog = vi.spyOn(componentCatalogBuilder, "buildComponentCatalog");
    const graph = vi.spyOn(buildingGraphBuilder, "buildBuildingGraph");
    const compiler = vi.spyOn(buildingCompiler, "compileBuilding");
    const provider: MaterialGenerationProvider = { id: "source-open-guard", generate: vi.fn(async () => { throw new Error("Unexpected provider call"); }) };
    try {
      if (!baseline.sourceSnapshot) throw new Error("Expected captured source");
      await expect(createAssemblyHallFixture({ sourceSnapshot: baseline.sourceSnapshot, promptControls: { ...baseline.sourceSnapshot.controlsView, windowFamily: "tall-rectangular" }, reusableArtifacts: { packedAtlas: baseline.packedAtlas, debugExport: baseline.debugExport }, materialProvider: provider })).rejects.toMatchObject({ code: "building.sourceFileInvalid" });
      expect(catalog).not.toHaveBeenCalled(); expect(graph).not.toHaveBeenCalled(); expect(compiler).not.toHaveBeenCalled(); expect(provider.generate).not.toHaveBeenCalled();
    } finally { catalog.mockRestore(); graph.mockRestore(); compiler.mockRestore(); baseline.familyRuntime.dispose(); }
  });
});


describe("R2.P4 pinned source factory consumer", () => {
  it("compiles a derived window with the pinned style and retained material artifacts", async () => {
    const controls = {
      ...defaultBuildingPromptControls,
      seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" },
      lockedComponentKeys: []
    };
    const interpreter = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    let generated: AssemblyHallFixture | undefined;
    let pinnedFixture: AssemblyHallFixture | undefined;
    let editedFixture: AssemblyHallFixture | undefined;
    const provider: MaterialGenerationProvider = { id: 'p4-pinned-source-forbidden-provider', generate: vi.fn(async () => { throw new Error('A pinned source edit cannot regenerate materials.'); }) };
    try {
      generated = await createAssemblyHallFixture({ promptControls: controls });
      expect(interpreter).toHaveBeenCalled();
      interpreter.mockClear();
      if (!generated.sourceSnapshot) throw new Error("Expected captured original inputs.");
      const style = structuredClone(generated.sourceSnapshot.stylePack);
      style.massing.floorHeightM.typical.min = 4.25;
      style.massing.floorHeightM.typical.max = 4.25;
      const pinned = await createBuildingSourceSnapshot({
        documentId: "p4-factory-pinned", revision: 7, controls,
        intent: generated.sourceSnapshot.intent, stylePack: style
      });
      pinnedFixture = await createAssemblyHallFixture({
        sourceSnapshot: pinned.sourceSnapshot, promptControls: pinned.sourceSnapshot.controlsView,
        reusableArtifacts: { packedAtlas: generated.packedAtlas, debugExport: generated.debugExport },
        materialProvider: provider
      });
      const windowFamily = pinned.sourceSnapshot.stylePack.componentFamilies.windows.find((family) => family !== controls.windowFamily);
      if (!windowFamily) throw new Error("Expected a second permitted window family.");
      const edited = await deriveBuildingSourceWindowEdit({ sourceSnapshot: pinned.sourceSnapshot, windowFamily });
      editedFixture = await createAssemblyHallFixture({
        sourceSnapshot: edited, promptControls: edited.controlsView,
        reusableArtifacts: { catalog: pinnedFixture.catalog, packedAtlas: pinnedFixture.packedAtlas, debugExport: pinnedFixture.debugExport },
        materialProvider: provider
      });
      expect(interpreter).not.toHaveBeenCalled();
      expect(provider.generate).not.toHaveBeenCalled();
      expect(editedFixture.sourceSnapshot?.stylePack).toEqual(style);
      expect(editedFixture.spec.massing.floorHeightsM).toEqual(pinnedFixture.spec.massing.floorHeightsM);
      expect(editedFixture.sourceSnapshot?.document.revision).toBe(7);
      expect(editedFixture.spec.selectedFamilies.window).toBe(windowFamily);
      expect(editedFixture.catalog).not.toBe(pinnedFixture.catalog);
      expect(editedFixture.ir).not.toBe(pinnedFixture.ir);
      for (const [batchId, suffix] of [["instances.window", "frame"], ["instances.window.glass", "glass"]] as const) {
        const recipeId = "recipe.window." + windowFamily + "." + suffix;
        expect(editedFixture.ir.instanceBatches.find((batch) => batch.batchId === batchId)?.recipeId).toBe(recipeId);
        expect(editedFixture.buildingRuntime.objectsByBatchId.get(batchId)?.userData.recipeId).toBe(recipeId);
      }
      expect(editedFixture.packedAtlas).toBe(pinnedFixture.packedAtlas);
      expect(editedFixture.debugExport).toBe(pinnedFixture.debugExport);
      for (const name of ["baseColor", "normal", "orm", "height", "opacity"] as const) {
        expect(Array.from(editedFixture.packedAtlas.channels[name].data)).toEqual(Array.from(pinnedFixture.packedAtlas.channels[name].data));
      }
    } finally {
      interpreter.mockRestore();
      editedFixture?.familyRuntime.dispose();
      pinnedFixture?.familyRuntime.dispose();
      generated?.familyRuntime.dispose();
    }
  });
});


describe("R2.P5 versioned floor source factory consumer", () => {
  it("compiles authored floors then a window using pinned style, exact materials and fresh IR", async () => {
    const controls = { ...defaultBuildingPromptControls, seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" }, lockedComponentKeys: [] };
    const interpreter = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const evaluate = vi.spyOn(psgEvaluator, "evaluatePsg");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const provider: MaterialGenerationProvider = { id: "p5-floor-forbidden-provider", generate: vi.fn(async () => { throw new Error("An authored floor edit cannot regenerate materials."); }) };
    const owned: AssemblyHallFixture[] = [];
    try {
      const generated = await createAssemblyHallFixture({ promptControls: controls }); owned.push(generated);
      expect(interpreter).toHaveBeenCalled(); expect(evaluate).toHaveBeenCalled(); expect(generate).toHaveBeenCalled();
      interpreter.mockClear(); evaluate.mockClear(); generate.mockClear();
      if (!generated.sourceSnapshot) throw new Error("Expected captured source");
      const style = structuredClone(generated.sourceSnapshot.stylePack);
      style.massing.floorHeightM.typical.min = 4.25; style.massing.floorHeightM.typical.max = 4.25;
      const pinned = await createBuildingSourceSnapshot({ documentId: "p5-factory-floor", revision: 7, controls, intent: generated.sourceSnapshot.intent, stylePack: style });
      const initial = await createAssemblyHallFixture({ sourceSnapshot: pinned.sourceSnapshot, promptControls: pinned.sourceSnapshot.controlsView,
        reusableArtifacts: { packedAtlas: generated.packedAtlas, debugExport: generated.debugExport }, materialProvider: provider }); owned.push(initial);
      const floorCount = controls.floorCount + 1;
      const floor = await deriveBuildingSourceFloorEdit({ sourceSnapshot: pinned.sourceSnapshot, floorCount });
      const expanded = await createAssemblyHallFixture({ sourceSnapshot: floor, promptControls: floor.controlsView,
        reusableArtifacts: { catalog: initial.catalog, packedAtlas: initial.packedAtlas, debugExport: initial.debugExport }, materialProvider: provider }); owned.push(expanded);
      expect(expanded.sourceSnapshot?.schemaVersion).toBe("0.2.0");
      expect(expanded.sourceSnapshot?.document.authored.floorCount).toBe(floorCount);
      expect(expanded.sourceSnapshot?.document.revision).toBe(7);
      expect(expanded.sourceSnapshot?.stylePack).toEqual(style);
      expect(expanded.spec.massing.floorHeightsM).toHaveLength(floorCount);
      expect(expanded.spec.massing.floorHeightsM.slice(1)).toEqual(Array(floorCount - 1).fill(4.25));
      expect(expanded.catalog).toBe(initial.catalog);
      expect(expanded.ir).not.toBe(initial.ir);
      expect(expanded.ir.meshBatches[0].positions).not.toBe(initial.ir.meshBatches[0].positions);
      for (const batchId of ["instances.window", "instances.window.glass"]) {
        const before = initial.ir.instanceBatches.find((batch) => batch.batchId === batchId);
        const after = expanded.ir.instanceBatches.find((batch) => batch.batchId === batchId);
        expect(before).toBeDefined(); expect(after).toBeDefined();
        expect(after?.count).toBeGreaterThan(before?.count ?? Number.MAX_SAFE_INTEGER);
        expect(after?.transforms).not.toBe(before?.transforms);
        expect(expanded.buildingRuntime.objectsByBatchId.get(batchId)?.userData.recipeId).toBe(after?.recipeId);
      }
      const windowFamily = floor.stylePack.componentFamilies.windows.find((family) => family !== floor.controlsView.windowFamily);
      if (!windowFamily) throw new Error("Expected a second permitted window family");
      const window = await deriveBuildingSourceWindowEdit({ sourceSnapshot: floor, windowFamily });
      const replaced = await createAssemblyHallFixture({ sourceSnapshot: window, promptControls: window.controlsView,
        reusableArtifacts: { catalog: expanded.catalog, packedAtlas: expanded.packedAtlas, debugExport: expanded.debugExport }, materialProvider: provider }); owned.push(replaced);
      expect(replaced.sourceSnapshot?.schemaVersion).toBe("0.2.0");
      expect(replaced.sourceSnapshot?.document.authored.floorCount).toBe(floorCount);
      expect(replaced.spec.massing.floorHeightsM).toEqual(expanded.spec.massing.floorHeightsM);
      expect(replaced.spec.selectedFamilies.window).toBe(windowFamily);
      expect(replaced.ir).not.toBe(expanded.ir);
      expect(replaced.catalog).not.toBe(expanded.catalog);
      for (const [batchId, suffix] of [["instances.window", "frame"], ["instances.window.glass", "glass"]] as const) {
        const recipeId = "recipe.window." + windowFamily + "." + suffix;
        expect(replaced.ir.instanceBatches.find((batch) => batch.batchId === batchId)?.recipeId).toBe(recipeId);
        expect(replaced.buildingRuntime.objectsByBatchId.get(batchId)?.userData.recipeId).toBe(recipeId);
      }
      expect(interpreter).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(provider.generate).not.toHaveBeenCalled();
      for (const fixture of [expanded, replaced]) {
        expect(fixture.packedAtlas).toBe(initial.packedAtlas); expect(fixture.debugExport).toBe(initial.debugExport);
        for (const name of ["baseColor", "normal", "orm", "height", "opacity"] as const) {
          expect(fixture.packedAtlas.channels[name].widthPx).toBe(initial.packedAtlas.channels[name].widthPx);
          expect(fixture.packedAtlas.channels[name].heightPx).toBe(initial.packedAtlas.channels[name].heightPx);
          expect(Array.from(fixture.packedAtlas.channels[name].data)).toEqual(Array.from(initial.packedAtlas.channels[name].data));
        }
      }
    } finally {
      interpreter.mockRestore(); evaluate.mockRestore(); generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20000);
});


describe("R2.P6 canonical trim material dependency coverage", () => {
  it("keeps all actual provider requests stable and compiles a rebuilt trim catalog against accepted materials", async () => {
    const controls = {
      ...defaultBuildingPromptControls,
      seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" },
      lockedComponentKeys: [], trimDensity: "ornate" as const
    };
    const restrainedControls = { ...controls, trimDensity: "restrained" as const };
    const provider = new ProceduralMaterialProvider();
    const generate = vi.spyOn(provider, "generate");
    const owned: AssemblyHallFixture[] = [];
    const names = ["baseColor", "normal", "orm", "height", "opacity"] as const;
    try {
      const ornate = await createAssemblyHallFixture({ promptControls: controls, materialProvider: provider }); owned.push(ornate);
      expect(generate).toHaveBeenCalledTimes(12);
      const ornateRequests: MaterialSourceRequest[] = generate.mock.calls.map(([request]) => structuredClone(request));
      expect(new Set(ornateRequests.map((request) => request.sourceId)).size).toBe(12);
      const byteCopies = new Map(names.map((name) => [name, Array.from(ornate.packedAtlas.channels[name].data)] as const));
      const manifestBefore = JSON.stringify(ornate.packedAtlas.manifest);
      const provenanceBefore = JSON.stringify(ornate.packedAtlas.slotProvenance);
      const contentHashBefore = ornate.packedAtlas.contentHash;
      const debugBefore = JSON.stringify(ornate.debugExport);
      generate.mockClear();

      // Independent fresh creation records actual provider inputs; planner IDs may differ.
      const restrained = await createAssemblyHallFixture({ promptControls: restrainedControls, materialProvider: provider }); owned.push(restrained);
      expect(generate).toHaveBeenCalledTimes(12);
      const restrainedRequests: MaterialSourceRequest[] = generate.mock.calls.map(([request]) => structuredClone(request));
      expect(restrainedRequests).toEqual(ornateRequests);
      expect(restrained.spec.componentParameters.trimDensity).toBe("restrained");
      expect(ornate.spec.componentParameters.trimDensity).toBe("ornate");
      expect(restrained.spec.familyId).not.toBe(ornate.spec.familyId);
      generate.mockClear();

      // Density-only reuse supplies the accepted materials and deliberately omits catalog.
      const reused = await createAssemblyHallFixture({
        promptControls: restrainedControls, materialProvider: provider,
        reusableArtifacts: { packedAtlas: ornate.packedAtlas, debugExport: ornate.debugExport }
      }); owned.push(reused);
      expect(generate).not.toHaveBeenCalled();
      expect(reused.spec).toEqual(restrained.spec);
      expect(reused.spec.componentParameters.trimDensity).toBe("restrained");
      expect(reused.sourceSnapshot?.schemaVersion).toBe("0.1.0");
      expect(reused.sourceSnapshot?.controlsView.trimDensity).toBe("restrained");
      expect(reused.catalog).not.toBe(ornate.catalog);
      expect(reused.catalog).not.toBe(restrained.catalog);
      expect(reused.catalog.atlasId).toBe(ornate.packedAtlas.atlasId);
      expect(reused.ir).not.toBe(ornate.ir);
      expect(reused.ir).not.toBe(restrained.ir);
      expect(reused.ir.meshBatches[0].positions).not.toBe(ornate.ir.meshBatches[0].positions);
      const acceptedSlotIds = new Set(ornate.packedAtlas.manifest.slots.map((slot) => slot.id));
      expect(acceptedSlotIds.size).toBe(12);
      expect(reused.catalog.recipes.length).toBeGreaterThan(0);
      for (const recipe of reused.catalog.recipes) {
        expect(recipe.atlasSlotIds.length).toBeGreaterThan(0);
        for (const slotId of recipe.atlasSlotIds) expect(acceptedSlotIds.has(slotId)).toBe(true);
      }
      expect(reused.catalog.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      expect(reused.packedAtlas).toBe(ornate.packedAtlas);
      expect(reused.debugExport).toBe(ornate.debugExport);
      expect(JSON.stringify(reused.packedAtlas.manifest)).toBe(manifestBefore);
      expect(JSON.stringify(reused.packedAtlas.slotProvenance)).toBe(provenanceBefore);
      expect(reused.packedAtlas.contentHash).toBe(contentHashBefore);
      expect(JSON.stringify(reused.debugExport)).toBe(debugBefore);
      for (const name of names) {
        expect(reused.packedAtlas.channels[name].widthPx).toBe(ornate.packedAtlas.channels[name].widthPx);
        expect(reused.packedAtlas.channels[name].heightPx).toBe(ornate.packedAtlas.channels[name].heightPx);
        expect(Array.from(reused.packedAtlas.channels[name].data)).toEqual(byteCopies.get(name));
        expect(Array.from(ornate.packedAtlas.channels[name].data)).toEqual(byteCopies.get(name));
      }
    } finally {
      generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);
});


describe("R2.P7 authored bay source factory consumer", () => {
  it("compiles seven front bays with pinned prior authorities and exact accepted material bytes", async () => {
    const controls = { ...defaultBuildingPromptControls, bayCount: 6,
      seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" }, lockedComponentKeys: [] };
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const evaluate = vi.spyOn(psgEvaluator, "evaluatePsg");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const forbidden: MaterialGenerationProvider = { id: "p7-bay-forbidden-provider", generate: vi.fn(async () => { throw new Error("An authored bay edit cannot regenerate materials."); }) };
    const owned: AssemblyHallFixture[] = [];
    try {
      const generated = await createAssemblyHallFixture({ promptControls: controls }); owned.push(generated);
      expect(interpret).toHaveBeenCalled(); expect(evaluate).toHaveBeenCalled(); expect(generate).toHaveBeenCalled();
      interpret.mockClear(); evaluate.mockClear(); generate.mockClear();
      if (!generated.sourceSnapshot) throw new Error("Expected captured source");
      const style = structuredClone(generated.sourceSnapshot.stylePack);
      style.massing.floorHeightM.typical.min = 4.25; style.massing.floorHeightM.typical.max = 4.25;
      const pinned = await createBuildingSourceSnapshot({ documentId: "p7-factory-bays", revision: 7, controls, intent: generated.sourceSnapshot.intent, stylePack: style });
      const v2 = await deriveBuildingSourceFloorEdit({ sourceSnapshot: pinned.sourceSnapshot, floorCount: 5 });
      const six = await createAssemblyHallFixture({ sourceSnapshot: v2, promptControls: v2.controlsView,
        reusableArtifacts: { packedAtlas: generated.packedAtlas, debugExport: generated.debugExport }, materialProvider: forbidden }); owned.push(six);
      expect(six.spec.facade.frontBayCount).toBe(6);
      const v3 = await deriveBuildingSourceBayEdit({ sourceSnapshot: v2, bayCount: 7 });
      const seven = await createAssemblyHallFixture({ sourceSnapshot: v3, promptControls: v3.controlsView,
        reusableArtifacts: { packedAtlas: six.packedAtlas, debugExport: six.debugExport }, materialProvider: forbidden }); owned.push(seven);
      expect(seven.sourceSnapshot?.schemaVersion).toBe("0.3.0");
      expect(seven.sourceSnapshot?.document.authored).toEqual({ floorCount: 5, bayCount: 7, windowFamily: controls.windowFamily });
      expect(seven.sourceSnapshot?.document.revision).toBe(7);
      expect(seven.sourceSnapshot?.stylePack).toEqual(style);
      expect(seven.spec.facade.frontBayCount).toBe(7);
      expect(seven.spec.componentParameters.requestedBayCount).toBe(7);
      expect(seven.spec.massing.floorHeightsM).toEqual(six.spec.massing.floorHeightsM);
      expect(seven.spec.massing.floorHeightsM.slice(1)).toEqual(Array(4).fill(4.25));
      expect(seven.ir).not.toBe(six.ir);
      expect(seven.ir.meshBatches[0].positions).not.toBe(six.ir.meshBatches[0].positions);
      const edges = seven.ir.semanticIndex.filter((entry) => entry.batchId === "mesh.vertical-pilasters")
        .map((entry) => entry.semanticPath.match(/(?:^|\/)facade\/front\/bay-edge\/(\d+)\/pilaster\/layer\//)?.[1])
        .filter((value): value is string => value !== undefined).map(Number);
      expect([...new Set(edges)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      const pilasters = seven.ir.meshBatches.find((batch) => batch.batchId === "mesh.vertical-pilasters");
      expect(pilasters?.positions?.length).toBeGreaterThan(0);
      expect(seven.buildingRuntime.objectsByBatchId.get("mesh.vertical-pilasters")?.userData.batchId).toBe("mesh.vertical-pilasters");
      for (const batchId of ["instances.window", "instances.window.glass"]) {
        const previous = six.ir.instanceBatches.find((batch) => batch.batchId === batchId);
        const current = seven.ir.instanceBatches.find((batch) => batch.batchId === batchId);
        expect(previous).toBeDefined(); expect(current).toBeDefined();
        expect(current?.count).toBeGreaterThan(previous?.count ?? Number.MAX_SAFE_INTEGER);
        expect(current?.transforms).not.toBe(previous?.transforms);
        expect(seven.buildingRuntime.objectsByBatchId.get(batchId)?.userData.recipeId).toBe(current?.recipeId);
      }
      expect(interpret).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(forbidden.generate).not.toHaveBeenCalled();
      expect(seven.packedAtlas).toBe(six.packedAtlas); expect(seven.debugExport).toBe(six.debugExport);
      expect(seven.catalog.atlasId).toBe(six.packedAtlas.atlasId);
      const slots = new Set(six.packedAtlas.manifest.slots.map((slot) => slot.id));
      for (const recipe of seven.catalog.recipes) for (const slot of recipe.atlasSlotIds) expect(slots.has(slot)).toBe(true);
      for (const name of ["baseColor", "normal", "orm", "height", "opacity"] as const) {
        expect(seven.packedAtlas.channels[name].widthPx).toBe(six.packedAtlas.channels[name].widthPx);
        expect(seven.packedAtlas.channels[name].heightPx).toBe(six.packedAtlas.channels[name].heightPx);
        expect(Array.from(seven.packedAtlas.channels[name].data)).toEqual(Array.from(six.packedAtlas.channels[name].data));
      }
      const saved = await createBuildingSourceFile({ sourceSnapshot: v3, packedAtlas: seven.packedAtlas, debugExport: seven.debugExport });
      const opened = await parseBuildingSourceFile(JSON.parse(JSON.stringify(saved)) as unknown);
      expect(opened.file.model).toBe("building-parameter-source-v3");
      expect(opened.sourceSnapshot.document.authored).toEqual(v3.document.authored);
    } finally {
      interpret.mockRestore(); evaluate.mockRestore(); generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);
});

describe("R2.P8 fresh roof fixture causality", () => {
  it("rebuilds flat-gable-flat roof catalogs and current runtime geometry while retaining every accepted material byte", async () => {
    const { computeBuildingInvalidation } = await import("../core/invalidation");
    const flatControls: typeof defaultBuildingPromptControls = structuredClone(defaultBuildingPromptControls);
    flatControls.roofType = "flat";
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const forbidden: MaterialGenerationProvider = {
      id: "p8-roof-forbidden-provider",
      generate: vi.fn(async () => { throw new Error("A roof control edit cannot regenerate material artifacts."); })
    };
    const owned: AssemblyHallFixture[] = [];
    const names = ["baseColor", "normal", "orm", "height", "opacity"] as const;
    try {
      const flat = await createAssemblyHallFixture({ promptControls: flatControls }); owned.push(flat);
      expect(generate).toHaveBeenCalledTimes(12);
      const before = {
        atlas: JSON.stringify({ ...flat.packedAtlas, channels: Object.fromEntries(names.map(name => {
          const layer = flat.packedAtlas.channels[name];
          return [name, { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, byteLength: layer.data.byteLength }];
        })) }),
        debug: JSON.stringify(flat.debugExport),
        raw: names.map(name => ({ name, bytes: Array.from(flat.packedAtlas.channels[name].data) }))
      };
      generate.mockClear();
      const gableControls: typeof defaultBuildingPromptControls = { ...structuredClone(flatControls), roofType: "gable" };
      const up = computeBuildingInvalidation(flatControls, gableControls);
      expect(up.changedControls).toEqual(["roofType"]);
      expect(up.materialGenerationRequired).toBe(false);
      expect(up.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
      const gableReuse = {
        ...(up.reusableArtifacts.packedAtlas ? { packedAtlas: flat.packedAtlas, debugExport: flat.debugExport } : {}),
        ...(up.reusableArtifacts.componentCatalog ? { catalog: flat.catalog } : {})
      };
      expect(Object.hasOwn(gableReuse, "catalog")).toBe(false);
      const gable = await createAssemblyHallFixture({ promptControls: gableControls, reusableArtifacts: gableReuse, materialProvider: forbidden }); owned.push(gable);
      const down = computeBuildingInvalidation(gableControls, flatControls);
      expect(down.changedControls).toEqual(["roofType"]);
      expect(down.materialGenerationRequired).toBe(false);
      expect(down.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
      const flatReuse = {
        ...(down.reusableArtifacts.packedAtlas ? { packedAtlas: gable.packedAtlas, debugExport: gable.debugExport } : {}),
        ...(down.reusableArtifacts.componentCatalog ? { catalog: gable.catalog } : {})
      };
      expect(Object.hasOwn(flatReuse, "catalog")).toBe(false);
      const restored = await createAssemblyHallFixture({ promptControls: flatControls, reusableArtifacts: flatReuse, materialProvider: forbidden }); owned.push(restored);
      expect(generate).not.toHaveBeenCalled(); expect(forbidden.generate).not.toHaveBeenCalled();
      expect(gable.catalog).not.toBe(flat.catalog); expect(restored.catalog).not.toBe(gable.catalog);
      expect(gable.catalog.catalogId).not.toBe(flat.catalog.catalogId); expect(restored.catalog.catalogId).toBe(flat.catalog.catalogId);
      expect(gable.ir).not.toBe(flat.ir); expect(restored.ir).not.toBe(gable.ir);
      expect(gable.buildingRuntime.root).not.toBe(flat.buildingRuntime.root); expect(restored.buildingRuntime.root).not.toBe(gable.buildingRuntime.root);
      const expected = [[flat, "flat", "flatRoof"], [gable, "gable", "gableRoof"], [restored, "flat", "flatRoof"]] as const;
      const roofPositions: number[][] = [];
      for (const [fixture, type, kind] of expected) {
        expect(fixture.spec.massing.roof.type).toBe(type);
        const recipe = fixture.catalog.recipes.find(candidate => candidate.role === "roof");
        if (!recipe) throw new Error("Expected a roof component recipe");
        expect(recipe.kind).toBe(kind);
        expect(recipe.id).toBe("recipe.roof." + fixture.spec.selectedFamilies.roof);
        expect(recipe.atlasSlotIds).toEqual(["roof.primary"]);
        expect(fixture.graph.nodes.find(node => node.id === "node.roof")?.parameters).toMatchObject({ recipeId: recipe.id, roofType: type });
        const batch = fixture.ir.meshBatches.find(candidate => candidate.batchId === "mesh.roof");
        if (!batch?.positions || !batch.normals || !batch.indices || !batch.uvs) throw new Error("Expected complete indexed roof IR buffers");
        expect(batch.role).toBe("roof"); expect(batch.materialSlotId).toBe("roof.primary");
        const entry = fixture.ir.semanticIndex.find(candidate => candidate.batchId === "mesh.roof");
        if (!entry) throw new Error("Expected roof semantic ownership");
        expect(entry.semanticPath.endsWith("/roof/primary")).toBe(true);
        expect(entry.stage).toBe("roof"); expect(entry.elementIndex).toBe(0);
        const object = fixture.buildingRuntime.objectsByBatchId.get("mesh.roof");
        if (!object) throw new Error("Expected the current roof runtime object");
        expect(object.userData).toMatchObject({ batchId: "mesh.roof", role: "roof", stage: "roof", materialSlotId: "roof.primary", rendererBoundary: "building-family" });
        expect(fixture.buildingRuntime.semanticLookup.get(entry.semanticPath)?.object).toBe(object);
        expect(Array.from(object.geometry.getAttribute("position").array)).toEqual(Array.from(batch.positions));
        const index = object.geometry.getIndex(); if (!index) throw new Error("Expected submitted roof indices");
        expect(Array.from(index.array)).toEqual(Array.from(batch.indices));
        const slot = fixture.packedAtlas.manifest.slots.find(candidate => candidate.id === "roof.primary");
        if (!slot) throw new Error("Accepted atlas must cover the roof role");
        expect(object.material.userData.atlasSlot).toMatchObject({ slotId: "roof.primary", rectPx: slot.rectPx });
        const positions = Array.from(batch.positions); roofPositions.push(positions);
        const eave = fixture.spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0);
        const top = type === "gable"
          ? eave + Math.tan((fixture.spec.massing.roof.pitchDegrees ?? 28) * Math.PI / 180) * fixture.spec.massing.depthM / 2
          : eave + Math.max(0.01, fixture.spec.massing.parapetHeightM);
        const ys = positions.filter((_, i) => i % 3 === 1);
        expect(Math.abs(Math.min(...ys) - eave)).toBeLessThanOrEqual(0.00002);
        expect(Math.abs(Math.max(...ys) - top)).toBeLessThanOrEqual(0.00002);
        expect(fixture.catalog.atlasId).toBe(flat.packedAtlas.atlasId);
        const slots = new Set(flat.packedAtlas.manifest.slots.map(candidate => candidate.id));
        for (const component of fixture.catalog.recipes) for (const id of component.atlasSlotIds) expect(slots.has(id)).toBe(true);
        expect(fixture.catalog.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
        expect(fixture.packedAtlas).toBe(flat.packedAtlas); expect(fixture.debugExport).toBe(flat.debugExport);
        expect(JSON.stringify({ ...fixture.packedAtlas, channels: Object.fromEntries(names.map(name => {
          const layer = fixture.packedAtlas.channels[name];
          return [name, { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, byteLength: layer.data.byteLength }];
        })) })).toBe(before.atlas);
        expect(JSON.stringify(fixture.debugExport)).toBe(before.debug);
        for (const row of before.raw) expect(Array.from(fixture.packedAtlas.channels[row.name].data)).toEqual(row.bytes);
      }
      expect(roofPositions[1]).not.toEqual(roofPositions[0]); expect(roofPositions[2]).toEqual(roofPositions[0]);
      expect(gable.ir.meshBatches.find(batch => batch.batchId === "mesh.roof")?.positions).not.toBe(flat.ir.meshBatches.find(batch => batch.batchId === "mesh.roof")?.positions);
    } finally {
      generate.mockRestore(); for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);
});


describe("R2.P8.1 roof-independent facade placement", () => {
  it("preserves every nonroof buffer through an invalidation-driven flat-gable-flat rebuild", async () => {
    const { computeBuildingInvalidation } = await import("../core/invalidation");
    const { sha256Hex } = await import("../core/contentHash");
    const controls: typeof defaultBuildingPromptControls = {
      ...structuredClone(defaultBuildingPromptControls), roofType: "flat",
      seeds: { family: "fam", building: "building-seed-variant-07", material: "mat", trim: "trim" }
    };
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const forbidden: MaterialGenerationProvider = {
      id: "p81-roof-forbidden-provider",
      generate: vi.fn(async () => { throw new Error("A roof edit cannot regenerate material artifacts."); })
    };
    const names = ["baseColor", "normal", "orm", "height", "opacity"] as const;
    const owned: AssemblyHallFixture[] = [];
    const rawView = async (view: ArrayBufferView | undefined) => view ? {
      type: view.constructor.name, byteLength: view.byteLength,
      sha256: await sha256Hex(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    } : null;
    const protectedBuffers = async (fixture: AssemblyHallFixture) => ({
      meshes: await Promise.all(fixture.ir.meshBatches.filter(batch => batch.batchId !== "mesh.roof").map(async batch => ({
        batchId: batch.batchId, role: batch.role, materialSlotId: batch.materialSlotId,
        positions: await rawView(batch.positions), normals: await rawView(batch.normals),
        uvs: await rawView(batch.uvs), indices: await rawView(batch.indices)
      }))),
      instances: await Promise.all(fixture.ir.instanceBatches.map(async batch => ({
        batchId: batch.batchId, recipeId: batch.recipeId, count: batch.count,
        materialSlotId: batch.materialSlotId, transforms: await rawView(batch.transforms)
      }))),
      semanticIndex: fixture.ir.semanticIndex.filter(entry => entry.batchId !== "mesh.roof")
    });
    const materialMetadata = (fixture: AssemblyHallFixture) => JSON.stringify({
      atlas: { ...fixture.packedAtlas, channels: Object.fromEntries(names.map(name => {
        const layer = fixture.packedAtlas.channels[name];
        return [name, { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, byteLength: layer.data.byteLength }];
      })) }, debug: fixture.debugExport
    });
    try {
      const flat = await createAssemblyHallFixture({ promptControls: controls }); owned.push(flat);
      expect(generate).toHaveBeenCalledTimes(12);
      const metadataBefore = materialMetadata(flat);
      const materialBefore = names.map(name => ({ name, bytes: Array.from(flat.packedAtlas.channels[name].data) }));
      const protectedBefore = await protectedBuffers(flat);
      generate.mockClear();
      const gableControls: typeof defaultBuildingPromptControls = { ...structuredClone(controls), roofType: "gable" };
      const up = computeBuildingInvalidation(controls, gableControls);
      expect(up.changedControls).toEqual(["roofType"]);
      expect(up.materialGenerationRequired).toBe(false);
      expect(up.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
      const gableReuse = {
        ...(up.reusableArtifacts.packedAtlas ? { packedAtlas: flat.packedAtlas, debugExport: flat.debugExport } : {}),
        ...(up.reusableArtifacts.componentCatalog ? { catalog: flat.catalog } : {})
      };
      expect(Object.hasOwn(gableReuse, "catalog")).toBe(false);
      const gable = await createAssemblyHallFixture({ promptControls: gableControls, reusableArtifacts: gableReuse, materialProvider: forbidden }); owned.push(gable);
      const down = computeBuildingInvalidation(gableControls, controls);
      expect(down.changedControls).toEqual(["roofType"]);
      expect(down.materialGenerationRequired).toBe(false);
      expect(down.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
      const flatReuse = {
        ...(down.reusableArtifacts.packedAtlas ? { packedAtlas: gable.packedAtlas, debugExport: gable.debugExport } : {}),
        ...(down.reusableArtifacts.componentCatalog ? { catalog: gable.catalog } : {})
      };
      expect(Object.hasOwn(flatReuse, "catalog")).toBe(false);
      const restored = await createAssemblyHallFixture({ promptControls: controls, reusableArtifacts: flatReuse, materialProvider: forbidden }); owned.push(restored);
      expect(generate).not.toHaveBeenCalled(); expect(forbidden.generate).not.toHaveBeenCalled();
      expect(gable.catalog).not.toBe(flat.catalog); expect(restored.catalog).not.toBe(gable.catalog);
      expect(gable.catalog.catalogId).not.toBe(flat.catalog.catalogId);
      expect(restored.catalog.catalogId).toBe(flat.catalog.catalogId);
      expect(gable.graph.graphId).not.toBe(flat.graph.graphId);
      expect(gable.ir.sourceGraphHash).not.toBe(flat.ir.sourceGraphHash);
      expect(gable.ir).not.toBe(flat.ir); expect(restored.ir).not.toBe(gable.ir);
      expect(gable.buildingRuntime.root).not.toBe(flat.buildingRuntime.root);
      expect(restored.buildingRuntime.root).not.toBe(gable.buildingRuntime.root);
      const roofRows = [];
      const expected = [[flat, "flat", "flatRoof"], [gable, "gable", "gableRoof"], [restored, "flat", "flatRoof"]] as const;
      for (const [fixture, type, kind] of expected) {
        expect(fixture.spec.massing.roof.type).toBe(type);
        const recipe = fixture.catalog.recipes.find(candidate => candidate.role === "roof");
        if (!recipe) throw new Error("Expected a roof recipe");
        expect(recipe.kind).toBe(kind);
        expect(recipe.id).toBe("recipe.roof." + fixture.spec.selectedFamilies.roof);
        expect(recipe.atlasSlotIds).toEqual(["roof.primary"]);
        expect(fixture.graph.nodes.find(node => node.id === "node.roof")?.parameters).toMatchObject({ recipeId: recipe.id, roofType: type });
        const batch = fixture.ir.meshBatches.find(candidate => candidate.batchId === "mesh.roof");
        if (!batch?.positions || !batch.normals || !batch.uvs || !batch.indices) throw new Error("Expected complete roof buffers");
        const object = fixture.buildingRuntime.objectsByBatchId.get("mesh.roof");
        if (!object) throw new Error("Expected the current roof runtime object");
        expect(object.userData).toMatchObject({ batchId: "mesh.roof", role: "roof", materialSlotId: "roof.primary" });
        expect(Array.from(object.geometry.getAttribute("position").array)).toEqual(Array.from(batch.positions));
        const index = object.geometry.getIndex(); if (!index) throw new Error("Expected current roof indices");
        expect(Array.from(index.array)).toEqual(Array.from(batch.indices));
        const ys = Array.from(batch.positions).filter((_, i) => i % 3 === 1);
        const eave = fixture.spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0);
        const top = type === "gable"
          ? eave + Math.tan((fixture.spec.massing.roof.pitchDegrees ?? 28) * Math.PI / 180) * fixture.spec.massing.depthM / 2
          : eave + Math.max(0.01, fixture.spec.massing.parapetHeightM);
        expect(Math.abs(Math.min(...ys) - eave)).toBeLessThanOrEqual(0.00002);
        expect(Math.abs(Math.max(...ys) - top)).toBeLessThanOrEqual(0.00002);
        roofRows.push({ positions: await rawView(batch.positions), normals: await rawView(batch.normals), uvs: await rawView(batch.uvs), indices: await rawView(batch.indices) });
        expect(fixture.packedAtlas).toBe(flat.packedAtlas); expect(fixture.debugExport).toBe(flat.debugExport);
        expect(materialMetadata(fixture)).toBe(metadataBefore);
        for (const row of materialBefore) expect(Array.from(fixture.packedAtlas.channels[row.name].data)).toEqual(row.bytes);
        expect(fixture.catalog.atlasId).toBe(flat.packedAtlas.atlasId);
        const slots = new Set(flat.packedAtlas.manifest.slots.map(slot => slot.id));
        for (const component of fixture.catalog.recipes) for (const slot of component.atlasSlotIds) expect(slots.has(slot)).toBe(true);
        expect(fixture.catalog.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
      }
      expect(roofRows[1]).not.toEqual(roofRows[0]); expect(roofRows[2]).toEqual(roofRows[0]);
      console.log("R2_P81_FACTORY_POSITIVE_CONTROLS " + JSON.stringify({ providerCallsBefore: 12, providerCallsAfter: generate.mock.calls.length,
        forbiddenProviderCalls: vi.mocked(forbidden.generate).mock.calls.length, channels: names.length,
        materialBytes: materialBefore.reduce((total, row) => total + row.bytes.length, 0), roofs: roofRows }));
      // First desired failure on the old normalizer, after real roof/material controls.
      expect(gable.spec.familyId).toBe(flat.spec.familyId);
      expect(restored.spec.familyId).toBe(flat.spec.familyId);
      expect(gable.ir.buildingId).toBe(flat.ir.buildingId); expect(restored.ir.buildingId).toBe(flat.ir.buildingId);
      expect(await protectedBuffers(gable)).toEqual(protectedBefore);
      expect(await protectedBuffers(restored)).toEqual(protectedBefore);
    } finally {
      generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);
});


describe("R2.P10 bay catalog factory dependencies", () => {
  it("uses actual invalidation flags to rebuild current widths through a six-seven-six source flow", async () => {
    const { computeBuildingInvalidation } = await import("../core/invalidation");
    const controls = p2AuthoredWindowControls("tall-arched");
    controls.bayCount = 6;
    const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
    const evaluate = vi.spyOn(psgEvaluator, "evaluatePsg");
    const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
    const forbidden: MaterialGenerationProvider = {
      id: "p10-bay-forbidden-provider",
      generate: vi.fn(async () => { throw new Error("A source bay edit cannot regenerate material artifacts."); })
    };
    const owned: AssemblyHallFixture[] = [];
    const roles = ["cornice", "horizontalTrim", "roofCap"] as const;
    const batchIds = ["mesh.cornice", "mesh.belt-course", "mesh.roof-cap"] as const;
    const positionBytes = (fixture: AssemblyHallFixture) => batchIds.map((batchId) => {
      const batch = fixture.ir.meshBatches.find(value => value.batchId === batchId);
      if (!batch?.positions) throw new Error("Expected width-dependent mesh " + batchId);
      const runtime = fixture.buildingRuntime.objectsByBatchId.get(batchId);
      if (!runtime) throw new Error("Expected width-dependent runtime " + batchId);
      expect(Array.from(runtime.geometry.getAttribute("position").array)).toEqual(Array.from(batch.positions));
      return Array.from(new Uint8Array(batch.positions.buffer, batch.positions.byteOffset, batch.positions.byteLength));
    });
    try {
      const generated = await createAssemblyHallFixture({ promptControls: structuredClone(controls) }); owned.push(generated);
      expect(generate).toHaveBeenCalledTimes(12);
      expect(interpret).toHaveBeenCalled(); expect(evaluate).toHaveBeenCalled();
      if (!generated.sourceSnapshot) throw new Error("Expected captured source inputs");
      const stylePack = structuredClone(generated.sourceSnapshot.stylePack);
      stylePack.massing.floorHeightM.typical.min = 4.25;
      stylePack.massing.floorHeightM.typical.max = 4.25;
      const pinned = await createBuildingSourceSnapshot({
        documentId: "p10-factory-bay-widths", revision: 7,
        controls: structuredClone(controls), intent: generated.sourceSnapshot.intent, stylePack
      });
      const floor = await deriveBuildingSourceFloorEdit({ sourceSnapshot: pinned.sourceSnapshot, floorCount: 5 });
      const sixSource = await deriveBuildingSourceRoofEdit({ sourceSnapshot: floor, roofType: "gable" });
      interpret.mockClear(); evaluate.mockClear(); generate.mockClear();
      const six = await createAssemblyHallFixture({
        sourceSnapshot: sixSource, promptControls: structuredClone(sixSource.controlsView),
        reusableArtifacts: { packedAtlas: generated.packedAtlas, debugExport: generated.debugExport },
        materialProvider: forbidden
      }); owned.push(six);
      expect(six.spec.facade.frontBayCount).toBe(6);
      const initialWidth = six.spec.massing.widthM;
      expect(initialWidth).toBeGreaterThan(0);
      const acceptedMaterials = p2MaterialSnapshot(six);
      const acceptedSlots = new Set(six.packedAtlas.manifest.slots.map(slot => slot.id));
      expect(acceptedSlots.size).toBe(12);
      const initialPositions = positionBytes(six);
      const sevenSource = await deriveBuildingSourceBayEdit({ sourceSnapshot: sixSource, bayCount: 7 });
      const returnSource = await deriveBuildingSourceBayEdit({ sourceSnapshot: sevenSource, bayCount: 6 });
      let previous = six;
      let previousControls = structuredClone(sixSource.controlsView);
      for (const [sourceSnapshot, bays] of [[sevenSource, 7], [returnSource, 6]] as const) {
        const nextControls = structuredClone(sourceSnapshot.controlsView);
        const invalidation = computeBuildingInvalidation(previousControls, nextControls);
        expect(invalidation.changedControls).toEqual(["bayCount"]);
        expect(invalidation.materialGenerationRequired).toBe(false);
        expect(invalidation.reusableArtifacts).toEqual({ materialSources: true, packedAtlas: true, componentCatalog: false });
        const reusableArtifacts = {
          ...(invalidation.reusableArtifacts.packedAtlas ? { packedAtlas: previous.packedAtlas, debugExport: previous.debugExport } : {}),
          ...(invalidation.reusableArtifacts.componentCatalog ? { catalog: previous.catalog } : {})
        };
        expect(Object.hasOwn(reusableArtifacts, "catalog")).toBe(false);
        const current = await createAssemblyHallFixture({
          sourceSnapshot, promptControls: nextControls, reusableArtifacts, materialProvider: forbidden
        }); owned.push(current);
        expect(current.spec.facade.frontBayCount).toBe(bays);
        expect(current.spec.massing.widthM).toBeCloseTo(initialWidth + (bays === 7 ? 3.8 : 0), 12);
        expect(current.spec.massing.widthM - previous.spec.massing.widthM).toBeCloseTo(bays === 7 ? 3.8 : -3.8, 12);
        expect(current.catalog).not.toBe(previous.catalog);
        expect(current.catalog.catalogId).not.toBe(previous.catalog.catalogId);
        expect(current.ir).not.toBe(previous.ir);
        expect(current.buildingRuntime.root).not.toBe(previous.buildingRuntime.root);
        for (const role of roles) {
          const recipes = current.catalog.recipes.filter(recipe => recipe.role === role);
          expect(recipes).toHaveLength(1);
          expect(recipes[0]?.dimensionsM.width).toBe(current.spec.massing.widthM);
        }
        expect(current.sourceSnapshot).toEqual(sourceSnapshot);
        expect(current.sourceSnapshot?.document.authored).toEqual({ ...sixSource.document.authored, bayCount: bays });
        expect(current.sourceSnapshot?.stylePack).toEqual(stylePack);
        expect(current.sourceSnapshot?.document.revision).toBe(7);
        expect(current.spec.massing.roof.type).toBe("gable");
        expect(current.spec.massing.floorCount).toBe(5);
        expect(current.spec.massing.floorHeightsM.slice(1)).toEqual([4.25, 4.25, 4.25, 4.25]);
        expect(current.spec.selectedFamilies.window).toBe("tall-arched");
        expect(current.catalog.atlasId).toBe(six.packedAtlas.atlasId);
        for (const recipe of current.catalog.recipes) for (const slotId of recipe.atlasSlotIds) expect(acceptedSlots.has(slotId)).toBe(true);
        expect(current.catalog.diagnostics.filter(value => value.severity === "error")).toEqual([]);
        expect(current.packedAtlas).toBe(six.packedAtlas); expect(current.debugExport).toBe(six.debugExport);
        expect(p2MaterialSnapshot(current)).toEqual(acceptedMaterials);
        const positions = positionBytes(current);
        for (let index = 0; index < batchIds.length; index++) {
          if (bays === 7) expect(positions[index]).not.toEqual(initialPositions[index]);
          else expect(positions[index]).toEqual(initialPositions[index]);
        }
        previous = current;
        previousControls = nextControls;
      }
      expect(p2MaterialSnapshot(six)).toEqual(acceptedMaterials);
      expect(interpret).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled(); expect(forbidden.generate).not.toHaveBeenCalled();
    } finally {
      interpret.mockRestore(); evaluate.mockRestore(); generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);

  it("generates twelve sources for an ordinary mixed bay and material-seed change", async () => {
    const { computeBuildingInvalidation } = await import("../core/invalidation");
    const controls = p2AuthoredWindowControls("tall-arched");
    controls.bayCount = 6;
    const provider = new ProceduralMaterialProvider();
    const generate = vi.spyOn(provider, "generate");
    const owned: AssemblyHallFixture[] = [];
    try {
      const initial = await createAssemblyHallFixture({ promptControls: structuredClone(controls), materialProvider: provider }); owned.push(initial);
      expect(generate).toHaveBeenCalledTimes(12);
      generate.mockClear();
      const nextControls = structuredClone(controls);
      nextControls.bayCount = 7;
      nextControls.seeds.material = "p10-factory-material-positive";
      const invalidation = computeBuildingInvalidation(controls, nextControls);
      expect(invalidation.changedControls).toEqual(["materialSeed", "bayCount"]);
      expect(invalidation.materialGenerationRequired).toBe(true);
      expect(invalidation.reusableArtifacts).toEqual({ materialSources: false, packedAtlas: false, componentCatalog: false });
      const reusableArtifacts = {
        ...(invalidation.reusableArtifacts.packedAtlas ? { packedAtlas: initial.packedAtlas, debugExport: initial.debugExport } : {}),
        ...(invalidation.reusableArtifacts.componentCatalog ? { catalog: initial.catalog } : {})
      };
      expect(reusableArtifacts).toEqual({});
      const current = await createAssemblyHallFixture({ promptControls: nextControls, reusableArtifacts, materialProvider: provider }); owned.push(current);
      expect(generate).toHaveBeenCalledTimes(12);
      expect(new Set(generate.mock.calls.map(([request]) => request.sourceId)).size).toBe(12);
      expect(current.packedAtlas).not.toBe(initial.packedAtlas);
      expect(current.debugExport).not.toBe(initial.debugExport);
      expect(current.catalog).not.toBe(initial.catalog);
      expect(current.spec.facade.frontBayCount).toBe(7);
      expect(current.spec.massing.widthM - initial.spec.massing.widthM).toBeCloseTo(3.8, 12);
      for (const role of ["cornice", "horizontalTrim", "roofCap"]) {
        expect(current.catalog.recipes.find(recipe => recipe.role === role)?.dimensionsM.width).toBe(current.spec.massing.widthM);
      }
      expect(current.catalog.atlasId).toBe(current.packedAtlas.atlasId);
      const slots = new Set(current.packedAtlas.manifest.slots.map(slot => slot.id));
      expect(slots.size).toBe(12);
      for (const recipe of current.catalog.recipes) for (const slotId of recipe.atlasSlotIds) expect(slots.has(slotId)).toBe(true);
      expect(current.catalog.diagnostics.filter(value => value.severity === "error")).toEqual([]);
      expect(Object.keys(current.packedAtlas.channels).sort()).toEqual(["baseColor", "height", "normal", "opacity", "orm"]);
    } finally {
      generate.mockRestore();
      for (const fixture of owned.reverse()) fixture.familyRuntime.dispose();
    }
  }, 20_000);
});
