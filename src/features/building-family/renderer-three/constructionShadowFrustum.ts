import { Box3, DirectionalLight, Vector3 } from "three";

/** Fit the existing directional shadow projection to conservative world-space building bounds. */
export function fitConstructionShadowFrustum(light: DirectionalLight, bounds: Box3): boolean {
  if (bounds.isEmpty()) return false;

  light.updateWorldMatrix(true, false);
  light.target.updateWorldMatrix(true, false);
  light.shadow.updateMatrices(light);
  const camera = light.shadow.camera;
  const corner = new Vector3();
  let extent = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        if (![corner.x, corner.y, corner.z].every(Number.isFinite)) return false;
        extent = Math.max(extent, Math.abs(corner.x), Math.abs(corner.y));
      }
    }
  }
  const padded = Math.ceil(extent * 11) / 10;
  if (!Number.isFinite(padded) || padded <= 0) return false;
  camera.left = -padded;
  camera.right = padded;
  camera.top = padded;
  camera.bottom = -padded;
  camera.updateProjectionMatrix();
  return true;
}
