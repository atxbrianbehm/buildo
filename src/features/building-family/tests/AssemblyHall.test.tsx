import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { StrictMode } from "react";
import { Box3, Box3Helper, BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3, type Scene } from "three";
import type { AssemblyRendererActivation } from "../renderer-three/assemblyRendererFactory";
import { AssemblyHall, type AssemblyHallProps } from "../ui/AssemblyHall";
import type { BuildingFixtureViewerPreparer, PreparedBuildingFixtureView } from "../state/buildingRunController";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { prepareBuildingSurfaceRuntime } from "../renderer-three/surfaceMaterialRuntime";
import {
  resolveWindowSelectionFromIntersections,
  resolveWindowSelectionFromSemanticPath,
  type BuildingWindowSelection
} from "../renderer-three/buildingSceneAdapter";

type P1Fixture = Awaited<ReturnType<typeof createAssemblyHallFixture>>;

function p1SelectionRenderer() {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-testid", "p1-selection-canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 920, 520);
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  const captured: { scene?: Scene; camera?: PerspectiveCamera } = {};
  const activation: AssemblyRendererActivation = {
    activeBackend: "webgl",
    renderer: {
      domElement: canvas, dispose: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(),
      render: vi.fn((...args: unknown[]) => {
        const [scene, camera] = args as [Scene, PerspectiveCamera];
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        captured.scene = scene; captured.camera = camera;
      })
    }
  };
  return { activation, canvas, captured };
}

function p1VisibleWindows(fixture: P1Fixture, camera: PerspectiveCamera) {
  const result: Array<{ selection: BuildingWindowSelection; x: number; y: number }> = [];
  const seen = new Set<string>();
  fixture.buildingRuntime.root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  for (const entry of fixture.ir.semanticIndex) {
    if (entry.batchId !== "instances.window" && entry.batchId !== "instances.window.glass") continue;
    const window = resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, entry.semanticPath);
    if (!window) continue;
    const ndc = window.bounds.getCenter(new Vector3()).project(camera);
    if (Math.abs(ndc.x) >= 0.95 || Math.abs(ndc.y) >= 0.95 || Math.abs(ndc.z) >= 1) continue;
    raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = raycaster.intersectObject(fixture.buildingRuntime.root, true);
    const selection = resolveWindowSelectionFromIntersections(fixture.buildingRuntime, fixture.catalog, hits);
    if (!selection || seen.has(selection.semanticPath)) continue;
    seen.add(selection.semanticPath);
    result.push({ selection, x: (ndc.x + 1) * 460, y: (1 - ndc.y) * 260 });
    if (result.length === 4) break;
  }
  expect(result.length).toBeGreaterThanOrEqual(2);
  return result;
}

function p1Pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, input: {
  pointerId?: number; pointerType?: string; isPrimary?: boolean; button?: number; buttons?: number;
  shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean;
} = {}) {
  const { pointerId = 1, pointerType = "mouse", isPrimary = true, ...mouse } = input;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, ...mouse });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary } });
  fireEvent(canvas, event);
}

function p1ExpectedBounds(selection: BuildingWindowSelection): Box3 {
  const positions = selection.object.geometry.getAttribute("position");
  if (!positions?.count) throw new Error("Selected instance has no actual geometry vertices");
  const native = new Matrix4();
  selection.object.getMatrixAt(selection.instanceIndex, native);
  const worldNative = selection.object.matrixWorld.clone().multiply(native);
  const bounds = new Box3(), point = new Vector3();
  for (let index = 0; index < positions.count; index += 1) bounds.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(worldNative));
  return bounds;
}

function p1Marker(scene: Scene, selection: BuildingWindowSelection) {
  const marker = scene.getObjectByName("assembly-hall.window-selection");
  expect(marker).toBeInstanceOf(Box3Helper);
  if (!(marker instanceof Box3Helper)) throw new Error("Missing owned instance highlight");
  expect(marker.visible).toBe(true);
  expect(marker.userData.semanticPath).toBe(selection.semanticPath);
  expect(marker.userData.instanceIndex).toBe(selection.instanceIndex);
  expect(marker.userData.selectionObjectUuid).toBe(selection.object.uuid);
  const expected = p1ExpectedBounds(selection);
  for (const axis of ["x", "y", "z"] as const) {
    expect(marker.box.min[axis]).toBeCloseTo(expected.min[axis], 10);
    expect(marker.box.max[axis]).toBeCloseTo(expected.max[axis], 10);
  }
  expect(marker.parent).toBe(scene);
  return marker;
}

describe("R3.P1 current window selection", () => {
  let fixture: P1Fixture, replacement: P1Fixture, different: P1Fixture;
  beforeAll(async () => {
    fixture = await createAssemblyHallFixture();
    replacement = await createAssemblyHallFixture();
    if (!fixture.sourceSnapshot) throw new Error("Selection fixture needs captured controls");
    const controls = structuredClone(fixture.sourceSnapshot.controlsView);
    controls.seeds.family = "r3-p1-different-family";
    different = await createAssemblyHallFixture({ promptControls: controls });
  }, 20000);
  afterAll(() => { fixture.familyRuntime.dispose(); replacement.familyRuntime.dispose(); different.familyRuntime.dispose(); });

  it("synchronizes a real visible instance hit and keyboard selection with precise owned bounds", async () => {
    const renderer = p1SelectionRenderer();
    const source = JSON.stringify(fixture.sourceSnapshot);
    const raw = Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, Array.from(layer.data)]));
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={async () => renderer.activation} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [first, second] = p1VisibleWindows(fixture, renderer.captured.camera!);
      p1Pointer(renderer.canvas, "pointerdown", first.x, first.y);
      p1Pointer(renderer.canvas, "pointerup", first.x, first.y);
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue(first.selection.semanticPath);
      expect(screen.getByLabelText("Window selection")).toHaveTextContent(`Selected window #${first.selection.elementIndex ?? first.selection.instanceIndex}`);
      const marker = p1Marker(renderer.captured.scene!, first.selection);
      expect(fixture.familyRuntime.root.getObjectById(marker.id)).toBeUndefined();
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: second.selection.semanticPath } });
      expect(p1Marker(renderer.captured.scene!, second.selection)).toBe(marker);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: first.selection.semanticPath } });
      expect(p1Marker(renderer.captured.scene!, first.selection)).toBe(marker);
      const background = new Raycaster();
      background.setFromCamera(new Vector2(2 / 460 - 1, 1 - 2 / 260), renderer.captured.camera!);
      expect(resolveWindowSelectionFromIntersections(fixture.buildingRuntime, fixture.catalog, background.intersectObject(fixture.buildingRuntime.root, true))).toBeUndefined();
      p1Pointer(renderer.canvas, "pointerdown", 2, 2); p1Pointer(renderer.canvas, "pointerup", 2, 2);
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue("");
      expect(screen.getByLabelText("Window selection")).toHaveTextContent("No window selected");
      expect(marker.visible).toBe(false);
      expect(JSON.stringify(fixture.sourceSnapshot)).toBe(source);
      for (const [name, layer] of Object.entries(fixture.packedAtlas.channels)) expect(Array.from(layer.data)).toEqual(raw[name]);
      expect(fixture.buildingRuntime.renderables).not.toContain(marker);
    } finally { view.unmount(); }
  });

  it.each(["drag", "out-and-back", "shift", "right", "ctrl", "alt", "meta", "cancel", "lost-capture", "multitouch"] as const)("rejects %s as a selection click", async (kind) => {
    const renderer = p1SelectionRenderer();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={async () => renderer.activation} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [selected, target] = p1VisibleWindows(fixture, renderer.captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: selected.selection.semanticPath } });
      const modifier = kind === "shift" ? { shiftKey: true } : kind === "ctrl" ? { ctrlKey: true } : kind === "alt" ? { altKey: true } : kind === "meta" ? { metaKey: true } : kind === "right" ? { button: 2, buttons: 2 } : {};
      const touch = kind === "multitouch" ? { pointerType: "touch" } : {};
      p1Pointer(renderer.canvas, "pointerdown", target.x, target.y, { ...modifier, ...touch });
      if (kind === "drag" || kind === "out-and-back") p1Pointer(renderer.canvas, "pointermove", target.x + 24, target.y);
      if (kind === "out-and-back") p1Pointer(renderer.canvas, "pointermove", target.x, target.y);
      if (kind === "cancel") p1Pointer(renderer.canvas, "pointercancel", target.x, target.y);
      if (kind === "lost-capture") p1Pointer(renderer.canvas, "lostpointercapture", target.x, target.y);
      if (kind === "multitouch") {
        p1Pointer(renderer.canvas, "pointerdown", target.x + 12, target.y, { pointerId: 2, pointerType: "touch", isPrimary: false });
        p1Pointer(renderer.canvas, "pointerup", target.x + 12, target.y, { pointerId: 2, pointerType: "touch", isPrimary: false });
      }
      p1Pointer(renderer.canvas, "pointerup", target.x + (kind === "drag" ? 24 : 0), target.y, { ...modifier, ...touch, buttons: 0 });
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue(selected.selection.semanticPath);
      expect(renderer.captured.scene!.getObjectByName("assembly-hall.window-selection")?.userData.semanticPath).toBe(selected.selection.semanticPath);
    } finally { view.unmount(); }
  });

  it("does not select hidden opening stages or a window behind an opaque actual hit", async () => {
    const renderer = p1SelectionRenderer();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={async () => renderer.activation} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, renderer.captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Reveal through stage" }), { target: { value: "facade" } });
      p1Pointer(renderer.canvas, "pointerdown", target.x, target.y);
      p1Pointer(renderer.canvas, "pointerup", target.x, target.y);
      expect(screen.getByLabelText("Window selection")).toHaveTextContent("No window selected");
      expect(renderer.captured.scene!.getObjectByName("assembly-hall.window-selection")?.visible ?? false).toBe(false);
      fireEvent.change(screen.getByRole("combobox", { name: "Reveal through stage" }), { target: { value: "roof" } });
      // Add actual opaque geometry in front of the window; no raycast result is mocked.
      const actualBounds = p1ExpectedBounds(target.selection);
      const center = actualBounds.getCenter(new Vector3());
      const direction = renderer.captured.camera!.position.clone().sub(center).normalize();
      const occluder = new Mesh(new BoxGeometry(6, 6, 0.5), new MeshStandardMaterial());
      occluder.position.copy(center.addScaledVector(direction, 2));
      occluder.lookAt(renderer.captured.camera!.position);
      fixture.buildingRuntime.root.add(occluder);
      fixture.buildingRuntime.renderables.push(occluder);
      try {
        fixture.buildingRuntime.root.updateMatrixWorld(true);
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(target.x / 460 - 1, 1 - target.y / 260), renderer.captured.camera!);
        expect(ray.intersectObject(fixture.buildingRuntime.root, true)[0]?.object).toBe(occluder);
        p1Pointer(renderer.canvas, "pointerdown", target.x, target.y);
        p1Pointer(renderer.canvas, "pointerup", target.x, target.y);
        expect(screen.getByLabelText("Window selection")).toHaveTextContent("No window selected");
      } finally {
        occluder.removeFromParent();
        fixture.buildingRuntime.renderables.splice(fixture.buildingRuntime.renderables.indexOf(occluder), 1);
        occluder.geometry.dispose(); occluder.material.dispose();
        fixture.buildingRuntime.root.updateMatrixWorld(true);
      }
    } finally { view.unmount(); }
  });

  it("keeps pending candidate listeners inert and re-resolves an accepted same-path owner", async () => {
    const first = p1SelectionRenderer(); let next = p1SelectionRenderer();
    const factory = vi.fn().mockResolvedValueOnce(first.activation).mockResolvedValueOnce(next.activation);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={factory} registerFixtureViewer={subscription.register} />);
    let prepared: PreparedBuildingFixtureView | undefined;
    try {
      await waitFor(() => expect(first.captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, first.captured.camera!);
      p1Pointer(first.canvas, "pointerdown", target.x, target.y); p1Pointer(first.canvas, "pointerup", target.x, target.y);
      const oldMarker = p1Marker(first.captured.scene!, target.selection);
      await act(async () => { prepared = await subscription.prepare(replacement, { signal: new AbortController().signal }); });
      const [candidate] = p1VisibleWindows(replacement, next.captured.camera!);
      p1Pointer(next.canvas, "pointerdown", candidate.x, candidate.y); p1Pointer(next.canvas, "pointerup", candidate.x, candidate.y);
      expect(first.captured.scene!.getObjectByName("assembly-hall.window-selection")).toBe(oldMarker);
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue(target.selection.semanticPath);
      act(() => { prepared!.discard(); });
      expect(first.canvas.isConnected).toBe(true);
      expect(p1Marker(first.captured.scene!, target.selection)).toBe(oldMarker);
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue(target.selection.semanticPath);
      next = p1SelectionRenderer();
      factory.mockResolvedValueOnce(next.activation);
      await act(async () => { prepared = await subscription.prepare(replacement, { signal: new AbortController().signal }); });
      let finalize!: () => void;
      act(() => { finalize = prepared!.commit(); });
      const current = resolveWindowSelectionFromSemanticPath(replacement.buildingRuntime, replacement.catalog, target.selection.semanticPath);
      expect(current).toBeDefined();
      p1Marker(next.captured.scene!, current!);
      p1Pointer(first.canvas, "pointerdown", target.x, target.y); p1Pointer(first.canvas, "pointerup", target.x, target.y);
      expect(next.captured.scene!.getObjectByName("assembly-hall.window-selection")?.userData.selectionObjectUuid).toBe(current!.object.uuid);
      finalize();
    } finally { prepared?.discard(); view.unmount(); }
  });

  it("clears a selected path missing from an accepted replacement", async () => {
    const first = p1SelectionRenderer(), next = p1SelectionRenderer();
    const factory = vi.fn().mockResolvedValueOnce(first.activation).mockResolvedValueOnce(next.activation);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={factory} registerFixtureViewer={subscription.register} />);
    let prepared: PreparedBuildingFixtureView | undefined;
    try {
      await waitFor(() => expect(first.captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, first.captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: target.selection.semanticPath } });
      p1Marker(first.captured.scene!, target.selection);
      expect(different.buildingRuntime.semanticLookup.has(target.selection.semanticPath)).toBe(false);
      await act(async () => { prepared = await subscription.prepare(different, { signal: new AbortController().signal }); });
      let finalize!: () => void;
      act(() => { finalize = prepared!.commit(); });
      finalize();
      view.rerender(<AssemblyHall fixture={different} rendererFactory={factory} registerFixtureViewer={subscription.register} />);
      expect(screen.getByLabelText("Window selection")).toHaveTextContent("No window selected");
      expect(screen.getByRole("combobox", { name: "Semantic element" })).toHaveValue("");
      expect(next.captured.scene!.getObjectByName("assembly-hall.window-selection")?.visible ?? false).toBe(false);
      expect(next.canvas.isConnected).toBe(true);
    } finally { prepared?.discard(); view.unmount(); }
  });

  it("disposes only the owned marker and removes each picking listener once", async () => {
    const renderer = p1SelectionRenderer();
    const add = vi.spyOn(renderer.canvas, "addEventListener"), remove = vi.spyOn(renderer.canvas, "removeEventListener");
    const shared = [...new Set(fixture.buildingRuntime.renderables.map((object) => object.material))].map((material) => vi.spyOn(material, "dispose"));
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={async () => renderer.activation} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, renderer.captured.camera!);
      p1Pointer(renderer.canvas, "pointerdown", target.x, target.y); p1Pointer(renderer.canvas, "pointerup", target.x, target.y);
      const marker = p1Marker(renderer.captured.scene!, target.selection);
      const geometry = vi.spyOn(marker.geometry, "dispose");
      const materials = (Array.isArray(marker.material) ? marker.material : [marker.material]).map((material) => vi.spyOn(material, "dispose"));
      const listeners = add.mock.calls.filter(([name, , capture]) => ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"].includes(name) && capture === true);
      expect(listeners.length).toBeGreaterThanOrEqual(5);
      view.unmount(); view.unmount();
      expect(marker.parent).toBeNull();
      expect(geometry).toHaveBeenCalledTimes(1); for (const material of materials) expect(material).toHaveBeenCalledTimes(1);
      for (const [name, listener, capture] of listeners) expect(remove.mock.calls.filter((call) => call[0] === name && call[1] === listener && call[2] === capture)).toHaveLength(1);
      for (const dispose of shared) expect(dispose).not.toHaveBeenCalled();
      geometry.mockRestore(); for (const material of materials) material.mockRestore();
    } finally { view.unmount(); add.mockRestore(); remove.mockRestore(); for (const dispose of shared) dispose.mockRestore(); }
  });

  it("R3.P6 reports the exact active owner and path for pointer and keyboard windows and clears misses, nonwindows and hidden stages", async () => {
    const renderer = p1SelectionRenderer(), selected = vi.fn();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={async () => renderer.activation} onWindowSelectionChange={selected} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [first, second] = p1VisibleWindows(fixture, renderer.captured.camera!);
      selected.mockClear();
      p1Pointer(renderer.canvas, "pointerdown", first.x, first.y); p1Pointer(renderer.canvas, "pointerup", first.x, first.y);
      expect(selected).toHaveBeenLastCalledWith({ fixture, semanticPath: first.selection.semanticPath });
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: second.selection.semanticPath } });
      expect(selected).toHaveBeenLastCalledWith({ fixture, semanticPath: second.selection.semanticPath });
      p1Pointer(renderer.canvas, "pointerdown", 2, 2); p1Pointer(renderer.canvas, "pointerup", 2, 2);
      expect(selected).toHaveBeenLastCalledWith(null);
      const wall = fixture.ir.semanticIndex.find(value => value.batchId === "mesh.wall-panels");
      if (!wall) throw new Error("Expected actual nonwindow semantic path");
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: wall.semanticPath } });
      expect(selected).toHaveBeenLastCalledWith(null);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: first.selection.semanticPath } });
      expect(selected).toHaveBeenLastCalledWith({ fixture, semanticPath: first.selection.semanticPath });
      fireEvent.change(screen.getByRole("combobox", { name: "Reveal through stage" }), { target: { value: "facade" } });
      expect(selected).toHaveBeenLastCalledWith(null);
    } finally { view.unmount(); }
  });

  it("R3.P6 keeps prepared owners inert, rolls a temporary callback owner back, and rebinds an accepted owner", async () => {
    const renderers = Array.from({ length: 4 }, () => p1SelectionRenderer()), selected = vi.fn();
    const factory = vi.fn(); for (const renderer of renderers) factory.mockResolvedValueOnce(renderer.activation);
    const subscription = hallViewerSubscription();
    const props = { rendererFactory: factory, registerFixtureViewer: subscription.register, onWindowSelectionChange: selected };
    const view = render(<AssemblyHall fixture={fixture} {...props} />);
    let prepared: PreparedBuildingFixtureView | undefined;
    try {
      await waitFor(() => expect(renderers[0].captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, renderers[0].captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: target.selection.semanticPath } });
      selected.mockClear();
      await act(async () => { prepared = await subscription.prepare(replacement, { signal: new AbortController().signal }); });
      const [candidate] = p1VisibleWindows(replacement, renderers[1].captured.camera!);
      p1Pointer(renderers[1].canvas, "pointerdown", candidate.x, candidate.y); p1Pointer(renderers[1].canvas, "pointerup", candidate.x, candidate.y);
      expect(selected).not.toHaveBeenCalled();
      act(() => { prepared!.discard(); });
      expect(selected.mock.calls.every(([value]) => value === null || value.fixture === fixture)).toBe(true);
      await act(async () => { prepared = await subscription.prepare(replacement, { signal: new AbortController().signal }); });
      act(() => { prepared!.commit(); });
      expect(selected).toHaveBeenLastCalledWith({ fixture: replacement, semanticPath: target.selection.semanticPath });
      act(() => { prepared!.discard(); });
      expect(selected).toHaveBeenLastCalledWith({ fixture, semanticPath: target.selection.semanticPath });
      expect(renderers[0].canvas.isConnected).toBe(true);
      await act(async () => { prepared = await subscription.prepare(replacement, { signal: new AbortController().signal }); });
      let finalize!: () => void; act(() => { finalize = prepared!.commit(); });
      expect(selected).toHaveBeenLastCalledWith({ fixture: replacement, semanticPath: target.selection.semanticPath });
      view.rerender(<AssemblyHall fixture={replacement} {...props} />);
      finalize();
      expect(selected).toHaveBeenLastCalledWith({ fixture: replacement, semanticPath: target.selection.semanticPath });
      p1Pointer(renderers[0].canvas, "pointerdown", target.x, target.y); p1Pointer(renderers[0].canvas, "pointerup", target.x, target.y);
      expect(selected).toHaveBeenLastCalledWith({ fixture: replacement, semanticPath: target.selection.semanticPath });
      expect(factory).toHaveBeenCalledTimes(4);
    } finally { prepared?.discard(); view.unmount(); }
  });

  it("R3.P6 reports no window when a committed replacement lacks the selected path", async () => {
    const first = p1SelectionRenderer(), next = p1SelectionRenderer(), selected = vi.fn();
    const factory = vi.fn().mockResolvedValueOnce(first.activation).mockResolvedValueOnce(next.activation), subscription = hallViewerSubscription();
    const props = { rendererFactory: factory, registerFixtureViewer: subscription.register, onWindowSelectionChange: selected };
    const view = render(<AssemblyHall fixture={fixture} {...props} />);
    let prepared: PreparedBuildingFixtureView | undefined;
    try {
      await waitFor(() => expect(first.captured.camera).toBeDefined());
      const [target] = p1VisibleWindows(fixture, first.captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: target.selection.semanticPath } });
      expect(selected).toHaveBeenLastCalledWith({ fixture, semanticPath: target.selection.semanticPath });
      selected.mockClear();
      await act(async () => { prepared = await subscription.prepare(different, { signal: new AbortController().signal }); });
      expect(selected).not.toHaveBeenCalled();
      let finalize!: () => void; act(() => { finalize = prepared!.commit(); });
      expect(selected).toHaveBeenLastCalledWith(null);
      view.rerender(<AssemblyHall fixture={different} {...props} />); finalize();
      expect(selected).toHaveBeenLastCalledWith(null);
      expect(screen.getByLabelText("Window selection")).toHaveTextContent("No window selected");
    } finally { prepared?.discard(); view.unmount(); }
  });

  it("R3.P6 uses a replacement callback ref without remounting the renderer or reporting to the old callback", async () => {
    const renderer = p1SelectionRenderer(), first = vi.fn(), latest = vi.fn(), factory = vi.fn(async () => renderer.activation);
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={factory} onWindowSelectionChange={first} />);
    try {
      await waitFor(() => expect(renderer.captured.camera).toBeDefined());
      const [one, two] = p1VisibleWindows(fixture, renderer.captured.camera!);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: one.selection.semanticPath } });
      expect(first).toHaveBeenLastCalledWith({ fixture, semanticPath: one.selection.semanticPath });
      const count = first.mock.calls.length;
      view.rerender(<AssemblyHall fixture={fixture} rendererFactory={factory} onWindowSelectionChange={latest} />);
      fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), { target: { value: two.selection.semanticPath } });
      expect(latest).toHaveBeenLastCalledWith({ fixture, semanticPath: two.selection.semanticPath });
      expect(first).toHaveBeenCalledTimes(count); expect(factory).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); }
  });
});

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

function fakeConstructionBenchmarkSceneFor(fixture: Awaited<ReturnType<typeof createAssemblyHallFixture>>) {
  return {
    schemaVersion: "0.1.0",
    familyRuntime: {
      dispose: vi.fn()
    },
    report: {
      schemaVersion: "0.1.0",
      benchmarkKind: "shared-family-100-building-scene",
      familyId: fixture.spec.familyId,
      buildingCount: 100,
      perBuilding: {
        drawCallCount: fixture.buildingRuntime.renderables.length,
        instanceCount: fixture.ir.metrics.instanceCount,
        semanticPathCount: fixture.ir.semanticIndex.length,
        triangleCount: fixture.ir.metrics.triangleCount
      },
      aggregate: {
        drawCallCount: 600,
        instanceCount: fixture.ir.metrics.instanceCount * 100,
        triangleCount: fixture.ir.metrics.triangleCount * 100
      },
      runtimeMetrics: {
        buildingCount: 100,
        meshCount: 300,
        instanceBatchCount: 300,
        instanceCount: fixture.ir.metrics.instanceCount * 100,
        triangleCount: fixture.ir.metrics.triangleCount * 100,
        drawCallCount: 600,
        sharedMaterialCount: fixture.familyRuntime.metrics.sharedMaterialCount,
        textureCount: fixture.familyRuntime.metrics.textureCount,
        preferredBackend: fixture.backendSupport.preferredBackend
      },
      transfer: {
        perBuildingRuntimeIrBytes: 4096,
        runtimeIrBytes: 409600
      },
      timing: {
        compileTimeMs: 120,
        runtimeMountTimeMs: 80
      },
      assets: {
        atlasContentHash: fixture.packedAtlas.contentHash,
        familyAssetsShared: true,
        sharedMaterialCount: fixture.familyRuntime.metrics.sharedMaterialCount,
        textureCount: fixture.familyRuntime.metrics.textureCount
      },
      targets: {
        oneBuildingTriangleLimit: {
          actual: fixture.ir.metrics.triangleCount,
          limit: 150000,
          passed: true
        },
        familyAssetSharing: {
          passed: true
        }
      }
    }
  } as never;
}

function fakeOrbitBenchmarkSceneFor(fixture: Awaited<ReturnType<typeof createAssemblyHallFixture>>) {
  return {
    schemaVersion: "0.1.0",
    familyRuntime: {
      dispose: vi.fn()
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
  } as never;
}

describe("AssemblyHall", () => {
  it("renders the generated building fixture, atlas identity, component gallery, and renderer metrics", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    expect(screen.getByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    const viewport = screen.getByRole("application", { name: "Interactive generated building viewer" });
    const canvas = await within(viewport).findByTestId("assembly-renderer-canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("data-orbit-controls", "true");
    expect(canvas).toHaveAttribute("data-light-orbit", "true");
    expect(screen.getByRole("button", { name: "Reset view" })).toBeInTheDocument();
    expect(screen.getByText(/Shift-drag light/i)).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Visual QA Packet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Visual QA Packet" })).toBeInTheDocument();
    expect(screen.getByLabelText("Visual QA packet summary")).toHaveTextContent(fixture.fidelityMode);
  });

  it("switches the live renderer between textured and clay inspection modes", async () => {
    const fixture = await createAssemblyHallFixture();
    const source = fixture.sourceSnapshot!;
    const surface = await prepareBuildingSurfaceRuntime({
      ir: fixture.ir, atlas: fixture.packedAtlas,
      composition: { schemaVersion: "0.1.0", documentId: source.document.documentId, revision: source.document.revision,
        sources: [{ id: "masonry", atlasContentHash: fixture.packedAtlas.contentHash,
          slotId: fixture.packedAtlas.manifest.slots.find(slot => slot.role === "wall")!.id }],
        layers: [{ id: "frame-finish", target: { kind: "role", role: "frame" }, sourceId: "masonry",
          mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 0.8,
          physicalSizeM: { width: 1, height: 1 }, channels: ["baseColor"] }] }
    });
    let unmount: (() => void) | undefined;
    try {
    fixture.buildingRuntime = fixture.familyRuntime.createOrReplaceBuilding({
      ir: fixture.ir, catalog: fixture.catalog, componentGallery: fixture.componentGallery, surfaceRuntime: surface
    });
    const textured = new Map(fixture.buildingRuntime.renderables.map(object => [object, object.material]));
    const composed = fixture.buildingRuntime.renderables.find(object => object.material.userData.pixelContentHash)!;
    expect(composed).toBeDefined();
    const compositeMaterial = composed.material, texture = compositeMaterial.map;
    const materialDispose = vi.spyOn(compositeMaterial, "dispose"), textureDispose = vi.spyOn(texture!, "dispose");
    const renderFrame = vi.fn();
    const rendererFactory = async (): Promise<AssemblyRendererActivation> => {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("data-testid", "assembly-renderer-canvas");
      return {
        activeBackend: "webgl",
        renderer: {
          domElement: canvas,
          dispose: vi.fn(),
          render: renderFrame,
          setPixelRatio: vi.fn(),
          setSize: vi.fn()
        }
      };
    };

    const rendered = render(<AssemblyHall fixture={fixture} rendererFactory={rendererFactory} />);
    unmount = rendered.unmount;

    const viewport = screen.getByRole("application", { name: "Interactive generated building viewer" });
    const canvas = await within(viewport).findByTestId("assembly-renderer-canvas");
    const presentation = screen.getByRole("combobox", { name: "Presentation mode" });
    expect(presentation).toHaveValue("textured");
    expect(canvas).toHaveAttribute("data-presentation-mode", "textured");
    expect(fixture.buildingRuntime.renderables[0].material.name).toContain("building-atlas.");
    expect(composed.material).toBe(compositeMaterial);

    fireEvent.change(presentation, { target: { value: "clay" } });

    await waitFor(() => {
      expect(canvas).toHaveAttribute("data-presentation-mode", "clay");
      expect(fixture.buildingRuntime.renderables[0].material.name).toBe("assembly-hall.clay-inspection");
      expect(composed.material.name).toBe("assembly-hall.clay-inspection");
    });

    fireEvent.change(presentation, { target: { value: "textured" } });

    await waitFor(() => {
      expect(canvas).toHaveAttribute("data-presentation-mode", "textured");
      expect(fixture.buildingRuntime.renderables[0].material.name).toContain("building-atlas.");
      for (const [object, material] of textured) expect(object.material).toBe(material);
      expect(composed.material.map).toBe(texture);
    });
    expect(materialDispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
    } finally { unmount?.(); fixture.familyRuntime.dispose(); surface.dispose(); }
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

  it("surfaces a Milestone 7 profile packet after both benchmarks run", async () => {
    const fixture = await createAssemblyHallFixture();
    const benchmarkSceneFactory = vi.fn(async () => fakeConstructionBenchmarkSceneFor(fixture));
    const orbitBenchmarkSceneFactory = vi.fn(async () => fakeOrbitBenchmarkSceneFor(fixture));

    render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory()}
        benchmarkSceneFactory={benchmarkSceneFactory}
        orbitBenchmarkSceneFactory={orbitBenchmarkSceneFactory}
      />
    );

    const profilePacket = screen.getByLabelText("Milestone 7 benchmark profile packet");
    expect(profilePacket).toHaveTextContent("Run both benchmark reports to create the profile packet");

    fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));
    expect(await screen.findByText("shared-family-100-building-scene")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run 16-building orbit benchmark" }));
    expect(await screen.findByText("dynamic-building-family-milestone-7-profile")).toBeInTheDocument();

    expect(profilePacket).toHaveTextContent("Frame time");
    expect(profilePacket).toHaveTextContent("measured");
    expect(profilePacket).toHaveTextContent("GPU memory");
    expect(profilePacket).toHaveTextContent("not captured");
    expect(profilePacket).toHaveTextContent("webgl");
    expect(profilePacket).toHaveTextContent("jsdom");
  });

  it("downloads the Milestone 7 profile packet JSON after both benchmarks run", async () => {
    const fixture = await createAssemblyHallFixture();
    const benchmarkSceneFactory = vi.fn(async () => fakeConstructionBenchmarkSceneFor(fixture));
    const orbitBenchmarkSceneFactory = vi.fn(async () => fakeOrbitBenchmarkSceneFor(fixture));
    const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      void blob;
      return "blob:benchmark-profile-packet";
    });
    const revokeObjectURL = vi.fn();
    let downloadedFileName = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadedFileName = this.download;
    });

    try {
      render(
        <AssemblyHall
          fixture={fixture}
          rendererFactory={fakeRendererFactory()}
          benchmarkSceneFactory={benchmarkSceneFactory}
          orbitBenchmarkSceneFactory={orbitBenchmarkSceneFactory}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));
      expect(await screen.findByText("shared-family-100-building-scene")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Run 16-building orbit benchmark" }));
      expect(await screen.findByText("dynamic-building-family-milestone-7-profile")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Download Profile Packet" }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!(blob instanceof Blob)) {
        throw new Error("Expected benchmark profile packet download to create a Blob");
      }
      const payload = JSON.parse(await blob.text());

      expect(blob.type).toBe("application/json");
      expect(payload).toMatchObject({
        schemaVersion: "0.1.0",
        profileKind: "dynamic-building-family-milestone-7-profile",
        familyId: fixture.spec.familyId,
        reports: {
          construction: {
            benchmarkKind: "shared-family-100-building-scene"
          },
          orbit: {
            benchmarkKind: "shared-family-16-building-orbit"
          }
        }
      });
      expect(payload.profileCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "frameTimeMs",
            status: "measured"
          })
        ])
      );
      expect(downloadedFileName).toBe(`${fixture.spec.familyId}-benchmark-profile-packet.json`);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:benchmark-profile-packet");
    } finally {
      click.mockRestore();
      if (previousCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (previousRevokeObjectUrl) {
        Object.defineProperty(URL, "revokeObjectURL", previousRevokeObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });

  it("runs and surfaces the 100-building benchmark report from Assembly Hall", async () => {
    const fixture = await createAssemblyHallFixture();
    const benchmarkSceneFactory = vi.fn(async () => fakeConstructionBenchmarkSceneFor(fixture));

    render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory()}
        benchmarkSceneFactory={benchmarkSceneFactory}
      />
    );

    const benchmarkReport = screen.getByLabelText("100-building benchmark report");
    expect(benchmarkReport).toHaveTextContent("Not run");

    fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));

    expect(await screen.findByText("shared-family-100-building-scene")).toBeInTheDocument();
    expect(benchmarkSceneFactory).toHaveBeenCalledTimes(1);
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
    const windowPath =
      fixture.ir.semanticIndex.find((entry) => entry.batchId === "instances.window")?.semanticPath ??
      `building/${fixture.ir.familyId}/facade/front/floor/0/bay/0/opening/opening.window.arched`;

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), {
      target: { value: windowPath }
    });

    const inspector = screen.getByLabelText("Selected semantic element");
    expect(inspector).toHaveTextContent(windowPath);
    expect(inspector).toHaveTextContent("instances.window");
    expect(inspector).toHaveTextContent("openings");
    expect(inspector).toHaveTextContent("frame.primary");
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
    expect(
      await within(screen.getByRole("application", { name: "Interactive generated building viewer" })).findByTestId(
        "assembly-renderer-canvas"
      )
    ).toBeInTheDocument();
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

function pendingResult<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe("Assembly Hall fixture viewer ownership", () => {
  it("submits the new root and IR buffers when a replacement keeps the same legacy ID", async () => {
    const first = await createAssemblyHallFixture();
    const second = await createAssemblyHallFixture();
    expect(second.ir.buildingId).toBe(first.ir.buildingId);
    expect(second.ir).not.toBe(first.ir);
    expect(second.ir.meshBatches[0].positions).not.toBe(first.ir.meshBatches[0].positions);
    const firstActivation = await fakeRendererFactory()();
    const secondActivation = await fakeRendererFactory()();
    const rendererFactory = vi.fn().mockResolvedValueOnce(firstActivation).mockResolvedValueOnce(secondActivation);
    const releases = new Map<unknown, ReturnType<typeof vi.fn>>();
    const acquire = vi.fn((fixture: typeof first) => {
      expect(fixture.familyRuntime.root.parent).toBeNull();
      const release = vi.fn(() => expect(fixture.familyRuntime.root.parent).toBeNull());
      releases.set(fixture, release);
      return release;
    });
    const view = render(<AssemblyHall fixture={first} rendererFactory={rendererFactory} acquireFixtureViewerLease={acquire} />);
    await waitFor(() => expect(firstActivation.renderer.render).toHaveBeenCalled());
    const firstScene = vi.mocked(firstActivation.renderer.render).mock.calls[0][0] as Scene;
    expect(firstScene.getObjectById(first.familyRuntime.root.id)).toBe(first.familyRuntime.root);
    view.rerender(<AssemblyHall fixture={second} rendererFactory={rendererFactory} acquireFixtureViewerLease={acquire} />);
    await waitFor(() => expect(secondActivation.renderer.render).toHaveBeenCalled());
    const secondScene = vi.mocked(secondActivation.renderer.render).mock.calls[0][0] as Scene;
    expect(secondScene).not.toBe(firstScene);
    expect(secondScene.getObjectById(second.familyRuntime.root.id)).toBe(second.familyRuntime.root);
    expect(secondScene.getObjectById(first.familyRuntime.root.id)).toBeUndefined();
    expect(first.familyRuntime.root.parent).toBeNull();
    expect(releases.get(first)).toHaveBeenCalledTimes(1);
    expect(releases.get(second)).not.toHaveBeenCalled();
    expect(firstActivation.renderer.dispose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(secondActivation.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(releases.get(second)).toHaveBeenCalledTimes(1);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });

  it("keeps an old viewer lease until its late renderer is disposed without disturbing the replacement", async () => {
    const first = await createAssemblyHallFixture();
    const second = await createAssemblyHallFixture();
    const pending = pendingResult<AssemblyRendererActivation>();
    const late = await fakeRendererFactory()();
    const current = await fakeRendererFactory()();
    const events: string[] = [];
    vi.mocked(late.renderer.dispose).mockImplementation(() => { events.push("late renderer disposed"); });
    const releaseFirst = vi.fn(() => { events.push("old lease released"); });
    const releaseSecond = vi.fn();
    const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
    const rendererFactory = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current);
    const view = render(<AssemblyHall fixture={first} rendererFactory={rendererFactory} acquireFixtureViewerLease={acquire} />);
    expect(first.familyRuntime.root.parent).not.toBeNull();
    view.rerender(<AssemblyHall fixture={second} rendererFactory={rendererFactory} acquireFixtureViewerLease={acquire} />);
    await waitFor(() => expect(current.renderer.render).toHaveBeenCalled());
    const currentScene = second.familyRuntime.root.parent;
    expect(first.familyRuntime.root.parent).toBeNull();
    expect(releaseFirst).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(late); await pending.promise; });
    expect(events).toEqual(["late renderer disposed", "old lease released"]);
    expect(late.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(late.renderer.domElement.isConnected).toBe(false);
    expect(second.familyRuntime.root.parent).toBe(currentScene);
    expect(current.renderer.domElement.isConnected).toBe(true);
    expect(current.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseSecond).not.toHaveBeenCalled();
    view.unmount();
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(releaseSecond).toHaveBeenCalledTimes(1);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });

  it("releases an unmounted viewer after a pending renderer rejects", async () => {
    const fixture = await createAssemblyHallFixture();
    const pending = pendingResult<AssemblyRendererActivation>();
    const release = vi.fn();
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={() => pending.promise} acquireFixtureViewerLease={() => release} />);
    view.unmount();
    expect(fixture.familyRuntime.root.parent).toBeNull();
    expect(release).not.toHaveBeenCalled();
    await act(async () => { pending.reject(new Error("late renderer rejection")); await pending.promise.catch(() => undefined); });
    expect(release).toHaveBeenCalledTimes(1);
    fixture.familyRuntime.dispose();
  });

  it("detaches and releases immediately when renderer initialization fails", async () => {
    const fixture = await createAssemblyHallFixture();
    const release = vi.fn();
    const rendererFactory = vi.fn().mockRejectedValue(new Error("renderer initialization failed"));
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={rendererFactory} acquireFixtureViewerLease={() => release} />);
    await waitFor(() => expect(screen.getByText("renderer initialization failed")).toBeInTheDocument());
    expect(fixture.familyRuntime.root.parent).toBeNull();
    expect(release).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
    fixture.familyRuntime.dispose();
  });

  it("retains the replayed StrictMode viewer while the first factory settles", async () => {
    const fixture = await createAssemblyHallFixture();
    const firstActivation = await fakeRendererFactory()();
    const secondActivation = await fakeRendererFactory()();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquire = vi.fn().mockReturnValueOnce(firstRelease).mockReturnValueOnce(secondRelease).mockReturnValueOnce(vi.fn());
    const rendererFactory = vi.fn().mockResolvedValueOnce(firstActivation).mockResolvedValueOnce(secondActivation);
    const benchmarkSceneFactory = vi.fn(async () => fakeConstructionBenchmarkSceneFor(fixture));
    const view = render(<StrictMode><AssemblyHall fixture={fixture} rendererFactory={rendererFactory} acquireFixtureViewerLease={acquire} benchmarkSceneFactory={benchmarkSceneFactory} /></StrictMode>);
    await waitFor(() => expect(secondActivation.renderer.render).toHaveBeenCalled());
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(firstActivation.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(firstRelease).toHaveBeenCalledTimes(1);
    expect(secondRelease).not.toHaveBeenCalled();
    const currentScene = vi.mocked(secondActivation.renderer.render).mock.calls[0][0] as Scene;
    expect(fixture.familyRuntime.root.parent).toBe(currentScene);
    expect(screen.getAllByTestId("assembly-renderer-canvas")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Run 100-building benchmark" }));
    await waitFor(() => expect(screen.getByLabelText("100-building benchmark report")).toBeInTheDocument());
    view.unmount();
    expect(secondRelease).toHaveBeenCalledTimes(1);
    expect(secondActivation.renderer.dispose).toHaveBeenCalledTimes(1);
    fixture.familyRuntime.dispose();
  });

  it.each(["construction", "orbit"] as const)("retains the %s benchmark lease until an abort-ignoring factory is disposed", async (mode) => {
    const fixture = await createAssemblyHallFixture();
    type ConstructionScene = Awaited<ReturnType<NonNullable<AssemblyHallProps["benchmarkSceneFactory"]>>>;
    type OrbitScene = Awaited<ReturnType<NonNullable<AssemblyHallProps["orbitBenchmarkSceneFactory"]>>>;
    const pendingConstruction = pendingResult<ConstructionScene>();
    const pendingOrbit = pendingResult<OrbitScene>();
    const constructionFactory = vi.fn((options: Parameters<NonNullable<AssemblyHallProps["benchmarkSceneFactory"]>>[0]) => { void options; return pendingConstruction.promise; });
    const orbitFactory = vi.fn((options: Parameters<NonNullable<AssemblyHallProps["orbitBenchmarkSceneFactory"]>>[0]) => { void options; return pendingOrbit.promise; });
    const events: string[] = [];
    const releaseViewer = vi.fn();
    const releaseBenchmark = vi.fn(() => { events.push("benchmark lease released"); });
    const acquire = vi.fn().mockReturnValueOnce(releaseViewer).mockReturnValueOnce(releaseBenchmark);
    const view = render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} acquireFixtureViewerLease={acquire} benchmarkSceneFactory={constructionFactory} orbitBenchmarkSceneFactory={orbitFactory} />);
    await waitFor(() => expect(screen.getByTestId("assembly-renderer-canvas")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: mode === "construction" ? "Run 100-building benchmark" : "Run 16-building orbit benchmark" }));
    expect(acquire).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(releaseViewer).toHaveBeenCalledTimes(1);
    expect(releaseBenchmark).not.toHaveBeenCalled();
    if (mode === "construction") {
      expect(constructionFactory.mock.calls[0][0].signal?.aborted).toBe(true);
      const result = fakeConstructionBenchmarkSceneFor(fixture) as ConstructionScene;
      vi.mocked(result.familyRuntime.dispose).mockImplementation(() => {
        events.push("benchmark runtime disposed");
        return { buildingRuntimesDisposed: 0, geometriesDisposed: 0, materialsDisposed: 0, texturesDisposed: 0 };
      });
      await act(async () => { pendingConstruction.resolve(result); await pendingConstruction.promise; });
      expect(result.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    } else {
      expect(orbitFactory.mock.calls[0][0].signal?.aborted).toBe(true);
      const result = fakeOrbitBenchmarkSceneFor(fixture) as OrbitScene;
      vi.mocked(result.familyRuntime.dispose).mockImplementation(() => {
        events.push("benchmark runtime disposed");
        return { buildingRuntimesDisposed: 0, geometriesDisposed: 0, materialsDisposed: 0, texturesDisposed: 0 };
      });
      await act(async () => { pendingOrbit.resolve(result); await pendingOrbit.promise; });
      expect(result.familyRuntime.dispose).toHaveBeenCalledTimes(1);
    }
    expect(events).toEqual(["benchmark runtime disposed", "benchmark lease released"]);
    expect(releaseBenchmark).toHaveBeenCalledTimes(1);
    fixture.familyRuntime.dispose();
  });
});

function hallViewerSubscription() {
  let prepare!: BuildingFixtureViewerPreparer;
  const unregister = vi.fn();
  const register = vi.fn((next: BuildingFixtureViewerPreparer) => { prepare = next; return unregister; });
  return { register, unregister, get prepare() { return prepare; } };
}
describe("Assembly Hall staged renderer handoff", () => {
  it("keeps the old valid canvas and root when a candidate renderer rejects", async () => {
    const first = await createAssemblyHallFixture();
    const second = await createAssemblyHallFixture();
    const initial = await fakeRendererFactory()();
    const next = pendingResult<AssemblyRendererActivation>();
    const releaseFirst = vi.fn(); const releaseSecond = vi.fn();
    const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
    const factory = vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(next.promise);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
    await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
    const scene = first.familyRuntime.root.parent;
    const failed = subscription.prepare(second, { signal: new AbortController().signal }).catch((error: unknown) => error);
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(first.familyRuntime.root.parent).toBe(scene);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseFirst).not.toHaveBeenCalled();
    const error = new Error("candidate renderer failed");
    await act(async () => { next.reject(error); expect(await failed).toBe(error); });
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(first.familyRuntime.root.parent).toBe(scene);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseFirst).not.toHaveBeenCalled();
    expect(second.familyRuntime.root.parent).toBeNull();
    expect(releaseSecond).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(subscription.unregister).toHaveBeenCalledTimes(1);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });
  it("rolls a temporary viewer commit back without disposing the last valid view", async () => {
    const first = await createAssemblyHallFixture(); const second = await createAssemblyHallFixture();
    const initial = await fakeRendererFactory()(); const next = await fakeRendererFactory()();
    const releaseFirst = vi.fn(); const releaseSecond = vi.fn();
    const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
    const factory = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(next);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
    await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
    const oldScene = first.familyRuntime.root.parent;
    let prepared!: PreparedBuildingFixtureView;
    await act(async () => { prepared = await subscription.prepare(second, { signal: new AbortController().signal }); });
    expect(next.renderer.render).toHaveBeenCalled();
    expect(next.renderer.domElement.isConnected).toBe(false);
    expect(initial.renderer.domElement.isConnected).toBe(true);
    let finalize!: () => void;
    act(() => { finalize = prepared.commit(); });
    expect(next.renderer.domElement.isConnected).toBe(true);
    expect(initial.renderer.domElement.isConnected).toBe(false);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseFirst).not.toHaveBeenCalled();
    act(() => { prepared.discard(); });
    expect(first.familyRuntime.root.parent).toBe(oldScene);
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(next.renderer.domElement.isConnected).toBe(false);
    expect(next.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(second.familyRuntime.root.parent).toBeNull();
    expect(releaseSecond).toHaveBeenCalledTimes(1);
    finalize();
    expect(releaseFirst).not.toHaveBeenCalled();
    view.unmount();
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });
  it("finalizes a successful handoff once and does not rebuild after the committed prop arrives", async () => {
    const first = await createAssemblyHallFixture(); const second = await createAssemblyHallFixture();
    const initial = await fakeRendererFactory()(); const next = await fakeRendererFactory()();
    const releaseFirst = vi.fn(); const releaseSecond = vi.fn();
    const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
    const factory = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(next);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
    await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
    let prepared!: PreparedBuildingFixtureView;
    await act(async () => { prepared = await subscription.prepare(second, { signal: new AbortController().signal }); });
    let finalize!: () => void;
    act(() => { finalize = prepared.commit(); });
    expect(releaseFirst).not.toHaveBeenCalled();
    finalize(); finalize();
    expect(initial.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(first.familyRuntime.root.parent).toBeNull();
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    view.rerender(<AssemblyHall fixture={second} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(subscription.register).toHaveBeenCalledTimes(1);
    prepared.discard();
    expect(next.renderer.domElement.isConnected).toBe(true);
    expect(next.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseSecond).not.toHaveBeenCalled();
    view.unmount();
    expect(next.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(releaseSecond).toHaveBeenCalledTimes(1);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });
  it("detaches its provider on unmount and releases a pending candidate only after late renderer disposal", async () => {
    const first = await createAssemblyHallFixture(); const second = await createAssemblyHallFixture();
    const initial = await fakeRendererFactory()(); const late = await fakeRendererFactory()();
    const pending = pendingResult<AssemblyRendererActivation>(); const events: string[] = [];
    vi.mocked(late.renderer.dispose).mockImplementation(() => { events.push("late renderer disposed"); });
    const releaseFirst = vi.fn(); const releaseSecond = vi.fn(() => { events.push("candidate lease released"); });
    const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
    const factory = vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(pending.promise);
    const subscription = hallViewerSubscription();
    const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
    await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
    const abandoned = subscription.prepare(second, { signal: new AbortController().signal }).catch((error: unknown) => error);
    expect(initial.renderer.domElement.isConnected).toBe(true);
    view.unmount();
    expect(subscription.unregister).toHaveBeenCalledTimes(1);
    expect(initial.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(releaseSecond).not.toHaveBeenCalled();
    expect(second.familyRuntime.root.parent).toBeNull();
    await act(async () => { pending.resolve(late); await pending.promise; });
    expect(await abandoned).toMatchObject({ name: "AbortError" });
    expect(events).toEqual(["late renderer disposed", "candidate lease released"]);
    expect(late.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(late.renderer.domElement.isConnected).toBe(false);
    first.familyRuntime.dispose(); second.familyRuntime.dispose();
  });
});

it("attempts every owned cleanup before releasing the old lease when a disposer throws", async () => {
  const first = await createAssemblyHallFixture(); const second = await createAssemblyHallFixture();
  const initial = await fakeRendererFactory()(); const next = await fakeRendererFactory()();
  const events: string[] = [];
  vi.mocked(initial.renderer.dispose).mockImplementation(() => { events.push("renderer disposed"); });
  const releaseFirst = vi.fn(() => { events.push("old lease released"); });
  const releaseSecond = vi.fn();
  const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
  const factory = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(next);
  const subscription = hallViewerSubscription();
  const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
  await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
  const oldScene = first.familyRuntime.root.parent as Scene;
  const ground = oldScene.children.find((child): child is Mesh => child instanceof Mesh && child.geometry.type === "PlaneGeometry");
  if (!ground || Array.isArray(ground.material)) throw new Error("Expected the viewer-owned ground mesh");
  const disposeGround = ground.geometry.dispose.bind(ground.geometry);
  const failure = new Error("ground disposal failed");
  const geometryDispose = vi.spyOn(ground.geometry, "dispose").mockImplementationOnce(() => {
    disposeGround();
    events.push("ground disposed");
    throw failure;
  });
  const materialDispose = vi.spyOn(ground.material, "dispose");
  let prepared!: PreparedBuildingFixtureView;
  await act(async () => { prepared = await subscription.prepare(second, { signal: new AbortController().signal }); });
  let finalize!: () => void;
  act(() => { finalize = prepared.commit(); });
  expect(() => finalize()).toThrow(failure);
  expect(events).toEqual(["ground disposed", "renderer disposed", "old lease released"]);
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  expect(materialDispose).toHaveBeenCalledTimes(1);
  expect(initial.renderer.dispose).toHaveBeenCalledTimes(1);
  expect(initial.renderer.domElement.isConnected).toBe(false);
  expect(first.familyRuntime.root.parent).toBeNull();
  expect(next.renderer.domElement.isConnected).toBe(true);
  expect(next.renderer.dispose).not.toHaveBeenCalled();
  finalize();
  expect(releaseFirst).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(releaseSecond).toHaveBeenCalledTimes(1);
  geometryDispose.mockRestore(); materialDispose.mockRestore();
  first.familyRuntime.dispose(); second.familyRuntime.dispose();
});

it("contains disposer errors during abort events while preserving the active view", async () => {
  const first = await createAssemblyHallFixture(); const second = await createAssemblyHallFixture();
  const initial = await fakeRendererFactory()(); const next = await fakeRendererFactory()();
  const events: string[] = [];
  vi.mocked(next.renderer.dispose).mockImplementation(() => { events.push("candidate renderer disposed"); });
  const releaseFirst = vi.fn();
  const releaseSecond = vi.fn(() => { events.push("candidate lease released"); });
  const acquire = vi.fn((fixture: typeof first) => fixture === first ? releaseFirst : releaseSecond);
  const factory = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(next);
  const subscription = hallViewerSubscription();
  const view = render(<AssemblyHall fixture={first} rendererFactory={factory} acquireFixtureViewerLease={acquire} registerFixtureViewer={subscription.register} />);
  await waitFor(() => expect(subscription.register).toHaveBeenCalledTimes(1));
  const abort = new window.AbortController();
  let prepared!: PreparedBuildingFixtureView;
  await act(async () => { prepared = await subscription.prepare(second, { signal: abort.signal }); });
  const candidateScene = second.familyRuntime.root.parent as Scene;
  const ground = candidateScene.children.find((child): child is Mesh => child instanceof Mesh && child.geometry.type === "PlaneGeometry");
  if (!ground || Array.isArray(ground.material)) throw new Error("Expected the candidate-owned ground mesh");
  const disposeGround = ground.geometry.dispose.bind(ground.geometry);
  const geometryDispose = vi.spyOn(ground.geometry, "dispose").mockImplementationOnce(() => {
    disposeGround();
    events.push("candidate ground disposed");
    throw new Error("aborted ground disposal failed");
  });
  const materialDispose = vi.spyOn(ground.material, "dispose");
  const pageErrors: ErrorEvent[] = [];
  const onError = (event: ErrorEvent) => { pageErrors.push(event); event.preventDefault(); };
  window.addEventListener("error", onError);
  try {
    act(() => { abort.abort(); });
    expect(pageErrors).toEqual([]);
    expect(events).toEqual(["candidate ground disposed", "candidate renderer disposed", "candidate lease released"]);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(next.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(second.familyRuntime.root.parent).toBeNull();
    expect(initial.renderer.domElement.isConnected).toBe(true);
    expect(initial.renderer.dispose).not.toHaveBeenCalled();
    expect(releaseFirst).not.toHaveBeenCalled();
    expect(() => prepared.commit()).toThrow(/cancelled/);
    prepared.discard();
    expect(releaseSecond).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener("error", onError);
    geometryDispose.mockRestore(); materialDispose.mockRestore();
    view.unmount(); first.familyRuntime.dispose(); second.familyRuntime.dispose();
  }
});
