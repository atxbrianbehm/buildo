import { createFamilyBenchmarkScene, type FamilyBenchmarkScene } from "../performance/familyBenchmarkScene";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { vi } from "vitest";

describe("family benchmark scene", () => {
  it("creates a 100-building benchmark scene that shares one family runtime", async () => {
    const fixture = await createAssemblyHallFixture();
    let benchmark: FamilyBenchmarkScene | undefined;
    let tick = 100;

    try {
      benchmark = await createFamilyBenchmarkScene({
        fixture,
        buildingCount: 100,
        now: () => {
          tick += 5;
          return tick;
        }
      });
      const wallMaterials = new Set(
        Array.from(benchmark.familyRuntime.buildingRuntimes.values()).map(
          (runtime) => runtime.objectsByBatchId.get("mesh.wall-panels")!.material
        )
      );

      expect(benchmark.schemaVersion).toBe("0.1.0");
      expect(benchmark.report.schemaVersion).toBe("0.1.0");
      expect(benchmark.report.benchmarkKind).toBe("shared-family-100-building-scene");
      expect(benchmark.report.familyId).toBe(fixture.spec.familyId);
      expect(benchmark.report.buildingCount).toBe(100);
      expect(benchmark.familyRuntime.root.children).toHaveLength(100);
      expect(benchmark.familyRuntime.listBuildingIds()).toHaveLength(100);
      expect(wallMaterials.size).toBe(1);
      expect(benchmark.report.assets.familyAssetsShared).toBe(true);
      expect(benchmark.report.runtimeMetrics).toEqual(benchmark.familyRuntime.metrics);
      expect(benchmark.report.runtimeMetrics.buildingCount).toBe(100);
      expect(benchmark.report.runtimeMetrics.textureCount).toBe(fixture.metrics.textureCount);
      expect(benchmark.report.perBuilding.triangleCount).toBe(fixture.ir.metrics.triangleCount);
      expect(benchmark.report.aggregate.triangleCount).toBe(fixture.ir.metrics.triangleCount * 100);
      expect(benchmark.report.transfer.runtimeIrBytes).toBeGreaterThan(0);
      expect(benchmark.report.targets.oneBuildingTriangleLimit.passed).toBe(true);
      expect(benchmark.report.targets.familyAssetSharing.passed).toBe(true);
      expect(benchmark.report.timing.compileTimeMs).toBe(500);
      expect(benchmark.report.timing.runtimeMountTimeMs).toBe(500);
    } finally {
      benchmark?.familyRuntime.dispose();
      fixture.familyRuntime.dispose();
    }
  });

  it("yields between benchmark compile and mount batches", async () => {
    const fixture = await createAssemblyHallFixture();
    let benchmark: FamilyBenchmarkScene | undefined;
    const yieldToMainThread = vi.fn(async () => undefined);

    try {
      benchmark = await createFamilyBenchmarkScene({
        fixture,
        buildingCount: 5,
        yieldEvery: 2,
        yieldToMainThread
      });

      expect(benchmark.report.buildingCount).toBe(5);
      expect(yieldToMainThread).toHaveBeenCalledTimes(4);
    } finally {
      benchmark?.familyRuntime.dispose();
      fixture.familyRuntime.dispose();
    }
  });

  it("aborts benchmark work before publishing a scene", async () => {
    const fixture = await createAssemblyHallFixture();
    const abortController = new AbortController();
    const yieldToMainThread = vi.fn(async () => {
      abortController.abort();
    });

    try {
      await expect(
        createFamilyBenchmarkScene({
          fixture,
          buildingCount: 5,
          signal: abortController.signal,
          yieldEvery: 1,
          yieldToMainThread
        })
      ).rejects.toThrow("Family benchmark generation aborted");
      expect(yieldToMainThread).toHaveBeenCalledTimes(1);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
