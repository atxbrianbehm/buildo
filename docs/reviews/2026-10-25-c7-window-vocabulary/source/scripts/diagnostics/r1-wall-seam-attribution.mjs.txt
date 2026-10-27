import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { Matrix3, Matrix4, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { z } from "zod";
import { fingerprintBuildingGeometry } from "./r1-building-capture.mjs";

const geometryHash = "4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byteView = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const finite = z.number().finite(), integer = z.number().int().nonnegative();
const sha = z.string().regex(/^[0-9a-f]{64}$/), byte = integer.max(255);
const vec2 = z.tuple([finite, finite]), vec3 = z.tuple([finite, finite, finite]);
const rgba = z.tuple([byte, byte, byte, byte]);
const bounds = z.object({ min: vec3, max: vec3 }).strict();
const conditions = ["production", "normal-off", "base-color-only", "flat", "flat-no-shadow", "restored-production"];
const conditionSchema = z.enum(conditions);
const scans = [
  { id: "rear-lower-vertical", view: "rear", axis: "y", fixed: 600, first: 490, last: 645, rayStep: 1 },
  { id: "rear-lower-horizontal", view: "rear", axis: "x", fixed: 590, first: 250, last: 1030, rayStep: 8 },
  { id: "rear-panel-fine", view: "rear", axis: "x", fixed: 590, first: 685, last: 710, rayStep: 1 },
  { id: "right-lower-vertical", view: "right", axis: "y", fixed: 800, first: 510, last: 695, rayStep: 1 },
  { id: "right-lower-horizontal", view: "right", axis: "x", fixed: 590, first: 380, last: 860, rayStep: 8 },
  { id: "right-panel-fine", view: "right", axis: "x", fixed: 590, first: 730, last: 758, rayStep: 1 }
];
const scanSchema = z.object({ id: z.string(), view: z.enum(["rear", "right"]), axis: z.enum(["x", "y"]),
  fixed: integer, first: integer, last: integer, rayStep: integer.positive() }).strict();
const textureSchema = z.object({ flipY: z.boolean(), minFilter: finite, magFilter: finite,
  wrapS: finite, wrapT: finite, colorSpace: z.string(), generateMipmaps: z.boolean(),
  offset: vec2, repeat: vec2, rotation: finite, center: vec2, matrix: z.array(finite).length(9) }).strict();
const sourceSample = z.object({ sourceId: z.string(), atlasPixel: z.tuple([integer, integer]),
  localPixel: z.tuple([z.number().int(), z.number().int()]), sourcePixel: z.tuple([integer, integer]),
  atlasRgba: rgba, sourceRgba: rgba, packedNormalRgba: rgba, packedHeightRgba: rgba,
  region: z.enum(["roi", "padding-or-other-slot"]), transformedUv: vec2, texture: textureSchema }).strict();
const primitiveSchema = z.object({ elementIndex: integer, semanticPath: z.string(), bounds,
  originalMeterUv: vec2.nullable(), tilePhase: vec2.nullable() }).strict();
const hitSchema = z.object({ batchId: z.string(), instanceId: integer.nullable(), sourceInstanceIndex: integer.nullable(),
  semanticPaths: z.array(z.string()), distance: finite, worldPoint: vec3, worldTriangle: z.array(vec3).length(3),
  worldTriangleBounds: bounds, geometricNormal: vec3, interpolatedNormal: vec3,
  bufferNormals: z.array(vec3).length(3), planeOffset: finite, uv: vec2.nullable(),
  slotId: z.string().nullable(), nearestSample: sourceSample.nullable(), primitiveCandidates: z.array(primitiveSchema) }).strict();
const rowSchema = z.object({ coordinate: integer, sourceCoordinate: integer, meanGreen: finite,
  samplePixel: z.tuple([integer, integer]), baseColorRgba: rgba, heightRgba: rgba }).strict();
const profileSchema = z.object({ scan: scanSchema, condition: conditionSchema,
  screenshot: z.object({ file: z.string(), sha256: sha, widthPx: integer.positive(), heightPx: integer.positive() }).strict(),
  rgba: z.array(byte), meanGreen: finite }).strict().superRefine((value, context) => {
  if (value.rgba.length !== (value.scan.last - value.scan.first + 1) * 4) context.addIssue({ code: "custom", message: "Scanline byte length is inconsistent." });
});
export const R1WallSeamAttributionSchema = z.object({
  schemaVersion: z.literal("0.1.0"), packetKind: z.literal("buildo-r1-wall-seam-attribution"),
  baselinePacketId: z.literal("2026-10-14-r1-s6"), geometryHash: sha, sourceGraphHash: sha, atlasContentHash: sha,
  sourceHashes: z.array(z.object({ sourceId: z.string(), requestHash: sha, contentHash: sha,
    layerHashes: z.record(z.string(), sha) }).strict()), rawAtlasChannelHashes: z.record(z.string(), sha),
  primaryWall: z.object({ sourceId: z.string(), requestHash: sha, contentHash: sha,
    sourceSizePx: z.tuple([integer.positive(), integer.positive()]), physicalSizeM: z.object({ width: finite.positive(), height: finite.positive() }).strict(),
    rectPx: z.object({ x: integer, y: integer, width: integer.positive(), height: integer.positive() }).strict(),
    duplicatedEndpointDifferences: z.object({ baseColorRows: integer, baseColorColumns: integer, heightRows: integer, heightColumns: integer }).strict(),
    sourceRows: z.array(rowSchema), sourceColumns: z.array(rowSchema), packedRows: z.array(rowSchema), packedColumns: z.array(rowSchema) }).strict(),
  wallBuffers: z.object({ batchId: z.literal("mesh.wall-panels"), sourcePrimitiveCount: integer,
    renderedVertexCount: integer, renderedTriangleCount: integer, normalDirections: z.record(z.string(), integer),
    opposingCoincidentSourceFacePairs: integer, coincidentFaceExamples: z.array(z.object({ axis: integer.max(2),
      coordinate: finite, firstElementIndex: integer, secondElementIndex: integer, bounds, renderedTrianglesOnPlane: integer,
      renderedNormalDirections: z.record(z.string(), integer) }).strict()) }).strict(),
  scans: z.array(scanSchema), pixelProfiles: z.array(profileSchema),
  rayProfiles: z.array(z.object({ scanId: z.string(), pixel: z.tuple([integer, integer]),
    closestDistance: finite.nullable(), hits: z.array(hitSchema) }).strict()),
  presentedWallFlags: z.array(z.object({ view: z.enum(["rear", "right"]), condition: conditionSchema,
    renderables: z.array(z.object({ batchId: z.string(), castShadow: z.boolean(), receiveShadow: z.boolean() }).strict()) }).strict()),
  observations: z.array(z.string()), limitations: z.array(z.string())
}).strict();

/** Read-only screenshot decoding; supports the RGB/RGBA8 non-interlaced formats used by Playwright. */
export function decodeScreenshotPng(bytes) {
  const buffer = Buffer.from(bytes);
  assert(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Expected PNG screenshot.");
  let width, height, components, offset = 8, ended = false;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString("ascii", offset + 4, offset + 8);
    assert(offset + length + 12 <= buffer.length, "Truncated PNG chunk.");
    if (type === "IHDR") {
      assert(length === 13 && width === undefined, "Invalid PNG header.");
      width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12);
      const depth = buffer[offset + 16], color = buffer[offset + 17];
      assert(width > 0 && height > 0 && width * height <= 16_777_216 && depth === 8 && (color === 2 || color === 6) &&
        buffer[offset + 18] === 0 && buffer[offset + 19] === 0 && buffer[offset + 20] === 0, "Unsupported screenshot PNG format.");
      components = color === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      assert(width !== undefined, "PNG image data precedes its header.");
      chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
    if (type === "IEND") { assert.equal(length, 0, "Invalid PNG end chunk."); ended = true; break; }
  }
  assert(width && components && chunks.length && ended && offset === buffer.length, "PNG image data is missing or truncated.");
  const stride = width * components, size = (stride + 1) * height;
  const inflated = inflateSync(Buffer.concat(chunks), { maxOutputLength: size });
  assert.equal(inflated.length, size, "PNG row data size is inconsistent.");
  const unpacked = new Uint8Array(stride * height), data = new Uint8Array(width * height * 4);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)]; assert(filter <= 4, "Unsupported PNG row filter.");
    for (let x = 0; x < stride; x += 1) {
      const at = y * stride + x, a = x >= components ? unpacked[at - components] : 0;
      const b = y ? unpacked[at - stride] : 0, c = y && x >= components ? unpacked[at - stride - components] : 0;
      const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0;
      unpacked[at] = (inflated[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = unpacked[i * components]; data[i * 4 + 1] = unpacked[i * components + 1];
    data[i * 4 + 2] = unpacked[i * components + 2]; data[i * 4 + 3] = components === 4 ? unpacked[i * components + 3] : 255;
  }
  return { width, height, data };
}

const pixel = (layer, x, y) => Array.from(layer.data.subarray((y * layer.widthPx + x) * 4, (y * layer.widthPx + x) * 4 + 4));
const sourceCoordinate = (offset, targetSize, sourceSize) => Math.min(sourceSize - 1, Math.floor(Math.max(0, Math.min(targetSize - 1, offset)) / targetSize * sourceSize));
function endpointDifferences(layer, axis) {
  let count = 0;
  const length = axis === "y" ? layer.widthPx : layer.heightPx;
  for (let n = 0; n < length; n += 1) {
    const a = axis === "y" ? pixel(layer, n, 0) : pixel(layer, 0, n);
    const b = axis === "y" ? pixel(layer, n, layer.heightPx - 1) : pixel(layer, layer.widthPx - 1, n);
    if (a.some((value, channel) => value !== b[channel])) count += 1;
  }
  return count;
}
function layerProfiles(baseColor, height, rect, source, axis) {
  const size = axis === "y" ? rect.height : rect.width, otherSize = axis === "y" ? rect.width : rect.height;
  return Array.from({ length: size }, (_, coordinate) => {
    let green = 0;
    for (let n = 0; n < otherSize; n += 1) green += pixel(baseColor, rect.x + (axis === "y" ? n : coordinate), rect.y + (axis === "y" ? coordinate : n))[1];
    const x = rect.x + (axis === "y" ? Math.min(2, otherSize - 1) : coordinate), y = rect.y + (axis === "y" ? coordinate : Math.min(2, otherSize - 1));
    return { coordinate, sourceCoordinate: sourceCoordinate(coordinate, size, axis === "y" ? source.heightPx : source.widthPx),
      meanGreen: green / otherSize, samplePixel: [x, y], baseColorRgba: pixel(baseColor, x, y), heightRgba: pixel(height, x, y) };
  });
}
function originalBoxes(fixture) {
  const batch = fixture.ir.meshBatches.find((row) => row.batchId === "mesh.wall-panels");
  assert(batch?.positions && batch.positions.length % 72 === 0, "Wall source must contain the frozen 24-vertex box primitives.");
  return Array.from({ length: batch.positions.length / 72 }, (_, i) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < 24; vertex += 1) for (let axis = 0; axis < 3; axis += 1) {
      const value = batch.positions[i * 72 + vertex * 3 + axis]; min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    const semanticPath = fixture.ir.semanticIndex.find((entry) => entry.batchId === batch.batchId && entry.elementIndex === i)?.semanticPath;
    assert(semanticPath, "A wall source primitive has no semantic entry.");
    return { elementIndex: i, semanticPath, bounds: { min, max } };
  });
}
function meterUv(point, normal, box) {
  const { min, max } = box;
  if (Math.abs(normal[2]) > 0.99999) return [normal[2] > 0 ? point[0] - min[0] : max[0] - point[0], point[1] - min[1]];
  if (Math.abs(normal[0]) > 0.99999) return [normal[0] > 0 ? max[2] - point[2] : point[2] - min[2], point[1] - min[1]];
  if (Math.abs(normal[1]) > 0.99999) return [point[0] - min[0], normal[1] > 0 ? max[2] - point[2] : point[2] - min[2]];
  return null;
}
function primitiveCandidates(hit, boxes, physical) {
  if (hit.object.name !== "mesh.wall-panels") return [];
  const point = hit.point.toArray(), normal = hit.face.normal.toArray();
  return boxes.filter(({ bounds: b }) => point.every((v, a) => v >= b.min[a] - 2e-5 && v <= b.max[a] + 2e-5) &&
    point.some((v, a) => Math.abs(v - b.min[a]) < 2e-5 || Math.abs(v - b.max[a]) < 2e-5)).map((box) => {
    const originalMeterUv = meterUv(point, normal, box.bounds);
    return { ...box, originalMeterUv, tilePhase: originalMeterUv?.map((v, a) => { const n = v / (a ? physical.height : physical.width); return n - Math.floor(n); }) ?? null };
  });
}
function nearestSample(hit, fixture, sources) {
  const texture = hit.object.material.map, slotId = hit.object.material.userData.atlasSlot?.slotId;
  const slot = fixture.packedAtlas.manifest.slots.find((row) => row.id === slotId), source = sources.get(slot?.materialSourceId);
  if (!hit.uv || !texture?.image?.data || !slot || !source) return null;
  const transformedUv = texture.transformUv(hit.uv.clone()), { width, height } = texture.image;
  const x = Math.max(0, Math.min(width - 1, Math.floor(transformedUv.x * width))), y = Math.max(0, Math.min(height - 1, Math.floor(transformedUv.y * height)));
  const local = [x - slot.rectPx.x, y - slot.rectPx.y];
  const original = [sourceCoordinate(local[0], slot.rectPx.width, source.widthPx), sourceCoordinate(local[1], slot.rectPx.height, source.heightPx)];
  return { sourceId: source.sourceId, atlasPixel: [x, y], localPixel: local, sourcePixel: original,
    atlasRgba: pixel({ data: texture.image.data, widthPx: width }, x, y), sourceRgba: pixel(source.layers.baseColor, ...original),
    packedNormalRgba: pixel(fixture.packedAtlas.channels.normal, x, y), packedHeightRgba: pixel(fixture.packedAtlas.channels.height, x, y),
    region: local[0] >= 0 && local[0] < slot.rectPx.width && local[1] >= 0 && local[1] < slot.rectPx.height ? "roi" : "padding-or-other-slot",
    transformedUv: transformedUv.toArray(), texture: { flipY: texture.flipY, minFilter: texture.minFilter, magFilter: texture.magFilter,
      wrapS: texture.wrapS, wrapT: texture.wrapT, colorSpace: texture.colorSpace, generateMipmaps: texture.generateMipmaps,
      offset: texture.offset.toArray(), repeat: texture.repeat.toArray(), rotation: texture.rotation, center: texture.center.toArray(), matrix: texture.matrix.toArray() } };
}
function renderedHit(hit, fixture, boxes, sources, physical) {
  const object = hit.object, matrix = object.matrixWorld.clone();
  if (hit.instanceId !== undefined) { const instance = new Matrix4(); object.getMatrixAt(hit.instanceId, instance); matrix.multiply(instance); }
  const normalMatrix = new Matrix3().getNormalMatrix(matrix), geometry = object.geometry;
  const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  const vertices = [hit.face.a, hit.face.b, hit.face.c];
  const worldTriangle = vertices.map((index) => new Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix).toArray());
  const bufferNormals = vertices.map((index) => new Vector3().fromBufferAttribute(normals, index).applyNormalMatrix(normalMatrix).toArray());
  const geometricNormal = hit.face.normal.clone().applyNormalMatrix(normalMatrix);
  const interpolatedNormal = (hit.normal?.clone() ?? hit.face.normal.clone()).applyNormalMatrix(normalMatrix);
  const semanticEntries = [...fixture.buildingRuntime.semanticLookup.values()].filter((entry) => entry.object === object &&
    (hit.instanceId === undefined || entry.instanceIndex === hit.instanceId || (entry.instanceIndex === undefined && entry.elementIndex === hit.instanceId)));
  const candidates = primitiveCandidates(hit, boxes, physical);
  return { batchId: object.name, instanceId: hit.instanceId ?? null,
    sourceInstanceIndex: hit.instanceId === undefined ? null : semanticEntries[0]?.elementIndex ?? null,
    semanticPaths: candidates.length ? candidates.map((entry) => entry.semanticPath) : semanticEntries.map((entry) => entry.semanticPath),
    distance: hit.distance, worldPoint: hit.point.toArray(), worldTriangle,
    worldTriangleBounds: { min: [0, 1, 2].map((axis) => Math.min(...worldTriangle.map((p) => p[axis]))), max: [0, 1, 2].map((axis) => Math.max(...worldTriangle.map((p) => p[axis]))) },
    geometricNormal: geometricNormal.toArray(), interpolatedNormal: interpolatedNormal.toArray(), bufferNormals,
    planeOffset: geometricNormal.dot(hit.point), uv: hit.uv?.toArray() ?? null,
    slotId: object.material.userData.atlasSlot?.slotId ?? null, nearestSample: nearestSample(hit, fixture, sources), primitiveCandidates: candidates };
}
function wallBufferSummary(fixture, boxes) {
  const wall = fixture.buildingRuntime.renderables.find((object) => object.name === "mesh.wall-panels"), geometry = wall.geometry;
  const normals = geometry.getAttribute("normal"), positions = geometry.getAttribute("position"), indices = geometry.index;
  const normalDirections = {};
  for (let i = 0; i < normals.count; i += 1) { const key = [normals.getX(i), normals.getY(i), normals.getZ(i)].join(","); normalDirections[key] = (normalDirections[key] ?? 0) + 1; }
  const faces = new Map(), pairs = [];
  for (const box of boxes) for (let axis = 0; axis < 3; axis += 1) for (const side of ["min", "max"]) {
    const coordinate = box.bounds[side][axis], key = [axis, coordinate, ...[0, 1, 2].filter((a) => a !== axis).flatMap((a) => [box.bounds.min[a], box.bounds.max[a]])].map((n) => n.toFixed(5)).join(",");
    const other = faces.get(key);
    if (other && other.side !== side) pairs.push({ axis, coordinate, firstElementIndex: other.box.elementIndex, secondElementIndex: box.elementIndex,
      bounds: { min: box.bounds.min.map((n, a) => a === axis ? coordinate : n), max: box.bounds.max.map((n, a) => a === axis ? coordinate : n) } });
    else faces.set(key, { box, side });
  }
  const selected = pairs.filter((p) => (p.axis === 0 && Math.abs(p.coordinate - 2.0725715) < 0.0001) || (p.axis === 2 && Math.abs(p.coordinate + 3.75) < 0.0001)).slice(0, 6);
  const coincidentFaceExamples = (selected.length ? selected : pairs.slice(0, 6)).map((pair) => {
    let renderedTrianglesOnPlane = 0;
    const renderedNormalDirections = {};
    for (let i = 0; i < indices.count; i += 3) if ([0, 1, 2].every((c) => {
      const vertex = indices.getX(i + c), values = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)];
      return values.every((v, a) => v >= pair.bounds.min[a] - 2e-5 && v <= pair.bounds.max[a] + 2e-5) && Math.abs(values[pair.axis] - pair.coordinate) < 2e-5;
    })) {
      renderedTrianglesOnPlane += 1;
      const vertex = indices.getX(i), key = [normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)].join(",");
      renderedNormalDirections[key] = (renderedNormalDirections[key] ?? 0) + 1;
    }
    return { ...pair, renderedTrianglesOnPlane, renderedNormalDirections };
  });
  return { batchId: "mesh.wall-panels", sourcePrimitiveCount: boxes.length, renderedVertexCount: positions.count,
    renderedTriangleCount: indices.count / 3, normalDirections, opposingCoincidentSourceFacePairs: pairs.length, coincidentFaceExamples };
}

/** Caller owns the frozen fixture and file writes; this helper reads bytes and never changes or disposes it. */
export async function buildWallSeamAttribution({ fixture, baseline, baselineSampling, sources, requests, captures, outputDirectory }) {
  assert.equal(baseline.packetId, "2026-10-14-r1-s6");
  assert.equal(await fingerprintBuildingGeometry(fixture), geometryHash);
  assert.equal(fixture.ir.sourceGraphHash, baseline.identity.sourceGraphHash);
  assert.equal(fixture.packedAtlas.contentHash, baseline.identity.atlasContentHash);
  const procedural = baselineSampling.captures.find((row) => row.requestedBackend === "webgpu" && row.sourceName === "procedural");
  assert(procedural, "Frozen S6 procedural sampling snapshot is required.");
  const currentSources = [...sources.values()].map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  assert.deepEqual(currentSources, procedural.snapshot.sourceHashes, "Actual source identities must match accepted S6.");
  assert.deepEqual(Object.fromEntries(fixture.debugExport.channels.map(({ name, channelHash }) => [name, channelHash])), procedural.snapshot.channelHashes);
  const primary = fixture.packedAtlas.manifest.slots.find((row) => row.id === "wall.primary"), source = sources.get(primary?.materialSourceId);
  assert(source?.layers.height && requests.get(source.sourceId), "Frozen primary source and request must exist.");
  assert.equal(source.widthPx, 32); assert.equal(source.heightPx, 32);
  const sourceRect = { x: 0, y: 0, width: source.widthPx, height: source.heightPx }, boxes = originalBoxes(fixture);
  const pixelProfiles = [], rayProfiles = [], presentedWallFlags = [];
  fixture.buildingRuntime.root.updateWorldMatrix(true, true);
  for (const view of ["rear", "right"]) {
    const rows = captures.filter((row) => row.requestedBackend === "webgpu" && row.viewName === view && row.lightingName === "raking");
    assert.deepEqual(rows.map((row) => row.condition).sort(), [...conditions].sort(), "Each attribution view requires exactly six treatments.");
    const production = rows.find((row) => row.condition === "production"), frozen = baseline.captures.find((row) => row.snapshot.actualBackend === "webgpu" &&
      row.snapshot.canvas.presentationMode === "textured" && row.snapshot.viewName === view && row.snapshot.lightingName === "raking");
    assert(frozen); assert.deepEqual(production.snapshot.camera, frozen.snapshot.camera);
    for (const row of rows) {
      assert.equal(row.wallState.geometryHash, geometryHash); assert.deepEqual(row.snapshot.camera, production.snapshot.camera);
      const file = path.resolve(outputDirectory, row.screenshot.file), relative = path.relative(path.resolve(outputDirectory), file);
      assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Capture PNG must stay inside its output directory.");
      const bytes = await readFile(file); assert.equal(hash(bytes), row.screenshot.sha256);
      const image = decodeScreenshotPng(bytes); assert.equal(image.width, row.screenshot.widthPx); assert.equal(image.height, row.screenshot.heightPx);
      assert.equal(image.width, 1280); assert.equal(image.height, 800);
      for (const scan of scans.filter((entry) => entry.view === view)) {
        const values = [];
        for (let n = scan.first; n <= scan.last; n += 1) values.push(...pixel({ data: image.data, widthPx: image.width }, scan.axis === "x" ? n : scan.fixed, scan.axis === "y" ? n : scan.fixed));
        pixelProfiles.push({ scan, condition: row.condition, screenshot: row.screenshot, rgba: values,
          meanGreen: values.filter((_, i) => i % 4 === 1).reduce((a, b) => a + b, 0) / (values.length / 4) });
      }
      presentedWallFlags.push({ view, condition: row.condition, renderables: row.wallState.wallRenderables });
    }
    const state = production.snapshot.camera, camera = new PerspectiveCamera();
    camera.projectionMatrix.fromArray(state.projectionMatrix); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.matrixWorld.fromArray(state.matrixWorld); camera.matrixWorldInverse.fromArray(state.matrixWorldInverse);
    camera.position.setFromMatrixPosition(camera.matrixWorld); camera.matrixAutoUpdate = false;
    for (const scan of scans.filter((entry) => entry.view === view)) for (let n = scan.first; n <= scan.last; n += scan.rayStep) {
      const x = scan.axis === "x" ? n : scan.fixed, y = scan.axis === "y" ? n : scan.fixed, ray = new Raycaster();
      ray.setFromCamera(new Vector2((x + 0.5) / 1280 * 2 - 1, 1 - (y + 0.5) / 800 * 2), camera);
      const hits = ray.intersectObjects(fixture.buildingRuntime.renderables, false), closestDistance = hits[0]?.distance ?? null;
      rayProfiles.push({ scanId: scan.id, pixel: [x, y], closestDistance,
        hits: hits.filter((hit) => hit.distance <= closestDistance + 1e-5).map((hit) => renderedHit(hit, fixture, boxes, sources, primary.physicalSizeM)) });
    }
  }
  return R1WallSeamAttributionSchema.parse({ schemaVersion: "0.1.0", packetKind: "buildo-r1-wall-seam-attribution",
    baselinePacketId: baseline.packetId, geometryHash, sourceGraphHash: fixture.ir.sourceGraphHash, atlasContentHash: fixture.packedAtlas.contentHash,
    sourceHashes: [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map((row) => ({ sourceId: row.sourceId,
      requestHash: row.requestHash, contentHash: row.contentHash, layerHashes: Object.fromEntries(Object.entries(row.layers).filter(([, layer]) => layer).map(([name, layer]) => [name, hash(byteView(layer.data))])) })),
    rawAtlasChannelHashes: Object.fromEntries(Object.entries(fixture.packedAtlas.channels).map(([name, layer]) => [name, hash(byteView(layer.data))])),
    primaryWall: { sourceId: source.sourceId, requestHash: source.requestHash, contentHash: source.contentHash,
      sourceSizePx: [source.widthPx, source.heightPx], physicalSizeM: primary.physicalSizeM, rectPx: primary.rectPx,
      duplicatedEndpointDifferences: { baseColorRows: endpointDifferences(source.layers.baseColor, "y"), baseColorColumns: endpointDifferences(source.layers.baseColor, "x"),
        heightRows: endpointDifferences(source.layers.height, "y"), heightColumns: endpointDifferences(source.layers.height, "x") },
      sourceRows: layerProfiles(source.layers.baseColor, source.layers.height, sourceRect, source, "y"),
      sourceColumns: layerProfiles(source.layers.baseColor, source.layers.height, sourceRect, source, "x"),
      packedRows: layerProfiles(fixture.packedAtlas.channels.baseColor, fixture.packedAtlas.channels.height, primary.rectPx, source, "y"),
      packedColumns: layerProfiles(fixture.packedAtlas.channels.baseColor, fixture.packedAtlas.channels.height, primary.rectPx, source, "x") },
    wallBuffers: wallBufferSummary(fixture, boxes), scans, pixelProfiles, rayProfiles, presentedWallFlags,
    observations: ["Source and packed profiles are measured RGBA8 bytes, with the actual nearest packing coordinates retained.",
      "Ray samples come from the exact accepted production camera matrices and actual rendered mesh/instance buffers; all hits within 10 micrometres of the nearest distance are retained.",
      "Primitive candidates map actual wall hits to the original 24-vertex IR boxes and their semantic entries; local metre UV and tile phase are reconstructed only for axis-aligned box faces.",
      "Coincident opposing face examples count triangles still present in the actual wall buffers; their contribution to received shadows requires the treatment images."],
    limitations: ["Nearest atlas RGBA is a CPU texel attribution, not a reproduction of lighting, normal-map evaluation, tone mapping, antialiasing or filtered GPU shader output.",
      "Source coordinates describe nearest packing before periodic edge blending and derived normal generation; source and packed RGBA are retained separately.",
      "A single visible ray hit does not exclude hidden internal faces from shadow casting; the live capture flags are reported instead of SSR fixture defaults.",
      "Broad horizontal ray profiles use an eight-pixel stride; vertical and named fine-seam rays and all PNG scanlines retain one-pixel spacing.",
      "The helper does not classify every line as one cause or authorize a product repair; the six actual treatment images require visual review."] });
}
