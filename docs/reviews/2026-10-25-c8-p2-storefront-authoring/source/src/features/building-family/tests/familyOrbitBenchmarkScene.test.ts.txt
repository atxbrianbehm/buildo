import { vi } from "vitest";
import type { AssemblyRendererActivation } from "../renderer-three/assemblyRendererFactory";
import { createFamilyOrbitBenchmarkScene, type FamilyOrbitBenchmarkScene } from "../performance/familyOrbitBenchmarkScene";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

function fakeRendererFactory(input: { render: () => void; dispose: () => void }) {
  return async (): Promise<AssemblyRendererActivation> => ({
    activeBackend: "webgl",
    renderer: {
      domElement: document.createElement("canvas"),
      dispose: input.dispose,
      render: vi.fn(input.render),
      setPixelRatio: vi.fn(),
      setSize: vi.fn()
    }
  });
}

describe("family orbit benchmark scene", () => {
  it("renders sampled orbit frames across a shared 16-building family runtime", async () => {
    const fixture = await createAssemblyHallFixture();
    let orbitScene: FamilyOrbitBenchmarkScene | undefined;
    let tick = 100;
    const disposeRenderer = vi.fn();
    const renderFrame = vi.fn(() => {
      tick += 12;
    });
    const rendererFactory = vi.fn(fakeRendererFactory({ render: renderFrame, dispose: disposeRenderer }));

    try {
      orbitScene = await createFamilyOrbitBenchmarkScene({
        fixture,
        rendererFactory,
        frameSampleCount: 8,
        now: () => tick
      });

      const positions = new Set(
        orbitScene.familyRuntime.root.children.map((child) => `${child.position.x}:${child.position.z}`)
      );

      expect(orbitScene.schemaVersion).toBe("0.1.0");
      expect(orbitScene.report.schemaVersion).toBe("0.1.0");
      expect(orbitScene.report.benchmarkKind).toBe("shared-family-16-building-orbit");
      expect(orbitScene.report.buildingCount).toBe(16);
      expect(orbitScene.report.frameSampleCount).toBe(8);
      expect(orbitScene.familyRuntime.root.children).toHaveLength(16);
      expect(positions.size).toBe(16);
      expect(rendererFactory).toHaveBeenCalledTimes(1);
      expect(renderFrame).toHaveBeenCalledTimes(8);
      expect(disposeRenderer).toHaveBeenCalledTimes(1);
      expect(orbitScene.report.frameTime.averageFrameTimeMs).toBe(12);
      expect(orbitScene.report.frameTime.p95FrameTimeMs).toBe(12);
      expect(orbitScene.report.frameTime.maxFrameTimeMs).toBe(12);
      expect(orbitScene.report.targets.interactiveOrbit.passed).toBe(true);
      expect(orbitScene.report.targets.familyAssetSharing.passed).toBe(true);
      expect(orbitScene.report.runtimeMetrics).toEqual(orbitScene.familyRuntime.metrics);
    } finally {
      orbitScene?.familyRuntime.dispose();
      fixture.familyRuntime.dispose();
    }
  });

  it("aborts orbit sampling and disposes renderer resources", async () => {
    const fixture = await createAssemblyHallFixture();
    const abortController = new AbortController();
    let tick = 100;
    const disposeRenderer = vi.fn();
    const renderFrame = vi.fn(() => {
      tick += 12;
      abortController.abort();
    });

    try {
      await expect(
        createFamilyOrbitBenchmarkScene({
          fixture,
          rendererFactory: fakeRendererFactory({ render: renderFrame, dispose: disposeRenderer }),
          frameSampleCount: 4,
          signal: abortController.signal,
          now: () => tick
        })
      ).rejects.toThrow("Family orbit benchmark generation aborted");

      expect(renderFrame).toHaveBeenCalledTimes(1);
      expect(disposeRenderer).toHaveBeenCalledTimes(1);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
