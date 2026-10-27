import { emptyBounds, expandBounds, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";
import type { ProfileDefinition } from "./profileLibrary";

/** Closed metre-space loft for edited openings; monotone profiles admit exact strip caps. */
export function extrudeConstructionOpeningTrim(input: { profile: ProfileDefinition; center: Vec3; runLengthM: number }): PrimitiveGeometry {
  const points = input.profile.points;
  if (!Number.isFinite(input.runLengthM) || input.runLengthM <= 0 || !input.center.every(Number.isFinite) || points.length < 2 ||
      points.some((point,i) => !Number.isFinite(point.u) || !Number.isFinite(point.d) || point.d <= 0 || i > 0 && point.u <= points[i-1].u)) {
    throw new Error("Opening trim requires an increasing finite profile, positive depth and run.");
  }
  const y0 = points[0].u, y1 = points.at(-1)!.u, middle = (y0+y1)/2;
  const section = points.map(point => [input.center[1]+point.u-middle,input.center[2]+point.d] as const);
  const ring: Array<readonly [number,number]> = [[section[0][0],input.center[2]],...section,
    ...section.slice(1).reverse().map(([y]) => [y,input.center[2]] as const)];
  // This profile traverses the exterior bottom-to-top; reverse to CCW in Y/Z.
  ring.reverse();
  const x0 = input.center[0]-input.runLengthM/2, x1 = input.center[0]+input.runLengthM/2;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  function triangle(vertices: Vec3[], normal: Vec3) {
    const base = positions.length/3;
    for (const vertex of vertices) {
      positions.push(...vertex); normals.push(...normal);
      uvs.push(Math.abs(normal[0])>.9 ? vertex[2]-input.center[2] : vertex[0]-x0,vertex[1]-input.center[1]);
    }
    indices.push(base,base+1,base+2);
  }
  for (let i=0; i<ring.length; i++) {
    const a=ring[i], b=ring[(i+1)%ring.length], dy=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dy,dz);
    const normal: Vec3 = [0,dz/length,-dy/length];
    const vertices: Vec3[] = [[x0,...a],[x0,...b],[x1,...b],[x1,...a]];
    // Side UVs use profile arc length, including horizontal top/bottom returns.
    const base=positions.length/3;
    for (const [j,vertex] of vertices.entries()) { positions.push(...vertex); normals.push(...normal); uvs.push(j===1||j===2?length:0,j>=2?input.runLengthM:0); }
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  for (const x of [x0,x1]) for (let i=0; i<section.length-1; i++) {
    const a=section[i], b=section[i+1];
    const quad: Vec3[] = [[x,a[0],input.center[2]],[x,b[0],input.center[2]],[x,...b],[x,...a]];
    const normal: Vec3 = [x===x1?1:-1,0,0];
    for (const ids of [[0,1,2],[0,2,3]]) triangle((x===x1?ids:[...ids].reverse()).map(index=>quad[index]),normal);
  }
  let bounds=emptyBounds();
  for (let i=0; i<positions.length; i+=3) { const point=positions.slice(i,i+3) as Vec3; bounds=expandBounds(bounds,{min:point,max:point}); }
  return {positions,normals,uvs,indices,bounds};
}
