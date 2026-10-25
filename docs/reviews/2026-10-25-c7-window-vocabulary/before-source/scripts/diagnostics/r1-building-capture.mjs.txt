/* global document, window */

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Box3, MathUtils, Vector3 } from "three";
import { AssemblyHall } from "../../src/features/building-family/ui/AssemblyHall.tsx";
import { createAssemblyHallFixture } from "../../src/features/building-family/ui/assemblyHallFixture.ts";
import { createAssemblyRenderer } from "../../src/features/building-family/renderer-three/assemblyRendererFactory.ts";
import { R1CaptureFreezeSchema } from "../../src/features/building-family/qa/r1BaselineContracts.ts";
import { createWallPhaseDiagnostic } from "./r1-wall-phase-browser.mjs";

const viewDefinitions = [
  { name: "front", direction: [0, 0, -1], normal: [0, 0, -1], tangent: [1, 0, 0] },
  { name: "three-quarter", direction: [0.55, 0.2, -1], normal: [0, 0, -1], tangent: [1, 0, 0] },
  { name: "right", direction: [1, 0, 0], normal: [1, 0, 0], tangent: [0, 0, 1] },
  { name: "rear", direction: [0, 0, 1], normal: [0, 0, 1], tangent: [-1, 0, 0] }
];

const wallConditions = new Set([
  "production", "normal-off", "base-color-only", "flat", "flat-no-shadow", "restored-production"
]);
const diagnosticMaps = { baseColor: "map", normal: "normalMap", roughness: "roughnessMap", metalness: "metalnessMap", opacity: "alphaMap" };
const textureKeys = ["map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap", "emissiveMap", "aoMap", "bumpMap", "displacementMap", "lightMap", "envMap"];

function bytesCopy(view) {
  if (!view) return null;
  if (!ArrayBuffer.isView(view)) throw new Error("A diagnostic buffer must be an actual typed-array view.");
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
}

function bufferCopy(view) {
  return view ? { type: view.constructor.name, byteLength: view.byteLength, bytes: bytesCopy(view) } : null;
}

function attributeCopy(attribute) {
  if (!attribute) return null;
  return {
    itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized,
    ...(attribute.isInterleavedBufferAttribute ? { stride: attribute.data.stride, offset: attribute.offset } : {}),
    buffer: bufferCopy(attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array)
  };
}

function matrixCopy(matrix) {
  return bufferCopy(new Float64Array(matrix.elements));
}

function geometryCopy(fixture) {
  const runtime = fixture.buildingRuntime;
  if (runtime.disposed) throw new Error("Cannot fingerprint disposed building geometry.");
  return {
    irMeshes: [...fixture.ir.meshBatches].sort((a, b) => a.batchId.localeCompare(b.batchId)).map((batch) => ({
      batchId: batch.batchId, positions: bufferCopy(batch.positions), normals: bufferCopy(batch.normals),
      uvs: bufferCopy(batch.uvs), indices: bufferCopy(batch.indices)
    })),
    irInstances: [...fixture.ir.instanceBatches].sort((a, b) => a.batchId.localeCompare(b.batchId)).map((batch) => ({
      batchId: batch.batchId, count: batch.count, transforms: bufferCopy(batch.transforms)
    })),
    objects: [...runtime.renderables].sort((a, b) => a.name.localeCompare(b.name)).map((object) => ({
      batchId: object.name,
      attributes: Object.fromEntries(Object.keys(object.geometry.attributes).sort().map((name) => [name, attributeCopy(object.geometry.attributes[name])])),
      index: attributeCopy(object.geometry.index),
      instanceCount: object.isInstancedMesh ? object.count : null,
      instanceMatrix: object.isInstancedMesh ? attributeCopy(object.instanceMatrix) : null,
      matrix: matrixCopy(object.matrix), matrixWorld: matrixCopy(object.matrixWorld)
    })),
    rootMatrix: matrixCopy(runtime.root.matrix),
    stages: [...runtime.stageGroups].sort((a, b) => a.stage.localeCompare(b.stage)).map(({ stage, group }) => ({ stage, matrix: matrixCopy(group.matrix) }))
  };
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashedCopy(value) {
  if (value instanceof Uint8Array) return await sha256(value);
  if (Array.isArray(value)) return await Promise.all(value.map(hashedCopy));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await hashedCopy(item)])));
  }
  return value;
}

async function hashCopy(value) {
  return await sha256(new TextEncoder().encode(JSON.stringify(await hashedCopy(value))));
}

/** Clone every actual buffer synchronously before hashing; metadata hashes are not evidence. */
export async function fingerprintBuildingGeometry(fixture) {
  return await hashCopy(geometryCopy(fixture));
}

function settingCopy(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(settingCopy);
  if (value?.isColor || value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isEuler || value?.isQuaternion) return value.toArray();
  if (value?.isMatrix3 || value?.isMatrix4) return [...value.elements];
  if (value?.isPlane) return { normal: value.normal.toArray(), constant: value.constant };
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, settingCopy(value[key])]).filter(([, item]) => item !== undefined));
  }
  return undefined;
}

function materialProperties(material, excludeMutable = false) {
  const excluded = new Set(["id", "uuid", "version", "needsUpdate", "userData", ...textureKeys,
    ...(excludeMutable ? ["color", "roughness", "metalness"] : [])]);
  const keys = new Set([...Object.keys(material), "alphaTest", "alphaHash", "alphaToCoverage"]);
  return Object.fromEntries([...keys].sort().filter((key) => !excluded.has(key) && !key.startsWith("_")).map((key) => [key, settingCopy(material[key])]).filter(([, value]) => value !== undefined));
}

function textureSettings(texture) {
  if (!texture) return null;
  const keys = ["name", "mapping", "channel", "wrapS", "wrapT", "magFilter", "minFilter", "anisotropy", "format", "internalFormat", "type", "colorSpace", "flipY", "generateMipmaps", "premultiplyAlpha", "unpackAlignment", "rotation", "matrixAutoUpdate", "offset", "repeat", "center", "matrix"];
  return { width: texture.image?.width, height: texture.image?.height,
    ...Object.fromEntries(keys.map((key) => [key, settingCopy(texture[key])]).filter(([, value]) => value !== undefined)) };
}

function textureCopy(texture, cache) {
  if (!texture) return null;
  if (!cache.has(texture)) {
    if (!ArrayBuffer.isView(texture.image?.data)) throw new Error("Wall diagnostics require readable actual texture pixel buffers.");
    cache.set(texture, { settings: textureSettings(texture), pixels: bufferCopy(texture.image.data) });
  }
  return cache.get(texture);
}

function slotIdFor(material) {
  const slotId = material.userData.atlasSlot?.slotId ?? material.userData.atlasSlotId;
  if (typeof slotId !== "string" || !slotId) throw new Error("A diagnostic material is missing its stable atlas slot ID.");
  return slotId;
}

export function createWallDiagnostic(fixture, assertTextured) {
  const renderables = [...fixture.buildingRuntime.renderables];
  const wallRenderables = renderables.filter((object) => object.material.userData.atlasSlot?.role === "wall");
  if (!wallRenderables.length) throw new Error("The production building has no wall-slot renderables.");
  const names = new Set(renderables.map((object) => object.name));
  if (names.size !== renderables.length || names.has("")) throw new Error("Diagnostic renderables require unique stable names.");
  const originals = new Map();
  for (const object of wallRenderables) {
    const material = object.material, slotId = slotIdFor(material);
    const prior = originals.get(slotId);
    if (prior && prior.material !== material) throw new Error("A wall slot has multiple production material references.");
    if (!prior) originals.set(slotId, { material, color: material.color.toArray(), roughness: material.roughness, metalness: material.metalness,
      maps: Object.fromEntries(Object.values(diagnosticMaps).map((key) => [key, material[key]])) });
  }
  const shadowOriginals = new Map(wallRenderables.map((object) => [object, object.receiveShadow]));
  const wallMaterialReferences = new Map(wallRenderables.map((object) => [object, object.material]));
  const activeMaterials = new Map([...originals].map(([slotId, original]) => [slotId, original.material]));
  const ownedMaterials = new Set();
  let condition = "production";

  function restore() {
    // Original materials stay untouched: WebGPU shadow nodes may still reference
    // their maps. Reattach them before releasing any diagnostic-owned material.
    for (const [object, receiveShadow] of shadowOriginals) {
      object.material = wallMaterialReferences.get(object);
      object.receiveShadow = receiveShadow;
    }
    for (const [slotId, original] of originals) activeMaterials.set(slotId, original.material);
    for (const material of ownedMaterials) {
      ownedMaterials.delete(material);
      // Material.dispose() releases shader state, never its shared textures.
      material.dispose();
    }
    condition = "restored-production";
  }

  function assertState() {
    assertTextured();
    if (fixture.buildingRuntime.disposed) throw new Error("The wall diagnostic building runtime has been disposed.");
    for (const object of wallRenderables) {
      if (object.geometry.userData.disposed || object.material.userData.disposed) throw new Error("Wall diagnostics require live production resources.");
      const slotId = slotIdFor(wallMaterialReferences.get(object));
      if (object.material !== activeMaterials.get(slotId) || object.material.userData.atlasSlot?.role !== "wall" ||
          slotIdFor(object.material) !== slotId) {
        throw new Error("Wall diagnostics require the active material for each production wall slot.");
      }
    }
    for (const { maps } of originals.values()) {
      if (Object.values(maps).some((texture) => texture?.userData.disposed)) throw new Error("Wall diagnostic textures have been disposed.");
    }
  }

  return {
    restore,
    setWallDiagnostic(nextCondition) {
      if (!wallConditions.has(nextCondition)) throw new Error("Unknown wall diagnostic condition: " + nextCondition);
      assertState();
      try {
        restore();
        if (nextCondition !== "production" && nextCondition !== "restored-production") {
          for (const [slotId, original] of originals) {
            const material = original.material.clone();
            if (material === original.material) throw new Error("A diagnostic material clone must have its own identity.");
            ownedMaterials.add(material);
            // Material.copy() JSON-roundtrips userData; preserve optional labels
            // and immutable atlas metadata exactly without changing their source.
            material.userData = { ...original.material.userData };
            const flagsBefore = Object.values(diagnosticMaps).map((key) => Boolean(material[key]));
            material.normalMap = null;
            if (nextCondition !== "normal-off") {
              material.roughnessMap = null;
              material.metalnessMap = null;
              material.roughness = 0.82;
              material.metalness = 0;
            }
            if (nextCondition === "flat" || nextCondition === "flat-no-shadow") {
              material.map = null;
              material.color.set("#842d20");
            }
            if (Object.values(diagnosticMaps).some((key, index) => Boolean(material[key]) !== flagsBefore[index])) material.needsUpdate = true;
            activeMaterials.set(slotId, material);
          }
          // Every clone is configured before it is attached or first rendered.
          for (const object of wallRenderables) object.material = activeMaterials.get(slotIdFor(wallMaterialReferences.get(object)));
          if (nextCondition === "flat-no-shadow") for (const object of wallRenderables) {
            if (object.receiveShadow) object.material.needsUpdate = true;
            object.receiveShadow = false;
          }
        }
        condition = nextCondition;
        return condition;
      } catch (error) {
        restore();
        condition = "restored-production";
        throw error;
      }
    },
    async wallDiagnosticSnapshot() {
      assertState();
      // All properties and byte views are detached in this synchronous section.
      const savedCondition = condition, textureCache = new Map(), geometry = geometryCopy(fixture);
      const walls = [...originals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slotId, original]) => {
        const material = activeMaterials.get(slotId);
        return { slotId, maps: Object.fromEntries(Object.entries(diagnosticMaps).map(([name, key]) => [name, textureCopy(material[key], textureCache)?.pixels.bytes ?? null])),
          color: material.color.toArray(), roughness: material.roughness, metalness: material.metalness, normalScale: material.normalScale.toArray(),
          protected: { properties: materialProperties(material, true),
            mapSettings: Object.fromEntries(textureKeys.map((key) => [key, textureSettings(key in original.maps ? original.maps[key] : material[key])])),
            otherMaps: Object.fromEntries(textureKeys.filter((key) => !Object.values(diagnosticMaps).includes(key)).map((key) => [key, textureCopy(material[key], textureCache)])) } };
      });
      const nonWalls = renderables.filter((object) => !wallRenderables.includes(object));
      const nonWallMaterials = new Map();
      for (const object of nonWalls) {
        const material = object.material, slotId = slotIdFor(material);
        if (nonWallMaterials.has(slotId) && nonWallMaterials.get(slotId).material !== material) throw new Error("A non-wall slot has multiple material references.");
        nonWallMaterials.set(slotId, { material, properties: materialProperties(material),
          maps: Object.fromEntries(textureKeys.map((key) => [key, textureCopy(material[key], textureCache)])) });
      }
      const nonWall = { materials: [...nonWallMaterials.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slotId, value]) => ({ slotId, properties: value.properties, maps: value.maps })),
        renderables: nonWalls.map((object) => ({ batchId: object.name, receiveShadow: object.receiveShadow, castShadow: object.castShadow })).sort((a, b) => a.batchId.localeCompare(b.batchId)) };
      const wallFlags = wallRenderables.map((object) => ({ batchId: object.name, receiveShadow: object.receiveShadow, castShadow: object.castShadow })).sort((a, b) => a.batchId.localeCompare(b.batchId));
      const [geometryHash, nonWallStateHash, wallMaterials] = await Promise.all([
        hashCopy(geometry), hashCopy(nonWall), Promise.all(walls.map(async ({ protected: protectedState, maps, ...wall }) => ({ ...wall,
          maps: Object.fromEntries(await Promise.all(Object.entries(maps).map(async ([name, bytes]) => [name, bytes ? await sha256(bytes) : null]))),
          otherPropertiesHash: await hashCopy(protectedState) })))
      ]);
      assertState();
      return { condition: savedCondition, geometryHash, nonWallStateHash, wallMaterials, wallRenderables: wallFlags };
    }
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function lightState(light) {
  return {
    position: light.position.toArray(),
    target: light.target.position.toArray(),
    color: light.color.toArray(),
    intensity: light.intensity
  };
}

function sceneLights(scene) {
  const key = scene.getObjectByName("assembly-hall.key-light");
  const fill = scene.getObjectByName("assembly-hall.fill-light");
  if (!key?.isDirectionalLight || !fill?.isDirectionalLight) {
    throw new Error("The production Assembly Hall directional lights were not found.");
  }
  return { key, fill };
}

function freezeCapture(fixture, scene, camera, width, height) {
  // Inspect the single live product building, excluding the presentation ground.
  const buildingRoot = fixture.buildingRuntime.root;
  buildingRoot.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(buildingRoot);
  if (bounds.isEmpty()) {
    throw new Error("The production building has no renderable bounds.");
  }
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const { key, fill } = sceneLights(scene);
  const ordinary = { key: lightState(key), fill: lightState(fill) };
  const target = center.clone();
  const verticalHalfFov = MathUtils.degToRad(42) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * width / height);
  // Fit actual projected corners across all elevations, rather than a loose sphere.
  // A common distance retains the same photographic scale for every view.
  const corners = [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.y, bounds.max.y].flatMap((y) =>
    [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z).sub(target))));
  const fitDistance = Math.max(...viewDefinitions.map(({ direction }) => {
    const towardCamera = new Vector3().fromArray(direction).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), towardCamera).normalize();
    const up = new Vector3().crossVectors(towardCamera, right).normalize();
    return Math.max(...corners.flatMap((corner) => [
      corner.dot(towardCamera) + Math.abs(corner.dot(right)) / (Math.tan(horizontalHalfFov) * 0.9),
      corner.dot(towardCamera) + Math.abs(corner.dot(up)) / (Math.tan(verticalHalfFov) * 0.9)
    ]));
  }));
  const lightTarget = key.target.position.clone();
  const lightRadius = key.position.distanceTo(lightTarget);
  const views = viewDefinitions.map(({ name, direction }) => ({
    name,
    position: new Vector3().fromArray(direction).normalize().multiplyScalar(fitDistance).add(target).toArray(),
    target: target.toArray(),
    up: [0, 1, 0],
    fov: 42,
    near: camera.near,
    far: Math.max(camera.far, maxDimension * 10)
  }));
  const lights = viewDefinitions.flatMap(({ name, normal, tangent }) => {
    const keyOffset = new Vector3().fromArray(normal).multiplyScalar(0.15)
      .addScaledVector(new Vector3().fromArray(tangent), 0.98)
      .add(new Vector3(0, 0.2, 0))
      .normalize()
      .multiplyScalar(lightRadius);
    // Match AssemblyHall's applyKeyLightSpherical fill placement exactly.
    const fillPosition = lightTarget.clone().addScaledVector(keyOffset, -0.55)
      .setY(lightTarget.y + Math.abs(keyOffset.y) * 0.45);
    const raking = {
      key: { ...ordinary.key, position: lightTarget.clone().add(keyOffset).toArray(), target: lightTarget.toArray() },
      fill: { ...ordinary.fill, position: fillPosition.toArray(), target: lightTarget.toArray() }
    };
    return [
      { name: name + "/ordinary", ...ordinary },
      { name: name + "/raking", ...raking }
    ];
  });
  return deepFreeze({
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), center: center.toArray(), size: size.toArray() },
    views,
    lights
  });
}

function applyLightState(light, state) {
  light.position.fromArray(state.position);
  light.target.position.fromArray(state.target);
  light.color.fromArray(state.color);
  light.intensity = state.intensity;
  light.target.updateMatrixWorld(true);
}

/**
 * Browser-only diagnostic mount. The caller serves this module through Vite,
 * supplies fixed viewport CSS, and uses the real Presentation mode selector.
 */
export async function mountBuildingCapture({ controls, backend = "webgpu", width = 1280, height = 800, freeze: providedFreeze, wallPhaseDiagnostic: wallPhaseEnabled = false }) {
  if (typeof wallPhaseEnabled !== "boolean") throw new Error("Wall phase diagnostic opt-in must be boolean.");
  if (backend !== "webgpu" && backend !== "webgl") {
    throw new Error("Building capture backend must be webgpu or webgl.");
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 360 || height < 320) {
    throw new Error("Building capture dimensions must be integers of at least 360 x 320.");
  }
  if (controls?.remoteMaterialEnabled) {
    throw new Error("The R1 capture harness requires remote material generation to be disabled.");
  }

  const initialFreeze = providedFreeze ? deepFreeze(R1CaptureFreezeSchema.parse(structuredClone(providedFreeze))) : null;
  const fixture = await createAssemblyHallFixture({ promptControls: controls });
  const host = document.createElement("div");
  host.className = "r1-building-capture";
  host.dataset.captureWidth = String(width);
  host.dataset.captureHeight = String(height);
  document.body.appendChild(host);
  const reactRoot = createRoot(host);
  let renderer = null;
  let scene = null;
  let camera = null;
  let freeze = initialFreeze;
  let actualBackend = null;
  let fallbackReason = null;
  let viewName = "three-quarter";
  let lightingName = "ordinary";
  let frameCount = 0;
  let disposed = false;
  let wallDiagnostic = null;
  let wallPhaseDiagnostic = null;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const readyTimeout = setTimeout(() => {
    const detail = host.querySelector('[role="status"]')?.textContent;
    rejectReady(new Error("The production building renderer did not produce a frame within 45 seconds." +
      (detail ? " " + detail : "")));
  }, 45_000);

  function assertLive() {
    if (disposed) {
      throw new Error("The building capture has been disposed.");
    }
  }

  function applyCapture() {
    const view = freeze.views.find((entry) => entry.name === viewName);
    const preset = freeze.lights.find((entry) => entry.name === viewName + "/" + lightingName);
    const { key, fill } = sceneLights(scene);
    camera.position.fromArray(view.position);
    camera.up.fromArray(view.up);
    camera.fov = view.fov;
    camera.near = view.near;
    camera.far = view.far;
    camera.aspect = width / height;
    camera.lookAt(new Vector3().fromArray(view.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    applyLightState(key, preset.key);
    applyLightState(fill, preset.fill);
    scene.updateMatrixWorld(true);
  }

  // Stable identity is necessary: changing this prop restarts AssemblyHall's effect.
  const rendererFactory = async ({ backendSupport }) => {
    try {
      const activation = await createAssemblyRenderer({
        backendSupport: { ...backendSupport, preferredBackend: backend }
      });
      renderer = activation.renderer;
      actualBackend = activation.activeBackend;
      fallbackReason = activation.fallbackReason ?? null;
      const render = renderer.render.bind(renderer);
      renderer.render = (renderScene, renderCamera) => {
        if (disposed) {
          return;
        }
        // WebGPU also renders directional shadows through this public method.
        // Their orthographic cameras must retain the production shadow rig.
        if (!renderCamera.isPerspectiveCamera || (camera && renderCamera !== camera)) {
          return render(renderScene, renderCamera);
        }
        const phaseGeneration = wallPhaseDiagnostic?.getGeneration();
        const restoreCurrentDiagnostic = () => {
          if (disposed || (wallPhaseDiagnostic && wallPhaseDiagnostic.getGeneration() !== phaseGeneration)) return;
          wallPhaseDiagnostic?.restore();
          wallDiagnostic?.restore();
        };
        const submitted = () => {
          if (disposed || (wallPhaseDiagnostic && wallPhaseDiagnostic.getGeneration() !== phaseGeneration)) return;
          frameCount += 1;
          clearTimeout(readyTimeout);
          resolveReady();
        };
        try {
          scene = renderScene;
          camera = renderCamera;
          freeze ??= freezeCapture(fixture, scene, camera, width, height);
          // OrbitControls/resize/presentation callbacks all pass through this lock.
          applyCapture();
          const submission = render(scene, camera);
          // Successful render submissions; pixel capture separately proves the
          // presented frame. This is not a GPU completion counter.
          if (wallPhaseEnabled && submission && typeof submission.then === "function") {
            return Promise.resolve(submission).then(submitted, (error) => {
              restoreCurrentDiagnostic();
              rejectReady(error);
              throw error;
            });
          }
          submitted();
        } catch (error) {
          restoreCurrentDiagnostic();
          rejectReady(error);
          throw error;
        }
      };
      return activation;
    } catch (error) {
      rejectReady(error);
      throw error;
    }
  };

  function snapshot() {
    assertLive();
    if (!scene || !camera || !renderer || !freeze || frameCount < 1) {
      throw new Error("The building capture has not rendered a frame.");
    }
    const { key, fill } = sceneLights(scene);
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const view = freeze.views.find((entry) => entry.name === viewName);
    const materials = fixture.buildingRuntime.renderables.map((renderable) => ({
      batchId: renderable.name,
      materialName: renderable.material.name,
      materialType: renderable.material.type,
      materialSlotId: renderable.userData.materialSlotId ?? null,
      atlasSlotId: renderable.material.userData.atlasSlotId ?? null,
      atlasContentHash: renderable.material.userData.atlasContentHash ?? null
    })).sort((first, second) => first.batchId.localeCompare(second.batchId));
    return {
      viewName,
      lightingName,
      frameCount,
      camera: {
        type: camera.type,
        isPerspectiveCamera: camera.isPerspectiveCamera === true,
        position: camera.position.toArray(),
        target: [...view.target],
        up: camera.up.toArray(),
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        aspect: camera.aspect,
        projectionMatrix: camera.projectionMatrix.toArray(),
        matrixWorld: camera.matrixWorld.toArray(),
        matrixWorldInverse: camera.matrixWorldInverse.toArray()
      },
      key: lightState(key),
      fill: lightState(fill),
      materials,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        devicePixelRatio: window.devicePixelRatio,
        backend: canvas.dataset.rendererBackend ?? actualBackend,
        presentationMode: canvas.dataset.presentationMode ?? null,
        revealThroughStage: canvas.dataset.revealThroughStage ?? null
      },
      actualBackend,
      fallbackReason
    };
  }

  function renderCapture() {
    assertLive();
    const submission = renderer.render(scene, camera);
    if (submission && typeof submission.then === "function") return Promise.resolve(submission).then(snapshot);
    return snapshot();
  }

  function dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimeout(readyTimeout);
    try {
      wallPhaseDiagnostic?.dispose();
      wallDiagnostic?.restore();
      // AssemblyHall first restores atlas materials and releases its own rig/renderer.
      reactRoot.unmount();
    } finally {
      fixture.familyRuntime.dispose();
      host.remove();
    }
  }

  try {
    reactRoot.render(createElement(AssemblyHall, { fixture, rendererFactory }));
    await ready;
    const assertTextured = () => {
      assertLive();
      if (renderer.domElement.dataset.presentationMode !== "textured") throw new Error("Wall diagnostics require textured presentation mode.");
    };
    assertTextured();
    wallDiagnostic = createWallDiagnostic(fixture, assertTextured);
    if (wallPhaseEnabled) wallPhaseDiagnostic = await createWallPhaseDiagnostic({ fixture, assertTextured,
      onCurrentFailure: () => wallDiagnostic.restore() });
    return {
      fixture,
      canvas: renderer.domElement,
      actualBackend,
      fallbackReason,
      freeze,
      setCapture({ viewName: nextView, lightingName: nextLighting }) {
        assertLive();
        if (!freeze.views.some((entry) => entry.name === nextView) ||
            !freeze.lights.some((entry) => entry.name === nextView + "/" + nextLighting)) {
          throw new Error("Unknown building capture preset: " + nextView + "/" + nextLighting);
        }
        viewName = nextView;
        lightingName = nextLighting;
        return renderCapture();
      },
      setWallDiagnostic(nextCondition) {
        // Validate before mutation, then submit the same frozen draw as setCapture.
        // AssemblyHall's on-demand loop otherwise stays idle after a map change.
        wallPhaseDiagnostic?.invalidatePending();
        const phaseGeneration = wallPhaseDiagnostic?.getGeneration();
        const condition = wallDiagnostic.setWallDiagnostic(nextCondition);
        try {
          const submission = renderCapture();
          if (submission && typeof submission.then === "function") return Promise.resolve(submission).then(() => condition, (error) => {
            if (!disposed && (!wallPhaseDiagnostic || wallPhaseDiagnostic.getGeneration() === phaseGeneration)) {
              wallPhaseDiagnostic?.restore();
              wallDiagnostic.restore();
            }
            throw error;
          });
          return condition;
        } catch (error) {
          wallPhaseDiagnostic?.restore();
          wallDiagnostic.restore();
          throw error;
        }
      },
      wallDiagnosticSnapshot: wallDiagnostic.wallDiagnosticSnapshot,
      setWallPhaseDiagnostic(nextCondition) {
        assertLive();
        if (!wallPhaseDiagnostic) throw new Error("Wall phase diagnostics require an explicit building mount opt-in.");
        return wallPhaseDiagnostic.setWallPhaseDiagnostic(nextCondition, renderCapture);
      },
      async wallPhaseDiagnosticSnapshot() {
        assertLive();
        if (!wallPhaseDiagnostic) throw new Error("Wall phase diagnostics require an explicit building mount opt-in.");
        const numbers = (value) => Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) =>
          typeof entry === "boolean" || (typeof entry === "number" && Number.isFinite(entry))));
        const submittedFrameCount = frameCount;
        const backendCounters = { available: Boolean(renderer.info), scope: "renderer.info sampled counters",
          render: numbers(renderer.info?.render), memory: numbers(renderer.info?.memory) };
        const phase = await wallPhaseDiagnostic.wallPhaseDiagnosticSnapshot();
        assertLive();
        return { ...phase, submittedFrameCount, actualBackend, backendCounters };
      },
      snapshot,
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
