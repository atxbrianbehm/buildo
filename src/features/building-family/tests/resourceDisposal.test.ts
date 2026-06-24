import { vi } from "vitest";
import { disposeBuildingSceneRuntime } from "../renderer-three/buildingSceneAdapter";
import { disposeBuildingSceneResources } from "../renderer-three/resourceDisposal";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

describe("renderer resource disposal", () => {
  it("disposes scene-owned geometry and material resources exactly once", async () => {
    const fixture = await createAssemblyHallFixture();
    const runtime = fixture.buildingRuntime;
    const geometryDisposers = runtime.renderables.map((object) => vi.spyOn(object.geometry, "dispose"));
    const materials = runtime.materialRegistry.listMaterials();
    const materialDisposers = materials.map((material) => vi.spyOn(material, "dispose"));
    const textureDisposers = Object.values(fixture.familyRuntime.textureSet.textures).map((texture) =>
      vi.spyOn(texture, "dispose")
    );

    const firstResult = disposeBuildingSceneRuntime(runtime);
    const secondResult = disposeBuildingSceneRuntime(runtime);

    expect(firstResult).toEqual({
      geometriesDisposed: runtime.renderables.length,
      materialsDisposed: materials.length
    });
    expect(secondResult).toEqual({
      geometriesDisposed: 0,
      materialsDisposed: 0
    });
    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(textureDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(runtime.root.children).toHaveLength(0);
    expect(runtime.objectsByBatchId.size).toBe(0);
    expect(runtime.semanticLookup.size).toBe(0);
    expect(runtime.galleryObjects.size).toBe(0);
    expect(runtime.disposed).toBe(true);
  });

  it("can dispose building geometry while preserving shared family atlas resources", async () => {
    const fixture = await createAssemblyHallFixture();
    const runtime = fixture.buildingRuntime;
    const geometryDisposers = runtime.renderables.map((object) => vi.spyOn(object.geometry, "dispose"));
    const materials = fixture.familyRuntime.materialRegistry.listMaterials();
    const materialDisposers = materials.map((material) => vi.spyOn(material, "dispose"));
    const textureDisposers = Object.values(fixture.familyRuntime.textureSet.textures).map((texture) =>
      vi.spyOn(texture, "dispose")
    );

    const firstResult = disposeBuildingSceneResources(runtime, { disposeMaterials: false });
    const secondResult = disposeBuildingSceneResources(runtime, { disposeMaterials: false });

    expect(firstResult).toEqual({
      geometriesDisposed: runtime.renderables.length,
      materialsDisposed: 0
    });
    expect(secondResult).toEqual({
      geometriesDisposed: 0,
      materialsDisposed: 0
    });
    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(textureDisposers.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(materials.every((material) => material.userData.disposed === undefined)).toBe(true);
    expect(fixture.familyRuntime.textureSet.disposed).toBe(false);

    const familyDisposeResult = fixture.familyRuntime.dispose();

    expect(familyDisposeResult.geometriesDisposed).toBe(0);
    expect(familyDisposeResult.materialsDisposed).toBe(materials.length);
    expect(familyDisposeResult.texturesDisposed).toBe(textureDisposers.length);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(textureDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
