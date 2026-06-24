import type { BuildingSceneRuntime } from "./buildingSceneAdapter";

export interface DisposeBuildingSceneResourcesOptions {
  disposeMaterials?: boolean;
}

export interface DisposeBuildingSceneResourcesResult {
  geometriesDisposed: number;
  materialsDisposed: number;
}

export function disposeBuildingSceneResources(
  runtime: BuildingSceneRuntime,
  options: DisposeBuildingSceneResourcesOptions = {}
): DisposeBuildingSceneResourcesResult {
  if (runtime.disposed) {
    return {
      geometriesDisposed: 0,
      materialsDisposed: 0
    };
  }

  let geometriesDisposed = 0;
  for (const object of runtime.renderables) {
    if (object.geometry.userData.disposed) {
      continue;
    }
    object.geometry.dispose();
    object.geometry.userData.disposed = true;
    geometriesDisposed += 1;
  }

  const shouldDisposeMaterials = options.disposeMaterials ?? true;
  const materialsDisposed = shouldDisposeMaterials ? runtime.materialRegistry.listMaterials().length : 0;
  if (shouldDisposeMaterials) {
    runtime.materialRegistry.dispose();
  }

  runtime.root.clear();
  runtime.objectsByBatchId.clear();
  runtime.semanticLookup.clear();
  runtime.galleryObjects.clear();
  runtime.disposed = true;

  return {
    geometriesDisposed,
    materialsDisposed
  };
}
