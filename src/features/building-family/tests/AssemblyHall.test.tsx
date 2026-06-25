import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import type { AssemblyRendererActivation } from "../renderer-three/assemblyRendererFactory";
import { AssemblyHall } from "../ui/AssemblyHall";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

function fakeRendererFactory(
  activeBackend: AssemblyRendererActivation["activeBackend"] = "webgl",
  fallbackReason?: string
) {
  return async (): Promise<AssemblyRendererActivation> => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", "assembly-renderer-canvas");
    return {
      activeBackend,
      fallbackReason,
      renderer: {
        domElement: canvas,
        dispose: vi.fn(),
        render: vi.fn(),
        setPixelRatio: vi.fn(),
        setSize: vi.fn()
      }
    };
  };
}

describe("AssemblyHall", () => {
  it("renders the generated building fixture, atlas identity, component gallery, and renderer metrics", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    expect(screen.getByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    const viewport = screen.getByRole("img", { name: "Rendered generated building fixture" });
    expect(await within(viewport).findByTestId("assembly-renderer-canvas")).toBeInTheDocument();
    expect(screen.getByText(fixture.prompt)).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent(
      String(fixture.metrics.drawCallCount)
    );
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent(
      String(fixture.metrics.instanceCount)
    );
    expect(screen.getByLabelText("Assembly Hall atlas identity")).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(screen.getByRole("table", { name: "Component gallery summary" })).toHaveTextContent(
      "Window frame"
    );
    expect(screen.getByRole("table", { name: "Component gallery summary" })).toHaveTextContent(
      "instanceBatch"
    );
  });

  it("exposes the sixteen-variant shared-family stress summary", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    const stressView = screen.getByLabelText("16-variant family stress view");
    expect(stressView).toHaveTextContent("16 variants");
    expect(stressView).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(stressView).toHaveTextContent(fixture.catalog.catalogId);
    expect(screen.getByRole("table", { name: "16-variant family stress variants" })).toHaveTextContent(
      fixture.ir.buildingId
    );
    expect(screen.getByRole("table", { name: "16-variant family stress variants" })).toHaveTextContent(
      fixture.variantStress.variants[15].buildingSeed
    );
  });

  it("runs and surfaces the 16-building orbit benchmark report from Assembly Hall", async () => {
    const fixture = await createAssemblyHallFixture();
    const disposeOrbitRuntime = vi.fn();
    const orbitBenchmarkSceneFactory = vi.fn(
      async () =>
        ({
          schemaVersion: "0.1.0",
          familyRuntime: {
            dispose: disposeOrbitRuntime
          },
          report: {
            schemaVersion: "0.1.0",
            benchmarkKind: "shared-family-16-building-orbit",
            familyId: fixture.spec.familyId,
            buildingCount: 16,
            frameSampleCount: 8,
            aggregate: {
              drawCallCount: 96,
              instanceCount: fixture.ir.metrics.instanceCount * 16,
              triangleCount: fixture.ir.metrics.triangleCount * 16
            },
            runtimeMetrics: {
              buildingCount: 16,
              meshCount: 48,
              instanceBatchCount: 48,
              instanceCount: fixture.ir.metrics.instanceCount * 16,
              triangleCount: fixture.ir.metrics.triangleCount * 16,
              drawCallCount: 96,
              sharedMaterialCount: fixture.familyRuntime.metrics.sharedMaterialCount,
              textureCount: fixture.familyRuntime.metrics.textureCount,
              preferredBackend: fixture.backendSupport.preferredBackend
            },
            render: {
              activeBackend: "webgl",
              fallbackReason: null
            },
            frameTime: {
              budgetMs: 33.4,
              averageFrameTimeMs: 12,
              p95FrameTimeMs: 14,
              maxFrameTimeMs: 15,
              samples: [
                {
                  index: 0,
                  cameraPosition: [1, 2, 3],
                  elapsedMs: 12
                }
              ]
            },
            assets: {
              atlasContentHash: fixture.packedAtlas.contentHash,
              familyAssetsShared: true,
              sharedMaterialCount: fixture.familyRuntime.metrics.sharedMaterialCount,
              textureCount: fixture.familyRuntime.metrics.textureCount
            },
            targets: {
              interactiveOrbit: {
                actualP95FrameTimeMs: 14,
                budgetMs: 33.4,
                passed: true
              },
              familyAssetSharing: {
                passed: true
              }
            }
          }
        }) as never
    );

    render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory()}
        orbitBenchmarkSceneFactory={orbitBenchmarkSceneFactory}
      />
    );

    const orbitReport = screen.getByLabelText("16-building orbit benchmark report");
    expect(orbitReport).toHaveTextContent("Not run");

    fireEvent.click(screen.getByRole("button", { name: "Run 16-building orbit benchmark" }));

    expect(await screen.findByText("shared-family-16-building-orbit")).toBeInTheDocument();
    expect(orbitReport).toHaveTextContent("16 buildings");
    expect(orbitReport).toHaveTextContent("Frame p95");
    expect(orbitReport).toHaveTextContent("14 ms");
    expect(orbitReport).toHaveTextContent("Interactive orbit passed");
    expect(orbitReport).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(disposeOrbitRuntime).toHaveBeenCalledTimes(1);
  });

  it("runs and surfaces the 100-building benchmark report from Assembly Hall", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    const benchmarkReport = screen.getByLabelText("100-building benchmark report");
    expect(benchmarkReport).toHaveTextContent("Not run");

    fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));

    expect(await screen.findByText("shared-family-100-building-scene")).toBeInTheDocument();
    expect(benchmarkReport).toHaveTextContent("100 buildings");
    expect(benchmarkReport).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(benchmarkReport).toHaveTextContent(fixture.ir.metrics.triangleCount.toLocaleString("en-US"));
    expect(benchmarkReport).toHaveTextContent((fixture.ir.metrics.triangleCount * 100).toLocaleString("en-US"));
    expect(benchmarkReport).toHaveTextContent("Triangle target passed");
    expect(benchmarkReport).toHaveTextContent("Family assets shared");
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent(
      "CPU compile time"
    );
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent("measured");
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent(
      "Worker transfer size"
    );
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent("estimated");
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent("GPU memory");
    expect(screen.getByLabelText("100-building benchmark profile coverage")).toHaveTextContent("not captured");
    expect(screen.getByLabelText("100-building benchmark known limitations")).toHaveTextContent(
      "separate 16-building orbit benchmark"
    );
  });

  it("aborts an in-flight benchmark when Assembly Hall unmounts", async () => {
    const fixture = await createAssemblyHallFixture();
    let capturedSignal: AbortSignal | undefined;
    const benchmarkSceneFactory = vi.fn(async (input: { signal?: AbortSignal }) => {
      capturedSignal = input.signal;
      return new Promise<never>((_, reject) => {
        input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });

    const { unmount } = render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory()}
        benchmarkSceneFactory={benchmarkSceneFactory}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));

    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("exposes semantic renderer lookup entries as a selectable Assembly Hall inspector", async () => {
    const fixture = await createAssemblyHallFixture();
    const windowPath = `building/${fixture.ir.familyId}/facade/front/floor/0/bay/0/window/frame`;

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), {
      target: { value: windowPath }
    });

    const inspector = screen.getByLabelText("Selected semantic element");
    expect(inspector).toHaveTextContent(windowPath);
    expect(inspector).toHaveTextContent("instances.window");
    expect(inspector).toHaveTextContent("openings");
    expect(inspector).toHaveTextContent("glass.primary");
    expect(inspector).toHaveTextContent("InstancedMesh");
    expect(inspector).toHaveTextContent("Window frame");
  });

  it("shows the activated renderer backend and fallback reason from the renderer factory", async () => {
    const fixture = await createAssemblyHallFixture();

    render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory("webgl", "WebGPU renderer activation failed: adapter unavailable. Using WebGL fallback.")}
      />
    );

    const metrics = screen.getByLabelText("Assembly Hall renderer metrics");
    expect(await within(screen.getByRole("img", { name: "Rendered generated building fixture" })).findByTestId("assembly-renderer-canvas")).toBeInTheDocument();
    expect(metrics).toHaveTextContent("webgl active / webgpu preferred");
    expect(screen.getByRole("status")).toHaveTextContent("adapter unavailable");
  });

  it("surfaces compatibility diagnostics when WebGPU is unsupported but WebGL fallback is available", async () => {
    const fixture = await createAssemblyHallFixture();
    const compatibilityFixture = {
      ...fixture,
      backendSupport: {
        ...fixture.backendSupport,
        webgpu: {
          available: false,
          importPath: "three/webgpu" as const
        },
        preferredBackend: "webgl" as const
      },
      metrics: {
        ...fixture.metrics,
        preferredBackend: "webgl" as const
      }
    };

    render(<AssemblyHall fixture={compatibilityFixture} rendererFactory={fakeRendererFactory("webgl")} />);

    const diagnostics = screen.getByRole("table", { name: "Assembly Hall compatibility diagnostics" });
    expect(diagnostics).toHaveTextContent("renderer.webgpuUnavailable");
    expect(diagnostics).toHaveTextContent("WebGPU unavailable");
    expect(diagnostics).toHaveTextContent("WebGL fallback available");
  });

  it("drives stage group visibility from the Assembly Hall reveal controls", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Reveal through stage" }), {
      target: { value: "facade" }
    });

    const stageVisibility = screen.getByLabelText("Assembly stage visibility");
    expect(stageVisibility).toHaveTextContent("massing");
    expect(stageVisibility).toHaveTextContent("visible");
    expect(stageVisibility).toHaveTextContent("facade");
    expect(stageVisibility).toHaveTextContent("openings");
    expect(stageVisibility).toHaveTextContent("hidden");

    const stageGroups = new Map(fixture.buildingRuntime.stageGroups.map((entry) => [entry.stage, entry.group.visible]));
    expect(stageGroups.get("massing")).toBe(true);
    expect(stageGroups.get("facade")).toBe(true);
    expect(stageGroups.get("openings")).toBe(false);
    expect(stageGroups.get("trim")).toBe(false);
    expect(stageGroups.get("roof")).toBe(false);
  });
});
