import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import { compileBuilding, type CompileBuildingInput } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { CompilerClient } from "../compiler/compilerClient";
import {
  collectRuntimeIrTransferables,
  CompilerWorkerRequestSchema,
  CompilerWorkerResponseSchema,
  type CompilerWorkerRequest,
  type CompilerWorkerResponse
} from "../compiler/compilerWorkerProtocol";
import { createCompilerWorkerRuntime } from "../compiler/compilerWorkerRuntime";
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
});
