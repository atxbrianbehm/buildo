import type { ConstructionAwningPlan } from "../contracts/constructionAwning";
import { readConstructionAwning } from "../core/constructionAwning";
import { buildBoxPrimitive, emptyBounds, expandBounds, type Vec3 } from "./primitiveGeometry";

function metricUvs(box: ReturnType<typeof buildBoxPrimitive>) {
  for (let i = 0; i < box.positions.length / 3; i++) {
    const p = i * 3, nx = Math.abs(box.normals[p]), ny = Math.abs(box.normals[p + 1]);
    box.uvs[i * 2] = nx > 0.9 ? box.positions[p + 2] - box.bounds.min[2] : box.positions[p] - box.bounds.min[0];
    box.uvs[i * 2 + 1] = ny > 0.9 ? box.positions[p + 2] - box.bounds.min[2] : box.positions[p + 1] - box.bounds.min[1];
  }
}

/** Two closed procedural surfaces; appearance and app material binding are separate. */
export function buildConstructionAwningGeometry(input: ConstructionAwningPlan) {
  const plan = readConstructionAwning(input), { projectionM, dropM, valanceHeightM } = plan.source;
  const baseY = plan.source.storefront.source.scope.originM[1], rise = Math.hypot(projectionM, dropM), angle = Math.atan2(dropM, projectionM);
  const roof = buildBoxPrimitive({ center: [0, 0, 0], size: [plan.widthM, 0.025, rise] });
  metricUvs(roof);
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < roof.positions.length; i += 3) {
    const y = roof.positions[i + 1], z = roof.positions[i + 2], ny = roof.normals[i + 1], nz = roof.normals[i + 2];
    roof.positions[i + 1] = c * y - s * z + plan.mountYM - baseY - dropM / 2;
    roof.positions[i + 2] = s * y + c * z + projectionM / 2;
    roof.normals[i + 1] = c * ny - s * nz; roof.normals[i + 2] = s * ny + c * nz;
  }
  roof.bounds = emptyBounds();
  for (let i = 0; i < roof.positions.length; i += 3) { const point = roof.positions.slice(i, i + 3) as Vec3; roof.bounds = expandBounds(roof.bounds, { min: point, max: point }); }
  const valance = buildBoxPrimitive({ center: [0, plan.frontYM - baseY - valanceHeightM / 2, projectionM], size: [plan.widthM, valanceHeightM, 0.025] });
  metricUvs(valance);
  return { roof, valance };
}
