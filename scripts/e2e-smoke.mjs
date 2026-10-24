import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { createServer } from "vite";
import { z } from "zod";

/* global document, HTMLCanvasElement, window */

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function decodePng(buffer) {
  for (let index = 0; index < pngSignature.length; index += 1) {
    if (buffer[index] !== pngSignature[index]) {
      throw new Error("Screenshot probe expected a PNG image.");
    }
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format for screenshot probe: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  let inputOffset = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const current = new Uint8Array(stride);

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 0) {
        current[x] = raw;
      } else if (filter === 1) {
        current[x] = (raw + left) & 0xff;
      } else if (filter === 2) {
        current[x] = (raw + up) & 0xff;
      } else if (filter === 3) {
        current[x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        current[x] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter type: ${filter}`);
      }
    }

    inputOffset += stride;
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = current[source];
      pixels[target + 1] = current[source + 1];
      pixels[target + 2] = current[source + 2];
      pixels[target + 3] = channels === 4 ? current[source + 3] : 255;
    }
    previous = current;
  }

  return { width, height, pixels };
}

function screenshotPixelProbe(buffer) {
  const image = decodePng(buffer);
  const pixels = [];

  for (const yRatio of [0.25, 0.4, 0.55, 0.7]) {
    for (const xRatio of [0.25, 0.4, 0.55, 0.7]) {
      const x = Math.max(0, Math.min(image.width - 1, Math.floor(image.width * xRatio)));
      const y = Math.max(0, Math.min(image.height - 1, Math.floor(image.height * yRatio)));
      const offset = (y * image.width + x) * 4;
      pixels.push(Array.from(image.pixels.slice(offset, offset + 4)));
    }
  }

  const opaquePixels = pixels.filter((pixel) => pixel[3] > 16);
  const first = opaquePixels[0] ?? pixels[0];
  const variedSamples = opaquePixels.filter((pixel) =>
    pixel.some((channel, index) => index < 3 && Math.abs(channel - first[index]) > 12)
  ).length;

  return {
    ok: opaquePixels.length >= 4 && variedSamples >= 1,
    variedSamples,
    opaqueSamples: opaquePixels.length,
    pixels
  };
}

const workspaceChannels = ["baseColor", "normal", "orm", "height", "opacity"];
const workspaceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const WorkspaceLayoutSchema = z.object({
  canvasCount: z.literal(1), connected: z.literal(true), rendered: z.literal(true),
  backend: z.enum(["webgpu", "webgl"]), room: z.literal("assemblyHall"),
  canvas: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).strict(),
  viewport: z.object({ width: z.number().positive(), height: z.number().positive() }).strict(),
  noHorizontalOverflow: z.literal(true)
}).strict();
const WorkspaceSourceStepSchema = z.object({
  name: z.enum(["before", "floor", "bay", "roof", "reopened"]),
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0"]),
  revision: z.number().int().nonnegative(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  controls: z.object({ floorCount: z.number().int(), bayCount: z.number().int(), roofType: z.enum(["flat", "gable"]) }).strict()
}).strict();
const WorkspaceGeometrySchema = z.object({
  floorCount: z.number().int().positive(), bayCount: z.number().int().positive(), roofType: z.enum(["flat", "gable"]),
  buildingId: z.string().min(1), sourceGraphHash: z.string().min(1),
  irSha256: z.string().regex(/^[a-f0-9]{64}$/), meshBatchCount: z.number().int().positive(),
  instanceBatchCount: z.number().int().positive(), semanticEntryCount: z.number().int().positive(),
  typedArrayCount: z.number().int().positive(), typedViewBytes: z.number().int().positive()
}).strict();
const WorkspaceFrustumSchema = z.object({
  drawSequence: z.number().int().positive(), buildingId: z.string().min(1), sourceGraphHash: z.string().min(1),
  bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }).strict(),
  aspect: z.number().positive(), projectionMatrix: z.array(z.number()).length(16), cameraWorldInverse: z.array(z.number()).length(16),
  corners: z.array(z.object({ x: z.number(), y: z.number(), z: z.number(), depth: z.number().positive() }).strict()).length(8),
  withinFrustum: z.literal(true)
}).strict();
const SelectedWindowSchema = z.object({
  semanticPath: z.string().min(1), instanceIndex: z.number().int().nonnegative(), elementIndex: z.number().int().nonnegative().nullable(),
  objectUuid: z.string().min(1), objectCount: z.number().int().positive(), markerUuid: z.string().min(1),
  min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]),
  markerBoundsMatch: z.literal(true), outsideFamilyRoot: z.literal(true),
  canvasCount: z.literal(1)
}).strict();
const WorkspaceWorkflowSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p1-window-selection-e2e"),
  documentId: z.literal("e2e-family-doc"), steps: z.array(WorkspaceSourceStepSchema).length(5),
  materials: z.object({
    metadataEqual: z.literal(true), rawBytesEqual: z.literal(true),
    channels: z.array(z.object({ name: z.enum(workspaceChannels), widthPx: z.number().int().positive(), heightPx: z.number().int().positive(), byteLength: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(5)
  }).strict(),
  source: z.object({ codecValidated: z.literal(true), reopenedLiteralBytesEqual: z.literal(true), restoredControls: z.literal(true) }).strict(),
  disclosures: z.object({ labels: z.array(z.string()).length(5), initiallyClosed: z.literal(true), keyboardToggled: z.literal(true), runCallsDuringToggles: z.literal(0) }).strict(),
  runs: z.object({ started: z.literal(4), finished: z.literal(4), opensStarted: z.literal(1), opensFinished: z.literal(1) }).strict(),
  geometry: z.object({ acceptedRuns: z.array(WorkspaceGeometrySchema).length(4), reopened: WorkspaceGeometrySchema, reopenedIrExactlyEqual: z.literal(true) }).strict(),
  cameraChecks: z.array(z.object({ name: z.enum(["desktop-before", "desktop-after", "desktop-reopened", "compact", "compact-reset"]), actualDraw: WorkspaceFrustumSchema }).strict()).length(5),
  selection: z.object({
    pointer: SelectedWindowSchema, keyboard: SelectedWindowSchema, compact: SelectedWindowSchema,
    orbitCameraChanged: z.literal(true), orbitPreservedSelection: z.literal(true),
    sourceLiteralUnchanged: z.literal(true), allFiveMaterialChannelsUnchanged: z.literal(true), generationCallsDelta: z.literal(0)
  }).strict(),
  layouts: z.array(z.object({ name: z.enum(["desktop-before", "desktop-after", "desktop-reopened", "compact"]), layout: WorkspaceLayoutSchema }).strict()).length(4),
  captures: z.array(z.object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive() }).strict()).max(6)
}).strict();

async function workspaceReady(page) {
  await page.waitForFunction(() => {
    const canvases = document.querySelectorAll('canvas[aria-label="Assembly Hall Three.js canvas"]');
    const canvas = canvases[0];
    return document.querySelector('[aria-label="Workspace run status"]')?.textContent.includes("Building ready") &&
      canvases.length === 1 && canvas instanceof HTMLCanvasElement && canvas.isConnected && canvas.dataset.rendered === "true";
  }, undefined, { timeout: 30000 });
}

async function workspaceDownload(page, sourceCodec) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  const download = await downloading;
  const filePath = await download.path();
  assert.ok(filePath, "Source Save must create an actual download");
  const bytes = await readFile(filePath);
  const decoded = await sourceCodec.parseBuildingSourceFile(JSON.parse(bytes.toString("utf8")));
  return { bytes, decoded };
}

async function proveWindowSelection(page, sourceCodec, acceptedSource, artifactDir, captures) {
  const beforeDesktop = await page.evaluate(() => window.__buildoWorkspaceProbe.drawSequence);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await workspaceReady(page);
  await page.waitForFunction((sequence) => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]'), fit = window.__buildoWorkspaceProbe.frustum;
    return fit?.drawSequence > sequence && Math.abs(fit.aspect - canvas.parentElement.clientWidth / Math.max(320, canvas.parentElement.clientHeight)) < 0.000001;
  }, beforeDesktop);
  await page.evaluate(() => window.scrollTo(0, 0));
  const runsBefore = await page.evaluate(() => window.__buildoWorkspaceProbe.started);
  const target = await page.evaluate(async () => {
    const { Raycaster, Vector2 } = await import("/node_modules/.vite/deps/three.js");
    const { resolveWindowSelectionFromSemanticPath, resolveWindowSelectionFromIntersections } = await import("/src/features/building-family/renderer-three/buildingSceneAdapter.ts");
    const { fixture, camera, scene } = window.__buildoSelectionProbe;
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect(), raycaster = new Raycaster();
    for (const entry of fixture.ir.semanticIndex) {
      if (entry.batchId !== "instances.window" && entry.batchId !== "instances.window.glass") continue;
      const candidate = resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, entry.semanticPath);
      if (!candidate) continue;
      const center = candidate.bounds.getCenter(camera.position.clone());
      for (const ratio of [0.5, 0.3, 0.7]) {
        const world = center.clone();
        world.x = candidate.bounds.min.x + (candidate.bounds.max.x - candidate.bounds.min.x) * ratio;
        const ndc = world.project(camera);
        if (Math.abs(ndc.x) >= 0.95 || Math.abs(ndc.y) >= 0.95 || Math.abs(ndc.z) >= 1) continue;
        raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
        const selection = resolveWindowSelectionFromIntersections(fixture.buildingRuntime, fixture.catalog, raycaster.intersectObject(fixture.buildingRuntime.root, true));
        if (selection) return {
          semanticPath: selection.semanticPath, instanceIndex: selection.instanceIndex,
          objectUuid: selection.object.uuid, x: rect.x + (ndc.x + 1) * rect.width / 2, y: rect.y + (1 - ndc.y) * rect.height / 2
        };
      }
    }
    throw new Error("No real visible window-instance ray was available for pointer selection.");
  });
  await page.mouse.click(target.x, target.y);
  await page.getByLabel("Window selection", { exact: true }).getByText(/Selected window #/).waitFor({ state: "visible" });
  const viewControls = page.locator("summary").filter({ hasText: /^View controls$/ });
  await viewControls.click();
  const dropdown = page.getByLabel("Semantic element", { exact: true });
  assert.equal(await dropdown.inputValue(), target.semanticPath);
  async function selectedReceipt(expectedPath) {
    await page.waitForFunction((semanticPath) => window.__buildoSelectionProbe.scene.getObjectByName("assembly-hall.window-selection")?.userData.semanticPath === semanticPath, expectedPath);
    return SelectedWindowSchema.parse(await page.evaluate(async (semanticPath) => {
      const { resolveWindowSelectionFromSemanticPath } = await import("/src/features/building-family/renderer-three/buildingSceneAdapter.ts");
      const { fixture, scene } = window.__buildoSelectionProbe;
      const selection = resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, semanticPath);
      if (!selection) throw new Error("UI selection no longer resolves to its exact current instance.");
      const marker = scene.getObjectByName("assembly-hall.window-selection");
      if (!marker?.visible || marker.parent !== scene || marker.userData.selectionObjectUuid !== selection.object.uuid || marker.userData.instanceIndex !== selection.instanceIndex) throw new Error("Highlight is not bound to the actual selected current instance.");
      const native = selection.object.matrix.clone();
      selection.object.getMatrixAt(selection.instanceIndex, native);
      const positions = selection.object.geometry.getAttribute("position");
      if (!positions?.count) throw new Error("Selected native instance has no actual position vertices.");
      const expected = selection.bounds.clone().makeEmpty(), point = selection.object.position.clone();
      const worldNative = selection.object.matrixWorld.clone().multiply(native);
      for (let index = 0; index < positions.count; index += 1) expected.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(worldNative));
      marker.updateMatrixWorld(true); marker.geometry.computeBoundingBox();
      const drawn = marker.geometry.boundingBox.clone().applyMatrix4(marker.matrixWorld);
      const equal = (a, b) => a.toArray().every((number, index) => Math.abs(number - b.toArray()[index]) < 0.0000001);
      const match = equal(marker.box.min, expected.min) && equal(marker.box.max, expected.max) && equal(drawn.min, expected.min) && equal(drawn.max, expected.max);
      if (!match) throw new Error("Visible highlight geometry differs from native instance/world bounds.");
      return { semanticPath, instanceIndex: selection.instanceIndex, elementIndex: selection.elementIndex ?? null, objectUuid: selection.object.uuid, objectCount: selection.object.count,
        markerUuid: marker.uuid, min: expected.min.toArray(), max: expected.max.toArray(), markerBoundsMatch: match,
        outsideFamilyRoot: !fixture.familyRuntime.root.getObjectById(marker.id), canvasCount: document.querySelectorAll('canvas[aria-label="Assembly Hall Three.js canvas"]').length };
    }, expectedPath));
  }
  const pointer = await selectedReceipt(target.semanticPath);
  assert.equal(pointer.objectUuid, target.objectUuid); assert.equal(pointer.instanceIndex, target.instanceIndex);
  await viewControls.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const orbitPoint = await page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + rect.width * 0.5, y: rect.y + Math.min(rect.height * 0.5, window.innerHeight - rect.y - 40) };
  });
  const beforeOrbit = await page.evaluate(() => [...window.__buildoSelectionProbe.camera.matrixWorld.elements]);
  await page.mouse.move(orbitPoint.x, orbitPoint.y); await page.mouse.down();
  await page.mouse.move(orbitPoint.x + 70, orbitPoint.y + 22, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction((before) => window.__buildoSelectionProbe.camera.matrixWorld.elements.some((value, index) => Math.abs(value - before[index]) > 0.000001), beforeOrbit);
  assert.equal(await dropdown.inputValue(), target.semanticPath);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await viewControls.click();
  const keyboardTarget = await dropdown.evaluate(async (select, pointerPath) => {
    const { resolveWindowSelectionFromSemanticPath } = await import("/src/features/building-family/renderer-three/buildingSceneAdapter.ts");
    const { fixture } = window.__buildoSelectionProbe;
    for (let index = 1; index < select.options.length; index += 1) {
      const semanticPath = select.options[index].value;
      if (semanticPath !== pointerPath && resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, semanticPath)) return { previous: select.options[index - 1].value, semanticPath };
    }
    throw new Error("No native keyboard-next window option was available.");
  }, target.semanticPath);
  await dropdown.selectOption(keyboardTarget.previous);
  await dropdown.focus(); await dropdown.press("ArrowDown");
  assert.equal(await dropdown.inputValue(), keyboardTarget.semanticPath);
  const keyboard = await selectedReceipt(keyboardTarget.semanticPath);
  assert.equal(keyboard.markerUuid, pointer.markerUuid);
  await viewControls.click();
  async function captureSelected(name) {
    await page.evaluate(() => window.scrollTo(0, 0));
    if (artifactDir) {
      const bytes = await page.screenshot({ fullPage: true }), file = `${name}.png`;
      await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
      captures.push({ file, sha256: workspaceHash(bytes), byteLength: bytes.length });
    }
  }
  await captureSelected("selected-desktop");
  const beforeResize = await page.evaluate(() => window.__buildoWorkspaceProbe.drawSequence);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction((sequence) => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]'), fit = window.__buildoWorkspaceProbe.frustum;
    return fit?.drawSequence > sequence && Math.abs(fit.aspect - canvas.parentElement.clientWidth / Math.max(320, canvas.parentElement.clientHeight)) < 0.000001;
  }, beforeResize);
  const compact = await selectedReceipt(keyboardTarget.semanticPath);
  assert.deepEqual(compact, keyboard);
  await captureSelected("selected-compact");
  const afterSelection = await workspaceDownload(page, sourceCodec);
  assert.deepEqual(afterSelection.bytes, acceptedSource.bytes, "Transient selection must preserve literal source Save bytes");
  assert.equal(JSON.stringify(afterSelection.decoded.file.materials), JSON.stringify(acceptedSource.decoded.file.materials));
  for (const name of workspaceChannels) assert.deepEqual(Buffer.from(afterSelection.decoded.packedAtlas.channels[name].data), Buffer.from(acceptedSource.decoded.packedAtlas.channels[name].data));
  const generationCallsDelta = await page.evaluate((before) => window.__buildoWorkspaceProbe.started - before, runsBefore);
  assert.equal(generationCallsDelta, 0);
  return { pointer, keyboard, compact, orbitCameraChanged: true, orbitPreservedSelection: true, sourceLiteralUnchanged: true, allFiveMaterialChannelsUnchanged: true, generationCallsDelta };
}

async function proveContinuousWorkspace(page, sourceCodec, artifactDir) {
  if (artifactDir) await mkdir(artifactDir);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await workspaceReady(page);
  await page.evaluate(async () => {
    const { BuildingRunController } = await import("/src/features/building-family/state/buildingRunController.ts");
    const probe = { started: 0, finished: 0, opensStarted: 0, opensFinished: 0, acceptedRuns: [], acceptedOpens: [], roofIr: undefined, reopenedIrExactlyEqual: false, drawSequence: 0, frustum: undefined };
    window.__buildoWorkspaceProbe = probe;
    const observedMeshes = new WeakSet();
    const acquire = BuildingRunController.prototype.acquireFixtureViewerLease;
    BuildingRunController.prototype.acquireFixtureViewerLease = function (fixture) {
      const release = acquire.call(this, fixture);
      const bounds = { min: [...fixture.ir.bounds.min], max: [...fixture.ir.bounds.max] };
      fixture.buildingRuntime.root.traverse((object) => {
        if (!object.isMesh || observedMeshes.has(object)) return;
        observedMeshes.add(object);
        const original = object.onBeforeRender;
        object.onBeforeRender = function (...args) {
          const returned = original.apply(this, args);
          const [renderer, scene, camera] = args;
          const canvas = renderer.domElement;
          if (camera.isPerspectiveCamera && canvas?.isConnected && canvas.getAttribute("aria-label") === "Assembly Hall Three.js canvas") {
            window.__buildoSelectionProbe = { fixture, camera, scene };
            const corners = [];
            for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
              const world = fixture.buildingRuntime.root.localToWorld(camera.position.clone().set(x, y, z));
              const depth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z;
              const ndc = world.project(camera);
              corners.push({ x: ndc.x, y: ndc.y, z: ndc.z, depth });
            }
            probe.frustum = {
              drawSequence: ++probe.drawSequence, buildingId: fixture.ir.buildingId, sourceGraphHash: fixture.ir.sourceGraphHash,
              bounds, aspect: camera.aspect, projectionMatrix: [...camera.projectionMatrix.elements], cameraWorldInverse: [...camera.matrixWorldInverse.elements], corners,
              withinFrustum: corners.every((corner) => Object.values(corner).every(Number.isFinite) && Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1 && Math.abs(corner.z) < 1 && corner.depth > 0)
            };
          }
          return returned;
        };
      });
      return release;
    };
    async function acceptedGeometry(result, opening) {
      if (result.stale) return result;
      if (!result.fixture) throw new Error("Accepted workspace operation did not expose its fixture.");
      const { ir, spec } = result.fixture;
      let typedArrayCount = 0, typedViewBytes = 0;
      function own(value) {
        if (ArrayBuffer.isView(value)) {
          typedArrayCount += 1;
          typedViewBytes += value.byteLength;
          const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          return { type: value.constructor.name, byteLength: value.byteLength, length: value.length, bytes: btoa(binary) };
        }
        if (Array.isArray(value)) return value.map(own);
        if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, own(value[key])]));
        return value;
      }
      // Own every actual typed span plus IR metadata/semantic entries before the hash await.
      const literalIr = JSON.stringify(own(ir));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(literalIr)));
      const receipt = {
        floorCount: spec.massing.floorCount, bayCount: spec.facade.frontBayCount, roofType: spec.massing.roof.type,
        buildingId: ir.buildingId, sourceGraphHash: ir.sourceGraphHash,
        irSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
        meshBatchCount: ir.meshBatches.length, instanceBatchCount: ir.instanceBatches.length,
        semanticEntryCount: ir.semanticIndex.length, typedArrayCount, typedViewBytes
      };
      if (opening) {
        probe.acceptedOpens.push(receipt);
        probe.reopenedIrExactlyEqual = literalIr === probe.roofIr;
      } else {
        probe.acceptedRuns.push(receipt);
        if (probe.acceptedRuns.length === 3) probe.roofIr = literalIr;
      }
      return result;
    }
    const start = BuildingRunController.prototype.startDemoRun;
    BuildingRunController.prototype.startDemoRun = function (...args) {
      probe.started += 1;
      return start.apply(this, args).then((result) => acceptedGeometry(result, false)).finally(() => { probe.finished += 1; });
    };
    const open = BuildingRunController.prototype.openSourceFile;
    BuildingRunController.prototype.openSourceFile = function (...args) {
      probe.opensStarted += 1;
      return open.apply(this, args).then((result) => acceptedGeometry(result, true)).finally(() => { probe.opensFinished += 1; });
    };
  });
  const labels = ["Project info", "Generation details", "View controls", "Renderer diagnostics", "Component gallery and family benchmarks"];
  for (const label of labels.filter((value) => value !== "Renderer diagnostics")) {
    const summary = page.locator("summary").filter({ hasText: new RegExp(`^${label}$`) });
    assert.equal(await summary.count(), 1);
    assert.equal(await summary.evaluate((element) => element.parentElement.open), false);
    await summary.focus();
    await summary.press("Enter");
    assert.equal(await summary.evaluate((element) => element.parentElement.open), true);
    if (label === "View controls") {
      const rendererSummary = page.locator("summary").filter({ hasText: /^Renderer diagnostics$/ });
      assert.equal(await rendererSummary.evaluate((element) => element.parentElement.open), false);
      await rendererSummary.focus();
      await rendererSummary.press("Enter");
      assert.equal(await rendererSummary.evaluate((element) => element.parentElement.open), true);
      await rendererSummary.press("Enter");
      assert.equal(await rendererSummary.evaluate((element) => element.parentElement.open), false);
      assert.equal(await summary.evaluate((element) => element.parentElement.open), true);
      await summary.focus();
    }
    await summary.press("Enter");
    assert.equal(await summary.evaluate((element) => element.parentElement.open), false);
  }
  assert.equal(await page.evaluate(() => window.__buildoWorkspaceProbe.started), 0);
  assert.equal(await page.getByLabel("Floors", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("application", { name: "Interactive generated building viewer" }).count(), 1);
  const baseline = await workspaceDownload(page, sourceCodec);
  assert.deepEqual([baseline.decoded.sourceSnapshot.controlsView.floorCount, baseline.decoded.sourceSnapshot.controlsView.bayCount, baseline.decoded.sourceSnapshot.controlsView.roofType], [4, 7, "flat"]);
  const baselineMaterials = JSON.stringify(baseline.decoded.file.materials);
  const raw = workspaceChannels.map((name) => {
    const channel = baseline.decoded.packedAtlas.channels[name];
    return { name, widthPx: channel.widthPx, heightPx: channel.heightPx, bytes: Buffer.from(channel.data) };
  });
  const steps = [], layouts = [], captures = [], cameraChecks = [];
  function acceptSource(name, saved) {
    assert.equal(saved.decoded.sourceSnapshot.document.documentId, "e2e-family-doc");
    assert.equal(JSON.stringify(saved.decoded.file.materials), baselineMaterials, `${name}: complete material metadata/PNG receipts changed`);
    for (const before of raw) {
      const after = saved.decoded.packedAtlas.channels[before.name];
      assert.equal(after.widthPx, before.widthPx);
      assert.equal(after.heightPx, before.heightPx);
      assert.deepEqual(Buffer.from(after.data), before.bytes, `${name}: ${before.name} RGBA bytes changed`);
    }
    const source = saved.decoded.sourceSnapshot;
    const { floorCount, bayCount, roofType } = source.controlsView;
    steps.push({ name, schemaVersion: source.schemaVersion, revision: source.document.revision, contentHash: saved.decoded.file.contentHash, controls: { floorCount, bayCount, roofType } });
  }
  async function checkFrustum(name, afterDraw) {
    await page.waitForFunction((sequence) => {
      const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
      const fit = window.__buildoWorkspaceProbe.frustum;
      const rect = canvas?.getBoundingClientRect();
      return fit && fit.drawSequence > sequence && rect?.height > 0 && Math.abs(fit.aspect - canvas.parentElement.clientWidth / canvas.parentElement.clientHeight) < 0.000001;
    }, afterDraw, { timeout: 30000 });
    const actualDraw = WorkspaceFrustumSchema.parse(await page.evaluate(() => window.__buildoWorkspaceProbe.frustum));
    cameraChecks.push({ name, actualDraw });
  }
  async function capture(name, afterDraw) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await workspaceReady(page);
    if (afterDraw === undefined) {
      afterDraw = await page.evaluate(() => window.__buildoWorkspaceProbe.drawSequence);
      await page.getByRole("button", { name: "Reset view", exact: true }).click();
    }
    await checkFrustum(name, afterDraw);
    const layout = WorkspaceLayoutSchema.parse(await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas[aria-label="Assembly Hall Three.js canvas"]');
      const canvas = canvases[0];
      const rect = canvas.getBoundingClientRect();
      const room = new URLSearchParams(window.location.hash.slice(1)).get("room");
      return { canvasCount: canvases.length, connected: canvas.isConnected, rendered: canvas.dataset.rendered === "true", backend: canvas.dataset.rendererBackend, room, canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: window.innerWidth, height: window.innerHeight }, noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    }));
    assert.ok(layout.canvas.y >= 0 && layout.canvas.y < layout.viewport.height, `${name}: building canvas must begin above the fold`);
    layouts.push({ name, layout });
    if (artifactDir) {
      const bytes = await page.screenshot({ fullPage: true });
      const file = `${name}.png`;
      await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
      captures.push({ file, sha256: workspaceHash(bytes), byteLength: bytes.length });
    }
  }
  async function runEdit(label, value, expectedRuns) {
    if (label === "Roof Type") await page.getByLabel(label, { exact: true }).selectOption(value);
    else await page.getByLabel(label, { exact: true }).fill(String(value));
    const run = page.getByRole("button", { name: "Run Current", exact: true });
    await run.focus();
    await run.press("Enter");
    await page.waitForFunction((count) => window.__buildoWorkspaceProbe.finished === count, expectedRuns, { timeout: 30000 });
    await workspaceReady(page);
    assert.equal(await page.getByRole("tab", { name: "Assembly Hall", exact: true }).getAttribute("aria-selected"), "true");
    return workspaceDownload(page, sourceCodec);
  }
  acceptSource("before", baseline);
  await capture("desktop-before");
  const floor = await runEdit("Floors", 5, 1);
  assert.equal(floor.decoded.sourceSnapshot.controlsView.floorCount, 5);
  acceptSource("floor", floor);
  const bay = await runEdit("Bays", 8, 2);
  assert.equal(bay.decoded.sourceSnapshot.controlsView.floorCount, 5);
  assert.equal(bay.decoded.sourceSnapshot.controlsView.bayCount, 8);
  acceptSource("bay", bay);
  const roof = await runEdit("Roof Type", "gable", 3);
  assert.deepEqual([roof.decoded.sourceSnapshot.controlsView.floorCount, roof.decoded.sourceSnapshot.controlsView.bayCount, roof.decoded.sourceSnapshot.controlsView.roofType], [5, 8, "gable"]);
  acceptSource("roof", roof);
  await capture("desktop-after");
  const edited = await runEdit("Floors", 6, 4);
  assert.equal(edited.decoded.sourceSnapshot.controlsView.floorCount, 6);
  for (const before of raw) assert.deepEqual(Buffer.from(edited.decoded.packedAtlas.channels[before.name].data), before.bytes);
  assert.equal(JSON.stringify(edited.decoded.file.materials), baselineMaterials);
  await page.getByLabel("Open Source File").setInputFiles({ name: "workspace-source.json", mimeType: "application/json", buffer: roof.bytes });
  await page.waitForFunction(() => window.__buildoWorkspaceProbe.opensFinished === 1, undefined, { timeout: 30000 });
  await workspaceReady(page);
  const reopened = await workspaceDownload(page, sourceCodec);
  assert.deepEqual(reopened.bytes, roof.bytes, "Open then Save must preserve exact accepted source bytes");
  assert.equal(await page.getByLabel("Floors", { exact: true }).inputValue(), "5");
  assert.equal(await page.getByLabel("Bays", { exact: true }).inputValue(), "8");
  assert.equal(await page.getByLabel("Roof Type", { exact: true }).inputValue(), "gable");
  acceptSource("reopened", reopened);
  await capture("desktop-reopened");
  const beforeResize = await page.evaluate(() => window.__buildoWorkspaceProbe.drawSequence);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("compact", beforeResize);
  const beforeReset = await page.evaluate(() => window.__buildoWorkspaceProbe.drawSequence);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await checkFrustum("compact-reset", beforeReset);
  const selection = await proveWindowSelection(page, sourceCodec, reopened, artifactDir, captures);
  const observed = await page.evaluate(() => {
    const { roofIr, ...receipt } = window.__buildoWorkspaceProbe;
    void roofIr;
    return receipt;
  });
  assert.deepEqual(observed.acceptedRuns.map(({ floorCount, bayCount, roofType }) => [floorCount, bayCount, roofType]), [[5, 7, "flat"], [5, 8, "flat"], [5, 8, "gable"], [6, 8, "gable"]]);
  assert.equal(observed.acceptedOpens.length, 1);
  assert.deepEqual(observed.acceptedOpens[0], observed.acceptedRuns[2]);
  assert.equal(observed.reopenedIrExactlyEqual, true, "Actual accepted Open IR typed spans, metadata and semantics must exactly match the saved roof owner");
  assert.equal(captures.length, artifactDir ? 6 : 0);
  const receipt = WorkspaceWorkflowSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-r3-p1-window-selection-e2e", documentId: "e2e-family-doc", steps,
    materials: { metadataEqual: true, rawBytesEqual: true, channels: raw.map(({ name, widthPx, heightPx, bytes }) => ({ name, widthPx, heightPx, byteLength: bytes.length, sha256: workspaceHash(bytes) })) },
    source: { codecValidated: true, reopenedLiteralBytesEqual: true, restoredControls: true },
    disclosures: { labels, initiallyClosed: true, keyboardToggled: true, runCallsDuringToggles: 0 },
    runs: { started: observed.started, finished: observed.finished, opensStarted: observed.opensStarted, opensFinished: observed.opensFinished },
    geometry: { acceptedRuns: observed.acceptedRuns, reopened: observed.acceptedOpens[0], reopenedIrExactlyEqual: observed.reopenedIrExactlyEqual }, cameraChecks, selection, layouts, captures
  });
  if (artifactDir) await writeFile(path.join(artifactDir, "workspace-workflow.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(`R3_P1_WORKSPACE_E2E_RESULT=${JSON.stringify(receipt)}`);
}

const P6HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const P6FileSchema = z.object({ file: z.string().min(1), sha256: P6HashSchema, byteLength: z.number().int().positive() }).strict();
const P6AddressSchema = z.object({
  schemaVersion: z.literal("0.1.0"), facade: z.enum(["front", "rear", "left", "right"]),
  floorIndex: z.number().int().nonnegative(), bayIndex: z.number().int().nonnegative()
}).strict();
const P6DirectiveSchema = z.object({ schemaVersion: z.literal("0.1.0"), address: P6AddressSchema, widthM: z.number().positive() }).strict();
const P6PropertyFlagsSchema = z.object({ enumerable: z.boolean(), configurable: z.boolean(), writable: z.boolean() }).strict();
const P6EncodedValueSchema = z.lazy(() => z.union([
  z.object({ kind: z.literal("undefined") }).strict(),
  z.object({ kind: z.literal("null") }).strict(),
  z.object({ kind: z.literal("string"), value: z.string() }).strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("number"), value: z.number().finite(), negativeZero: z.boolean() }).strict(),
  z.object({ kind: z.literal("object"), prototype: z.enum(["plain", "null"]), entries: z.array(z.tuple([z.string(), P6EncodedValueSchema, P6PropertyFlagsSchema])) }).strict(),
  z.object({ kind: z.literal("array"), length: z.number().int().nonnegative(), entries: z.array(z.tuple([z.string(), P6EncodedValueSchema, P6PropertyFlagsSchema])) }).strict(),
  z.object({
    kind: z.literal("typed"), type: z.enum(["Float32Array", "Uint32Array", "Uint16Array", "Uint8Array", "Uint8ClampedArray"]),
    length: z.number().int().nonnegative(), byteOffset: z.number().int().nonnegative(),
    byteLength: z.number().int().nonnegative(), bufferByteLength: z.number().int().nonnegative(), base64: z.string()
  }).strict().superRefine((value, context) => {
    const stride = value.type === "Uint16Array" ? 2 : ["Float32Array", "Uint32Array"].includes(value.type) ? 4 : 1;
    if (Buffer.from(value.base64, "base64").length !== value.byteLength || value.length * stride !== value.byteLength ||
        value.byteOffset + value.byteLength > value.bufferByteLength) context.addIssue({ code: "custom", message: "Invalid owned typed span." });
  })
]));
const P6DrawSchema = z.object({
  sequence: z.number().int().positive(), canvasCount: z.literal(1), connected: z.literal(true), rendered: z.literal(true),
  backend: z.enum(["webgl", "webgpu"]), rootUuid: z.string().min(1), sourceGraphHash: P6HashSchema,
  withinFrustum: z.literal(true), canvas: z.object({ width: z.number().positive(), height: z.number().positive() }).strict()
}).strict();
const P6NativeInstanceSchema = z.object({
  semanticPath: z.string().min(1), batchId: z.enum(["instances.window", "instances.window.glass"]),
  elementIndex: z.number().int().nonnegative(), instanceIndex: z.number().int().nonnegative(),
  objectUuid: z.string().min(1), geometryUuid: z.string().min(1), vertexCount: z.number().int().positive(),
  drawnSequence: z.number().int().positive(), matrix: z.array(z.number().finite()).length(16), irMatrix: z.array(z.number().finite()).length(16)
}).strict();
const P6SelectionSchema = z.object({
  semanticPath: z.string().min(1), framePath: z.string().min(1), address: P6AddressSchema,
  baseWidthM: z.number().positive(), currentWidthM: z.number().positive(),
  markerBoundsMatch: z.literal(true), outsideFamilyRoot: z.literal(true),
  instances: z.array(P6NativeInstanceSchema).length(2)
}).strict();
const P6CacheRowsSchema = z.array(z.object({
  key: z.string(), artifactType: z.string(), requestHash: z.string(), contentHash: z.string(),
  schemaVersion: z.string(), documentId: z.string().nullable(), sourceGraphHash: z.string().nullable()
}).strict());
const P6CountersSchema = z.object({
  widthStarted: z.number().int().nonnegative(), widthFinished: z.number().int().nonnegative(),
  opensStarted: z.number().int().nonnegative(), opensFinished: z.number().int().nonnegative(),
  runsStarted: z.number().int().nonnegative(), interpreterCalls: z.number().int().nonnegative(),
  providerCalls: z.number().int().nonnegative(), cachePuts: z.number().int().nonnegative(),
  cacheDeletes: z.number().int().nonnegative(), cacheClears: z.number().int().nonnegative()
}).strict();
const P6ProbeSummarySchema = z.object({
  instrumentation: z.enum(["after-ready-before-tested-actions", "before-app-bootstrap"]), ready: z.literal(true), counters: P6CountersSchema,
  widthRequests: z.array(z.object({ expectedSourceContentHash: P6HashSchema, expectedRevision: z.number().int().nonnegative(), directive: P6DirectiveSchema }).strict()),
  cacheBefore: P6CacheRowsSchema, cacheAfter: P6CacheRowsSchema
}).strict();
const P6StepNameSchema = z.enum(["selected-before", "narrowed", "increased", "reopened", "restored", "auto-recovered"]);
const P6StepSchema = z.object({
  name: P6StepNameSchema, sourceVersion: z.enum(["0.3.0", "0.4.0"]), revision: z.number().int().nonnegative(),
  sourceContentHash: P6HashSchema, sourceFileSha256: P6HashSchema, irSha256: P6HashSchema, gallerySha256: P6HashSchema,
  inputsSha256: P6HashSchema, typedSpanCount: z.number().int().positive(), typedSpanBytes: z.number().int().positive(),
  selection: P6SelectionSchema, draw: P6DrawSchema, snapshot: P6FileSchema.nullable()
}).strict();
const P6WidthReceiptSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p6-window-width-e2e"),
  documentId: z.literal("e2e-family-doc"), freshAppExplicitPortableOpen: z.literal(true), automaticRestartPersistenceClaimed: z.literal(false),
  steps: z.array(P6StepSchema).length(5),
  matrixChecks: z.array(z.object({
    name: z.enum(["narrow", "increase", "restore"]), selectedPairs: z.literal(2), unchangedMatrices: z.number().int().positive(),
    expectedRatio: z.number().positive(), actualRatios: z.array(z.number().positive()).length(2)
  }).strict()).length(3),
  materials: z.object({
    fullMetadataEqual: z.literal(true), rawBytesEqual: z.literal(true),
    channels: z.array(z.object({ name: z.enum(workspaceChannels), byteLength: z.number().int().positive(), sha256: P6HashSchema }).strict()).length(5)
  }).strict(),
  comparisons: z.object({
    reopenedSourceLiteralEqual: z.literal(true), reopenedIrExact: z.literal(true), reopenedGalleryExact: z.literal(true),
    restoredIrExact: z.literal(true), restoredGalleryExact: z.literal(true), pinnedInputsExact: z.literal(true)
  }).strict(),
  baselinePage: P6ProbeSummarySchema, freshPage: P6ProbeSummarySchema,
  portableSources: z.array(P6FileSchema).max(3), captures: z.array(P6FileSchema).max(6)
}).strict();

const P11StatusSchema = z.object({
  recoveryState: z.enum(["acquiring", "ready", "busy", "unsupported", "failed", "recovered-source", "recovered-view"]), recoveryText: z.string().min(1),
  saveState: z.enum(["pending", "saved", "failed", "unsaved"]), saveText: z.string().min(1)
}).strict();
const P11StartupSchema = z.object({
  instrumentation: z.literal("before-app-bootstrap"), ready: z.literal(true), counters: P6CountersSchema,
  storage: z.object({ checkpointGets: z.number().int().nonnegative(), checkpointPuts: z.number().int().nonnegative(),
    checkpointDeletes: z.number().int().nonnegative(), checkpointClears: z.number().int().nonnegative(),
    legacyGets: z.number().int().nonnegative(), legacyLists: z.number().int().nonnegative() }).strict(),
  lockRequests: z.array(z.object({ name: z.string().min(1), mode: z.literal("exclusive"), ifAvailable: z.literal(true),
    signalPresent: z.literal(false), stealPresent: z.literal(false), granted: z.boolean(), lockName: z.string().nullable(),
    lockMode: z.enum(["exclusive", "shared"]).nullable(), outcome: z.enum(["pending", "fulfilled", "rejected"]) }).strict()).min(1),
  status: P11StatusSchema
}).strict();
const P11AcknowledgementSchema = z.object({
  documentId: z.literal("e2e-family-doc"), publication: z.number().int().positive(), runId: z.string().min(1), kind: z.literal("source"),
  sourceContentHash: P6HashSchema, revision: z.number().int().nonnegative(), state: z.literal("saved"), checkpointContentHash: P6HashSchema
}).strict();
const P11RecoveryReceiptSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p11-source-checkpoint-recovery-e2e"), documentId: z.literal("e2e-family-doc"),
  owningPageClosed: z.literal(true), automaticSourceRecovery: z.literal(true), ownerAcknowledgement: P11AcknowledgementSchema,
  busy: z.object({ startup: P11StartupSchema, manualPortableOpen: z.literal(true), manualRestore: z.literal(true),
    remainedVisiblyUnsaved: z.literal(true), checkpointPuts: z.literal(0) }).strict(),
  recovered: z.object({ startup: P11StartupSchema, acknowledgement: P11AcknowledgementSchema, step: P6StepSchema,
    sourceFile: P6FileSchema.nullable() }).strict(),
  comparisons: z.object({ literalSourceEqual: z.literal(true), revisionAndDirectiveEqual: z.literal(true), completeIrEqual: z.literal(true),
    completeGalleryEqual: z.literal(true), pinnedInputsEqual: z.literal(true), allFiveRawChannelsEqual: z.literal(true),
    fullMaterialMetadataEqual: z.literal(true) }).strict(), captures: z.array(P6FileSchema).max(2)
}).strict();

async function p11BootstrapPage(context, url, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  let releaseEntry;
  const gate = new Promise(resolve => { releaseEntry = resolve; });
  const entryPattern = "**/src/app/main.tsx*";
  const holdEntry = async route => { await gate; await route.continue(); };
  await page.route(entryPattern, holdEntry);
  const entryRequested = page.waitForRequest(entryPattern, { timeout: 30000 });
  void entryRequested.catch(() => undefined);
  const navigating = page.goto(url, { waitUntil: "domcontentloaded" });
  void navigating.catch(() => undefined);
  try {
    await entryRequested;
    await p6InstallProbe(page, true);
    releaseEntry(); await navigating;
    await page.unroute(entryPattern, holdEntry);
    return page;
  } catch (error) {
    releaseEntry(); await navigating.catch(() => undefined);
    try { await page.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
    finally { await page.close(); }
    throw error;
  }
}

async function p11WaitRecovery(page, state) {
  await page.waitForFunction(expected => document.querySelector('[aria-label="Source checkpoint recovery"]')?.dataset.state === expected,
    state, { timeout: 30000 });
  await page.getByLabel("Source checkpoint recovery", { exact: true }).waitFor({ state: "visible" });
}

async function p11StartupSnapshot(page) {
  const snapshot = P11StartupSchema.parse(await page.evaluate(() => {
    const probe = window.__buildoP6Probe;
    const recovery = document.querySelector('[aria-label="Source checkpoint recovery"]');
    const saved = document.querySelector('[aria-label="Source checkpoint save status"]');
    return { instrumentation: probe.instrumentation, ready: probe.ready, counters: { ...probe.counters }, storage: { ...probe.storage },
      lockRequests: structuredClone(probe.lockRequests), status: { recoveryState: recovery?.dataset.state, recoveryText: recovery?.textContent.trim(),
        saveState: saved?.dataset.state, saveText: saved?.textContent.trim() } };
  }));
  for (const request of snapshot.lockRequests) {
    assert.equal(request.name, "buildo-building-source-checkpoint:" + JSON.stringify("e2e-family-doc"));
    if (request.granted) { assert.equal(request.lockName, request.name); assert.equal(request.lockMode, "exclusive"); }
    else { assert.equal(request.lockName, null); assert.equal(request.lockMode, null); }
  }
  return snapshot;
}

async function p11Acknowledged(page, saved) {
  const source = saved.decoded.sourceSnapshot;
  const status = P11AcknowledgementSchema.parse(await page.evaluate(async expected => {
    const probe = window.__buildoP6Probe, controller = probe?.controller;
    if (!controller) throw new Error("P11 requires the actual accepted controller.");
    await controller.drainSourceCheckpoints();
    const status = controller.getSourceCheckpointStatus(expected.documentId);
    if (!status || status.state !== "saved" || status.kind !== "source" || status.sourceContentHash !== expected.sourceContentHash ||
        status.revision !== expected.revision || status.runId !== probe.acceptedRunId) throw new Error("P11 requires acknowledgement of the exact accepted run/source/revision.");
    return { documentId: status.documentId, publication: status.publication, runId: status.runId, kind: status.kind,
      sourceContentHash: status.sourceContentHash, revision: status.revision, state: status.state, checkpointContentHash: status.checkpointContentHash };
  }, { documentId: source.document.documentId, sourceContentHash: source.sourceContentHash, revision: source.document.revision }));
  await page.waitForFunction(() => document.querySelector('[aria-label="Source checkpoint save status"]')?.dataset.state === "saved",
    undefined, { timeout: 30000 });
  return status;
}

async function p6InstallProbe(page, beforeBootstrap = false) {
  await page.evaluate(async (beforeBootstrap) => {
    if (window.__buildoP6Probe) throw new Error("P6 probe was already installed.");
    const [{ BuildingRunController }, { ProceduralMaterialProvider }, { LocalRulePromptInterpreter }] = await Promise.all([
      import("/src/features/building-family/state/buildingRunController.ts"),
      import("/src/features/building-family/materials/providers/proceduralMaterialProvider.ts"),
      import("/src/features/building-family/psg/localRulePromptInterpreter.ts")
    ]);
    const probe = {
      ready: false, sequence: 0, current: null, acceptedFixture: null, acceptedRunId: null, controller: null, widthRequests: [], draws: new Map(),
      instrumentation: beforeBootstrap ? "before-app-bootstrap" : "after-ready-before-tested-actions",
      lockRequests: [], storage: { checkpointGets: 0, checkpointPuts: 0, checkpointDeletes: 0, checkpointClears: 0, legacyGets: 0, legacyLists: 0 },
      counters: { widthStarted: 0, widthFinished: 0, opensStarted: 0, opensFinished: 0, runsStarted: 0,
        interpreterCalls: 0, providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 }
    };
    const restores = [], observed = new WeakSet();
    const assertReady = () => { if (!probe.ready) throw new Error("P6 action preceded complete instrumentation."); };
    const wrap = (object, key, factory) => {
      const original = object[key];
      if (typeof original !== "function") throw new Error("P6 instrumentation requires an actual method: " + key);
      const replacement = factory(original);
      object[key] = replacement;
      restores.push(() => { if (object[key] === replacement) object[key] = original; });
    };
    probe.restore = () => { for (const restore of restores.splice(0).reverse()) restore(); delete window.__buildoP6Probe; };
    window.__buildoP6Probe = probe;
    const observe = (fixture) => {
      fixture.buildingRuntime.root.traverse((object) => {
        if (!object.isMesh || observed.has(object)) return;
        observed.add(object);
        wrap(object, "onBeforeRender", original => function (...args) {
          const returned = original.apply(this, args);
          const [renderer, scene, camera] = args, canvas = renderer.domElement;
          if (camera.isPerspectiveCamera && canvas?.isConnected && canvas.getAttribute("aria-label") === "Assembly Hall Three.js canvas") {
            const sequence = ++probe.sequence;
            probe.current = { fixture, camera, scene, canvas, sequence };
            probe.draws.set(object.uuid, { fixture, canvas, scene, sequence });
          }
          return returned;
        });
      });
    };
    wrap(BuildingRunController.prototype, "acquireFixtureViewerLease", original => function (fixture) {
      const release = original.call(this, fixture); probe.controller = this; observe(fixture); return release;
    });
    wrap(BuildingRunController.prototype, "applyWindowWidthOverride", original => function (input) {
      assertReady(); probe.controller = this; probe.counters.widthStarted += 1; probe.widthRequests.push(structuredClone(input));
      return original.call(this, input).then(result => {
        if (!result.stale && result.fixture) { probe.acceptedFixture = result.fixture; probe.acceptedRunId = result.runId; }
        return result;
      }).finally(() => { probe.counters.widthFinished += 1; });
    });
    wrap(BuildingRunController.prototype, "openSourceFile", original => function (...args) {
      assertReady(); probe.controller = this; probe.counters.opensStarted += 1;
      return original.apply(this, args).then(result => {
        if (!result.stale && result.fixture) { probe.acceptedFixture = result.fixture; probe.acceptedRunId = result.runId; }
        return result;
      }).finally(() => { probe.counters.opensFinished += 1; });
    });
    wrap(BuildingRunController.prototype, "startDemoRun", original => function (...args) {
      assertReady(); probe.controller = this; probe.counters.runsStarted += 1; return original.apply(this, args);
    });
    wrap(ProceduralMaterialProvider.prototype, "generate", original => function (...args) {
      assertReady(); probe.counters.providerCalls += 1; return original.apply(this, args);
    });
    wrap(LocalRulePromptInterpreter.prototype, "interpret", original => function (...args) {
      assertReady(); probe.counters.interpreterCalls += 1; return original.apply(this, args);
    });
    for (const [method, counter] of [["put", "cachePuts"], ["delete", "cacheDeletes"], ["clear", "cacheClears"]]) {
      wrap(window.IDBObjectStore.prototype, method, original => function (...args) {
        if (this.name === "cachedArtifacts" && this.transaction.db.name === "buildo-building-family-artifacts") {
          assertReady(); probe.counters[counter] += 1;
        }
        if (this.name === "sourceCheckpoints" && this.transaction.db.name === "buildo-building-source-checkpoints") {
          assertReady(); probe.storage[{ put: "checkpointPuts", delete: "checkpointDeletes", clear: "checkpointClears" }[method]] += 1;
        }
        return original.apply(this, args);
      });
    }
    for (const method of ["get", "getAll"]) {
      wrap(window.IDBObjectStore.prototype, method, original => function (...args) {
        if (this.name === "sourceCheckpoints" && this.transaction.db.name === "buildo-building-source-checkpoints") {
          assertReady(); probe.storage.checkpointGets += 1;
        }
        if (this.name === "cachedArtifacts" && this.transaction.db.name === "buildo-building-family-artifacts") {
          assertReady(); probe.storage[method === "get" ? "legacyGets" : "legacyLists"] += 1;
        }
        return original.apply(this, args);
      });
    }
    if (!window.navigator.locks) throw new Error("P11 requires the actual browser Web Locks API.");
    wrap(window.navigator.locks, "request", original => function (...args) {
      if (!String(args[0]).startsWith("buildo-building-source-checkpoint:")) return original.apply(this, args);
      assertReady();
      const options = typeof args[1] === "function" ? {} : args[1], callbackIndex = typeof args[1] === "function" ? 1 : 2;
      const callback = args[callbackIndex], row = { name: args[0], mode: options.mode ?? "exclusive", ifAvailable: options.ifAvailable === true,
        signalPresent: Object.hasOwn(options, "signal"), stealPresent: Object.hasOwn(options, "steal"), granted: null, lockName: null, lockMode: null,
        outcome: "pending" };
      probe.lockRequests.push(row);
      args[callbackIndex] = function (...callbackArgs) {
        const lock = callbackArgs[0]; row.granted = lock !== null; row.lockName = lock?.name ?? null; row.lockMode = lock?.mode ?? null;
        return callback.apply(this, callbackArgs);
      };
      const returned = original.apply(this, args);
      void Promise.resolve(returned).then(() => { row.outcome = "fulfilled"; }, () => { row.outcome = "rejected"; });
      return returned;
    });
    probe.cacheRows = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open("buildo-building-family-artifacts");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const rows = await new Promise((resolve, reject) => {
          const request = database.transaction("cachedArtifacts", "readonly").objectStore("cachedArtifacts").getAll();
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        return rows.map(({ key, entry }) => ({
          key, artifactType: entry.artifactType, requestHash: entry.requestHash, contentHash: entry.contentHash, schemaVersion: entry.schemaVersion,
          documentId: entry.artifact?.documentId ?? null, sourceGraphHash: entry.artifact?.artifacts?.runtimeIr?.sourceGraphHash ?? null
        })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      } finally { database.close(); }
    };
    probe.own = (value) => {
      const ancestors = new Set();
      function visit(current) {
        if (current === undefined) return { kind: "undefined" };
        if (current === null) return { kind: "null" };
        if (typeof current === "string" || typeof current === "boolean") return { kind: typeof current, value: current };
        if (typeof current === "number") {
          if (!Number.isFinite(current)) throw new Error("P6 encountered a nonfinite number.");
          return { kind: "number", value: current, negativeZero: Object.is(current, -0) };
        }
        if (typeof current !== "object" || Object.getOwnPropertySymbols(current).length || ancestors.has(current)) throw new Error("P6 cannot own this metadata.");
        const keys = Object.getOwnPropertyNames(current);
        if (ArrayBuffer.isView(current)) {
          if (!["Float32Array", "Uint32Array", "Uint16Array", "Uint8Array", "Uint8ClampedArray"].includes(current.constructor.name) ||
              keys.length !== current.length || keys.some((key, index) => key !== String(index))) throw new Error("P6 encountered unsupported typed metadata.");
          const bytes = new Uint8Array(current.buffer, current.byteOffset, current.byteLength);
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          return { kind: "typed", type: current.constructor.name, length: current.length, byteOffset: current.byteOffset,
            byteLength: current.byteLength, bufferByteLength: current.buffer.byteLength, base64: window.btoa(binary) };
        }
        const array = Array.isArray(current), prototype = Object.getPrototypeOf(current);
        if (!array && prototype !== Object.prototype && prototype !== null) throw new Error("P6 encountered nonplain metadata.");
        ancestors.add(current);
        const entries = keys.map(key => {
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (!descriptor || !("value" in descriptor)) throw new Error("P6 encountered an accessor.");
          return [key, visit(descriptor.value), { enumerable: descriptor.enumerable, configurable: descriptor.configurable, writable: descriptor.writable }];
        });
        ancestors.delete(current);
        return array ? { kind: "array", length: current.length, entries } : { kind: "object", prototype: prototype === null ? "null" : "plain", entries };
      }
      return visit(value);
    };
    probe.ready = true;
    if (window.__buildoSelectionProbe?.fixture) observe(window.__buildoSelectionProbe.fixture);
    // A pre-bootstrap probe must not open/read a database before the App has
    // acquired its writer. Harness cache snapshots begin only after busy proof.
    probe.cacheBefore = beforeBootstrap ? [] : await probe.cacheRows();
  }, beforeBootstrap);
}

async function p6PickWindow(page, address) {
  const beforeReset = await page.evaluate(() => window.__buildoP6Probe?.sequence ?? 0);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await workspaceReady(page);
  await page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(sequence => {
    const current = window.__buildoP6Probe?.current;
    return current?.canvas.isConnected && current.sequence > sequence &&
      Math.abs(current.camera.aspect - current.canvas.clientWidth / current.canvas.clientHeight) < 1e-6;
  }, beforeReset);
  const target = await page.evaluate(async (wanted) => {
    const [{ Raycaster, Vector2 }, adapter, fixtureModule, slots] = await Promise.all([
      import("/node_modules/.vite/deps/three.js"), import("/src/features/building-family/renderer-three/buildingSceneAdapter.ts"),
      import("/src/features/building-family/ui/assemblyHallFixture.ts"), import("/src/features/building-family/compiler/facadeSplitPlan.ts")
    ]);
    const { fixture, camera, scene, canvas } = window.__buildoP6Probe.current;
    const base = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: fixture.sourceSnapshot, catalog: fixture.catalog });
    if (window.__buildoP6Probe.current.fixture !== fixture) throw new Error("P6 pick owner changed during base reconstruction.");
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect(), raycaster = new Raycaster();
    for (const entry of fixture.ir.semanticIndex) {
      if (entry.batchId !== "instances.window" && entry.batchId !== "instances.window.glass") continue;
      const candidate = adapter.resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, entry.semanticPath);
      if (!candidate) continue;
      const slot = slots.resolveWindowSlotAddressFromSemanticPath(base, candidate.semanticPath);
      if (wanted ? JSON.stringify(slot) !== JSON.stringify(wanted) : slot.facade !== "front" || slot.floorIndex !== 1) continue;
      for (const ratio of [0.5, 0.3, 0.7]) {
        const world = candidate.bounds.getCenter(camera.position.clone());
        world.x = candidate.bounds.min.x + (candidate.bounds.max.x - candidate.bounds.min.x) * ratio;
        const ndc = world.project(camera);
        if (Math.abs(ndc.x) >= 0.95 || Math.abs(ndc.y) >= 0.95 || Math.abs(ndc.z) >= 1) continue;
        raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
        const selected = adapter.resolveWindowSelectionFromIntersections(fixture.buildingRuntime, fixture.catalog,
          raycaster.intersectObject(fixture.buildingRuntime.root, true));
        if (!selected) continue;
        const selectedAddress = slots.resolveWindowSlotAddressFromSemanticPath(base, selected.semanticPath);
        if (JSON.stringify(selectedAddress) !== JSON.stringify(slot)) continue;
        const opening = slots.resolveWindowOpeningFromSlotAddress(base, slot);
        return { semanticPath: selected.semanticPath, address: slot, baseWidthM: opening.sizeM[0],
          x: rect.x + (ndc.x + 1) * rect.width / 2, y: rect.y + (1 - ndc.y) * rect.height / 2 };
      }
    }
    throw new Error("P6 could not project a real visible current window.");
  }, address ?? null);
  await page.mouse.click(target.x, target.y);
  const fieldId = await page.getByLabel("Window width (m)", { exact: true }).getAttribute("id");
  assert.ok(fieldId, "P6 width input must retain its associated native label");
  await page.waitForFunction(id => {
    const field = document.getElementById(id);
    return field && !field.disabled && Number.isFinite(Number(field.value)) && field.value !== "";
  }, fieldId);
  assert.equal(await page.getByLabel("Semantic element", { exact: true }).inputValue(), target.semanticPath);
  return target;
}

async function p6Capture(page, sourceCodec, saved, target, name, artifactDir) {
  await page.waitForFunction(({ hash, revision }) => {
    const probe = window.__buildoP6Probe, current = probe?.current, source = current?.fixture.sourceSnapshot;
    return current?.canvas.isConnected && source?.sourceContentHash === hash && source.document.revision === revision &&
      (!probe.acceptedFixture || probe.acceptedFixture === current.fixture);
  }, { hash: saved.decoded.sourceSnapshot.sourceContentHash, revision: saved.decoded.sourceSnapshot.document.revision });
  const capture = await page.evaluate(async ({ path, expectedHash, expectedRevision }) => {
    const [adapter, fixtureModule, slots] = await Promise.all([
      import("/src/features/building-family/renderer-three/buildingSceneAdapter.ts"),
      import("/src/features/building-family/ui/assemblyHallFixture.ts"), import("/src/features/building-family/compiler/facadeSplitPlan.ts")
    ]);
    const probe = window.__buildoP6Probe, { fixture, scene, camera, canvas } = probe.current;
    const source = fixture.sourceSnapshot;
    if (!source || source.sourceContentHash !== expectedHash || source.document.revision !== expectedRevision) throw new Error("P6 draw/source owner mismatch.");
    const base = await fixtureModule.buildAssemblyHallSourceWindowSplit({ sourceSnapshot: source, catalog: fixture.catalog });
    if (probe.current.fixture !== fixture || fixture.sourceSnapshot !== source || !canvas.isConnected) throw new Error("P6 owner changed while capturing.");
    const address = slots.resolveWindowSlotAddressFromSemanticPath(base, path), opening = slots.resolveWindowOpeningFromSlotAddress(base, address);
    const widths = source.schemaVersion === "0.5.0" ? source.windowWidthBatch.directives
      : source.schemaVersion === "0.4.0" ? source.windowWidthOverrides : [];
    const override = widths.find(value => JSON.stringify(value.address) === JSON.stringify(address));
    const selected = adapter.resolveWindowSelectionFromSemanticPath(fixture.buildingRuntime, fixture.catalog, path);
    const marker = scene.getObjectByName("assembly-hall.window-selection");
    if (!selected || !marker?.visible || marker.userData.semanticPath !== path || marker.userData.selectionObjectUuid !== selected.object.uuid ||
        marker.userData.instanceIndex !== selected.instanceIndex || marker.parent !== scene) throw new Error("P6 selection marker is not the current native instance.");
    const native = selected.object.matrix.clone(); selected.object.getMatrixAt(selected.instanceIndex, native);
    const world = selected.object.matrixWorld.clone().multiply(native), expected = selected.bounds.clone().makeEmpty(), point = camera.position.clone();
    const positions = selected.object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) expected.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(world));
    marker.updateMatrixWorld(true); marker.geometry.computeBoundingBox();
    const drawn = marker.geometry.boundingBox.clone().applyMatrix4(marker.matrixWorld);
    const equal = (a, b) => a.toArray().every((value, index) => Math.abs(value - b.toArray()[index]) < 1e-7);
    if (!equal(marker.box.min, expected.min) || !equal(marker.box.max, expected.max) || !equal(drawn.min, expected.min) || !equal(drawn.max, expected.max) ||
        fixture.familyRuntime.root.getObjectById(marker.id)) throw new Error("P6 marker bounds/ownership mismatch.");
    const instances = [opening.semanticPath, opening.semanticPath + "/glass"].map(semanticPath => {
      const lookup = fixture.buildingRuntime.semanticLookup.get(semanticPath), entry = fixture.ir.semanticIndex.find(value => value.semanticPath === semanticPath);
      const batch = fixture.ir.instanceBatches.find(value => value.batchId === entry?.batchId);
      const object = lookup?.object, instanceIndex = lookup?.instanceIndex ?? lookup?.elementIndex;
      const actualDraw = object && probe.draws.get(object.uuid);
      if (!entry || entry.elementIndex === undefined || !batch?.transforms || !object?.isInstancedMesh || instanceIndex === undefined ||
          !actualDraw || actualDraw.fixture !== fixture || actualDraw.canvas !== canvas || actualDraw.scene !== scene) throw new Error("P6 paired instance was not submitted on this connected canvas.");
      const matrix = object.matrix.clone(); object.getMatrixAt(instanceIndex, matrix);
      const irMatrix = Array.from(batch.transforms.subarray(entry.elementIndex * 16, (entry.elementIndex + 1) * 16));
      if (matrix.elements.some((value, index) => value !== irMatrix[index])) throw new Error("P6 native/IR instance mapping differs.");
      return { semanticPath, batchId: entry.batchId, elementIndex: entry.elementIndex, instanceIndex, objectUuid: object.uuid,
        geometryUuid: object.geometry.uuid, vertexCount: object.geometry.getAttribute("position").count,
        drawnSequence: actualDraw.sequence, matrix: [...matrix.elements], irMatrix };
    });
    const corners = [];
    for (const x of [fixture.ir.bounds.min[0], fixture.ir.bounds.max[0]]) {
      for (const y of [fixture.ir.bounds.min[1], fixture.ir.bounds.max[1]]) for (const z of [fixture.ir.bounds.min[2], fixture.ir.bounds.max[2]]) {
        const worldPoint = fixture.buildingRuntime.root.localToWorld(camera.position.clone().set(x, y, z));
        const depth = -worldPoint.clone().applyMatrix4(camera.matrixWorldInverse).z, ndc = worldPoint.project(camera);
        corners.push(Number.isFinite(depth) && depth > 0 && [ndc.x, ndc.y, ndc.z].every(value => Number.isFinite(value) && Math.abs(value) < 1));
      }
    }
    return {
      source, ir: probe.own(fixture.ir), gallery: probe.own(fixture.componentGallery),
      inputs: probe.own({ spec: fixture.spec, graph: fixture.graph, catalog: fixture.catalog }),
      selection: { semanticPath: path, framePath: opening.semanticPath, address, baseWidthM: opening.sizeM[0], currentWidthM: override?.widthM ?? opening.sizeM[0],
        markerBoundsMatch: true, outsideFamilyRoot: true, instances },
      draw: { sequence: probe.current.sequence, canvasCount: document.querySelectorAll('canvas[aria-label="Assembly Hall Three.js canvas"]').length,
        connected: canvas.isConnected, rendered: canvas.dataset.rendered === "true", backend: canvas.dataset.rendererBackend,
        rootUuid: fixture.buildingRuntime.root.uuid, sourceGraphHash: fixture.ir.sourceGraphHash, withinFrustum: corners.length === 8 && corners.every(Boolean),
        canvas: { width: canvas.clientWidth, height: canvas.clientHeight } }
    };
  }, { path: target.semanticPath, expectedHash: saved.decoded.sourceSnapshot.sourceContentHash, expectedRevision: saved.decoded.sourceSnapshot.document.revision });
  const schema = z.object({
    schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p6-owned-window-step"), name: P6StepNameSchema,
    source: sourceCodec.BuildingSourceSnapshotSchema, ir: P6EncodedValueSchema, gallery: P6EncodedValueSchema, inputs: P6EncodedValueSchema,
    selection: P6SelectionSchema, draw: P6DrawSchema
  }).strict();
  const owned = schema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r3-p6-owned-window-step", name, ...capture });
  assert.deepEqual(owned.source, saved.decoded.sourceSnapshot, name + ": actual fixture must match portable source");
  assert.equal(await page.getByLabel("Window width (m)", { exact: true }).inputValue(), String(owned.selection.currentWidthM));
  let snapshot = null;
  if (artifactDir) {
    const bytes = Buffer.from(JSON.stringify(owned, null, 2) + "\n"), file = "p6-" + name + "-owned.json";
    await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
    snapshot = { file, sha256: workspaceHash(bytes), byteLength: bytes.length };
  }
  let typedSpanCount = 0, typedSpanBytes = 0;
  function count(value) {
    if (value.kind === "typed") { typedSpanCount += 1; typedSpanBytes += value.byteLength; }
    else if (value.entries) for (const [, child] of value.entries) count(child);
  }
  count(owned.ir);
  return { owned, receipt: (owned.source.schemaVersion === "0.5.0" ? P15StepSchema : P6StepSchema).parse({
    name, sourceVersion: owned.source.schemaVersion, revision: owned.source.document.revision, sourceContentHash: owned.source.sourceContentHash,
    sourceFileSha256: workspaceHash(saved.bytes), irSha256: workspaceHash(JSON.stringify(owned.ir)),
    gallerySha256: workspaceHash(JSON.stringify(owned.gallery)), inputsSha256: workspaceHash(JSON.stringify(owned.inputs)),
    typedSpanCount, typedSpanBytes, selection: owned.selection, draw: owned.draw, snapshot
  }) };
}

function p6Entry(value, key) {
  const found = value.entries?.find(entry => entry[0] === key);
  assert.ok(found, "Missing complete owned field " + key);
  return found[1];
}
function p6Items(value) {
  assert.equal(value.kind, "array");
  return Array.from({ length: value.length }, (_, index) => p6Entry(value, String(index)));
}
function p6Matrices(before, after, oldWidth, newWidth, name) {
  assert.deepEqual(p6Entry(after.owned.ir, "semanticIndex"), p6Entry(before.owned.ir, "semanticIndex"));
  const previous = p6Items(p6Entry(before.owned.ir, "instanceBatches")), next = p6Items(p6Entry(after.owned.ir, "instanceBatches"));
  assert.equal(next.length, previous.length);
  // OpeningSlotBinding's independent aperture-to-frame equation: slot floor,
  // 0.04 m inset on each side, then the 0.15 m frame-width floor.
  const boundFrameWidth = width => Math.max(0.15, Math.max(0.2, width) - 2 * 0.04);
  const expectedRatio = boundFrameWidth(newWidth) / boundFrameWidth(oldWidth), actualRatios = [];
  let selectedPairs = 0, unchangedMatrices = 0;
  for (const [batchIndex, batch] of previous.entries()) {
    const other = next[batchIndex], batchId = p6Entry(batch, "batchId").value;
    assert.deepEqual(batch.entries.filter(([key]) => key !== "transforms"), other.entries.filter(([key]) => key !== "transforms"));
    const oldSpan = p6Entry(batch, "transforms"), newSpan = p6Entry(other, "transforms");
    assert.equal(oldSpan.kind, "typed"); assert.equal(newSpan.kind, "typed");
    const oldBytes = Buffer.from(oldSpan.base64, "base64"), newBytes = Buffer.from(newSpan.base64, "base64");
    assert.equal(oldBytes.length, newBytes.length);
    for (let index = 0; index < p6Entry(batch, "count").value; index += 1) {
      const chosen = before.owned.selection.instances.some(instance => instance.batchId === batchId && instance.elementIndex === index);
      const a = oldBytes.subarray(index * 64, (index + 1) * 64), b = newBytes.subarray(index * 64, (index + 1) * 64);
      if (!chosen) { assert.deepEqual(b, a); unchangedMatrices += 1; continue; }
      const oldMatrix = Array.from({ length: 16 }, (_, component) => a.readFloatLE(component * 4));
      const newMatrix = Array.from({ length: 16 }, (_, component) => b.readFloatLE(component * 4));
      assert.deepEqual(newMatrix.slice(3), oldMatrix.slice(3));
      const ratio = Math.hypot(...newMatrix.slice(0, 3)) / Math.hypot(...oldMatrix.slice(0, 3));
      assert.ok(Math.abs(ratio - expectedRatio) < 1e-6, name + ": submitted local-X ratio differs");
      for (let axis = 0; axis < 3; axis += 1) assert.ok(Math.abs(newMatrix[axis] - oldMatrix[axis] * expectedRatio) < 1e-6);
      actualRatios.push(ratio); selectedPairs += 1;
    }
  }
  assert.equal(selectedPairs, 2); assert.ok(unchangedMatrices > 0);
  return { name, selectedPairs, unchangedMatrices, expectedRatio, actualRatios };
}

async function p6ProbeSummary(page) {
  return P6ProbeSummarySchema.parse(await page.evaluate(async () => {
    const probe = window.__buildoP6Probe;
    return { instrumentation: probe.instrumentation, ready: probe.ready, counters: { ...probe.counters },
      widthRequests: structuredClone(probe.widthRequests), cacheBefore: probe.cacheBefore, cacheAfter: await probe.cacheRows() };
  }));
}

async function p6ProveWindowWidth(page, sourceCodec, artifactDir) {
  const captures = [], portableSources = [], steps = [], recoveryCaptures = [];
  const context = page.context(), ownerUrl = page.url();
  let fresh, recovery, returnRecovery = false;
  const field = page.getByLabel("Window width (m)", { exact: true });
  const materialChecks = (saved, baseline) => {
    assert.deepEqual(saved.decoded.file.materials, baseline.decoded.file.materials, "P6 full material metadata/PNG receipts changed");
    for (const name of workspaceChannels) assert.deepEqual(Buffer.from(saved.decoded.packedAtlas.channels[name].data), Buffer.from(baseline.decoded.packedAtlas.channels[name].data), "P6 raw material bytes changed: " + name);
  };
  async function savePortable(saved, name) {
    if (!artifactDir) return;
    const file = "p6-" + name + "-source.json";
    await writeFile(path.join(artifactDir, file), saved.bytes, { flag: "wx" });
    portableSources.push({ file, sha256: workspaceHash(saved.bytes), byteLength: saved.bytes.length });
  }
  async function captureUi(activePage, name) {
    const input = activePage.getByLabel("Window width (m)", { exact: true });
    await input.scrollIntoViewIfNeeded();
    const layout = await input.evaluate(input => {
      const rect = input.getBoundingClientRect();
      return { visible: !!rect && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.right <= window.innerWidth + 1 && rect.y >= 0 && rect.bottom <= window.innerHeight + 1,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1, canvases: document.querySelectorAll('canvas[aria-label="Assembly Hall Three.js canvas"]').length };
    });
    assert.deepEqual(layout, { visible: true, noOverflow: true, canvases: 1 });
    if (artifactDir) {
      const bytes = await activePage.screenshot({ fullPage: true }), file = "p6-" + name + ".png";
      await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
      captures.push({ file, sha256: workspaceHash(bytes), byteLength: bytes.length });
    }
  }
  async function captureRecoveryUi(activePage, name, canvasCount) {
    const status = activePage.getByLabel("Source checkpoint recovery", { exact: true });
    await status.scrollIntoViewIfNeeded(); await status.waitFor({ state: "visible" });
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    assert.equal(await activePage.locator('canvas[aria-label="Assembly Hall Three.js canvas"]').count(), canvasCount);
    if (artifactDir) {
      const bytes = await activePage.screenshot({ fullPage: true }), file = "p11-" + name + ".png";
      await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
      recoveryCaptures.push({ file, sha256: workspaceHash(bytes), byteLength: bytes.length });
    }
  }
  async function waitWidth(activePage, count, value) {
    const fieldId = await activePage.getByLabel("Window width (m)", { exact: true }).getAttribute("id");
    assert.ok(fieldId);
    await activePage.waitForFunction(({ count, value, fieldId }) => {
      const probe = window.__buildoP6Probe, input = document.getElementById(fieldId);
      return probe?.counters.widthFinished === count && probe.current?.fixture === probe.acceptedFixture &&
        input && !input.disabled && input.value === String(value);
    }, { count, value, fieldId }, { timeout: 30000 });
    await workspaceReady(activePage);
  }
  try {
    await p6InstallProbe(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const target = await p6PickWindow(page);
    const baseline = await workspaceDownload(page, sourceCodec);
    assert.equal(baseline.decoded.sourceSnapshot.schemaVersion, "0.3.0");
    const base = await p6Capture(page, sourceCodec, baseline, target, "selected-before", artifactDir); steps.push(base.receipt);
    assert.equal(base.owned.selection.currentWidthM, target.baseWidthM);
    await savePortable(baseline, "baseline"); await captureUi(page, "desktop-selected-before");
    const narrowWidth = Number(Math.max(0.23, Math.min(0.6, target.baseWidthM / 2)).toFixed(6));
    const increasedWidth = Number(((narrowWidth + target.baseWidthM) / 2).toFixed(6));
    assert.ok(narrowWidth < increasedWidth && increasedWidth < target.baseWidthM);
    async function apply(value, count, name) {
      await field.fill(String(value)); await page.getByRole("button", { name: "Apply", exact: true }).click();
      await waitWidth(page, count, value);
      const saved = await workspaceDownload(page, sourceCodec); materialChecks(saved, baseline);
      const expected = structuredClone(baseline.decoded.sourceSnapshot);
      expected.schemaVersion = "0.4.0"; expected.document.revision += count;
      expected.windowWidthOverrides = [{ schemaVersion: "0.1.0", address: target.address, widthM: value }];
      expected.sourceContentHash = saved.decoded.sourceSnapshot.sourceContentHash;
      assert.deepEqual(saved.decoded.sourceSnapshot, expected, "P6 local source changed pinned dependencies");
      const captured = await p6Capture(page, sourceCodec, saved, target, name, artifactDir); steps.push(captured.receipt);
      return { saved, captured };
    }
    const narrowed = await apply(narrowWidth, 1, "narrowed"); await captureUi(page, "desktop-narrowed");
    const increased = await apply(increasedWidth, 2, "increased"); await captureUi(page, "desktop-increased");
    await savePortable(increased.saved, "edited");
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await captureUi(page, "compact-edited");
    const baselinePage = await p6ProbeSummary(page);
    assert.deepEqual(baselinePage.counters, { widthStarted: 2, widthFinished: 2, opensStarted: 0, opensFinished: 0, runsStarted: 0, interpreterCalls: 0,
      providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    assert.deepEqual(baselinePage.cacheAfter, baselinePage.cacheBefore);
    const ownerAcknowledgement = await p11Acknowledged(page, increased.saved);
    fresh = await p11BootstrapPage(context, ownerUrl, { width: 1440, height: 1000 });
    await p11WaitRecovery(fresh, "busy");
    const busyStartup = await p11StartupSnapshot(fresh);
    assert.deepEqual(busyStartup.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 0, opensFinished: 0, runsStarted: 0, interpreterCalls: 0,
      providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    assert.deepEqual(busyStartup.storage, { checkpointGets: 0, checkpointPuts: 0, checkpointDeletes: 0, checkpointClears: 0, legacyGets: 0, legacyLists: 0 });
    assert.equal(busyStartup.status.saveState, "unsaved");
    assert.ok(busyStartup.lockRequests.every(request => request.granted === false), "The live owner must keep every competing grant unavailable");
    await captureRecoveryUi(fresh, "busy-desktop", 0);
    await fresh.evaluate(async () => { window.__buildoP6Probe.cacheBefore = await window.__buildoP6Probe.cacheRows(); });
    await fresh.setViewportSize({ width: 390, height: 844 });
    await fresh.getByLabel("Open Source File").setInputFiles({ name: "p6-edited-source.json", mimeType: "application/json", buffer: increased.saved.bytes });
    await fresh.waitForFunction(() => window.__buildoP6Probe?.counters.opensFinished === 1, undefined, { timeout: 30000 });
    await workspaceReady(fresh);
    const freshTarget = await p6PickWindow(fresh, target.address);
    const reopened = await workspaceDownload(fresh, sourceCodec);
    assert.deepEqual(reopened.bytes, increased.saved.bytes, "P6 explicit fresh Open must preserve literal portable bytes");
    materialChecks(reopened, baseline);
    const opened = await p6Capture(fresh, sourceCodec, reopened, freshTarget, "reopened", artifactDir); steps.push(opened.receipt);
    assert.deepEqual(opened.owned.ir, increased.captured.owned.ir); assert.deepEqual(opened.owned.gallery, increased.captured.owned.gallery);
    await captureUi(fresh, "compact-reopened");
    await fresh.getByRole("button", { name: "Restore original", exact: true }).click();
    await waitWidth(fresh, 1, target.baseWidthM);
    const restored = await workspaceDownload(fresh, sourceCodec); materialChecks(restored, baseline);
    assert.equal(restored.decoded.sourceSnapshot.schemaVersion, "0.4.0");
    assert.deepEqual(restored.decoded.sourceSnapshot.windowWidthOverrides, []);
    assert.equal(restored.decoded.sourceSnapshot.document.revision, baseline.decoded.sourceSnapshot.document.revision + 3);
    const final = await p6Capture(fresh, sourceCodec, restored, freshTarget, "restored", artifactDir); steps.push(final.receipt);
    assert.deepEqual(final.owned.ir, base.owned.ir); assert.deepEqual(final.owned.gallery, base.owned.gallery);
    for (const step of [narrowed.captured, increased.captured, opened, final]) assert.deepEqual(step.owned.inputs, base.owned.inputs);
    await savePortable(restored, "restored"); await captureUi(fresh, "compact-restored");
    const freshPage = await p6ProbeSummary(fresh);
    assert.deepEqual(freshPage.counters, { widthStarted: 1, widthFinished: 1, opensStarted: 1, opensFinished: 1, runsStarted: 0, interpreterCalls: 0,
      providerCalls: 0, cachePuts: 1, cacheDeletes: 0, cacheClears: 0 });
    for (const row of freshPage.cacheBefore) assert.ok(freshPage.cacheAfter.some(after => JSON.stringify(after) === JSON.stringify(row)), "P6 restore must retain prior completed records");
    const busyAfter = await p11StartupSnapshot(fresh);
    assert.equal(busyAfter.status.saveState, "unsaved"); assert.equal(busyAfter.storage.checkpointPuts, 0);
    const calls = [...baselinePage.widthRequests, ...freshPage.widthRequests];
    assert.deepEqual(calls.map(value => value.expectedSourceContentHash), [base.owned.source.sourceContentHash, narrowed.captured.owned.source.sourceContentHash, opened.owned.source.sourceContentHash]);
    assert.deepEqual(calls.map(value => value.expectedRevision), [base.owned.source.document.revision, narrowed.captured.owned.source.document.revision, opened.owned.source.document.revision]);
    assert.deepEqual(calls.map(value => value.directive), [narrowWidth, increasedWidth, target.baseWidthM].map(widthM => ({ schemaVersion: "0.1.0", address: target.address, widthM })));
    const receipt = P6WidthReceiptSchema.parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r3-p6-window-width-e2e", documentId: "e2e-family-doc",
      freshAppExplicitPortableOpen: true, automaticRestartPersistenceClaimed: false, steps,
      matrixChecks: [p6Matrices(base, narrowed.captured, target.baseWidthM, narrowWidth, "narrow"),
        p6Matrices(narrowed.captured, increased.captured, narrowWidth, increasedWidth, "increase"),
        p6Matrices(opened, final, increasedWidth, target.baseWidthM, "restore")],
      materials: { fullMetadataEqual: true, rawBytesEqual: true, channels: workspaceChannels.map(name => ({
        name, byteLength: baseline.decoded.packedAtlas.channels[name].data.byteLength, sha256: workspaceHash(Buffer.from(baseline.decoded.packedAtlas.channels[name].data))
      })) },
      comparisons: { reopenedSourceLiteralEqual: true, reopenedIrExact: true, reopenedGalleryExact: true, restoredIrExact: true, restoredGalleryExact: true, pinnedInputsExact: true },
      baselinePage, freshPage, portableSources, captures
    });
    assert.equal(captures.length, artifactDir ? 6 : 0); assert.equal(portableSources.length, artifactDir ? 3 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p6-window-width-workflow.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P6_WINDOW_WIDTH_E2E_RESULT=" + JSON.stringify(receipt));

    // The unsaved competing page must not replace the owner's durable v4 edit.
    // Close both real pages before requesting another actual native grant.
    assert.deepEqual(await p11Acknowledged(page, increased.saved), ownerAcknowledgement);
    await fresh.evaluate(() => window.__buildoP6Probe.restore()); await fresh.close(); fresh = undefined;
    await page.evaluate(() => window.__buildoP6Probe.restore()); await page.close();
    recovery = await p11BootstrapPage(context, ownerUrl, { width: 390, height: 844 });
    await p11WaitRecovery(recovery, "recovered-source");
    await recovery.waitForFunction(() => window.__buildoP6Probe?.counters.opensFinished === 1, undefined, { timeout: 30000 });
    await workspaceReady(recovery);
    const recoveredTarget = await p6PickWindow(recovery, target.address);
    const recovered = await workspaceDownload(recovery, sourceCodec);
    assert.deepEqual(recovered.bytes, increased.saved.bytes, "P11 automatic recovery must preserve the owner's literal v4 file");
    assert.equal(recovered.decoded.sourceSnapshot.schemaVersion, "0.4.0");
    assert.equal(recovered.decoded.sourceSnapshot.document.revision, increased.saved.decoded.sourceSnapshot.document.revision);
    assert.deepEqual(recovered.decoded.sourceSnapshot.windowWidthOverrides, increased.saved.decoded.sourceSnapshot.windowWidthOverrides);
    materialChecks(recovered, baseline);
    const recoveredStep = await p6Capture(recovery, sourceCodec, recovered, recoveredTarget, "auto-recovered", artifactDir);
    assert.deepEqual(recoveredStep.owned.ir, increased.captured.owned.ir, "P11 automatic recovery changed complete actual IR");
    assert.deepEqual(recoveredStep.owned.gallery, increased.captured.owned.gallery, "P11 automatic recovery changed complete actual gallery");
    assert.deepEqual(recoveredStep.owned.inputs, increased.captured.owned.inputs, "P11 automatic recovery changed pinned compilation inputs");
    const recoveredAcknowledgement = await p11Acknowledged(recovery, recovered);
    const recoveredStartup = await p11StartupSnapshot(recovery);
    assert.deepEqual(recoveredStartup.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 1, opensFinished: 1, runsStarted: 0, interpreterCalls: 0,
      providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    assert.equal(recoveredStartup.storage.checkpointGets, 1);
    assert.equal(recoveredStartup.storage.legacyGets, 0); assert.equal(recoveredStartup.storage.legacyLists, 0);
    assert.equal(recoveredStartup.storage.checkpointDeletes, 0); assert.equal(recoveredStartup.storage.checkpointClears, 0);
    assert.equal(recoveredStartup.status.recoveryState, "recovered-source"); assert.equal(recoveredStartup.status.saveState, "saved");
    assert.ok(recoveredStartup.lockRequests.some(request => request.granted), "Automatic recovery must own an actual exclusive native grant");
    let recoveredFile = null;
    if (artifactDir) {
      const file = "p11-auto-recovered-source.json";
      await writeFile(path.join(artifactDir, file), recovered.bytes, { flag: "wx" });
      recoveredFile = { file, sha256: workspaceHash(recovered.bytes), byteLength: recovered.bytes.length };
    }
    await captureRecoveryUi(recovery, "auto-recovered-compact", 1);
    const recoveryReceipt = P11RecoveryReceiptSchema.parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r3-p11-source-checkpoint-recovery-e2e", documentId: "e2e-family-doc",
      owningPageClosed: true, automaticSourceRecovery: true, ownerAcknowledgement,
      busy: { startup: busyStartup, manualPortableOpen: true, manualRestore: true, remainedVisiblyUnsaved: true, checkpointPuts: 0 },
      recovered: { startup: recoveredStartup, acknowledgement: recoveredAcknowledgement, step: recoveredStep.receipt, sourceFile: recoveredFile },
      comparisons: { literalSourceEqual: true, revisionAndDirectiveEqual: true, completeIrEqual: true, completeGalleryEqual: true,
        pinnedInputsEqual: true, allFiveRawChannelsEqual: true, fullMaterialMetadataEqual: true }, captures: recoveryCaptures
    });
    assert.equal(recoveryCaptures.length, artifactDir ? 2 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p11-source-checkpoint-recovery.json"), JSON.stringify(recoveryReceipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P11_SOURCE_CHECKPOINT_RECOVERY_E2E_RESULT=" + JSON.stringify(recoveryReceipt));
    returnRecovery = true;
    return recovery;
  } finally {
    try {
      if (fresh) {
        try { await fresh.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
        finally { await fresh.close(); }
      }
    } finally {
      if (!page.isClosed()) await page.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined);
      if (recovery && !returnRecovery) {
        try { await recovery.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
        finally { await recovery.close(); }
      }
    }
  }
}

// P12 receipt-schema block; evaluated after the unchanged P6/P11 declarations.
const P12HistorySchema = z.object({ undoCount: z.number().int().nonnegative(), redoCount: z.number().int().nonnegative(),
  canUndo: z.boolean(), canRedo: z.boolean() }).strict();
const P12HistoryRequestSchema = z.object({ expectedSourceContentHash: P6HashSchema, expectedRevision: z.number().int().nonnegative() }).strict();
const P12PhaseSchema = z.enum(["initial", "first", "second", "undo", "redo", "recovered"]);
const P12OwnedStepSchemaFor = sourceSnapshotSchema => z.object({ schemaVersion: z.literal("0.1.0"),
  packetKind: z.literal("buildo-r3-p12-owned-window-step"), name: P12PhaseSchema, source: sourceSnapshotSchema,
  ir: P6EncodedValueSchema, gallery: P6EncodedValueSchema, inputs: P6EncodedValueSchema, selection: P6SelectionSchema, draw: P6DrawSchema }).strict();
const P12HistoryStepSchema = z.object({ phase: P12PhaseSchema,
  history: P12HistorySchema, capture: P6StepSchema, sourceFile: P6FileSchema.nullable() }).strict();
const P12WidthHistoryReceiptSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p12-window-width-history-e2e"), documentId: z.literal("e2e-family-doc"),
  initial: P12HistoryStepSchema, steps: z.array(P12HistoryStepSchema).length(5),
  actions: z.array(z.object({ kind: z.enum(["apply", "undo", "redo"]), request: P12HistoryRequestSchema, runId: z.string().min(1),
    sourceContentHash: P6HashSchema, revision: z.number().int().nonnegative(), historyBefore: P12HistorySchema, historyAfter: P12HistorySchema }).strict()).length(4),
  identicalDraft: z.object({ applyDisabled: z.literal(true), redoRetained: z.literal(true), noAction: z.literal(true), sourceLiteralEqual: z.literal(true),
    acceptedRunUnchanged: z.literal(true), revisionUnchanged: z.literal(true), checkpointPutsDelta: z.literal(0) }).strict(),
  ownerAcknowledgement: P11AcknowledgementSchema, owningPageClosed: z.literal(true), recovery: P11StartupSchema,
  recoveredAcknowledgement: P11AcknowledgementSchema, coldHistoryAfterRecovery: P12HistorySchema,
  editing: z.object({ counters: P6CountersSchema, checkpointPuts: z.literal(4) }).strict(),
  materials: z.object({ fullMetadataEqual: z.literal(true), allFiveRawChannelsEqual: z.literal(true), channels: z.array(z.object({
    name: z.enum(workspaceChannels), byteLength: z.number().int().positive(), sha256: P6HashSchema }).strict()).length(5) }).strict(),
  comparisons: z.object({ secondMatchesInitialGeometry: z.literal(true), undoMatchesFirstSourceAndGeometry: z.literal(true),
    redoMatchesSecondSourceAndGeometry: z.literal(true), monotonicAcceptedRevisions: z.literal(true), recoveredLiteralSource: z.literal(true),
    recoveredIrGalleryInputsEqual: z.literal(true) }).strict(), captures: z.array(P6FileSchema).max(2)
}).strict();

async function p12InstallProbe(page) {
  await page.evaluate(async () => {
    if (window.__buildoP12Probe) throw new Error("P12 history instrumentation was already installed.");
    const { BuildingRunController } = await import("/src/features/building-family/state/buildingRunController.ts");
    const probe = { depth: 0, completed: 0, actions: [], acceptedFixture: null }, restores = [];
    window.__buildoP12Probe = probe;
    probe.restore = () => { for (const restore of restores.splice(0).reverse()) restore(); delete window.__buildoP12Probe; };
    for (const [method, kind] of [["applyWindowWidthOverride", "apply"], ["undoWindowWidthOverride", "undo"], ["redoWindowWidthOverride", "redo"]]) {
      const original = BuildingRunController.prototype[method];
      if (typeof original !== "function") throw new Error("P12 requires the actual public history method " + method);
      const replacement = function (...args) {
        const outer = probe.depth++ === 0;
        const action = outer ? { kind, request: { expectedSourceContentHash: args[0].expectedSourceContentHash, expectedRevision: args[0].expectedRevision },
          historyBefore: this.getWindowWidthHistoryState() } : null;
        let returned;
        try { returned = original.apply(this, args); }
        catch (error) { probe.depth -= 1; if (outer) probe.completed += 1; throw error; }
        return returned.then(result => {
          if (outer && !result.stale && result.fixture?.sourceSnapshot) {
            const source = result.fixture.sourceSnapshot, p6 = window.__buildoP6Probe;
            p6.controller = this; p6.acceptedFixture = result.fixture; p6.acceptedRunId = result.runId;
            probe.acceptedFixture = result.fixture;
            probe.actions.push({ ...action, runId: result.runId, sourceContentHash: source.sourceContentHash,
              revision: source.document.revision, historyAfter: this.getWindowWidthHistoryState() });
          }
          return result;
        }).finally(() => { probe.depth -= 1; if (outer) probe.completed += 1; });
      };
      BuildingRunController.prototype[method] = replacement;
      restores.push(() => { if (BuildingRunController.prototype[method] === replacement) BuildingRunController.prototype[method] = original; });
    }
  });
}

async function p12History(page) {
  const state = P12HistorySchema.parse(await page.evaluate(() => {
    const controller = window.__buildoP6Probe?.controller;
    if (!controller) throw new Error("P12 requires the current actual controller.");
    const state = controller.getWindowWidthHistoryState();
    if (!Object.isFrozen(state) || state === controller.getWindowWidthHistoryState()) throw new Error("P12 history must be fresh frozen metadata.");
    return state;
  }));
  assert.equal(await page.getByRole("button", { name: "Undo width", exact: true }).isEnabled(), state.canUndo);
  assert.equal(await page.getByRole("button", { name: "Redo width", exact: true }).isEnabled(), state.canRedo);
  return state;
}

async function p12ProveWidthHistory(page, sourceCodec, artifactDir) {
  const context = page.context(), url = page.url(), captures = [], steps = [];
  let recoveredPage, returnRecovered = false;
  const empty = { undoCount: 0, redoCount: 0, canUndo: false, canRedo: false };
  const materialChecks = (saved, baseline) => {
    assert.deepEqual(saved.decoded.file.materials, baseline.decoded.file.materials, "P12 complete material metadata changed");
    for (const name of workspaceChannels) assert.deepEqual(Buffer.from(saved.decoded.packedAtlas.channels[name].data),
      Buffer.from(baseline.decoded.packedAtlas.channels[name].data), "P12 raw material channel changed: " + name);
  };
  const sourceAtRevision = (saved, revision) => {
    const owned = structuredClone(saved.decoded.sourceSnapshot); owned.document.revision = revision; return owned;
  };
  const geometryEqual = (actual, expected) => {
    assert.deepEqual(actual.captured.owned.ir, expected.captured.owned.ir);
    assert.deepEqual(actual.captured.owned.gallery, expected.captured.owned.gallery);
    assert.deepEqual(actual.captured.owned.inputs, expected.captured.owned.inputs);
    const instances = step => step.captured.owned.selection.instances.map(instance => ({ semanticPath: instance.semanticPath, batchId: instance.batchId,
      elementIndex: instance.elementIndex, instanceIndex: instance.instanceIndex, vertexCount: instance.vertexCount,
      matrix: instance.matrix, irMatrix: instance.irMatrix }));
    assert.deepEqual(instances(actual), instances(expected), "P12 actual submitted native instances changed");
    assert.notEqual(actual.captured.owned.draw.rootUuid, expected.captured.owned.draw.rootUuid, "P12 must publish a fresh runtime owner");
  };
  const counters = activePage => activePage.evaluate(() => ({ counters: { ...window.__buildoP6Probe.counters }, storage: { ...window.__buildoP6Probe.storage } }));
  async function collect(activePage, target, phase) {
    const saved = await workspaceDownload(activePage, sourceCodec);
    assert.equal(saved.decoded.sourceSnapshot.schemaVersion, "0.4.0");
    const captured = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    let sourceFile = null, snapshot = null;
    if (artifactDir) {
      const sourceName = "p12-" + phase + "-source.json";
      await writeFile(path.join(artifactDir, sourceName), saved.bytes, { flag: "wx" });
      sourceFile = { file: sourceName, sha256: workspaceHash(saved.bytes), byteLength: saved.bytes.length };
      if (phase !== "initial") {
        const owned = P12OwnedStepSchemaFor(sourceCodec.BuildingSourceSnapshotSchema).parse({ ...captured.owned,
          packetKind: "buildo-r3-p12-owned-window-step", name: phase });
        const bytes = Buffer.from(JSON.stringify(owned, null, 2) + "\n"), file = "p12-" + phase + "-owned.json";
        await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
        snapshot = { file, sha256: workspaceHash(bytes), byteLength: bytes.length };
      }
    }
    const step = P12HistoryStepSchema.parse({ phase, history: await p12History(activePage),
      capture: { ...captured.receipt, snapshot }, sourceFile });
    return { saved, captured, step };
  }
  async function waitAction(count) {
    await page.waitForFunction(expected => window.__buildoP12Probe?.completed >= expected, count, { timeout: 30000 });
    const observed = await page.evaluate(() => ({ completed: window.__buildoP12Probe.completed, accepted: window.__buildoP12Probe.actions.length }));
    assert.deepEqual(observed, { completed: count, accepted: count });
    await workspaceReady(page);
  }
  async function captureUi(activePage, name) {
    const button = activePage.getByRole("button", { name: "Undo width", exact: true });
    await button.scrollIntoViewIfNeeded(); await button.waitFor({ state: "visible" });
    assert.equal(await activePage.getByRole("button", { name: "Redo width", exact: true }).isVisible(), true);
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    assert.equal(await activePage.locator('canvas[aria-label="Assembly Hall Three.js canvas"]').count(), 1);
    if (artifactDir) {
      const bytes = await activePage.screenshot({ fullPage: true }), file = "p12-" + name + ".png";
      await writeFile(path.join(artifactDir, file), bytes, { flag: "wx" });
      captures.push({ file, sha256: workspaceHash(bytes), byteLength: bytes.length });
    }
  }
  try {
    await p12InstallProbe(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const editedAddress = await page.evaluate(() => {
      const probe = window.__buildoP6Probe, fixture = probe?.current?.fixture, source = fixture?.sourceSnapshot;
      if (fixture !== probe?.acceptedFixture || source?.schemaVersion !== "0.4.0" || source.windowWidthOverrides.length !== 1) {
        throw new Error("P12 requires the actual recovered single-width owner.");
      }
      return structuredClone(source.windowWidthOverrides[0].address);
    });
    const target = await p6PickWindow(page, editedAddress), initial = await collect(page, target, "initial");
    assert.deepEqual(initial.step.history, empty);
    const revision = initial.saved.decoded.sourceSnapshot.document.revision;
    const secondWidth = initial.captured.owned.selection.currentWidthM;
    const firstWidth = Number(Math.max(0.23, secondWidth * 0.6).toFixed(6));
    assert.ok(firstWidth < secondWidth && secondWidth < target.baseWidthM);
    const before = await counters(page);
    const input = page.getByLabel("Window width (m)", { exact: true });
    async function apply(width, count, phase) {
      await input.fill(String(width));
      assert.equal(await page.getByRole("button", { name: "Apply", exact: true }).isEnabled(), true);
      await page.getByRole("button", { name: "Apply", exact: true }).click(); await waitAction(count);
      const selected = await p6PickWindow(page, target.address), result = await collect(page, selected, phase);
      materialChecks(result.saved, initial.saved);
      assert.equal(result.captured.owned.selection.currentWidthM, width);
      assert.deepEqual(result.captured.owned.inputs, initial.captured.owned.inputs);
      const expected = structuredClone(initial.saved.decoded.sourceSnapshot);
      expected.document.revision = result.saved.decoded.sourceSnapshot.document.revision;
      expected.sourceContentHash = result.saved.decoded.sourceSnapshot.sourceContentHash;
      expected.windowWidthOverrides = [{ schemaVersion: "0.1.0", address: target.address, widthM: width }];
      assert.deepEqual(result.saved.decoded.sourceSnapshot, expected, "P12 width edit changed pinned source dependencies");
      steps.push(result.step); return result;
    }
    const first = await apply(firstWidth, 1, "first"), second = await apply(secondWidth, 2, "second");
    assert.deepEqual(first.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    assert.deepEqual(second.step.history, { undoCount: 2, redoCount: 0, canUndo: true, canRedo: false });
    assert.equal(first.step.capture.revision, revision + 1); assert.equal(second.step.capture.revision, revision + 2);
    assert.deepEqual(sourceAtRevision(second.saved, revision), initial.saved.decoded.sourceSnapshot); geometryEqual(second, initial);
    p6Matrices(initial.captured, first.captured, secondWidth, firstWidth, "narrow");
    p6Matrices(first.captured, second.captured, firstWidth, secondWidth, "increase");

    await page.getByRole("button", { name: "Undo width", exact: true }).click(); await waitAction(3);
    const undo = await collect(page, await p6PickWindow(page, target.address), "undo"); steps.push(undo.step);
    materialChecks(undo.saved, initial.saved); geometryEqual(undo, first);
    assert.deepEqual(sourceAtRevision(undo.saved, first.step.capture.revision), first.saved.decoded.sourceSnapshot);
    assert.equal(undo.step.capture.revision, revision + 3);
    assert.deepEqual(undo.step.history, { undoCount: 1, redoCount: 1, canUndo: true, canRedo: true });
    const undoAcknowledgement = await p11Acknowledged(page, undo.saved), beforeIdentical = await counters(page);
    await input.fill(String(firstWidth));
    assert.equal(await page.getByRole("button", { name: "Apply", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Redo width", exact: true }).isEnabled(), true);
    assert.deepEqual(await p12History(page), undo.step.history);
    const identical = await workspaceDownload(page, sourceCodec);
    assert.deepEqual(identical.bytes, undo.saved.bytes);
    assert.deepEqual(await p11Acknowledged(page, identical), undoAcknowledgement);
    assert.equal((await page.evaluate(() => window.__buildoP12Probe.completed)), 3);
    assert.equal((await counters(page)).storage.checkpointPuts, beforeIdentical.storage.checkpointPuts);

    await page.getByRole("button", { name: "Redo width", exact: true }).click(); await waitAction(4);
    const redo = await collect(page, await p6PickWindow(page, target.address), "redo"); steps.push(redo.step);
    materialChecks(redo.saved, initial.saved); geometryEqual(redo, second);
    assert.deepEqual(sourceAtRevision(redo.saved, second.step.capture.revision), second.saved.decoded.sourceSnapshot);
    assert.equal(redo.step.capture.revision, revision + 4);
    assert.deepEqual(redo.step.history, { undoCount: 2, redoCount: 0, canUndo: true, canRedo: false });
    const ownerAcknowledgement = await p11Acknowledged(page, redo.saved), after = await counters(page);
    const delta = Object.fromEntries(Object.keys(before.counters).map(key => [key, after.counters[key] - before.counters[key]]));
    for (const key of ["opensStarted", "opensFinished", "runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears"]) assert.equal(delta[key], 0);
    assert.equal(after.storage.checkpointPuts - before.storage.checkpointPuts, 4);
    const actions = await page.evaluate(() => window.__buildoP12Probe.actions);
    assert.deepEqual(actions.map(action => action.kind), ["apply", "apply", "undo", "redo"]);
    for (const [index, previous] of [initial, first, second, undo].entries()) {
      assert.deepEqual(actions[index].request, { expectedSourceContentHash: previous.saved.decoded.sourceSnapshot.sourceContentHash,
        expectedRevision: previous.saved.decoded.sourceSnapshot.document.revision });
      assert.equal(actions[index].revision, revision + index + 1);
    }
    await captureUi(page, "redo-desktop");
    await page.evaluate(() => { window.__buildoP12Probe.restore(); window.__buildoP6Probe.restore(); });
    await page.close();
    recoveredPage = await p11BootstrapPage(context, url, { width: 390, height: 844 });
    await p11WaitRecovery(recoveredPage, "recovered-source"); await workspaceReady(recoveredPage);
    const recovered = await collect(recoveredPage, await p6PickWindow(recoveredPage, target.address), "recovered"); steps.push(recovered.step);
    assert.deepEqual(recovered.saved.bytes, redo.saved.bytes); materialChecks(recovered.saved, initial.saved); geometryEqual(recovered, redo);
    assert.deepEqual(recovered.step.history, empty);
    const recoveredAcknowledgement = await p11Acknowledged(recoveredPage, recovered.saved), recovery = await p11StartupSnapshot(recoveredPage);
    assert.deepEqual(recovery.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 1, opensFinished: 1, runsStarted: 0,
      interpreterCalls: 0, providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    assert.equal(recovery.storage.checkpointGets, 1); assert.equal(recovery.storage.legacyGets, 0); assert.equal(recovery.storage.legacyLists, 0);
    assert.ok(recovery.lockRequests.some(request => request.granted));
    await captureUi(recoveredPage, "recovered-compact");
    const receipt = P12WidthHistoryReceiptSchema.parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r3-p12-window-width-history-e2e", documentId: "e2e-family-doc", initial: initial.step, steps, actions,
      identicalDraft: { applyDisabled: true, redoRetained: true, noAction: true, sourceLiteralEqual: true, acceptedRunUnchanged: true,
        revisionUnchanged: true, checkpointPutsDelta: 0 }, ownerAcknowledgement, owningPageClosed: true, recovery, recoveredAcknowledgement,
      coldHistoryAfterRecovery: recovered.step.history, editing: { counters: delta, checkpointPuts: 4 },
      materials: { fullMetadataEqual: true, allFiveRawChannelsEqual: true, channels: workspaceChannels.map(name => ({ name,
        byteLength: initial.saved.decoded.packedAtlas.channels[name].data.byteLength,
        sha256: workspaceHash(Buffer.from(initial.saved.decoded.packedAtlas.channels[name].data)) })) },
      comparisons: { secondMatchesInitialGeometry: true, undoMatchesFirstSourceAndGeometry: true, redoMatchesSecondSourceAndGeometry: true,
        monotonicAcceptedRevisions: true, recoveredLiteralSource: true, recoveredIrGalleryInputsEqual: true }, captures
    });
    assert.deepEqual(steps.map(step => step.phase), ["first", "second", "undo", "redo", "recovered"]);
    assert.equal(captures.length, artifactDir ? 2 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p12-window-width-history.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P12_WINDOW_WIDTH_HISTORY_E2E_RESULT=" + JSON.stringify(receipt));
    returnRecovered = true; return recoveredPage;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => window.__buildoP12Probe?.restore()).catch(() => undefined);
    if (recoveredPage && !returnRecovered) {
      try { await recoveredPage.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
      finally { await recoveredPage.close(); }
    }
  }
}

// P15 receipt-schema block; legacy P6/P11/P12 schemas remain unchanged.
const P15StepSchema = P6StepSchema.extend({ sourceVersion: z.literal("0.5.0") }).strict();
const P15BatchSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  directives: z.array(P6DirectiveSchema).length(2) }).strict();
const P15PhaseSchema = z.enum(["opened", "edited", "undo", "redo", "recovered"]);
const P15BatchStepSchema = z.object({ phase: P15PhaseSchema, history: P12HistorySchema,
  capture: P15StepSchema, sourceFile: P6FileSchema.nullable() }).strict();
const P15BatchReceiptSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r3-p15-width-batch-source-e2e"),
  documentId: z.literal("e2e-family-doc"), initialBatch: P15BatchSchema,
  constructedSource: P6FileSchema.nullable(), steps: z.array(P15BatchStepSchema).length(5),
  selectedAddress: P6AddressSchema, untouchedDirective: P6DirectiveSchema,
  untouchedSelections: z.array(P6SelectionSchema).length(3),
  ownerAcknowledgement: P11AcknowledgementSchema, owningPageClosed: z.literal(true),
  recovery: P11StartupSchema, recoveredAcknowledgement: P11AcknowledgementSchema,
  actions: z.array(z.object({ kind: z.enum(["apply", "undo", "redo"]), request: P12HistoryRequestSchema,
    runId: z.string().min(1), sourceContentHash: P6HashSchema, revision: z.number().int().nonnegative(),
    historyBefore: P12HistorySchema, historyAfter: P12HistorySchema }).strict()).length(3),
  editing: z.object({ counters: P6CountersSchema, checkpointPuts: z.literal(4) }).strict(),
  materials: z.object({ fullMetadataEqual: z.literal(true), allFiveRawChannelsEqual: z.literal(true),
    channels: z.array(z.object({ name: z.enum(workspaceChannels),
      byteLength: z.number().int().positive(), sha256: P6HashSchema }).strict()).length(5) }).strict(),
  comparisons: z.object({ openedLiteralSource: z.literal(true), openedMatchesDirectBatchCompiler: z.literal(true),
    secondMemberEdited: z.literal(true), otherMemberRetained: z.literal(true),
    undoRedoFullSourceAndGeometry: z.literal(true), monotonicAcceptedRevisions: z.literal(true),
    recoveredLiteralSource: z.literal(true), recoveredIrGalleryInputsEqual: z.literal(true),
    coldHistoryEmpty: z.literal(true) }).strict(), captures: z.array(P6FileSchema).max(3)
}).strict();

async function p15ProveBatchSource(page, sourceCodec, artifactDir) {
  const context = page.context(), url = page.url(), steps = [], captures = [], untouchedSelections = [];
  const empty = { undoCount: 0, redoCount: 0, canUndo: false, canRedo: false };
  let recoveredPage, returned = false;
  const same = (left, right) => assert.deepEqual(left, right);
  const key = address => JSON.stringify(address);
  const materialChecks = (actual, expected) => {
    same(actual.decoded.file.materials, expected.decoded.file.materials);
    for (const name of workspaceChannels) same(Buffer.from(actual.decoded.packedAtlas.channels[name].data),
      Buffer.from(expected.decoded.packedAtlas.channels[name].data));
  };
  const geometryEqual = (actual, expected) => {
    for (const field of ["ir", "gallery", "inputs"]) same(actual.captured.owned[field], expected.captured.owned[field]);
    assert.notEqual(actual.captured.owned.draw.rootUuid, expected.captured.owned.draw.rootUuid);
  };
  const counters = activePage => activePage.evaluate(() => ({
    counters: { ...window.__buildoP6Probe.counters }, storage: { ...window.__buildoP6Probe.storage }
  }));
  async function artifact(name, bytes) {
    if (!artifactDir) return null;
    await writeFile(path.join(artifactDir, name), bytes, { flag: "wx" });
    return { file: name, sha256: workspaceHash(bytes), byteLength: bytes.length };
  }
  async function collect(activePage, address, phase) {
    const target = await p6PickWindow(activePage, address), saved = await workspaceDownload(activePage, sourceCodec);
    assert.equal(saved.decoded.sourceSnapshot.schemaVersion, "0.5.0");
    const captured = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    let snapshot = null;
    if (["opened", "edited", "recovered"].includes(phase)) {
      const { name: omittedName, ...capturedFields } = captured.owned; void omittedName;
      const owned = z.object({ schemaVersion: z.literal("0.1.0"),
        packetKind: z.literal("buildo-r3-p15-owned-batch-step"), phase: P15PhaseSchema,
        source: sourceCodec.BuildingSourceSnapshotSchema, ir: P6EncodedValueSchema,
        gallery: P6EncodedValueSchema, inputs: P6EncodedValueSchema,
        selection: P6SelectionSchema, draw: P6DrawSchema }).strict().parse({
          ...capturedFields, packetKind: "buildo-r3-p15-owned-batch-step", phase });
      snapshot = await artifact("p15-" + phase + "-owned.json", Buffer.from(JSON.stringify(owned, null, 2) + "\n"));
    }
    const sourceFile = await artifact("p15-" + phase + "-source.json", saved.bytes);
    const step = P15BatchStepSchema.parse({ phase, history: await p12History(activePage),
      capture: { ...captured.receipt, snapshot }, sourceFile });
    return { target, saved, captured, step };
  }
  async function untouched(activePage, saved, directive) {
    const target = await p6PickWindow(activePage, directive.address);
    const value = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    assert.equal(value.owned.selection.currentWidthM, directive.widthM);
    untouchedSelections.push(value.owned.selection);
  }
  async function screenshot(activePage, name) {
    await activePage.getByLabel("Window width (m)", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    const capture = await artifact("p15-" + name + ".png", await activePage.screenshot({ fullPage: true }));
    if (capture) captures.push(capture);
  }
  async function waitAction(count) {
    await page.waitForFunction(expected => window.__buildoP12Probe?.completed >= expected, count, { timeout: 30000 });
    same(await page.evaluate(() => ({ completed: window.__buildoP12Probe.completed,
      accepted: window.__buildoP12Probe.actions.length })), { completed: count, accepted: count });
    await workspaceReady(page);
  }
  try {
    const prior = await workspaceDownload(page, sourceCodec);
    await p11Acknowledged(page, prior);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const directives = await page.evaluate(async () => {
      const fixture = window.__buildoP6Probe.current.fixture;
      const { buildAssemblyHallSourceWindowSplit } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
      const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: fixture.sourceSnapshot, catalog: fixture.catalog });
      const windows = base.openings.filter(value => value.kind === "window" && value.facade === "front" &&
        value.floorIndex === 1 && value.sizeM[0] > 0.8).sort((a, b) => a.bayIndex - b.bayIndex).slice(0, 2);
      if (windows.length !== 2) throw new Error("P15 requires two actual front windows.");
      return windows.map((value, index) => ({ schemaVersion: "0.1.0",
        address: { schemaVersion: "0.1.0", facade: value.facade, floorIndex: value.floorIndex, bayIndex: value.bayIndex },
        widthM: index === 0 ? 0.6 : 0.8 }));
    });
    const initialBatch = P15BatchSchema.parse({ schemaVersion: "0.1.0", directives });
    const source = await sourceCodec.deriveBuildingSourceWindowWidthBatchEdit({
      sourceSnapshot: prior.decoded.sourceSnapshot, windowWidthBatch: initialBatch });
    assert.equal(source.schemaVersion, "0.5.0"); same(source.windowWidthBatch, initialBatch);
    const file = await sourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
      packedAtlas: prior.decoded.packedAtlas, debugExport: prior.decoded.debugExport });
    const fileBytes = Buffer.from(JSON.stringify(file, null, 2));
    const constructedSource = await artifact("p15-constructed-source.json", fileBytes);
    async function directExpected(batch) {
      return page.evaluate(async batch => {
        const probe = window.__buildoP6Probe, fixture = probe.current.fixture;
        const [{ compileBuilding }, { buildComponentGallery }] = await Promise.all([
          import("/src/features/building-family/compiler/buildingCompiler.ts"),
          import("/src/features/building-family/compiler/componentGalleryBuilder.ts")
        ]);
        const ir = await compileBuilding({ spec: fixture.spec, catalog: fixture.catalog, graph: fixture.graph,
          buildingId: fixture.ir.buildingId, ...fixture.sourceSnapshot.compilation, windowWidthBatch: batch });
        const gallery = await buildComponentGallery({ catalog: fixture.catalog, ir });
        return { ir: probe.own(ir), gallery: probe.own(gallery),
          inputs: probe.own({ spec: fixture.spec, graph: fixture.graph, catalog: fixture.catalog }) };
      }, batch);
    }
    const expected = await directExpected(initialBatch);
    const before = await counters(page);
    await p12InstallProbe(page);
    await page.getByLabel("Open Source File").setInputFiles({
      name: "p15-two-window-source.json", mimeType: "application/json", buffer: fileBytes });
    await page.waitForFunction(count => window.__buildoP6Probe.counters.opensFinished >= count,
      before.counters.opensFinished + 1, { timeout: 30000 });
    await workspaceReady(page);
    const untouchedDirective = initialBatch.directives[0], selected = initialBatch.directives[1];
    const opened = await collect(page, selected.address, "opened"); steps.push(opened.step);
    same(opened.saved.bytes, fileBytes); same(opened.step.history, empty);
    materialChecks(opened.saved, prior);
    for (const field of ["ir", "gallery", "inputs"]) same(opened.captured.owned[field], expected[field]);
    assert.equal(opened.captured.owned.selection.currentWidthM, selected.widthM);
    await untouched(page, opened.saved, untouchedDirective);
    await p6PickWindow(page, selected.address); await screenshot(page, "opened-desktop");
    await p11Acknowledged(page, opened.saved);
    const newWidth = 0.5, revision = source.document.revision;
    await page.getByLabel("Window width (m)", { exact: true }).fill(String(newWidth));
    assert.equal(await page.getByRole("button", { name: "Apply", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "Apply", exact: true }).click(); await waitAction(1);
    const edited = await collect(page, selected.address, "edited"); steps.push(edited.step);
    const editedBatch = { ...initialBatch, directives: initialBatch.directives.map(value =>
      key(value.address) === key(selected.address) ? { ...value, widthM: newWidth } : value) };
    same(edited.saved.decoded.sourceSnapshot.windowWidthBatch, editedBatch);
    const expectedEdited = structuredClone(source);
    expectedEdited.document.revision = revision + 1; expectedEdited.windowWidthBatch = editedBatch;
    expectedEdited.sourceContentHash = edited.saved.decoded.sourceSnapshot.sourceContentHash;
    same(edited.saved.decoded.sourceSnapshot, expectedEdited);
    assert.equal(edited.captured.owned.selection.currentWidthM, newWidth);
    materialChecks(edited.saved, prior);
    same(edited.captured.owned.inputs, opened.captured.owned.inputs);
    const editedExpected = await directExpected(editedBatch);
    for (const field of ["ir", "gallery", "inputs"]) same(edited.captured.owned[field], editedExpected[field]);
    p6Matrices(opened.captured, edited.captured, selected.widthM, newWidth, "narrow");
    await untouched(page, edited.saved, untouchedDirective);
    await p6PickWindow(page, selected.address); await screenshot(page, "edited-desktop");
    same(edited.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    await page.getByRole("button", { name: "Undo width", exact: true }).click(); await waitAction(2);
    const undo = await collect(page, selected.address, "undo"); steps.push(undo.step);
    geometryEqual(undo, opened); materialChecks(undo.saved, prior);
    const expectedUndo = structuredClone(source); expectedUndo.document.revision = revision + 2;
    same(undo.saved.decoded.sourceSnapshot, expectedUndo);
    same(undo.step.history, { undoCount: 0, redoCount: 1, canUndo: false, canRedo: true });
    await page.getByRole("button", { name: "Redo width", exact: true }).click(); await waitAction(3);
    const redo = await collect(page, selected.address, "redo"); steps.push(redo.step);
    geometryEqual(redo, edited); materialChecks(redo.saved, prior);
    const expectedRedo = structuredClone(edited.saved.decoded.sourceSnapshot); expectedRedo.document.revision = revision + 3;
    same(redo.saved.decoded.sourceSnapshot, expectedRedo);
    same(redo.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    const ownerAcknowledgement = await p11Acknowledged(page, redo.saved), after = await counters(page);
    const delta = Object.fromEntries(Object.keys(before.counters).map(key =>
      [key, after.counters[key] - before.counters[key]]));
    for (const key of ["runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears"])
      assert.equal(delta[key], 0);
    same([delta.widthStarted, delta.widthFinished, delta.opensStarted, delta.opensFinished], [1, 1, 1, 1]);
    assert.equal(after.storage.checkpointPuts - before.storage.checkpointPuts, 4);
    const actions = await page.evaluate(() => window.__buildoP12Probe.actions);
    same(actions.map(value => value.kind), ["apply", "undo", "redo"]);
    for (const [index, previous] of [opened, edited, undo].entries()) {
      same(actions[index].request, { expectedSourceContentHash: previous.saved.decoded.sourceSnapshot.sourceContentHash,
        expectedRevision: previous.saved.decoded.sourceSnapshot.document.revision });
      assert.equal(actions[index].revision, revision + index + 1);
    }
    await page.evaluate(() => { window.__buildoP12Probe.restore(); window.__buildoP6Probe.restore(); });
    await page.close();
    recoveredPage = await p11BootstrapPage(context, url, { width: 390, height: 844 });
    await p11WaitRecovery(recoveredPage, "recovered-source"); await workspaceReady(recoveredPage);
    const recovered = await collect(recoveredPage, selected.address, "recovered"); steps.push(recovered.step);
    same(recovered.saved.bytes, redo.saved.bytes); geometryEqual(recovered, redo); materialChecks(recovered.saved, prior);
    same(recovered.step.history, empty);
    await untouched(recoveredPage, recovered.saved, untouchedDirective);
    await p6PickWindow(recoveredPage, selected.address); await screenshot(recoveredPage, "recovered-compact");
    const nativeMatrices = value => value.instances.map(instance => instance.matrix);
    same(nativeMatrices(untouchedSelections[1]), nativeMatrices(untouchedSelections[0]));
    same(nativeMatrices(untouchedSelections[2]), nativeMatrices(untouchedSelections[0]));
    const recoveredAcknowledgement = await p11Acknowledged(recoveredPage, recovered.saved);
    const recovery = await p11StartupSnapshot(recoveredPage);
    same(recovery.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 1, opensFinished: 1,
      runsStarted: 0, interpreterCalls: 0, providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    same([recovery.storage.checkpointGets, recovery.storage.legacyGets, recovery.storage.legacyLists], [1, 0, 0]);
    assert.ok(recovery.lockRequests.some(value => value.granted));
    for (const ack of [ownerAcknowledgement, recoveredAcknowledgement]) {
      assert.equal(ack.sourceContentHash, redo.saved.decoded.sourceSnapshot.sourceContentHash);
      assert.equal(ack.revision, revision + 3);
    }
    const receipt = P15BatchReceiptSchema.parse({
      schemaVersion: "0.1.0", packetKind: "buildo-r3-p15-width-batch-source-e2e",
      documentId: "e2e-family-doc", initialBatch, constructedSource, steps,
      selectedAddress: selected.address, untouchedDirective, untouchedSelections,
      ownerAcknowledgement, owningPageClosed: true, recovery, recoveredAcknowledgement, actions,
      editing: { counters: delta, checkpointPuts: 4 },
      materials: { fullMetadataEqual: true, allFiveRawChannelsEqual: true,
        channels: workspaceChannels.map(name => ({ name,
          byteLength: prior.decoded.packedAtlas.channels[name].data.byteLength,
          sha256: workspaceHash(Buffer.from(prior.decoded.packedAtlas.channels[name].data)) })) },
      comparisons: { openedLiteralSource: true, openedMatchesDirectBatchCompiler: true,
        secondMemberEdited: true, otherMemberRetained: true, undoRedoFullSourceAndGeometry: true,
        monotonicAcceptedRevisions: true, recoveredLiteralSource: true,
        recoveredIrGalleryInputsEqual: true, coldHistoryEmpty: true }, captures
    });
    same(steps.map(value => value.phase), ["opened", "edited", "undo", "redo", "recovered"]);
    assert.equal(captures.length, artifactDir ? 3 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p15-width-batch-source.json"),
      JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P15_WIDTH_BATCH_SOURCE_E2E_RESULT=" + JSON.stringify(receipt));
    returned = true; return recoveredPage;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => {
      window.__buildoP12Probe?.restore(); window.__buildoP6Probe?.restore();
    }).catch(() => undefined);
    if (recoveredPage && !returned) {
      try { await recoveredPage.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
      finally { await recoveredPage.close(); }
    }
  }
}

// P16 receipt-schema block; earlier native schemas and the single-window oracle stay literal.
const P16FloorDirectiveSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  facade: P6AddressSchema.shape.facade, floorIndex: z.number().int().nonnegative(),
  widthM: z.number().finite().min(0.23) }).strict();
const P16MemberSchema = z.object({ semanticPath: z.string().min(1), address: P6AddressSchema,
  baseWidthM: z.number().finite().positive(), currentWidthM: z.number().finite().positive(),
  instances: P6SelectionSchema.shape.instances }).strict();
const P16PhaseSchema = z.enum(["opened", "floor", "undo", "redo", "recovered"]);
const P16StepSchema = z.object({ phase: P16PhaseSchema, history: P12HistorySchema,
  capture: P15StepSchema, sourceFile: P6FileSchema.nullable(),
  floorMembers: z.array(P16MemberSchema).min(2), outside: P16MemberSchema }).strict();
const P16ActionSchema = z.object({ kind: z.enum(["floor", "undo", "redo"]),
  request: P12HistoryRequestSchema, directive: P16FloorDirectiveSchema.nullable(),
  runId: z.string().min(1), sourceContentHash: P6HashSchema, revision: z.number().int().nonnegative(),
  historyBefore: P12HistorySchema, historyAfter: P12HistorySchema }).strict();
const P16MatrixSchema = z.object({ phase: z.enum(["floor", "undo", "redo"]),
  selectedPairs: z.number().int().min(4), unchangedMatrices: z.number().int().positive(),
  windows: z.array(z.object({ address: P6AddressSchema, oldWidthM: z.number().finite().positive(),
    newWidthM: z.number().finite().positive(), expectedRatio: z.number().finite().positive(),
    actualRatios: z.array(z.number().finite().positive()).length(2) }).strict()).min(2) }).strict();
const P16BatchSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  directives: z.array(P6DirectiveSchema).min(2) }).strict();
const P16FloorReceiptSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  packetKind: z.literal("buildo-r3-p16-window-floor-width-e2e"), documentId: z.literal("e2e-family-doc"),
  directive: P16FloorDirectiveSchema, initialBatch: P16BatchSchema, floorBatch: P16BatchSchema,
  constructedSource: P6FileSchema.nullable(), selectedAddress: P6AddressSchema, outsideDirective: P6DirectiveSchema,
  steps: z.array(P16StepSchema).length(5), matrices: z.array(P16MatrixSchema).length(3),
  actions: z.array(P16ActionSchema).length(3), ownerAcknowledgement: P11AcknowledgementSchema,
  owningPageClosed: z.literal(true), recovery: P11StartupSchema, recoveredAcknowledgement: P11AcknowledgementSchema,
  editing: z.object({ counters: P6CountersSchema, checkpointPuts: z.literal(4) }).strict(),
  materials: z.object({ fullMetadataEqual: z.literal(true), allFiveRawChannelsEqual: z.literal(true),
    channels: z.array(z.object({ name: z.enum(workspaceChannels), byteLength: z.number().int().positive(),
      sha256: P6HashSchema }).strict()).length(5) }).strict(),
  comparisons: z.object({ openedLiteralSource: z.literal(true), fullFloorMatchesDirectCompiler: z.literal(true),
    everyAffectedNativePairChanged: z.literal(true), allOutsideTransformsExact: z.literal(true),
    outsideOverrideRetained: z.literal(true), oneFloorHistoryEntryAndRevision: z.literal(true),
    undoRedoFullSetAndGeometry: z.literal(true), recoveredLiteralSource: z.literal(true),
    recoveredIrGalleryInputsEqual: z.literal(true), coldHistoryEmpty: z.literal(true) }).strict(),
  captures: z.array(P6FileSchema).max(3) }).strict();
async function p16InstallProbe(page) {
  await page.evaluate(async () => {
    if (window.__buildoP16Probe || window.__buildoP12Probe) throw new Error("P16 requires fresh history instrumentation.");
    const { BuildingRunController } = await import("/src/features/building-family/state/buildingRunController.ts");
    const probe = { depth: 0, completed: 0, actions: [] }, restores = [];
    window.__buildoP16Probe = probe;
    probe.restore = () => { for (const restore of restores.splice(0).reverse()) restore(); delete window.__buildoP16Probe; };
    for (const [method, kind] of [["applyWindowFloorWidthOverride", "floor"],
      ["undoWindowWidthOverride", "undo"], ["redoWindowWidthOverride", "redo"]]) {
      const original = BuildingRunController.prototype[method];
      if (typeof original !== "function") throw new Error("P16 requires the actual public method " + method);
      const replacement = function (...args) {
        const outer = probe.depth++ === 0;
        const action = outer ? { kind, request: { expectedSourceContentHash: args[0].expectedSourceContentHash,
          expectedRevision: args[0].expectedRevision }, directive: kind === "floor" ? structuredClone(args[0].directive) : null,
          historyBefore: this.getWindowWidthHistoryState() } : null;
        let returned;
        try { returned = original.apply(this, args); }
        catch (error) { probe.depth -= 1; if (outer) probe.completed += 1; throw error; }
        return returned.then(result => {
          if (outer && !result.stale && result.fixture?.sourceSnapshot) {
            const source = result.fixture.sourceSnapshot, p6 = window.__buildoP6Probe;
            p6.controller = this; p6.acceptedFixture = result.fixture; p6.acceptedRunId = result.runId;
            probe.actions.push({ ...action, runId: result.runId, sourceContentHash: source.sourceContentHash,
              revision: source.document.revision, historyAfter: this.getWindowWidthHistoryState() });
          }
          return result;
        }).finally(() => { probe.depth -= 1; if (outer) probe.completed += 1; });
      };
      BuildingRunController.prototype[method] = replacement;
      restores.push(() => { if (BuildingRunController.prototype[method] === replacement) BuildingRunController.prototype[method] = original; });
    }
  });
}
async function p16NativeMembers(page, addresses, expectedSource) {
  const result = await page.evaluate(async ({ addresses, hash, revision }) => {
    const { buildAssemblyHallSourceWindowSplit } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { resolveWindowOpeningFromSlotAddress } = await import("/src/features/building-family/compiler/facadeSplitPlan.ts");
    const probe = window.__buildoP6Probe, { fixture, scene, canvas } = probe.current, source = fixture.sourceSnapshot;
    if (source?.schemaVersion !== "0.5.0" || source.sourceContentHash !== hash || source.document.revision !== revision)
      throw new Error("P16 member source owner mismatch.");
    const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: source, catalog: fixture.catalog });
    if (probe.current.fixture !== fixture || fixture.sourceSnapshot !== source || !canvas.isConnected)
      throw new Error("P16 member owner changed during base reconstruction.");
    const key = value => JSON.stringify(value);
    return addresses.map(address => {
      const opening = resolveWindowOpeningFromSlotAddress(base, address);
      const override = source.windowWidthBatch.directives.find(value => key(value.address) === key(address));
      const instances = [opening.semanticPath, opening.semanticPath + "/glass"].map(semanticPath => {
        const lookup = fixture.buildingRuntime.semanticLookup.get(semanticPath);
        const entry = fixture.ir.semanticIndex.find(value => value.semanticPath === semanticPath);
        const batch = fixture.ir.instanceBatches.find(value => value.batchId === entry?.batchId);
        const object = lookup?.object, instanceIndex = lookup?.instanceIndex ?? lookup?.elementIndex;
        const draw = object && probe.draws.get(object.uuid);
        if (!entry || entry.elementIndex === undefined || !batch?.transforms || !object?.isInstancedMesh ||
          instanceIndex === undefined || !draw || draw.fixture !== fixture || draw.canvas !== canvas || draw.scene !== scene)
          throw new Error("P16 window pair was not actually submitted on this current canvas.");
        const matrix = object.matrix.clone(); object.getMatrixAt(instanceIndex, matrix);
        const irMatrix = Array.from(batch.transforms.subarray(entry.elementIndex * 16, (entry.elementIndex + 1) * 16));
        if (matrix.elements.some((value, index) => value !== irMatrix[index])) throw new Error("P16 native/source index mapping differs.");
        return { semanticPath, batchId: entry.batchId, elementIndex: entry.elementIndex, instanceIndex,
          objectUuid: object.uuid, geometryUuid: object.geometry.uuid,
          vertexCount: object.geometry.getAttribute("position").count, drawnSequence: draw.sequence,
          matrix: [...matrix.elements], irMatrix };
      });
      return { semanticPath: opening.semanticPath, address, baseWidthM: opening.sizeM[0],
        currentWidthM: override?.widthM ?? opening.sizeM[0], instances };
    });
  }, { addresses, hash: expectedSource.sourceContentHash, revision: expectedSource.document.revision });
  return z.array(P16MemberSchema).parse(result);
}
function p16FloorMatrices(before, after, phase) {
  assert.deepEqual(p6Entry(after.captured.owned.ir, "semanticIndex"), p6Entry(before.captured.owned.ir, "semanticIndex"));
  const key = address => JSON.stringify(address), pairs = new Map(), windows = [];
  assert.equal(before.step.floorMembers.length, after.step.floorMembers.length);
  for (const old of before.step.floorMembers) {
    const next = after.step.floorMembers.find(value => key(value.address) === key(old.address));
    assert.ok(next); assert.notEqual(next.currentWidthM, old.currentWidthM);
    assert.equal(next.semanticPath, old.semanticPath); assert.equal(next.baseWidthM, old.baseWidthM);
    const frameWidth = width => Math.max(0.15, Math.max(0.2, width) - 2 * 0.04);
    const window = { address: old.address, oldWidthM: old.currentWidthM, newWidthM: next.currentWidthM,
      expectedRatio: frameWidth(next.currentWidthM) / frameWidth(old.currentWidthM), actualRatios: [] };
    for (const instance of old.instances) {
      const identity = instance.batchId + ":" + instance.elementIndex;
      assert.equal(pairs.has(identity), false); pairs.set(identity, window);
      const actual = next.instances.find(value => value.semanticPath === instance.semanticPath);
      assert.ok(actual); assert.equal(actual.batchId, instance.batchId); assert.equal(actual.elementIndex, instance.elementIndex);
      assert.deepEqual(actual.matrix, actual.irMatrix); assert.deepEqual(instance.matrix, instance.irMatrix);
    }
    windows.push(window);
  }
  const previous = p6Items(p6Entry(before.captured.owned.ir, "instanceBatches"));
  const next = p6Items(p6Entry(after.captured.owned.ir, "instanceBatches"));
  assert.equal(next.length, previous.length);
  let selectedPairs = 0, unchangedMatrices = 0;
  for (const [batchIndex, batch] of previous.entries()) {
    const other = next[batchIndex], batchId = p6Entry(batch, "batchId").value;
    assert.deepEqual(batch.entries.filter(([key]) => key !== "transforms"), other.entries.filter(([key]) => key !== "transforms"));
    const oldSpan = p6Entry(batch, "transforms"), newSpan = p6Entry(other, "transforms");
    assert.equal(oldSpan.kind, "typed"); assert.equal(newSpan.kind, "typed");
    const oldBytes = Buffer.from(oldSpan.base64, "base64"), newBytes = Buffer.from(newSpan.base64, "base64");
    assert.equal(newBytes.length, oldBytes.length);
    for (let index = 0; index < p6Entry(batch, "count").value; index += 1) {
      const a = oldBytes.subarray(index * 64, (index + 1) * 64), b = newBytes.subarray(index * 64, (index + 1) * 64);
      const chosen = pairs.get(batchId + ":" + index);
      if (!chosen) { assert.deepEqual(b, a); unchangedMatrices += 1; continue; }
      const oldMatrix = Array.from({ length: 16 }, (_, component) => a.readFloatLE(component * 4));
      const newMatrix = Array.from({ length: 16 }, (_, component) => b.readFloatLE(component * 4));
      assert.deepEqual(newMatrix.slice(3), oldMatrix.slice(3));
      for (let axis = 0; axis < 3; axis += 1)
        assert.ok(Math.abs(newMatrix[axis] - oldMatrix[axis] * chosen.expectedRatio) < 1e-6, "P16 floor X scale equation");
      const ratio = Math.hypot(...newMatrix.slice(0, 3)) / Math.hypot(...oldMatrix.slice(0, 3));
      assert.ok(Math.abs(ratio - chosen.expectedRatio) < 1e-6); chosen.actualRatios.push(ratio); selectedPairs += 1;
    }
  }
  assert.equal(selectedPairs, before.step.floorMembers.length * 2); assert.ok(unchangedMatrices > 0);
  return P16MatrixSchema.parse({ phase, selectedPairs, unchangedMatrices, windows });
}
async function p16ProveFloorWidth(page, sourceCodec, artifactDir) {
  const context = page.context(), url = page.url(), steps = [], captures = [], matrices = [];
  const empty = { undoCount: 0, redoCount: 0, canUndo: false, canRedo: false };
  const same = (a, b) => assert.deepEqual(a, b), key = value => JSON.stringify(value);
  let recoveredPage, returned = false;
  async function artifact(name, bytes) {
    if (!artifactDir) return null;
    await writeFile(path.join(artifactDir, name), bytes, { flag: "wx" });
    return { file: name, sha256: workspaceHash(bytes), byteLength: bytes.length };
  }
  function materialChecks(actual, expected) {
    same(actual.decoded.file.materials, expected.decoded.file.materials);
    for (const name of workspaceChannels) same(Buffer.from(actual.decoded.packedAtlas.channels[name].data),
      Buffer.from(expected.decoded.packedAtlas.channels[name].data));
  }
  function memberGeometry(member) {
    return { semanticPath: member.semanticPath, address: member.address, baseWidthM: member.baseWidthM,
      currentWidthM: member.currentWidthM, instances: member.instances.map(value => ({
        semanticPath: value.semanticPath, batchId: value.batchId, elementIndex: value.elementIndex,
        matrix: value.matrix, irMatrix: value.irMatrix })) };
  }
  function outsideEqual(actual, expected) { same(memberGeometry(actual.step.outside), memberGeometry(expected.step.outside)); }
  function geometryEqual(actual, expected) {
    for (const field of ["ir", "gallery", "inputs"]) same(actual.captured.owned[field], expected.captured.owned[field]);
    same(actual.step.floorMembers.map(memberGeometry), expected.step.floorMembers.map(memberGeometry));
    outsideEqual(actual, expected);
    assert.notEqual(actual.captured.owned.draw.rootUuid, expected.captured.owned.draw.rootUuid);
  }
  async function counters(activePage) {
    return activePage.evaluate(() => ({ counters: { ...window.__buildoP6Probe.counters },
      storage: { ...window.__buildoP6Probe.storage } }));
  }
  async function collect(activePage, selectedAddress, memberAddresses, phase) {
    const target = await p6PickWindow(activePage, selectedAddress), saved = await workspaceDownload(activePage, sourceCodec);
    assert.equal(saved.decoded.sourceSnapshot.schemaVersion, "0.5.0");
    const captured = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    const members = await p16NativeMembers(activePage, memberAddresses, saved.decoded.sourceSnapshot);
    same(members.map(value => value.address), memberAddresses);
    const floorMembers = members.slice(0, -1), outside = members.at(-1);
    const { name: omittedName, ...capturedFields } = captured.owned; void omittedName;
    const owned = z.object({ schemaVersion: z.literal("0.1.0"),
      packetKind: z.literal("buildo-r3-p16-owned-floor-step"), phase: P16PhaseSchema,
      source: sourceCodec.BuildingSourceSnapshotSchema, ir: P6EncodedValueSchema,
      gallery: P6EncodedValueSchema, inputs: P6EncodedValueSchema,
      selection: P6SelectionSchema, draw: P6DrawSchema,
      floorMembers: z.array(P16MemberSchema).min(2), outside: P16MemberSchema }).strict().parse({
        ...capturedFields, packetKind: "buildo-r3-p16-owned-floor-step", phase, floorMembers, outside });
    const snapshot = await artifact("p16-" + phase + "-owned.json", Buffer.from(JSON.stringify(owned, null, 2) + "\n"));
    const sourceFile = await artifact("p16-" + phase + "-source.json", saved.bytes);
    const step = P16StepSchema.parse({ phase, history: await p12History(activePage),
      capture: { ...captured.receipt, snapshot }, sourceFile, floorMembers, outside });
    return { saved, captured, step };
  }
  async function screenshot(activePage, name) {
    await activePage.getByLabel("Window width (m)", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    const capture = await artifact("p16-" + name + ".png", await activePage.screenshot({ fullPage: true }));
    if (capture) captures.push(capture);
  }
  async function waitAction(count) {
    await page.waitForFunction(expected => window.__buildoP16Probe?.completed >= expected, count, { timeout: 30000 });
    same(await page.evaluate(() => ({ completed: window.__buildoP16Probe.completed,
      accepted: window.__buildoP16Probe.actions.length })), { completed: count, accepted: count });
    await workspaceReady(page);
  }
  async function directExpected(batch) {
    return page.evaluate(async batch => {
      const probe = window.__buildoP6Probe, fixture = probe.current.fixture;
      const [{ compileBuilding }, { buildComponentGallery }] = await Promise.all([
        import("/src/features/building-family/compiler/buildingCompiler.ts"),
        import("/src/features/building-family/compiler/componentGalleryBuilder.ts")
      ]);
      const ir = await compileBuilding({ spec: fixture.spec, catalog: fixture.catalog, graph: fixture.graph,
        buildingId: fixture.ir.buildingId, ...fixture.sourceSnapshot.compilation, windowWidthBatch: batch });
      const gallery = await buildComponentGallery({ catalog: fixture.catalog, ir });
      return { ir: probe.own(ir), gallery: probe.own(gallery),
        inputs: probe.own({ spec: fixture.spec, graph: fixture.graph, catalog: fixture.catalog }) };
    }, batch);
  }
  try {
    const prior = await workspaceDownload(page, sourceCodec);
    await p11Acknowledged(page, prior);
    assert.equal(prior.decoded.sourceSnapshot.schemaVersion, "0.5.0");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const actual = await page.evaluate(async () => {
      const fixture = window.__buildoP6Probe.current.fixture;
      const { buildAssemblyHallSourceWindowSplit } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
      const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: fixture.sourceSnapshot, catalog: fixture.catalog });
      if (window.__buildoP6Probe.current.fixture !== fixture) throw new Error("P16 native base owner changed.");
      const address = value => ({ schemaVersion: "0.1.0", facade: value.facade,
        floorIndex: value.floorIndex, bayIndex: value.bayIndex });
      const windows = base.openings.filter(value => value.kind === "window" && value.facade === "front" &&
        value.floorIndex === 1).sort((a, b) => a.bayIndex - b.bayIndex);
      const outside = base.openings.filter(value => value.kind === "window" && value.facade === "front" &&
        value.floorIndex === 0 && value.sizeM[0] > 0.7).sort((a, b) => a.bayIndex - b.bayIndex)[0];
      if (windows.length < 2 || !outside || windows.some(value => value.sizeM[0] <= 0.4))
        throw new Error("P16 requires actual multiple front body windows and a separate ground window.");
      return { floorAddresses: windows.map(address), bases: windows.map(value => value.sizeM[0]),
        outsideDirective: { schemaVersion: "0.1.0", address: address(outside), widthM: 0.7 } };
    });
    const outsideDirective = P6DirectiveSchema.parse(actual.outsideDirective), selectedAddress = actual.floorAddresses[0];
    const directive = P16FloorDirectiveSchema.parse({ schemaVersion: "0.1.0",
      facade: selectedAddress.facade, floorIndex: selectedAddress.floorIndex, widthM: 0.4 });
    assert.equal(new Set(actual.floorAddresses.map(key)).size, actual.floorAddresses.length);
    const previousBatch = prior.decoded.sourceSnapshot.windowWidthBatch;
    assert.equal(previousBatch.directives.length, 2);
    assert.ok(previousBatch.directives.every(value => value.address.facade === directive.facade &&
      value.address.floorIndex === directive.floorIndex));
    const source = await sourceCodec.deriveBuildingSourceWindowWidthBatchEdit({
      sourceSnapshot: prior.decoded.sourceSnapshot, windowWidthBatch: { schemaVersion: "0.1.0",
        directives: [...previousBatch.directives, outsideDirective] } });
    assert.equal(source.schemaVersion, "0.5.0"); assert.equal(source.windowWidthBatch.directives.length, 3);
    const initialBatch = P16BatchSchema.parse(source.windowWidthBatch);
    const file = await sourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
      packedAtlas: prior.decoded.packedAtlas, debugExport: prior.decoded.debugExport });
    const fileBytes = Buffer.from(JSON.stringify(file, null, 2));
    const constructedSource = await artifact("p16-constructed-source.json", fileBytes);
    const expectedOpened = await directExpected(initialBatch), before = await counters(page);
    await p16InstallProbe(page);
    await page.getByLabel("Open Source File").setInputFiles({
      name: "p16-floor-and-outside-source.json", mimeType: "application/json", buffer: fileBytes });
    await page.waitForFunction(count => window.__buildoP6Probe.counters.opensFinished >= count,
      before.counters.opensFinished + 1, { timeout: 30000 });
    await workspaceReady(page);
    const memberAddresses = [...actual.floorAddresses, outsideDirective.address];
    const opened = await collect(page, selectedAddress, memberAddresses, "opened"); steps.push(opened.step);
    same(opened.saved.bytes, fileBytes); same(opened.step.history, empty); materialChecks(opened.saved, prior);
    for (const field of ["ir", "gallery", "inputs"]) same(opened.captured.owned[field], expectedOpened[field]);
    same(opened.step.floorMembers.map(member => member.baseWidthM), actual.bases);
    assert.ok(opened.step.floorMembers.every(value => value.currentWidthM > directive.widthM));
    assert.equal(opened.step.outside.currentWidthM, outsideDirective.widthM);
    await screenshot(page, "opened-desktop"); await p11Acknowledged(page, opened.saved);
    const revision = source.document.revision;
    const wantedBatch = { schemaVersion: "0.1.0", directives: [
      ...initialBatch.directives.filter(value => value.address.facade !== directive.facade ||
        value.address.floorIndex !== directive.floorIndex),
      ...actual.floorAddresses.map(address => ({ schemaVersion: "0.1.0", address, widthM: directive.widthM }))
    ] };
    const derivedFloorSource = await sourceCodec.deriveBuildingSourceWindowWidthBatchEdit({
      sourceSnapshot: source, windowWidthBatch: wantedBatch });
    assert.equal(derivedFloorSource.schemaVersion, "0.5.0");
    const expectedFloorSource = { ...derivedFloorSource, document: { ...derivedFloorSource.document, revision: revision + 1 } };
    const floorBatch = P16BatchSchema.parse(expectedFloorSource.windowWidthBatch), expectedFloor = await directExpected(floorBatch);
    await page.getByLabel("Window width (m)", { exact: true }).fill(String(directive.widthM));
    assert.equal(await page.getByRole("button", { name: "Apply to floor", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "Apply to floor", exact: true }).click(); await waitAction(1);
    const floor = await collect(page, selectedAddress, memberAddresses, "floor"); steps.push(floor.step);
    same(floor.saved.decoded.sourceSnapshot, expectedFloorSource);
    same(floor.saved.decoded.sourceSnapshot.windowWidthBatch, floorBatch);
    for (const field of ["ir", "gallery", "inputs"]) same(floor.captured.owned[field], expectedFloor[field]);
    same(floor.captured.owned.inputs, opened.captured.owned.inputs); materialChecks(floor.saved, prior);
    assert.ok(floor.step.floorMembers.every(value => value.currentWidthM === directive.widthM));
    outsideEqual(floor, opened); matrices.push(p16FloorMatrices(opened, floor, "floor"));
    same(floor.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    await screenshot(page, "floor-desktop");
    await page.getByRole("button", { name: "Undo width", exact: true }).click(); await waitAction(2);
    const undo = await collect(page, selectedAddress, memberAddresses, "undo"); steps.push(undo.step);
    const expectedUndo = structuredClone(source); expectedUndo.document.revision = revision + 2;
    same(undo.saved.decoded.sourceSnapshot, expectedUndo); geometryEqual(undo, opened); materialChecks(undo.saved, prior);
    matrices.push(p16FloorMatrices(floor, undo, "undo"));
    same(undo.step.history, { undoCount: 0, redoCount: 1, canUndo: false, canRedo: true });
    await page.getByRole("button", { name: "Redo width", exact: true }).click(); await waitAction(3);
    const redo = await collect(page, selectedAddress, memberAddresses, "redo"); steps.push(redo.step);
    const expectedRedo = structuredClone(expectedFloorSource); expectedRedo.document.revision = revision + 3;
    same(redo.saved.decoded.sourceSnapshot, expectedRedo); geometryEqual(redo, floor); materialChecks(redo.saved, prior);
    matrices.push(p16FloorMatrices(undo, redo, "redo"));
    same(redo.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    const ownerAcknowledgement = await p11Acknowledged(page, redo.saved), after = await counters(page);
    const delta = Object.fromEntries(Object.keys(before.counters).map(key => [key, after.counters[key] - before.counters[key]]));
    for (const key of ["runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears",
      "widthStarted", "widthFinished"]) assert.equal(delta[key], 0);
    same([delta.opensStarted, delta.opensFinished], [1, 1]);
    assert.equal(after.storage.checkpointPuts - before.storage.checkpointPuts, 4);
    const actions = z.array(P16ActionSchema).length(3).parse(await page.evaluate(() => window.__buildoP16Probe.actions));
    same(actions.map(value => value.kind), ["floor", "undo", "redo"]); same(actions[0].directive, directive);
    same(actions.slice(1).map(value => value.directive), [null, null]);
    for (const [index, previous] of [opened, floor, undo].entries()) {
      same(actions[index].request, { expectedSourceContentHash: previous.saved.decoded.sourceSnapshot.sourceContentHash,
        expectedRevision: previous.saved.decoded.sourceSnapshot.document.revision });
      assert.equal(actions[index].revision, revision + index + 1);
      same(actions[index].historyBefore, previous.step.history); same(actions[index].historyAfter, steps[index + 1].history);
      assert.equal(actions[index].sourceContentHash, steps[index + 1].capture.sourceContentHash);
    }
    await page.evaluate(() => { window.__buildoP16Probe.restore(); window.__buildoP6Probe.restore(); });
    await page.close();
    recoveredPage = await p11BootstrapPage(context, url, { width: 390, height: 844 });
    await p11WaitRecovery(recoveredPage, "recovered-source"); await workspaceReady(recoveredPage);
    const recovered = await collect(recoveredPage, selectedAddress, memberAddresses, "recovered"); steps.push(recovered.step);
    same(recovered.saved.bytes, redo.saved.bytes); geometryEqual(recovered, redo); materialChecks(recovered.saved, prior);
    same(recovered.step.history, empty); outsideEqual(recovered, opened);
    await screenshot(recoveredPage, "recovered-compact");
    const recoveredAcknowledgement = await p11Acknowledged(recoveredPage, recovered.saved);
    const recovery = await p11StartupSnapshot(recoveredPage);
    same(recovery.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 1, opensFinished: 1,
      runsStarted: 0, interpreterCalls: 0, providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    same([recovery.storage.checkpointGets, recovery.storage.legacyGets, recovery.storage.legacyLists], [1, 0, 0]);
    assert.ok(recovery.lockRequests.some(value => value.granted));
    for (const ack of [ownerAcknowledgement, recoveredAcknowledgement]) {
      assert.equal(ack.sourceContentHash, redo.saved.decoded.sourceSnapshot.sourceContentHash);
      assert.equal(ack.revision, revision + 3);
    }
    const receipt = P16FloorReceiptSchema.parse({ schemaVersion: "0.1.0",
      packetKind: "buildo-r3-p16-window-floor-width-e2e", documentId: "e2e-family-doc",
      directive, initialBatch, floorBatch, constructedSource, selectedAddress, outsideDirective, steps, matrices, actions,
      ownerAcknowledgement, owningPageClosed: true, recovery, recoveredAcknowledgement,
      editing: { counters: delta, checkpointPuts: 4 },
      materials: { fullMetadataEqual: true, allFiveRawChannelsEqual: true,
        channels: workspaceChannels.map(name => ({ name, byteLength: prior.decoded.packedAtlas.channels[name].data.byteLength,
          sha256: workspaceHash(Buffer.from(prior.decoded.packedAtlas.channels[name].data)) })) },
      comparisons: { openedLiteralSource: true, fullFloorMatchesDirectCompiler: true,
        everyAffectedNativePairChanged: true, allOutsideTransformsExact: true, outsideOverrideRetained: true,
        oneFloorHistoryEntryAndRevision: true, undoRedoFullSetAndGeometry: true, recoveredLiteralSource: true,
        recoveredIrGalleryInputsEqual: true, coldHistoryEmpty: true }, captures });
    same(steps.map(value => value.phase), ["opened", "floor", "undo", "redo", "recovered"]);
    assert.equal(captures.length, artifactDir ? 3 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p16-floor-width.json"),
      JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P16_WINDOW_FLOOR_WIDTH_E2E_RESULT=" + JSON.stringify(receipt));
    returned = true; return recoveredPage;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => {
      window.__buildoP16Probe?.restore(); window.__buildoP6Probe?.restore();
    }).catch(() => undefined);
    if (recoveredPage && !returned) {
      try { await recoveredPage.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
      finally { await recoveredPage.close(); }
    }
  }
}
// P18 vertical-bay workflow reuses the established native matrix proof equations. Earlier workflows stay literal.
const P18BayDirectiveSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  facade: P6AddressSchema.shape.facade, bayIndex: z.number().int().nonnegative(),
  widthM: z.number().finite().min(0.23) }).strict();
const P18MemberSchema = z.object({ semanticPath: z.string().min(1), address: P6AddressSchema,
  baseWidthM: z.number().finite().positive(), currentWidthM: z.number().finite().positive(),
  instances: P6SelectionSchema.shape.instances }).strict();
const P18PhaseSchema = z.enum(["opened", "bay", "undo", "redo", "recovered"]);
const P18StepSchema = z.object({ phase: P18PhaseSchema, history: P12HistorySchema,
  capture: P15StepSchema, sourceFile: P6FileSchema.nullable(),
  bayMembers: z.array(P18MemberSchema).min(2), outside: P18MemberSchema }).strict();
const P18ActionSchema = z.object({ kind: z.enum(["bay", "undo", "redo"]),
  request: P12HistoryRequestSchema, directive: P18BayDirectiveSchema.nullable(),
  runId: z.string().min(1), sourceContentHash: P6HashSchema, revision: z.number().int().nonnegative(),
  historyBefore: P12HistorySchema, historyAfter: P12HistorySchema }).strict();
const P18MatrixSchema = z.object({ phase: z.enum(["bay", "undo", "redo"]),
  selectedPairs: z.number().int().min(4), unchangedMatrices: z.number().int().positive(),
  windows: z.array(z.object({ address: P6AddressSchema, oldWidthM: z.number().finite().positive(),
    newWidthM: z.number().finite().positive(), expectedRatio: z.number().finite().positive(),
    actualRatios: z.array(z.number().finite().positive()).length(2) }).strict()).min(2) }).strict();
const P18BatchSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  directives: z.array(P6DirectiveSchema).min(2) }).strict();
const P18BayReceiptSchema = z.object({ schemaVersion: z.literal("0.1.0"),
  packetKind: z.literal("buildo-r3-p18-window-bay-width-e2e"), documentId: z.literal("e2e-family-doc"),
  directive: P18BayDirectiveSchema, initialBatch: P18BatchSchema, bayBatch: P18BatchSchema,
  constructedSource: P6FileSchema.nullable(), selectedAddress: P6AddressSchema, outsideDirective: P6DirectiveSchema,
  steps: z.array(P18StepSchema).length(5), matrices: z.array(P18MatrixSchema).length(3),
  actions: z.array(P18ActionSchema).length(3), ownerAcknowledgement: P11AcknowledgementSchema,
  owningPageClosed: z.literal(true), recovery: P11StartupSchema, recoveredAcknowledgement: P11AcknowledgementSchema,
  editing: z.object({ counters: P6CountersSchema, checkpointPuts: z.literal(4) }).strict(),
  materials: z.object({ fullMetadataEqual: z.literal(true), allFiveRawChannelsEqual: z.literal(true),
    channels: z.array(z.object({ name: z.enum(workspaceChannels), byteLength: z.number().int().positive(),
      sha256: P6HashSchema }).strict()).length(5) }).strict(),
  comparisons: z.object({ openedLiteralSource: z.literal(true), fullBayMatchesDirectCompiler: z.literal(true),
    everyAffectedNativePairChanged: z.literal(true), allOutsideTransformsExact: z.literal(true),
    outsideOverrideRetained: z.literal(true), oneBayHistoryEntryAndRevision: z.literal(true),
    undoRedoFullSetAndGeometry: z.literal(true), recoveredLiteralSource: z.literal(true),
    recoveredIrGalleryInputsEqual: z.literal(true), coldHistoryEmpty: z.literal(true) }).strict(),
  captures: z.array(P6FileSchema).max(3) }).strict();
async function p18InstallProbe(page) {
  await page.evaluate(async () => {
    if (window.__buildoP18Probe || window.__buildoP12Probe) throw new Error("P18 requires fresh history instrumentation.");
    const { BuildingRunController } = await import("/src/features/building-family/state/buildingRunController.ts");
    const probe = { depth: 0, completed: 0, actions: [] }, restores = [];
    window.__buildoP18Probe = probe;
    probe.restore = () => { for (const restore of restores.splice(0).reverse()) restore(); delete window.__buildoP18Probe; };
    for (const [method, kind] of [["applyWindowBayWidthOverride", "bay"],
      ["undoWindowWidthOverride", "undo"], ["redoWindowWidthOverride", "redo"]]) {
      const original = BuildingRunController.prototype[method];
      if (typeof original !== "function") throw new Error("P18 requires the actual public method " + method);
      const replacement = function (...args) {
        const outer = probe.depth++ === 0;
        const action = outer ? { kind, request: { expectedSourceContentHash: args[0].expectedSourceContentHash,
          expectedRevision: args[0].expectedRevision }, directive: kind === "bay" ? structuredClone(args[0].directive) : null,
          historyBefore: this.getWindowWidthHistoryState() } : null;
        let returned;
        try { returned = original.apply(this, args); }
        catch (error) { probe.depth -= 1; if (outer) probe.completed += 1; throw error; }
        return returned.then(result => {
          if (outer && !result.stale && result.fixture?.sourceSnapshot) {
            const source = result.fixture.sourceSnapshot, p6 = window.__buildoP6Probe;
            p6.controller = this; p6.acceptedFixture = result.fixture; p6.acceptedRunId = result.runId;
            probe.actions.push({ ...action, runId: result.runId, sourceContentHash: source.sourceContentHash,
              revision: source.document.revision, historyAfter: this.getWindowWidthHistoryState() });
          }
          return result;
        }).finally(() => { probe.depth -= 1; if (outer) probe.completed += 1; });
      };
      BuildingRunController.prototype[method] = replacement;
      restores.push(() => { if (BuildingRunController.prototype[method] === replacement) BuildingRunController.prototype[method] = original; });
    }
  });
}
async function p18NativeMembers(page, addresses, expectedSource) {
  const result = await page.evaluate(async ({ addresses, hash, revision }) => {
    const { buildAssemblyHallSourceWindowSplit } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
    const { resolveWindowOpeningFromSlotAddress } = await import("/src/features/building-family/compiler/facadeSplitPlan.ts");
    const probe = window.__buildoP6Probe, { fixture, scene, canvas } = probe.current, source = fixture.sourceSnapshot;
    if (source?.schemaVersion !== "0.5.0" || source.sourceContentHash !== hash || source.document.revision !== revision)
      throw new Error("P18 member source owner mismatch.");
    const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: source, catalog: fixture.catalog });
    if (probe.current.fixture !== fixture || fixture.sourceSnapshot !== source || !canvas.isConnected)
      throw new Error("P18 member owner changed during base reconstruction.");
    const key = value => JSON.stringify(value);
    return addresses.map(address => {
      const opening = resolveWindowOpeningFromSlotAddress(base, address);
      const override = source.windowWidthBatch.directives.find(value => key(value.address) === key(address));
      const instances = [opening.semanticPath, opening.semanticPath + "/glass"].map(semanticPath => {
        const lookup = fixture.buildingRuntime.semanticLookup.get(semanticPath);
        const entry = fixture.ir.semanticIndex.find(value => value.semanticPath === semanticPath);
        const batch = fixture.ir.instanceBatches.find(value => value.batchId === entry?.batchId);
        const object = lookup?.object, instanceIndex = lookup?.instanceIndex ?? lookup?.elementIndex;
        const draw = object && probe.draws.get(object.uuid);
        if (!entry || entry.elementIndex === undefined || !batch?.transforms || !object?.isInstancedMesh ||
          instanceIndex === undefined || !draw || draw.fixture !== fixture || draw.canvas !== canvas || draw.scene !== scene)
          throw new Error("P18 window pair was not actually submitted on this current canvas.");
        const matrix = object.matrix.clone(); object.getMatrixAt(instanceIndex, matrix);
        const irMatrix = Array.from(batch.transforms.subarray(entry.elementIndex * 16, (entry.elementIndex + 1) * 16));
        if (matrix.elements.some((value, index) => value !== irMatrix[index])) throw new Error("P18 native/source index mapping differs.");
        return { semanticPath, batchId: entry.batchId, elementIndex: entry.elementIndex, instanceIndex,
          objectUuid: object.uuid, geometryUuid: object.geometry.uuid,
          vertexCount: object.geometry.getAttribute("position").count, drawnSequence: draw.sequence,
          matrix: [...matrix.elements], irMatrix };
      });
      return { semanticPath: opening.semanticPath, address, baseWidthM: opening.sizeM[0],
        currentWidthM: override?.widthM ?? opening.sizeM[0], instances };
    });
  }, { addresses, hash: expectedSource.sourceContentHash, revision: expectedSource.document.revision });
  return z.array(P18MemberSchema).parse(result);
}
function p18BayMatrices(before, after, phase) {
  assert.deepEqual(p6Entry(after.captured.owned.ir, "semanticIndex"), p6Entry(before.captured.owned.ir, "semanticIndex"));
  const key = address => JSON.stringify(address), pairs = new Map(), windows = [];
  assert.equal(before.step.bayMembers.length, after.step.bayMembers.length);
  for (const old of before.step.bayMembers) {
    const next = after.step.bayMembers.find(value => key(value.address) === key(old.address));
    assert.ok(next); assert.notEqual(next.currentWidthM, old.currentWidthM);
    assert.equal(next.semanticPath, old.semanticPath); assert.equal(next.baseWidthM, old.baseWidthM);
    const frameWidth = width => Math.max(0.15, Math.max(0.2, width) - 2 * 0.04);
    const window = { address: old.address, oldWidthM: old.currentWidthM, newWidthM: next.currentWidthM,
      expectedRatio: frameWidth(next.currentWidthM) / frameWidth(old.currentWidthM), actualRatios: [] };
    for (const instance of old.instances) {
      const identity = instance.batchId + ":" + instance.elementIndex;
      assert.equal(pairs.has(identity), false); pairs.set(identity, window);
      const actual = next.instances.find(value => value.semanticPath === instance.semanticPath);
      assert.ok(actual); assert.equal(actual.batchId, instance.batchId); assert.equal(actual.elementIndex, instance.elementIndex);
      assert.deepEqual(actual.matrix, actual.irMatrix); assert.deepEqual(instance.matrix, instance.irMatrix);
    }
    windows.push(window);
  }
  const previous = p6Items(p6Entry(before.captured.owned.ir, "instanceBatches"));
  const next = p6Items(p6Entry(after.captured.owned.ir, "instanceBatches"));
  assert.equal(next.length, previous.length);
  let selectedPairs = 0, unchangedMatrices = 0;
  for (const [batchIndex, batch] of previous.entries()) {
    const other = next[batchIndex], batchId = p6Entry(batch, "batchId").value;
    assert.deepEqual(batch.entries.filter(([key]) => key !== "transforms"), other.entries.filter(([key]) => key !== "transforms"));
    const oldSpan = p6Entry(batch, "transforms"), newSpan = p6Entry(other, "transforms");
    assert.equal(oldSpan.kind, "typed"); assert.equal(newSpan.kind, "typed");
    const oldBytes = Buffer.from(oldSpan.base64, "base64"), newBytes = Buffer.from(newSpan.base64, "base64");
    assert.equal(newBytes.length, oldBytes.length);
    for (let index = 0; index < p6Entry(batch, "count").value; index += 1) {
      const a = oldBytes.subarray(index * 64, (index + 1) * 64), b = newBytes.subarray(index * 64, (index + 1) * 64);
      const chosen = pairs.get(batchId + ":" + index);
      if (!chosen) { assert.deepEqual(b, a); unchangedMatrices += 1; continue; }
      const oldMatrix = Array.from({ length: 16 }, (_, component) => a.readFloatLE(component * 4));
      const newMatrix = Array.from({ length: 16 }, (_, component) => b.readFloatLE(component * 4));
      assert.deepEqual(newMatrix.slice(3), oldMatrix.slice(3));
      for (let axis = 0; axis < 3; axis += 1)
        assert.ok(Math.abs(newMatrix[axis] - oldMatrix[axis] * chosen.expectedRatio) < 1e-6, "P18 bay X scale equation");
      const ratio = Math.hypot(...newMatrix.slice(0, 3)) / Math.hypot(...oldMatrix.slice(0, 3));
      assert.ok(Math.abs(ratio - chosen.expectedRatio) < 1e-6); chosen.actualRatios.push(ratio); selectedPairs += 1;
    }
  }
  assert.equal(selectedPairs, before.step.bayMembers.length * 2); assert.ok(unchangedMatrices > 0);
  return P18MatrixSchema.parse({ phase, selectedPairs, unchangedMatrices, windows });
}
async function p18ProveBayWidth(page, sourceCodec, artifactDir) {
  const context = page.context(), url = page.url(), steps = [], captures = [], matrices = [];
  const empty = { undoCount: 0, redoCount: 0, canUndo: false, canRedo: false };
  const same = (a, b) => assert.deepEqual(a, b), key = value => JSON.stringify(value);
  let recoveredPage, returned = false;
  async function artifact(name, bytes) {
    if (!artifactDir) return null;
    await writeFile(path.join(artifactDir, name), bytes, { flag: "wx" });
    return { file: name, sha256: workspaceHash(bytes), byteLength: bytes.length };
  }
  function materialChecks(actual, expected) {
    same(actual.decoded.file.materials, expected.decoded.file.materials);
    for (const name of workspaceChannels) same(Buffer.from(actual.decoded.packedAtlas.channels[name].data),
      Buffer.from(expected.decoded.packedAtlas.channels[name].data));
  }
  function memberGeometry(member) {
    return { semanticPath: member.semanticPath, address: member.address, baseWidthM: member.baseWidthM,
      currentWidthM: member.currentWidthM, instances: member.instances.map(value => ({
        semanticPath: value.semanticPath, batchId: value.batchId, elementIndex: value.elementIndex,
        matrix: value.matrix, irMatrix: value.irMatrix })) };
  }
  function outsideEqual(actual, expected) { same(memberGeometry(actual.step.outside), memberGeometry(expected.step.outside)); }
  function geometryEqual(actual, expected) {
    for (const field of ["ir", "gallery", "inputs"]) same(actual.captured.owned[field], expected.captured.owned[field]);
    same(actual.step.bayMembers.map(memberGeometry), expected.step.bayMembers.map(memberGeometry));
    outsideEqual(actual, expected);
    assert.notEqual(actual.captured.owned.draw.rootUuid, expected.captured.owned.draw.rootUuid);
  }
  async function counters(activePage) {
    return activePage.evaluate(() => ({ counters: { ...window.__buildoP6Probe.counters },
      storage: { ...window.__buildoP6Probe.storage } }));
  }
  async function collect(activePage, selectedAddress, memberAddresses, phase) {
    const target = await p6PickWindow(activePage, selectedAddress), saved = await workspaceDownload(activePage, sourceCodec);
    assert.equal(saved.decoded.sourceSnapshot.schemaVersion, "0.5.0");
    const captured = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    const members = await p18NativeMembers(activePage, memberAddresses, saved.decoded.sourceSnapshot);
    same(members.map(value => value.address), memberAddresses);
    const bayMembers = members.slice(0, -1), outside = members.at(-1);
    const { name: omittedName, ...capturedFields } = captured.owned; void omittedName;
    const owned = z.object({ schemaVersion: z.literal("0.1.0"),
      packetKind: z.literal("buildo-r3-p18-owned-bay-step"), phase: P18PhaseSchema,
      source: sourceCodec.BuildingSourceSnapshotSchema, ir: P6EncodedValueSchema,
      gallery: P6EncodedValueSchema, inputs: P6EncodedValueSchema,
      selection: P6SelectionSchema, draw: P6DrawSchema,
      bayMembers: z.array(P18MemberSchema).min(2), outside: P18MemberSchema }).strict().parse({
        ...capturedFields, packetKind: "buildo-r3-p18-owned-bay-step", phase, bayMembers, outside });
    const snapshot = await artifact("p18-" + phase + "-owned.json", Buffer.from(JSON.stringify(owned, null, 2) + "\n"));
    const sourceFile = await artifact("p18-" + phase + "-source.json", saved.bytes);
    const step = P18StepSchema.parse({ phase, history: await p12History(activePage),
      capture: { ...captured.receipt, snapshot }, sourceFile, bayMembers, outside });
    return { saved, captured, step };
  }
  async function screenshot(activePage, name) {
    await activePage.getByLabel("Window width (m)", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    const capture = await artifact("p18-" + name + ".png", await activePage.screenshot({ fullPage: true }));
    if (capture) captures.push(capture);
  }
  async function waitAction(count) {
    await page.waitForFunction(expected => window.__buildoP18Probe?.completed >= expected, count, { timeout: 30000 });
    same(await page.evaluate(() => ({ completed: window.__buildoP18Probe.completed,
      accepted: window.__buildoP18Probe.actions.length })), { completed: count, accepted: count });
    await workspaceReady(page);
  }
  async function directExpected(batch) {
    return page.evaluate(async batch => {
      const probe = window.__buildoP6Probe, fixture = probe.current.fixture;
      const [{ compileBuilding }, { buildComponentGallery }] = await Promise.all([
        import("/src/features/building-family/compiler/buildingCompiler.ts"),
        import("/src/features/building-family/compiler/componentGalleryBuilder.ts")
      ]);
      const ir = await compileBuilding({ spec: fixture.spec, catalog: fixture.catalog, graph: fixture.graph,
        buildingId: fixture.ir.buildingId, ...fixture.sourceSnapshot.compilation, windowWidthBatch: batch });
      const gallery = await buildComponentGallery({ catalog: fixture.catalog, ir });
      return { ir: probe.own(ir), gallery: probe.own(gallery),
        inputs: probe.own({ spec: fixture.spec, graph: fixture.graph, catalog: fixture.catalog }) };
    }, batch);
  }
  try {
    const prior = await workspaceDownload(page, sourceCodec);
    await p11Acknowledged(page, prior);
    assert.equal(prior.decoded.sourceSnapshot.schemaVersion, "0.5.0");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const actual = await page.evaluate(async () => {
      const fixture = window.__buildoP6Probe.current.fixture;
      const { buildAssemblyHallSourceWindowSplit } = await import("/src/features/building-family/ui/assemblyHallFixture.ts");
      const base = await buildAssemblyHallSourceWindowSplit({ sourceSnapshot: fixture.sourceSnapshot, catalog: fixture.catalog });
      if (window.__buildoP6Probe.current.fixture !== fixture) throw new Error("P18 native base owner changed.");
      const address = value => ({ schemaVersion: "0.1.0", facade: value.facade,
        floorIndex: value.floorIndex, bayIndex: value.bayIndex });
      const all = base.openings.filter(value => value.kind === "window" && value.facade === "front");
      const first = all.filter(value => value.floorIndex === 0).sort((a, b) => a.bayIndex - b.bayIndex)
        .find(value => all.filter(other => other.bayIndex === value.bayIndex).length >= 2);
      if (!first) throw new Error("P18 requires an actual vertical stack with a ground window.");
      const windows = all.filter(value => value.bayIndex === first.bayIndex).sort((a, b) => a.floorIndex - b.floorIndex);
      const previous = fixture.sourceSnapshot.windowWidthBatch.directives;
      const outside = previous.find(value => value.address.facade === "front" && value.address.bayIndex !== first.bayIndex);
      if (!outside || new Set(windows.map(value => value.floorIndex)).size < 2 || windows.some(value => value.sizeM[0] <= 0.3))
        throw new Error("P18 requires multiple actual floors and a retained outside-bay override.");
      return { bayAddresses: windows.map(address), bases: windows.map(value => value.sizeM[0]), outsideDirective: outside };
    });
    const outsideDirective = P6DirectiveSchema.parse(actual.outsideDirective), selectedAddress = actual.bayAddresses[0];
    const directive = P18BayDirectiveSchema.parse({ schemaVersion: "0.1.0",
      facade: selectedAddress.facade, bayIndex: selectedAddress.bayIndex, widthM: 0.3 });
    assert.equal(new Set(actual.bayAddresses.map(key)).size, actual.bayAddresses.length);
    assert.ok(new Set(actual.bayAddresses.map(value => value.floorIndex)).size >= 2);
    const previousBatch = prior.decoded.sourceSnapshot.windowWidthBatch;
    assert.ok(previousBatch.directives.length >= 3);
    const source = prior.decoded.sourceSnapshot;
    assert.equal(source.schemaVersion, "0.5.0");
    const initialBatch = P18BatchSchema.parse(source.windowWidthBatch);
    const file = await sourceCodec.createBuildingSourceFile({ sourceSnapshot: source,
      packedAtlas: prior.decoded.packedAtlas, debugExport: prior.decoded.debugExport });
    const fileBytes = Buffer.from(JSON.stringify(file, null, 2));
    const constructedSource = await artifact("p18-constructed-source.json", fileBytes);
    const expectedOpened = await directExpected(initialBatch), before = await counters(page);
    await p18InstallProbe(page);
    await page.getByLabel("Open Source File").setInputFiles({
      name: "p18-bay-and-outside-source.json", mimeType: "application/json", buffer: fileBytes });
    await page.waitForFunction(count => window.__buildoP6Probe.counters.opensFinished >= count,
      before.counters.opensFinished + 1, { timeout: 30000 });
    await workspaceReady(page);
    const memberAddresses = [...actual.bayAddresses, outsideDirective.address];
    const opened = await collect(page, selectedAddress, memberAddresses, "opened"); steps.push(opened.step);
    same(opened.saved.bytes, fileBytes); same(opened.step.history, empty); materialChecks(opened.saved, prior);
    for (const field of ["ir", "gallery", "inputs"]) same(opened.captured.owned[field], expectedOpened[field]);
    same(opened.step.bayMembers.map(member => member.baseWidthM), actual.bases);
    assert.ok(opened.step.bayMembers.every(value => value.currentWidthM > directive.widthM));
    assert.equal(opened.step.outside.currentWidthM, outsideDirective.widthM);
    await screenshot(page, "opened-desktop"); await p11Acknowledged(page, opened.saved);
    const revision = source.document.revision;
    const wantedBatch = { schemaVersion: "0.1.0", directives: [
      ...initialBatch.directives.filter(value => value.address.facade !== directive.facade ||
        value.address.bayIndex !== directive.bayIndex),
      ...actual.bayAddresses.map(address => ({ schemaVersion: "0.1.0", address, widthM: directive.widthM }))
    ] };
    const derivedBaySource = await sourceCodec.deriveBuildingSourceWindowWidthBatchEdit({
      sourceSnapshot: source, windowWidthBatch: wantedBatch });
    assert.equal(derivedBaySource.schemaVersion, "0.5.0");
    const expectedBaySource = { ...derivedBaySource, document: { ...derivedBaySource.document, revision: revision + 1 } };
    const bayBatch = P18BatchSchema.parse(expectedBaySource.windowWidthBatch), expectedBay = await directExpected(bayBatch);
    await page.getByLabel("Window width (m)", { exact: true }).fill(String(directive.widthM));
    assert.equal(await page.getByRole("button", { name: "Apply to bay", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "Apply to bay", exact: true }).click(); await waitAction(1);
    const bay = await collect(page, selectedAddress, memberAddresses, "bay"); steps.push(bay.step);
    same(bay.saved.decoded.sourceSnapshot, expectedBaySource);
    same(bay.saved.decoded.sourceSnapshot.windowWidthBatch, bayBatch);
    for (const field of ["ir", "gallery", "inputs"]) same(bay.captured.owned[field], expectedBay[field]);
    same(bay.captured.owned.inputs, opened.captured.owned.inputs); materialChecks(bay.saved, prior);
    assert.ok(bay.step.bayMembers.every(value => value.currentWidthM === directive.widthM));
    outsideEqual(bay, opened); matrices.push(p18BayMatrices(opened, bay, "bay"));
    same(bay.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    await screenshot(page, "bay-desktop");
    await page.getByRole("button", { name: "Undo width", exact: true }).click(); await waitAction(2);
    const undo = await collect(page, selectedAddress, memberAddresses, "undo"); steps.push(undo.step);
    const expectedUndo = structuredClone(source); expectedUndo.document.revision = revision + 2;
    same(undo.saved.decoded.sourceSnapshot, expectedUndo); geometryEqual(undo, opened); materialChecks(undo.saved, prior);
    matrices.push(p18BayMatrices(bay, undo, "undo"));
    same(undo.step.history, { undoCount: 0, redoCount: 1, canUndo: false, canRedo: true });
    await page.getByRole("button", { name: "Redo width", exact: true }).click(); await waitAction(3);
    const redo = await collect(page, selectedAddress, memberAddresses, "redo"); steps.push(redo.step);
    const expectedRedo = structuredClone(expectedBaySource); expectedRedo.document.revision = revision + 3;
    same(redo.saved.decoded.sourceSnapshot, expectedRedo); geometryEqual(redo, bay); materialChecks(redo.saved, prior);
    matrices.push(p18BayMatrices(undo, redo, "redo"));
    same(redo.step.history, { undoCount: 1, redoCount: 0, canUndo: true, canRedo: false });
    const ownerAcknowledgement = await p11Acknowledged(page, redo.saved), after = await counters(page);
    const delta = Object.fromEntries(Object.keys(before.counters).map(key => [key, after.counters[key] - before.counters[key]]));
    for (const key of ["runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears",
      "widthStarted", "widthFinished"]) assert.equal(delta[key], 0);
    same([delta.opensStarted, delta.opensFinished], [1, 1]);
    assert.equal(after.storage.checkpointPuts - before.storage.checkpointPuts, 4);
    const actions = z.array(P18ActionSchema).length(3).parse(await page.evaluate(() => window.__buildoP18Probe.actions));
    same(actions.map(value => value.kind), ["bay", "undo", "redo"]); same(actions[0].directive, directive);
    same(actions.slice(1).map(value => value.directive), [null, null]);
    for (const [index, previous] of [opened, bay, undo].entries()) {
      same(actions[index].request, { expectedSourceContentHash: previous.saved.decoded.sourceSnapshot.sourceContentHash,
        expectedRevision: previous.saved.decoded.sourceSnapshot.document.revision });
      assert.equal(actions[index].revision, revision + index + 1);
      same(actions[index].historyBefore, previous.step.history); same(actions[index].historyAfter, steps[index + 1].history);
      assert.equal(actions[index].sourceContentHash, steps[index + 1].capture.sourceContentHash);
    }
    await page.evaluate(() => { window.__buildoP18Probe.restore(); window.__buildoP6Probe.restore(); });
    await page.close();
    recoveredPage = await p11BootstrapPage(context, url, { width: 390, height: 844 });
    await p11WaitRecovery(recoveredPage, "recovered-source"); await workspaceReady(recoveredPage);
    const recovered = await collect(recoveredPage, selectedAddress, memberAddresses, "recovered"); steps.push(recovered.step);
    same(recovered.saved.bytes, redo.saved.bytes); geometryEqual(recovered, redo); materialChecks(recovered.saved, prior);
    same(recovered.step.history, empty); outsideEqual(recovered, opened);
    await screenshot(recoveredPage, "recovered-compact");
    const recoveredAcknowledgement = await p11Acknowledged(recoveredPage, recovered.saved);
    const recovery = await p11StartupSnapshot(recoveredPage);
    same(recovery.counters, { widthStarted: 0, widthFinished: 0, opensStarted: 1, opensFinished: 1,
      runsStarted: 0, interpreterCalls: 0, providerCalls: 0, cachePuts: 0, cacheDeletes: 0, cacheClears: 0 });
    same([recovery.storage.checkpointGets, recovery.storage.legacyGets, recovery.storage.legacyLists], [1, 0, 0]);
    assert.ok(recovery.lockRequests.some(value => value.granted));
    for (const ack of [ownerAcknowledgement, recoveredAcknowledgement]) {
      assert.equal(ack.sourceContentHash, redo.saved.decoded.sourceSnapshot.sourceContentHash);
      assert.equal(ack.revision, revision + 3);
    }
    const receipt = P18BayReceiptSchema.parse({ schemaVersion: "0.1.0",
      packetKind: "buildo-r3-p18-window-bay-width-e2e", documentId: "e2e-family-doc",
      directive, initialBatch, bayBatch, constructedSource, selectedAddress, outsideDirective, steps, matrices, actions,
      ownerAcknowledgement, owningPageClosed: true, recovery, recoveredAcknowledgement,
      editing: { counters: delta, checkpointPuts: 4 },
      materials: { fullMetadataEqual: true, allFiveRawChannelsEqual: true,
        channels: workspaceChannels.map(name => ({ name, byteLength: prior.decoded.packedAtlas.channels[name].data.byteLength,
          sha256: workspaceHash(Buffer.from(prior.decoded.packedAtlas.channels[name].data)) })) },
      comparisons: { openedLiteralSource: true, fullBayMatchesDirectCompiler: true,
        everyAffectedNativePairChanged: true, allOutsideTransformsExact: true, outsideOverrideRetained: true,
        oneBayHistoryEntryAndRevision: true, undoRedoFullSetAndGeometry: true, recoveredLiteralSource: true,
        recoveredIrGalleryInputsEqual: true, coldHistoryEmpty: true }, captures });
    same(steps.map(value => value.phase), ["opened", "bay", "undo", "redo", "recovered"]);
    assert.equal(captures.length, artifactDir ? 3 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "p18-bay-width.json"),
      JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R3_P18_WINDOW_BAY_WIDTH_E2E_RESULT=" + JSON.stringify(receipt));
    returned = true; return recoveredPage;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => {
      window.__buildoP18Probe?.restore(); window.__buildoP6Probe?.restore();
    }).catch(() => undefined);
    if (recoveredPage && !returned) {
      try { await recoveredPage.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); }
      finally { await recoveredPage.close(); }
    }
  }
}

// R4.P4 surface-source App continuity receipt and native workflow.
const R4P4SurfaceStepSchema = z.object({
  phase: z.enum(["opened", "edited", "recovered"]), capture: P15StepSchema,
  sourceFile: P6FileSchema.nullable(), snapshot: P6FileSchema.nullable(),
  compositionHash: P6HashSchema, pixelContentHash: P6HashSchema,
  renderedChannelHashes: z.object({ baseColor: P6HashSchema, normal: P6HashSchema, orm: P6HashSchema, opacity: P6HashSchema }).strict(),
  outsideBindingsHash: P6HashSchema, selectedNativeSubmitted: z.literal(true),
  independentPixelsMatch: z.literal(true)
}).strict();
const R4P4SurfaceWorkflowSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r4-p4-surface-source-app-continuity"),
  steps: z.array(R4P4SurfaceStepSchema).length(3), constructedSource: P6FileSchema.nullable(),
  captures: z.array(P6FileSchema), matrix: z.object({ name: z.string(), selectedPairs: z.literal(2),
    unchangedMatrices: z.number().int().positive(), expectedRatio: z.number().positive(),
    actualRatios: z.array(z.number().positive()).length(2) }).strict(),
  ownerAcknowledgement: P11AcknowledgementSchema, recoveredAcknowledgement: P11AcknowledgementSchema,
  recovery: P11StartupSchema, editing: z.object({ counters: P6CountersSchema,
    checkpointPuts: z.number().int().nonnegative() }).strict(),
  checkpointSourcePreserved: z.literal(true), freshOwner: z.literal(true),
  savedSourceBytesEqual: z.literal(true), recoveredGeometryEqual: z.literal(true),
  materialBytesEqual: z.literal(true), presentationRestored: z.literal(true)
}).strict();
async function r4p4ProveSurfaceContinuity(page, sourceCodec, surfaceCodec, artifactDir) {
  const context = page.context(), url = page.url(), captures = [], steps = [];
  const customCodec = { parseBuildingSourceFile: surfaceCodec.parseBuildingSurfaceSourceFile };
  let recoveredPage, returned = false;
  async function artifact(name, bytes) {
    if (!artifactDir) return null;
    await writeFile(path.join(artifactDir, name), bytes, { flag: "wx" });
    return { file: name, sha256: workspaceHash(bytes), byteLength: bytes.length };
  }
  async function screenshot(activePage, name) {
    await activePage.getByLabel("Window width (m)", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await activePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    const pin = await artifact("r4-p4-surface-" + name + ".png", await activePage.screenshot({ fullPage: true }));
    if (pin) captures.push(pin);
  }
  async function collect(activePage, address, phase) {
    const target = await p6PickWindow(activePage, address), saved = await workspaceDownload(activePage, customCodec);
    assert.equal(saved.decoded.legacyInput, false);
    const captured = await p6Capture(activePage, sourceCodec, saved, target, "auto-recovered", undefined);
    const surface = await activePage.evaluate(async ({ file, relativePath }) => {
      const probe = window.__buildoP6Probe, { fixture, canvas, scene } = probe.current;
      const [{ resolveBuildingSurfaceBindings }, { composeBuildingSurfaceTile }, { sha256Hex, hashCanonicalJson }] = await Promise.all([
        import("/src/features/building-family/materials/resolveSurfaceBindings.ts"),
        import("/src/features/building-family/materials/composeSurfaceTile.ts"),
        import("/src/features/building-family/core/contentHash.ts")
      ]);
      const artifact = await resolveBuildingSurfaceBindings({ composition: file.composition, ir: fixture.ir, atlas: fixture.packedAtlas });
      const tile = await composeBuildingSurfaceTile({ artifact, relativePath, atlas: fixture.packedAtlas });
      const fullPath = relative => "building/" + fixture.ir.familyId + "/" + relative;
      const selected = fixture.buildingRuntime.semanticLookup.get(fullPath(relativePath));
      const object = selected?.object, material = object?.material, submitted = object && probe.draws.get(object.uuid);
      if (!selected || !material || !submitted || submitted.fixture !== fixture || submitted.canvas !== canvas ||
          submitted.scene !== scene || !canvas.isConnected || material.userData.pixelContentHash !== tile.pixelContentHash)
        throw new Error("R4.P4 composite material was not submitted by the actual current native frame.");
      const renderedChannelHashes = {};
      for (const [name, texture] of [["baseColor", material.map], ["normal", material.normalMap],
          ["orm", material.roughnessMap], ["opacity", material.alphaMap]]) {
        if (!texture?.image?.data) throw new Error("R4.P4 requires actual RGBA material planes.");
        const bytes = texture.image.data, expected = tile.channels[name].data;
        if (bytes.length !== expected.length || bytes.some((value, i) => value !== expected[i]))
          throw new Error("R4.P4 actual shader texture pixels differ from independent compositor output.");
        renderedChannelHashes[name] = await sha256Hex(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      }
      const outside = artifact.bindings.filter(binding => binding.relativePath !== relativePath).map(binding => {
        const actual = fixture.buildingRuntime.semanticLookup.get(fullPath(binding.relativePath))?.object.material;
        if (!actual || actual.userData.pixelContentHash || actual.userData.atlasSlotId !== binding.baseSlot.slotId ||
            actual.map !== fixture.familyRuntime.textureSet.textures.baseColor)
          throw new Error("R4.P4 outside material left its literal atlas binding.");
        return { relativePath: binding.relativePath, role: binding.role, slotId: actual.userData.atlasSlotId };
      });
      return { compositionHash: await hashCanonicalJson(file.composition), pixelContentHash: tile.pixelContentHash,
        renderedChannelHashes, outsideBindingsHash: await hashCanonicalJson(outside),
        selectedNativeSubmitted: true, independentPixelsMatch: true };
    }, { file: saved.decoded.file, relativePath: composition.layers[0].target.relativePath });
    const snapshot = await artifact("r4-p4-surface-" + phase + "-owned.json",
      Buffer.from(JSON.stringify({ schemaVersion: "0.1.0", packetKind: "buildo-r4-p4-owned-app-surface-step",
        phase, structural: captured.owned, composition: saved.decoded.file.composition, surface }, null, 2) + "\n"));
    const sourceFile = await artifact("r4-p4-surface-" + phase + "-source.json", saved.bytes);
    const step = R4P4SurfaceStepSchema.parse({ phase, capture: captured.receipt, sourceFile, snapshot, ...surface });
    return { saved, captured, step };
  }
  let composition;
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const baseline = await workspaceDownload(page, sourceCodec);
    const constructed = await page.evaluate(async () => {
      const { fixture } = window.__buildoP6Probe.current;
      const [{ resolveBuildingSurfaceBindings }, { createBuildingSourceFile }, { createBuildingSurfaceSourceFile }] = await Promise.all([
        import("/src/features/building-family/materials/resolveSurfaceBindings.ts"),
        import("/src/features/building-family/state/buildingSourceFile.ts"),
        import("/src/features/building-family/state/buildingSurfaceSourceFile.ts")
      ]);
      const source = fixture.sourceSnapshot, empty = { schemaVersion: "0.1.0", documentId: source.document.documentId,
        revision: source.document.revision, sources: [], layers: [] };
      const bindings = await resolveBuildingSurfaceBindings({ composition: empty, ir: fixture.ir, atlas: fixture.packedAtlas });
      const frame = bindings.bindings.find(binding => binding.role === "frame" && binding.kind === "instance" &&
        binding.relativePath.includes("facade/front/floor/1/") &&
        fixture.catalog.recipes.find(recipe => recipe.id === fixture.ir.instanceBatches.find(batch => batch.batchId === binding.batchId)?.recipeId)?.role === "window");
      if (!frame) throw new Error("R4.P4 requires an actual front second-floor window frame.");
      const slot = fixture.packedAtlas.manifest.slots.find(value => value.id === frame.baseSlot.slotId);
      const composition = { ...empty, sources: [{ id: "masonry", atlasContentHash: fixture.packedAtlas.contentHash,
        slotId: fixture.packedAtlas.manifest.slots.find(value => value.role === "wall").id }],
        layers: [{ id: "paint-frame", target: { kind: "element", relativePath: frame.relativePath, expectedRole: "frame" },
          sourceId: "masonry", mask: { kind: "constant", value: 1 }, blend: "replace", opacity: 1,
          physicalSizeM: slot.physicalSizeM, channels: ["baseColor", "normal", "orm", "opacity"] }] };
      const baseFile = await createBuildingSourceFile({ sourceSnapshot: source, packedAtlas: fixture.packedAtlas, debugExport: fixture.debugExport });
      const file = await createBuildingSurfaceSourceFile({ baseFile, composition });
      const match = frame.relativePath.match(/facade\/(front|rear|left|right)\/floor\/(\d+)\/bay\/(\d+)/);
      return { file, address: { schemaVersion: "0.1.0", facade: match[1], floorIndex: Number(match[2]), bayIndex: Number(match[3]) } };
    });
    composition = constructed.file.composition;
    assert.deepEqual(constructed.file.baseFile, baseline.decoded.file);
    const fileBytes = Buffer.from(JSON.stringify(constructed.file, null, 2));
    const constructedSource = await artifact("r4-p4-constructed-surface-source.json", fileBytes);
    const before = await page.evaluate(() => ({ counters: { ...window.__buildoP6Probe.counters }, storage: { ...window.__buildoP6Probe.storage } }));
    await page.getByLabel("Open Source File").setInputFiles({ name: "surface-source-v6.json", mimeType: "application/json", buffer: fileBytes });
    await page.waitForFunction(count => window.__buildoP6Probe.counters.opensFinished > count, before.counters.opensFinished, { timeout: 30000 });
    await workspaceReady(page);
    const presentationBefore = await page.evaluate(() => window.__buildoP6Probe.current.fixture.buildingRuntime.renderables.map(object =>
      ({ object: object.uuid, material: object.material.uuid, pixelContentHash: object.material.userData.pixelContentHash ?? null,
        texture: object.material.map?.uuid ?? null })));
    assert.ok(presentationBefore.some(value => value.pixelContentHash));
    const summary = page.locator("summary").filter({ hasText: /^View controls$/ });
    if (!(await summary.evaluate(node => node.parentElement.open))) await summary.click();
    const presentation = page.getByRole("combobox", { name: "Presentation mode" });
    await presentation.selectOption("clay");
    await page.waitForFunction(() => document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]')?.dataset.presentationMode === "clay");
    assert.equal(await page.evaluate(() => window.__buildoP6Probe.current.fixture.buildingRuntime.renderables.every(object =>
      object.material.name === "assembly-hall.clay-inspection")), true);
    await presentation.selectOption("textured");
    await page.waitForFunction(() => document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]')?.dataset.presentationMode === "textured");
    assert.deepEqual(await page.evaluate(() => window.__buildoP6Probe.current.fixture.buildingRuntime.renderables.map(object =>
      ({ object: object.uuid, material: object.material.uuid, pixelContentHash: object.material.userData.pixelContentHash ?? null,
        texture: object.material.map?.uuid ?? null }))), presentationBefore);
    const opened = await collect(page, constructed.address, "opened"); steps.push(opened.step);
    assert.deepEqual(opened.saved.bytes, fileBytes);
    assert.deepEqual(opened.saved.decoded.file.baseFile.materials, baseline.decoded.file.materials);
    for (const name of workspaceChannels) assert.deepEqual(Buffer.from(opened.saved.decoded.packedAtlas.channels[name].data),
      Buffer.from(baseline.decoded.packedAtlas.channels[name].data));
    await screenshot(page, "opened-desktop");
    const oldWidth = opened.captured.owned.selection.currentWidthM, newWidth = oldWidth > 0.5 ? 0.5 : 0.25;
    assert.notEqual(newWidth, oldWidth);
    await page.getByLabel("Window width (m)", { exact: true }).fill(String(newWidth));
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.waitForFunction(count => window.__buildoP6Probe.counters.widthFinished > count, before.counters.widthFinished, { timeout: 30000 });
    await workspaceReady(page);
    const edited = await collect(page, constructed.address, "edited"); steps.push(edited.step);
    const matrix = p6Matrices(opened.captured, edited.captured, oldWidth, newWidth, "surface-width");
    assert.equal(edited.saved.decoded.file.composition.revision, opened.saved.decoded.file.composition.revision + 1);
    assert.deepEqual({ ...edited.saved.decoded.file.composition, revision: composition.revision }, composition);
    assert.notEqual(edited.step.capture.irSha256, opened.step.capture.irSha256);
    for (const field of ["pixelContentHash", "renderedChannelHashes", "outsideBindingsHash"])
      assert.deepEqual(edited.step[field], opened.step[field]);
    assert.deepEqual(edited.saved.decoded.file.baseFile.materials, baseline.decoded.file.materials);
    const ownerAcknowledgement = await p11Acknowledged(page, edited.saved);
    const stored = await page.evaluate(async documentId => {
      const { createBuildingSourceCheckpointPersistence } = await import("/src/features/building-family/state/buildingSourceCheckpoint.ts");
      return await createBuildingSourceCheckpointPersistence().get(documentId);
    }, composition.documentId);
    assert.equal(stored.kind, "source"); assert.deepEqual(stored.sourceFile, edited.saved.decoded.file);
    await artifact("r4-p4-durable-surface-checkpoint.json", Buffer.from(JSON.stringify(stored, null, 2) + "\n"));
    await screenshot(page, "edited-desktop");
    const after = await page.evaluate(() => ({ counters: { ...window.__buildoP6Probe.counters }, storage: { ...window.__buildoP6Probe.storage } }));
    const editing = { counters: Object.fromEntries(Object.keys(before.counters).map(key => [key, after.counters[key] - before.counters[key]])),
      checkpointPuts: after.storage.checkpointPuts - before.storage.checkpointPuts };
    for (const key of ["runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears"]) assert.equal(editing.counters[key], 0);
    assert.deepEqual([editing.counters.opensStarted, editing.counters.opensFinished, editing.counters.widthStarted, editing.counters.widthFinished], [1, 1, 1, 1]);
    assert.equal(editing.checkpointPuts, 2);
    await page.close();
    recoveredPage = await p11BootstrapPage(context, url, { width: 390, height: 844 });
    await p11WaitRecovery(recoveredPage, "recovered-source"); await workspaceReady(recoveredPage);
    const recovered = await collect(recoveredPage, constructed.address, "recovered"); steps.push(recovered.step);
    const recoveredAcknowledgement = await p11Acknowledged(recoveredPage, recovered.saved), recovery = await p11StartupSnapshot(recoveredPage);
    assert.deepEqual(recovered.saved.bytes, edited.saved.bytes);
    assert.deepEqual(recovered.captured.owned.ir, edited.captured.owned.ir);
    assert.deepEqual(recovered.captured.owned.gallery, edited.captured.owned.gallery);
    assert.notEqual(recovered.captured.owned.draw.rootUuid, edited.captured.owned.draw.rootUuid);
    for (const field of ["compositionHash", "pixelContentHash", "renderedChannelHashes", "outsideBindingsHash"])
      assert.deepEqual(recovered.step[field], edited.step[field]);
    for (const name of workspaceChannels) assert.deepEqual(Buffer.from(recovered.saved.decoded.packedAtlas.channels[name].data),
      Buffer.from(baseline.decoded.packedAtlas.channels[name].data));
    for (const key of ["runsStarted", "interpreterCalls", "providerCalls", "cachePuts", "cacheDeletes", "cacheClears"]) assert.equal(recovery.counters[key], 0);
    await screenshot(recoveredPage, "recovered-compact");
    const receipt = R4P4SurfaceWorkflowSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r4-p4-surface-source-app-continuity",
      steps, constructedSource, captures, matrix, ownerAcknowledgement, recoveredAcknowledgement, recovery, editing,
      checkpointSourcePreserved: true, freshOwner: true, savedSourceBytesEqual: true, recoveredGeometryEqual: true, materialBytesEqual: true,
      presentationRestored: true });
    assert.equal(captures.length, artifactDir ? 3 : 0);
    if (artifactDir) await writeFile(path.join(artifactDir, "r4-p4-surface-continuity.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log("R4_P4_SURFACE_SOURCE_APP_E2E_RESULT=" + JSON.stringify(receipt));
    returned = true; return recoveredPage;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined);
    if (recoveredPage && !returned) { await recoveredPage.evaluate(() => window.__buildoP6Probe?.restore()).catch(() => undefined); await recoveredPage.close(); }
  }
}
let browser;
let server;

try {
  server = await createServer({
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false
    }
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5173/";

  const materialProviderResponse = await fetch(new URL("/api/building-material-provider", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: "0.1.0",
      runId: "e2e-material-provider-route-smoke",
      outputFormat: "rgba8-layer-set",
      requests: [
        {
          sourceId: "source.wall.primary",
          role: "wall",
          selectedFamily: "running-bond-brick",
          periodicity: "xy",
          physicalSizeM: { width: 18, height: 14 },
          seedPath: "atlas/source/wall.primary/running-bond-brick",
          promptVocabulary: ["running-bond-brick", "primary wall material"],
          widthPx: 256,
          heightPx: 256
        }
      ]
    })
  });
  const materialProviderBody = await materialProviderResponse.json();
  if (
    materialProviderResponse.status !== 200 ||
    materialProviderBody.status !== "fallback" ||
    materialProviderBody.providerId !== "procedural" ||
    materialProviderBody.acceptedRequestCount !== 1
  ) {
    throw new Error(`Material provider route smoke failed: ${JSON.stringify(materialProviderBody)}`);
  }

  browser = await chromium.launch();

  const deepLinkContext = await browser.newContext();
  let deepLinkPage = await deepLinkContext.newPage();
  await deepLinkPage.goto(`${url}#document=e2e-family-doc&room=assemblyHall`);
  await deepLinkPage.getByRole("tab", { name: "Assembly Hall" }).waitFor({ state: "visible" });
  await deepLinkPage.getByLabel("Route document identity").getByText("e2e-family-doc").waitFor({ state: "visible" });
  await deepLinkPage
    .getByRole("tab", { name: "Assembly Hall" })
    .evaluate((tab) => {
      if (tab.getAttribute("aria-selected") !== "true") {
        throw new Error("Assembly Hall deep link did not select the Assembly Hall tab.");
      }
    });
  await deepLinkPage.getByRole("heading", { name: "Assembly Hall" }).waitFor({ state: "visible" });
  const sourceCodec = await server.ssrLoadModule("/src/features/building-family/state/buildingSourceFile.ts");
  await proveContinuousWorkspace(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  deepLinkPage = await p6ProveWindowWidth(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  deepLinkPage = await p12ProveWidthHistory(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  deepLinkPage = await p15ProveBatchSource(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  deepLinkPage = await p16ProveFloorWidth(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  deepLinkPage = await p18ProveBayWidth(deepLinkPage, sourceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  const surfaceCodec = await server.ssrLoadModule("/src/features/building-family/state/buildingSurfaceSourceFile.ts");
  deepLinkPage = await r4p4ProveSurfaceContinuity(deepLinkPage, sourceCodec, surfaceCodec, process.env.BUILDO_E2E_ARTIFACT_DIR);
  await deepLinkPage.locator("summary").filter({ hasText: /^Component gallery and family benchmarks$/ }).click();
  await deepLinkPage.getByLabel("16-variant family stress view").getByText("16 variants").waitFor({ state: "visible" });
  await deepLinkPage.close();
  await deepLinkContext.close();

  const page = await browser.newPage();
  await page.goto(`${url}#room=promptLab`);
  await page.getByRole("heading", { name: "Buildo" }).waitFor({ state: "visible" });
  await page.getByLabel("Project setup status").waitFor({ state: "visible" });
  await page.getByRole("tablist", { name: "Building rooms" }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Prompt Lab" }).waitFor({ state: "visible" });
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page.getByLabel("Roof Type").selectOption("gable");
  await page.getByLabel("Invalidation preview").getByText("roofType").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("Material sources reusable").waitFor({ state: "visible" });
  await page.getByLabel("Trim Density").selectOption("moderate");
  await page.getByLabel("Material Seed").fill("material-seed-smoke");
  await page.getByLabel("Trim Seed").fill("trim-seed-smoke");
  await page.getByLabel("Invalidation preview").getByText("trimDensity").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("materialSeed").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("trimSeed").waitFor({ state: "visible" });
  await page.getByRole("checkbox", { name: "Remote Detail Provider" }).check();
  await page.getByLabel("Invalidation preview").getByText("remoteMaterial").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("Material sources regenerate").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Run Current" }).click();
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page.getByLabel("Generation run timeline").getByText("remote-material-route").waitFor({ state: "visible" });
  await page.getByLabel("Generation run timeline").getByText("remoteMaterialProvider.disabled").waitFor({
    state: "visible"
  });
  await page.getByRole("heading", { name: "Artifact Trace" }).waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Registered artifacts" })
    .getByRole("cell", { name: "runtime-building-ir", exact: true })
    .first()
    .waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Run event artifact trace" })
    .getByRole("cell", { name: /^packed-atlas:/ })
    .first()
    .waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Prompt Trace" }).waitFor({ state: "visible" });
  await page.getByLabel("Prompt trace summary").getByText("local-rule").waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Evaluated PSG variables" })
    .getByRole("cell", { name: "building.stylePack", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "PSG evaluation trace" })
    .getByRole("cell", { name: "windowFamily", exact: true })
    .first()
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Atlas Lab" }).click();
  await page.getByRole("heading", { name: "Atlas Lab" }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Remote Material Details" }).waitFor({ state: "visible" });
  const remoteMaterialRouteSummary = page.getByLabel("Remote material route summary");
  await remoteMaterialRouteSummary.getByText("fallback").waitFor({ state: "visible" });
  await remoteMaterialRouteSummary.getByText("procedural").waitFor({ state: "visible" });
  await remoteMaterialRouteSummary.getByText("not-checked").waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Remote Material Diagnostics" })
    .getByRole("cell", { name: "remoteMaterialProvider.disabled", exact: true })
    .waitFor({ state: "visible" });
  const providerDiagnostics = page.getByRole("table", { name: "Provider Diagnostics" });
  await providerDiagnostics.getByRole("cell", { name: "procedural", exact: true }).waitFor({ state: "visible" });
  await providerDiagnostics.getByRole("cell", { name: "cache miss", exact: true }).waitFor({ state: "visible" });
  await providerDiagnostics.getByRole("cell", { name: "0 errors / 1 warnings", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("img", { name: "baseColor channel" }).waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "Semantic Slots" })
    .getByRole("cell", { name: "wall.primary", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Component Forge" }).click();
  await page.getByRole("heading", { name: "Component Forge" }).waitFor({ state: "visible" });
  const componentSelector = page.getByRole("combobox", { name: "Component selector" });
  await componentSelector.selectOption("component-gallery.recipe.window.tall-arched.frame");
  const forgeRecipe = page.getByLabel("Selected component recipe");
  await forgeRecipe.getByText("Window frame").waitFor({ state: "visible" });
  const forgeAtlasSlots = page.getByRole("table", { name: "Selected atlas slots" });
  await forgeAtlasSlots.getByRole("cell", { name: "glass.primary", exact: true }).waitFor({ state: "visible" });
  await forgeAtlasSlots.getByRole("cell", { name: "frame.primary", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Lock selected component" }).click();
  await page
    .getByLabel("Component lock status")
    .getByText("recipe.window.tall-arched.frame")
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Sample Gallery" }).click();
  await page.getByRole("heading", { name: "Sample Buildings" }).waitFor({ state: "visible" });
  await page.getByLabel("Generated sample building gallery").waitFor({ state: "visible" });
  await page.getByLabel("Generated building sample 1").getByText("building-seed").waitFor({ state: "visible" });
  await page
    .getByLabel("Generated building sample 8")
    .getByText("building-seed-variant-07")
    .waitFor({ state: "visible" });
  await page
    .getByRole("img", { name: "Facade preview for generated building sample 1" })
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Prompt Lab" }).click();
  await page.getByRole("heading", { name: "Prompt Lab" }).waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("localComponentLock").waitFor({ state: "visible" });
  await page.getByLabel("Invalidation preview").getByText("branchOrFullMvp").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "New Building" }).click();
  await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Component Forge" }).click();
  await page
    .getByLabel("Component lock status")
    .getByText("recipe.window.tall-arched.frame")
    .waitFor({ state: "visible" });
  await page.getByRole("tab", { name: "Assembly Hall" }).click();
  await page.getByRole("heading", { name: "Assembly Hall" }).waitFor({ state: "visible" });
  await page.locator("summary").filter({ hasText: /^View controls$/ }).click();
  await page.locator("summary").filter({ hasText: /^Component gallery and family benchmarks$/ }).click();
  await page.locator("summary").filter({ hasText: /^Renderer diagnostics$/ }).click();
  await page.getByLabel("16-variant family stress view").getByText("16 variants").waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "16-variant family stress variants" })
    .getByRole("cell", { name: "building-seed-2", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("table", { name: "16-variant family stress variants" })
    .getByRole("cell", { name: "building-seed-2-variant-15", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("combobox", { name: "Reveal through stage" }).selectOption("facade");
  await page.getByLabel("Assembly stage visibility").getByText("openings").waitFor({ state: "visible" });
  await page.getByLabel("Assembly stage visibility").getByText("hidden").first().waitFor({ state: "visible" });
  const semanticElementSelect = page.getByRole("combobox", { name: "Semantic element" });
  await semanticElementSelect.waitFor({ state: "visible" });
  const windowOptionValue = await semanticElementSelect
    .locator("option", { hasText: /openings \/ Window frame(?: assembly)? \/ #0/ })
    .first()
    .getAttribute("value");
  if (!windowOptionValue) {
    throw new Error("Assembly Hall semantic selection smoke could not find the Window frame option.");
  }
  await semanticElementSelect.selectOption(windowOptionValue);
  const selectedSemanticElement = page.locator('[aria-label="Selected semantic element"]');
  await selectedSemanticElement.getByText("instances.window").waitFor({ state: "visible" });
  await selectedSemanticElement.getByText("frame.primary").waitFor({ state: "visible" });
  await selectedSemanticElement.getByText("InstancedMesh").waitFor({ state: "visible" });
  const assemblyCanvas = page.locator('canvas[aria-label="Assembly Hall Three.js canvas"]');
  await assemblyCanvas.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    return (
      canvas instanceof HTMLCanvasElement &&
      canvas.dataset.rendered === "true" &&
      canvas.dataset.revealThroughStage === "facade" &&
      !!canvas.dataset.rendererBackend
    );
  });
  const presentationMode = page.getByRole("combobox", { name: "Presentation mode" });
  await presentationMode.selectOption("clay");
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    return canvas instanceof HTMLCanvasElement && canvas.dataset.presentationMode === "clay";
  });
  await presentationMode.selectOption("textured");
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Assembly Hall Three.js canvas"]');
    return canvas instanceof HTMLCanvasElement && canvas.dataset.presentationMode === "textured";
  });
  const activeBackend = await assemblyCanvas.getAttribute("data-renderer-backend");
  if (activeBackend !== "webgpu" && activeBackend !== "webgl") {
    throw new Error(`Unexpected Assembly Hall renderer backend: ${activeBackend}`);
  }
  await page
    .getByLabel("Assembly Hall renderer metrics")
    .getByText(`${activeBackend} active`)
    .waitFor({ state: "visible" });
  await assemblyCanvas.scrollIntoViewIfNeeded();
  const pixelProbe =
    activeBackend === "webgpu"
      ? screenshotPixelProbe(
          await page.screenshot({
            clip: await assemblyCanvas.boundingBox()
          })
        )
      : await assemblyCanvas.evaluate((canvas) => {
          const samplePoints = [
            [0.5, 0.5],
            [0.35, 0.42],
            [0.62, 0.46],
            [0.48, 0.68],
            [0.72, 0.34]
          ];
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (!gl) {
            return { ok: false, reason: "No WebGL context was available for the Assembly Hall canvas." };
          }
          const pixels = [];
          for (const [xRatio, yRatio] of samplePoints) {
            const pixel = new Uint8Array(4);
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * xRatio)));
            const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * yRatio)));
            gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            pixels.push(Array.from(pixel));
          }

          const first = pixels[0];
          const variedSamples = pixels.filter((pixel) =>
            pixel.some((channel, index) => Math.abs(channel - first[index]) > 12)
          ).length;
          return {
            ok: variedSamples >= 1,
            variedSamples,
            pixels
          };
        });
  if (!pixelProbe.ok) {
    throw new Error(`Assembly Hall canvas pixel probe failed: ${JSON.stringify(pixelProbe)}`);
  }

  console.log(`E2E smoke passed at ${url}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
