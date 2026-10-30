import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  REVISION,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Object3D,
} from "three";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import type { ComponentGallery, ComponentGalleryEntry } from "../compiler/componentGalleryBuilder";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { MeshBatchIR, RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { AssemblyStage } from "../contracts/shared";
import type { AtlasMaterialRegistry } from "./buildingAtlasMaterialFactory";
import type { BuildingSurfaceLease, BuildingSurfaceRuntime } from "./surfaceMaterialRuntime";
import { CONSTRUCTION_AWNING_FABRIC_SLOT, type ConstructionAwningFabricLease, type ConstructionAwningFabricRuntime } from "./constructionAwningFabricRuntime";
import { createRecipeBufferGeometry } from "./recipeGeometryFactory";
import type { AtlasSlotTextureWindow } from "./buildingAtlasTextureFactory";
import { createWallAtlasGeometry } from "./wallAtlasGeometry";
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
  /** Native index in a scale-compatible chunk; elementIndex remains the source IR index. */
  instanceIndex?: number;
}

export interface BuildingWindowSelection {
  semanticPath: string;
  object: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  instanceIndex: number;
  elementIndex?: number;
  bounds: Box3;
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
  surfaceRuntime?: BuildingSurfaceRuntime;
  surfaceLease?: BuildingSurfaceLease;
  awningFabricLease?: ConstructionAwningFabricLease;
  metrics: {
    meshCount: number;
    instanceBatchCount: number;
    instanceCount: number;
    triangleCount: number;
    /** Actual adapter triangles, including repeat subdivisions and instance multiplicity. */
    renderedTriangleCount?: number;
  };
  disposed: boolean;
}

export interface CreateBuildingSceneRuntimeInput {
  ir: RuntimeBuildingIR;
  catalog: ComponentCatalog;
  materialRegistry: AtlasMaterialRegistry;
  componentGallery?: ComponentGallery;
  surfaceRuntime?: BuildingSurfaceRuntime;
  awningFabricRuntime?: ConstructionAwningFabricRuntime;
  /** Compiler-owned procedural prototypes; legacy catalog recipes remain the default. */
  compiledInstanceGeometry?: ReadonlyMap<string, MeshBatchIR>;
}

export type DisposeBuildingSceneRuntimeResult = DisposeBuildingSceneResourcesResult;

function selectionObjectVisible(object: Object3D): boolean {
  for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) return false;
  }
  const material = (object as Mesh).material;
  return Array.isArray(material) ? material.some((entry) => entry.visible) : material?.visible !== false;
}

function windowSelection(
  runtime: BuildingSceneRuntime,
  catalog: ComponentCatalog,
  lookup: BuildingSemanticLookupEntry
): BuildingWindowSelection | undefined {
  const object = lookup.object;
  if (runtime.disposed || !object.isInstancedMesh || !runtime.renderables.includes(object) || !selectionObjectVisible(object)) return undefined;
  let ancestor: Object3D | null = object;
  while (ancestor && ancestor !== runtime.root) ancestor = ancestor.parent;
  if (!ancestor) return undefined;
  const recipe = catalog.recipes.find((entry) => entry.id === object.userData.recipeId);
  if (!recipe || !((recipe.role === "window" && recipe.kind === "frame") || (recipe.role === "windowGlass" && recipe.kind === "panel"))) return undefined;
  const instanceIndex = lookup.instanceIndex ?? lookup.elementIndex;
  const mesh = object as InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  if (instanceIndex === undefined || !Number.isInteger(instanceIndex) || instanceIndex < 0 || instanceIndex >= mesh.count || instanceIndex >= mesh.instanceMatrix.count) return undefined;
  const positions = mesh.geometry.getAttribute("position");
  if (!positions || positions.count === 0) return undefined;
  const instanceMatrix = new Matrix4();
  mesh.getMatrixAt(instanceIndex, instanceMatrix);
  mesh.updateWorldMatrix(true, false);
  const worldMatrix = new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix);
  if (!worldMatrix.elements.every(Number.isFinite)) return undefined;
  // Read the actual geometry without populating or changing its shared boundingBox.
  const bounds = new Box3();
  const vertex = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    bounds.expandByPoint(vertex.fromBufferAttribute(positions, index).applyMatrix4(worldMatrix));
  }
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return undefined;
  return { semanticPath: lookup.semanticPath, object: mesh, instanceIndex, elementIndex: lookup.elementIndex, bounds };
}

/** Resolve an exact current window instance; other dropdown entries retain metadata only. */
export function resolveWindowSelectionFromSemanticPath(
  runtime: BuildingSceneRuntime,
  catalog: ComponentCatalog,
  semanticPath: string
): BuildingWindowSelection | undefined {
  const lookup = runtime.semanticLookup.get(semanticPath);
  return lookup?.semanticPath === semanticPath ? windowSelection(runtime, catalog, lookup) : undefined;
}

/** Pass all actual hits, including occluders. An unadmitted nearest visible hit blocks selection. */
export function resolveWindowSelectionFromIntersections(
  runtime: BuildingSceneRuntime,
  catalog: ComponentCatalog,
  hits: readonly Intersection<Object3D>[]
): BuildingWindowSelection | undefined {
  if (runtime.disposed) return undefined;
  let nearestDistance = Infinity;
  let nearest: Intersection<Object3D>[] = [];
  for (const hit of hits) {
    if (!Number.isFinite(hit.distance) || hit.distance < 0 || !selectionObjectVisible(hit.object)) continue;
    if (hit.distance < nearestDistance) {
      nearestDistance = hit.distance;
      nearest = [hit];
    } else if (hit.distance === nearestDistance) nearest.push(hit);
  }
  let selected: BuildingWindowSelection | undefined;
  for (const hit of nearest) {
    if (hit.instanceId === undefined) return undefined;
    const matches = [...runtime.semanticLookup.values()].filter((lookup) => lookup.object === hit.object &&
      (lookup.instanceIndex ?? lookup.elementIndex) === hit.instanceId);
    if (matches.length !== 1) return undefined;
    const candidate = windowSelection(runtime, catalog, matches[0]!);
    if (!candidate || (selected && selected.semanticPath !== candidate.semanticPath)) return undefined;
    selected = candidate;
  }
  return selected;
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

function wallSamplingSlot(material: MeshStandardMaterial): AtlasSlotTextureWindow | undefined {
  const slot = material.userData.atlasSlot as AtlasSlotTextureWindow | undefined;
  return slot?.role === "wall" &&
    (slot.periodicity === "x" || slot.periodicity === "xy" || slot.uvMode === "repeat" || slot.uvMode === "repeat-x")
    ? slot : undefined;
}

function adaptGeometry(
  geometry: BufferGeometry, material: MeshStandardMaterial,
  uvSpace: "meters" | "normalized", scale?: [number, number, number]
): BufferGeometry {
  const isolated=material.userData.isolatedMeterTile as {widthM:number;heightM:number}|undefined;
  if(isolated) {
    if(![isolated.widthM,isolated.heightM].every(v=>Number.isFinite(v)&&v>0)){geometry.dispose();throw new Error("Isolated material tiles need finite metre dimensions.");}
    const uv=geometry.getAttribute("uv");
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*(uvSpace === "meters"?1/isolated.widthM:1),uv.getY(i)*(uvSpace === "meters"?1/isolated.heightM:1));
    uv.needsUpdate=true;geometry.userData.physicalTileSizeM={width:isolated.widthM,height:isolated.heightM};return geometry;
  }
  const slot = wallSamplingSlot(material);
  if (!slot) {
    remapGeometryUvsToAtlasSlot(geometry, material);
    return geometry;
  }
  try {
    return createWallAtlasGeometry(geometry, slot, { uvSpace, scale });
  } finally {
    // The helper owns new renderer buffers; this temporary source was never uploaded.
    geometry.dispose();
  }
}

function instanceScaleGroups(count: number, transforms?: Float32Array): Array<{ scale: [number, number, number]; indices: number[] }> {
  const groups = new Map<string, { scale: [number, number, number]; indices: number[] }>();
  for (let index = 0; index < count; index += 1) {
    const offset = index * 16;
    const scale: [number, number, number] = transforms ? [
      Math.hypot(transforms[offset], transforms[offset + 1], transforms[offset + 2]),
      Math.hypot(transforms[offset + 4], transforms[offset + 5], transforms[offset + 6]),
      Math.hypot(transforms[offset + 8], transforms[offset + 9], transforms[offset + 10])
    ] : [1, 1, 1];
    if (!scale.every(Number.isFinite)) throw new Error("Wall instance scales must be finite.");
    const key = scale.join(",");
    const group = groups.get(key) ?? { scale, indices: [] };
    group.indices.push(index);
    groups.set(key, group);
  }
  return groups.size ? [...groups.values()] : [{ scale: [1, 1, 1], indices: [] }];
}

function assignInstanceMatrices(object: InstancedMesh<BufferGeometry, MeshStandardMaterial>, transforms: Float32Array, sourceIndices?: number[]): void {
  const matrix = new Matrix4();

  for (let index = 0; index < object.count; index += 1) {
    matrix.fromArray(transforms, (sourceIndices?.[index] ?? index) * 16);
    object.setMatrixAt(index, matrix);
  }

  object.instanceMatrix.needsUpdate = true;
}

function attachSemanticLookup(
  runtime: BuildingSceneRuntime,
  ir: RuntimeBuildingIR,
  object: BuildingRenderable,
  batchId: string,
  sourceIndices?: number[],
  representative = true
): void {
  const semanticEntries = ir.semanticIndex.filter((entry) => entry.batchId === batchId &&
    (!sourceIndices || (entry.elementIndex === undefined ? representative : sourceIndices.includes(entry.elementIndex))));
  object.userData.semanticPaths = semanticEntries.map((entry) => entry.semanticPath);

  for (const entry of semanticEntries) {
    runtime.semanticLookup.set(entry.semanticPath, {
      semanticPath: entry.semanticPath,
      batchId,
      stage: entry.stage,
      object,
      elementIndex: entry.elementIndex,
      ...(sourceIndices && entry.elementIndex !== undefined ? { instanceIndex: sourceIndices.indexOf(entry.elementIndex) } : {})
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
    const sample = entry.sampleSemanticPath ? runtime.semanticLookup.get(entry.sampleSemanticPath) : undefined;
    const indexedSample = entry.sampleElementIndex === undefined ? undefined :
      [...runtime.semanticLookup.values()].find((lookup) => lookup.batchId === entry.batchId && lookup.elementIndex === entry.sampleElementIndex);
    const object = (sample?.batchId === entry.batchId ? sample.object : indexedSample?.object) ?? runtime.objectsByBatchId.get(entry.batchId);
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
    surfaceRuntime: input.surfaceRuntime,
    metrics: {
      meshCount: input.ir.meshBatches.length,
      instanceBatchCount: input.ir.instanceBatches.length,
      instanceCount: input.ir.metrics.instanceCount,
      triangleCount: input.ir.metrics.triangleCount
    },
    disposed: false
  };

  try {
    const fabricMeshes = input.ir.meshBatches.filter(batch => batch.materialSlotId === CONSTRUCTION_AWNING_FABRIC_SLOT);
    if (input.ir.instanceBatches.some(batch => batch.materialSlotId === CONSTRUCTION_AWNING_FABRIC_SLOT)) throw new Error("Supplemental awning fabric currently supports mesh batches only.");
    if (input.ir.meshBatches.some(batch => ["awning.canopy", "awning.valance"].includes(batch.role) && batch.materialSlotId !== CONSTRUCTION_AWNING_FABRIC_SLOT)) throw new Error("Awning surfaces require the supplemental fabric slot.");
    if (fabricMeshes.length && (!input.awningFabricRuntime || input.surfaceRuntime)) throw new Error("Awning fabric needs its supplemental material and cannot yet use surface composition.");
    if (fabricMeshes.some(batch => {
      const entries = input.ir.semanticIndex.filter(entry => entry.batchId === batch.batchId), entry = entries[0];
      return !["awning.canopy", "awning.valance"].includes(batch.role) || entries.length !== 1 || entry.elementIndex !== undefined || entry.stage !== "openings" || !entry.semanticPath.startsWith(`building/${input.ir.familyId}/`) || input.ir.semanticIndex.filter(other => other.semanticPath === entry.semanticPath).length !== 1 || [...input.ir.meshBatches, ...input.ir.instanceBatches].filter(other => other.batchId === batch.batchId).length !== 1;
    })) throw new Error("Awning fabric batches require one matching semantic opening address.");
    if (fabricMeshes.length) runtime.awningFabricLease = input.awningFabricRuntime!.acquire();
    runtime.surfaceLease = input.surfaceRuntime?.acquire(input.ir, input.materialRegistry);
    for (const batch of input.ir.meshBatches) {
      const stage = stageForBatch(input.ir, batch.batchId);
      const materialSlotId = batch.materialSlotId ?? "utility.mask";
      const material = materialSlotId === CONSTRUCTION_AWNING_FABRIC_SLOT ? runtime.awningFabricLease!.material : runtime.surfaceLease?.getMaterial(batch.batchId) ?? input.materialRegistry.getMaterial(materialSlotId);
      const geometry = adaptGeometry(createMeshGeometry(batch), material, "meters");
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
      const prototype = input.compiledInstanceGeometry?.get(batch.recipeId);
      const recipe = prototype ? undefined : recipeById(input.catalog, batch.recipeId);
      const stage = stageForBatch(input.ir, batch.batchId);
      const material = input.materialRegistry.getMaterial(batch.materialSlotId);
      const wall = wallSamplingSlot(material);
      const scaleGroups = wall ? instanceScaleGroups(batch.count, batch.transforms) : [{
        scale: [1, 1, 1] as [number, number, number], indices: Array.from({ length: batch.count }, (_, index) => index)
      }];
      const groups = scaleGroups.flatMap(group => {
        const byMaterial = new Map<MeshStandardMaterial, { scale: [number, number, number]; indices: number[]; material: MeshStandardMaterial }>();
        for (const index of group.indices) {
          const effective = runtime.surfaceLease?.getMaterial(batch.batchId, index) ?? material;
          const partition = byMaterial.get(effective) ?? { scale: group.scale, indices: [], material: effective };
          partition.indices.push(index); byMaterial.set(effective, partition);
        }
        return byMaterial.size ? [...byMaterial.values()] : [{ ...group, material }];
      });
      for (const [groupIndex, group] of groups.entries()) {
        const sourceGeometry = prototype ? createMeshGeometry(prototype) : createRecipeGeometry(recipe!);
        const uvSpace = prototype || sourceGeometry.userData.openingAssembly || sourceGeometry.userData.pilasterAssembly ? "meters" : "normalized";
        const geometry = adaptGeometry(sourceGeometry, group.material, uvSpace, group.scale);
        const mesh = new InstancedMesh(
          geometry,
          group.material,
          group.indices.length
        ) as BuildingRenderable;
        mesh.name = groupIndex === 0 ? batch.batchId : `${batch.batchId}.scale-${groupIndex}`;
        mesh.userData = {
          batchId: batch.batchId,
          recipeId: batch.recipeId,
          role: prototype?.role ?? recipe!.role,
          // Glazing receives the frame/reveal shadows; its opaque display proxy
          // must not self-shadow like a solid architectural member.
          ...(prototype ? { opaqueShadowCaster: prototype.role !== "glass" } : {}),
          stage,
          materialSlotId: batch.materialSlotId,
          rendererBoundary: "building-family"
        };
        if (batch.transforms) {
          assignInstanceMatrices(mesh as InstancedMesh<BufferGeometry, MeshStandardMaterial>, batch.transforms, group.indices);
        }
        stageGroups.get(stage)!.add(mesh);
        runtime.renderables.push(mesh);
        // Keep the existing representative-mesh API; precise semantics point to their actual chunk.
        if (groupIndex === 0) runtime.objectsByBatchId.set(batch.batchId, mesh);
        attachSemanticLookup(runtime, input.ir, mesh, batch.batchId, wall || runtime.surfaceLease ? group.indices : undefined, groupIndex === 0);
      }
    }

    runtime.metrics.instanceBatchCount = runtime.renderables.filter((object) => object.isInstancedMesh).length;
    runtime.metrics.renderedTriangleCount = runtime.renderables.reduce((total, object) =>
      total + (object.geometry.index?.count ?? object.geometry.getAttribute("position")?.count ?? 0) / 3 * (object.isInstancedMesh ? object.count ?? 0 : 1), 0);
    linkGalleryObjects(runtime, input.componentGallery);
    return runtime;
  } catch (error) {
    disposeBuildingSceneResources(runtime, { disposeMaterials: false });
    throw error;
  }
}

export function disposeBuildingSceneRuntime(runtime: BuildingSceneRuntime): DisposeBuildingSceneRuntimeResult {
  return disposeBuildingSceneResources(runtime, { disposeMaterials: true });
}
