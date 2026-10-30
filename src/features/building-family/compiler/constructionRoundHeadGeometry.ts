import { readConstructionRoundHeadPlan } from "../core/constructionRoundHead";
import { emptyBounds, expandBounds, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

type Point = [number, number];
type Shape = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
const shape = (): Shape => ({ positions: [], normals: [], uvs: [], indices: [] });
function face(out: Shape, vertices: Vec3[]) {
  const [a, b, c] = vertices, ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
  const n = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]], length = Math.hypot(...n);
  if (length < 1e-12) return;
  const offset = out.positions.length / 3;
  for (const p of vertices) {
    out.positions.push(...p); out.normals.push(...n.map(v => v / length));
    if (Math.abs(n[2] / length) > 0.9) out.uvs.push(p[0], p[1]);
    else out.uvs.push(Math.abs(n[0]) > Math.abs(n[1]) ? p[1] : p[0], p[2]);
  }
  for (let i = 1; i < vertices.length - 1; i++) out.indices.push(offset, offset + i, offset + i + 1);
}
function finish(out: Shape): PrimitiveGeometry {
  let bounds = emptyBounds();
  for (let i = 0; i < out.positions.length; i += 3) {
    const p = out.positions.slice(i, i + 3) as Vec3; bounds = expandBounds(bounds, { min: p, max: p });
  }
  return { ...out, bounds };
}
const at = (p: Point, z: number): Vec3 => [p[0], p[1], z];

/** Build the frame ring and solid glazing from the same validated aperture plan. */
export function buildConstructionRoundHeadWindow(input: unknown): { frame: PrimitiveGeometry; glass: PrimitiveGeometry } {
  const plan = readConstructionRoundHeadPlan(input), outer = plan.aperture.pointsM, inner = plan.glazing.pointsM;
  if (plan.revealDepthM + 0.08 > plan.source.scope.sizeM[2]) throw new Error("Round-headed frame depth exceeds its wall.");
  const frame = shape(), glass = shape(), front = -plan.revealDepthM, back = front - 0.08, glassFront = front - 0.035, glassBack = glassFront - 0.006;
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length, a = outer[i], b = outer[j], c = inner[i], d = inner[j];
    face(frame, [at(a, front), at(b, front), at(d, front), at(c, front)]);
    face(frame, [at(c, back), at(d, back), at(b, back), at(a, back)]);
    face(frame, [at(b, front), at(a, front), at(a, back), at(b, back)]);
    face(frame, [at(c, front), at(d, front), at(d, back), at(c, back)]);
    face(glass, [at(d, glassFront), at(c, glassFront), at(c, glassBack), at(d, glassBack)]);
  }
  // The contour is convex; a fan from an interior point fills the pane exactly.
  const center: Point = [(inner[0][0] + inner[1][0]) / 2, (inner[0][1] + plan.glazing.springY) / 2];
  for (let i = 0; i < inner.length; i++) {
    const j = (i + 1) % inner.length;
    face(glass, [at(center, glassFront), at(inner[i], glassFront), at(inner[j], glassFront)]);
    face(glass, [at(center, glassBack), at(inner[j], glassBack), at(inner[i], glassBack)]);
  }
  return { frame: finish(frame), glass: finish(glass) };
}

/** The wall area above an arched aperture cut out from its rectangular bounding box. */
export function buildConstructionRoundHeadSpandrel(input: unknown): PrimitiveGeometry {
  const plan = readConstructionRoundHeadPlan(input), arc = plan.aperture.pointsM.slice(2), top = plan.aperture.springY + plan.aperture.radiusM;
  const out = shape(), depth = plan.source.scope.sizeM[2];
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i], b = arc[i + 1], highA: Point = [a[0], top], highB: Point = [b[0], top];
    // One triangle can collapse at the crown; build the other independently.
    face(out, [at(b, 0), at(a, 0), at(highA, 0)]); face(out, [at(b, 0), at(highA, 0), at(highB, 0)]);
    face(out, [at(highA, -depth), at(a, -depth), at(b, -depth)]); face(out, [at(highB, -depth), at(highA, -depth), at(b, -depth)]);
    face(out, [at(a, 0), at(b, 0), at(b, -depth), at(a, -depth)]);
  }
  return finish(out);
}
