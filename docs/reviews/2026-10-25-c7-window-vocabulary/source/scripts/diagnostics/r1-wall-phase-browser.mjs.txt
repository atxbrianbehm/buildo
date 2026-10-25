import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3 } from "three";
import { createWallAtlasGeometry } from "../../src/features/building-family/renderer-three/wallAtlasGeometry.ts";
import { projectWallPhasePoint, deriveSharedWallPhaseUv, R1_WALL_PHASE_FLOAT32_TOLERANCE_M } from "../../src/features/building-family/qa/r1WallPhase.ts";
import { buildFacadeSplitPlan } from "../../src/features/building-family/compiler/facadeSplitPlan.ts";
import { expandBayWallPrimitives } from "../../src/features/building-family/compiler/facadeWallSubdivision.ts";
import { combinePrimitiveGeometry } from "../../src/features/building-family/compiler/primitiveGeometry.ts";
import { planFacadeModules } from "../../src/features/building-family/art-kit/facadeModulePlanner.ts";
import { late19cApartmentKit } from "../../src/features/building-family/art-kit/late19cApartmentKit.ts";

const batchId = "mesh.wall-panels";
const textureKeys = ["map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap", "lightMap"];
const attributeArray = (attribute) => attribute?.isInterleavedBufferAttribute ? attribute.data.array : attribute?.array;
const copyBytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice();
const sameBytes = (array, saved) => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return bytes.length === saved.length && bytes.every((value, index) => value === saved[index]);
};
const sameNumbers = (first, second) => first.length === second.length && first.every((value, index) => Object.is(value, second[index]));

function arrayCopy(array) {
  return array ? { type: array.constructor.name, byteLength: array.byteLength, bytes: copyBytes(array) } : null;
}

function attributes(geometry) {
  return [...Object.entries(geometry.attributes), ["index", geometry.index]].filter(([, attribute]) => attribute);
}

function geometryBuffers(geometry) {
  return new Set(attributes(geometry).map(([, attribute]) => attributeArray(attribute).buffer));
}

function geometryCopy(geometry) {
  return Object.fromEntries(attributes(geometry).map(([name, attribute]) => [name, {
    itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized,
    ...(attribute.isInterleavedBufferAttribute ? { stride: attribute.data.stride, offset: attribute.offset } : {}),
    array: arrayCopy(attributeArray(attribute))
  }]));
}

async function hashCopy(value) {
  const hash = async (bytes) => [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))]
    .map((number) => number.toString(16).padStart(2, "0")).join("");
  const detach = async (item) => {
    if (item instanceof Uint8Array) return await hash(item);
    if (Array.isArray(item)) return await Promise.all(item.map(detach));
    if (item && typeof item === "object") return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await detach(child)])));
    return item;
  };
  return await hash(new TextEncoder().encode(JSON.stringify(await detach(value))));
}

export { hashCopy as hashWallPhaseDiagnosticCopy };

function measureSurface(geometry, relativeMatrix) {
  const transform = new Matrix4().fromArray(relativeMatrix), normalTransform = new Matrix3().getNormalMatrix(transform);
  const position = geometry.attributes.position, normal = geometry.attributes.normal, index = geometry.index;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const points = [new Vector3(), new Vector3(), new Vector3()], edge = new Vector3(), cross = new Vector3(), direction = new Vector3();
  const distribution = new Map();
  let areaM2 = 0, minimumWindingNormalDot = 1;
  for (let offset = 0; offset < (index?.count ?? position.count); offset += 3) {
    direction.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index ? index.getX(offset + corner) : offset + corner;
      points[corner].fromBufferAttribute(position, vertex).applyMatrix4(transform);
      direction.x += normal.getX(vertex); direction.y += normal.getY(vertex); direction.z += normal.getZ(vertex);
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis], points[corner].getComponent(axis));
        bounds.max[axis] = Math.max(bounds.max[axis], points[corner].getComponent(axis));
      }
    }
    cross.subVectors(points[1], points[0]).cross(edge.subVectors(points[2], points[0]));
    const area = cross.length() / 2;
    if (!area) continue;
    direction.applyNormalMatrix(normalTransform).normalize();
    const normalDirection = direction.toArray(), key = normalDirection.map((value) => Math.abs(value) < 1e-12 ? 0 : value).join(",");
    const entry = distribution.get(key) ?? { normal: normalDirection, areaM2: 0 };
    entry.areaM2 += area; distribution.set(key, entry);
    areaM2 += area;
    minimumWindingNormalDot = Math.min(minimumWindingNormalDot, cross.normalize().dot(direction));
  }
  return { selectedSurfaceAreaM2: areaM2, selectedBounds: bounds, normalAreaDistribution: [...distribution.values()], minimumWindingNormalDot };
}

function metadata(attribute) {
  if (!attribute) return null;
  const array = attributeArray(attribute);
  return { type: array.constructor.name, itemSize: attribute.itemSize, count: attribute.count,
    normalized: attribute.normalized, byteLength: array.byteLength, bufferByteLength: array.buffer.byteLength, byteOffset: array.byteOffset };
}

function rawAttributeBytes(attribute) {
  if (!attribute) return null;
  const bytes = copyBytes(attributeArray(attribute));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return globalThis.btoa(binary);
}

function rememberGeometry(geometry) {
  return { geometry, attributes: attributes(geometry).map(([name, attribute]) => ({ name, attribute,
    array: attributeArray(attribute), buffer: attributeArray(attribute).buffer, bytes: copyBytes(attributeArray(attribute)) })) };
}

function geometryReferences(saved) {
  const current = attributes(saved.geometry);
  const sameAttributes = current.length === saved.attributes.length && saved.attributes.every(({ name, attribute }) =>
    (name === "index" ? saved.geometry.index : saved.geometry.attributes[name]) === attribute);
  return { attributes: sameAttributes,
    arrays: sameAttributes && saved.attributes.every(({ attribute, array }) => attributeArray(attribute) === array),
    buffers: sameAttributes && saved.attributes.every(({ attribute, buffer }) => attributeArray(attribute)?.buffer === buffer),
    bytes: sameAttributes && saved.attributes.every(({ attribute, bytes }) => sameBytes(attributeArray(attribute), bytes)) };
}

function originalIrCopy(fixture) {
  return { meshBatches: fixture.ir.meshBatches.map((batch) => ({ batchId: batch.batchId,
    positions: arrayCopy(batch.positions), normals: arrayCopy(batch.normals), uvs: arrayCopy(batch.uvs), indices: arrayCopy(batch.indices) })),
  instanceBatches: fixture.ir.instanceBatches.map((batch) => ({ batchId: batch.batchId, count: batch.count, transforms: arrayCopy(batch.transforms) })) };
}

/** Opt-in capture controller. It owns replacement geometry, never fixture resources. */
export async function createWallPhaseDiagnostic({ fixture, assertTextured = () => {}, geometryFactory = createWallAtlasGeometry, onCurrentFailure = () => {} }) {
  const preparationStarted = globalThis.performance.now();
  const runtime = fixture.buildingRuntime;
  if (runtime.disposed) throw new Error("Wall phase requires a live building runtime.");
  if (runtime.renderables.some((object) => object.isInstancedMesh && object.material.userData.atlasSlot?.role === "wall")) {
    throw new Error("Wall phase does not support live instanced walls.");
  }
  const source = fixture.ir.meshBatches.find((batch) => batch.batchId === batchId);
  const selected = runtime.renderables.filter((object) => object.name === batchId);
  if (!source || selected.length !== 1 || selected[0].isInstancedMesh || !selected[0].isMesh) throw new Error("Wall phase requires one ordinary mesh.wall-panels mesh.");
  const object = selected[0], original = object.geometry, slot = object.material.userData.atlasSlot;
  if (Object.keys(original.attributes).sort().join(",") !== "normal,position,uv" || !original.index ||
      Object.values(original.attributes).some((attribute) => attribute.isInterleavedBufferAttribute)) throw new Error("Wall phase requires canonical ordinary position/normal/UV buffers.");
  if (!slot || slot.role !== "wall" || slot.slotId !== source.materialSlotId || original.userData.wallAtlasSampling?.uvSpace !== "meters") {
    throw new Error("Wall phase requires the authoritative metre-domain wall atlas slot.");
  }
  if (!source.positions || !source.normals || !source.uvs || !source.indices || source.positions.length % 72 ||
      source.normals.length !== source.positions.length || source.uvs.length !== source.positions.length / 3 * 2 ||
      source.indices.length !== source.positions.length / 72 * 36) throw new Error("Wall phase requires the canonical separate-face box source.");

  const wallRecipe = fixture.catalog.recipes.find((recipe) => recipe.role === "wall");
  if (!wallRecipe) throw new Error("Wall phase requires the actual wall recipe.");
  const isKit = fixture.graph.nodes.some((node) => node.id === "node.art-kit-facade-plan" && node.type === "Group");
  const facadePlan = isKit ? planFacadeModules({ spec: fixture.spec, kit: late19cApartmentKit }) : undefined;
  const split = await buildFacadeSplitPlan({ spec: fixture.spec, wallDepthM: Math.max(0.02, wallRecipe.dimensionsM.depth),
    facadePlan, kit: facadePlan ? late19cApartmentKit : undefined, defaultOpeningMode: "front-only" });
  const primitives = [], ownedFacades = [];
  for (const scope of split.scopes) {
    const emitted = expandBayWallPrimitives(scope);
    primitives.push(...emitted);
    ownedFacades.push(...emitted.map(() => scope.facade));
  }
  const reconstructed = combinePrimitiveGeometry(primitives);
  for (const key of ["positions", "normals", "uvs", "indices"]) {
    if (reconstructed[key]?.constructor.name !== source[key].constructor.name || !sameBytes(reconstructed[key], copyBytes(source[key]))) {
      throw new Error("Wall phase facade ownership reconstruction does not match original IR " + key + ".");
    }
  }
  if (runtime.disposed) throw new Error("Wall phase building was disposed during ownership reconstruction.");

  runtime.root.updateWorldMatrix(true, true);
  const rootMatrixWorld = runtime.root.matrixWorld.toArray(), objectMatrixWorld = object.matrixWorld.toArray();
  const phaseModel = { phaseSpace: "building-local-metres", bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
    groundYM: 0, rootMatrixWorld, objectMatrixWorld };
  const placed = [];
  for (let vertex = 0; vertex < source.positions.length / 3; vertex += 1) {
    const projection = projectWallPhasePoint({ sourcePoint: Array.from(source.positions.slice(vertex * 3, vertex * 3 + 3)),
      sourceNormal: Array.from(source.normals.slice(vertex * 3, vertex * 3 + 3)), rootMatrixWorld, objectMatrixWorld });
    placed.push(projection);
    for (let axis = 0; axis < 3; axis += 1) {
      phaseModel.bounds.min[axis] = Math.min(phaseModel.bounds.min[axis], projection.buildingPoint[axis]);
      phaseModel.bounds.max[axis] = Math.max(phaseModel.bounds.max[axis], projection.buildingPoint[axis]);
    }
  }
  const facadeDefinitions = [
    { facade: "front", axis: 2, normal: [0, 0, -1], plane: phaseModel.bounds.min[2] },
    { facade: "rear", axis: 2, normal: [0, 0, 1], plane: phaseModel.bounds.max[2] },
    { facade: "left", axis: 0, normal: [-1, 0, 0], plane: phaseModel.bounds.min[0] },
    { facade: "right", axis: 0, normal: [1, 0, 0], plane: phaseModel.bounds.max[0] }
  ];
  const sharedUvs = source.uvs.slice(), sourceFaces = [];
  for (let elementIndex = 0; elementIndex < source.positions.length / 72; elementIndex += 1) {
    const semantics = fixture.ir.semanticIndex.filter((entry) => entry.batchId === batchId && entry.elementIndex === elementIndex);
    if (semantics.length !== 1) throw new Error("Wall phase requires one actual semantic entry per original box.");
    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const sourceVertexIndices = Array.from({ length: 4 }, (_, corner) => elementIndex * 24 + faceIndex * 4 + corner);
      const buildingPositions = sourceVertexIndices.map((vertex) => placed[vertex].buildingPoint);
      const buildingNormal = placed[sourceVertexIndices[0]].buildingNormal;
      if (!sourceVertexIndices.every((vertex) => sameNumbers(placed[vertex].buildingNormal, buildingNormal))) throw new Error("Wall phase source face normals are inconsistent.");
      const ownedFacade = ownedFacades[elementIndex];
      const definition = facadeDefinitions.find(({ facade, normal, axis, plane }) => facade === ownedFacade &&
        normal.every((value, component) => Math.abs(value - buildingNormal[component]) <= R1_WALL_PHASE_FLOAT32_TOLERANCE_M) &&
        buildingPositions.every((point) => Math.abs(point[axis] - plane) <= R1_WALL_PHASE_FLOAT32_TOLERANCE_M));
      const originalMetreUvs = sourceVertexIndices.map((vertex) => Array.from(source.uvs.slice(vertex * 2, vertex * 2 + 2)));
      const sharedMetreUvs = definition ? buildingPositions.map((buildingPoint) => deriveSharedWallPhaseUv({
        buildingPoint, buildingNormal, facade: definition.facade, bounds: phaseModel.bounds, groundYM: phaseModel.groundYM })) : originalMetreUvs.map((uv) => [...uv]);
      // Keep the actual Float32 values that the existing clipper will consume.
      for (const [corner, vertex] of sourceVertexIndices.entries()) {
        sharedUvs.set(sharedMetreUvs[corner], vertex * 2);
        sharedMetreUvs[corner] = Array.from(sharedUvs.slice(vertex * 2, vertex * 2 + 2));
      }
      sourceFaces.push({ elementIndex, faceIndex, ownedFacade, semanticPath: semantics[0].semanticPath, sourceVertexIndices,
        selected: Boolean(definition), facade: definition?.facade ?? null, buildingPositions, buildingNormal, originalMetreUvs, sharedMetreUvs });
    }
  }
  if (!facadeDefinitions.every(({ facade }) => sourceFaces.some((face) => face.facade === facade))) throw new Error("Wall phase did not find all four exterior facade planes.");
  if (sourceFaces.filter((face) => face.selected).length !== ownedFacades.length) throw new Error("Wall phase requires exactly one owned exterior face per original box.");
  const preparationTimeMs = globalThis.performance.now() - preparationStarted;

  const originals = runtime.renderables.map((renderable) => ({ object: renderable, ...rememberGeometry(renderable.geometry),
    matrix: renderable.matrix.toArray(), matrixWorld: renderable.matrixWorld.toArray(),
    instanceMatrix: renderable.isInstancedMesh ? { attribute: renderable.instanceMatrix, array: attributeArray(renderable.instanceMatrix), bytes: copyBytes(attributeArray(renderable.instanceMatrix)) } : null }));
  const originalSelected = originals.find((row) => row.object === object);
  const originalIr = [...fixture.ir.meshBatches.flatMap((batch) => ["positions", "normals", "uvs", "indices"].filter((key) => batch[key]).map((key) => ({ batch, key, array: batch[key], bytes: copyBytes(batch[key]) }))),
    ...fixture.ir.instanceBatches.filter((batch) => batch.transforms).map((batch) => ({ batch, key: "transforms", array: batch.transforms, bytes: copyBytes(batch.transforms) }))];
  const originalMeshBatches = [...fixture.ir.meshBatches], originalInstanceBatches = [...fixture.ir.instanceBatches];
  const originalRoot = { matrix: runtime.root.matrix.toArray(), matrixWorld: runtime.root.matrixWorld.toArray() };
  const originalStages = runtime.stageGroups.map(({ group }) => ({ group, matrix: group.matrix.toArray(), matrixWorld: group.matrixWorld.toArray() }));
  const textures = new Set(runtime.renderables.flatMap((renderable) => textureKeys.map((key) => renderable.material[key])).filter(Boolean));
  const originalTextures = [...textures].map((texture) => ({ texture, data: texture.image?.data, bytes: texture.image?.data ? copyBytes(texture.image.data) : null }));
  const bufferIds = new WeakMap(), bufferTable = new Map();
  const ids = (buffers) => [...new Set(buffers)].map((buffer) => {
    if (!bufferIds.has(buffer)) { const id = "buffer-" + (bufferTable.size + 1); bufferIds.set(buffer, id); bufferTable.set(id, buffer.byteLength); }
    return bufferIds.get(buffer);
  });
  const sum = (names) => names.reduce((total, id) => total + bufferTable.get(id), 0);
  const sceneBuffers = () => new Set(runtime.renderables.flatMap((renderable) => [...geometryBuffers(renderable.geometry),
    ...(renderable.isInstancedMesh ? [attributeArray(renderable.instanceMatrix).buffer] : [])]));
  const originalSceneIds = ids(sceneBuffers()), originalSelectedIds = ids(geometryBuffers(original));
  const auxiliary = ids([sharedUvs.buffer,
    ...originals.flatMap((row) => row.attributes.map(({ bytes }) => bytes.buffer)),
    ...originals.filter((row) => row.instanceMatrix).map((row) => row.instanceMatrix.bytes.buffer),
    ...originalIr.map(({ bytes }) => bytes.buffer), ...originalTextures.filter(({ bytes }) => bytes).map(({ bytes }) => bytes.buffer)]);
  const ownershipBuffers = [...primitives, reconstructed].flatMap((primitive) => ["positions", "normals", "uvs", "indices"]
    .map((key) => primitive[key]).filter((array) => ArrayBuffer.isView(array)).map((array) => array.buffer));
  const preparationPeak = [...new Set([...originalSceneIds, ...auxiliary, ...ids(ownershipBuffers)])];
  let condition = "local", generation = 0, disposed = false, candidate = null, temporary = null;
  let peak = preparationPeak, constructionTimeMs = 0, temporarySourceBufferBytes = 0;
  let ownedGeometryCreated = 0, ownedGeometryDisposed = 0, temporaryGeometryCreated = 0, temporaryGeometryDisposed = 0;

  function ledger() {
    const active = ids(sceneBuffers()), retainedOriginal = [...originalSelectedIds], owned = candidate ? ids(geometryBuffers(candidate)) : [], temporaryIds = temporary ? ids(geometryBuffers(temporary)) : [];
    const union = [...new Set([...active, ...retainedOriginal, ...owned, ...temporaryIds, ...auxiliary])];
    if (sum(union) > sum(peak)) peak = union;
    return { buffers: [...bufferTable].map(([id, byteLength]) => ({ id, byteLength })), active, retainedOriginal, owned, temporary: temporaryIds, auxiliary: [...auxiliary], peak: [...peak],
      activeBytes: sum(active), retainedOriginalBytes: sum(retainedOriginal), ownedBytes: sum(owned), temporaryBytes: sum(temporaryIds), auxiliaryBytes: sum(auxiliary), peakBytes: sum(peak) };
  }

  function referenceState() {
    const refs = geometryReferences(originalSelected);
    return { selectedOriginalGeometryAttached: object.geometry === original,
      originalSelectedAttributeReferencesIntact: refs.attributes, originalSelectedArrayReferencesIntact: refs.arrays,
      originalSelectedBufferReferencesIntact: refs.buffers, originalSelectedBytesIntact: refs.bytes,
      protectedGeometryReferencesIntact: originals.filter((row) => row.object !== object).every((row) => row.object.geometry === row.geometry && Object.values(geometryReferences(row)).every(Boolean)),
      irReferencesIntact: originalIr.every(({ batch, key, array, bytes }) => batch[key] === array && sameBytes(array, bytes)) };
  }

  function assertProtected() {
    if (runtime.disposed) throw new Error("Wall phase building runtime has been disposed.");
    if (runtime.renderables.length !== originals.length || runtime.renderables.some((renderable, index) => renderable !== originals[index].object) ||
        fixture.ir.meshBatches.length !== originalMeshBatches.length || fixture.ir.meshBatches.some((batch, index) => batch !== originalMeshBatches[index]) ||
        fixture.ir.instanceBatches.length !== originalInstanceBatches.length || fixture.ir.instanceBatches.some((batch, index) => batch !== originalInstanceBatches[index])) throw new Error("Wall phase protected batch ownership changed.");
    const refs = referenceState();
    if (!refs.originalSelectedAttributeReferencesIntact || !refs.originalSelectedArrayReferencesIntact || !refs.originalSelectedBufferReferencesIntact ||
        !refs.originalSelectedBytesIntact || !refs.protectedGeometryReferencesIntact || !refs.irReferencesIntact) throw new Error("Wall phase protected geometry or IR changed.");
    if (object.geometry !== (condition === "shared" ? candidate : original)) throw new Error("Wall phase active geometry reference changed outside the controller.");
    if (!sameNumbers(runtime.root.matrix.elements, originalRoot.matrix) || !sameNumbers(runtime.root.matrixWorld.elements, originalRoot.matrixWorld) ||
        originalStages.some(({ group, matrix, matrixWorld }) => !sameNumbers(group.matrix.elements, matrix) || !sameNumbers(group.matrixWorld.elements, matrixWorld)) ||
        originals.some((row) => !sameNumbers(row.object.matrix.elements, row.matrix) || !sameNumbers(row.object.matrixWorld.elements, row.matrixWorld) ||
          (row.instanceMatrix && (row.object.instanceMatrix !== row.instanceMatrix.attribute || attributeArray(row.object.instanceMatrix) !== row.instanceMatrix.array || !sameBytes(row.instanceMatrix.array, row.instanceMatrix.bytes))))) {
      throw new Error("Wall phase protected placement or instance transforms changed.");
    }
    if (originalTextures.some(({ texture, data, bytes }) => texture.userData.disposed || texture.image?.data !== data || (data && !sameBytes(data, bytes)))) throw new Error("Wall phase protected texture bytes changed.");
  }

  function releaseCandidate() {
    if (!candidate) return;
    const owned = candidate;
    candidate = null;
    ownedGeometryDisposed += 1;
    owned.dispose();
  }

  function restore() {
    generation += 1;
    // The fixture reference is restored before a render-owned replacement is released.
    object.geometry = original;
    condition = "local";
    releaseCandidate();
    return condition;
  }

  function construct() {
    const started = globalThis.performance.now();
    try {
      temporary = new BufferGeometry();
      temporaryGeometryCreated += 1;
      temporary.name = original.name;
      temporary.setAttribute("position", new BufferAttribute(source.positions.slice(), 3));
      temporary.setAttribute("normal", new BufferAttribute(source.normals.slice(), 3));
      temporary.setAttribute("uv", new BufferAttribute(sharedUvs.slice(), 2));
      temporary.setIndex(new BufferAttribute(source.indices.slice(), 1));
      temporarySourceBufferBytes = sum(ids(geometryBuffers(temporary)));
      ledger();
      candidate = geometryFactory(temporary, slot, { uvSpace: "meters", scale: [1, 1, 1] });
      if (!candidate || candidate === original || candidate === temporary || !candidate.isBufferGeometry) {
        candidate = null;
        throw new Error("Wall phase geometry factory did not return separately owned geometry.");
      }
      ownedGeometryCreated += 1;
      ledger();
      if (!candidate.getAttribute("position") || !candidate.getAttribute("normal") || !candidate.getAttribute("uv") || !candidate.index ||
          candidate.userData.wallAtlasSampling?.uvSpace !== "meters") throw new Error("Wall phase replacement geometry is incomplete.");
    } catch (error) {
      restore();
      throw error;
    } finally {
      constructionTimeMs = globalThis.performance.now() - started;
      if (temporary) {
        const owned = temporary;
        temporary = null;
        temporaryGeometryDisposed += 1;
        owned.dispose();
      }
    }
  }

  function inspectResources() {
    return { disposed, generation, condition, references: referenceState(), resources: { ownedGeometryCreated, ownedGeometryDisposed,
      ownedGeometryLive: candidate ? 1 : 0, temporaryGeometryCreated, temporaryGeometryDisposed, temporaryGeometryLive: temporary ? 1 : 0 } };
  }

  return {
    restore,
    getGeneration: () => generation,
    invalidatePending: () => { generation += 1; },
    inspectResources,
    async setWallPhaseDiagnostic(nextCondition, submit = () => {}) {
      if (disposed) throw new Error("Wall phase diagnostic has been disposed.");
      if (nextCondition !== "local" && nextCondition !== "shared") throw new Error("Unknown wall phase diagnostic condition: " + nextCondition);
      let token;
      try {
        assertTextured();
        assertProtected();
        restore();
        if (nextCondition === "shared") {
          construct();
          object.geometry = candidate;
          condition = "shared";
        }
        token = ++generation;
        assertProtected();
        await submit();
        if (disposed || token !== generation) throw new Error("Wall phase diagnostic submission became stale.");
        assertProtected();
        return condition;
      } catch (error) {
        // A late rejection cannot restore over a newer treatment or disposal.
        if (!disposed && (token === undefined || token === generation)) {
          restore();
          onCurrentFailure();
        }
        throw error;
      }
    },
    async wallPhaseDiagnosticSnapshot() {
      if (disposed) throw new Error("Wall phase diagnostic has been disposed.");
      assertTextured();
      assertProtected();
      // Detach every submitted array, transform and state before the first await.
      const savedCondition = condition, savedGeneration = generation, active = object.geometry;
      const allocationLedger = ledger();
      const originalIrState = originalIrCopy(fixture);
      const protectedGeometry = originals.filter((row) => row.object !== object).map((row) => ({ batchId: row.object.name, geometry: geometryCopy(row.object.geometry),
        matrix: row.object.matrix.toArray(), matrixWorld: row.object.matrixWorld.toArray(),
        instanceMatrix: row.object.isInstancedMesh ? arrayCopy(attributeArray(row.object.instanceMatrix)) : null }));
      const transformState = { root: runtime.root.matrix.toArray(), rootWorld: runtime.root.matrixWorld.toArray(),
        stages: runtime.stageGroups.map(({ stage, group }) => ({ stage, matrix: group.matrix.toArray(), matrixWorld: group.matrixWorld.toArray() })),
        selectedMatrix: object.matrix.toArray(), selectedWorld: object.matrixWorld.toArray() };
      const selectedGeometry = geometryCopy(active);
      const submittedGeometry = { positions: Array.from(active.attributes.position.array), normals: Array.from(active.attributes.normal.array), uvs: Array.from(active.attributes.uv.array),
        indices: active.index ? Array.from(active.index.array) : null,
        attributeMetadata: { position: metadata(active.attributes.position), normal: metadata(active.attributes.normal), uv: metadata(active.attributes.uv), index: metadata(active.index) },
        rawAttributeBytes: { position: rawAttributeBytes(active.attributes.position), normal: rawAttributeBytes(active.attributes.normal), uv: rawAttributeBytes(active.attributes.uv), index: rawAttributeBytes(active.index) },
        matrixWorld: object.matrixWorld.toArray(), rootMatrixWorld: runtime.root.matrixWorld.toArray(), wallAtlasSampling: structuredClone(active.userData.wallAtlasSampling) };
      const sourceState = { batchId, positions: arrayCopy(source.positions), normals: arrayCopy(source.normals), uvs: arrayCopy(source.uvs), indices: arrayCopy(source.indices) };
      const protectedUvs = sourceFaces.filter((face) => !face.selected).map(({ elementIndex, faceIndex, sourceVertexIndices }) => ({ elementIndex, faceIndex, sourceVertexIndices,
        original: arrayCopy(new Float32Array(sourceVertexIndices.flatMap((vertex) => [source.uvs[vertex * 2], source.uvs[vertex * 2 + 1]]))),
        shared: arrayCopy(new Float32Array(sourceVertexIndices.flatMap((vertex) => [sharedUvs[vertex * 2], sharedUvs[vertex * 2 + 1]]))) }));
      const resourceState = inspectResources();
      const cost = { activeSceneTriangleCount: runtime.renderables.reduce((total, renderable) => total + (renderable.geometry.index?.count ?? renderable.geometry.attributes.position.count) / 3 * (renderable.isInstancedMesh ? renderable.count : 1), 0),
        ...measureSurface(active, placed[0].relativeMatrix),
        activeSceneGeometryBufferBytes: sum(ids(runtime.renderables.flatMap((renderable) => [...geometryBuffers(renderable.geometry)]))),
        activeInstanceMatrixBufferBytes: sum(ids(runtime.renderables.filter((renderable) => renderable.isInstancedMesh).map((renderable) => attributeArray(renderable.instanceMatrix).buffer))),
        activeSceneUniqueBufferBytes: allocationLedger.activeBytes, retainedOriginalBufferBytes: allocationLedger.retainedOriginalBytes,
        temporarySourceBufferBytes, guardSnapshotBufferBytes: allocationLedger.auxiliaryBytes, ownedReplacementBufferBytes: allocationLedger.ownedBytes, peakUnionBufferBytes: allocationLedger.peakBytes, preparationTimeMs, constructionTimeMs,
        sourceVertexCount: source.positions.length / 3, sourceTriangleCount: source.indices.length / 3,
        renderedVertexCount: active.attributes.position.count, renderedTriangleCount: (active.index?.count ?? active.attributes.position.count) / 3,
        scope: "Scene, instance, retained-original, guard and replacement ArrayBuffers; excludes report transport, JavaScript objects and GPU allocations." };
      const [sourceGeometryHash, originalIrHash, protectedGeometryHash, protectedUvHash, instanceTransformsHash, selectedGeometryHash, activeGeometryHash] = await Promise.all([
        hashCopy(sourceState), hashCopy(originalIrState), hashCopy({ protectedGeometry, transformState }), hashCopy(protectedUvs),
        hashCopy({ source: originalIrState.instanceBatches, submitted: protectedGeometry.filter((row) => row.instanceMatrix).map(({ batchId: id, instanceMatrix, matrix, matrixWorld }) => ({ batchId: id, instanceMatrix, matrix, matrixWorld })) }),
        hashCopy(selectedGeometry), hashCopy({ selectedGeometry, protectedGeometry, transformState })
      ]);
      if (disposed || generation !== savedGeneration) throw new Error("Wall phase diagnostic snapshot became stale.");
      assertProtected();
      return { schemaVersion: "0.1.0", condition: savedCondition, generation: savedGeneration, selectedBatchId: batchId, phaseModel: structuredClone(phaseModel),
        sourceFaces: structuredClone(sourceFaces), selectedFaceCount: sourceFaces.filter((face) => face.selected).length,
        protectedFaceCount: sourceFaces.filter((face) => !face.selected).length, submittedGeometry,
        sourceGeometryHash, originalIrHash, protectedGeometryHash, protectedUvHash, instanceTransformsHash, selectedGeometryHash, activeGeometryHash,
        references: resourceState.references, resources: resourceState.resources, allocationLedger, cost };
    },
    dispose() {
      if (disposed) return;
      restore();
      disposed = true;
    }
  };
}
