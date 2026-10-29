import { describe, expect, it } from "vitest";
import { Box3, DirectionalLight, Spherical, Vector3 } from "three";
import { fitConstructionShadowFrustum } from "../renderer-three/constructionShadowFrustum";

describe("construction shadow projection", () => {
  it.each([
    [12, 11, 14],
    [30, 5, 8],
    [5, 32, 7],
    [6, 8, 28]
  ])("contains the corners of a %s × %s × %s building as the light moves", (width, height, depth) => {
    const bounds = new Box3(new Vector3(-width / 2, 0, -depth / 2), new Vector3(width / 2, height, depth / 2));
    const target = new Vector3(0, height * 0.6, 0);
    const radius = Math.max(6, Math.max(width, height, depth) * 2);
    const light = new DirectionalLight();
    light.target.position.copy(target);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = Math.max(24, radius * 3);
    light.shadow.bias = -0.00003;
    light.shadow.normalBias = 0.001;
    for (const [phi, theta] of [[0.12, 0], [0.7, 1], [Math.PI * 0.48, -2], [1.1, 3]]) {
      light.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(radius, phi, theta)));
      expect(fitConstructionShadowFrustum(light, bounds)).toBe(true);
      const camera = light.shadow.camera;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        expect(Math.abs(point.x)).toBeLessThan(camera.right);
        expect(Math.abs(point.y)).toBeLessThan(camera.top);
        expect(-point.z).toBeGreaterThan(camera.near);
        expect(-point.z).toBeLessThan(camera.far);
      }
      expect(camera.left).toBe(-camera.right);
      expect(camera.bottom).toBe(-camera.top);
      expect(light.shadow.bias).toBe(-0.00003);
      expect(light.shadow.normalBias).toBe(0.001);
    }
  });

  it("does not replace the existing projection for empty or nonfinite bounds", () => {
    const light = new DirectionalLight();
    const original = light.shadow.camera.right;
    expect(fitConstructionShadowFrustum(light, new Box3())).toBe(false);
    expect(fitConstructionShadowFrustum(light, new Box3(new Vector3(0, 0, 0), new Vector3(Infinity, 1, 1)))).toBe(false);
    expect(light.shadow.camera.right).toBe(original);
  });

  it("keeps ground contact rays inside the fitted projection at the default light", () => {
    const bounds = new Box3(new Vector3(-6, 0, -7), new Vector3(6, 11, 7));
    const target = new Vector3(0, 6.6, 0);
    const light = new DirectionalLight();
    light.target.position.copy(target);
    light.position.copy(target).add(new Vector3(15.4, 23.8, -18.2));
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 84;
    expect(fitConstructionShadowFrustum(light, bounds)).toBe(true);
    const away = target.clone().sub(light.position).normalize();
    for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
      const caster = new Vector3(x, bounds.max.y, z);
      const ground = caster.clone().addScaledVector(away, (caster.y + 0.025) / -away.y);
      const projected = ground.applyMatrix4(light.shadow.camera.matrixWorldInverse);
      expect(Math.abs(projected.x)).toBeLessThan(light.shadow.camera.right);
      expect(Math.abs(projected.y)).toBeLessThan(light.shadow.camera.top);
      expect(-projected.z).toBeLessThan(light.shadow.camera.far);
    }
  });
});
