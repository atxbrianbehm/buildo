import {
  boundsFromBox,
  buildBoxPrimitive,
  emptyBounds,
  expandBounds,
  type Bounds3,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";
import type { ProfileDefinition, ProfilePoint2 } from "./profileLibrary";

export type ProfileRunAxis = "x" | "y";

export interface SweepProfileAlongRunInput {
  profile: ProfileDefinition;
  /** World-space center of the run's bounding box. */
  center: Vec3;
  /** Length of the extrusion along the run axis (meters). */
  runLengthM: number;
  /** Which axis the profile is extruded along. */
  runAxis: ProfileRunAxis;
  /**
   * For runAxis "x": profile u maps to world Y, d to world Z (front facade).
   * For runAxis "y": profile u maps to half-width X (mirrored), d to world Z.
   */
  facadeSign?: 1 | -1;
}

function closeProfileAgainstWall(points: ProfilePoint2[]): ProfilePoint2[] {
  if (points.length === 0) {
    return [];
  }
  const first = points[0];
  const last = points[points.length - 1];
  return [{ u: first.u, d: 0 }, ...points, { u: last.u, d: 0 }];
}

function pushVertex(
  positions: number[],
  normals: number[],
  uvs: number[],
  point: Vec3,
  normal: Vec3,
  uv: [number, number]
): void {
  positions.push(point[0], point[1], point[2]);
  normals.push(normal[0], normal[1], normal[2]);
  uvs.push(uv[0], uv[1]);
}

function pushQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3
): void {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ad: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const nx = ab[1] * ad[2] - ab[2] * ad[1];
  const ny = ab[2] * ad[0] - ab[0] * ad[2];
  const nz = ab[0] * ad[1] - ab[1] * ad[0];
  const len = Math.hypot(nx, ny, nz) || 1;
  const normal: Vec3 = [nx / len, ny / len, nz / len];
  const base = positions.length / 3;
  pushVertex(positions, normals, uvs, a, normal, [0, 0]);
  pushVertex(positions, normals, uvs, b, normal, [1, 0]);
  pushVertex(positions, normals, uvs, c, normal, [1, 1]);
  pushVertex(positions, normals, uvs, d, normal, [0, 1]);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function boundsFromPositions(positions: number[]): Bounds3 {
  let bounds = emptyBounds();
  for (let index = 0; index < positions.length; index += 3) {
    bounds = expandBounds(bounds, {
      min: [positions[index], positions[index + 1], positions[index + 2]],
      max: [positions[index], positions[index + 1], positions[index + 2]]
    });
  }
  if (!Number.isFinite(bounds.min[0])) {
    return boundsFromBox([0, 0, 0], [0.01, 0.01, 0.01]);
  }
  return bounds;
}

/**
 * True extruded solid from a closed profile polyline along X (horizontal molding).
 * Profile (u,d) → (Y, Z); run along X. This is the Geometry-Nodes-like solid path.
 */
export function extrudeProfileSolidAlongX(input: {
  profile: ProfileDefinition;
  center: Vec3;
  runLengthM: number;
  facadeSign?: 1 | -1;
}): PrimitiveGeometry {
  const facadeSign = input.facadeSign ?? 1;
  const closed = closeProfileAgainstWall(input.profile.points);
  if (closed.length < 3) {
    return buildBoxPrimitive({ center: input.center, size: [input.runLengthM, 0.1, 0.1] });
  }

  const uMin = Math.min(...closed.map((point) => point.u));
  const uMax = Math.max(...closed.map((point) => point.u));
  const uMid = (uMin + uMax) / 2;
  const halfRun = input.runLengthM / 2;
  const x0 = input.center[0] - halfRun;
  const x1 = input.center[0] + halfRun;

  const ring = closed.map((point) => {
    const y = input.center[1] + (point.u - uMid);
    const z = input.center[2] + facadeSign * point.d;
    return { y, z };
  });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Side strip quads between consecutive profile edges, extruded along X.
  for (let index = 0; index < ring.length - 1; index += 1) {
    const p0 = ring[index];
    const p1 = ring[index + 1];
    const a: Vec3 = [x0, p0.y, p0.z];
    const b: Vec3 = [x1, p0.y, p0.z];
    const c: Vec3 = [x1, p1.y, p1.z];
    const d: Vec3 = [x0, p1.y, p1.z];
    pushQuad(positions, normals, uvs, indices, a, b, c, d);
  }

  // End caps (fan from centroid of ring at each end).
  const cy = ring.reduce((sum, point) => sum + point.y, 0) / ring.length;
  const cz = ring.reduce((sum, point) => sum + point.z, 0) / ring.length;
  for (const x of [x0, x1]) {
    const outward: Vec3 = x === x0 ? [-1, 0, 0] : [1, 0, 0];
    for (let index = 0; index < ring.length - 1; index += 1) {
      const p0 = ring[index];
      const p1 = ring[index + 1];
      const base = positions.length / 3;
      const center: Vec3 = [x, cy, cz];
      const a: Vec3 = [x, p0.y, p0.z];
      const b: Vec3 = [x, p1.y, p1.z];
      // Winding: outward normal for each end.
      if (x === x1) {
        pushVertex(positions, normals, uvs, center, outward, [0.5, 0.5]);
        pushVertex(positions, normals, uvs, a, outward, [0, 0]);
        pushVertex(positions, normals, uvs, b, outward, [1, 0]);
      } else {
        pushVertex(positions, normals, uvs, center, outward, [0.5, 0.5]);
        pushVertex(positions, normals, uvs, b, outward, [1, 0]);
        pushVertex(positions, normals, uvs, a, outward, [0, 0]);
      }
      indices.push(base, base + 1, base + 2);
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: boundsFromPositions(positions)
  };
}

/**
 * Expand an authored 2D profile into solid geometry.
 * Horizontal runs use true extrusion; vertical uses segmented solid approximation.
 */
export function sweepProfileToBoxPrimitives(input: SweepProfileAlongRunInput): PrimitiveGeometry[] {
  const points = input.profile.points;
  if (points.length < 2) {
    return [];
  }
  const facadeSign = input.facadeSign ?? 1;

  if (input.runAxis === "x") {
    return [
      extrudeProfileSolidAlongX({
        profile: input.profile,
        center: input.center,
        runLengthM: input.runLengthM,
        facadeSign
      })
    ];
  }

  // Vertical run: loft half-profile rings along Y (true-ish solid shaft).
  return [extrudeHalfProfileSolidAlongY(input)];
}

function extrudeHalfProfileSolidAlongY(input: SweepProfileAlongRunInput): PrimitiveGeometry {
  const facadeSign = input.facadeSign ?? 1;
  const points = input.profile.points;
  const halfRun = input.runLengthM / 2;
  const y0 = input.center[1] - halfRun;
  const y1 = input.center[1] + halfRun;

  // Closed half-profile: center spine → outer points → back to spine.
  const ring: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  for (const point of points) {
    ring.push({ x: point.u, z: facadeSign * point.d });
  }
  ring.push({ x: 0, z: 0 });
  // Mirror left side
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    ring.push({ x: -point.u, z: facadeSign * point.d });
  }
  ring.push({ x: 0, z: 0 });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < ring.length - 1; index += 1) {
    const p0 = ring[index];
    const p1 = ring[index + 1];
    const a: Vec3 = [input.center[0] + p0.x, y0, input.center[2] + p0.z];
    const b: Vec3 = [input.center[0] + p1.x, y0, input.center[2] + p1.z];
    const c: Vec3 = [input.center[0] + p1.x, y1, input.center[2] + p1.z];
    const d: Vec3 = [input.center[0] + p0.x, y1, input.center[2] + p0.z];
    pushQuad(positions, normals, uvs, indices, a, b, c, d);
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: boundsFromPositions(positions)
  };
}

/** Horizontal molding run on the front facade from an authored profile. */
export function horizontalMoldingFromProfile(input: {
  profile: ProfileDefinition;
  center: Vec3;
  widthM: number;
  facadeSign?: 1 | -1;
}): PrimitiveGeometry[] {
  return sweepProfileToBoxPrimitives({
    profile: input.profile,
    center: input.center,
    runLengthM: input.widthM,
    runAxis: "x",
    facadeSign: input.facadeSign
  });
}

/** Sample denser steps for smoother moldings. */
export function densifyProfile(profile: ProfileDefinition, stepsPerSegment = 2): ProfileDefinition {
  if (stepsPerSegment <= 1) {
    return profile;
  }
  const points: ProfilePoint2[] = [];
  for (let index = 0; index < profile.points.length - 1; index += 1) {
    const a = profile.points[index];
    const b = profile.points[index + 1];
    points.push(a);
    for (let step = 1; step < stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      points.push({
        u: a.u + (b.u - a.u) * t,
        d: a.d + (b.d - a.d) * t
      });
    }
  }
  points.push(profile.points[profile.points.length - 1]);
  return {
    ...profile,
    id: `${profile.id}.dense-${stepsPerSegment}`,
    points
  };
}
