import { Box3, Matrix4, Vector3, type Intersection, type Object3D } from "three";
import type { BuildingRenderable, BuildingSceneRuntime, BuildingSemanticLookupEntry } from "./buildingSceneAdapter";

export interface ConstructionFrameSelection {
  semanticPath: string; object: BuildingRenderable; instanceIndex?: number; elementIndex?: number; bounds: Box3;
}
function visible(object: Object3D): boolean {
  for (let parent: Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return false;
  const material = (object as BuildingRenderable).material;
  return Array.isArray(material) ? material.some(value => value.visible) : material?.visible !== false;
}
function owned(runtime: BuildingSceneRuntime, lookup: BuildingSemanticLookupEntry): boolean {
  if (runtime.disposed || !runtime.renderables.includes(lookup.object) || !visible(lookup.object)) return false;
  let parent: Object3D | null = lookup.object;
  while (parent && parent !== runtime.root) parent = parent.parent;
  if (!parent) return false;
  const index = lookup.instanceIndex ?? lookup.elementIndex;
  return lookup.object.isInstancedMesh ? index !== undefined && Number.isInteger(index) && index >= 0 &&
    index < (lookup.object.count ?? 0) && index < (lookup.object.instanceMatrix?.count ?? 0) : lookup.instanceIndex === undefined;
}
/** A glass hit selects its exact sibling frame, including surface-partitioned native chunks. */
export function resolveConstructionFrameFromPath(runtime: BuildingSceneRuntime, path: string): ConstructionFrameSelection | undefined {
  const source = runtime.semanticLookup.get(path);
  if (!source || source.semanticPath !== path || !owned(runtime, source)) return undefined;
  const role = source.object.userData.role;
  if (role !== "frame" && role !== "glass") return undefined;
  const framePath = role === "glass" && path.endsWith("/glass") ? path.slice(0, -6) + "/frame" : path;
  const frame = runtime.semanticLookup.get(framePath);
  if (!frame || !framePath.endsWith("/frame") || frame.object.userData.role !== "frame" || !owned(runtime, frame)) return undefined;
  const object = frame.object, nativeIndex = object.isInstancedMesh ? frame.instanceIndex ?? frame.elementIndex : undefined;
  const transform = new Matrix4();
  if (nativeIndex !== undefined && object.isInstancedMesh) (object as import("three").InstancedMesh).getMatrixAt(nativeIndex, transform);
  object.updateWorldMatrix(true, false); transform.premultiply(object.matrixWorld);
  const positions = object.geometry.getAttribute("position");
  if (!positions?.count || !transform.elements.every(Number.isFinite)) return undefined;
  const bounds = new Box3(), vertex = new Vector3();
  for (let index = 0; index < positions.count; index++) bounds.expandByPoint(vertex.fromBufferAttribute(positions, index).applyMatrix4(transform));
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return undefined;
  return { semanticPath: framePath, object, instanceIndex: nativeIndex, elementIndex: frame.elementIndex, bounds };
}
/** Nearest unsupported/ambiguous visible geometry blocks selection; never pick through walls. */
export function resolveConstructionFrameFromIntersections(runtime: BuildingSceneRuntime, hits: readonly Intersection<Object3D>[]): ConstructionFrameSelection | undefined {
  const visibleHits = hits.filter(hit => Number.isFinite(hit.distance) && hit.distance >= 0 && visible(hit.object));
  const nearest = Math.min(...visibleHits.map(hit => hit.distance));
  let selected: ConstructionFrameSelection | undefined;
  for (const hit of visibleHits.filter(hit => hit.distance === nearest)) {
    const matches = [...runtime.semanticLookup.values()].filter(lookup => lookup.object === hit.object &&
      (lookup.object.isInstancedMesh ? (lookup.instanceIndex ?? lookup.elementIndex) === hit.instanceId && hit.instanceId !== undefined : hit.instanceId === undefined));
    if (matches.length !== 1) return undefined;
    const candidate = resolveConstructionFrameFromPath(runtime, matches[0].semanticPath);
    if (!candidate || selected && candidate.semanticPath !== selected.semanticPath) return undefined;
    selected = candidate;
  }
  return selected;
}
