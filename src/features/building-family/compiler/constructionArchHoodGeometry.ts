import { readConstructionArchHoodPlan } from "../core/constructionArchHood";
import { emptyBounds, expandBounds, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

/** Closed, separately jointed stone wedges in facade-local metres. */
export function buildConstructionArchHood(input: unknown): PrimitiveGeometry[] {
  const plan = readConstructionArchHoodPlan(input), [cx, cy] = plan.centerM, inner = plan.innerRadiusM;
  const point = (radius: number, angle: number, z: number): Vec3 => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
  return plan.stones.map(stone => {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    function face(vertices: Vec3[]) {
      const [a, b, c] = vertices, u = b.map((v, i) => v - a[i]), v = c.map((q, i) => q - a[i]);
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]], length = Math.hypot(...n);
      if (length < 1e-12) throw new Error("Arch hood contains a degenerate face.");
      const offset = positions.length / 3;
      for (const p of vertices) { positions.push(...p); normals.push(...n.map(value => value / length));
        if (Math.abs(n[2] / length) > 0.9) uvs.push(p[0], p[1]);
        else uvs.push(Math.abs(n[0]) > Math.abs(n[1]) ? p[1] : p[0], p[2]); }
      for (let index = 1; index < vertices.length - 1; index++) indices.push(offset, offset + index, offset + index + 1);
    }
    const back = 0.002, front = plan.source.projectionM + (stone.keystone ? Math.min(plan.source.keystoneRiseM / 2, 0.03) : 0), steps = 4;
    for (let i = 0; i < steps; i++) {
      const a = stone.startRad + (stone.endRad - stone.startRad) * i / steps, b = stone.startRad + (stone.endRad - stone.startRad) * (i + 1) / steps;
      const ia = point(inner, a, front), ib = point(inner, b, front), oa = point(stone.outerRadiusM, a, front), ob = point(stone.outerRadiusM, b, front);
      const iab = point(inner, a, back), ibb = point(inner, b, back), oab = point(stone.outerRadiusM, a, back), obb = point(stone.outerRadiusM, b, back);
      face([ia, oa, ob, ib]); face([ibb, obb, oab, iab]); face([oa, oab, obb, ob]); face([ib, ibb, iab, ia]);
      if (i === 0) face([iab, oab, oa, ia]);
      if (i === steps - 1) face([ib, ob, obb, ibb]);
    }
    let bounds = emptyBounds();
    for (let i = 0; i < positions.length; i += 3) { const p = positions.slice(i, i + 3) as Vec3; bounds = expandBounds(bounds, { min: p, max: p }); }
    return { positions, normals, uvs, indices, bounds };
  });
}
