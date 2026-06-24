import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Object3D
} from "three";
import type { ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { AssemblyStage } from "../contracts/shared";
import type { AssemblyHallFixture } from "./assemblyHallFixture";

export interface AssemblyRenderer {
  domElement: HTMLCanvasElement;
  dispose(): void;
  render(scene: Scene, camera: Camera): void;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
}

export type AssemblyRendererFactory = () => AssemblyRenderer;

export interface AssemblyHallProps {
  fixture: AssemblyHallFixture;
  rendererFactory?: AssemblyRendererFactory;
}

const defaultRendererFactory: AssemblyRendererFactory = () =>
  new WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true
  });

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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

export function AssemblyHall({ fixture, rendererFactory = defaultRendererFactory }: AssemblyHallProps) {
  const selectionId = useId();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const rows = useMemo(() => galleryRows(fixture), [fixture]);
  const selectionOptions = useMemo(() => semanticSelectionOptions(fixture), [fixture]);
  const [selectedSemanticPath, setSelectedSemanticPath] = useState("");
  const selectedOption =
    selectionOptions.find((option) => option.semanticPath === selectedSemanticPath) ?? selectionOptions[0];
  const webglUnavailable = rendererFactory === defaultRendererFactory && !("WebGLRenderingContext" in window);

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

    if (webglUnavailable) {
      return undefined;
    }

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
    };

    try {
      const prepared = prepareScene(fixture.familyRuntime.root);
      scene = prepared.scene;
      camera = prepared.camera;
      renderer = rendererFactory();
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
      queueMicrotask(() => {
        if (!cancelled) {
          setRenderError(message);
        }
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      scene?.remove(fixture.familyRuntime.root);
      renderer?.domElement.remove();
      renderer?.dispose();
    };
  }, [fixture, rendererFactory, webglUnavailable]);

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
          {webglUnavailable ? (
            <p className="assembly-hall__render-error" role="status">
              Renderer fallback: WebGL renderer unavailable in this environment
            </p>
          ) : renderError ? (
            <p className="assembly-hall__render-error" role="status">
              Renderer fallback: {renderError}
            </p>
          ) : null}
        </div>

        <div className="assembly-hall__data-grid">
          <dl className="assembly-hall__metrics" aria-label="Assembly Hall renderer metrics">
            <div>
              <dt>Backend</dt>
              <dd>
                {fixture.metrics.activeBackend} active / {fixture.metrics.preferredBackend} preferred
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
      </div>
    </section>
  );
}
