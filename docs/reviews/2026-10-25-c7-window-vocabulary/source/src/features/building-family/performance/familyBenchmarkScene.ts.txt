import { compileBuilding } from "../compiler/buildingCompiler";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import {
  createBuildingFamilyRuntime,
  type BuildingFamilyRuntime,
  type BuildingFamilyRuntimeMetrics
} from "../renderer-three/familyRuntime";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";

const defaultBenchmarkBuildingCount = 100;
const defaultBenchmarkYieldEvery = 10;
const benchmarkAbortMessage = "Family benchmark generation aborted";
const oneBuildingTriangleLimit = 150_000;

export interface CreateFamilyBenchmarkSceneInput {
  fixture: AssemblyHallFixture;
  buildingCount?: number;
  now?: () => number;
  signal?: AbortSignal;
  yieldEvery?: number;
  yieldToMainThread?: () => Promise<void>;
}

export interface FamilyBenchmarkReport {
  schemaVersion: "0.1.0";
  benchmarkKind: "shared-family-100-building-scene";
  familyId: string;
  buildingCount: number;
  perBuilding: {
    drawCallCount: number;
    instanceCount: number;
    semanticPathCount: number;
    triangleCount: number;
  };
  aggregate: {
    drawCallCount: number;
    instanceCount: number;
    triangleCount: number;
  };
  runtimeMetrics: BuildingFamilyRuntimeMetrics;
  transfer: {
    perBuildingRuntimeIrBytes: number;
    runtimeIrBytes: number;
  };
  timing: {
    compileTimeMs: number;
    runtimeMountTimeMs: number;
  };
  assets: {
    atlasContentHash: string;
    familyAssetsShared: boolean;
    sharedMaterialCount: number;
    textureCount: number;
  };
  targets: {
    oneBuildingTriangleLimit: {
      actual: number;
      limit: number;
      passed: boolean;
    };
    familyAssetSharing: {
      passed: boolean;
    };
  };
}

export interface FamilyBenchmarkScene {
  schemaVersion: "0.1.0";
  familyRuntime: BuildingFamilyRuntime;
  report: FamilyBenchmarkReport;
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

async function defaultYieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function validateBuildingCount(buildingCount: number): void {
  if (!Number.isInteger(buildingCount) || buildingCount < 1) {
    throw new Error("Family benchmark building count must be a positive integer.");
  }
}

function validateBenchmarkYieldEvery(yieldEvery: number): void {
  if (!Number.isInteger(yieldEvery) || yieldEvery < 1) {
    throw new Error("Family benchmark yield interval must be a positive integer.");
  }
}

function throwIfBenchmarkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error(benchmarkAbortMessage);
  }
}

async function yieldAfterBenchmarkBatch(input: {
  index: number;
  total: number;
  yieldEvery: number;
  yieldToMainThread: () => Promise<void>;
  signal: AbortSignal | undefined;
}): Promise<void> {
  const completed = input.index + 1;
  if (completed >= input.total || completed % input.yieldEvery !== 0) {
    return;
  }

  throwIfBenchmarkAborted(input.signal);
  await input.yieldToMainThread();
  throwIfBenchmarkAborted(input.signal);
}

function benchmarkBuildingId(baseBuildingId: string, index: number): string {
  return `${baseBuildingId}.benchmark-${index.toString().padStart(3, "0")}`;
}

function typedArrayByteLength(value: ArrayBufferView | undefined): number {
  return value?.byteLength ?? 0;
}

function estimateRuntimeIrTransferBytes(ir: RuntimeBuildingIR): number {
  const meshBytes = ir.meshBatches.reduce(
    (total, batch) =>
      total +
      typedArrayByteLength(batch.positions) +
      typedArrayByteLength(batch.normals) +
      typedArrayByteLength(batch.uvs) +
      typedArrayByteLength(batch.indices),
    0
  );
  const instanceBytes = ir.instanceBatches.reduce(
    (total, batch) => total + typedArrayByteLength(batch.transforms),
    0
  );

  return meshBytes + instanceBytes;
}

function elapsedMs(start: number, stop: number): number {
  return Math.max(0, stop - start);
}

export async function createFamilyBenchmarkScene(
  input: CreateFamilyBenchmarkSceneInput
): Promise<FamilyBenchmarkScene> {
  const buildingCount = input.buildingCount ?? defaultBenchmarkBuildingCount;
  const yieldEvery = input.yieldEvery ?? defaultBenchmarkYieldEvery;
  validateBuildingCount(buildingCount);
  validateBenchmarkYieldEvery(yieldEvery);
  throwIfBenchmarkAborted(input.signal);

  const now = input.now ?? defaultNow;
  const yieldToMainThread = input.yieldToMainThread ?? defaultYieldToMainThread;
  const familyRuntime = createBuildingFamilyRuntime({
    familyId: input.fixture.spec.familyId,
    packedAtlas: input.fixture.packedAtlas,
    debugExport: input.fixture.debugExport,
    backendSupport: input.fixture.backendSupport
  });

  try {
    const benchmarkIrs: RuntimeBuildingIR[] = [];
    let compileTimeMs = 0;
    let runtimeMountTimeMs = 0;

    for (let index = 0; index < buildingCount; index += 1) {
      throwIfBenchmarkAborted(input.signal);
      const compileStart = now();
      const ir = await compileBuilding({
        spec: input.fixture.spec,
        catalog: input.fixture.catalog,
        graph: input.fixture.graph,
        buildingId: benchmarkBuildingId(input.fixture.ir.buildingId, index)
      });
      throwIfBenchmarkAborted(input.signal);
      compileTimeMs += elapsedMs(compileStart, now());
      benchmarkIrs.push(ir);
      await yieldAfterBenchmarkBatch({
        index,
        total: buildingCount,
        yieldEvery,
        yieldToMainThread,
        signal: input.signal
      });
    }

    for (let index = 0; index < benchmarkIrs.length; index += 1) {
      const ir = benchmarkIrs[index];
      throwIfBenchmarkAborted(input.signal);
      const mountStart = now();
      familyRuntime.createOrReplaceBuilding({
        catalog: input.fixture.catalog,
        componentGallery: input.fixture.componentGallery,
        ir
      });
      throwIfBenchmarkAborted(input.signal);
      runtimeMountTimeMs += elapsedMs(mountStart, now());
      await yieldAfterBenchmarkBatch({
        index,
        total: buildingCount,
        yieldEvery,
        yieldToMainThread,
        signal: input.signal
      });
    }

    throwIfBenchmarkAborted(input.signal);
    const runtimeMetrics = { ...familyRuntime.metrics };
    const perBuildingRuntimeIrBytes = estimateRuntimeIrTransferBytes(input.fixture.ir);
    const mountedRuntimes = Array.from(familyRuntime.buildingRuntimes.values());
    const familyAssetsShared =
      runtimeMetrics.buildingCount === buildingCount &&
      runtimeMetrics.textureCount === input.fixture.metrics.textureCount &&
      runtimeMetrics.sharedMaterialCount > 0 &&
      mountedRuntimes.every((runtime) => runtime.materialRegistry === familyRuntime.materialRegistry);

    return {
      schemaVersion: "0.1.0",
      familyRuntime,
      report: {
        schemaVersion: "0.1.0",
        benchmarkKind: "shared-family-100-building-scene",
        familyId: input.fixture.spec.familyId,
        buildingCount,
        perBuilding: {
          drawCallCount: input.fixture.buildingRuntime.renderables.length,
          instanceCount: input.fixture.ir.metrics.instanceCount,
          semanticPathCount: input.fixture.ir.semanticIndex.length,
          triangleCount: input.fixture.ir.metrics.triangleCount
        },
        aggregate: {
          drawCallCount: runtimeMetrics.drawCallCount,
          instanceCount: runtimeMetrics.instanceCount,
          triangleCount: runtimeMetrics.triangleCount
        },
        runtimeMetrics,
        transfer: {
          perBuildingRuntimeIrBytes,
          runtimeIrBytes: perBuildingRuntimeIrBytes * buildingCount
        },
        timing: {
          compileTimeMs,
          runtimeMountTimeMs
        },
        assets: {
          atlasContentHash: input.fixture.packedAtlas.contentHash,
          familyAssetsShared,
          sharedMaterialCount: runtimeMetrics.sharedMaterialCount,
          textureCount: runtimeMetrics.textureCount
        },
        targets: {
          oneBuildingTriangleLimit: {
            actual: input.fixture.ir.metrics.triangleCount,
            limit: oneBuildingTriangleLimit,
            passed: input.fixture.ir.metrics.triangleCount <= oneBuildingTriangleLimit
          },
          familyAssetSharing: {
            passed: familyAssetsShared
          }
        }
      }
    };
  } catch (error) {
    familyRuntime.dispose();
    throw error;
  }
}
