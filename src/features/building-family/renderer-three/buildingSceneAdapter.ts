import {
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
import { createRecipeBufferGeometry } from "./recipeGeometryFactory";
import {
  disposeBuildingSceneResources,
  type DisposeBuildingSceneResourcesResult
} from "./resourceDisposal";

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

export type DisposeBuildingSceneRuntimeResult = DisposeBuildingSceneResourcesResult;

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
    geometry.setAttribute("uv", new BufferAttribute(batch.uvs.slice() as Float32Array<ArrayBuffer>, 2));
  }
  if (batch.indices) {
    geometry.setIndex(new BufferAttribute(batch.indices, 1));
  }

  geometry.computeBoundingBox();
  return geometry;
}

function fract01(value: number): number {
  const wrapped = value - Math.floor(value);
  // Keep exact 1.0 at the edge instead of snapping to 0.
  return wrapped === 0 && value > 0 ? 1 : wrapped;
}

/**
 * Map geometry UVs into an atlas slot.
 * Box primitives emit UVs in meters along each face; tileable slots divide by
 * physicalSizeM so brick/trim repeat at period scale (V5). Unit (0–1) UVs still work.
 */
function remapGeometryUvsToAtlasSlot(geometry: BufferGeometry, material: MeshStandardMaterial): void {
  const atlasSlot = material.userData.atlasSlot as
    | {
        uvRect?: { x: number; y: number; width: number; height: number };
        physicalSizeM?: { width: number; height: number };
        uvMode?: string;
        periodicity?: string;
      }
    | undefined;
  const uvRect = atlasSlot?.uvRect;
  const uv = geometry.getAttribute("uv");
  if (!uvRect || !uv) {
    return;
  }

  const physical = atlasSlot?.physicalSizeM;
  const periodicity = atlasSlot?.periodicity ?? "none";
  const uvMode = atlasSlot?.uvMode ?? "stretch";
  const tileable =
    periodicity === "xy" ||
    periodicity === "x" ||
    uvMode === "repeat" ||
    uvMode === "cap-repeat-cap";
  const tileW = Math.max(1e-4, physical?.width ?? 1);
  const tileH = Math.max(1e-4, physical?.height ?? 1);

  let maxU = 0;
  let maxV = 0;
  for (let index = 0; index < uv.count; index += 1) {
    maxU = Math.max(maxU, Math.abs(uv.getX(index)));
    maxV = Math.max(maxV, Math.abs(uv.getY(index)));
  }
  const meterSpace = maxU > 1.05 || maxV > 1.05;

  for (let index = 0; index < uv.count; index += 1) {
    let u = uv.getX(index);
    let v = uv.getY(index);
    if (meterSpace) {
      u = u / tileW;
      v = v / tileH;
      if (tileable) {
        u = fract01(u);
        v = fract01(v);
      } else {
        u = Math.min(1, Math.max(0, u));
        v = Math.min(1, Math.max(0, v));
      }
    } else if (tileable && physical) {
      u = fract01(u);
      v = fract01(v);
    }
    uv.setXY(index, uvRect.x + u * uvRect.width, uvRect.y + v * uvRect.height);
  }
  uv.needsUpdate = true;
  geometry.userData.atlasSlotUvRect = { ...uvRect };
  geometry.userData.physicalTileSizeM = physical ? { ...physical } : undefined;
}

function createRecipeGeometry(recipe: ComponentRecipe): BufferGeometry {
  return createRecipeBufferGeometry(recipe);
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
    const material = input.materialRegistry.getMaterial(materialSlotId);
    const geometry = createMeshGeometry(batch);
    remapGeometryUvsToAtlasSlot(geometry, material);
    const mesh = new Mesh(geometry, material) as BuildingRenderable;
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
    const material = input.materialRegistry.getMaterial(batch.materialSlotId);
    const geometry = createRecipeGeometry(recipe);
    remapGeometryUvsToAtlasSlot(geometry, material);
    const mesh = new InstancedMesh(
      geometry,
      material,
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
  return disposeBuildingSceneResources(runtime, { disposeMaterials: true });
}
