import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  type Object3D
} from "three";
import type { ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { Diagnostic } from "../core/diagnostics";
import type { AssemblyStage } from "../contracts/shared";
import {
  createAssemblyRenderer,
  type AssemblyRenderer,
  type AssemblyRendererBackend,
  type AssemblyRendererFactory
} from "../renderer-three/assemblyRendererFactory";
import type { RendererBackendSupport } from "../renderer-three/buildingSceneAdapter";
import {
  createFamilyBenchmarkDocumentation,
  type FamilyBenchmarkDocumentation,
  type FamilyBenchmarkMetricStatus,
  type FamilyBenchmarkProfileMetric
} from "../performance/familyBenchmarkDocumentation";
import {
  createFamilyBenchmarkScene,
  type FamilyBenchmarkReport,
  type FamilyBenchmarkScene
} from "../performance/familyBenchmarkScene";
import {
  createFamilyBenchmarkProfilePacket,
  type FamilyBenchmarkProfilePacket
} from "../performance/familyBenchmarkProfilePacket";
import {
  createFamilyOrbitBenchmarkScene,
  type FamilyOrbitBenchmarkReport,
  type FamilyOrbitBenchmarkScene
} from "../performance/familyOrbitBenchmarkScene";
import { createVisualQaPacket, type VisualQaPacket } from "../qa/visualQaPacket";
import type { AssemblyHallFixture } from "./assemblyHallFixture";

export interface AssemblyHallProps {
  fixture: AssemblyHallFixture;
  rendererFactory?: AssemblyRendererFactory;
  benchmarkSceneFactory?: typeof createFamilyBenchmarkScene;
  orbitBenchmarkSceneFactory?: typeof createFamilyOrbitBenchmarkScene;
}

const selectionStageOrder: AssemblyStage[] = ["massing", "facade", "openings", "trim", "roof"];

interface SemanticSelectionOption {
  semanticPath: string;
  batchId: string;
  stage: AssemblyStage;
  objectType: string;
  materialSlotId: string;
  componentLabel: string;
  componentSource: string;
  elementIndex?: number;
}

interface StageRevealSummary {
  stage: AssemblyStage;
  visible: boolean;
  objectCount: number;
  semanticPathCount: number;
}

export type AssemblyPresentationMode = "textured" | "clay";

interface PreparedAssemblyScene {
  scene: Scene;
  camera: PerspectiveCamera;
  clayMaterial: MeshStandardMaterial;
  dispose(): void;
}

type BenchmarkStatus = "idle" | "running" | "complete" | "failed";

interface BenchmarkState {
  fixture: AssemblyHallFixture;
  status: BenchmarkStatus;
  report: FamilyBenchmarkReport | null;
  error: string | null;
}

interface OrbitBenchmarkState {
  fixture: AssemblyHallFixture;
  status: BenchmarkStatus;
  report: FamilyOrbitBenchmarkReport | null;
  error: string | null;
}

interface RendererCompatibilityReport {
  schemaVersion: "0.1.0";
  threeRevision: string;
  activeBackend: AssemblyRendererBackend | "pending";
  preferredBackend: RendererBackendSupport["preferredBackend"];
  checks: {
    webglAvailable: boolean;
    webgpuAvailable: boolean;
    fallbackAvailable: boolean;
    fallbackUsed: boolean;
  };
  diagnostics: Diagnostic[];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMilliseconds(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1
  }).format(value)} ms`;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MB`;
  }

  if (value >= 1024) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }

  return `${formatNumber(value)} B`;
}

function metricStatusLabel(status: FamilyBenchmarkMetricStatus): string {
  return status === "not-captured" ? "not captured" : status;
}

function formatProfileMetricValue(metric: FamilyBenchmarkProfileMetric): string {
  if (metric.value === null) {
    return "not captured";
  }

  if (metric.unit === "bytes") {
    return formatBytes(metric.value);
  }

  if (metric.unit === "ms") {
    return formatMilliseconds(metric.value);
  }

  return formatNumber(metric.value);
}

function safeFileSegment(value: string): string {
  const fileSegment = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return fileSegment || "building-family";
}

function downloadJsonFile(fileName: string, payload: unknown): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBenchmarkProfilePacket(packet: FamilyBenchmarkProfilePacket): void {
  downloadJsonFile(`${safeFileSegment(packet.familyId)}-benchmark-profile-packet.json`, packet);
}

function downloadVisualQaPacket(packet: VisualQaPacket): void {
  downloadJsonFile(`${safeFileSegment(packet.hashes.buildingId)}-visual-qa-packet.json`, packet);
}

function createRendererCompatibilityReport(input: {
  activeBackend: AssemblyRendererBackend | "pending";
  backendSupport: RendererBackendSupport;
  fallbackReason: string | null;
  renderError: string | null;
}): RendererCompatibilityReport {
  const diagnostics: Diagnostic[] = [];
  const webglAvailable = input.backendSupport.webgl.available;
  const webgpuAvailable = input.backendSupport.webgpu.available;

  if (!webglAvailable && !webgpuAvailable) {
    diagnostics.push({
      code: "renderer.noBackendAvailable",
      message: "No Assembly Hall renderer backend is available.",
      severity: "error"
    });
  } else {
    if (!webgpuAvailable) {
      diagnostics.push({
        code: "renderer.webgpuUnavailable",
        message: webglAvailable
          ? "WebGPU unavailable; WebGL fallback available."
          : "WebGPU unavailable and no WebGL fallback is available.",
        severity: webglAvailable ? "warning" : "error"
      });
    }

    if (!webglAvailable) {
      diagnostics.push({
        code: "renderer.webglUnavailable",
        message: "WebGL fallback unavailable.",
        severity: webgpuAvailable ? "warning" : "error"
      });
    }
  }

  if (input.fallbackReason) {
    diagnostics.push({
      code: "renderer.webgpuFallback",
      message: input.fallbackReason,
      severity: "warning"
    });
  }

  if (input.renderError) {
    diagnostics.push({
      code: "renderer.activationFailed",
      message: input.renderError,
      severity: "error"
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      code: "renderer.compatibilityReady",
      message: "Preferred renderer compatibility checks passed.",
      severity: "info"
    });
  }

  return {
    schemaVersion: "0.1.0",
    threeRevision: input.backendSupport.threeRevision,
    activeBackend: input.activeBackend,
    preferredBackend: input.backendSupport.preferredBackend,
    checks: {
      webglAvailable,
      webgpuAvailable,
      fallbackAvailable: webglAvailable,
      fallbackUsed: input.activeBackend === "webgl" && input.fallbackReason !== null
    },
    diagnostics
  };
}

function stageLabel(stage: AssemblyStage): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function stageIndex(stage: AssemblyStage): number {
  return selectionStageOrder.indexOf(stage);
}

function isStageVisible(stage: AssemblyStage, revealThroughStage: AssemblyStage): boolean {
  return stageIndex(stage) <= stageIndex(revealThroughStage);
}

function objectTypeFor(option: { isInstancedMesh?: boolean; type: string }): string {
  return option.isInstancedMesh ? "InstancedMesh" : option.type;
}

function semanticSelectionOptions(fixture: AssemblyHallFixture): SemanticSelectionOption[] {
  const galleryByBatchId = new Map(
    fixture.componentGallery.entries
      .filter((entry): entry is ComponentGalleryEntry & { batchId: string } => entry.batchId !== undefined)
      .map((entry) => [entry.batchId, entry])
  );

  return Array.from(fixture.buildingRuntime.semanticLookup.values())
    .map((lookup) => {
      const userData = lookup.object.userData as {
        materialSlotId?: string;
      };
      const galleryEntry = galleryByBatchId.get(lookup.batchId);
      return {
        semanticPath: lookup.semanticPath,
        batchId: lookup.batchId,
        stage: lookup.stage,
        objectType: objectTypeFor(lookup.object),
        materialSlotId: userData.materialSlotId ?? "unassigned",
        componentLabel: galleryEntry?.label ?? lookup.batchId,
        componentSource: galleryEntry?.source ?? "runtime",
        elementIndex: lookup.elementIndex
      };
    })
    .sort((first, second) => {
      const stageDelta = selectionStageOrder.indexOf(first.stage) - selectionStageOrder.indexOf(second.stage);
      return stageDelta || first.semanticPath.localeCompare(second.semanticPath);
    });
}

function selectionOptionLabel(option: SemanticSelectionOption): string {
  const elementSuffix = option.elementIndex === undefined ? "batch" : `#${option.elementIndex}`;
  return `${option.stage} / ${option.componentLabel} / ${elementSuffix}`;
}

function sceneBounds(root: Object3D): { center: Vector3; size: Vector3; maxDimension: number } {
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

function applyPresentationMode(
  fixture: AssemblyHallFixture,
  clayMaterial: MeshStandardMaterial,
  presentationMode: AssemblyPresentationMode
): void {
  for (const renderable of fixture.buildingRuntime.renderables) {
    renderable.material =
      presentationMode === "clay"
        ? clayMaterial
        : fixture.buildingRuntime.materialRegistry.getMaterial(renderable.userData.materialSlotId);
  }
}

function createSolidPresentationTexture(
  name: string,
  rgba: [number, number, number, number],
  colorSpace: typeof SRGBColorSpace | typeof NoColorSpace
): DataTexture {
  const texture = new DataTexture(new Uint8Array(rgba), 1, 1, RGBAFormat, UnsignedByteType);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function prepareScene(root: Object3D): PreparedAssemblyScene {
  const scene = new Scene();
  scene.background = new Color("#dfe5df");
  scene.add(new AmbientLight("#f4f0e4", 0.38));
  scene.add(new HemisphereLight("#f5f7f2", "#5f695f", 1.45));

  const keyLight = new DirectionalLight("#fff3d6", 4.2);
  keyLight.position.set(12, 18, 14);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -32;
  keyLight.shadow.camera.right = 32;
  keyLight.shadow.camera.top = 32;
  keyLight.shadow.camera.bottom = -32;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 90;
  keyLight.shadow.bias = -0.00015;
  scene.add(keyLight);

  const fillLight = new DirectionalLight("#cde4f0", 0.72);
  fillLight.position.set(-14, 10, -8);
  scene.add(fillLight);

  const { center, size, maxDimension } = sceneBounds(root);
  root.traverse((object) => {
    const renderable = object as Mesh;
    if (!renderable.isMesh) {
      return;
    }
    renderable.castShadow = true;
    renderable.receiveShadow = true;
  });

  const groundGeometry = new PlaneGeometry(maxDimension * 4.5, maxDimension * 4.5);
  const groundMaterial = new MeshStandardMaterial({ color: "#aeb7ab", roughness: 0.96, metalness: 0 });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.name = "assembly-hall.ground";
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.025, center.z);
  ground.receiveShadow = true;
  ground.userData.rendererBoundary = "building-family-presentation";
  scene.add(ground);

  const clayTextures = {
    baseColor: createSolidPresentationTexture(
      "assembly-hall.clay.base-color",
      [189, 185, 173, 255],
      SRGBColorSpace
    ),
    normal: createSolidPresentationTexture(
      "assembly-hall.clay.normal",
      [128, 128, 255, 255],
      NoColorSpace
    ),
    orm: createSolidPresentationTexture("assembly-hall.clay.orm", [255, 200, 0, 255], NoColorSpace),
    opacity: createSolidPresentationTexture(
      "assembly-hall.clay.opacity",
      [255, 255, 255, 255],
      NoColorSpace
    )
  };
  const clayMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0,
    map: clayTextures.baseColor,
    normalMap: clayTextures.normal,
    roughnessMap: clayTextures.orm,
    metalnessMap: clayTextures.orm,
    alphaMap: clayTextures.opacity
  });
  clayMaterial.name = "assembly-hall.clay-inspection";
  let disposed = false;
  const camera = new PerspectiveCamera(42, 16 / 9, 0.1, maxDimension * 10);
  camera.position.set(center.x + maxDimension * 0.85, center.y + size.y * 0.45, center.z - maxDimension * 1.35);
  camera.lookAt(center.x, center.y + size.y * 0.1, center.z);
  scene.add(root);
  return {
    scene,
    camera,
    clayMaterial,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      groundGeometry.dispose();
      groundMaterial.dispose();
      clayMaterial.dispose();
      for (const texture of Object.values(clayTextures)) {
        texture.dispose();
      }
    }
  };
}

function galleryRows(fixture: AssemblyHallFixture) {
  return fixture.componentGallery.entries.slice(0, 6);
}

function stressRows(fixture: AssemblyHallFixture) {
  return fixture.variantStress.variants;
}

function applyStageReveal(fixture: AssemblyHallFixture, revealThroughStage: AssemblyStage): void {
  for (const stageGroup of fixture.buildingRuntime.stageGroups) {
    stageGroup.group.visible = isStageVisible(stageGroup.stage, revealThroughStage);
    stageGroup.group.userData.revealState = stageGroup.group.visible ? "visible" : "hidden";
  }
  fixture.buildingRuntime.root.userData.revealThroughStage = revealThroughStage;
}

function stageRevealSummaries(fixture: AssemblyHallFixture, revealThroughStage: AssemblyStage): StageRevealSummary[] {
  return selectionStageOrder.map((stage) => {
    const stageGroup = fixture.buildingRuntime.stageGroups.find((entry) => entry.stage === stage);
    return {
      stage,
      visible: isStageVisible(stage, revealThroughStage),
      objectCount: stageGroup?.group.children.length ?? 0,
      semanticPathCount: fixture.ir.semanticIndex.filter((entry) => entry.stage === stage).length
    };
  });
}

export function AssemblyHall({
  fixture,
  rendererFactory = createAssemblyRenderer,
  benchmarkSceneFactory = createFamilyBenchmarkScene,
  orbitBenchmarkSceneFactory = createFamilyOrbitBenchmarkScene
}: AssemblyHallProps) {
  const selectionId = useId();
  const revealId = useId();
  const presentationId = useId();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const clayMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const benchmarkRunIdRef = useRef(0);
  const benchmarkAbortRef = useRef<AbortController | null>(null);
  const orbitBenchmarkRunIdRef = useRef(0);
  const orbitBenchmarkAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const latestFixtureRef = useRef(fixture);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [activeBackend, setActiveBackend] = useState<AssemblyRendererBackend | "pending">(
    fixture.metrics.activeBackend
  );
  const [backendFallbackReason, setBackendFallbackReason] = useState<string | null>(null);
  const [revealThroughStage, setRevealThroughStage] = useState<AssemblyStage>("roof");
  const [presentationMode, setPresentationMode] = useState<AssemblyPresentationMode>("textured");
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>(() => ({
    fixture,
    status: "idle",
    report: null,
    error: null
  }));
  const [orbitBenchmarkState, setOrbitBenchmarkState] = useState<OrbitBenchmarkState>(() => ({
    fixture,
    status: "idle",
    report: null,
    error: null
  }));
  const revealThroughStageRef = useRef<AssemblyStage>(revealThroughStage);
  const presentationModeRef = useRef<AssemblyPresentationMode>(presentationMode);
  const rows = useMemo(() => galleryRows(fixture), [fixture]);
  const variants = useMemo(() => stressRows(fixture), [fixture]);
  const selectionOptions = useMemo(() => semanticSelectionOptions(fixture), [fixture]);
  const revealSummaries = useMemo(
    () => stageRevealSummaries(fixture, revealThroughStage),
    [fixture, revealThroughStage]
  );
  const [selectedSemanticPath, setSelectedSemanticPath] = useState("");
  const selectedOption =
    selectionOptions.find((option) => option.semanticPath === selectedSemanticPath) ?? selectionOptions[0];
  const activeBenchmarkState = benchmarkState.fixture === fixture ? benchmarkState : null;
  const benchmarkStatus = activeBenchmarkState?.status ?? "idle";
  const benchmarkReport = activeBenchmarkState?.report ?? null;
  const benchmarkError = activeBenchmarkState?.error ?? null;
  const activeOrbitBenchmarkState = orbitBenchmarkState.fixture === fixture ? orbitBenchmarkState : null;
  const orbitBenchmarkStatus = activeOrbitBenchmarkState?.status ?? "idle";
  const orbitBenchmarkReport = activeOrbitBenchmarkState?.report ?? null;
  const orbitBenchmarkError = activeOrbitBenchmarkState?.error ?? null;
  const benchmarkDocumentation: FamilyBenchmarkDocumentation | null = useMemo(
    () => (benchmarkReport ? createFamilyBenchmarkDocumentation({ report: benchmarkReport }) : null),
    [benchmarkReport]
  );
  const benchmarkProfilePacket: FamilyBenchmarkProfilePacket | null = useMemo(
    () =>
      benchmarkReport && orbitBenchmarkReport
        ? createFamilyBenchmarkProfilePacket({
            fixture,
            constructionReport: benchmarkReport,
            orbitReport: orbitBenchmarkReport
          })
        : null,
    [benchmarkReport, fixture, orbitBenchmarkReport]
  );
  const [visualQaStatus, setVisualQaStatus] = useState<"idle" | "building" | "ready" | "failed">("idle");
  const [visualQaError, setVisualQaError] = useState<string | null>(null);
  const [visualQaPacket, setVisualQaPacket] = useState<VisualQaPacket | null>(null);

  const exportVisualQaPacket = async () => {
    setVisualQaStatus("building");
    setVisualQaError(null);
    try {
      const packet = await createVisualQaPacket({
        fixture,
        seeds: fixture.spec.seeds,
        detailLevel: "high",
        screenshotTargetRoute: "#room=assemblyHall",
        benchmarkProfileId: benchmarkProfilePacket
          ? `${benchmarkProfilePacket.profileKind}:${benchmarkProfilePacket.familyId}`
          : undefined
      });
      setVisualQaPacket(packet);
      downloadVisualQaPacket(packet);
      setVisualQaStatus("ready");
    } catch (error) {
      setVisualQaStatus("failed");
      setVisualQaError(error instanceof Error ? error.message : "Failed to create visual QA packet");
    }
  };
  const compatibilityReport = useMemo(
    () =>
      createRendererCompatibilityReport({
        activeBackend,
        backendSupport: fixture.backendSupport,
        fallbackReason: backendFallbackReason,
        renderError
      }),
    [activeBackend, backendFallbackReason, fixture.backendSupport, renderError]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      benchmarkRunIdRef.current += 1;
      benchmarkAbortRef.current?.abort();
      benchmarkAbortRef.current = null;
      orbitBenchmarkRunIdRef.current += 1;
      orbitBenchmarkAbortRef.current?.abort();
      orbitBenchmarkAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestFixtureRef.current = fixture;
    benchmarkRunIdRef.current += 1;
    benchmarkAbortRef.current?.abort();
    benchmarkAbortRef.current = null;
    orbitBenchmarkRunIdRef.current += 1;
    orbitBenchmarkAbortRef.current?.abort();
    orbitBenchmarkAbortRef.current = null;
  }, [fixture]);

  useEffect(() => {
    revealThroughStageRef.current = revealThroughStage;
    applyStageReveal(fixture, revealThroughStage);
    renderFrameRef.current?.();
  }, [fixture, revealThroughStage]);

  useEffect(() => {
    presentationModeRef.current = presentationMode;
    if (sceneRef.current && clayMaterialRef.current) {
      applyPresentationMode(fixture, clayMaterialRef.current, presentationMode);
    }
    renderFrameRef.current?.();
  }, [fixture, presentationMode]);

  const runBenchmark = async () => {
    const runId = benchmarkRunIdRef.current + 1;
    const benchmarkFixture = fixture;
    benchmarkRunIdRef.current = runId;
    benchmarkAbortRef.current?.abort();
    const benchmarkAbortController = new AbortController();
    benchmarkAbortRef.current = benchmarkAbortController;
    setBenchmarkState({
      fixture: benchmarkFixture,
      status: "running",
      report: null,
      error: null
    });

    let benchmark: FamilyBenchmarkScene | undefined;
    try {
      benchmark = await benchmarkSceneFactory({
        fixture: benchmarkFixture,
        signal: benchmarkAbortController.signal
      });
      if (
        mountedRef.current &&
        benchmarkRunIdRef.current === runId &&
        latestFixtureRef.current === benchmarkFixture
      ) {
        setBenchmarkState({
          fixture: benchmarkFixture,
          status: "complete",
          report: benchmark.report,
          error: null
        });
      }
    } catch (error: unknown) {
      if (
        benchmarkAbortController.signal.aborted &&
        (!mountedRef.current || benchmarkRunIdRef.current !== runId || latestFixtureRef.current !== benchmarkFixture)
      ) {
        return;
      }

      if (
        mountedRef.current &&
        benchmarkRunIdRef.current === runId &&
        latestFixtureRef.current === benchmarkFixture
      ) {
        const message = error instanceof Error ? error.message : "Unable to run the family benchmark.";
        setBenchmarkState({
          fixture: benchmarkFixture,
          status: "failed",
          report: null,
          error: message
        });
      }
    } finally {
      if (benchmarkAbortRef.current === benchmarkAbortController) {
        benchmarkAbortRef.current = null;
      }
      benchmark?.familyRuntime.dispose();
    }
  };

  const runOrbitBenchmark = async () => {
    const runId = orbitBenchmarkRunIdRef.current + 1;
    const benchmarkFixture = fixture;
    orbitBenchmarkRunIdRef.current = runId;
    orbitBenchmarkAbortRef.current?.abort();
    const orbitBenchmarkAbortController = new AbortController();
    orbitBenchmarkAbortRef.current = orbitBenchmarkAbortController;
    setOrbitBenchmarkState({
      fixture: benchmarkFixture,
      status: "running",
      report: null,
      error: null
    });

    let orbitBenchmark: FamilyOrbitBenchmarkScene | undefined;
    try {
      orbitBenchmark = await orbitBenchmarkSceneFactory({
        fixture: benchmarkFixture,
        rendererFactory,
        signal: orbitBenchmarkAbortController.signal
      });
      if (
        mountedRef.current &&
        orbitBenchmarkRunIdRef.current === runId &&
        latestFixtureRef.current === benchmarkFixture
      ) {
        setOrbitBenchmarkState({
          fixture: benchmarkFixture,
          status: "complete",
          report: orbitBenchmark.report,
          error: null
        });
      }
    } catch (error: unknown) {
      if (
        orbitBenchmarkAbortController.signal.aborted &&
        (!mountedRef.current ||
          orbitBenchmarkRunIdRef.current !== runId ||
          latestFixtureRef.current !== benchmarkFixture)
      ) {
        return;
      }

      if (
        mountedRef.current &&
        orbitBenchmarkRunIdRef.current === runId &&
        latestFixtureRef.current === benchmarkFixture
      ) {
        const message = error instanceof Error ? error.message : "Unable to run the orbit benchmark.";
        setOrbitBenchmarkState({
          fixture: benchmarkFixture,
          status: "failed",
          report: null,
          error: message
        });
      }
    } finally {
      if (orbitBenchmarkAbortRef.current === orbitBenchmarkAbortController) {
        orbitBenchmarkAbortRef.current = null;
      }
      orbitBenchmark?.familyRuntime.dispose();
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    let renderer: AssemblyRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;
    let scene: Scene | null = null;
    let camera: PerspectiveCamera | null = null;
    let preparedScene: PreparedAssemblyScene | null = null;
    let cancelled = false;

    const renderFrame = () => {
      if (!renderer || !scene || !camera) {
        return;
      }
      const width = Math.max(360, Math.round(mount.clientWidth || 920));
      const height = Math.max(320, Math.round(mount.clientHeight || 520));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      renderer.domElement.dataset.rendered = "true";
      renderer.domElement.dataset.revealThroughStage = revealThroughStageRef.current;
      renderer.domElement.dataset.presentationMode = presentationModeRef.current;
    };
    renderFrameRef.current = renderFrame;

    const activateRenderer = async () => {
      try {
        const prepared = prepareScene(fixture.familyRuntime.root);
        preparedScene = prepared;
        scene = prepared.scene;
        camera = prepared.camera;
        sceneRef.current = prepared.scene;
        clayMaterialRef.current = prepared.clayMaterial;
        applyPresentationMode(fixture, prepared.clayMaterial, presentationModeRef.current);
        const activation = await rendererFactory({ backendSupport: fixture.backendSupport });
        if (cancelled) {
          prepared.scene.remove(fixture.familyRuntime.root);
          prepared.dispose();
          activation.renderer.dispose();
          return;
        }

        renderer = activation.renderer;
        setActiveBackend(activation.activeBackend);
        setBackendFallbackReason(activation.fallbackReason ?? null);
        renderer.domElement.dataset.rendererBackend = activation.activeBackend;
        if (activation.fallbackReason) {
          renderer.domElement.dataset.rendererFallback = activation.fallbackReason;
        }
        renderer.domElement.setAttribute("aria-label", "Assembly Hall Three.js canvas");
        renderer.domElement.className = "assembly-hall__canvas";
        mount.appendChild(renderer.domElement);
        renderFrame();
        if ("ResizeObserver" in window) {
          resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(animationFrame);
            animationFrame = requestAnimationFrame(renderFrame);
          });
          resizeObserver.observe(mount);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unable to initialize Assembly Hall renderer";
        if (!cancelled) {
          setRenderError(message);
        }
      }
    };

    void activateRenderer();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (clayMaterialRef.current) {
        applyPresentationMode(fixture, clayMaterialRef.current, "textured");
      }
      scene?.remove(fixture.familyRuntime.root);
      preparedScene?.dispose();
      renderer?.domElement.remove();
      renderer?.dispose();
      if (sceneRef.current === scene) {
        sceneRef.current = null;
        clayMaterialRef.current = null;
      }
      if (renderFrameRef.current === renderFrame) {
        renderFrameRef.current = null;
      }
    };
  }, [fixture, rendererFactory]);

  return (
    <section className="assembly-hall" aria-labelledby="assembly-hall-heading">
      <div className="assembly-hall__intro">
        <p className="project-label">Assembly Hall</p>
        <h2 id="assembly-hall-heading">Assembly Hall</h2>
        <p>{fixture.prompt}</p>
      </div>

      <div className="assembly-hall__stage">
        <div
          className="assembly-hall__viewport"
          ref={mountRef}
          role="img"
          aria-label="Rendered generated building fixture"
        >
          {renderError ? (
            <p className="assembly-hall__render-error" role="status">
              Renderer fallback: {renderError}
            </p>
          ) : backendFallbackReason ? (
            <p className="assembly-hall__render-error" role="status">
              Renderer fallback: {backendFallbackReason}
            </p>
          ) : null}
        </div>

        <div className="assembly-hall__data-grid">
          <section className="assembly-hall__reveal" aria-labelledby="assembly-stage-reveal-heading">
            <div className="assembly-hall__reveal-header">
              <h3 id="assembly-stage-reveal-heading">Stage Reveal</h3>
              <label htmlFor={presentationId}>Presentation mode</label>
              <select
                id={presentationId}
                aria-label="Presentation mode"
                value={presentationMode}
                onChange={(event) => setPresentationMode(event.currentTarget.value as AssemblyPresentationMode)}
              >
                <option value="textured">Textured</option>
                <option value="clay">Clay inspection</option>
              </select>
              <label htmlFor={revealId}>Reveal through stage</label>
              <select
                id={revealId}
                aria-label="Reveal through stage"
                value={revealThroughStage}
                onChange={(event) => setRevealThroughStage(event.currentTarget.value as AssemblyStage)}
              >
                {selectionStageOrder.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabel(stage)}
                  </option>
                ))}
              </select>
            </div>

            <ol className="assembly-hall__stage-visibility" aria-label="Assembly stage visibility">
              {revealSummaries.map((summary) => (
                <li data-visible={summary.visible ? "true" : "false"} key={summary.stage}>
                  <span>{summary.stage}</span>
                  <small>{summary.visible ? "visible" : "hidden"}</small>
                  <em>
                    {formatNumber(summary.objectCount)} objects / {formatNumber(summary.semanticPathCount)} paths
                  </em>
                </li>
              ))}
            </ol>
          </section>

          <dl className="assembly-hall__metrics" aria-label="Assembly Hall renderer metrics">
            <div>
              <dt>Backend</dt>
              <dd>
                {activeBackend} active / {fixture.metrics.preferredBackend} preferred
              </dd>
            </div>
            <div>
              <dt>Draw calls</dt>
              <dd>{formatNumber(fixture.metrics.drawCallCount)}</dd>
            </div>
            <div>
              <dt>Instances</dt>
              <dd>{formatNumber(fixture.metrics.instanceCount)}</dd>
            </div>
            <div>
              <dt>Triangles</dt>
              <dd>{formatNumber(fixture.metrics.triangleCount)}</dd>
            </div>
          </dl>

          <dl className="assembly-hall__identity" aria-label="Assembly Hall atlas identity">
            <div>
              <dt>Atlas content</dt>
              <dd>{fixture.metrics.atlasContentHash}</dd>
            </div>
            <div>
              <dt>Textures</dt>
              <dd>{fixture.metrics.textureCount}</dd>
            </div>
            <div>
              <dt>Components</dt>
              <dd>{fixture.metrics.componentCount}</dd>
            </div>
          </dl>

          <section className="assembly-hall__visual-qa" aria-labelledby="assembly-visual-qa-heading">
            <div className="assembly-hall__visual-qa-header">
              <h3 id="assembly-visual-qa-heading">Visual QA Packet</h3>
              <button type="button" onClick={() => void exportVisualQaPacket()}>
                Download Visual QA Packet
              </button>
            </div>
            <dl className="assembly-hall__metrics" aria-label="Visual QA packet summary">
              <div>
                <dt>Status</dt>
                <dd>{visualQaStatus}</dd>
              </div>
              <div>
                <dt>Fidelity</dt>
                <dd>{fixture.fidelityMode}</dd>
              </div>
              <div>
                <dt>Pass / fail</dt>
                <dd>
                  {visualQaPacket
                    ? `${visualQaPacket.qualityReport.summary.passCount} / ${visualQaPacket.qualityReport.summary.failCount}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Estimated</dt>
                <dd>{visualQaPacket?.qualityReport.summary.estimatedCount ?? "—"}</dd>
              </div>
            </dl>
            {visualQaError ? (
              <p className="assembly-hall__benchmark-message" role="alert">
                {visualQaError}
              </p>
            ) : null}
            {visualQaPacket ? (
              <p className="assembly-hall__benchmark-message" aria-label="Visual QA packet fingerprint">
                fingerprint {visualQaPacket.hashes.contentFingerprint.slice(0, 16)}…
              </p>
            ) : (
              <p className="assembly-hall__benchmark-message">
                Export a schema-versioned checklist packet for this fixture (measured IR/atlas signals + estimated
                presentation coverage).
              </p>
            )}
          </section>

          <section className="assembly-hall__compatibility" aria-labelledby="assembly-compatibility-heading">
            <div className="assembly-hall__compatibility-header">
              <h3 id="assembly-compatibility-heading">Compatibility Diagnostics</h3>
              <dl aria-label="Renderer compatibility summary">
                <div>
                  <dt>Report</dt>
                  <dd>{compatibilityReport.schemaVersion}</dd>
                </div>
                <div>
                  <dt>Three.js</dt>
                  <dd>{compatibilityReport.threeRevision}</dd>
                </div>
                <div>
                  <dt>WebGL</dt>
                  <dd>{compatibilityReport.checks.webglAvailable ? "available" : "unavailable"}</dd>
                </div>
                <div>
                  <dt>WebGPU</dt>
                  <dd>{compatibilityReport.checks.webgpuAvailable ? "available" : "unavailable"}</dd>
                </div>
              </dl>
            </div>

            <table className="assembly-hall__compatibility-table" aria-label="Assembly Hall compatibility diagnostics">
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Code</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {compatibilityReport.diagnostics.map((diagnostic) => (
                  <tr key={diagnostic.code} data-severity={diagnostic.severity}>
                    <td>{diagnostic.severity}</td>
                    <td>{diagnostic.code}</td>
                    <td>{diagnostic.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="assembly-hall__selection" aria-labelledby="assembly-hall-selection-heading">
            <h3 id="assembly-hall-selection-heading">Semantic Selection</h3>
            <label htmlFor={selectionId}>Semantic element</label>
            <select
              id={selectionId}
              value={selectedOption?.semanticPath ?? ""}
              onChange={(event) => setSelectedSemanticPath(event.target.value)}
            >
              {selectionOptions.map((option) => (
                <option key={option.semanticPath} value={option.semanticPath}>
                  {selectionOptionLabel(option)}
                </option>
              ))}
            </select>

            {selectedOption ? (
              <dl className="assembly-hall__selection-details" aria-label="Selected semantic element">
                <div>
                  <dt>Semantic path</dt>
                  <dd>{selectedOption.semanticPath}</dd>
                </div>
                <div>
                  <dt>Stage</dt>
                  <dd>{selectedOption.stage}</dd>
                </div>
                <div>
                  <dt>Batch</dt>
                  <dd>{selectedOption.batchId}</dd>
                </div>
                <div>
                  <dt>Material</dt>
                  <dd>{selectedOption.materialSlotId}</dd>
                </div>
                <div>
                  <dt>Object</dt>
                  <dd>{selectedOption.objectType}</dd>
                </div>
                <div>
                  <dt>Component</dt>
                  <dd>
                    {selectedOption.componentLabel} / {selectedOption.componentSource}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>
        </div>

        <table className="assembly-hall__gallery" aria-label="Component gallery summary">
          <caption>Component Gallery</caption>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Source</th>
              <th scope="col">Stage</th>
              <th scope="col">Elements</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.label}</td>
                <td>{entry.source}</td>
                <td>{entry.stage}</td>
                <td>{formatNumber(entry.metrics.elementCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="assembly-hall__stress" aria-label="16-variant family stress view">
          <div className="assembly-hall__stress-header">
            <div>
              <p className="project-label">Shared Family</p>
              <h3>16-Variant Stress</h3>
            </div>
            <dl className="assembly-hall__stress-metrics" aria-label="16-variant stress metrics">
              <div>
                <dt>Variants</dt>
                <dd>{formatNumber(fixture.variantStress.variantCount)} variants</dd>
              </div>
              <div>
                <dt>Draw calls</dt>
                <dd>{formatNumber(fixture.variantStress.aggregate.drawCallCount)}</dd>
              </div>
              <div>
                <dt>Instances</dt>
                <dd>{formatNumber(fixture.variantStress.aggregate.instanceCount)}</dd>
              </div>
              <div>
                <dt>Triangles</dt>
                <dd>{formatNumber(fixture.variantStress.aggregate.triangleCount)}</dd>
              </div>
            </dl>
          </div>

          <dl className="assembly-hall__stress-lineage" aria-label="16-variant shared lineage">
            <div>
              <dt>Atlas content</dt>
              <dd>{fixture.variantStress.sharedAtlasContentHash}</dd>
            </div>
            <div>
              <dt>Catalog</dt>
              <dd>{fixture.variantStress.sharedCatalogId}</dd>
            </div>
            <div>
              <dt>Graph</dt>
              <dd>{fixture.variantStress.sharedSourceGraphHash}</dd>
            </div>
          </dl>

          <div className="assembly-hall__stress-table-scroll">
            <table className="assembly-hall__stress-table" aria-label="16-variant family stress variants">
              <thead>
                <tr>
                  <th scope="col">Variant</th>
                  <th scope="col">Building seed</th>
                  <th scope="col">Building id</th>
                  <th scope="col">Draw</th>
                  <th scope="col">Instances</th>
                  <th scope="col">Triangles</th>
                  <th scope="col">Paths</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr key={variant.buildingId}>
                    <td>{variant.index + 1}</td>
                    <td>{variant.buildingSeed}</td>
                    <td>{variant.buildingId}</td>
                    <td>{formatNumber(variant.drawCallCount)}</td>
                    <td>{formatNumber(variant.instanceCount)}</td>
                    <td>{formatNumber(variant.triangleCount)}</td>
                    <td>{formatNumber(variant.semanticPathCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="assembly-hall__benchmark" aria-label="16-building orbit benchmark report">
          <div className="assembly-hall__benchmark-header">
            <div>
              <p className="project-label">Interactive Proof</p>
              <h3>16-Building Orbit Benchmark</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                void runOrbitBenchmark();
              }}
              disabled={orbitBenchmarkStatus === "running"}
            >
              {orbitBenchmarkStatus === "running"
                ? "Running orbit benchmark"
                : "Run 16-building orbit benchmark"}
            </button>
          </div>

          {orbitBenchmarkError ? (
            <p className="assembly-hall__benchmark-message" role="alert">
              {orbitBenchmarkError}
            </p>
          ) : orbitBenchmarkReport ? (
            <>
              <dl className="assembly-hall__benchmark-metrics" aria-label="16-building orbit benchmark metrics">
                <div>
                  <dt>Report</dt>
                  <dd>{orbitBenchmarkReport.benchmarkKind}</dd>
                </div>
                <div>
                  <dt>Buildings</dt>
                  <dd>{formatNumber(orbitBenchmarkReport.buildingCount)} buildings</dd>
                </div>
                <div>
                  <dt>Backend</dt>
                  <dd>{orbitBenchmarkReport.render.activeBackend}</dd>
                </div>
                <div>
                  <dt>Frame p95</dt>
                  <dd>{formatMilliseconds(orbitBenchmarkReport.frameTime.p95FrameTimeMs)}</dd>
                </div>
                <div>
                  <dt>Frame average</dt>
                  <dd>{formatMilliseconds(orbitBenchmarkReport.frameTime.averageFrameTimeMs)}</dd>
                </div>
                <div>
                  <dt>Triangles</dt>
                  <dd>{formatNumber(orbitBenchmarkReport.aggregate.triangleCount)}</dd>
                </div>
              </dl>

              <dl className="assembly-hall__benchmark-lineage" aria-label="16-building orbit benchmark lineage">
                <div>
                  <dt>Atlas content</dt>
                  <dd>{orbitBenchmarkReport.assets.atlasContentHash}</dd>
                </div>
                <div>
                  <dt>Frame max</dt>
                  <dd>{formatMilliseconds(orbitBenchmarkReport.frameTime.maxFrameTimeMs)}</dd>
                </div>
                <div>
                  <dt>Samples</dt>
                  <dd>{formatNumber(orbitBenchmarkReport.frameSampleCount)}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{formatMilliseconds(orbitBenchmarkReport.frameTime.budgetMs)}</dd>
                </div>
              </dl>

              <ol className="assembly-hall__benchmark-targets" aria-label="16-building orbit benchmark target checks">
                <li data-passed={orbitBenchmarkReport.targets.interactiveOrbit.passed ? "true" : "false"}>
                  <span>
                    Interactive orbit{" "}
                    {orbitBenchmarkReport.targets.interactiveOrbit.passed ? "passed" : "needs profile"}
                  </span>
                  <small>
                    {formatMilliseconds(orbitBenchmarkReport.targets.interactiveOrbit.actualP95FrameTimeMs)} /{" "}
                    {formatMilliseconds(orbitBenchmarkReport.targets.interactiveOrbit.budgetMs)} p95
                  </small>
                </li>
                <li data-passed={orbitBenchmarkReport.targets.familyAssetSharing.passed ? "true" : "false"}>
                  <span>
                    Family assets {orbitBenchmarkReport.targets.familyAssetSharing.passed ? "shared" : "not shared"}
                  </span>
                  <small>
                    {formatNumber(orbitBenchmarkReport.assets.sharedMaterialCount)} shared materials /{" "}
                    {formatNumber(orbitBenchmarkReport.assets.textureCount)} textures
                  </small>
                </li>
              </ol>
            </>
          ) : (
            <p className="assembly-hall__benchmark-message">Not run</p>
          )}
        </section>

        <section className="assembly-hall__benchmark" aria-label="100-building benchmark report">
          <div className="assembly-hall__benchmark-header">
            <div>
              <p className="project-label">Performance</p>
              <h3>100-Building Benchmark</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                void runBenchmark();
              }}
              disabled={benchmarkStatus === "running"}
            >
              {benchmarkStatus === "running" ? "Running benchmark" : "Run 100-building benchmark"}
            </button>
          </div>

          {benchmarkError ? (
            <p className="assembly-hall__benchmark-message" role="alert">
              {benchmarkError}
            </p>
          ) : benchmarkReport ? (
            <>
              <dl className="assembly-hall__benchmark-metrics" aria-label="100-building benchmark metrics">
                <div>
                  <dt>Report</dt>
                  <dd>{benchmarkReport.benchmarkKind}</dd>
                </div>
                <div>
                  <dt>Buildings</dt>
                  <dd>{formatNumber(benchmarkReport.buildingCount)} buildings</dd>
                </div>
                <div>
                  <dt>Draw calls</dt>
                  <dd>{formatNumber(benchmarkReport.aggregate.drawCallCount)}</dd>
                </div>
                <div>
                  <dt>Instances</dt>
                  <dd>{formatNumber(benchmarkReport.aggregate.instanceCount)}</dd>
                </div>
                <div>
                  <dt>Triangles</dt>
                  <dd>{formatNumber(benchmarkReport.aggregate.triangleCount)}</dd>
                </div>
                <div>
                  <dt>Runtime IR</dt>
                  <dd>{formatBytes(benchmarkReport.transfer.runtimeIrBytes)}</dd>
                </div>
              </dl>

              <dl className="assembly-hall__benchmark-lineage" aria-label="100-building benchmark lineage">
                <div>
                  <dt>Atlas content</dt>
                  <dd>{benchmarkReport.assets.atlasContentHash}</dd>
                </div>
                <div>
                  <dt>Per building triangles</dt>
                  <dd>{formatNumber(benchmarkReport.perBuilding.triangleCount)}</dd>
                </div>
                <div>
                  <dt>Compile time</dt>
                  <dd>{formatMilliseconds(benchmarkReport.timing.compileTimeMs)}</dd>
                </div>
                <div>
                  <dt>Mount time</dt>
                  <dd>{formatMilliseconds(benchmarkReport.timing.runtimeMountTimeMs)}</dd>
                </div>
              </dl>

              <ol className="assembly-hall__benchmark-targets" aria-label="100-building benchmark target checks">
                <li data-passed={benchmarkReport.targets.oneBuildingTriangleLimit.passed ? "true" : "false"}>
                  <span>
                    Triangle target {benchmarkReport.targets.oneBuildingTriangleLimit.passed ? "passed" : "failed"}
                  </span>
                  <small>
                    {formatNumber(benchmarkReport.targets.oneBuildingTriangleLimit.actual)} /{" "}
                    {formatNumber(benchmarkReport.targets.oneBuildingTriangleLimit.limit)} triangles
                  </small>
                </li>
                <li data-passed={benchmarkReport.targets.familyAssetSharing.passed ? "true" : "false"}>
                  <span>
                    Family assets {benchmarkReport.targets.familyAssetSharing.passed ? "shared" : "not shared"}
                  </span>
                  <small>
                    {formatNumber(benchmarkReport.assets.sharedMaterialCount)} shared materials /{" "}
                    {formatNumber(benchmarkReport.assets.textureCount)} textures
                  </small>
                </li>
              </ol>

              {benchmarkDocumentation ? (
                <>
                  <table
                    className="assembly-hall__benchmark-coverage"
                    aria-label="100-building benchmark profile coverage"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col">Status</th>
                        <th scope="col">Value</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkDocumentation.profileCoverage.map((metric) => (
                        <tr key={metric.id} data-status={metric.status}>
                          <td>{metric.label}</td>
                          <td>{metricStatusLabel(metric.status)}</td>
                          <td>{formatProfileMetricValue(metric)}</td>
                          <td>{metric.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <ul
                    className="assembly-hall__benchmark-limitations"
                    aria-label="100-building benchmark known limitations"
                  >
                    {benchmarkDocumentation.knownLimitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="assembly-hall__benchmark-message">Not run</p>
          )}
        </section>

        <section className="assembly-hall__benchmark" aria-label="Milestone 7 benchmark profile packet">
          <div className="assembly-hall__benchmark-header">
            <div>
              <p className="project-label">Profile Packet</p>
              <h3>Milestone 7 Profile Packet</h3>
            </div>
            {benchmarkProfilePacket ? (
              <button type="button" onClick={() => downloadBenchmarkProfilePacket(benchmarkProfilePacket)}>
                Download Profile Packet
              </button>
            ) : null}
          </div>

          {benchmarkProfilePacket ? (
            <>
              <dl className="assembly-hall__benchmark-metrics" aria-label="Milestone 7 profile packet summary">
                <div>
                  <dt>Packet</dt>
                  <dd>{benchmarkProfilePacket.profileKind}</dd>
                </div>
                <div>
                  <dt>Captured</dt>
                  <dd>{benchmarkProfilePacket.createdAt}</dd>
                </div>
                <div>
                  <dt>Renderer</dt>
                  <dd>{benchmarkProfilePacket.environment.renderer.orbitBackend ?? "not captured"}</dd>
                </div>
                <div>
                  <dt>Browser</dt>
                  <dd>{benchmarkProfilePacket.environment.userAgent}</dd>
                </div>
                <div>
                  <dt>Hardware</dt>
                  <dd>
                    {benchmarkProfilePacket.environment.hardwareConcurrency
                      ? `${formatNumber(benchmarkProfilePacket.environment.hardwareConcurrency)} threads`
                      : "not captured"}
                  </dd>
                </div>
                <div>
                  <dt>Viewport</dt>
                  <dd>
                    {benchmarkProfilePacket.environment.viewport.widthPx &&
                    benchmarkProfilePacket.environment.viewport.heightPx
                      ? `${formatNumber(benchmarkProfilePacket.environment.viewport.widthPx)} x ${formatNumber(
                          benchmarkProfilePacket.environment.viewport.heightPx
                        )}`
                      : "not captured"}
                  </dd>
                </div>
              </dl>

              <table className="assembly-hall__benchmark-coverage" aria-label="Milestone 7 profile coverage">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Status</th>
                    <th scope="col">Value</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkProfilePacket.profileCoverage.map((metric) => (
                    <tr key={metric.id} data-status={metric.status}>
                      <td>{metric.label}</td>
                      <td>{metricStatusLabel(metric.status)}</td>
                      <td>{formatProfileMetricValue(metric)}</td>
                      <td>{metric.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ol className="assembly-hall__benchmark-targets" aria-label="Milestone 7 profile target checks">
                <li data-passed={benchmarkProfilePacket.targets.oneBuildingTriangleLimit.passed ? "true" : "false"}>
                  <span>
                    Triangle target{" "}
                    {benchmarkProfilePacket.targets.oneBuildingTriangleLimit.passed ? "passed" : "failed"}
                  </span>
                  <small>
                    {formatNumber(benchmarkProfilePacket.targets.oneBuildingTriangleLimit.actual)} /{" "}
                    {formatNumber(benchmarkProfilePacket.targets.oneBuildingTriangleLimit.limit)} triangles
                  </small>
                </li>
                <li data-passed={benchmarkProfilePacket.targets.interactiveOrbit.passed ? "true" : "false"}>
                  <span>
                    Interactive orbit{" "}
                    {benchmarkProfilePacket.targets.interactiveOrbit.passed ? "passed" : "needs profile"}
                  </span>
                  <small>
                    {formatMilliseconds(benchmarkProfilePacket.targets.interactiveOrbit.actualP95FrameTimeMs)} /{" "}
                    {formatMilliseconds(benchmarkProfilePacket.targets.interactiveOrbit.budgetMs)} p95
                  </small>
                </li>
              </ol>

              <ul className="assembly-hall__benchmark-limitations" aria-label="Milestone 7 profile limitations">
                {benchmarkProfilePacket.knownLimitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="assembly-hall__benchmark-message">Run both benchmark reports to create the profile packet</p>
          )}
        </section>
      </div>
    </section>
  );
}
