import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
  type Camera,
  type Scene
} from "three";
import type { RendererBackendSupport } from "./buildingSceneAdapter";

export type AssemblyRendererBackend = "webgpu" | "webgl";

export interface AssemblyRenderer {
  domElement: HTMLCanvasElement;
  dispose(): void;
  render(scene: Scene, camera: Camera): void;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
}

export interface AssemblyRendererActivation {
  renderer: AssemblyRenderer;
  activeBackend: AssemblyRendererBackend;
  fallbackReason?: string;
}

export interface CreateAssemblyRendererInput {
  backendSupport: RendererBackendSupport;
  createWebGpuRenderer?: () => Promise<AssemblyRenderer>;
  createWebGlRenderer?: () => AssemblyRenderer;
}

export type AssemblyRendererFactory = (
  input: Pick<CreateAssemblyRendererInput, "backendSupport">
) => AssemblyRendererActivation | Promise<AssemblyRendererActivation>;

type WebGpuAssemblyRenderer = AssemblyRenderer & {
  init(): Promise<unknown>;
};

type WebGpuRendererConstructor = new (parameters?: {
  alpha?: boolean;
  antialias?: boolean;
}) => WebGpuAssemblyRenderer;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function configureAssemblyRendererPresentation(renderer: AssemblyRenderer): void {
  const configurable = renderer as AssemblyRenderer & {
    outputColorSpace?: typeof SRGBColorSpace;
    shadowMap?: {
      enabled: boolean;
      type: typeof PCFSoftShadowMap;
    };
    toneMapping?: typeof ACESFilmicToneMapping;
    toneMappingExposure?: number;
  };
  configurable.outputColorSpace = SRGBColorSpace;
  configurable.toneMapping = ACESFilmicToneMapping;
  configurable.toneMappingExposure = 1.05;
  if (configurable.shadowMap) {
    configurable.shadowMap.enabled = true;
    configurable.shadowMap.type = PCFSoftShadowMap;
  }
}

export function createWebGlAssemblyRenderer(): AssemblyRenderer {
  const browserWindow = globalThis.window as Window | undefined;
  if (browserWindow && !("WebGLRenderingContext" in browserWindow)) {
    throw new Error("WebGLRenderingContext is unavailable");
  }

  return new WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true
  });
}

export async function createWebGpuAssemblyRenderer(): Promise<AssemblyRenderer> {
  const browserNavigator = globalThis.navigator as (Navigator & { gpu?: unknown }) | undefined;
  if (!browserNavigator?.gpu) {
    throw new Error("navigator.gpu is unavailable");
  }

  const { WebGPURenderer } = (await import("three/webgpu")) as unknown as {
    WebGPURenderer: WebGpuRendererConstructor;
  };
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: true
  });

  try {
    await renderer.init();
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  return renderer;
}

export async function createAssemblyRenderer(
  input: CreateAssemblyRendererInput
): Promise<AssemblyRendererActivation> {
  const createWebGpuRenderer = input.createWebGpuRenderer ?? createWebGpuAssemblyRenderer;
  const createWebGlRenderer = input.createWebGlRenderer ?? createWebGlAssemblyRenderer;
  const shouldTryWebGpu =
    input.backendSupport.preferredBackend === "webgpu" && input.backendSupport.webgpu.available;

  if (shouldTryWebGpu) {
    try {
      const renderer = await createWebGpuRenderer();
      configureAssemblyRendererPresentation(renderer);
      return {
        renderer,
        activeBackend: "webgpu"
      };
    } catch (error) {
      if (!input.backendSupport.webgl.available) {
        throw new Error(`WebGPU renderer activation failed and no WebGL fallback is available: ${errorMessage(error)}`, {
          cause: error
        });
      }

      const renderer = createWebGlRenderer();
      configureAssemblyRendererPresentation(renderer);
      return {
        renderer,
        activeBackend: "webgl",
        fallbackReason: `WebGPU renderer activation failed: ${errorMessage(error)}. Using WebGL fallback.`
      };
    }
  }

  if (!input.backendSupport.webgl.available) {
    throw new Error("No Assembly Hall renderer backend is available.");
  }

  const renderer = createWebGlRenderer();
  configureAssemblyRendererPresentation(renderer);
  return {
    renderer,
    activeBackend: "webgl"
  };
}
