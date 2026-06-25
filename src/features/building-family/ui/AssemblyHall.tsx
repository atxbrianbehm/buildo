import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import type { ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { AssemblyStage } from "../contracts/shared";
import {
  createAssemblyRenderer,
  type AssemblyRenderer,
  type AssemblyRendererBackend,
  type AssemblyRendererFactory
} from "../renderer-three/assemblyRendererFactory";
import {
  createFamilyBenchmarkScene,
  type FamilyBenchmarkReport,
  type FamilyBenchmarkScene
} from "../performance/familyBenchmarkScene";
import type { AssemblyHallFixture } from "./assemblyHallFixture";

export interface AssemblyHallProps {
  fixture: AssemblyHallFixture;
  rendererFactory?: AssemblyRendererFactory;
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

type BenchmarkStatus = "idle" | "running" | "complete" | "failed";

interface BenchmarkState {
  fixture: AssemblyHallFixture;
  status: BenchmarkStatus;
  report: FamilyBenchmarkReport | null;
  error: string | null;
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

function prepareScene(root: Object3D): { scene: Scene; camera: PerspectiveCamera } {
  const scene = new Scene();
  scene.background = new Color("#edf0e8");
  scene.add(new AmbientLight("#f4f0e4", 1.9));

  const keyLight = new DirectionalLight("#fff4dd", 3);
  keyLight.position.set(12, 18, 14);
  scene.add(keyLight);

  const fillLight = new DirectionalLight("#d7f0ff", 1.1);
  fillLight.position.set(-14, 10, -8);
  scene.add(fillLight);

  const { center, size, maxDimension } = sceneBounds(root);
  const camera = new PerspectiveCamera(42, 16 / 9, 0.1, maxDimension * 10);
  camera.position.set(center.x + maxDimension * 0.85, center.y + size.y * 0.45, center.z + maxDimension * 1.35);
  camera.lookAt(center.x, center.y + size.y * 0.1, center.z);
  scene.add(root);
  return { scene, camera };
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

export function AssemblyHall({ fixture, rendererFactory = createAssemblyRenderer }: AssemblyHallProps) {
  const selectionId = useId();
  const revealId = useId();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const benchmarkRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const latestFixtureRef = useRef(fixture);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [activeBackend, setActiveBackend] = useState<AssemblyRendererBackend | "pending">(
    fixture.metrics.activeBackend
  );
  const [backendFallbackReason, setBackendFallbackReason] = useState<string | null>(null);
  const [revealThroughStage, setRevealThroughStage] = useState<AssemblyStage>("roof");
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>(() => ({
    fixture,
    status: "idle",
    report: null,
    error: null
  }));
  const revealThroughStageRef = useRef<AssemblyStage>(revealThroughStage);
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

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      benchmarkRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    latestFixtureRef.current = fixture;
    benchmarkRunIdRef.current += 1;
  }, [fixture]);

  useEffect(() => {
    revealThroughStageRef.current = revealThroughStage;
    applyStageReveal(fixture, revealThroughStage);
    renderFrameRef.current?.();
  }, [fixture, revealThroughStage]);

  const runBenchmark = async () => {
    const runId = benchmarkRunIdRef.current + 1;
    const benchmarkFixture = fixture;
    benchmarkRunIdRef.current = runId;
    setBenchmarkState({
      fixture: benchmarkFixture,
      status: "running",
      report: null,
      error: null
    });

    let benchmark: FamilyBenchmarkScene | undefined;
    try {
      benchmark = await createFamilyBenchmarkScene({ fixture: benchmarkFixture });
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
      benchmark?.familyRuntime.dispose();
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
    };
    renderFrameRef.current = renderFrame;

    const activateRenderer = async () => {
      try {
        const prepared = prepareScene(fixture.familyRuntime.root);
        scene = prepared.scene;
        camera = prepared.camera;
        const activation = await rendererFactory({ backendSupport: fixture.backendSupport });
        if (cancelled) {
          prepared.scene.remove(fixture.familyRuntime.root);
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
      scene?.remove(fixture.familyRuntime.root);
      renderer?.domElement.remove();
      renderer?.dispose();
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
            </>
          ) : (
            <p className="assembly-hall__benchmark-message">Not run</p>
          )}
        </section>
      </div>
    </section>
  );
}
