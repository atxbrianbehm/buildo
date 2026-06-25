import { createFamilyBenchmarkDocumentation } from "../performance/familyBenchmarkDocumentation";
import { createFamilyBenchmarkScene, type FamilyBenchmarkScene } from "../performance/familyBenchmarkScene";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

describe("family benchmark documentation", () => {
  it("documents measured, estimated, and unavailable benchmark profile coverage", async () => {
    const fixture = await createAssemblyHallFixture();
    let benchmark: FamilyBenchmarkScene | undefined;
    let tick = 0;

    try {
      benchmark = await createFamilyBenchmarkScene({
        fixture,
        buildingCount: 100,
        now: () => {
          tick += 5;
          return tick;
        }
      });

      const documentation = createFamilyBenchmarkDocumentation({ report: benchmark.report });
      const metricsById = new Map(documentation.profileCoverage.map((metric) => [metric.id, metric]));

      expect(documentation.schemaVersion).toBe("0.1.0");
      expect(documentation.benchmarkKind).toBe("shared-family-100-building-scene");
      expect(documentation.familyId).toBe(fixture.spec.familyId);
      expect(metricsById.get("cpuCompileTimeMs")).toMatchObject({
        status: "measured",
        value: 500,
        unit: "ms"
      });
      expect(metricsById.get("workerTransferBytes")).toMatchObject({
        status: "estimated",
        value: benchmark.report.transfer.runtimeIrBytes,
        unit: "bytes"
      });
      expect(metricsById.get("gpuMemoryBytes")).toMatchObject({
        status: "not-captured",
        value: null
      });
      expect(metricsById.get("frameTimeMs")).toMatchObject({
        status: "not-captured",
        value: null
      });
      expect(metricsById.get("drawCalls")).toMatchObject({
        status: "measured",
        value: benchmark.report.aggregate.drawCallCount,
        unit: "count"
      });
      expect(documentation.knownLimitations).toContain(
        "GPU memory is not exposed by a stable browser API in the current benchmark surface."
      );
      expect(documentation.knownLimitations).toContain(
        "Frame time is captured by the separate 16-building orbit benchmark rather than this 100-building construction benchmark."
      );
    } finally {
      benchmark?.familyRuntime.dispose();
      fixture.familyRuntime.dispose();
    }
  });
});
