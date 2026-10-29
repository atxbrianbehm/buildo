import { readConstructionParapetSilhouettePlan } from "../core/constructionParapetSilhouette";
import { buildBoxPrimitive, emptyBounds, expandBounds, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

/** The added solid meets the existing closed parapet at its top; it does not overlap its exterior. */
export function buildRaisedParapetCenter(input: unknown): PrimitiveGeometry {
  const plan = readConstructionParapetSilhouettePlan(input);
  if (plan.source.treatment !== "raised-center") throw new Error("A raised-center plan is required.");
  const { widthM, depthM } = plan.source.building;
  const geometry = buildBoxPrimitive({ center: [0, (plan.lowTopM + plan.highTopM) / 2, -depthM / 2 + 0.11],
    size: [widthM / 2, plan.highTopM - plan.lowTopM, 0.22] });
  for (let i = 0; i < geometry.positions.length / 3; i++) {
    const x = geometry.positions[i * 3], y = geometry.positions[i * 3 + 1], z = geometry.positions[i * 3 + 2];
    const nx = geometry.normals[i * 3], ny = geometry.normals[i * 3 + 1];
    geometry.uvs[i * 2] = Math.abs(nx) > 0.5 ? z : x;
    geometry.uvs[i * 2 + 1] = Math.abs(ny) > 0.5 ? z : y;
  }
  return geometry;
}

/** Sweep the existing coping profile around the roof and through two mitered vertical steps. */
export function buildSteppedParapetCoping(input: unknown): PrimitiveGeometry {
  const plan = readConstructionParapetSilhouettePlan(input);
  if (plan.source.treatment !== "raised-center") throw new Error("A raised-center plan is required.");
  const { widthM: w, depthM: d } = plan.source.building;
  const c = plan.source.parapet.copingProjectionM;
  const profile = [{ u: 0, offset: -0.22 - c }, { u: 0, offset: c - 0.015 },
    { u: 0.025, offset: c }, { u: 0.075, offset: c }, { u: 0.095, offset: c - 0.015 },
    { u: 0.095, offset: -0.22 - c }];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const quad = (vertices: [Vec3, Vec3, Vec3, Vec3], uv: Array<[number, number]>) => {
    const [a, b, , d0] = vertices;
    const ab = b.map((v, i) => v - a[i]), ad = d0.map((v, i) => v - a[i]);
    const n = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
    const length = Math.hypot(...n);
    if (length < 1e-12) throw new Error("Degenerate stepped coping face.");
    const base = positions.length / 3;
    vertices.forEach((v, i) => { positions.push(...v); normals.push(...n.map(x => x / length)); uvs.push(...uv[i]); });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const front = (p: typeof profile[number]): Vec3[] => {
    const { u, offset: o } = p, low = plan.lowTopM + u, high = plan.highTopM + u, z = -d / 2 - o;
    return [[-w / 2 - o, low, z], [-w / 4 - u, low, z], [-w / 4 - u, high, z],
      [w / 4 + u, high, z], [w / 4 + u, low, z], [w / 2 + o, low, z]];
  };
  const corner = (p: typeof profile[number], index: number): Vec3 => {
    const [sx, sz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][index];
    return [sx * (w / 2 + p.offset), plan.lowTopM + p.u, sz * (d / 2 + p.offset)];
  };
  let profileDistance = 0;
  for (let edge = 0; edge < profile.length; edge++) {
    const p = profile[edge], q = profile[(edge + 1) % profile.length];
    const distance = Math.hypot(q.u - p.u, q.offset - p.offset);
    const a = front(p), b = front(q);
    let alongP = 0, alongQ = 0;
    for (let i = 0; i < a.length - 1; i++) {
      const run = Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]);
      const nextRun = Math.hypot(b[i + 1][0] - b[i][0], b[i + 1][1] - b[i][1]);
      quad([a[i], b[i], b[i + 1], a[i + 1]], [[alongP, profileDistance], [alongQ, profileDistance + distance],
        [alongQ + nextRun, profileDistance + distance], [alongP + run, profileDistance]]);
      alongP += run; alongQ += nextRun;
    }
    for (let side = 1; side < 4; side++) {
      const start = [0, w, w + d, 2 * w + d][side], run = side % 2 ? d : w, next = (side + 1) % 4;
      const sp = start + 2 * p.offset * side, sq = start + 2 * q.offset * side;
      quad([corner(p, side), corner(q, side), corner(q, next), corner(p, next)],
        [[sp, profileDistance], [sq, profileDistance + distance], [sq + run + 2 * q.offset, profileDistance + distance], [sp + run + 2 * p.offset, profileDistance]]);
    }
    profileDistance += distance;
  }
  let bounds = emptyBounds();
  for (let i = 0; i < positions.length; i += 3) {
    const v: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    bounds = expandBounds(bounds, { min: v, max: v });
  }
  return { positions, normals, uvs, indices, bounds };
}
