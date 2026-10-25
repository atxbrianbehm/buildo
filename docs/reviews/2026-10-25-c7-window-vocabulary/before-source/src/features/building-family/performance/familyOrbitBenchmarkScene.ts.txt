import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Object3D
} from "three";
import { compileBuilding } from "../compiler/buildingCompiler";
import {
  createAssemblyRenderer,
  type AssemblyRenderer,
  type AssemblyRendererActivation,
  type AssemblyRendererBackend,
  type AssemblyRendererFactory
} from "../renderer-three/assemblyRendererFactory";
import {
  createBuildingFamilyRuntime,
  type BuildingFamilyRuntime,
  type BuildingFamilyRuntimeMetrics
} from "../renderer-three/familyRuntime";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";

const defaultOrbitBuildingCount = 16;
const defaultFrameSampleCount = 24;
const interactiveOrbitFrameBudgetMs = 33.4;
const orbitAbortMessage = "Family orbit benchmark generation aborted";

export interface CreateFamilyOrbitBenchmarkSceneInput {
  fixture: AssemblyHallFixture;
  buildingCount?: number;
  frameSampleCount?: number;
  now?: () => number;
  rendererFactory?: AssemblyRendererFactory;
  signal?: AbortSignal;
}

export interface FamilyOrbitFrameSample {
  index: number;
  cameraPosition: [number, number, number];
  elapsedMs: number;
}

export interface FamilyOrbitBenchmarkReport {
  schemaVersion: "0.1.0";
  benchmarkKind: "shared-family-16-building-orbit";
  familyId: string;
  buildingCount: number;
  frameSampleCount: number;
  aggregate: {
    drawCallCount: number;
    instanceCount: number;
    triangleCount: number;
  };
  runtimeMetrics: BuildingFamilyRuntimeMetrics;
  render: {
    activeBackend: AssemblyRendererBackend;
    fallbackReason: string | null;
  };
  frameTime: {
    budgetMs: number;
    averageFrameTimeMs: number;
    p95FrameTimeMs: number;
    maxFrameTimeMs: number;
    samples: FamilyOrbitFrameSample[];
  };
  assets: {
    atlasContentHash: string;
    familyAssetsShared: boolean;
    sharedMaterialCount: number;
    textureCount: number;
  };
  targets: {
    interactiveOrbit: {
      actualP95FrameTimeMs: number;
      budgetMs: number;
      passed: boolean;
    };
    familyAssetSharing: {
      passed: boolean;
    };
  };
}

export interface FamilyOrbitBenchmarkScene {
  schemaVersion: "0.1.0";
  familyRuntime: BuildingFamilyRuntime;
  report: FamilyOrbitBenchmarkReport;
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function throwIfOrbitAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error(orbitAbortMessage);
  }
}

function elapsedMs(start: number, stop: number): number {
  return Math.max(0, stop - start);
}

function benchmarkBuildingId(baseBuildingId: string, index: number): string {
  return `${baseBuildingId}.orbit-${index.toString().padStart(2, "0")}`;
}

function sceneBounds(root: Object3D): { center: Vector3; size: Vector3; maxDimension: number } {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);
  return {
    center,
    size,
    maxDimension: Math.max(size.x, size.y, size.z, 1)
  };
}

function buildingSpacing(fixture: AssemblyHallFixture): { x: number; z: number } {
  const width = Math.max(1, fixture.ir.bounds.max[0] - fixture.ir.bounds.min[0]);
  const depth = Math.max(1, fixture.ir.bounds.max[2] - fixture.ir.bounds.min[2]);
  return {
    x: width + 5,
    z: depth + 5
  };
}

function positionBenchmarkRuntime(input: {
  familyRuntime: BuildingFamilyRuntime;
  buildingId: string;
  index: number;
  buildingCount: number;
  spacing: { x: number; z: number };
}): void {
  const runtime = input.familyRuntime.buildingRuntimes.get(input.buildingId);
  if (!runtime) {
    return;
  }

  const columns = Math.ceil(Math.sqrt(input.buildingCount));
  const rows = Math.ceil(input.buildingCount / columns);
  const column = input.index % columns;
  const row = Math.floor(input.index / columns);
  runtime.root.position.set(
    (column - (columns - 1) / 2) * input.spacing.x,
    0,
    (row - (rows - 1) / 2) * input.spacing.z
  );
  runtime.root.userData.orbitBenchmarkIndex = input.index;
}

function createOrbitScene(root: Object3D): { scene: Scene; camera: PerspectiveCamera; radius: number } {
  const scene = new Scene();
  scene.background = new Color("#edf0e8");
  scene.add(new AmbientLight("#f4f0e4", 1.8));

  const keyLight = new DirectionalLight("#fff4dd", 2.7);
  keyLight.position.set(18, 24, 18);
  scene.add(keyLight);

  const fillLight = new DirectionalLight("#d7f0ff", 1);
  fillLight.position.set(-18, 16, -12);
  scene.add(fillLight);

  scene.add(root);
  const { maxDimension } = sceneBounds(root);
  const camera = new PerspectiveCamera(42, 16 / 9, 0.1, maxDimension * 12);
  scene.add(camera);

  return {
    scene,
    camera,
    radius: maxDimension * 0.92
  };
}

function moveCameraAlongOrbit(input: {
  camera: PerspectiveCamera;
  root: Object3D;
  radius: number;
  sampleIndex: number;
  sampleCount: number;
}): [number, number, number] {
  const { center, size } = sceneBounds(input.root);
  const angle = (Math.PI * 2 * input.sampleIndex) / input.sampleCount;
  const position: [number, number, number] = [
    center.x + Math.cos(angle) * input.radius,
    center.y + Math.max(size.y * 0.56, 8),
    center.z + Math.sin(angle) * input.radius
  ];
  input.camera.position.set(position[0], position[1], position[2]);
  input.camera.lookAt(center.x, center.y + size.y * 0.08, center.z);
  input.camera.updateProjectionMatrix();
  return position;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index];
}

async function mountOrbitBuildings(input: {
  familyRuntime: BuildingFamilyRuntime;
  fixture: AssemblyHallFixture;
  buildingCount: number;
  signal: AbortSignal | undefined;
}): Promise<void> {
  const spacing = buildingSpacing(input.fixture);
  for (let index = 0; index < input.buildingCount; index += 1) {
    throwIfOrbitAborted(input.signal);
    const existingVariant = input.fixture.variantStress.variants[index];
    const buildingId = existingVariant?.buildingId ?? benchmarkBuildingId(input.fixture.ir.buildingId, index);
    const ir =
      index === 0
        ? input.fixture.ir
        : await compileBuilding({
            spec: input.fixture.spec,
            catalog: input.fixture.catalog,
            graph: input.fixture.graph,
            buildingId
          });
    throwIfOrbitAborted(input.signal);
    input.familyRuntime.createOrReplaceBuilding({
      catalog: input.fixture.catalog,
      componentGallery: input.fixture.componentGallery,
      ir,
      buildingId
    });
    positionBenchmarkRuntime({
      familyRuntime: input.familyRuntime,
      buildingId,
      index,
      buildingCount: input.buildingCount,
      spacing
    });
  }
}

function familyAssetsShared(input: {
  buildingCount: number;
  familyRuntime: BuildingFamilyRuntime;
  fixture: AssemblyHallFixture;
}): boolean {
  const mountedRuntimes = Array.from(input.familyRuntime.buildingRuntimes.values());
  return (
    input.familyRuntime.metrics.buildingCount === input.buildingCount &&
    input.familyRuntime.metrics.textureCount === input.fixture.metrics.textureCount &&
    input.familyRuntime.metrics.sharedMaterialCount > 0 &&
    mountedRuntimes.every((runtime) => runtime.materialRegistry === input.familyRuntime.materialRegistry)
  );
}

async function activateRenderer(input: {
  fixture: AssemblyHallFixture;
  rendererFactory: AssemblyRendererFactory;
}): Promise<AssemblyRendererActivation> {
  return input.rendererFactory({ backendSupport: input.fixture.backendSupport });
}

function disposeRenderer(renderer: AssemblyRenderer | null): void {
  renderer?.dispose();
}

export async function createFamilyOrbitBenchmarkScene(
  input: CreateFamilyOrbitBenchmarkSceneInput
): Promise<FamilyOrbitBenchmarkScene> {
  const buildingCount = input.buildingCount ?? defaultOrbitBuildingCount;
  const frameSampleCount = input.frameSampleCount ?? defaultFrameSampleCount;
  validatePositiveInteger(buildingCount, "Family orbit benchmark building count");
  validatePositiveInteger(frameSampleCount, "Family orbit benchmark frame sample count");
  throwIfOrbitAborted(input.signal);

  const now = input.now ?? defaultNow;
  const rendererFactory = input.rendererFactory ?? createAssemblyRenderer;
  const familyRuntime = createBuildingFamilyRuntime({
    familyId: input.fixture.spec.familyId,
    packedAtlas: input.fixture.packedAtlas,
    debugExport: input.fixture.debugExport,
    backendSupport: input.fixture.backendSupport
  });
  let renderer: AssemblyRenderer | null = null;
  let scene: Scene | null = null;

  try {
    await mountOrbitBuildings({
      familyRuntime,
      fixture: input.fixture,
      buildingCount,
      signal: input.signal
    });

    const activation = await activateRenderer({
      fixture: input.fixture,
      rendererFactory
    });
    renderer = activation.renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(960, 540, false);

    const orbitScene = createOrbitScene(familyRuntime.root);
    scene = orbitScene.scene;
    const samples: FamilyOrbitFrameSample[] = [];

    for (let index = 0; index < frameSampleCount; index += 1) {
      throwIfOrbitAborted(input.signal);
      const cameraPosition = moveCameraAlongOrbit({
        camera: orbitScene.camera,
        root: familyRuntime.root,
        radius: orbitScene.radius,
        sampleIndex: index,
        sampleCount: frameSampleCount
      });
      const frameStart = now();
      renderer.render(scene, orbitScene.camera);
      const elapsed = elapsedMs(frameStart, now());
      samples.push({
        index,
        cameraPosition,
        elapsedMs: elapsed
      });
      throwIfOrbitAborted(input.signal);
    }

    scene.remove(familyRuntime.root);
    disposeRenderer(renderer);
    renderer = null;

    const frameTimes = samples.map((sample) => sample.elapsedMs);
    const averageFrameTimeMs = average(frameTimes);
    const p95FrameTimeMs = percentile(frameTimes, 0.95);
    const maxFrameTimeMs = Math.max(...frameTimes);
    const runtimeMetrics = { ...familyRuntime.metrics };
    const assetsShared = familyAssetsShared({ buildingCount, familyRuntime, fixture: input.fixture });

    return {
      schemaVersion: "0.1.0",
      familyRuntime,
      report: {
        schemaVersion: "0.1.0",
        benchmarkKind: "shared-family-16-building-orbit",
        familyId: input.fixture.spec.familyId,
        buildingCount,
        frameSampleCount,
        aggregate: {
          drawCallCount: runtimeMetrics.drawCallCount,
          instanceCount: runtimeMetrics.instanceCount,
          triangleCount: runtimeMetrics.triangleCount
        },
        runtimeMetrics,
        render: {
          activeBackend: activation.activeBackend,
          fallbackReason: activation.fallbackReason ?? null
        },
        frameTime: {
          budgetMs: interactiveOrbitFrameBudgetMs,
          averageFrameTimeMs,
          p95FrameTimeMs,
          maxFrameTimeMs,
          samples
        },
        assets: {
          atlasContentHash: input.fixture.packedAtlas.contentHash,
          familyAssetsShared: assetsShared,
          sharedMaterialCount: runtimeMetrics.sharedMaterialCount,
          textureCount: runtimeMetrics.textureCount
        },
        targets: {
          interactiveOrbit: {
            actualP95FrameTimeMs: p95FrameTimeMs,
            budgetMs: interactiveOrbitFrameBudgetMs,
            passed: p95FrameTimeMs <= interactiveOrbitFrameBudgetMs
          },
          familyAssetSharing: {
            passed: assetsShared
          }
        }
      }
    };
  } catch (error) {
    scene?.remove(familyRuntime.root);
    disposeRenderer(renderer);
    familyRuntime.dispose();
    throw error;
  }
}
