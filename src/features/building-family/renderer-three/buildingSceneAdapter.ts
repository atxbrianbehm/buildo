import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  REVISION,
  WebGLRenderer,
} from "three";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import type { ComponentGallery, ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { MeshBatchIR, RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { AssemblyStage } from "../contracts/shared";
import type { AtlasMaterialRegistry } from "./buildingAtlasMaterialFactory";

const stageOrder: AssemblyStage[] = ["massing", "facade", "openings", "trim", "roof"];

export interface RendererBackendSupport {
  threeRevision: string;
  webgl: {
    available: boolean;
    importPath: "three";
  };
  webgpu: {
    available: boolean;
    importPath: "three/webgpu";
  };
  preferredBackend: "webgpu" | "webgl";
}

export interface BuildingSemanticLookupEntry {
  semanticPath: string;
  batchId: string;
  stage: AssemblyStage;
  object: BuildingRenderable;
  elementIndex?: number;
}

export interface BuildingGalleryObject {
  entry: ComponentGalleryEntry;
  object: BuildingRenderable;
}

export type BuildingRenderable = (Mesh<BufferGeometry, MeshStandardMaterial> | InstancedMesh<BufferGeometry, MeshStandardMaterial>) & {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  count?: number;
  isInstancedMesh?: boolean;
  instanceMatrix?: InstancedMesh["instanceMatrix"];
};

export interface BuildingStageGroup {
  stage: AssemblyStage;
  group: Group;
}

export interface BuildingSceneRuntime {
  root: Group;
  stageGroups: BuildingStageGroup[];
  objectsByBatchId: Map<string, BuildingRenderable>;
  semanticLookup: Map<string, BuildingSemanticLookupEntry>;
  galleryObjects: Map<string, BuildingGalleryObject>;
  renderables: BuildingRenderable[];
  materialRegistry: AtlasMaterialRegistry;
  metrics: {
    meshCount: number;
    instanceBatchCount: number;
    instanceCount: number;
    triangleCount: number;
  };
  disposed: boolean;
}

export interface CreateBuildingSceneRuntimeInput {
  ir: RuntimeBuildingIR;
  catalog: ComponentCatalog;
  materialRegistry: AtlasMaterialRegistry;
  componentGallery?: ComponentGallery;
}

export interface DisposeBuildingSceneRuntimeResult {
  geometriesDisposed: number;
  materialsDisposed: number;
}

function recipeById(catalog: ComponentCatalog, recipeId: string): ComponentRecipe {
  const recipe = catalog.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) {
    throw new Error(`Missing component recipe ${recipeId} for renderer adapter.`);
  }
  return recipe;
}

function stageForBatch(ir: RuntimeBuildingIR, batchId: string): AssemblyStage {
  return ir.semanticIndex.find((entry) => entry.batchId === batchId)?.stage ?? "massing";
}

function createStageGroups(root: Group): Map<AssemblyStage, Group> {
  const groups = new Map<AssemblyStage, Group>();

  for (const stage of stageOrder) {
    const group = new Group();
    group.name = `building-stage.${stage}`;
    group.userData = { stage };
    root.add(group);
    groups.set(stage, group);
  }

  return groups;
}

function createMeshGeometry(batch: MeshBatchIR): BufferGeometry {
  const geometry = new BufferGeometry();

  if (batch.positions) {
    geometry.setAttribute("position", new BufferAttribute(batch.positions, 3));
  }
  if (batch.normals) {
    geometry.setAttribute("normal", new BufferAttribute(batch.normals, 3));
  }
  if (batch.uvs) {
    geometry.setAttribute("uv", new BufferAttribute(batch.uvs, 2));
  }
  if (batch.indices) {
    geometry.setIndex(new BufferAttribute(batch.indices, 1));
  }

  geometry.computeBoundingBox();
  return geometry;
}

function createRecipeGeometry(recipe: ComponentRecipe): BufferGeometry {
  const geometry = new BoxGeometry(
    recipe.dimensionsM.width,
    recipe.dimensionsM.height,
    Math.max(recipe.dimensionsM.depth, 0.01)
  );
  geometry.name = `recipe-geometry.${recipe.id}`;
  geometry.userData = {
    recipeId: recipe.id,
    generatedFromRecipe: true
  };
  return geometry;
}

function assignInstanceMatrices(object: InstancedMesh<BufferGeometry, MeshStandardMaterial>, transforms: Float32Array): void {
  const matrix = new Matrix4();

  for (let index = 0; index < object.count; index += 1) {
    matrix.fromArray(transforms, index * 16);
    object.setMatrixAt(index, matrix);
  }

  object.instanceMatrix.needsUpdate = true;
}

function attachSemanticLookup(
  runtime: BuildingSceneRuntime,
  ir: RuntimeBuildingIR,
  object: BuildingRenderable,
  batchId: string
): void {
  const semanticEntries = ir.semanticIndex.filter((entry) => entry.batchId === batchId);
  object.userData.semanticPaths = semanticEntries.map((entry) => entry.semanticPath);

  for (const entry of semanticEntries) {
    runtime.semanticLookup.set(entry.semanticPath, {
      semanticPath: entry.semanticPath,
      batchId,
      stage: entry.stage,
      object,
      elementIndex: entry.elementIndex
    });
  }
}

function linkGalleryObjects(runtime: BuildingSceneRuntime, componentGallery: ComponentGallery | undefined): void {
  if (!componentGallery) {
    return;
  }

  for (const entry of componentGallery.entries) {
    if (!entry.batchId) {
      continue;
    }
    const object = runtime.objectsByBatchId.get(entry.batchId);
    if (object) {
      runtime.galleryObjects.set(entry.recipeId, { entry, object });
    }
  }
}

export async function detectRendererBackendSupport(): Promise<RendererBackendSupport> {
  const webgpuAvailable = await import("three/webgpu")
    .then((webgpu) => "WebGPURenderer" in webgpu)
    .catch(() => false);

  return {
    threeRevision: REVISION,
    webgl: {
      available: typeof WebGLRenderer === "function",
      importPath: "three"
    },
    webgpu: {
      available: webgpuAvailable,
      importPath: "three/webgpu"
    },
    preferredBackend: webgpuAvailable ? "webgpu" : "webgl"
  };
}

export function createBuildingSceneRuntime(input: CreateBuildingSceneRuntimeInput): BuildingSceneRuntime {
  const root = new Group();
  root.name = `building-runtime.${input.ir.buildingId}`;
  root.userData = {
    buildingId: input.ir.buildingId,
    familyId: input.ir.familyId,
    sourceGraphHash: input.ir.sourceGraphHash
  };
  const stageGroups = createStageGroups(root);
  const runtime: BuildingSceneRuntime = {
    root,
    stageGroups: stageOrder.map((stage) => ({ stage, group: stageGroups.get(stage)! })),
    objectsByBatchId: new Map(),
    semanticLookup: new Map(),
    galleryObjects: new Map(),
    renderables: [],
    materialRegistry: input.materialRegistry,
    metrics: {
      meshCount: input.ir.meshBatches.length,
      instanceBatchCount: input.ir.instanceBatches.length,
      instanceCount: input.ir.metrics.instanceCount,
      triangleCount: input.ir.metrics.triangleCount
    },
    disposed: false
  };

  for (const batch of input.ir.meshBatches) {
    const stage = stageForBatch(input.ir, batch.batchId);
    const materialSlotId = batch.materialSlotId ?? "utility.mask";
    const mesh = new Mesh(createMeshGeometry(batch), input.materialRegistry.getMaterial(materialSlotId)) as BuildingRenderable;
    mesh.name = batch.batchId;
    mesh.userData = {
      batchId: batch.batchId,
      role: batch.role,
      stage,
      materialSlotId,
      rendererBoundary: "building-family"
    };
    stageGroups.get(stage)!.add(mesh);
    runtime.renderables.push(mesh);
    runtime.objectsByBatchId.set(batch.batchId, mesh);
    attachSemanticLookup(runtime, input.ir, mesh, batch.batchId);
  }

  for (const batch of input.ir.instanceBatches) {
    const recipe = recipeById(input.catalog, batch.recipeId);
    const stage = stageForBatch(input.ir, batch.batchId);
    const mesh = new InstancedMesh(
      createRecipeGeometry(recipe),
      input.materialRegistry.getMaterial(batch.materialSlotId),
      batch.count
    ) as BuildingRenderable;
    mesh.name = batch.batchId;
    mesh.userData = {
      batchId: batch.batchId,
      recipeId: recipe.id,
      role: recipe.role,
      stage,
      materialSlotId: batch.materialSlotId,
      rendererBoundary: "building-family"
    };
    if (batch.transforms) {
      assignInstanceMatrices(mesh as InstancedMesh<BufferGeometry, MeshStandardMaterial>, batch.transforms);
    }
    stageGroups.get(stage)!.add(mesh);
    runtime.renderables.push(mesh);
    runtime.objectsByBatchId.set(batch.batchId, mesh);
    attachSemanticLookup(runtime, input.ir, mesh, batch.batchId);
  }

  linkGalleryObjects(runtime, input.componentGallery);
  return runtime;
}

export function disposeBuildingSceneRuntime(runtime: BuildingSceneRuntime): DisposeBuildingSceneRuntimeResult {
  let geometriesDisposed = 0;

  for (const object of runtime.renderables) {
    object.geometry.dispose();
    object.geometry.userData.disposed = true;
    geometriesDisposed += 1;
  }

  const materialsDisposed = runtime.materialRegistry.listMaterials().length;
  runtime.materialRegistry.dispose();
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
