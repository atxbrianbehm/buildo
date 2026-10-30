import type { ConstructionAwningSupportPlan } from "../contracts/constructionAwningSupports";
import { readConstructionAwningSupports } from "../core/constructionAwningSupports";
import { buildBoxPrimitive, emptyBounds, expandBounds, type Vec3 } from "./primitiveGeometry";

/** Closed rectangular rods; no renderer or material ownership enters the compiler. */
export function buildConstructionAwningSupportGeometry(input: ConstructionAwningSupportPlan) {
  const plan = readConstructionAwningSupports(input), thickness = plan.source.thicknessM;
  return plan.rods.map(rod => {
    const dy = rod.canopy[1] - rod.wall[1], dz = rod.canopy[2] - rod.wall[2], length = Math.hypot(dy, dz);
    const angle = Math.atan2(-dy, dz), c = Math.cos(angle), s = Math.sin(angle);
    const box = buildBoxPrimitive({ center: [0, 0, 0], size: [thickness, thickness, length] });
    for (let i = 0; i < box.positions.length; i += 3) {
      const y = box.positions[i + 1], z = box.positions[i + 2], ny = box.normals[i + 1], nz = box.normals[i + 2];
      box.positions[i] += rod.wall[0];
      box.positions[i + 1] = c * y - s * z + (rod.wall[1] + rod.canopy[1]) / 2;
      box.positions[i + 2] = s * y + c * z + (rod.wall[2] + rod.canopy[2]) / 2;
      box.normals[i + 1] = c * ny - s * nz; box.normals[i + 2] = s * ny + c * nz;
    }
    box.bounds = emptyBounds();
    for (let i = 0; i < box.positions.length; i += 3) { const point = box.positions.slice(i, i + 3) as Vec3; box.bounds = expandBounds(box.bounds, { min: point, max: point }); }
    return box;
  });
}
