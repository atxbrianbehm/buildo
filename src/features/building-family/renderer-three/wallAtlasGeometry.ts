import { BufferAttribute, BufferGeometry } from "three";
import type { AtlasSlotTextureWindow } from "./buildingAtlasTextureFactory";

type Vec3 = [number, number, number];
type Vertex = { position: Vec3; normal: Vec3; uv: [number, number] };
export interface WallAtlasGeometryOptions {
  uvSpace: "meters" | "normalized";
  scale?: Vec3;
}

const triangleLimit = 100_000;
function failure(message: string): never {
  throw new Error(`Wall atlas geometry: ${message}`);
}
function areaVector(first: Vec3, second: Vec3, third: Vec3): Vec3 {
  const ax = second[0] - first[0], ay = second[1] - first[1], az = second[2] - first[2];
  const bx = third[0] - first[0], by = third[1] - first[1], bz = third[2] - first[2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function unit(normal: Vec3): Vec3 {
  const length = Math.hypot(...normal);
  if (length === 1) return normal;
  return length ? normal.map((value) => value / length) as Vec3 : [0, 0, 0];
}
function interpolate(first: Vertex, second: Vertex, amount: number): Vertex {
  const mix = (a: number, b: number) => a + (b - a) * amount;
  return {
    position: first.position.map((value, axis) => mix(value, second.position[axis])) as Vec3,
    normal: first.normal.map((value, axis) => mix(value, second.normal[axis])) as Vec3,
    uv: [mix(first.uv[0], second.uv[0]), mix(first.uv[1], second.uv[1])]
  };
}
function clip(polygon: Vertex[], axis: 0 | 1, boundary: number, lower: boolean): Vertex[] {
  const result: Vertex[] = [];
  let previous = polygon.at(-1)!;
  let previousInside = lower ? previous.uv[axis] >= boundary : previous.uv[axis] <= boundary;
  for (const current of polygon) {
    const inside = lower ? current.uv[axis] >= boundary : current.uv[axis] <= boundary;
    if (inside !== previousInside) {
      const vertex = interpolate(previous, current, (boundary - previous.uv[axis]) / (current.uv[axis] - previous.uv[axis]));
      vertex.uv[axis] = boundary;
      result.push(vertex);
    }
    if (inside) result.push(current);
    previous = current;
    previousInside = inside;
  }
  return result;
}
function cells(polygon: Vertex[], axis: 0 | 1, repeats: boolean): [number, number] {
  if (!repeats) return [0, 0];
  let minimum = Infinity, maximum = -Infinity;
  for (const vertex of polygon) {
    minimum = Math.min(minimum, vertex.uv[axis]);
    maximum = Math.max(maximum, vertex.uv[axis]);
  }
  const first = Math.floor(minimum);
  const last = Math.max(first, Math.ceil(maximum) - 1);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > triangleLimit) {
    failure("tile span exceeds the safe work limit.");
  }
  return [first, last];
}

function triangleFace(vertices: Vertex[]): Vec3 {
  const direction = vertices.reduce<Vec3>((sum, vertex) => sum.map((value, axis) => value + vertex.normal[axis]) as Vec3, [0, 0, 0]);
  return Math.hypot(...direction) ? direction : areaVector(vertices[0].position, vertices[1].position, vertices[2].position);
}

/** A stretch axis belongs to a connected UV chart, rather than each triangle. */
function connectedChartBounds(count: number, read: (triangle: number) => Vertex[]): number[][] {
  const parents = Array.from({ length: count / 3 }, (_, index) => index);
  const triangles = parents.map((_, index) => read(index * 3));
  const edges = new Map<string, number>();
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  for (const [index, vertices] of triangles.entries()) {
    const face = triangleFace(vertices);
    const dominant = face.reduce((selected, value, axis) => Math.abs(value) > Math.abs(face[selected]) ? axis : selected, 0);
    const orientation = `${dominant}:${Math.sign(face[dominant])}`;
    // Values also connect non-indexed triangles, while UV seams remain separate.
    const keys = vertices.map((vertex) => [...vertex.position, ...vertex.normal, ...vertex.uv].join(","));
    for (let corner = 0; corner < 3; corner += 1) {
      const edge = `${orientation}/${[keys[corner], keys[(corner + 1) % 3]].sort().join("/")}`;
      const neighbour = edges.get(edge);
      if (neighbour !== undefined) parents[root(index)] = root(neighbour);
      else edges.set(edge, index);
    }
  }
  const bounds = new Map<number, number[]>();
  for (const [index, vertices] of triangles.entries()) {
    const chart = root(index);
    const extent = bounds.get(chart) ?? [Infinity, -Infinity, Infinity, -Infinity];
    for (const vertex of vertices) {
      extent[0] = Math.min(extent[0], vertex.uv[0]);
      extent[1] = Math.max(extent[1], vertex.uv[0]);
      extent[2] = Math.min(extent[2], vertex.uv[1]);
      extent[3] = Math.max(extent[3], vertex.uv[1]);
    }
    bounds.set(chart, extent);
  }
  return parents.map((_, index) => bounds.get(root(index))!);
}

/** Split continuous wall UVs at tile edges before atlas interpolation, on either renderer. */
export function createWallAtlasGeometry(
  source: BufferGeometry,
  slot: AtlasSlotTextureWindow,
  options: WallAtlasGeometryOptions
): BufferGeometry {
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  const index = source.getIndex();
  if (options.uvSpace !== "meters" && options.uvSpace !== "normalized") failure("unknown UV coordinate space.");
  if (!position || !uv || position.itemSize !== 3 || uv.itemSize !== 2 || position.count !== uv.count ||
      (normal && (normal.itemSize !== 3 || normal.count !== position.count))) {
    failure("matching position/UV attributes and valid optional normals are required.");
  }
  const scale: Vec3 = [...(options.scale ?? [1, 1, 1])];
  const rect = slot.uvRect;
  if (!scale.every((value) => Number.isFinite(value) && value > 0) ||
      ![slot.physicalSizeM.width, slot.physicalSizeM.height, rect.width, rect.height].every((value) => Number.isFinite(value) && value > 0) ||
      ![rect.x, rect.y].every((value) => Number.isFinite(value) && value >= 0) ||
      rect.x + rect.width > 1 + 1e-12 || rect.y + rect.height > 1 + 1e-12) {
    failure("scale, tile dimensions and atlas rectangle must be finite and valid.");
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const point: Vec3 = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    const values = [...point, uv.getX(vertex), uv.getY(vertex), ...(normal ? [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)] : [])];
    if (!values.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
      failure("source attributes contain unsafe or non-finite coordinates.");
    }
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  const dimensions = max.map((value, axis) => value - min[axis]);
  const count = index?.count ?? position.count;
  if (count % 3 !== 0) failure("source indices must describe complete triangles.");
  if (count / 3 > triangleLimit) failure("source triangle count exceeds the safe work limit.");
  const repeatU = slot.periodicity === "x" || slot.periodicity === "xy" || slot.uvMode === "repeat" || slot.uvMode === "repeat-x";
  const repeatV = slot.periodicity === "xy" || slot.uvMode === "repeat";
  const readVertices = (triangle: number): Vertex[] => [0, 1, 2].map((offset): Vertex => {
    const vertex = index ? index.getX(triangle + offset) : triangle + offset;
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= position.count) failure("source index is out of range.");
    return {
      position: [position.getX(vertex), position.getY(vertex), position.getZ(vertex)],
      normal: normal ? [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)] : [0, 0, 0],
      uv: [uv.getX(vertex), uv.getY(vertex)]
    };
  });
  const charts = options.uvSpace === "meters" && (!repeatU || !repeatV) ? connectedChartBounds(count, readVertices) : undefined;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let work = 0;
  for (let triangle = 0; triangle < count; triangle += 3) {
    const vertices = readVertices(triangle);
    const faceNormal = areaVector(vertices[0].position, vertices[1].position, vertices[2].position);
    if (Math.hypot(...faceNormal) === 0) continue;
    if (!faceNormal.every(Number.isFinite)) failure("triangle coordinates exceed safe numerical range.");
    const face = triangleFace(vertices);
    const dominant = face.reduce((selected, value, axis) => Math.abs(value) > Math.abs(face[selected]) ? axis : selected, 0);
    const axes: [number, number] = dominant === 2 ? [0, 1] : dominant === 0 ? [2, 1] : [0, 2];
    for (const axis of [0, 1] as const) {
      const repeats = axis === 0 ? repeatU : repeatV;
      const values = vertices.map((vertex) => vertex.uv[axis]);
      const low = charts?.[triangle / 3][axis * 2] ?? Math.min(...values);
      const span = (charts?.[triangle / 3][axis * 2 + 1] ?? Math.max(...values)) - low;
      const factor = scale[axes[axis]] * (options.uvSpace === "normalized" ? dimensions[axes[axis]] : 1);
      const tileSize = axis === 0 ? slot.physicalSizeM.width : slot.physicalSizeM.height;
      for (const vertex of vertices) {
        vertex.uv[axis] = repeats ? vertex.uv[axis] * factor / tileSize :
          options.uvSpace === "meters" ? (span ? (vertex.uv[axis] - low) / span : 0) : Math.min(1, Math.max(0, vertex.uv[axis]));
        if (!Number.isFinite(vertex.uv[axis])) failure("tile coordinates exceed safe numerical range.");
      }
    }
    const [firstU, lastU] = cells(vertices, 0, repeatU);
    for (let cellU = firstU; cellU <= lastU; cellU += 1) {
      let strip = repeatU ? clip(vertices, 0, cellU, true) : vertices;
      if (strip.length) strip = repeatU ? clip(strip, 0, cellU + 1, false) : strip;
      if (strip.length < 3) continue;
      const [firstV, lastV] = cells(strip, 1, repeatV);
      for (let cellV = firstV; cellV <= lastV; cellV += 1) {
        if (++work > triangleLimit * 4) failure("tile clipping exceeds the safe work limit.");
        let polygon = repeatV ? clip(strip, 1, cellV, true) : strip;
        if (polygon.length) polygon = repeatV ? clip(polygon, 1, cellV + 1, false) : polygon;
        const base = positions.length / 3;
        let hasSurface = false;
        for (let corner = 1; corner + 1 < polygon.length; corner += 1) {
          if (Math.hypot(...areaVector(polygon[0].position, polygon[corner].position, polygon[corner + 1].position)) === 0) continue;
          if (indices.length / 3 >= triangleLimit) failure(`rendered triangle limit of ${triangleLimit} exceeded.`);
          indices.push(base, base + corner, base + corner + 1);
          hasSurface = true;
        }
        if (!hasSurface) continue;
        // Triangle fans share polygon vertices; neighbouring tiles keep separate UV edges.
        for (const vertex of polygon) {
          positions.push(...vertex.position);
          normals.push(...unit(Math.hypot(...vertex.normal) ? vertex.normal : faceNormal));
          const localU = Math.min(1, Math.max(0, vertex.uv[0] - (repeatU ? cellU : 0)));
          const localV = Math.min(1, Math.max(0, vertex.uv[1] - (repeatV ? cellV : 0)));
          uvs.push(rect.x + localU * rect.width, rect.y + localV * rect.height);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.name = source.name;
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...structuredClone(source.userData),
    atlasSlotUvRect: { ...rect }, physicalTileSizeM: { ...slot.physicalSizeM },
    wallAtlasSampling: {
      schemaVersion: "0.1.0", algorithm: "cpu-tile-clipping-v1", uvSpace: options.uvSpace, scale,
      sourceVertexCount: position.count, sourceTriangleCount: count / 3,
      renderedVertexCount: positions.length / 3, renderedTriangleCount: indices.length / 3, repeatU, repeatV
    }
  };
  return geometry;
}
