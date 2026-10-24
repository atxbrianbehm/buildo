import { vi } from "vitest";
import type { RendererBackendSupport } from "../renderer-three/buildingSceneAdapter";
import {
  configureAssemblyRendererPresentation,
  createAssemblyRenderer,
  createWebGpuAssemblyRenderer,
  type AssemblyRenderer,
  type AssemblyRendererActivation
} from "../renderer-three/assemblyRendererFactory";

const gpuMock = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock("three/webgpu", () => ({ WebGPURenderer: gpuMock.construct }));

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
  it.each([true, false])("verifies the initialized backend rather than the renderer class name: %s", async actual => {
    vi.stubGlobal("navigator", { gpu: {} });
    const renderer = { ...fakeRenderer("gpu-default"), init: vi.fn(async () => {}), backend: { isWebGPUBackend: actual } };
    gpuMock.construct.mockImplementation(function () { return renderer; });
    try {
      if (actual) {
        expect(await createWebGpuAssemblyRenderer()).toBe(renderer);
        expect(renderer.dispose).not.toHaveBeenCalled();
      } else {
        await expect(createWebGpuAssemblyRenderer()).rejects.toThrow("actual WebGPU backend");
        expect(renderer.dispose).toHaveBeenCalledTimes(1);
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it("reports WebGL when Three silently chooses its internal WebGL fallback", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    const gpu = { ...fakeRenderer("internal-gl"), init: vi.fn(async () => {}), backend: { isWebGPUBackend: false } };
    const gl = fakeRenderer("explicit-gl");
    gpuMock.construct.mockImplementation(function () { return gpu; });
    try {
      const activated = await createAssemblyRenderer({ backendSupport: backendSupport(), createWebGlRenderer: () => gl });
      expect(activated.activeBackend).toBe("webgl");
      expect(activated.renderer).toBe(gl);
      expect(activated.fallbackReason).toContain("actual WebGPU backend");
      expect(gpu.dispose).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("configures the shared renderer presentation baseline", () => {
    const renderer = fakeRenderer("presentation") as AssemblyRenderer & {
      outputColorSpace?: string;
      shadowMap: { enabled: boolean; type?: number };
      toneMapping?: number;
      toneMappingExposure?: number;
    };
    renderer.shadowMap = { enabled: false };

    configureAssemblyRendererPresentation(renderer);

    expect(renderer.outputColorSpace).toBe("srgb");
    expect(renderer.toneMapping).toBeDefined();
    expect(renderer.toneMappingExposure).toBe(1.05);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBeDefined();
  });

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
