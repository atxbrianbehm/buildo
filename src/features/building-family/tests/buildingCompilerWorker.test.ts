import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { vi } from "vitest";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { BuildingWindowWidthOverride } from "../contracts/buildingDocument";
import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import {
  compileBuilding, BuildingWindowWidthOverridesSchema, parseWindowWidthOverrides,
  type CompileBuildingInput
} from "../compiler/buildingCompiler";
import {
  applyWindowWidthOverride, buildFacadeSplitPlan, wallPrimitivesFromSplitPlan,
  type FacadeSplitPlan
} from "../compiler/facadeSplitPlan";
import { combinePrimitiveGeometry } from "../compiler/primitiveGeometry";
import { expandBayWallPrimitives } from "../compiler/facadeWallSubdivision";
import { FRAME_INSET_FROM_SLOT_M } from "../compiler/openingSlotBinding";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { buildBuildingGraph, validateBuildingGraph } from "../compiler/buildingGraphBuilder";
import { CompilerClient } from "../compiler/compilerClient";
import {
  collectRuntimeIrTransferables,
  CompilerWorkerRequestSchema,
  CompilerWorkerResponseSchema,
  type CompilerWorkerRequest,
  type CompilerWorkerResponse
} from "../compiler/compilerWorkerProtocol";
import { createCompilerWorkerRuntime } from "../compiler/compilerWorkerRuntime";
import { KIT_HIGH_DETAIL_MESH_BATCH_IDS } from "../compiler/expanders";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planAtlas } from "../materials/atlasPlanner";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function fixtureCompilerInput(): Promise<CompileBuildingInput> {
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
  const atlasPlan = await planAtlas(spec);
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  return { spec, catalog, graph };
}

function minimalIr(requestId: string): RuntimeBuildingIR {
  return {
    schemaVersion: "0.1.0",
    buildingId: `building-${requestId}`,
    familyId: "family-test",
    sourceGraphHash: "a".repeat(64),
    bounds: {
      min: [0, 0, 0],
      max: [1, 1, 1]
    },
    meshBatches: [
      {
        batchId: `mesh.${requestId}`,
        role: "wall",
        positions: new Float32Array([0, 0, 0]) as Float32Array<ArrayBuffer>,
        normals: new Float32Array([0, 1, 0]) as Float32Array<ArrayBuffer>,
        uvs: new Float32Array([0, 0]) as Float32Array<ArrayBuffer>,
        indices: new Uint32Array([0]) as Uint32Array<ArrayBuffer>,
        materialSlotId: "wall.primary"
      }
    ],
    instanceBatches: [
      {
        batchId: `instances.${requestId}`,
        recipeId: "recipe.window.tall-arched.frame",
        materialSlotId: "glass.primary",
        transforms: new Float32Array(16) as Float32Array<ArrayBuffer>,
        count: 1
      }
    ],
    semanticIndex: [
      {
        semanticPath: `building/family-test/facade/front/floor/0/bay/0/window/frame/${requestId}`,
        batchId: `instances.${requestId}`,
        elementIndex: 0,
        stage: "openings"
      }
    ],
    metrics: {
      vertexCount: 1,
      triangleCount: 0,
      instanceCount: 1
    }
  };
}

class ManualEndpoint {
  readonly sent: CompilerWorkerRequest[] = [];
  private listener?: (message: CompilerWorkerResponse) => void;

  postMessage(message: CompilerWorkerRequest): void {
    this.sent.push(message);
  }

  subscribe(listener: (message: CompilerWorkerResponse) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(message: CompilerWorkerResponse): void {
    this.listener?.(message);
  }
}

describe("compiler worker boundary", () => {
  it("validates compile and response messages and transfers every runtime IR buffer", async () => {
    const input = await fixtureCompilerInput();
    const ir = await compileBuilding(input);
    const request: CompilerWorkerRequest = {
      type: "compile",
      requestId: "request-1",
      spec: input.spec,
      graph: input.graph,
      catalog: input.catalog
    };
    const response: CompilerWorkerResponse = {
      type: "complete",
      requestId: "request-1",
      ir
    };
    const transferables = collectRuntimeIrTransferables(ir);
    const expectedBuffers = [
      ...ir.meshBatches.flatMap((batch) => [
        batch.positions?.buffer,
        batch.normals?.buffer,
        batch.uvs?.buffer,
        batch.indices?.buffer
      ]),
      ...ir.instanceBatches.map((batch) => batch.transforms?.buffer)
    ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

    expect(CompilerWorkerRequestSchema.safeParse(request).success).toBe(true);
    expect(CompilerWorkerResponseSchema.safeParse(response).success).toBe(true);
    expect(transferables).toHaveLength(expectedBuffers.length);
    for (const buffer of expectedBuffers) {
      expect(transferables).toContain(buffer);
    }
  });

  it("posts progress and a complete response with transferables for a compile request", async () => {
    const input = await fixtureCompilerInput();
    const responses: Array<{ message: CompilerWorkerResponse; transferables: ArrayBuffer[] }> = [];
    const runtime = createCompilerWorkerRuntime({
      postMessage: (message, transferables) => responses.push({ message, transferables: transferables ?? [] })
    });

    await runtime.handleMessage({
      type: "compile",
      requestId: "request-2",
      spec: input.spec,
      graph: input.graph,
      catalog: input.catalog
    });

    expect(responses[0].message).toMatchObject({
      type: "progress",
      requestId: "request-2",
      stage: "compilingGeometry",
      completed: 0,
      total: 1
    });
    expect(responses.at(-1)?.message.type).toBe("complete");
    expect(responses.at(-1)?.message.requestId).toBe("request-2");
    expect(responses.at(-1)?.transferables.length).toBeGreaterThan(0);
  });

  it("discards cancelled and stale compile results before posting complete", async () => {
    const input = await fixtureCompilerInput();
    const cancelledCompile = deferred<RuntimeBuildingIR>();
    const staleCompile = deferred<RuntimeBuildingIR>();
    const activeCompile = deferred<RuntimeBuildingIR>();
    const responses: CompilerWorkerResponse[] = [];
    const runtime = createCompilerWorkerRuntime({
      compile: ({ catalog }: CompileBuildingInput) => {
        if (catalog.catalogId === "catalog-cancelled") {
          return cancelledCompile.promise;
        }
        if (catalog.catalogId === "catalog-stale") {
          return staleCompile.promise;
        }
        return activeCompile.promise;
      },
      postMessage: (message) => responses.push(message)
    });
    const cancelledCatalog: ComponentCatalog = { ...input.catalog, catalogId: "catalog-cancelled" };
    const staleCatalog: ComponentCatalog = { ...input.catalog, catalogId: "catalog-stale" };
    const activeCatalog: ComponentCatalog = { ...input.catalog, catalogId: "catalog-active" };

    const firstRequest = runtime.handleMessage({
      type: "compile",
      requestId: "request-cancelled",
      spec: input.spec,
      graph: input.graph,
      catalog: cancelledCatalog
    });
    await runtime.handleMessage({ type: "cancel", requestId: "request-cancelled" });
    cancelledCompile.resolve(minimalIr("cancelled"));
    await firstRequest;

    const staleRequest = runtime.handleMessage({
      type: "compile",
      requestId: "request-stale",
      spec: input.spec,
      graph: input.graph,
      catalog: staleCatalog
    });
    const activeRequest = runtime.handleMessage({
      type: "compile",
      requestId: "request-active",
      spec: input.spec,
      graph: input.graph,
      catalog: activeCatalog
    });
    activeCompile.resolve(minimalIr("active"));
    staleCompile.resolve(minimalIr("stale"));
    await Promise.all([staleRequest, activeRequest]);

    expect(responses.filter((response) => response.type === "complete").map((response) => response.requestId)).toEqual([
      "request-active"
    ]);
  });

  it("compiler client cancels superseded work and ignores stale worker responses", async () => {
    const input = await fixtureCompilerInput();
    const endpoint = new ManualEndpoint();
    const ids = ["request-old", "request-new"];
    const client = new CompilerClient(endpoint, { createRequestId: () => ids.shift() ?? "request-extra" });
    const oldPromise = client.compile(input);
    const newPromise = client.compile(input);

    await expect(oldPromise).rejects.toThrow("superseded");
    expect(endpoint.sent.map((message) => `${message.type}:${message.requestId}`)).toEqual([
      "compile:request-old",
      "cancel:request-old",
      "compile:request-new"
    ]);

    endpoint.emit({ type: "complete", requestId: "request-old", ir: minimalIr("old") });
    endpoint.emit({ type: "complete", requestId: "request-new", ir: minimalIr("new") });

    await expect(newPromise).resolves.toMatchObject({
      buildingId: "building-new",
      familyId: "family-test"
    });
  });

  it("worker compile matches main-thread compile for one fixture seed (G6 parity)", async () => {
    const input = await fixtureCompilerInput();
    const mainIr = await compileBuilding(input);
    const responses: CompilerWorkerResponse[] = [];
    const runtime = createCompilerWorkerRuntime({
      postMessage: (message) => responses.push(message)
    });
    await runtime.handleMessage({
      type: "compile",
      requestId: "parity-kit",
      spec: input.spec,
      graph: input.graph,
      catalog: input.catalog
    });

    const complete = responses.find((response) => response.type === "complete");
    expect(complete?.type).toBe("complete");
    if (!complete || complete.type !== "complete") {
      throw new Error("Expected complete worker response");
    }
    expect(complete.ir.metrics.triangleCount).toBe(mainIr.metrics.triangleCount);
    expect(complete.ir.metrics.instanceCount).toBe(mainIr.metrics.instanceCount);
    expect(complete.ir.instanceBatches.map((batch) => batch.batchId).sort()).toEqual(
      mainIr.instanceBatches.map((batch) => batch.batchId).sort()
    );
    const meshIds = new Set(mainIr.meshBatches.map((batch) => batch.batchId));
    for (const batchId of KIT_HIGH_DETAIL_MESH_BATCH_IDS) {
      expect(meshIds.has(batchId)).toBe(true);
    }
  });
});

type P4View = Float32Array | Uint32Array | Uint16Array;
type P4Compiler = (input: CompileBuildingInput) => Promise<RuntimeBuildingIR>;
type P4Profile = { input: CompileBuildingInput; split: FacadeSplitPlan; golden: string };

const p4Digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const p4Clone = <T,>(value: T): T => structuredClone(value);

function p4Span(view: P4View) {
  const bytes = Buffer.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return { type: view.constructor.name, length: view.length, byteOffset: view.byteOffset,
    byteLength: view.byteLength, bufferByteLength: view.buffer.byteLength,
    sha256: p4Digest(bytes), base64: bytes.toString("base64") };
}

// Own keys and special numeric values supplement JSON; typed numeric indices are
// already represented by exact spans and must have no uncaptured extra metadata.
function p4OwnShape(value: unknown) {
  const result: {
    containers: Array<{ path: string[]; kind: "object" | "array"; keys: string[] }>;
    undefinedPaths: string[][]; negativeZeroPaths: string[][]; typedPaths: string[][];
  } = { containers: [], undefinedPaths: [], negativeZeroPaths: [], typedPaths: [] };
  const ancestors = new Set<object>();
  function visit(current: unknown, at: string[]): void {
    if (current === undefined) { result.undefinedPaths.push(at); return; }
    if (typeof current === "number") {
      expect(Number.isFinite(current)).toBe(true);
      if (Object.is(current, -0)) result.negativeZeroPaths.push(at);
      return;
    }
    if (current === null || typeof current === "string" || typeof current === "boolean") return;
    if (typeof current !== "object") throw new Error("Unexpected IR value");
    expect(Object.getOwnPropertySymbols(current)).toHaveLength(0);
    const keys = Object.getOwnPropertyNames(current);
    if (ArrayBuffer.isView(current)) {
      if (!(current instanceof Float32Array || current instanceof Uint32Array || current instanceof Uint16Array)) throw new Error("Unexpected IR span");
      expect(keys).toHaveLength(current.length);
      expect(keys.every((key, index) => key === String(index))).toBe(true);
      result.typedPaths.push(at);
      return;
    }
    expect(Array.isArray(current) || Object.getPrototypeOf(current) === Object.prototype || Object.getPrototypeOf(current) === null).toBe(true);
    expect(ancestors.has(current)).toBe(false);
    ancestors.add(current);
    result.containers.push({ path: at, kind: Array.isArray(current) ? "array" : "object", keys });
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("Unexpected IR accessor");
      visit(descriptor.value, [...at, key]);
    }
    ancestors.delete(current);
  }
  visit(value, []);
  return result;
}

function p4Complete(ir: RuntimeBuildingIR) {
  function batch(value: object, names: string[]) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      names.includes(key) && item !== undefined ? p4Span(item as P4View) : item]));
  }
  return { completeIr: { ...ir,
    meshBatches: ir.meshBatches.map(value => batch(value, ["positions", "normals", "uvs", "indices"])),
    instanceBatches: ir.instanceBatches.map(value => batch(value, ["transforms"]))
  }, ownShape: p4OwnShape(ir) };
}

async function p4Split(input: CompileBuildingInput): Promise<FacadeSplitPlan> {
  const wall = input.catalog.recipes.find(recipe => recipe.role === "wall");
  if (!wall) throw new Error("Expected actual wall recipe");
  const kit = input.fidelityMode !== "proof";
  return buildFacadeSplitPlan({ spec: input.spec, wallDepthM: Math.max(0.02, wall.dimensionsM.depth),
    ...(kit ? { facadePlan: planFacadeModules({ spec: input.spec, kit: late19cApartmentKit }), kit: late19cApartmentKit } : {}),
    defaultOpeningMode: "front-only" });
}

function p4Directive(profile: P4Profile, widthM?: number): BuildingWindowWidthOverride {
  const opening = profile.split.openings.find(value => value.kind === "window" && value.facade === "front" && value.floorIndex === 1);
  if (!opening) throw new Error("Expected actual upper front window");
  return { schemaVersion: "0.1.0", address: { schemaVersion: "0.1.0", facade: opening.facade,
    floorIndex: opening.floorIndex, bayIndex: opening.bayIndex }, widthM: widthM ?? Math.min(0.6, opening.sizeM[0] / 2) };
}

function p4Request(input: CompileBuildingInput, requestId: string): CompilerWorkerRequest {
  const { windowWidthOverrides, ...rest } = input;
  return { type: "compile", requestId, ...rest,
    ...(windowWidthOverrides === undefined ? {} : { windowWidthOverrides: [...windowWidthOverrides] }) };
}

function p4Wire(compile?: P4Compiler, queued = false) {
  let listener: ((message: CompilerWorkerResponse) => void) | undefined;
  let unsubscribeCount = 0;
  const sent: CompilerWorkerRequest[] = [], queue: CompilerWorkerRequest[] = [], pending: Promise<void>[] = [];
  const posted: Array<{ message: CompilerWorkerResponse; transferables: ArrayBuffer[] }> = [];
  const runtime = createCompilerWorkerRuntime({ ...(compile ? { compile } : {}),
    postMessage(message, transferables = []) {
      posted.push({ message, transferables });
      // Real schemas/client/runtime, with no simulated structuredClone across
      // jsdom/Node realms. This is not browser-thread/detachment evidence.
      listener?.(message);
    }
  });
  const endpoint = {
    postMessage(message: CompilerWorkerRequest) {
      sent.push(message);
      if (queued) queue.push(message);
      else pending.push(runtime.handleMessage(message));
    },
    subscribe(next: (message: CompilerWorkerResponse) => void) {
      listener = next;
      return () => { unsubscribeCount += 1; listener = undefined; };
    }
  };
  return { client: new CompilerClient(endpoint), runtime, sent, posted,
    flush() { for (const message of queue.splice(0)) pending.push(runtime.handleMessage(message)); },
    async settle() { await Promise.all(pending); },
    get unsubscribeCount() { return unsubscribeCount; }
  };
}

function p4CompleteResponse(posted: Array<{ message: CompilerWorkerResponse }>, id: string): RuntimeBuildingIR {
  const response = posted.find(value => value.message.type === "complete" && value.message.requestId === id)?.message;
  if (!response || response.type !== "complete") throw new Error("Expected actual runtime completion: " + id);
  return response.ir;
}

// Explicitly exercise untyped callers at the runtime API boundary.
const p4UnsafeCompile = (value: unknown): Promise<RuntimeBuildingIR> => Reflect.apply(compileBuilding, undefined, [value]);
const p4UnsafeClient = (client: CompilerClient, value: unknown): Promise<RuntimeBuildingIR> => Reflect.apply(client.compile, client, [value]);

describe("R3.P4 single-window width compiler and worker boundary", () => {
  let profiles: P4Profile[];
  beforeAll(async () => {
    const original = await fixtureCompilerInput();
    const goldens = [
      "789289937c4e8ab99dbd25cd5c5283f795fba1e48b431d75f0e83a51d300aeff",
      "ef1c6f981eae45d3db4074c78ba8754644411a09f0469f45987058ebc58ebdcc",
      "5f5026f4300670aef3445c9f64911ebe6faa3fdfae3f25e0d3349ecffdf48832",
      "85b13f0f980ad03ef26bfab9b902e95db26bb3e907bd5b4f9430aaeeff24b799"
    ];
    profiles = [];
    for (const fidelityMode of ["kit", "proof"] as const) {
      const graph = await buildBuildingGraph(original.spec, original.catalog, { fidelityMode });
      for (const detailLevel of ["high", "low"] as const) {
        const input = { ...p4Clone(original), graph: p4Clone(graph), fidelityMode, detailLevel };
        profiles.push({ input, split: await p4Split(input), golden: goldens[profiles.length] });
      }
    }
  }, 20_000);

  it("retains the captured complete IR for omitted, empty and actual no-op directives in all four profiles", async () => {
    for (const profile of profiles) {
      const opening = profile.split.openings.find(value => value.kind === "window" && value.facade === "front" && value.floorIndex === 1)!;
      const original = await compileBuilding(profile.input), snapshot = p4Complete(original);
      expect(await hashCanonicalJson(snapshot)).toBe(profile.golden);
      for (const windowWidthOverrides of [[], [p4Directive(profile, opening.sizeM[0])]]) {
        expect(p4Complete(await compileBuilding({ ...profile.input, windowWidthOverrides }))).toEqual(snapshot);
      }
    }
    // Positive controls for the complete oracle: undefined != absent, and one
    // actual vertex-byte mutation must change it, with exact restoration.
    const ir = await compileBuilding(profiles[0].input);
    const before = p4Complete(ir), witness = { ...ir, meshBatches: ir.meshBatches.map(batch => ({ ...batch })) };
    delete witness.meshBatches[0].materialSlotId;
    const absent = p4Complete(witness);
    witness.meshBatches[0].materialSlotId = undefined;
    expect(p4Complete(witness)).not.toEqual(absent);
    expect(await hashCanonicalJson(p4Complete(witness))).not.toBe(await hashCanonicalJson(absent));
    const positions = ir.meshBatches.find(batch => (batch.positions?.length ?? 0) > 0)?.positions;
    if (!positions) throw new Error("Expected actual compiled vertices");
    const bytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), first = bytes[0];
    try { bytes[0] ^= 1; expect(p4Complete(ir)).not.toEqual(before); }
    finally { bytes[0] = first; }
    expect(p4Complete(ir)).toEqual(before);
  }, 20_000);

  it("matches complete edited IR across direct, default runtime and actual client-to-runtime paths for every profile", async () => {
    for (const profile of profiles) {
      const input = { ...profile.input, buildingId: `p4-${profile.input.fidelityMode}-${profile.input.detailLevel}`,
        windowWidthOverrides: [p4Directive(profile)] };
      const direct = await compileBuilding(input), fallback = p4Wire(), wire = p4Wire();
      try {
        await fallback.runtime.handleMessage(p4Request(input, "p4-fallback"));
        const throughClient = await wire.client.compile(input, { requestId: "p4-client" });
        expect(p4Complete(p4CompleteResponse(fallback.posted, "p4-fallback"))).toEqual(p4Complete(direct));
        expect(p4Complete(throughClient)).toEqual(p4Complete(direct));
        expect(throughClient.buildingId).toBe(input.buildingId);
        expect(wire.sent[0]).toMatchObject({ buildingId: input.buildingId, detailLevel: input.detailLevel,
          fidelityMode: input.fidelityMode, windowWidthOverrides: input.windowWidthOverrides });
      } finally { fallback.client.dispose(); wire.client.dispose(); }
    }
  }, 20_000);

  it("uses the edited aperture for actual walls and paired instances while preserving every other placement and material input", async () => {
    for (const profile of profiles.filter(value => value.input.detailLevel === "high")) {
      const beforeInput = canonicalJson(profile.input), directive = p4Directive(profile);
      const split = await applyWindowWidthOverride(profile.split, directive);
      const before = await compileBuilding(profile.input), after = await compileBuilding({ ...profile.input, windowWidthOverrides: [directive] });
      expect(canonicalJson(profile.input)).toBe(beforeInput);
      expect(after.semanticIndex).toEqual(before.semanticIndex);
      expect(after.instanceBatches.map(batch => ({ id: batch.batchId, recipe: batch.recipeId, slot: batch.materialSlotId, count: batch.count })))
        .toEqual(before.instanceBatches.map(batch => ({ id: batch.batchId, recipe: batch.recipeId, slot: batch.materialSlotId, count: batch.count })));
      const selected = profile.split.openings.find(value => value.facade === directive.address.facade && value.floorIndex === directive.address.floorIndex && value.bayIndex === directive.address.bayIndex)!;
      let selectedPairs = 0, unchangedMatrices = 0;
      for (const batch of before.instanceBatches) {
        const next = after.instanceBatches.find(value => value.batchId === batch.batchId)!;
        if (!batch.transforms || !next.transforms) throw new Error("Expected actual opening transforms");
        for (let index = 0; index < batch.count; index += 1) {
          const entries = before.semanticIndex.filter(value => value.batchId === batch.batchId && value.elementIndex === index);
          const chosen = entries.some(value => value.semanticPath === selected.semanticPath || value.semanticPath === selected.semanticPath + "/glass");
          const oldSpan = p4Span(batch.transforms.subarray(index * 16, (index + 1) * 16));
          const newSpan = p4Span(next.transforms.subarray(index * 16, (index + 1) * 16));
          if (chosen) {
            expect(newSpan.base64).not.toBe(oldSpan.base64);
            const oldMatrix = batch.transforms.subarray(index * 16, (index + 1) * 16);
            const newMatrix = next.transforms.subarray(index * 16, (index + 1) * 16);
            expect(Array.from(newMatrix.subarray(3))).toEqual(Array.from(oldMatrix.subarray(3)));
            const oldX = Math.hypot(oldMatrix[0], oldMatrix[1], oldMatrix[2]);
            const newX = Math.hypot(newMatrix[0], newMatrix[1], newMatrix[2]);
            const ratio = (directive.widthM - 2 * FRAME_INSET_FROM_SLOT_M) / (selected.sizeM[0] - 2 * FRAME_INSET_FROM_SLOT_M);
            expect(oldX).toBeGreaterThan(0); expect(newX / oldX).toBeCloseTo(ratio, 6);
            for (let axis = 0; axis < 3; axis += 1) expect(newMatrix[axis]).toBeCloseTo(oldMatrix[axis] * ratio, 6);
            selectedPairs += 1;
          }
          else { expect(newSpan.base64).toBe(oldSpan.base64); unchangedMatrices += 1; }
        }
      }
      expect(selectedPairs).toBe(2); expect(unchangedMatrices).toBeGreaterThan(0);
      const originalPrimitives = wallPrimitivesFromSplitPlan(profile.split), editedPrimitives = wallPrimitivesFromSplitPlan(split);
      const expectedWall = combinePrimitiveGeometry(editedPrimitives), originalWall = combinePrimitiveGeometry(originalPrimitives);
      const wall = after.meshBatches.find(batch => batch.batchId === "mesh.wall-panels")!;
      const oldWall = before.meshBatches.find(batch => batch.batchId === wall.batchId)!;
      for (const name of ["positions", "normals", "uvs", "indices"] as const) {
        expect(wall[name]).toBeDefined();
        expect(p4Span(wall[name]!).base64).toBe(p4Span(expectedWall[name]).base64);
        expect(p4Span(oldWall[name]!).base64).toBe(p4Span(originalWall[name]).base64);
      }
      expect(p4Span(wall.positions!).base64).not.toBe(p4Span(oldWall.positions!).base64);
      let primitiveOffset = 0, untouchedScopes = 0;
      for (const scope of profile.split.scopes) {
        const count = expandBayWallPrimitives(scope).length;
        const chosen = scope.facade === directive.address.facade && scope.floorIndex === directive.address.floorIndex && scope.bayIndex === directive.address.bayIndex;
        if (!chosen) {
          const oldGeometry = combinePrimitiveGeometry(originalPrimitives.slice(primitiveOffset, primitiveOffset + count));
          const nextGeometry = combinePrimitiveGeometry(editedPrimitives.slice(primitiveOffset, primitiveOffset + count));
          for (const name of ["positions", "normals", "uvs", "indices"] as const) expect(p4Span(nextGeometry[name]).base64).toBe(p4Span(oldGeometry[name]).base64);
          untouchedScopes += 1;
        }
        primitiveOffset += count;
      }
      expect(primitiveOffset).toBe(editedPrimitives.length); expect(untouchedScopes).toBeGreaterThan(0);
      for (const old of profile.split.openings) {
        const next = split.openings.find(value => value.semanticPath === old.semanticPath)!;
        if (old.semanticPath !== selected.semanticPath) expect(next).toEqual(old);
      }
      expect(split.scopes.filter(scope => !(scope.facade === directive.address.facade && scope.floorIndex === directive.address.floorIndex && scope.bayIndex === directive.address.bayIndex)))
        .toEqual(profile.split.scopes.filter(scope => !(scope.facade === directive.address.facade && scope.floorIndex === directive.address.floorIndex && scope.bayIndex === directive.address.bayIndex)));
      expect(canonicalJson(profile.input)).toBe(beforeInput);
    }
  }, 20_000);

  it("owns complete inputs and the directive before direct, queued-client and runtime async gaps", async () => {
    const profile = profiles[0];
    const untouched = { ...p4Clone(profile.input), windowWidthOverrides: [p4Directive(profile)] };
    untouched.graph.nodes[0].parameters.p4OwnershipProbe = { value: "captured" };
    expect(validateBuildingGraph(untouched.graph)).toEqual([]);
    const expected = p4Complete(await compileBuilding(untouched));
    function mutate(value: typeof untouched) {
      value.spec.massing.widthM += 100;
      value.catalog.recipes[0].dimensionsM.width += 20;
      const probe = value.graph.nodes[0].parameters.p4OwnershipProbe;
      if (!probe || typeof probe !== "object" || !("value" in probe)) throw new Error("Expected legal unknown nested graph parameter");
      probe.value = "caller-mutated";
      value.graph.nodes.length = 0;
      value.windowWidthOverrides[0].widthM = 999;
      value.windowWidthOverrides[0].address.floorIndex = 999;
      value.windowWidthOverrides.push(p4Directive(profile));
    }
    const directInput = p4Clone(untouched), direct = compileBuilding(directInput);
    mutate(directInput);
    expect(p4Complete(await direct)).toEqual(expected);
    const queued = p4Wire(undefined, true), clientInput = p4Clone(untouched);
    try {
      const result = queued.client.compile(clientInput, { requestId: "p4-owned-client" });
      mutate(clientInput); queued.flush();
      expect(p4Complete(await result)).toEqual(expected);
    } finally { queued.client.dispose(); }
    const gate = deferred<void>(), runtimeInput = p4Clone(untouched);
    const runtime = p4Wire(async input => { await gate.promise; return compileBuilding(input); });
    try {
      const pending = runtime.runtime.handleMessage(p4Request(runtimeInput, "p4-owned-runtime"));
      mutate(runtimeInput); gate.resolve(); await pending;
      expect(p4Complete(p4CompleteResponse(runtime.posted, "p4-owned-runtime"))).toEqual(expected);
    } finally { runtime.client.dispose(); }
  }, 20_000);

  it("rejects unsafe whole lists and option descriptors before active work while preserving a current request", async () => {
    const profile = profiles[0], directive = p4Directive(profile);
    let reads = 0;
    const accessorList = Object.defineProperty([], "0", { enumerable: true, get() { reads += 1; return directive; } });
    const extraList = Object.assign([directive], { extra: undefined });
    const symbolList = [directive]; Object.defineProperty(symbolList, Symbol("hidden"), { value: true });
    class NonplainList extends Array<BuildingWindowWidthOverride> {}
    for (const value of [null, {}, new Array(1), [directive, directive], accessorList, extraList, symbolList,
      new NonplainList(directive), [{ ...directive, widthM: Number.NaN }], [{ ...directive, extra: undefined }]]) {
      expect(BuildingWindowWidthOverridesSchema.safeParse(value).success).toBe(false);
      expect(() => parseWindowWidthOverrides(value)).toThrow(expect.objectContaining({ code: "building.windowWidth.invalidDirective" }));
    }
    expect(parseWindowWidthOverrides(undefined)).toBeUndefined(); expect(parseWindowWidthOverrides([])).toEqual([]);
    const active = new ManualEndpoint(), client = new CompilerClient(active);
    const gate = deferred<void>(), compile = vi.fn(async (input: CompileBuildingInput) => { await gate.promise; return compileBuilding(input); });
    const runtime = p4Wire(compile);
    try {
      const current = client.compile(profile.input, { requestId: "p4-current" });
      const running = runtime.runtime.handleMessage(p4Request(profile.input, "p4-runtime-current"));
      const accessor = Object.defineProperty({ ...profile.input }, "windowWidthOverrides", { enumerable: true, get() { reads += 1; return [directive]; } });
      const nonenumerable = Object.defineProperty({ ...profile.input }, "windowWidthOverrides", { value: [directive] });
      const inherited = Object.assign(Object.create({ windowWidthOverrides: [directive] }), profile.input);
      for (const invalid of [accessor, nonenumerable, inherited, { ...profile.input, windowWidthOverrides: [directive, directive] }]) {
        await expect(p4UnsafeCompile(invalid)).rejects.toMatchObject({ name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.invalidDirective" });
        await expect(p4UnsafeClient(client, invalid)).rejects.toMatchObject({ name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.invalidDirective" });
        const message = Object.create(Object.getPrototypeOf(invalid), Object.getOwnPropertyDescriptors(invalid));
        Object.assign(message, { type: "compile", requestId: "p4-invalid" });
        await runtime.runtime.handleMessage(message);
      }
      for (const field of ["facadePlan", "moduleInstances"]) {
        await expect(p4UnsafeClient(client, { ...profile.input, [field]: {} })).rejects.toMatchObject({ name: "CompilerClientUnsupportedInputError", code: "building.compiler.unsupportedInput" });
      }
      expect(reads).toBe(0); expect(active.sent).toHaveLength(1); expect(compile).toHaveBeenCalledTimes(1);
      const invalidResponses = runtime.posted.filter(value => value.message.requestId === "p4-invalid");
      expect(invalidResponses).toHaveLength(4);
      expect(invalidResponses.every(value => value.message.type === "error" && value.message.error.code === "building.windowWidth.invalidDirective")).toBe(true);
      active.emit({ type: "complete", requestId: "p4-current", ir: minimalIr("current") });
      await expect(current).resolves.toMatchObject({ buildingId: "building-current" });
      gate.resolve(); await running;
      expect(p4CompleteResponse(runtime.posted, "p4-runtime-current").familyId).toBe(profile.input.spec.familyId);
    } finally { gate.resolve(); client.dispose(); runtime.client.dispose(); }
  }, 20_000);

  it("transports actual bad-slot and unsupported-width names, messages and codes through runtime and client", async () => {
    const profile = profiles[0], valid = p4Directive(profile);
    const failures = [
      { ...valid, address: { ...valid.address, floorIndex: 999 } },
      { ...valid, widthM: 999 }
    ];
    for (const [index, directive] of failures.entries()) {
      const input = { ...profile.input, windowWidthOverrides: [directive] };
      let expected: { name: string; message: string; code: unknown } | undefined;
      try { await compileBuilding(input); }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error)) throw error;
        expected = { name: error.name, message: error.message, code: error.code };
      }
      expect(expected).toBeDefined();
      expect(expected?.code).toBe(index === 0 ? "building.windowSlot.missingOpening" : "building.windowWidth.unsupportedWidth");
      expect(expected?.name).toBe(index === 0 ? "BuildingWindowSlotTargetError" : "BuildingWindowWidthOverrideError");
      const wire = p4Wire();
      try {
        await expect(wire.client.compile(input, { requestId: "p4-domain-error" })).rejects.toMatchObject(expected!);
        const response = wire.posted.find(value => value.message.type === "error")?.message;
        expect(response?.type).toBe("error");
        if (!response || response.type !== "error") throw new Error("Expected transported domain error");
        expect(response.error).toMatchObject(expected!);
        expect(wire.posted.every(value => value.transferables.length === 0)).toBe(true);
      } finally { wire.client.dispose(); }
    }
  }, 20_000);

  it("binds edited identity to legacy detail identity, resolved mode and final split while no-ops retain the legacy hash", async () => {
    for (const profile of profiles) {
      const directive = p4Directive(profile), split = await applyWindowWidthOverride(profile.split, directive);
      const legacySourceGraphHash = await hashCanonicalJson(profile.input.detailLevel === "low" ? { graph: profile.input.graph, detailLevel: "low" } : profile.input.graph);
      const expected = await hashCanonicalJson({ schemaVersion: "0.1.0", kind: "building-window-width-compile", legacySourceGraphHash,
        fidelityMode: profile.input.fidelityMode, splitContentHash: split.contentHash });
      const input = { ...profile.input, windowWidthOverrides: [directive] };
      expect((await compileBuilding(input)).sourceGraphHash).toBe(expected);
      expect((await compileBuilding(input)).sourceGraphHash).toBe(expected);
      expect((await compileBuilding(profile.input)).sourceGraphHash).toBe(legacySourceGraphHash);
    }
    const inferred = { ...profiles[0].input }; delete inferred.fidelityMode;
    expect(p4Complete(await compileBuilding({ ...inferred, windowWidthOverrides: [p4Directive(profiles[0])] })))
      .toEqual(p4Complete(await compileBuilding({ ...profiles[0].input, windowWidthOverrides: [p4Directive(profiles[0])] })));
  }, 20_000);

  it("suppresses late cancelled and superseded real compiles, cleans listeners, and transfers each complete backing buffer once", async () => {
    const profile = profiles[0];
    for (const kind of ["cancel", "supersede"]) {
      const gate = deferred<void>();
      const wire = p4Wire(async input => { if (input.buildingId === "p4-held") await gate.promise; return compileBuilding(input); });
      const abort = new AbortController(), removed = vi.spyOn(abort.signal, "removeEventListener");
      try {
        const first = wire.client.compile({ ...profile.input, buildingId: "p4-held", windowWidthOverrides: [p4Directive(profile)] }, { requestId: "p4-held", signal: abort.signal });
        const rejected = expect(first).rejects.toMatchObject({ name: kind === "cancel" ? "CompilerRequestAbortError" : "CompilerRequestSupersededError" });
        if (kind === "cancel") abort.abort();
        const active = await wire.client.compile({ ...profile.input, buildingId: "p4-active" }, { requestId: "p4-active" });
        await rejected; gate.resolve(); await wire.settle();
        expect(wire.posted.filter(value => value.message.type === "complete").map(value => value.message.requestId)).toEqual(["p4-active"]);
        expect(wire.posted.some(value => value.message.type === "error" && value.message.requestId === "p4-held")).toBe(false);
        expect(removed).toHaveBeenCalledTimes(1);
        const completion = wire.posted.find(value => value.message.type === "complete")!;
        const buffers = new Set<ArrayBuffer>();
        for (const batch of active.meshBatches) for (const view of [batch.positions, batch.normals, batch.uvs, batch.indices]) if (view) buffers.add(view.buffer as ArrayBuffer);
        for (const batch of active.instanceBatches) if (batch.transforms) buffers.add(batch.transforms.buffer as ArrayBuffer);
        expect(new Set(completion.transferables).size).toBe(completion.transferables.length);
        expect(new Set(completion.transferables)).toEqual(buffers);
      } finally { gate.resolve(); wire.client.dispose(); removed.mockRestore(); }
      expect(wire.unsubscribeCount).toBe(1);
    }
    const shared = minimalIr("shared"), backing = new ArrayBuffer(128);
    shared.meshBatches[0].positions = new Float32Array(backing, 4, 3);
    shared.meshBatches[0].normals = new Float32Array(backing, 16, 3);
    shared.meshBatches[0].uvs = new Float32Array(backing, 28, 2);
    shared.meshBatches[0].indices = new Uint16Array(backing, 36, 1);
    shared.instanceBatches[0].transforms = new Float32Array(backing, 48, 16);
    expect(collectRuntimeIrTransferables(shared)).toEqual([backing]);
    const wire = p4Wire(async () => shared);
    try {
      await wire.client.compile(profile.input, { requestId: "p4-shared" });
      expect(wire.posted.find(value => value.message.type === "complete")?.transferables).toEqual([backing]);
    } finally { wire.client.dispose(); }
    const abort = new AbortController(), remove = vi.spyOn(abort.signal, "removeEventListener");
    let unsubscribeCount = 0;
    const postMessage = vi.fn(() => { throw new Error("p4 endpoint failed"); });
    const throwing = new CompilerClient({ postMessage, subscribe: () => () => { unsubscribeCount += 1; } });
    try {
      await expect(throwing.compile(profile.input, { signal: abort.signal })).rejects.toThrow("p4 endpoint failed");
      expect(remove).toHaveBeenCalledTimes(1); expect(postMessage).toHaveBeenCalledTimes(1);
    } finally { throwing.dispose(); remove.mockRestore(); }
    expect(unsubscribeCount).toBe(1); expect(postMessage).toHaveBeenCalledTimes(1);
  }, 20_000);
});


type P14Batch = import("../compiler/buildingCompiler").BuildingWindowWidthBatch;
type P14Profile = P4Profile & { baseline: ReturnType<typeof p4Complete> };
const p14Batch = (directives: BuildingWindowWidthOverride[] = []): P14Batch =>
  ({ schemaVersion: "0.1.0", directives });
const p14AddressKey = (directive: BuildingWindowWidthOverride) =>
  directive.address.facade + ":" + directive.address.floorIndex + ":" + directive.address.bayIndex;
const p14Sorted = (directives: BuildingWindowWidthOverride[]) => {
  const order = ["front", "rear", "left", "right"];
  return [...directives].sort((a, b) => order.indexOf(a.address.facade) - order.indexOf(b.address.facade)
    || a.address.floorIndex - b.address.floorIndex || a.address.bayIndex - b.address.bayIndex);
};
function p14Directive(opening: FacadeSplitPlan["openings"][number], widthM = Math.max(0.23, Math.min(0.6, opening.sizeM[0] / 2))): BuildingWindowWidthOverride {
  return { schemaVersion: "0.1.0", address: { schemaVersion: "0.1.0", facade: opening.facade,
    floorIndex: opening.floorIndex, bayIndex: opening.bayIndex }, widthM };
}
function p14Members(profile: P4Profile): BuildingWindowWidthOverride[] {
  const openings = profile.split.openings.filter(opening => opening.kind === "window" && opening.facade === "front" && opening.floorIndex === 1);
  if (openings.length < 2) throw new Error("Expected two actual front windows");
  return openings.slice(0, 2).map(opening => p14Directive(opening));
}
function p14Request(input: CompileBuildingInput, requestId: string): CompilerWorkerRequest {
  const common = { requestId, spec: input.spec, graph: input.graph, catalog: input.catalog,
    ...(input.buildingId === undefined ? {} : { buildingId: input.buildingId }),
    ...(input.detailLevel === undefined ? {} : { detailLevel: input.detailLevel }),
    ...(input.fidelityMode === undefined ? {} : { fidelityMode: input.fidelityMode }) };
  return input.windowWidthBatch === undefined
    ? { type: "compile", ...common, ...(input.windowWidthOverrides === undefined ? {} : { windowWidthOverrides: [...input.windowWidthOverrides] }) }
    : { type: "compile-window-width-batch", ...common, windowWidthBatch: input.windowWidthBatch };
}
async function p14Routes(input: CompileBuildingInput, expected: ReturnType<typeof p4Complete>, requestId: string) {
  expect(p4Complete(await compileBuilding(input))).toEqual(expected);
  const fallback = p4Wire(), wire = p4Wire();
  try {
    await fallback.runtime.handleMessage(p14Request(input, requestId + "-runtime"));
    expect(p4Complete(p4CompleteResponse(fallback.posted, requestId + "-runtime"))).toEqual(expected);
    expect(p4Complete(await wire.client.compile(input, { requestId: requestId + "-client" }))).toEqual(expected);
    return wire.sent[0];
  } finally { fallback.client.dispose(); wire.client.dispose(); }
}
async function p14RejectBeforeAdmission(profile: P4Profile, invalid: unknown[]) {
  const input = { ...profile.input, windowWidthBatch: p14Batch(p14Members(profile)) };
  const active = new ManualEndpoint(), client = new CompilerClient(active), gate = deferred<void>();
  const compile = vi.fn(async (owned: CompileBuildingInput) => { await gate.promise; return compileBuilding(owned); });
  const runtime = p4Wire(compile);
  const running = runtime.runtime.handleMessage(p14Request(input, "p14-runtime-held"));
  const current = client.compile(input, { requestId: "p14-client-held" });
  const currentOutcome = current.then(value => ({ value }), (error: unknown) => ({ error }));
  try {
    for (const [index, value] of invalid.entries()) {
      await expect(p4UnsafeCompile(value)).rejects.toMatchObject({
        name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.invalidDirective"
      });
      await expect(p4UnsafeClient(client, value)).rejects.toMatchObject({
        name: "BuildingWindowWidthOverrideError", code: "building.windowWidth.invalidDirective"
      });
      const message = Object.create(Object.getPrototypeOf(value as object), Object.getOwnPropertyDescriptors(value as object));
      Object.assign(message, { type: "compile-window-width-batch", requestId: "p14-invalid-" + index });
      await runtime.runtime.handleMessage(message);
    }
    expect(active.sent).toHaveLength(1); expect(compile).toHaveBeenCalledTimes(1);
    const responses = runtime.posted.filter(value => value.message.requestId.startsWith("p14-invalid-"));
    expect(responses).toHaveLength(invalid.length);
    expect(responses.every(value => value.message.type === "error" &&
      value.message.error.code === "building.windowWidth.invalidDirective")).toBe(true);
    active.emit({ type: "complete", requestId: "p14-client-held", ir: minimalIr("p14-held") });
    expect(await currentOutcome).toMatchObject({ value: { buildingId: "building-p14-held" } });
    gate.resolve(); await running;
    expect(p4CompleteResponse(runtime.posted, "p14-runtime-held").familyId).toBe(profile.input.spec.familyId);
  } finally { gate.resolve(); client.dispose(); runtime.client.dispose(); await running; }
}

describe("R3.P14 multi-window width compiler and worker boundary", () => {
  let profiles: P14Profile[];
  let batchSchema: typeof import("../compiler/buildingCompiler").BuildingWindowWidthBatchSchema;
  beforeAll(async () => {
    batchSchema = (await import("../compiler/buildingCompiler")).BuildingWindowWidthBatchSchema;
    const original = await fixtureCompilerInput(), goldens = [
      "789289937c4e8ab99dbd25cd5c5283f795fba1e48b431d75f0e83a51d300aeff",
      "ef1c6f981eae45d3db4074c78ba8754644411a09f0469f45987058ebc58ebdcc",
      "5f5026f4300670aef3445c9f64911ebe6faa3fdfae3f25e0d3349ecffdf48832",
      "85b13f0f980ad03ef26bfab9b902e95db26bb3e907bd5b4f9430aaeeff24b799"
    ];
    profiles = [];
    for (const fidelityMode of ["kit", "proof"] as const) {
      const graph = await buildBuildingGraph(original.spec, original.catalog, { fidelityMode });
      for (const detailLevel of ["high", "low"] as const) {
        const input = { ...p4Clone(original), graph: p4Clone(graph), fidelityMode, detailLevel };
        const baseline = p4Complete(await compileBuilding(input)), golden = goldens[profiles.length];
        expect(await hashCanonicalJson(baseline)).toBe(golden);
        profiles.push({ input, split: await p4Split(input), golden, baseline });
      }
    }
  }, 20_000);

  it("preserves complete legacy, undefined, empty, all-no-op and single-member IR across all four profiles and three routes", async () => {
    for (const [index, profile] of profiles.entries()) {
      const members = p14Members(profile), noops = members.map(directive => {
        const opening = profile.split.openings.find(value => p14AddressKey(p14Directive(value)) === p14AddressKey(directive))!;
        return { ...directive, widthM: opening.sizeM[0] };
      });
      for (const [variant, input] of [
        ["legacy", profile.input],
        ["undefined", { ...profile.input, windowWidthBatch: undefined }],
        ["empty", { ...profile.input, windowWidthBatch: p14Batch() }],
        ["noops", { ...profile.input, windowWidthBatch: p14Batch(noops) }]
      ] as const) {
        await p14Routes(input, profile.baseline, "p14-" + index + "-" + variant);
      }
      const directive = members[0], legacySingle = { ...profile.input, windowWidthOverrides: [directive] };
      const expected = p4Complete(await compileBuilding(legacySingle));
      await p14Routes({ ...legacySingle, windowWidthBatch: undefined }, expected, "p14-legacy-single-" + index);
      const request = await p14Routes({ ...profile.input, windowWidthOverrides: undefined,
        windowWidthBatch: p14Batch([directive]) }, expected, "p14-single-" + index);
      expect(request.type).toBe("compile-window-width-batch");
      expect(Object.prototype.hasOwnProperty.call(request, "windowWidthOverrides")).toBe(false);
    }
  }, 20_000);

  it("compiles actual P13 floor directives and kit cross-facade targets into exact walls and paired local-width scales", async () => {
    const { applyWindowFloorWidthOverride } = await import("../compiler/facadeSplitPlan");
    for (const [index, profile] of profiles.entries()) {
      const beforeInput = canonicalJson(profile.input), floor = await applyWindowFloorWidthOverride(profile.split,
        { schemaVersion: "0.1.0", facade: "front", floorIndex: 1, widthM: 0.23 });
      expect(floor.directives.length).toBeGreaterThan(1);
      const directives = [...floor.directives];
      let split = floor.splitPlan;
      if (profile.input.fidelityMode === "kit") {
        for (const facade of ["rear", "left", "right"] as const) {
          const opening = profile.split.openings.find(value => value.kind === "window" && value.facade === facade && value.floorIndex === 1);
          if (!opening) throw new Error("Expected an actual kit window on " + facade);
          const directive = p14Directive(opening);
          directives.push(directive); split = await applyWindowWidthOverride(split, directive);
        }
      }
      const batch = p14Batch([...directives].reverse()), before = await compileBuilding(profile.input);
      const input = { ...profile.input, windowWidthBatch: batch };
      const after = await compileBuilding(input), snapshot = p4Complete(after);
      await p14Routes(input, snapshot, "p14-floor-" + index);
      expect(after.semanticIndex).toEqual(before.semanticIndex);
      const expectedWall = combinePrimitiveGeometry(wallPrimitivesFromSplitPlan(split));
      const wall = after.meshBatches.find(value => value.batchId === "mesh.wall-panels")!;
      const oldWall = before.meshBatches.find(value => value.batchId === "mesh.wall-panels")!;
      for (const name of ["positions", "normals", "uvs", "indices"] as const) {
        expect(wall[name]).toBeDefined();
        expect(p4Span(wall[name]!).base64).toBe(p4Span(expectedWall[name]).base64);
      }
      expect(p4Span(wall.positions!).base64).not.toBe(p4Span(oldWall.positions!).base64);
      const chosen = new Map(directives.map(directive => {
        const opening = profile.split.openings.find(value => p14AddressKey(p14Directive(value)) === p14AddressKey(directive))!;
        return [opening.semanticPath, { opening, directive }] as const;
      }));
      let selectedPairs = 0, untouched = 0;
      for (const batch of before.instanceBatches) {
        const next = after.instanceBatches.find(value => value.batchId === batch.batchId)!;
        expect({ id: next.batchId, recipe: next.recipeId, slot: next.materialSlotId, count: next.count })
          .toEqual({ id: batch.batchId, recipe: batch.recipeId, slot: batch.materialSlotId, count: batch.count });
        if (!batch.transforms || !next.transforms) throw new Error("Expected actual instance transforms");
        for (let instance = 0; instance < batch.count; instance++) {
          const entries = before.semanticIndex.filter(value => value.batchId === batch.batchId && value.elementIndex === instance);
          const target = [...chosen].find(([path]) => entries.some(entry => entry.semanticPath === path || entry.semanticPath === path + "/glass"))?.[1];
          const old = batch.transforms.subarray(instance * 16, (instance + 1) * 16);
          const changed = next.transforms.subarray(instance * 16, (instance + 1) * 16);
          if (target) {
            const ratio = (target.directive.widthM - 2 * FRAME_INSET_FROM_SLOT_M) /
              (target.opening.sizeM[0] - 2 * FRAME_INSET_FROM_SLOT_M);
            expect(p4Span(changed).base64).not.toBe(p4Span(old).base64);
            expect(Array.from(changed.subarray(3))).toEqual(Array.from(old.subarray(3)));
            for (let axis = 0; axis < 3; axis++) expect(changed[axis]).toBeCloseTo(old[axis] * ratio, 6);
            selectedPairs++;
          } else { expect(p4Span(changed).base64).toBe(p4Span(old).base64); untouched++; }
        }
      }
      expect(selectedPairs).toBe(directives.length * 2); expect(untouched).toBeGreaterThan(0);
      const oldPrimitives = wallPrimitivesFromSplitPlan(profile.split), nextPrimitives = wallPrimitivesFromSplitPlan(split);
      const selectedKeys = new Set(directives.map(p14AddressKey)); let offset = 0, untouchedScopes = 0;
      for (const scope of profile.split.scopes) {
        const count = expandBayWallPrimitives(scope).length;
        if (!selectedKeys.has(scope.facade + ":" + scope.floorIndex + ":" + scope.bayIndex)) {
          const old = combinePrimitiveGeometry(oldPrimitives.slice(offset, offset + count));
          const next = combinePrimitiveGeometry(nextPrimitives.slice(offset, offset + count));
          for (const name of ["positions", "normals", "uvs", "indices"] as const) expect(p4Span(next[name]).base64).toBe(p4Span(old[name]).base64);
          untouchedScopes++;
        }
        offset += count;
      }
      expect(offset).toBe(nextPrimitives.length); expect(untouchedScopes).toBeGreaterThan(0);
      expect(canonicalJson(profile.input)).toBe(beforeInput);
      expect(batch.directives).toEqual([...directives].reverse());
      const legacySourceGraphHash = await hashCanonicalJson(profile.input.detailLevel === "low"
        ? { graph: profile.input.graph, detailLevel: "low" } : profile.input.graph);
      expect(after.sourceGraphHash).toBe(await hashCanonicalJson({ schemaVersion: "0.1.0", kind: "building-window-width-compile",
        legacySourceGraphHash, fidelityMode: profile.input.fidelityMode, splitContentHash: split.contentHash }));
    }
  }, 20_000);

  it("canonicalizes copied batches by fixed facade and numeric floor/bay order while retaining the existing final-split receipt", async () => {
    const spec = p4Clone(profiles[2].input.spec);
    spec.massing.widthM = 48; spec.massing.floorCount = 12;
    spec.massing.floorHeightsM = Array.from({ length: 12 }, (_, index) => index === 0 ? 4.2 : 3.2);
    spec.facade.frontBayCount = 12;
    const catalog = await buildComponentCatalog(spec, (await planAtlas(spec)).manifest);
    const input: CompileBuildingInput = { spec, catalog, graph: await buildBuildingGraph(spec, catalog, { fidelityMode: "proof" }),
      fidelityMode: "proof", detailLevel: "low" };
    const split = await p4Split(input), addresses = [[10, 1], [2, 1], [1, 10], [1, 2]] as const;
    const directives = addresses.map(([floor, bay]) => {
      const opening = split.openings.find(value => value.kind === "window" && value.facade === "front" &&
        value.floorIndex === floor && value.bayIndex === bay);
      if (!opening) throw new Error("Expected a real proof-grid address");
      return p14Directive(opening);
    });
    const supplied = p14Batch(directives), caller = p4Clone(supplied), parsed = batchSchema.parse(supplied);
    expect(parsed.directives.map(p14AddressKey)).toEqual(["front:1:2", "front:1:10", "front:2:1", "front:10:1"]);
    expect(parsed).not.toBe(supplied); expect(parsed.directives).not.toBe(supplied.directives);
    expect(supplied).toEqual(caller);
    const first = await compileBuilding({ ...input, windowWidthBatch: supplied });
    const reverse = await compileBuilding({ ...input, windowWidthBatch: p14Batch([...directives].reverse()) });
    expect(p4Complete(reverse)).toEqual(p4Complete(first));
    let expectedSplit = split;
    for (const directive of p14Sorted(directives)) expectedSplit = await applyWindowWidthOverride(expectedSplit, directive);
    const legacySourceGraphHash = await hashCanonicalJson({ graph: input.graph, detailLevel: "low" });
    expect(first.sourceGraphHash).toBe(await hashCanonicalJson({ schemaVersion: "0.1.0", kind: "building-window-width-compile",
      legacySourceGraphHash, fidelityMode: "proof", splitContentHash: expectedSplit.contentHash }));
    expect(expectedSplit.scopes.map(value => value.facade + ":" + value.floorIndex + ":" + value.bayIndex))
      .toEqual(split.scopes.map(value => value.facade + ":" + value.floorIndex + ":" + value.bayIndex));
    expect(expectedSplit.openings.map(value => value.semanticPath)).toEqual(split.openings.map(value => value.semanticPath));
    const kit = profiles[0], facadeMembers = (["right", "left", "rear", "front"] as const).map(facade => {
      const opening = kit.split.openings.find(value => value.kind === "window" && value.facade === facade && value.floorIndex === 1);
      if (!opening) throw new Error("Expected actual facade window");
      return p14Directive(opening);
    });
    const kitBatch = p14Batch(facadeMembers), wire = p4Wire();
    try {
      await wire.client.compile({ ...kit.input, windowWidthBatch: kitBatch }, { requestId: "p14-facade-order" });
      const request = wire.sent[0];
      if (request.type !== "compile-window-width-batch") throw new Error("Expected batch request");
      expect(request.windowWidthBatch.directives.map(value => value.address.facade)).toEqual(["front", "rear", "left", "right"]);
      expect(kitBatch.directives.map(value => value.address.facade)).toEqual(["right", "left", "rear", "front"]);
    } finally { wire.client.dispose(); }
  }, 20_000);


  it("owns the entire input and nested batch before direct, queued-client and runtime async gaps", async () => {
    const profile = profiles[0], original = { ...p4Clone(profile.input), windowWidthBatch: p14Batch(p14Members(profile)) };
    original.graph.nodes[0].parameters.p14OwnershipProbe = { value: "captured" };
    expect(validateBuildingGraph(original.graph)).toEqual([]);
    const expected = p4Complete(await compileBuilding(original));
    function mutate(value: typeof original) {
      value.spec.massing.widthM += 100; value.catalog.recipes[0].dimensionsM.width += 20;
      const probe = value.graph.nodes[0].parameters.p14OwnershipProbe;
      if (!probe || typeof probe !== "object" || !("value" in probe)) throw new Error("Expected nested graph parameter");
      probe.value = "mutated"; value.graph.nodes.length = 0;
      value.windowWidthBatch.directives[0].widthM = 999;
      value.windowWidthBatch.directives[0].address.floorIndex = 999;
      value.windowWidthBatch.directives.reverse(); value.windowWidthBatch.directives.push(p4Directive(profile));
    }
    const directInput = p4Clone(original), direct = compileBuilding(directInput);
    mutate(directInput);
    expect(p4Complete(await direct)).toEqual(expected);
    expect(Object.isFrozen(directInput)).toBe(false);
    expect(Object.isFrozen(directInput.windowWidthBatch.directives[0].address)).toBe(false);
    const queued = p4Wire(undefined, true), clientInput = p4Clone(original);
    try {
      const pending = queued.client.compile(clientInput, { requestId: "p14-owned-client" });
      mutate(clientInput); queued.flush();
      expect(p4Complete(await pending)).toEqual(expected);
    } finally { queued.client.dispose(); }
    const gate = deferred<void>(), runtimeInput = p4Clone(original);
    const runtime = p4Wire(async owned => { await gate.promise; return compileBuilding(owned); });
    try {
      const pending = runtime.runtime.handleMessage(p14Request(runtimeInput, "p14-owned-runtime"));
      mutate(runtimeInput); gate.resolve(); await pending;
      expect(p4Complete(p4CompleteResponse(runtime.posted, "p14-owned-runtime"))).toEqual(expected);
    } finally { gate.resolve(); runtime.client.dispose(); }
  }, 20_000);

  it("rejects unsafe whole envelopes, lists and new-field descriptors without invoking getters or disturbing admitted work", async () => {
    const profile = profiles[0], directive = p14Members(profile)[0];
    let reads = 0;
    const accessorList = Object.defineProperty([], "0", { enumerable: true, get() { reads++; return directive; } });
    const accessorDirective = Object.defineProperty({ ...directive }, "widthM", { enumerable: true, get() { reads++; return 0.6; } });
    const accessorEnvelope = Object.defineProperty({ schemaVersion: "0.1.0" }, "directives",
      { enumerable: true, get() { reads++; return [directive]; } });
    const symbolList = [directive]; Object.defineProperty(symbolList, Symbol("hidden"), { value: true });
    const symbolEnvelope = p14Batch([directive]); Object.defineProperty(symbolEnvelope, Symbol("hidden"), { value: true });
    class NonplainList extends Array<BuildingWindowWidthOverride> {}
    const malformed: unknown[] = [
      null, [], {}, { schemaVersion: "0.2.0", directives: [] }, { schemaVersion: "0.1.0" },
      { schemaVersion: "0.1.0", directives: undefined }, { schemaVersion: "0.1.0", directives: {} },
      p14Batch(new Array<BuildingWindowWidthOverride>(1)), p14Batch(accessorList),
      p14Batch(Object.assign([directive], { extra: undefined })), p14Batch(symbolList), p14Batch(new NonplainList(directive)),
      p14Batch([accessorDirective]), accessorEnvelope, symbolEnvelope, { ...p14Batch(), extra: undefined },
      Object.assign(Object.create({ inherited: true }), p14Batch([directive])),
      p14Batch([{ ...directive, widthM: Number.NaN }]), p14Batch([{ ...directive, extra: undefined } as BuildingWindowWidthOverride])
    ];
    expect(batchSchema.safeParse(undefined).success).toBe(false);
    for (const batch of malformed) expect(batchSchema.safeParse(batch).success).toBe(false);
    const invalid = malformed.map(windowWidthBatch => ({ ...profile.input, windowWidthBatch }));
    const accessorInput = Object.defineProperty({ ...profile.input }, "windowWidthBatch",
      { enumerable: true, get() { reads++; return p14Batch([directive]); } });
    const nonenumerable = Object.defineProperty({ ...profile.input }, "windowWidthBatch", { value: p14Batch([directive]) });
    const inherited = Object.assign(Object.create({ windowWidthBatch: p14Batch([directive]) }), profile.input);
    await p14RejectBeforeAdmission(profile, [...invalid, accessorInput, nonenumerable, inherited]);
    expect(reads).toBe(0);
  }, 20_000);

  it("rejects duplicate addresses before no-op omission and rejects every pair of defined authorities before admission", async () => {
    const profile = profiles[0], members = p14Members(profile), actual = profile.split.openings.find(opening =>
      p14AddressKey(p14Directive(opening)) === p14AddressKey(members[0]))!;
    const noop = { ...members[0], widthM: actual.sizeM[0] };
    const duplicates = [
      p14Batch([noop, p4Clone(noop)]),
      p14Batch([noop, { ...p4Clone(noop), widthM: 0.6 }]),
      p14Batch([members[1], members[0], p4Clone(members[1])])
    ];
    for (const batch of duplicates) expect(batchSchema.safeParse(batch).success).toBe(false);
    const invalid = [
      ...duplicates.map(windowWidthBatch => ({ ...profile.input, windowWidthBatch })),
      { ...profile.input, windowWidthOverrides: [], windowWidthBatch: p14Batch() },
      { ...profile.input, windowWidthOverrides: [], windowWidthBatch: p14Batch(members) },
      { ...profile.input, windowWidthOverrides: [members[0]], windowWidthBatch: p14Batch() },
      { ...profile.input, windowWidthOverrides: [members[0]], windowWidthBatch: p14Batch(members) }
    ];
    await p14RejectBeforeAdmission(profile, invalid);
    expect(BuildingWindowWidthOverridesSchema.safeParse(members).success).toBe(false);
    expect(parseWindowWidthOverrides(undefined)).toBeUndefined();
    expect(parseWindowWidthOverrides([])).toEqual([]);
    expect(batchSchema.safeParse(p14Batch(members)).success).toBe(true);
  }, 20_000);


  it("keeps legacy compile strict and admits only the separately discriminated required batch request", async () => {
    const { CompilerWorkerCompileRequestSchema, CompilerWorkerWindowWidthBatchCompileRequestSchema } =
      await import("../compiler/compilerWorkerProtocol");
    const profile = profiles[0], legacy = p14Request(profile.input, "p14-legacy-schema");
    const batch = p14Request({ ...profile.input, windowWidthBatch: p14Batch(p14Members(profile)) }, "p14-batch-schema");
    expect(CompilerWorkerCompileRequestSchema.safeParse(legacy).success).toBe(true);
    expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse(batch).success).toBe(true);
    expect(CompilerWorkerRequestSchema.safeParse(legacy).success).toBe(true);
    expect(CompilerWorkerRequestSchema.safeParse(batch).success).toBe(true);
    for (const windowWidthBatch of [undefined, p14Batch()]) {
      expect(CompilerWorkerCompileRequestSchema.safeParse({ ...legacy, windowWidthBatch }).success).toBe(false);
      expect(CompilerWorkerRequestSchema.safeParse({ ...legacy, windowWidthBatch }).success).toBe(false);
    }
    for (const windowWidthOverrides of [undefined, []]) {
      expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse({ ...batch, windowWidthOverrides }).success).toBe(false);
      expect(CompilerWorkerRequestSchema.safeParse({ ...batch, windowWidthOverrides }).success).toBe(false);
    }
    const missing = { ...batch }; Reflect.deleteProperty(missing, "windowWidthBatch");
    expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse(missing).success).toBe(false);
    expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse({ ...batch, windowWidthBatch: undefined }).success).toBe(false);
    expect(CompilerWorkerCompileRequestSchema.safeParse({ ...batch, type: "compile" }).success).toBe(false);
    expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse({ ...legacy, type: "compile-window-width-batch" }).success).toBe(false);
    for (const field of ["facadePlan", "moduleInstances", "unrecognized"]) {
      expect(CompilerWorkerWindowWidthBatchCompileRequestSchema.safeParse({ ...batch, [field]: undefined }).success).toBe(false);
    }
    const manual = new ManualEndpoint(), client = new CompilerClient(manual);
    try {
      for (const field of ["facadePlan", "moduleInstances"]) await expect(p4UnsafeClient(client,
        { ...profile.input, windowWidthBatch: p14Batch(p14Members(profile)), [field]: {} }))
        .rejects.toMatchObject({ name: "CompilerClientUnsupportedInputError", code: "building.compiler.unsupportedInput" });
      expect(manual.sent).toEqual([]);
    } finally { client.dispose(); }
  });

  it("returns typed semantic failures without partial IR and allows an admitted invalid last member to supersede older work", async () => {
    const profile = profiles[0], members = p14Members(profile);
    const door = profile.split.openings.find(opening => opening.kind === "door");
    if (!door) throw new Error("Expected an actual kit door");
    const failures = [
      { member: { ...p4Clone(members[1]), address: { ...members[1].address, floorIndex: 999 } },
        code: "building.windowSlot.missingOpening", name: "BuildingWindowSlotTargetError" },
      { member: { ...p4Clone(members[1]), widthM: 999 },
        code: "building.windowWidth.unsupportedWidth", name: "BuildingWindowWidthOverrideError" },
      { member: p14Directive(door), code: "building.windowSlot.notWindow", name: "BuildingWindowSlotTargetError" }
    ];
    for (const [index, failure] of failures.entries()) {
      const input = { ...p4Clone(profile.input), windowWidthBatch: p14Batch([p4Clone(members[0]), failure.member]) };
      const before = canonicalJson(input);
      let expected: { name: string; message: string; code: unknown } | undefined;
      try { await compileBuilding(input); }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error)) throw error;
        expected = { name: error.name, message: error.message, code: error.code };
      }
      expect(expected).toMatchObject({ name: failure.name, code: failure.code });
      const wire = p4Wire();
      try {
        await expect(wire.client.compile(input, { requestId: "p14-semantic-" + index })).rejects.toMatchObject(expected!);
        const errors = wire.posted.filter(value => value.message.type === "error");
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toMatchObject({ type: "error", error: expected });
        expect(wire.posted.some(value => value.message.type === "complete")).toBe(false);
        expect(wire.posted.every(value => value.transferables.length === 0)).toBe(true);
      } finally { wire.client.dispose(); }
      expect(canonicalJson(input)).toBe(before);
    }
    const gate = deferred<void>(), wire = p4Wire(async input => {
      if (input.buildingId === "p14-semantic-held") await gate.promise;
      return compileBuilding(input);
    });
    try {
      const first = wire.client.compile({ ...profile.input, buildingId: "p14-semantic-held",
        windowWidthBatch: p14Batch(members) }, { requestId: "p14-semantic-held" });
      const superseded = expect(first).rejects.toMatchObject({ name: "CompilerRequestSupersededError" });
      await expect(wire.client.compile({ ...profile.input, windowWidthBatch: p14Batch([members[0], failures[0].member]) },
        { requestId: "p14-admitted-invalid" })).rejects.toMatchObject({ code: "building.windowSlot.missingOpening" });
      await superseded; gate.resolve(); await wire.settle();
      expect(wire.sent.map(value => value.type)).toEqual(["compile-window-width-batch", "cancel", "compile-window-width-batch"]);
      expect(wire.posted.filter(value => value.message.type === "error").map(value => value.message.requestId)).toEqual(["p14-admitted-invalid"]);
      expect(wire.posted.some(value => value.message.type === "complete")).toBe(false);
      expect(wire.posted.some(value => value.message.requestId === "p14-semantic-held" && value.message.type === "error")).toBe(false);
    } finally { gate.resolve(); wire.client.dispose(); await wire.settle(); }
  }, 20_000);

  it("suppresses late multi-member cancellation and supersession while cleaning listeners and transferring exact unique backing buffers", async () => {
    const profile = profiles[0], directives = p14Members(profile);
    for (const kind of ["cancel", "supersede"] as const) {
      const gate = deferred<void>(), wire = p4Wire(async input => {
        if (input.buildingId === "p14-held") await gate.promise;
        return compileBuilding(input);
      });
      const abort = new AbortController(), removed = vi.spyOn(abort.signal, "removeEventListener");
      try {
        const first = wire.client.compile({ ...profile.input, buildingId: "p14-held", windowWidthBatch: p14Batch(directives) },
          { requestId: "p14-held", signal: abort.signal });
        const rejected = expect(first).rejects.toMatchObject({
          name: kind === "cancel" ? "CompilerRequestAbortError" : "CompilerRequestSupersededError"
        });
        if (kind === "cancel") abort.abort();
        const activeInput = { ...profile.input, buildingId: "p14-active",
          windowWidthBatch: p14Batch(directives.map(directive => ({ ...directive, widthM: 0.23 }))) };
        const active = await wire.client.compile(activeInput, { requestId: "p14-active" });
        await rejected; gate.resolve(); await wire.settle();
        expect(p4Complete(active)).toEqual(p4Complete(await compileBuilding(activeInput)));
        expect(wire.posted.filter(value => value.message.type === "complete").map(value => value.message.requestId)).toEqual(["p14-active"]);
        expect(wire.posted.some(value => value.message.type === "error" && value.message.requestId === "p14-held")).toBe(false);
        expect(removed).toHaveBeenCalledTimes(1);
        const completion = wire.posted.find(value => value.message.type === "complete")!;
        const buffers = new Set<ArrayBuffer>();
        for (const batch of active.meshBatches) for (const span of [batch.positions, batch.normals, batch.uvs, batch.indices])
          if (span) buffers.add(span.buffer as ArrayBuffer);
        for (const batch of active.instanceBatches) if (batch.transforms) buffers.add(batch.transforms.buffer as ArrayBuffer);
        expect(new Set(completion.transferables).size).toBe(completion.transferables.length);
        expect(new Set(completion.transferables)).toEqual(buffers);
      } finally { gate.resolve(); wire.client.dispose(); removed.mockRestore(); await wire.settle(); }
      expect(wire.unsubscribeCount).toBe(1);
    }
    const abort = new AbortController(), removed = vi.spyOn(abort.signal, "removeEventListener");
    let unsubscribed = 0;
    const post = vi.fn(() => { throw new Error("p14 batch endpoint failed"); });
    const throwing = new CompilerClient({ postMessage: post, subscribe: () => () => { unsubscribed++; } });
    try {
      await expect(throwing.compile({ ...profile.input, windowWidthBatch: p14Batch(directives) },
        { requestId: "p14-throw", signal: abort.signal })).rejects.toThrow("p14 batch endpoint failed");
      expect(removed).toHaveBeenCalledTimes(1); expect(post).toHaveBeenCalledTimes(1);
    } finally { throwing.dispose(); removed.mockRestore(); }
    expect(unsubscribed).toBe(1); expect(post).toHaveBeenCalledTimes(1);
    // The controlled in-process endpoint proves schemas, ownership and transfer lists,
    // not native browser-thread detachment or rendered output.
  }, 20_000);
});
