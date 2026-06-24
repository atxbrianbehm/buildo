import { vi } from "vitest";
import { ProceduralMaterialProvider, type MaterialGenerationProvider } from "../materials/providers/proceduralMaterialProvider";
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
    roofType: "flat";
    trimDensity: "ornate";
    lockedComponentKeys: string[];
  };
  reusableArtifacts?: Pick<AssemblyHallFixture, "catalog" | "debugExport" | "packedAtlas">;
  materialProvider?: MaterialGenerationProvider;
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
  roofType: "flat" as const,
  trimDensity: "ornate" as const,
  lockedComponentKeys: []
};

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
});
