import { Group } from "three";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import type { ComponentGallery } from "../compiler/componentGalleryBuilder";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";
import type { PackedAtlas } from "../materials/atlasPacker";
import { createAtlasMaterialRegistry, type AtlasMaterialRegistry } from "./buildingAtlasMaterialFactory";
import { createAtlasTextureSet, type AtlasTextureSet } from "./buildingAtlasTextureFactory";
import {
  createBuildingSceneRuntime,
  type BuildingSceneRuntime,
  type RendererBackendSupport
} from "./buildingSceneAdapter";
import { disposeBuildingSceneResources } from "./resourceDisposal";

export interface CreateBuildingFamilyRuntimeInput {
  familyId: string;
  packedAtlas: PackedAtlas;
  debugExport?: AtlasDebugExport;
  backendSupport?: RendererBackendSupport;
}

export interface CreateOrReplaceBuildingRuntimeInput {
  ir: RuntimeBuildingIR;
  catalog: ComponentCatalog;
  componentGallery?: ComponentGallery;
  buildingId?: string;
}

export interface BuildingFamilyRuntimeMetrics {
  buildingCount: number;
  meshCount: number;
  instanceBatchCount: number;
  instanceCount: number;
  triangleCount: number;
  drawCallCount: number;
  sharedMaterialCount: number;
  textureCount: number;
  preferredBackend?: RendererBackendSupport["preferredBackend"];
}

export interface DisposeBuildingFamilyRuntimeResult {
  buildingRuntimesDisposed: number;
  geometriesDisposed: number;
  materialsDisposed: number;
  texturesDisposed: number;
}

export interface BuildingFamilyRuntime {
  familyId: string;
  root: Group;
  textureSet: AtlasTextureSet;
  materialRegistry: AtlasMaterialRegistry;
  buildingRuntimes: Map<string, BuildingSceneRuntime>;
  backendSupport?: RendererBackendSupport;
  metrics: BuildingFamilyRuntimeMetrics;
  disposed: boolean;
  createOrReplaceBuilding(input: CreateOrReplaceBuildingRuntimeInput): BuildingSceneRuntime;
  removeBuilding(buildingId: string): DisposeBuildingFamilyRuntimeResult;
  listBuildingIds(): string[];
  dispose(): DisposeBuildingFamilyRuntimeResult;
}

function emptyMetrics(preferredBackend?: RendererBackendSupport["preferredBackend"]): BuildingFamilyRuntimeMetrics {
  return {
    buildingCount: 0,
    meshCount: 0,
    instanceBatchCount: 0,
    instanceCount: 0,
    triangleCount: 0,
    drawCallCount: 0,
    sharedMaterialCount: 0,
    textureCount: 0,
    preferredBackend
  };
}

function liveMetrics(
  buildingRuntimes: Map<string, BuildingSceneRuntime>,
  materialRegistry: AtlasMaterialRegistry,
  textureSet: AtlasTextureSet,
  preferredBackend?: RendererBackendSupport["preferredBackend"]
): BuildingFamilyRuntimeMetrics {
  const runtimes = Array.from(buildingRuntimes.values()).filter((runtime) => !runtime.disposed);
  return {
    buildingCount: runtimes.length,
    meshCount: runtimes.reduce((total, runtime) => total + runtime.metrics.meshCount, 0),
    instanceBatchCount: runtimes.reduce((total, runtime) => total + runtime.metrics.instanceBatchCount, 0),
    instanceCount: runtimes.reduce((total, runtime) => total + runtime.metrics.instanceCount, 0),
    triangleCount: runtimes.reduce((total, runtime) => total + runtime.metrics.triangleCount, 0),
    drawCallCount: runtimes.reduce((total, runtime) => total + runtime.renderables.length, 0),
    sharedMaterialCount: materialRegistry.listMaterials().length,
    textureCount: textureSet.disposed ? 0 : Object.keys(textureSet.textures).length,
    preferredBackend
  };
}

function runtimeIrWithBuildingId(ir: RuntimeBuildingIR, buildingId: string | undefined): RuntimeBuildingIR {
  if (!buildingId || buildingId === ir.buildingId) {
    return ir;
  }
  return {
    ...ir,
    buildingId
  };
}

export function createBuildingFamilyRuntime(input: CreateBuildingFamilyRuntimeInput): BuildingFamilyRuntime {
  const textureSet = createAtlasTextureSet({
    packedAtlas: input.packedAtlas,
    debugExport: input.debugExport
  });
  const materialRegistry = createAtlasMaterialRegistry({
    atlasId: input.packedAtlas.atlasId,
    atlasContentHash: input.packedAtlas.contentHash,
    debugExport: input.debugExport,
    textureSet
  });
  const root = new Group();
  root.name = `building-family-runtime.${input.familyId}`;
  root.userData = {
    familyId: input.familyId,
    atlasId: input.packedAtlas.atlasId,
    atlasContentHash: input.packedAtlas.contentHash,
    rendererBoundary: "building-family"
  };

  const buildingRuntimes = new Map<string, BuildingSceneRuntime>();
  const preferredBackend = input.backendSupport?.preferredBackend;
  const familyRuntime: BuildingFamilyRuntime = {
    familyId: input.familyId,
    root,
    textureSet,
    materialRegistry,
    buildingRuntimes,
    backendSupport: input.backendSupport,
    metrics: emptyMetrics(preferredBackend),
    disposed: false,
    createOrReplaceBuilding: (buildingInput) => {
      if (familyRuntime.disposed) {
        throw new Error(`Cannot add building runtime to disposed family runtime ${input.familyId}.`);
      }

      const ir = runtimeIrWithBuildingId(buildingInput.ir, buildingInput.buildingId);
      const buildingId = ir.buildingId;
      const existing = buildingRuntimes.get(buildingId);
      if (existing) {
        disposeBuildingSceneResources(existing, { disposeMaterials: false });
        root.remove(existing.root);
      }

      const runtime = createBuildingSceneRuntime({
        ir,
        catalog: buildingInput.catalog,
        componentGallery: buildingInput.componentGallery,
        materialRegistry
      });
      buildingRuntimes.set(buildingId, runtime);
      root.add(runtime.root);
      familyRuntime.metrics = liveMetrics(buildingRuntimes, materialRegistry, textureSet, preferredBackend);
      return runtime;
    },
    removeBuilding: (buildingId) => {
      const existing = buildingRuntimes.get(buildingId);
      if (!existing) {
        return {
          buildingRuntimesDisposed: 0,
          geometriesDisposed: 0,
          materialsDisposed: 0,
          texturesDisposed: 0
        };
      }

      const { geometriesDisposed } = disposeBuildingSceneResources(existing, { disposeMaterials: false });
      root.remove(existing.root);
      buildingRuntimes.delete(buildingId);
      familyRuntime.metrics = liveMetrics(buildingRuntimes, materialRegistry, textureSet, preferredBackend);
      return {
        buildingRuntimesDisposed: 1,
        geometriesDisposed,
        materialsDisposed: 0,
        texturesDisposed: 0
      };
    },
    listBuildingIds: () => Array.from(buildingRuntimes.keys()).sort(),
    dispose: () => {
      if (familyRuntime.disposed) {
        return {
          buildingRuntimesDisposed: 0,
          geometriesDisposed: 0,
          materialsDisposed: 0,
          texturesDisposed: 0
        };
      }

      let geometriesDisposed = 0;
      for (const runtime of buildingRuntimes.values()) {
        geometriesDisposed += disposeBuildingSceneResources(runtime, { disposeMaterials: false }).geometriesDisposed;
      }
      const buildingRuntimesDisposed = buildingRuntimes.size;
      buildingRuntimes.clear();
      root.clear();

      const materialsDisposed = materialRegistry.listMaterials().length;
      const texturesDisposed = textureSet.disposed ? 0 : Object.keys(textureSet.textures).length;
      materialRegistry.dispose();
      familyRuntime.disposed = true;
      familyRuntime.metrics = liveMetrics(buildingRuntimes, materialRegistry, textureSet, preferredBackend);

      return {
        buildingRuntimesDisposed,
        geometriesDisposed,
        materialsDisposed,
        texturesDisposed
      };
    }
  };

  return familyRuntime;
}
