import { vi } from "vitest";
import type { AssemblyRendererActivation } from "../renderer-three/assemblyRendererFactory";
import { createFamilyBenchmarkProfilePacket, parseFamilyBenchmarkProfilePacket } from "../performance/familyBenchmarkProfilePacket";
import { createFamilyBenchmarkScene, type FamilyBenchmarkScene } from "../performance/familyBenchmarkScene";
import { createFamilyOrbitBenchmarkScene, type FamilyOrbitBenchmarkScene } from "../performance/familyOrbitBenchmarkScene";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

function fakeRendererFactory(input: { render: () => void }) {
  return async (): Promise<AssemblyRendererActivation> => ({
    activeBackend: "webgl",
    renderer: {
      domElement: document.createElement("canvas"),
      dispose: vi.fn(),
      render: vi.fn(input.render),
      setPixelRatio: vi.fn(),
      setSize: vi.fn()
    }
  });
}

describe("family benchmark profile packet", () => {
  it("combines construction and orbit reports into a schema-versioned profile packet", async () => {
    const fixture = await createAssemblyHallFixture();
    let construction: FamilyBenchmarkScene | undefined;
    let orbit: FamilyOrbitBenchmarkScene | undefined;
    let constructionTick = 0;
    let orbitTick = 100;

    try {
      construction = await createFamilyBenchmarkScene({
        fixture,
        buildingCount: 4,
        now: () => {
          constructionTick += 5;
          return constructionTick;
        }
      });
      orbit = await createFamilyOrbitBenchmarkScene({
        fixture,
        frameSampleCount: 4,
        rendererFactory: fakeRendererFactory({
          render: () => {
            orbitTick += 11;
          }
        }),
        now: () => orbitTick
      });

      const packet = createFamilyBenchmarkProfilePacket({
        fixture,
        constructionReport: construction.report,
        orbitReport: orbit.report,
        environment: {
          schemaVersion: "0.1.0",
          capturedAt: "2026-06-24T00:00:00.000Z",
          userAgent: "vitest-jsdom",
          hardwareConcurrency: 8,
          deviceMemoryGb: 16,
          devicePixelRatio: 2,
          viewport: {
            widthPx: 1280,
            heightPx: 720
          },
          renderer: {
            threeRevision: fixture.backendSupport.threeRevision,
            preferredBackend: fixture.backendSupport.preferredBackend,
            webglAvailable: fixture.backendSupport.webgl.available,
            webgpuAvailable: fixture.backendSupport.webgpu.available,
            constructionBackend: null,
            orbitBackend: "webgl"
          }
        }
      });
      const metricsById = new Map(packet.profileCoverage.map((metric) => [metric.id, metric]));

      expect(packet.schemaVersion).toBe("0.1.0");
      expect(packet.profileKind).toBe("dynamic-building-family-milestone-7-profile");
      expect(packet.familyId).toBe(fixture.spec.familyId);
      expect(packet.createdAt).toBe("2026-06-24T00:00:00.000Z");
      expect(packet.reports.construction).toEqual(construction.report);
      expect(packet.reports.orbit).toEqual(orbit.report);
      expect(packet.environment.userAgent).toBe("vitest-jsdom");
      expect(metricsById.get("cpuCompileTimeMs")).toMatchObject({ status: "measured", value: 20, unit: "ms" });
      expect(metricsById.get("workerTransferBytes")).toMatchObject({
        status: "estimated",
        value: construction.report.transfer.runtimeIrBytes,
        unit: "bytes"
      });
      expect(metricsById.get("frameTimeMs")).toMatchObject({
        status: "measured",
        value: orbit.report.frameTime.p95FrameTimeMs,
        unit: "ms"
      });
      expect(metricsById.get("gpuMemoryBytes")).toMatchObject({
        status: "not-captured",
        value: null
      });
      expect(packet.targets.interactiveOrbit.passed).toBe(true);
      expect(packet.targets.familyAssetSharing.passed).toBe(true);
      expect(packet.knownLimitations).toContain(
        "GPU memory is not exposed by a stable browser API in the current benchmark profile."
      );
      expect(packet.knownLimitations).toContain(
        "Configured live-provider proof is not included in this local benchmark profile packet."
      );
      expect(parseFamilyBenchmarkProfilePacket(JSON.parse(JSON.stringify(packet)))).toEqual(packet);
      expect(() =>
        parseFamilyBenchmarkProfilePacket({
          ...packet,
          profileKind: "wrong-profile"
        })
      ).toThrow("Invalid family benchmark profile packet");
    } finally {
      construction?.familyRuntime.dispose();
      orbit?.familyRuntime.dispose();
      fixture.familyRuntime.dispose();
    }
  });
});
