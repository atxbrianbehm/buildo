import { vi } from "vitest";
import type { RendererBackendSupport } from "../renderer-three/buildingSceneAdapter";
import {
  createAssemblyRenderer,
  type AssemblyRenderer,
  type AssemblyRendererActivation
} from "../renderer-three/assemblyRendererFactory";

function backendSupport(input: Partial<RendererBackendSupport> = {}): RendererBackendSupport {
  return {
    threeRevision: "184",
    webgl: {
      available: true,
      importPath: "three"
    },
    webgpu: {
      available: true,
      importPath: "three/webgpu"
    },
    preferredBackend: "webgpu",
    ...input
  };
}

function fakeRenderer(label: string): AssemblyRenderer {
  const canvas = document.createElement("canvas");
  canvas.dataset.fakeRenderer = label;
  return {
    domElement: canvas,
    dispose: vi.fn(),
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn()
  };
}

describe("assembly renderer factory", () => {
  it("activates WebGPU first when support prefers WebGPU and initialization succeeds", async () => {
    const webgpu = fakeRenderer("webgpu");
    const createWebGpuRenderer = vi.fn(async () => webgpu);
    const createWebGlRenderer = vi.fn(() => fakeRenderer("webgl"));

    const activation = await createAssemblyRenderer({
      backendSupport: backendSupport(),
      createWebGpuRenderer,
      createWebGlRenderer
    });

    expect(activation).toEqual<AssemblyRendererActivation>({
      activeBackend: "webgpu",
      renderer: webgpu
    });
    expect(createWebGpuRenderer).toHaveBeenCalledTimes(1);
    expect(createWebGlRenderer).not.toHaveBeenCalled();
  });

  it("falls back to WebGL when WebGPU initialization fails", async () => {
    const webgl = fakeRenderer("webgl");
    const createWebGpuRenderer = vi.fn(async () => {
      throw new Error("adapter unavailable");
    });
    const createWebGlRenderer = vi.fn(() => webgl);

    const activation = await createAssemblyRenderer({
      backendSupport: backendSupport(),
      createWebGpuRenderer,
      createWebGlRenderer
    });

    expect(activation.renderer).toBe(webgl);
    expect(activation.activeBackend).toBe("webgl");
    expect(activation.fallbackReason).toContain("adapter unavailable");
    expect(createWebGpuRenderer).toHaveBeenCalledTimes(1);
    expect(createWebGlRenderer).toHaveBeenCalledTimes(1);
  });

  it("uses WebGL directly when WebGPU is unavailable", async () => {
    const webgl = fakeRenderer("webgl");
    const createWebGpuRenderer = vi.fn(async () => fakeRenderer("webgpu"));
    const createWebGlRenderer = vi.fn(() => webgl);

    const activation = await createAssemblyRenderer({
      backendSupport: backendSupport({
        webgpu: {
          available: false,
          importPath: "three/webgpu"
        },
        preferredBackend: "webgl"
      }),
      createWebGpuRenderer,
      createWebGlRenderer
    });

    expect(activation.renderer).toBe(webgl);
    expect(activation.activeBackend).toBe("webgl");
    expect(activation.fallbackReason).toBeUndefined();
    expect(createWebGpuRenderer).not.toHaveBeenCalled();
    expect(createWebGlRenderer).toHaveBeenCalledTimes(1);
  });
});
