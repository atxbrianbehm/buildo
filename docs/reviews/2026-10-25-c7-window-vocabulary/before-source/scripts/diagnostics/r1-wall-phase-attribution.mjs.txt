import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Triangle, Vector2, Vector3 } from "three";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const bytesEqual = (a, b) => Buffer.from(raw(a)).equals(Buffer.from(raw(b)));
const normalForFacade = { front: [0, 0, -1], rear: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0] };
const facadeForNormal = normal => Object.entries(normalForFacade).find(([, direction]) => direction.every((n, i) => Math.abs(normal[i] - n) < 1e-6))?.[0] ?? null;
const typedArrayConstructors = { Float32Array, Float64Array, Uint16Array, Uint32Array, Uint8Array };
const copyArray = array => array ? { type: array.constructor.name, byteLength: array.byteLength, bytes: hash(raw(array)) } : null;
const fingerprint = value => hash(JSON.stringify(value));
const pairKey = face => face.elementIndex + "/" + face.faceIndex;
const close = (a, b, epsilon = 2e-5) => a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) <= epsilon);
const interpolated = (values, weights) => values[0].map((_, axis) => values.reduce((sum, point, i) => sum + point[axis] * weights[i], 0));

/** Reconstruct ownership from the compiler's unchanged scope expansion, never from a cap normal. */
export async function reconstructWallOwnership({ fixture, splitModule, subdivision, primitives, kit, plannerModule }) {
  const source = fixture.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels");
  const wallRecipe = fixture.catalog.recipes.find(recipe => recipe.role === "wall");
  assert(source?.positions && source.normals && source.uvs && source.indices && wallRecipe);
  assert(plannerModule?.planFacadeModules, "The actual compiler facade planner is required.");
  const plan = await splitModule.buildFacadeSplitPlan({
    spec: fixture.spec, wallDepthM: Math.max(0.02, wallRecipe.dimensionsM.depth),
    facadePlan: plannerModule.planFacadeModules({ spec: fixture.spec, kit }), kit, defaultOpeningMode: "front-only"
  });
  const owned = plan.scopes.flatMap((scope, scopeIndex) => subdivision.expandBayWallPrimitives(scope)
    .map(primitive => ({ ownedFacade: scope.facade, scopeIndex, primitive })));
  const combined = primitives.combinePrimitiveGeometry(owned.map(row => row.primitive));
  for (const name of ["positions", "normals", "uvs", "indices"]) {
    assert.equal(combined[name].constructor.name, source[name].constructor.name);
    assert(bytesEqual(combined[name], source[name]), "Authoritative scope ordering does not reproduce actual wall " + name + " bytes.");
  }
  assert.equal(owned.length, source.positions.length / 72); assert.equal(owned.length, 265);
  for (let elementIndex = 0; elementIndex < owned.length; elementIndex += 1) {
    const entries = fixture.ir.semanticIndex.filter(entry => entry.batchId === source.batchId && entry.elementIndex === elementIndex);
    assert.equal(entries.length, 1, "Every primitive requires one actual compiler semantic entry.");
    assert.equal(entries[0].semanticPath, "building/" + fixture.spec.familyId + "/facade/wall/subdivided/piece/" + elementIndex);
    owned[elementIndex] = { ...owned[elementIndex], elementIndex, semanticPath: entries[0].semanticPath };
  }
  return owned;
}

export function fingerprintOriginalIr(fixture) {
  return fingerprint({
    meshBatches: fixture.ir.meshBatches.map(batch => ({ batchId: batch.batchId, positions: copyArray(batch.positions),
      normals: copyArray(batch.normals), uvs: copyArray(batch.uvs), indices: copyArray(batch.indices) })),
    instanceBatches: fixture.ir.instanceBatches.map(batch => ({ batchId: batch.batchId, count: batch.count, transforms: copyArray(batch.transforms) }))
  });
}

/** Rebuild callers supply a fresh actual fixture and intercepted provider outputs. */
export async function verifyFreshS8MaterialFixture({ fixture, sources, requests, materialBaseline, baseline, canonicalJson, fingerprintBuildingGeometry }) {
  const same = (a, b, message) => assert.equal(canonicalJson(a), canonicalJson(b), message);
  const ordered = [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  assert.equal(ordered.length, 12); assert.equal(requests.size, 12);
  const materialState = {
    sourceHashes: ordered.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash })),
    sourceLayerHashes: ordered.map(source => ({ sourceId: source.sourceId,
      ...Object.fromEntries(["baseColor", "height", "roughness", "metalness", "opacity"].map(name => [name, source.layers[name] ? hash(raw(source.layers[name].data)) : null])),
      provenanceHash: hash(canonicalJson(source.provenance)) })),
    channelHashes: Object.fromEntries(fixture.debugExport.channels.map(({ name, channelHash }) => [name, channelHash])),
    channelDataHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, hash(raw(layer.data))]))
  };
  for (const key of Object.keys(materialState)) same(materialState[key], materialBaseline.after[key], "Fresh actual S8 " + key + " changed.");
  same(ordered.map(source => requests.get(source.sourceId)), materialBaseline.afterRequests, "Fresh actual S8 requests changed.");
  same(fixture.spec, baseline.resolvedSpec); same(fixture.packedAtlas.manifest, baseline.materialAnchors.atlasManifest);
  const identity = { familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId,
    sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId, atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash };
  same(identity, baseline.identity);
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  const geometryHash = await fingerprintBuildingGeometry(fixture); assert.equal(geometryHash, materialBaseline.immutable.geometryHash);
  return { materialState, identity, geometryHash };
}

function decodeAttribute(name, values, metadata, encoded) {
  if (metadata === null) { assert.equal(values, null); assert.equal(encoded, null); return null; }
  assert(metadata && Object.hasOwn(typedArrayConstructors, metadata.type), "Unsupported submitted attribute storage.");
  assert.deepEqual(Object.keys(metadata).sort(), ["type", "itemSize", "count", "normalized", "byteLength", "bufferByteLength", "byteOffset"].sort());
  assert.equal(typeof metadata.normalized, "boolean");
  for (const key of ["itemSize", "count", "byteLength", "bufferByteLength", "byteOffset"]) assert(Number.isSafeInteger(metadata[key]) && metadata[key] >= 0);
  assert(metadata.itemSize > 0 && metadata.count > 0);
  assert.equal(typeof encoded, "string"); assert(Array.isArray(values));
  const Type = typedArrayConstructors[metadata.type], bytes = Buffer.from(encoded, "base64");
  assert.equal(bytes.toString("base64"), encoded, "Submitted bytes require canonical base64.");
  assert.equal(bytes.byteLength, metadata.byteLength); assert.equal(bytes.byteLength, values.length * Type.BYTES_PER_ELEMENT);
  assert.equal(metadata.count * metadata.itemSize, values.length);
  assert(metadata.byteOffset >= 0 && metadata.byteOffset + metadata.byteLength <= metadata.bufferByteLength);
  const array = new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert(values.every((value, i) => Number.isFinite(value) && value === array[i]), "Numeric transport differs from actual " + name + " bytes.");
  const attribute = new BufferAttribute(array, metadata.itemSize, metadata.normalized);
  assert.equal(attribute.count, metadata.count);
  return attribute;
}

/** The transport retains raw bytes, including signed zero and the actual index width. */
export function decodeSubmittedWall(snapshot, originalMaterial) {
  assert.equal(snapshot.schemaVersion, "0.1.0"); assert.equal(snapshot.selectedBatchId, "mesh.wall-panels");
  assert(snapshot.condition === "local" || snapshot.condition === "shared");
  const input = snapshot.submittedGeometry, geometry = new BufferGeometry();
  try {
    for (const [name, values] of [["position", input.positions], ["normal", input.normals], ["uv", input.uvs]]) {
      const attribute = decodeAttribute(name, values, input.attributeMetadata[name], input.rawAttributeBytes[name]);
      assert(attribute, "The submitted wall requires " + name); geometry.setAttribute(name, attribute);
    }
    const index = decodeAttribute("index", input.indices, input.attributeMetadata.index, input.rawAttributeBytes.index);
    if (index) geometry.setIndex(index);
    assert.equal(geometry.getAttribute("position").itemSize, 3); assert.equal(geometry.getAttribute("normal").itemSize, 3);
    assert.equal(geometry.getAttribute("uv").itemSize, 2);
    const count = geometry.index?.count ?? geometry.getAttribute("position").count; assert.equal(count % 3, 0);
    const serialized = Object.fromEntries(["position", "normal", "uv", "index"].flatMap(name => {
      const attribute = name === "index" ? geometry.index : geometry.getAttribute(name);
      return attribute ? [[name, { itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, array: copyArray(attribute.array) }]] : [];
    }));
    assert.equal(fingerprint(serialized), snapshot.selectedGeometryHash, "The submitted raw views must bind the actual selected geometry hash.");
    const material = new MeshBasicMaterial({ side: originalMaterial.side });
    const mesh = new Mesh(geometry, material); mesh.name = "mesh.wall-panels"; mesh.matrixAutoUpdate = false;
    mesh.matrixWorld.fromArray(input.matrixWorld); mesh.matrix.copy(mesh.matrixWorld);
    return { mesh, geometry, dispose() { geometry.dispose(); material.dispose(); } };
  } catch (error) { geometry.dispose(); throw error; }
}

function sharedMetres(point, facade, model) {
  const { min, max } = model.bounds;
  const u = facade === "front" ? max[0] - point[0] : facade === "rear" ? point[0] - min[0]
    : facade === "left" ? point[2] - min[2] : max[2] - point[2];
  return [u, point[1] - model.groundYM];
}
function sourceMetres(point, face) {
  const vertices = face.buildingPositions.slice(0, 3).map(value => new Vector3().fromArray(value));
  const weights = Triangle.getBarycoord(new Vector3().fromArray(point), ...vertices, new Vector3());
  assert(weights, "Degenerate source quad.");
  return interpolated(face.originalMetreUvs.slice(0, 3), weights.toArray());
}
function bounds(points) {
  return { min: [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis]))),
    max: [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis]))) };
}
function insideFace(point, face, epsilon = 2e-5) {
  return point.every((value, axis) => value >= face.bounds.min[axis] - epsilon && value <= face.bounds.max[axis] + epsilon)
    && Math.abs(face.buildingNormal.reduce((sum, n, axis) => sum + n * (point[axis] - face.buildingPositions[0][axis]), 0)) <= epsilon;
}

function verifySourceFaces(snapshot, fixture, ownership, same) {
  const source = fixture.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels"), model = snapshot.phaseModel;
  const objectToRoot = new Matrix4().fromArray(model.rootMatrixWorld).invert().multiply(new Matrix4().fromArray(model.objectMatrixWorld));
  const normalMatrix = new Matrix3().getNormalMatrix(objectToRoot), rows = snapshot.sourceFaces;
  assert.equal(rows.length, 1590); assert.equal(new Set(rows.map(pairKey)).size, 1590);
  const expected = [];
  for (const piece of ownership) for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    const first = piece.elementIndex * 24 + faceIndex * 4, indices = [0, 1, 2, 3].map(offset => first + offset);
    const positions = indices.map(index => new Vector3().fromArray(source.positions, index * 3).applyMatrix4(objectToRoot).toArray());
    const normal = new Vector3().fromArray(source.normals, first * 3).applyNormalMatrix(normalMatrix).toArray();
    const direction = facadeForNormal(normal), original = indices.map(index => Array.from(source.uvs.subarray(index * 2, index * 2 + 2)));
    const selected = direction === piece.ownedFacade, facade = selected ? piece.ownedFacade : null;
    const row = rows.find(value => value.elementIndex === piece.elementIndex && value.faceIndex === faceIndex); assert(row);
    assert.equal(row.semanticPath, piece.semanticPath); assert.equal(row.ownedFacade, piece.ownedFacade); assert.equal(row.facade, facade); assert.equal(row.selected, selected);
    same(row.sourceVertexIndices, indices, "Raw source vertex ownership changed.");
    assert(close(row.buildingNormal, normal)); positions.forEach((point, index) => assert(close(row.buildingPositions[index], point)));
    same(row.originalMetreUvs, original, "Original raw metre UV values changed.");
    const projected = selected ? positions.map(point => sharedMetres(point, facade, model)) : original;
    projected.forEach((uv, index) => assert(close(row.sharedMetreUvs[index], uv), "Shared phase must derive independently from literal facade frames."));
    expected.push({ ...row, bounds: bounds(positions) });
  }
  return expected;
}

function reconstructSubmittedOwners({ fixture, snapshot, faces, baseline, createWallAtlasGeometry, decoded }) {
  const source = fixture.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels"), geometry = new BufferGeometry();
  const metres = source.uvs.slice(), owners = [], slot = baseline.materialAnchors.atlasManifest.slots.find(row => row.id === "wall.primary"), atlas = baseline.materialAnchors.atlasManifest;
  const window = { ...slot, uvRect: { x: slot.rectPx.x / atlas.widthPx, y: slot.rectPx.y / atlas.heightPx, width: slot.rectPx.width / atlas.widthPx, height: slot.rectPx.height / atlas.heightPx } };
  if (snapshot.condition === "shared") for (const face of faces.filter(row => row.selected)) for (let corner = 0; corner < 4; corner += 1) {
    const uv = sharedMetres(face.buildingPositions[corner], face.facade, snapshot.phaseModel); metres.set(uv, face.sourceVertexIndices[corner] * 2);
  }
  geometry.setAttribute("position", new BufferAttribute(source.positions, 3)); geometry.setAttribute("normal", new BufferAttribute(source.normals, 3)); geometry.setAttribute("uv", new BufferAttribute(metres, 2));
  let vertexOffset = 0, indexOffset = 0;
  try {
    const sampling = snapshot.submittedGeometry.wallAtlasSampling;
    assert.equal(sampling.schemaVersion, "0.1.0"); assert.equal(sampling.algorithm, "cpu-tile-clipping-v1");
    assert.equal(sampling.sourceVertexCount, 6360); assert.equal(sampling.sourceTriangleCount, 3180);
    assert.equal(sampling.renderedVertexCount, decoded.geometry.attributes.position.count);
    assert.equal(sampling.renderedTriangleCount, decoded.geometry.index.count / 3);
    assert.equal(sampling.uvSpace, "meters"); assert(sampling.repeatU && sampling.repeatV); assert(close(sampling.scale, [1, 1, 1], 0));
    for (const face of faces) {
      const start = (face.elementIndex * 6 + face.faceIndex) * 6;
      const faceIndices = source.indices.subarray(start, start + 6);
      assert([...faceIndices].every(index => face.sourceVertexIndices.includes(index)), "Actual source index order must remain within its recorded face.");
      geometry.setIndex(new BufferAttribute(faceIndices, 1));
      let fragment;
      try {
        fragment = createWallAtlasGeometry(geometry, window, { uvSpace: "meters", scale: [1, 1, 1] });
        for (const name of ["position", "normal", "uv"]) {
          const expected = fragment.attributes[name], actual = decoded.geometry.attributes[name], first = vertexOffset * actual.itemSize;
          assert.equal(expected.array.constructor.name, actual.array.constructor.name);
          assert(bytesEqual(expected.array, actual.array.subarray(first, first + expected.array.length)), "Actual submitted " + name + " stream differs from deterministic source-face clip order.");
        }
        assert(fragment.index && decoded.geometry.index); assert.equal(decoded.geometry.index.array.constructor.name, "Uint32Array");
        for (let index = 0; index < fragment.index.count; index += 1) assert.equal(decoded.geometry.index.getX(indexOffset + index), vertexOffset + fragment.index.getX(index), "Actual submitted index stream left deterministic source-face order.");
        owners.push(...Array.from({ length: fragment.index.count / 3 }, () => face));
        vertexOffset += fragment.attributes.position.count; indexOffset += fragment.index.count;
      } finally { fragment?.dispose(); }
    }
    assert.equal(vertexOffset, decoded.geometry.attributes.position.count); assert.equal(indexOffset, decoded.geometry.index.count);
    return owners;
  } finally { geometry.dispose(); }
}

function triangleData(decoded, snapshot, phase, owners) {
  const geometry = decoded.geometry, position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
  const toRoot = new Matrix4().fromArray(snapshot.submittedGeometry.rootMatrixWorld).invert().multiply(decoded.mesh.matrixWorld);
  const normalMatrix = new Matrix3().getNormalMatrix(toRoot), count = geometry.index?.count ?? position.count, rows = [];
  const pointFor = vertex => new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(toRoot).toArray();
  const normalFor = vertex => new Vector3().fromBufferAttribute(normal, vertex).applyNormalMatrix(normalMatrix).toArray();
  for (let offset = 0; offset < count; offset += 3) {
    const indices = [0, 1, 2].map(n => geometry.index ? geometry.index.getX(offset + n) : offset + n);
    const points = indices.map(pointFor), normals = indices.map(normalFor), center = points[0].map((_, axis) => points.reduce((sum, p) => sum + p[axis], 0) / 3);
    const face = owners[offset / 3]; assert(face);
    assert(close(face.buildingNormal, normals[0], 1e-5) && insideFace(center, face, 2e-5) && points.every(point => insideFace(point, face, 2e-5)), "Actual source-ordered triangle left its authoritative face.");
    const atlasUvs = indices.map(vertex => [uv.getX(vertex), uv.getY(vertex)]);
    const metreUvs = points.map(point => phase === "shared" && face.selected ? sharedMetres(point, face.facade, snapshot.phaseModel) : sourceMetres(point, face));
    const tile = [0, 1].map(axis => Math.floor(metreUvs.reduce((sum, value) => sum + value[axis], 0) / 3 / 0.96));
    rows.push({ faceIndex: offset / 3, sourceFace: face, indices, positionsM: points, normals, atlasUvs, metreUvs, tile });
  }
  return rows;
}
function barycentric(point, triangle) {
  const weights = Triangle.getBarycoord(new Vector3().fromArray(point), ...triangle.positionsM.map(value => new Vector3().fromArray(value)), new Vector3());
  if (!weights) return null;
  const values = weights.toArray();
  if (!values.every(value => value >= -2e-6 && value <= 1 + 2e-6)) return null;
  const clamped = values.map(value => Math.max(0, Math.min(1, value))), total = clamped.reduce((sum, value) => sum + value, 0);
  return clamped.map(value => value / total);
}
function triangleAt(rows, face, point) {
  return rows.filter(row => pairKey(row.sourceFace) === pairKey(face)).map(row => ({ row, weights: barycentric(point, row) })).find(value => value.weights);
}
function witness(id, phase, triangle, point, weights) {
  return { id, phase, elementIndex: triangle.sourceFace.elementIndex, faceIndex: triangle.sourceFace.faceIndex, facade: triangle.sourceFace.facade,
    positionsM: triangle.positionsM, normals: triangle.normals, metreUvs: triangle.metreUvs, atlasUvs: triangle.atlasUvs,
    tile: triangle.tile, barycentric: weights, buildingPoint: point, interpolatedAtlasUv: interpolated(triangle.atlasUvs, weights) };
}
function cameraFor(state) {
  const camera = new PerspectiveCamera(); camera.projectionMatrix.fromArray(state.projectionMatrix);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); camera.matrixWorld.fromArray(state.matrixWorld);
  camera.matrixWorldInverse.fromArray(state.matrixWorldInverse); camera.position.setFromMatrixPosition(camera.matrixWorld); camera.matrixAutoUpdate = false;
  return camera;
}
function geometryCopy(geometry) {
  return Object.fromEntries([...Object.entries(geometry.attributes), ["index", geometry.index]].filter(([, attribute]) => attribute).map(([name, attribute]) => {
    assert(!attribute.isInterleavedBufferAttribute, "The accepted fixture has ordinary typed attributes.");
    return [name, { itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, array: copyArray(attribute.array) }];
  }));
}
function surfaceMetrics(rows) {
  // "Selected" in this DTO means the selected mesh, including its protected faces.
  const selected = rows, areas = new Map(), vertices = [], perFace = new Map();
  let selectedSurfaceAreaM2 = 0, minimumWindingNormalDot = 1, zeroAreaTriangleCount = 0;
  for (const row of selected) {
    const [a, b, c] = row.positionsM.map(point => new Vector3().fromArray(point));
    const cross = b.clone().sub(a).cross(c.clone().sub(a)), area = cross.length() / 2;
    if (area === 0) { zeroAreaTriangleCount += 1; continue; }
    const normal = row.normals[0], dot = cross.clone().normalize().dot(new Vector3().fromArray(normal));
    assert(dot > 0.99999, "Selected submitted triangle winding is not outward.");
    minimumWindingNormalDot = Math.min(minimumWindingNormalDot, dot); selectedSurfaceAreaM2 += area; vertices.push(...row.positionsM);
    const key = normal.map(value => Math.abs(value) < 1e-12 ? 0 : value).join(","); areas.set(key, (areas.get(key) ?? 0) + area);
    const owner = pairKey(row.sourceFace); perFace.set(owner, (perFace.get(owner) ?? 0) + area);
  }
  for (const face of new Map(selected.map(row => [pairKey(row.sourceFace), row.sourceFace])).values()) {
    const [a, b, c, d] = face.buildingPositions.map(point => new Vector3().fromArray(point));
    const expected = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2 + c.clone().sub(a).cross(d.clone().sub(a)).length() / 2;
    assert(Math.abs(perFace.get(pairKey(face)) - expected) <= Math.max(0.0002, expected * 0.00002), "Submitted selected triangles do not cover their actual source quad area.");
  }
  return { selectedSurfaceAreaM2, selectedBounds: bounds(vertices),
    normalAreaDistribution: [...areas].sort(([a], [b]) => a.localeCompare(b)).map(([normal, areaM2]) => ({ normal: normal.split(",").map(Number), areaM2 })), minimumWindingNormalDot,
    zeroAreaTriangleCount, nonzeroTriangleCount: rows.length - zeroAreaTriangleCount };
}

/** Early SSR seam: verify real controller buffers/ownership without rendering or PNGs. */
export function verifySubmittedWallPhaseGeometry({ fixture, snapshot, ownership, baseline, createWallAtlasGeometry, same }) {
  const original = fixture.buildingRuntime.renderables.find(object => object.name === "mesh.wall-panels"), decoded = decodeSubmittedWall(snapshot, original.material);
  try {
    const faces = verifySourceFaces(snapshot, fixture, ownership, same), owners = reconstructSubmittedOwners({ fixture, snapshot, faces, baseline, createWallAtlasGeometry, decoded });
    const rows = triangleData(decoded, snapshot, snapshot.condition, owners), metrics = surfaceMetrics(rows);
    assert.equal(owners.length, snapshot.cost.renderedTriangleCount);
    return { selectedGeometryHash: snapshot.selectedGeometryHash, sourceGeometryHash: snapshot.sourceGeometryHash, originalIrHash: snapshot.originalIrHash, ...metrics };
  } finally { decoded.dispose(); }
}
function rgba(image, x, y) { return Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)); }
function pngFile(outputDirectory, file) {
  assert.equal(path.basename(file), file); const absolute = path.resolve(outputDirectory, file), relative = path.relative(outputDirectory, absolute);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); return absolute;
}

/** Caller-owned fixture, raw captures and material buffers remain read-only. */
export async function buildWallPhaseAttribution({ fixture, ownership, captures, outputDirectory, baseline, materialBaseline, decodeScreenshotPng, createWallAtlasGeometry, same }) {
  assert.equal(captures.length, 18);
  const originalWall = fixture.buildingRuntime.renderables.find(object => object.name === "mesh.wall-panels");
  assert(originalWall?.isMesh && !originalWall.isInstancedMesh);
  const localCapture = captures.find(row => row.condition === "production"), sharedCapture = captures.find(row => row.condition === "shared-base-color-only");
  assert(localCapture && sharedCapture);
  const localSnapshot = localCapture.transport, sharedSnapshot = sharedCapture.transport, decoded = {};
  try {
    for (const [phase, snapshot] of [["local", localSnapshot], ["shared", sharedSnapshot]]) decoded[phase] = decodeSubmittedWall(snapshot, originalWall.material);
    const faces = verifySourceFaces(localSnapshot, fixture, ownership, same);
    same(localSnapshot.sourceFaces, sharedSnapshot.sourceFaces);
    const originalIrHash = fingerprintOriginalIr(fixture); assert.equal(localSnapshot.originalIrHash, originalIrHash);
    const source = fixture.ir.meshBatches.find(batch => batch.batchId === "mesh.wall-panels");
    const sourceGeometryHash = fingerprint({ batchId: source.batchId, positions: copyArray(source.positions), normals: copyArray(source.normals), uvs: copyArray(source.uvs), indices: copyArray(source.indices) });
    assert.equal(localSnapshot.sourceGeometryHash, sourceGeometryHash);
    const protectedUvs = faces.filter(face => !face.selected).map(({ elementIndex, faceIndex, sourceVertexIndices }) => {
      const values = new Float32Array(sourceVertexIndices.flatMap(index => Array.from(source.uvs.subarray(index * 2, index * 2 + 2))));
      return { elementIndex, faceIndex, sourceVertexIndices, original: copyArray(values), shared: copyArray(values) };
    });
    const protectedUvHash = fingerprint(protectedUvs); assert.equal(localSnapshot.protectedUvHash, protectedUvHash);
    const runtime = fixture.buildingRuntime;
    same(runtime.root.matrixWorld.toArray(), localSnapshot.phaseModel.rootMatrixWorld);
    same(originalWall.matrixWorld.toArray(), localSnapshot.phaseModel.objectMatrixWorld);
    const protectedGeometry = runtime.renderables.filter(object => object !== originalWall).map(object => ({ batchId: object.name, geometry: geometryCopy(object.geometry),
      matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(), instanceMatrix: object.isInstancedMesh ? copyArray(object.instanceMatrix.array) : null }));
    const transformState = { root: runtime.root.matrix.toArray(), rootWorld: runtime.root.matrixWorld.toArray(),
      stages: runtime.stageGroups.map(({ stage, group }) => ({ stage, matrix: group.matrix.toArray(), matrixWorld: group.matrixWorld.toArray() })),
      selectedMatrix: originalWall.matrix.toArray(), selectedWorld: originalWall.matrixWorld.toArray() };
    assert.equal(localSnapshot.protectedGeometryHash, fingerprint({ protectedGeometry, transformState }));
    const originalInstances = fixture.ir.instanceBatches.map(batch => ({ batchId: batch.batchId, count: batch.count, transforms: copyArray(batch.transforms) }));
    assert.equal(localSnapshot.instanceTransformsHash, fingerprint({ source: originalInstances, submitted: protectedGeometry.filter(row => row.instanceMatrix)
      .map(({ batchId, instanceMatrix, matrix, matrixWorld }) => ({ batchId, instanceMatrix, matrix, matrixWorld })) }));
    const triangles = Object.fromEntries([["local", localSnapshot], ["shared", sharedSnapshot]].map(([phase, snapshot]) => {
      const owners = reconstructSubmittedOwners({ fixture, snapshot, faces, baseline, createWallAtlasGeometry, decoded: decoded[phase] });
      return [phase, triangleData(decoded[phase], snapshot, phase, owners)];
    }));
    const metrics = { local: surfaceMetrics(triangles.local), shared: surfaceMetrics(triangles.shared) };
    // Caps/reveals must submit the same actual triangles and UV bits in both states.
    const protectedTriangles = rows => rows.filter(row => !row.sourceFace.selected).map(row => fingerprint({ owner: pairKey(row.sourceFace),
      positions: row.indices.map(index => copyArray(decoded[rows === triangles.local ? "local" : "shared"].geometry.attributes.position.array.subarray(index * 3, index * 3 + 3))),
      normals: row.indices.map(index => copyArray(decoded[rows === triangles.local ? "local" : "shared"].geometry.attributes.normal.array.subarray(index * 3, index * 3 + 3))),
      uvs: row.indices.map(index => copyArray(decoded[rows === triangles.local ? "local" : "shared"].geometry.attributes.uv.array.subarray(index * 2, index * 2 + 2))) })).sort();
    same(protectedTriangles(triangles.local), protectedTriangles(triangles.shared), "Submitted protected cap/interior triangles changed.");
    const states = new Map(), triangleWitnesses = [], continuityPairs = [], wrapWitnesses = [], pixelProfiles = [], pixelMappings = [], historicalBoundarySelections = [], historicalRayLimitations = [];
    for (const capture of captures) {
      const snapshot = capture.transport, phase = snapshot.condition;
      same(snapshot.phaseModel, localSnapshot.phaseModel); same(snapshot.sourceFaces, localSnapshot.sourceFaces);
      for (const key of ["sourceGeometryHash", "originalIrHash", "protectedGeometryHash", "instanceTransformsHash", "protectedUvHash"]) assert.equal(snapshot[key], localSnapshot[key], key + " changed.");
      const firstSnapshot = phase === "local" ? localSnapshot : sharedSnapshot;
      for (const name of ["position", "normal", "uv", "index"]) assert.equal(snapshot.submittedGeometry.rawAttributeBytes[name], firstSnapshot.submittedGeometry.rawAttributeBytes[name], "Actual phase buffers changed across submitted captures.");
      for (const key of ["selectedSurfaceAreaM2", "minimumWindingNormalDot"]) assert(Math.abs(snapshot.cost[key] - metrics[phase][key]) < 1e-6, "Actual indexed surface metric changed: " + key);
      assert(close(snapshot.cost.selectedBounds.min, metrics[phase].selectedBounds.min)); assert(close(snapshot.cost.selectedBounds.max, metrics[phase].selectedBounds.max));
      assert.equal(snapshot.cost.normalAreaDistribution.length, metrics[phase].normalAreaDistribution.length);
      for (const row of metrics[phase].normalAreaDistribution) {
        const measured = snapshot.cost.normalAreaDistribution.find(value => close(value.normal, row.normal, 1e-6));
        assert(measured && Math.abs(measured.areaM2 - row.areaM2) < 1e-6);
      }
      const state = { phase, geometryHash: capture.wallState.geometryHash, selectedGeometryHash: snapshot.selectedGeometryHash, originalIrHash: snapshot.originalIrHash,
        protectedGeometryHash: snapshot.protectedGeometryHash, instanceTransformsHash: snapshot.instanceTransformsHash, protectedUvHash: snapshot.protectedUvHash,
        selectedVertexCount: snapshot.submittedGeometry.attributeMetadata.position.count,
        selectedIndexCount: snapshot.submittedGeometry.attributeMetadata.index?.count ?? snapshot.submittedGeometry.attributeMetadata.position.count,
        selectedTriangleCount: snapshot.cost.renderedTriangleCount, totalRenderedTriangles: snapshot.cost.activeSceneTriangleCount,
        selectedSurfaceAreaM2: snapshot.cost.selectedSurfaceAreaM2, selectedBounds: snapshot.cost.selectedBounds,
        normalAreaDistribution: snapshot.cost.normalAreaDistribution, minimumWindingNormalDot: snapshot.cost.minimumWindingNormalDot };
      if (states.has(phase)) same(states.get(phase), state, "Submitted phase geometry changed across captures."); else states.set(phase, state);
      capture.phaseState = { ...state, allocationLedger: snapshot.allocationLedger };
    }
    const add = (id, phase, found, point) => {
      assert(found && found.row.sourceFace.selected, "Witness must hit an actual selected owned exterior triangle.");
      const result = witness(id, phase, found.row, point, found.weights); triangleWitnesses.push(result); return result;
    };
    const selected = faces.filter(face => face.selected), model = localSnapshot.phaseModel;
    const pointFrom = (facade, u, v) => [facade === "rear" ? model.bounds.min[0] + u : facade === "front" ? model.bounds.max[0] - u : facade === "left" ? model.bounds.min[0] : model.bounds.max[0],
      model.groundYM + v, facade === "rear" ? model.bounds.max[2] : facade === "front" ? model.bounds.min[2] : facade === "left" ? model.bounds.min[2] + u : model.bounds.max[2] - u];
    const phaseBounds = face => bounds(face.buildingPositions.map(point => [...sharedMetres(point, face.facade, model), 0]));
    for (const facade of ["rear", "right"]) {
      const choices = selected.filter(face => face.facade === facade); let pair;
      for (let i = 0; i < choices.length && !pair; i += 1) for (let j = i + 1; j < choices.length && !pair; j += 1) {
        const first = choices[i], second = choices[j], a = phaseBounds(first), b = phaseBounds(second);
        const lower = [0, 1].map(axis => Math.max(a.min[axis], b.min[axis])), upper = [0, 1].map(axis => Math.min(a.max[axis], b.max[axis]));
        if (upper.some((value, axis) => value < lower[axis] - 1e-6) || upper.every((value, axis) => value - lower[axis] < 1e-4) || !upper.some((value, axis) => Math.abs(value - lower[axis]) < 2e-5)) continue;
        const point = pointFrom(facade, (lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2), firstHit = triangleAt(triangles.shared, first, point), secondHit = triangleAt(triangles.shared, second, point);
        if (firstHit && secondHit) pair = { first, second, point, firstHit, secondHit };
      }
      assert(pair, "No actual distinct coplanar source-piece continuity pair on " + facade);
      const id = "continuity-" + facade;
      add(id + "-first", "shared", pair.firstHit, pair.point); add(id + "-second", "shared", pair.secondHit, pair.point);
      const side = (face, suffix) => ({ elementIndex: face.elementIndex, faceIndex: face.faceIndex, localMetreUv: sourceMetres(pair.point, face), sharedMetreUv: sharedMetres(pair.point, facade, model), sharedTriangleWitnessId: id + suffix });
      continuityPairs.push({ id, facade, buildingPoint: pair.point, first: side(pair.first, "-first"), second: side(pair.second, "-second") });
    }
    for (const axis of [0, 1]) {
      let pair;
      for (const first of selected) {
        if (pair) break;
        const b = phaseBounds(first), u = (b.min[0] + b.max[0]) / 2, v = (b.min[1] + b.max[1]) / 2;
        const start = [u, v], end = [...start]; end[axis] += 0.96;
        const p = pointFrom(first.facade, ...start), q = pointFrom(first.facade, ...end);
        const second = selected.find(face => face.facade === first.facade && insideFace(q, face, 1e-6));
        if (!second) continue;
        const firstHit = triangleAt(triangles.shared, first, p), secondHit = triangleAt(triangles.shared, second, q);
        if (firstHit && secondHit) pair = { p, q, firstHit, secondHit };
      }
      assert(pair, "An actual submitted periodic wrap is required on axis " + axis);
      const id = "wrap-" + axis; add(id + "-first", "shared", pair.firstHit, pair.p); add(id + "-second", "shared", pair.secondHit, pair.q);
      wrapWitnesses.push({ id, firstTriangleWitnessId: id + "-first", secondTriangleWitnessId: id + "-second", periodOffset: axis ? [0, 1] : [1, 0] });
    }
    const images = new Map();
    for (const capture of captures) {
      const bytes = await readFile(pngFile(outputDirectory, capture.screenshot.file)); assert.equal(hash(bytes), capture.screenshot.sha256);
      const image = decodeScreenshotPng(bytes); image.data ??= image.rgba;
      assert.equal(image.width, capture.screenshot.widthPx); assert.equal(image.height, capture.screenshot.heightPx); assert.equal(image.data.length, image.width * image.height * 4);
      images.set(capture, image);
      const y = 590; assert(y < image.height);
      pixelProfiles.push({ requestedBackend: capture.requestedBackend, viewName: capture.viewName, lightingName: capture.lightingName, condition: capture.condition,
        screenshot: { file: capture.screenshot.file, sha256: capture.screenshot.sha256 }, axis: "x", fixedPx: y, firstPx: 0,
        rgba: Array.from(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4)) });
    }
    const texture = originalWall.material.map; assert(texture?.isTexture && texture.image?.data);
    const transform = { matrix: texture.matrix.toArray(), flipY: texture.flipY, wrapS: texture.wrapS, wrapT: texture.wrapT };
    const primary = baseline.materialAnchors.atlasManifest.slots.find(slot => slot.id === "wall.primary").rectPx;
    const raycaster = new Raycaster();
    const hitAt = (capture, phase, pixel) => {
      const image = images.get(capture), camera = cameraFor(capture.snapshot.camera);
      raycaster.setFromCamera(new Vector2((pixel[0] + 0.5) / image.width * 2 - 1, 1 - (pixel[1] + 0.5) / image.height * 2), camera);
      const objects = fixture.buildingRuntime.renderables.map(object => object === originalWall ? decoded[phase].mesh : object);
      const hits = raycaster.intersectObjects(objects, false), hit = hits[0]; if (!hit || hit.object !== decoded[phase].mesh) return null;
      const row = triangles[phase][hit.faceIndex]; assert(row);
      const point = hit.point.clone().applyMatrix4(new Matrix4().fromArray(model.rootMatrixWorld).invert()).toArray(), weights = barycentric(point, row); assert(weights);
      const nearest = hits.filter(value => value.distance <= hit.distance + 0.00001);
      const owners = nearest.map(value => {
        if (value.object !== decoded[phase].mesh) return { batchId: value.object.name, instanceId: value.instanceId ?? null, faceIndex: value.faceIndex };
        const face = triangles[phase][value.faceIndex].sourceFace;
        return { batchId: "mesh.wall-panels", elementIndex: face.elementIndex, faceIndex: face.faceIndex, ownedFacade: face.ownedFacade, selected: face.selected };
      });
      const tiedOwners = [...new Map(owners.map(owner => [JSON.stringify(owner), owner])).values()];
      const firstUv = interpolated(row.atlasUvs, weights);
      const chartAmbiguous = nearest.some(value => {
        if (value.object !== decoded[phase].mesh) return true;
        const candidate = triangles[phase][value.faceIndex], candidatePoint = value.point.clone().applyMatrix4(new Matrix4().fromArray(model.rootMatrixWorld).invert()).toArray();
        const candidateWeights = barycentric(candidatePoint, candidate);
        return !candidateWeights || !close(interpolated(candidate.atlasUvs, candidateWeights), firstUv, 1e-6);
      });
      return { row, point, weights, tiedOwners, ambiguous: tiedOwners.length > 1, chartAmbiguous };
    };
    const mapped = found => {
      const uv = new Vector2().fromArray(interpolated(found.row.atlasUvs, found.weights)); texture.transformUv(uv);
      const atlasPixel = [Math.min(texture.image.width - 1, Math.floor(uv.x * texture.image.width)), Math.min(texture.image.height - 1, Math.floor(uv.y * texture.image.height))];
      if (atlasPixel[0] < primary.x || atlasPixel[0] >= primary.x + primary.width || atlasPixel[1] < primary.y || atlasPixel[1] >= primary.y + primary.height) return null;
      return { transformedAtlasUv: uv.toArray(), textureTransform: transform, atlasPixel, roiPixel: [atlasPixel[0] - primary.x, atlasPixel[1] - primary.y], baseColorRgba: rgba(texture.image, ...atlasPixel) };
    };
    for (const viewName of ["rear", "right"]) {
      const forCondition = condition => captures.find(row => row.requestedBackend === "webgpu" && row.viewName === viewName && row.condition === condition);
      const local = forCondition("local-base-color-only"), shared = forCondition("shared-base-color-only"), flatLocal = forCondition("local-flat-no-shadow"), flatShared = forCondition("shared-flat-no-shadow");
      const xs = viewName === "rear" ? [697, 698] : [742, 743];
      const sides = xs.map(x => {
        const pixel = [x, 590], hit = hitAt(local, "local", pixel); assert(hit, "Historical wall seam pixel must hit the actual submitted wall.");
        const face = hit.row.sourceFace;
        historicalRayLimitations.push(`Historical ${viewName} pixel [${pixel}] nearest-ray source owners within 0.00001m: ${JSON.stringify(hit.tiedOwners)}; differing chart UV tie=${hit.chartAmbiguous}. First-ray fields are ray evidence, not proof of the GPU raster winner.`);
        return { pixel, elementIndex: face.elementIndex, faceIndex: face.faceIndex, ownedFacade: face.ownedFacade, selected: face.selected, buildingPoint: hit.point, buildingNormal: hit.row.normals[0] };
      });
      historicalBoundarySelections.push({ id: "s7-" + viewName, requestedBackend: "webgpu", viewName, lightingName: "ordinary", sides, bothSelected: sides.every(side => side.selected) });
      let mapping;
      for (let x = 1; x < images.get(local).width - 1 && !mapping; x += 1) {
        const pixel = [x, 590], first = hitAt(local, "local", pixel), second = hitAt(shared, "shared", pixel);
        if (first?.ambiguous || second?.ambiguous || first?.chartAmbiguous || second?.chartAmbiguous) continue;
        if (!first?.row.sourceFace.selected || !second?.row.sourceFace.selected || pairKey(first.row.sourceFace) !== pairKey(second.row.sourceFace) || !close(first.point, second.point)) continue;
        const a = mapped(first), b = mapped(second); if (!a || !b || close(a.baseColorRgba.slice(0, 3), b.baseColorRgba.slice(0, 3), 0)) continue;
        const presentedA = rgba(images.get(local), ...pixel), presentedB = rgba(images.get(shared), ...pixel);
        if (close(presentedA.slice(0, 3), presentedB.slice(0, 3), 0)) continue;
        const id = "pixel-" + viewName; add(id + "-local", "local", first, first.point); add(id + "-shared", "shared", second, second.point);
        mapping = { requestedBackend: "webgpu", viewName, lightingName: "ordinary", pixel,
          local: { triangleWitnessId: id + "-local", ...a, presentedRgba: presentedA }, shared: { triangleWitnessId: id + "-shared", ...b, presentedRgba: presentedB },
          flatNoShadow: { localRgba: rgba(images.get(flatLocal), ...pixel), sharedRgba: rgba(images.get(flatShared), ...pixel) } };
      }
      assert(mapping, "No actual direct-ROI base-color pixel discriminator for GPU " + viewName); pixelMappings.push(mapping);
    }
    assert.equal(materialBaseline.immutable.geometryHash, localCapture.wallState.geometryHash);
    return { schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-phase-attribution", baselinePacketId: baseline.packetId,
      sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash, originalGeometryHash: localCapture.wallState.geometryHash,
      sourceGeometryHash, originalIrHash, protectedGeometryHash: localSnapshot.protectedGeometryHash, instanceTransformsHash: localSnapshot.instanceTransformsHash, protectedUvHash,
      phaseModel: model, target: { batchId: "mesh.wall-panels", objectKind: "Mesh", instanceCount: 0, sourcePrimitiveCount: 265, sourceVertexCount: 6360, sourceTriangleCount: 3180 },
      sourceFaces: localSnapshot.sourceFaces, geometryStates: [...states.values()], triangleWitnesses, continuityPairs, wrapWitnesses, pixelProfiles, pixelMappings, historicalBoundarySelections,
      captureCosts: captures.map(row => ({ caseKey: [row.requestedBackend, row.viewName, row.lightingName, row.condition].join("/"), allocationLedger: row.transport.allocationLedger })),
      limitations: ["Diagnostic shared phase only; no production material/IR/compiler adoption or visual acceptance is implied.",
        ...historicalRayLimitations,
        `Actual submitted Float32 wall mesh triangle counts retain all indices: local ${metrics.local.zeroAreaTriangleCount} zero-area/${metrics.local.nonzeroTriangleCount} nonzero; shared ${metrics.shared.zeroAreaTriangleCount} zero-area/${metrics.shared.nonzeroTriangleCount} nonzero. Area and winding metrics exclude only zero-area triples; all witness triangles are nondegenerate.`,
        "Ray attribution uses actual submitted triangle bytes and the frozen camera. Direct packed-ROI texels are nearest integer source evidence, not a complete filtered shader evaluation.",
        "Counterfactual geometry and unique backing-buffer ledgers are measured browser states; JavaScript/report transport and GPU allocations are outside that byte ledger.",
        "Canonical facade U/V are nonnegative. Negative wrap behavior is covered by pure synthetic regression rather than fabricated canonical witnesses."] };
  } finally { decoded.local?.dispose(); decoded.shared?.dispose(); }
}
