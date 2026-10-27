import { boundsFromBox, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) => sum + value*b[i], 0);

/** Six inset faces, twelve bevels and eight corner caps, generated from dimensions. */
export function buildConstructionBevelledBox(input: { center: Vec3; size: Vec3; bevelM: number }): PrimitiveGeometry {
  const { center, size, bevelM: bevel } = input;
  if (center.length !== 3 || size.length !== 3 || !center.every(value => Number.isFinite(value) && Math.abs(value) <= 1000) ||
      !Number.isFinite(bevel) || bevel <= 0 || !size.every(value => Number.isFinite(value) && value <= 100 && value > bevel*2)) {
    throw new Error("Bevelled blocks need finite positive dimensions and a bevel smaller than every half-size.");
  }
  const half = size.map(value => value/2), inset = half.map(value => value-bevel);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  function polygon(points: Vec3[], normal: Vec3) {
    const ab = points[1].map((value,i) => value-points[0][i]) as Vec3;
    const ac = points[2].map((value,i) => value-points[0][i]) as Vec3;
    const facing = dot(cross(ab,ac), normal);
    if (!Number.isFinite(facing) || facing === 0) throw new Error("Bevelled block face collapsed.");
    if (facing < 0) points.reverse();
    const reference: Vec3 = Math.abs(normal[1]) > .9 ? [0,0,1] : [0,1,0];
    const rawU = cross(reference,normal), length = Math.hypot(...rawU);
    const u = rawU.map(value => value/length) as Vec3, v = cross(normal,u);
    const projected = points.map(point => [dot(point,u),dot(point,v)]);
    const minU = Math.min(...projected.map(point => point[0])), minV = Math.min(...projected.map(point => point[1]));
    const base = positions.length/3;
    for (const [i,point] of points.entries()) {
      positions.push(...point.map((value,axis) => value+center[axis])); normals.push(...normal);
      uvs.push(projected[i][0]-minU,projected[i][1]-minV);
    }
    for (let i=1; i<points.length-1; i++) indices.push(base,base+i,base+i+1);
  }
  for (const axis of [0,1,2]) for (const sign of [-1,1]) {
    const other = [0,1,2].filter(value => value!==axis), normal: Vec3 = [0,0,0]; normal[axis]=sign;
    polygon([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => {
      const point: Vec3=[0,0,0]; point[axis]=sign*half[axis]; point[other[0]]=a*inset[other[0]]; point[other[1]]=b*inset[other[1]]; return point;
    }),normal);
  }
  for (const [a,b] of [[0,1],[0,2],[1,2]]) for (const sa of [-1,1]) for (const sb of [-1,1]) {
    const along = 3-a-b, normal: Vec3=[0,0,0]; normal[a]=sa/Math.SQRT2; normal[b]=sb/Math.SQRT2;
    polygon([[-1,0],[-1,1],[1,1],[1,0]].map(([end,side]) => {
      const point: Vec3=[0,0,0]; point[along]=end*inset[along];
      point[a]=sa*(side ? inset[a] : half[a]); point[b]=sb*(side ? half[b] : inset[b]); return point;
    }),normal);
  }
  for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1]) {
    const signs=[sx,sy,sz], normal=signs.map(value => value/Math.sqrt(3)) as Vec3;
    polygon([0,1,2].map(axis => signs.map((sign,i) => sign*(i===axis ? half[i] : inset[i])) as Vec3),normal);
  }
  return { positions,normals,uvs,indices,bounds:boundsFromBox(center,size) };
}
