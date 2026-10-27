import {
  createAssemblyHallFixture,
  restoreAssemblyHallFixtureFromCompletedFamilyPacket
} from "../ui/assemblyHallFixture";
import {
  COMPLETED_FAMILY_ARTIFACT_TYPE,
  CompletedFamilyPersistencePacketSchema,
  completedFamilyPersistenceCacheEntry,
  createCompletedFamilyPersistencePacket,
  parseCompletedFamilyPersistencePacket
} from "../state/completedFamilyPersistence";

describe("completed family persistence", () => {
  let fixture: Awaited<ReturnType<typeof createAssemblyHallFixture>>;

  beforeAll(async () => {
    fixture = await createAssemblyHallFixture();
  });

  afterAll(() => {
    fixture.familyRuntime.dispose();
  });

  it("packs a completed fixture into a schema-versioned reload packet without live runtime objects", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-alpha",
      runId: "run-alpha",
      requestHash: "request-alpha",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    expect(packet).toMatchObject({
      schemaVersion: "0.1.0",
      documentId: "family-document-alpha",
      runId: "run-alpha",
      requestHash: "request-alpha",
      createdAt: "2026-06-24T00:00:00.000Z",
      familyId: fixture.spec.familyId,
      buildingId: fixture.ir.buildingId,
      stylePackReference: {
        schemaVersion: "0.1.0",
        stylePackId: fixture.spec.stylePackId,
        sourceIntentHash: fixture.spec.sourceIntentHash
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(packet.artifacts.spec).toEqual(fixture.spec);
    expect(packet.artifacts.atlasManifest).toEqual(fixture.packedAtlas.manifest);
    expect(packet.artifacts.atlasChannels.baseColor.data).toBeInstanceOf(Uint8ClampedArray);
    expect(packet.artifacts.atlasContentHash).toBe(fixture.packedAtlas.contentHash);
    expect(packet.artifacts.componentCatalog).toEqual(fixture.catalog);
    expect(packet.artifacts.graph).toEqual(fixture.graph);
    expect(packet.artifacts.runtimeIr).toEqual(fixture.ir);
    expect(packet.artifacts.componentGallery).toEqual(fixture.componentGallery);
    expect(packet.artifacts.debugExport).toEqual(fixture.debugExport);
    expect(packet.provenance.promptTrace).toEqual(fixture.promptTrace);
    expect(packet.provenance.variantStress).toEqual(fixture.variantStress);
    expect(packet.provenance.remoteMaterialApplication).toBeUndefined();
    expect(packet.provenance.provenanceEntryCount).toBe(fixture.provenanceEntryCount);
    expect("familyRuntime" in packet.artifacts).toBe(false);
    expect("buildingRuntime" in packet.artifacts).toBe(false);
    expect(CompletedFamilyPersistencePacketSchema.parse(packet)).toEqual(packet);
    const restored = parseCompletedFamilyPersistencePacket(structuredClone(packet));
    expect(restored.contentHash).toBe(packet.contentHash);
    expect(restored.artifacts.atlasChannels.baseColor.data.byteLength).toBe(
      packet.artifacts.atlasChannels.baseColor.data.byteLength
    );
    expect(restored.artifacts.runtimeIr.sourceGraphHash).toBe(packet.artifacts.runtimeIr.sourceGraphHash);
  });

  it("restores a completed-family packet into a live Assembly Hall fixture runtime", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-restore",
      runId: "run-restore",
      requestHash: "request-restore",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });

    expect(packet.prompt).toBe(fixture.prompt);

    const restored = await restoreAssemblyHallFixtureFromCompletedFamilyPacket(structuredClone(packet));
    const wallObject = restored.buildingRuntime.objectsByBatchId.get("mesh.wall-panels")!;

    expect(restored).not.toBe(fixture);
    expect(restored.prompt).toBe(fixture.prompt);
    expect(restored.spec).toEqual(packet.artifacts.spec);
    expect(restored.packedAtlas).toMatchObject({
      schemaVersion: "0.1.0",
      atlasId: packet.artifacts.atlasManifest.atlasId,
      manifest: packet.artifacts.atlasManifest,
      contentHash: packet.artifacts.atlasContentHash,
      slotProvenance: packet.artifacts.atlasSlotProvenance
    });
    expect(restored.familyRuntime.textureSet.contentHash).toBe(packet.artifacts.atlasContentHash);
    expect(restored.buildingRuntime.materialRegistry).toBe(restored.familyRuntime.materialRegistry);
    expect(wallObject.material.map).toBe(restored.familyRuntime.textureSet.textures.baseColor);
    expect(wallObject.geometry.userData.atlasSlotUvRect).toEqual(
      wallObject.material.userData.atlasSlot.uvRect
    );
    expect(restored.componentGallery).toEqual(packet.artifacts.componentGallery);
    expect(restored.metrics).toMatchObject({
      activeBackend: "pending",
      atlasContentHash: packet.artifacts.atlasContentHash,
      componentCount: packet.artifacts.componentGallery.entries.length,
      drawCallCount: restored.buildingRuntime.renderables.length,
      instanceCount: packet.artifacts.runtimeIr.metrics.instanceCount,
      triangleCount: packet.artifacts.runtimeIr.metrics.triangleCount,
      textureCount: 5
    });
    expect(restored.provenanceEntryCount).toBe(packet.provenance.provenanceEntryCount);

    restored.familyRuntime.dispose();
  });

  it("adapts the packet to the artifact cache entry keyed by request hash", async () => {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "family-document-beta",
      runId: "run-beta",
      requestHash: "request-beta",
      createdAt: "2026-06-24T00:00:00.000Z",
      fixture
    });
    const entry = completedFamilyPersistenceCacheEntry(packet, {
      createdAt: "2026-06-24T00:01:00.000Z"
    });

    expect(entry).toMatchObject({
      schemaVersion: "0.1.0",
      artifactType: COMPLETED_FAMILY_ARTIFACT_TYPE,
      requestHash: "request-beta",
      contentHash: packet.contentHash,
      createdAt: "2026-06-24T00:01:00.000Z",
      artifact: packet
    });
    expect(entry.dependencies).toEqual([
      fixture.spec.familyId,
      fixture.packedAtlas.atlasId,
      fixture.packedAtlas.contentHash,
      fixture.catalog.catalogId,
      fixture.graph.graphId,
      fixture.ir.sourceGraphHash,
      fixture.ir.buildingId
    ]);
    expect(structuredClone(entry).artifact.contentHash).toBe(packet.contentHash);
  });
});

import { vi } from "vitest";
import { z } from "zod";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import { hashCanonicalJson } from "../core/contentHash";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import * as psgEvaluator from "../../prompt-spaghetti/core/evaluatePsg";

type P11ReplayFixture = Awaited<ReturnType<typeof createAssemblyHallFixture>>;
type P11ReplayIr = Awaited<ReturnType<typeof compileBuilding>>;

const P11ReplayPositiveControlsSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  packetKind: z.literal("buildo-r2-p11-replay-positive-controls"),
  detailLevel: z.enum(["high", "low"]),
  fidelityMode: z.literal("kit"),
  providerBefore: z.literal(12),
  interpreterBefore: z.literal(1),
  psgBefore: z.literal(1),
  providerAfter: z.literal(0),
  interpreterAfter: z.literal(0),
  psgAfter: z.literal(0),
  highHash: z.string().regex(/^[a-f0-9]{64}$/),
  lowHash: z.string().regex(/^[a-f0-9]{64}$/),
  savedSourceGraphHash: z.string().regex(/^[a-f0-9]{64}$/),
  materialChannels: z.literal(5),
  meshCount: z.number().int().nonnegative(),
  instanceBatchCount: z.number().int().nonnegative(),
  staleUvUnchanged: z.literal(true),
  sourceAbsent: z.literal(true)
}).strict();

function p11ReplaySpan(view: ArrayBufferView | undefined) {
  return view === undefined ? null : {
    type: view.constructor.name,
    byteLength: view.byteLength,
    bytes: Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  };
}

function p11ReplayIrReceipt(ir: P11ReplayIr) {
  return {
    ...ir,
    meshBatches: ir.meshBatches.map((batch) => ({
      ...batch,
      positions: p11ReplaySpan(batch.positions),
      normals: p11ReplaySpan(batch.normals),
      uvs: p11ReplaySpan(batch.uvs),
      indices: p11ReplaySpan(batch.indices)
    })),
    instanceBatches: ir.instanceBatches.map((batch) => ({
      ...batch,
      transforms: p11ReplaySpan(batch.transforms)
    }))
  };
}

function p11ReplayMaterials(channels: P11ReplayFixture["packedAtlas"]["channels"]) {
  return Object.fromEntries(
    (["baseColor", "height", "normal", "opacity", "orm"] as const).map((name) => {
      const layer = channels[name];
      return [name, {
        widthPx: layer.widthPx,
        heightPx: layer.heightPx,
        data: p11ReplaySpan(layer.data)
      }];
    })
  );
}

describe("R2.P11 recognized completed compiler replay", () => {
  it.each([{ detailLevel: "high" as const }, { detailLevel: "low" as const }])(
    "replays the current compiler for a recognized $detailLevel packet with stale saved UV bytes",
    async ({ detailLevel }) => {
      const provider = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
      const interpreter = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
      const psg = vi.spyOn(psgEvaluator, "evaluatePsg");
      let generated: P11ReplayFixture | undefined;
      let restored: P11ReplayFixture | undefined;
      try {
        generated = await createAssemblyHallFixture({
          promptControls: {
            ...structuredClone(defaultBuildingPromptControls),
            detailLevel,
            fidelityMode: "kit"
          }
        });
        expect(provider).toHaveBeenCalledTimes(12);
        expect(interpreter).toHaveBeenCalledTimes(1);
        expect(psg).toHaveBeenCalledTimes(1);
        const providerBefore = provider.mock.calls.length;
        const interpreterBefore = interpreter.mock.calls.length;
        const psgBefore = psg.mock.calls.length;
        const identity = {
          documentId: "p11-replay-" + detailLevel,
          runId: "p11-run-" + detailLevel,
          requestHash: "p11-request-" + detailLevel,
          createdAt: "2026-10-15T00:00:00.000Z"
        };
        const packet = await createCompletedFamilyPersistencePacket({
          ...identity,
          fixture: generated
        });
        expect(packet.fidelityMode).toBe("kit");
        const highHash = await hashCanonicalJson(packet.artifacts.graph);
        const lowHash = await hashCanonicalJson({ graph: packet.artifacts.graph, detailLevel: "low" });
        expect(highHash).not.toBe(lowHash);
        expect(packet.artifacts.runtimeIr.sourceGraphHash).toBe(detailLevel === "high" ? highHash : lowHash);
        const savedMaterials = p11ReplayMaterials(packet.artifacts.atlasChannels);
        const stale = structuredClone(packet);
        const staleWall = stale.artifacts.runtimeIr.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels");
        const originalWall = generated.ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels");
        if (!staleWall?.uvs?.length || !originalWall?.uvs?.length) throw new Error("Expected owned wall UV buffers");
        const originalUv = originalWall.uvs[0];
        staleWall.uvs[0] = Math.fround(originalUv + 0.125);
        expect(staleWall.uvs[0]).not.toBe(originalUv);
        expect(originalWall.uvs[0]).toBe(originalUv);
        expect(parseCompletedFamilyPersistencePacket(stale).contentHash).toBe(packet.contentHash);
        const unchangedMetadata = await createCompletedFamilyPersistencePacket({
          ...identity,
          fixture: { ...generated, ir: stale.artifacts.runtimeIr }
        });
        expect(unchangedMetadata.contentHash).toBe(packet.contentHash);
        provider.mockClear();
        interpreter.mockClear();
        psg.mockClear();
        const expectedIr = await compileBuilding({
          spec: stale.artifacts.spec,
          catalog: stale.artifacts.componentCatalog,
          graph: stale.artifacts.graph,
          buildingId: stale.buildingId,
          detailLevel,
          fidelityMode: "kit"
        });
        const expectedGallery = await buildComponentGallery({ catalog: stale.artifacts.componentCatalog, ir: expectedIr });
        restored = await restoreAssemblyHallFixtureFromCompletedFamilyPacket(stale);
        expect(restored.sourceSnapshot).toBeUndefined();
        expect(restored.promptTrace).toEqual(packet.provenance.promptTrace);
        expect(restored.packedAtlas.manifest).toEqual(packet.artifacts.atlasManifest);
        expect(restored.packedAtlas.slotProvenance).toEqual(packet.artifacts.atlasSlotProvenance);
        expect(restored.packedAtlas.contentHash).toBe(packet.artifacts.atlasContentHash);
        expect(restored.debugExport).toEqual(packet.artifacts.debugExport);
        expect(p11ReplayMaterials(restored.packedAtlas.channels)).toEqual(savedMaterials);
        expect(p11ReplayMaterials(stale.artifacts.atlasChannels)).toEqual(savedMaterials);
        expect(staleWall.uvs[0]).toBe(Math.fround(originalUv + 0.125));
        expect(originalWall.uvs[0]).toBe(originalUv);
        expect(provider).not.toHaveBeenCalled();
        expect(interpreter).not.toHaveBeenCalled();
        expect(psg).not.toHaveBeenCalled();
        expect(Object.keys(restored.packedAtlas.channels)).toHaveLength(5);
        const positiveControls = P11ReplayPositiveControlsSchema.parse({
          schemaVersion: "0.1.0",
          packetKind: "buildo-r2-p11-replay-positive-controls",
          detailLevel,
          fidelityMode: packet.fidelityMode,
          providerBefore,
          interpreterBefore,
          psgBefore,
          providerAfter: provider.mock.calls.length,
          interpreterAfter: interpreter.mock.calls.length,
          psgAfter: psg.mock.calls.length,
          highHash,
          lowHash,
          savedSourceGraphHash: packet.artifacts.runtimeIr.sourceGraphHash,
          materialChannels: Object.keys(restored.packedAtlas.channels).length,
          meshCount: restored.ir.meshBatches.length,
          instanceBatchCount: restored.ir.instanceBatches.length,
          staleUvUnchanged: staleWall.uvs[0] === Math.fround(originalUv + 0.125),
          sourceAbsent: restored.sourceSnapshot === undefined
        });
        console.log("R2_P11_REPLAY_POSITIVE_CONTROLS " + JSON.stringify(positiveControls));
        // Synthetic stale compiler payload: metadata still admits the saved byte change.
        expect(p11ReplayIrReceipt(restored.ir)).toEqual(p11ReplayIrReceipt(expectedIr));
        expect(restored.componentGallery).toEqual(expectedGallery);
      } finally {
        restored?.familyRuntime.dispose();
        generated?.familyRuntime.dispose();
        provider.mockRestore();
        interpreter.mockRestore();
        psg.mockRestore();
      }
    },
    20000
  );
});

import * as p11ContentHash from "../core/contentHash";
import * as p11Compiler from "../compiler/buildingCompiler";
import * as p11SceneAdapter from "../renderer-three/buildingSceneAdapter";
import * as p11FamilyRuntime from "../renderer-three/familyRuntime";
import { CompletedFamilyReplayProfileError } from "../ui/assemblyHallFixture";

function p11ReplayDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function p11ReplaySeed(fidelityMode: "proof" | "kit" = "kit", detailLevel: "high" | "low" = "high") {
  const fixture = await createAssemblyHallFixture({
    promptControls: { ...structuredClone(defaultBuildingPromptControls), fidelityMode, detailLevel }
  });
  try {
    const packet = await createCompletedFamilyPersistencePacket({
      documentId: "p11-followup-" + fidelityMode + "-" + detailLevel,
      runId: "p11-followup-run-" + fidelityMode + "-" + detailLevel,
      requestHash: "p11-followup-request-" + fidelityMode + "-" + detailLevel,
      createdAt: "2026-10-15T00:00:00.000Z",
      fixture
    });
    return { fixture, packet: structuredClone(packet) };
  } catch (error) { fixture.familyRuntime.dispose(); throw error; }
}

describe("R2.P11 completed replay boundaries", () => {
  it.each([{ detailLevel: "high" as const }, { detailLevel: "low" as const }])(
    "replays proof/$detailLevel with current IR, gallery, provenance and all saved material bytes",
    async ({ detailLevel }) => {
      const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
      const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
      const evaluate = vi.spyOn(psgEvaluator, "evaluatePsg");
      let seed: Awaited<ReturnType<typeof p11ReplaySeed>> | undefined;
      let restored: P11ReplayFixture | undefined;
      try {
        seed = await p11ReplaySeed("proof", detailLevel);
        expect(generate).toHaveBeenCalledTimes(12);
        expect(interpret).toHaveBeenCalledTimes(1);
        expect(evaluate).toHaveBeenCalledTimes(1);
        const packet = seed.packet;
        const expectedIr = await compileBuilding({
          spec: packet.artifacts.spec, catalog: packet.artifacts.componentCatalog,
          graph: packet.artifacts.graph, buildingId: packet.buildingId,
          detailLevel, fidelityMode: "proof"
        });
        const expectedGallery = await buildComponentGallery({ catalog: packet.artifacts.componentCatalog, ir: expectedIr });
        const materials = p11ReplayMaterials(packet.artifacts.atlasChannels);
        generate.mockClear(); interpret.mockClear(); evaluate.mockClear();
        restored = await restoreAssemblyHallFixtureFromCompletedFamilyPacket(packet);
        expect(restored.fidelityMode).toBe("proof");
        expect(p11ReplayIrReceipt(restored.ir)).toEqual(p11ReplayIrReceipt(expectedIr));
        expect(restored.componentGallery).toEqual(expectedGallery);
        expect(restored.spec).toEqual(packet.artifacts.spec);
        expect(restored.catalog).toEqual(packet.artifacts.componentCatalog);
        expect(restored.graph).toEqual(packet.artifacts.graph);
        expect(restored.promptTrace).toEqual(packet.provenance.promptTrace);
        expect(restored.variantStress).toEqual(packet.provenance.variantStress);
        expect(restored.remoteMaterialApplication).toEqual(packet.provenance.remoteMaterialApplication);
        expect(restored.provenanceEntryCount).toBe(packet.provenance.provenanceEntryCount);
        expect(restored.packedAtlas.manifest).toEqual(packet.artifacts.atlasManifest);
        expect(restored.packedAtlas.slotProvenance).toEqual(packet.artifacts.atlasSlotProvenance);
        expect(restored.packedAtlas.contentHash).toBe(packet.artifacts.atlasContentHash);
        expect(restored.debugExport).toEqual(packet.artifacts.debugExport);
        expect(p11ReplayMaterials(restored.packedAtlas.channels)).toEqual(materials);
        expect(restored.sourceSnapshot).toBeUndefined();
        expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled();
      } finally {
        restored?.familyRuntime.dispose(); seed?.fixture.familyRuntime.dispose();
        generate.mockRestore(); interpret.mockRestore(); evaluate.mockRestore();
      }
    }, 20000
  );

  it.each([{ kind: "missing-fidelity" as const }, { kind: "unknown-graph" as const }])(
    "rejects $kind before compiler, backend, family or provider work",
    async ({ kind }) => {
      const seed = await p11ReplaySeed();
      const packet = structuredClone(seed.packet);
      if (kind === "missing-fidelity") delete packet.fidelityMode;
      else packet.artifacts.runtimeIr.sourceGraphHash = "0".repeat(64);
      const compile = vi.spyOn(p11Compiler, "compileBuilding");
      const backend = vi.spyOn(p11SceneAdapter, "detectRendererBackendSupport");
      const family = vi.spyOn(p11FamilyRuntime, "createBuildingFamilyRuntime");
      const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
      const interpret = vi.spyOn(LocalRulePromptInterpreter.prototype, "interpret");
      const evaluate = vi.spyOn(psgEvaluator, "evaluatePsg");
      try {
        let caught: unknown;
        try { await restoreAssemblyHallFixtureFromCompletedFamilyPacket(packet); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CompletedFamilyReplayProfileError);
        expect(caught).toMatchObject({ code: "building.completedReplayProfileUnresolved" });
        expect(compile).not.toHaveBeenCalled(); expect(backend).not.toHaveBeenCalled(); expect(family).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled(); expect(interpret).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled();
      } finally {
        seed.fixture.familyRuntime.dispose();
        compile.mockRestore(); backend.mockRestore(); family.mockRestore();
        generate.mockRestore(); interpret.mockRestore(); evaluate.mockRestore();
      }
    }, 20000
  );

  it("owns direct caller materials, spec, catalog and graph before its first awaited hash", async () => {
    const seed = await p11ReplaySeed();
    const original = structuredClone(seed.packet), caller = structuredClone(seed.packet);
    const expectedIr = await compileBuilding({
      spec: original.artifacts.spec, catalog: original.artifacts.componentCatalog,
      graph: original.artifacts.graph, buildingId: original.buildingId, detailLevel: "high", fidelityMode: "kit"
    });
    const expectedGallery = await buildComponentGallery({ catalog: original.artifacts.componentCatalog, ir: expectedIr });
    const ready = p11ReplayDeferred<void>(), release = p11ReplayDeferred<void>();
    const realHash = p11ContentHash.hashCanonicalJson;
    let first = true;
    const hash = vi.spyOn(p11ContentHash, "hashCanonicalJson").mockImplementation((input) => {
      const hashed = realHash(input);
      if (!first) return hashed;
      first = false; ready.resolve();
      return release.promise.then(() => hashed);
    });
    let restored: P11ReplayFixture | undefined;
    const pending = restoreAssemblyHallFixtureFromCompletedFamilyPacket(caller);
    try {
      await ready.promise;
      caller.artifacts.spec.familyId = "p11-caller-mutated-family";
      caller.artifacts.spec.massing.floorHeightsM[0] += 3;
      caller.artifacts.componentCatalog.catalogId = "p11-caller-mutated-catalog";
      caller.artifacts.graph.graphId = "p11-caller-mutated-graph";
      for (const name of ["baseColor", "height", "normal", "opacity", "orm"] as const) caller.artifacts.atlasChannels[name].data[0] ^= 255;
      release.resolve();
      restored = await pending;
      expect(restored.spec).toEqual(original.artifacts.spec);
      expect(restored.catalog).toEqual(original.artifacts.componentCatalog);
      expect(restored.graph).toEqual(original.artifacts.graph);
      expect(p11ReplayIrReceipt(restored.ir)).toEqual(p11ReplayIrReceipt(expectedIr));
      expect(restored.componentGallery).toEqual(expectedGallery);
      expect(p11ReplayMaterials(restored.packedAtlas.channels)).toEqual(p11ReplayMaterials(original.artifacts.atlasChannels));
      expect(restored.packedAtlas.channels.baseColor.data).not.toBe(caller.artifacts.atlasChannels.baseColor.data);
      expect(caller.artifacts.spec.familyId).toBe("p11-caller-mutated-family");
      expect(caller.artifacts.componentCatalog.catalogId).toBe("p11-caller-mutated-catalog");
      expect(caller.artifacts.graph.graphId).toBe("p11-caller-mutated-graph");
    } finally {
      release.resolve(); if (!restored) restored = await pending.catch(() => undefined);
      restored?.familyRuntime.dispose(); seed.fixture.familyRuntime.dispose(); hash.mockRestore();
    }
  }, 20000);

  it("disposes the allocated real family once when building runtime creation rejects", async () => {
    const seed = await p11ReplaySeed();
    const failure = new Error("p11 createOrReplace failed");
    const realCreate = p11FamilyRuntime.createBuildingFamilyRuntime;
    let allocated: ReturnType<typeof realCreate> | undefined;
    const family = vi.spyOn(p11FamilyRuntime, "createBuildingFamilyRuntime").mockImplementation((input) => {
      const runtime = realCreate(input); allocated = runtime;
      vi.spyOn(runtime, "dispose");
      vi.spyOn(runtime, "createOrReplaceBuilding").mockImplementation(() => { throw failure; });
      return runtime;
    });
    try {
      await expect(restoreAssemblyHallFixtureFromCompletedFamilyPacket(seed.packet)).rejects.toBe(failure);
      expect(family).toHaveBeenCalledTimes(1);
      expect(allocated).toBeDefined();
      expect(allocated?.dispose).toHaveBeenCalledTimes(1);
      expect(allocated?.disposed).toBe(true);
      expect(allocated?.textureSet.disposed).toBe(true);
      expect(allocated?.buildingRuntimes.size).toBe(0);
    } finally {
      family.mockRestore(); seed.fixture.familyRuntime.dispose();
    }
  }, 20000);
});
