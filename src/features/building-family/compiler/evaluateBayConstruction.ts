import { BayConstructionGraphSchema, type BayConstructionGraph, type BayConstructionNode } from "../contracts/bayConstructionGraph";
import { RuntimeBuildingIRSchema, type MeshBatchIR, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { hashCanonicalJson } from "../core/contentHash";
import type { BuildingSurfaceComposition } from "../contracts/surfaceComposition";
import { expandBayWallPrimitives, MIN_FACADE_PIER_WIDTH_M, type FacadeBayScope } from "./facadeWallSubdivision";
import { buildBayWindowGeometry } from "./bayWindowGeometry";
import { extrudeProfileSolidAlongX } from "./profileSweepGeometry";
import { extrudeConstructionOpeningTrim } from "./constructionOpeningTrimGeometry";
import { combinePrimitiveGeometry, emptyBounds, expandBounds,
  type Bounds3, type PrimitiveGeometry } from "./primitiveGeometry";

export interface BayConstructionMaterials { wall: string; frame: string; glass: string; trim: string }
export const DEFAULT_BAY_MATERIALS: BayConstructionMaterials = {
  wall: "wall.primary", frame: "frame.primary", glass: "glass.primary", trim: "trim.horizontal.primary"
};
export interface BayConstructionTrace {
  nodeId: string;
  type: BayConstructionNode["type"];
  output: "scope" | "geometry" | "footprint";
  openingCount: number;
  meshCount: number;
  bounds: Bounds3;
  scopeCount?: number;
  scopeNames?: string[];
}
export interface BayConstructionResult {
  graph: BayConstructionGraph;
  ir: RuntimeBuildingIR;
  trace: BayConstructionTrace[];
  /** C2 compiler-owned recipe geometry, transferred with the versioned result. */
  prototypes?: MeshBatchIR[];
  previewNodeId?: string;
  surfaceComposition?: BuildingSurfaceComposition;
}
type ScopeValue = { kind: "scope"; scope: FacadeBayScope };
type GeometryValue = { kind: "geometry"; parts: Part[] };
type Value = ScopeValue | GeometryValue;
interface Part { batch: MeshBatchIR; bounds: Bounds3; semanticPath: string; stage: "facade" | "openings" | "trim"; scopeId: string }

// The existing workbench views front facades from -Z. Reflection also reverses winding.
function frontBounds(bounds: Bounds3): Bounds3 {
  return { min: [bounds.min[0], bounds.min[1], -bounds.max[2]], max: [bounds.max[0], bounds.max[1], -bounds.min[2]] };
}
function frontGeometry(geometry: PrimitiveGeometry): PrimitiveGeometry {
  const indices = [...geometry.indices];
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return { ...geometry, indices, bounds: frontBounds(geometry.bounds),
    positions: geometry.positions.map((value, index) => index % 3 === 2 ? -value : value),
    normals: geometry.normals.map((value, index) => index % 3 === 2 ? -value : value) };
}

function scopeBounds(scope: FacadeBayScope): Bounds3 {
  return { min: [...scope.originM], max: scope.originM.map((value, axis) => value + scope.sizeM[axis]) as [number, number, number] };
}

/** Connected values, not the old fixed BuildingFamilySpec orchestration, own geometry. */
export async function evaluateBayConstruction(
  input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS, options: { metricTimberUvs?: boolean; windowLayout?: 0 | 1 | 2; closedOpeningTrim?: boolean } = {}
): Promise<BayConstructionResult> {
  // Parsing and the owned clone happen synchronously before hashing yields.
  const graph = structuredClone(BayConstructionGraphSchema.parse(input));
  if (graph.schemaVersion !== "0.1.0") throw new Error("Use the facade evaluator for construction graph 0.2.0.");
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const values = new Map<string, Value>(), trace: BayConstructionTrace[] = [];
  const makePart = (nodeId: string, role: string, slot: string, primitives: PrimitiveGeometry[], stage: Part["stage"]): Part => {
    const geometry = combinePrimitiveGeometry(primitives.map(primitive=>{
      const front=frontGeometry(primitive);
      if(options.metricTimberUvs && role === "trim") for(let i=0;i<front.positions.length/3;i++) {
        const p=i*3,nx=Math.abs(front.normals[p]),ny=Math.abs(front.normals[p+1]);
        front.uvs[i*2]=nx>.9?front.positions[p+2]-front.bounds.min[2]:front.positions[p]-front.bounds.min[0];
        front.uvs[i*2+1]=ny>.9?front.positions[p+2]-front.bounds.min[2]:front.positions[p+1]-front.bounds.min[1];
      }
      return front;
    }));
    if (role === "wall") {
      // One metre-space phase across every pier, head and sill panel.
      for (let vertex = 0; vertex < geometry.positions.length / 3; vertex++) {
        const i = vertex * 3, x = geometry.positions[i], y = geometry.positions[i + 1], z = geometry.positions[i + 2];
        const nx = Math.abs(geometry.normals[i]), ny = Math.abs(geometry.normals[i + 1]);
        geometry.uvs[vertex * 2] = nx > 0.9 ? z : x;
        geometry.uvs[vertex * 2 + 1] = ny > 0.9 ? z : y;
      }
    }
    const batchId = `construction.${nodeId}.${role}`;
    return { batch: { batchId, role, materialSlotId: slot, positions: geometry.positions,
      normals: geometry.normals, uvs: geometry.uvs, indices: geometry.indices },
      bounds: geometry.bounds, semanticPath: `building/${graph.documentId}/node/${nodeId}/${role}`, stage,
      scopeId: (nodes.get(nodeId) as Extract<BayConstructionNode, { type: "EmitWall" | "AssembleWindow" }>).input.nodeId };
  };
  const readScope = (nodeId: string): FacadeBayScope => {
    const value = evaluate(nodeId);
    if (value.kind !== "scope") throw new Error(`Construction node ${nodeId} does not produce a facade scope.`);
    return structuredClone(value.scope);
  };
  const evaluate = (nodeId: string): Value => {
    const cached = values.get(nodeId);
    if (cached) return cached;
    const node = nodes.get(nodeId)!;
    let value: Value;
    switch (node.type) {
      case "FacadeScope": {
        const { widthM, heightM, wallDepthM } = node.parameters;
        value = { kind: "scope", scope: { facade: "front", floorIndex: 0, bayIndex: 0, zone: "body",
          originM: [-widthM / 2, 0, -wallDepthM], sizeM: [widthM, heightM, wallDepthM] } };
        break;
      }
      case "PlaceOpening": {
        const scope = readScope(node.input.nodeId);
        const { widthM, heightM, sillM } = node.parameters;
        if (scope.opening) throw new Error(`Node ${node.id}: this bay already contains an opening.`);
        if (widthM > scope.sizeM[0] - MIN_FACADE_PIER_WIDTH_M * 2 ||
            sillM + heightM > scope.sizeM[1] - 0.08) {
          throw new Error(`Node ${node.id}: opening exceeds the facade; retain at least 80 mm of masonry at each edge.`);
        }
        scope.opening = { kind: "window", widthM, heightM, centerAlongM: 0, centerYM: sillM + heightM / 2 };
        value = { kind: "scope", scope };
        break;
      }
      case "EmitWall": {
        const scope = readScope(node.input.nodeId);
        value = { kind: "geometry", parts: [makePart(node.id, "wall", materials.wall, expandBayWallPrimitives(scope), "facade")] };
        break;
      }
      case "AssembleWindow": {
        const scope = readScope(node.input.nodeId), opening = scope.opening;
        if (!opening) throw new Error(`Node ${node.id}: connect a scope containing an opening.`);
        const { frameWidthM, recessM, sillProjectionM } = node.parameters;
        if (frameWidthM * 4 >= Math.min(opening.widthM, opening.heightM) || recessM + 0.08 >= scope.sizeM[2]) {
          throw new Error(`Node ${node.id}: frame or recess does not fit the opening and wall depth.`);
        }
        const { frame, glass } = buildBayWindowGeometry(opening.widthM, opening.heightM, frameWidthM, recessM, opening.centerYM, options.metricTimberUvs, options.windowLayout ?? 0);
        const extrudeTrim = options.closedOpeningTrim ? extrudeConstructionOpeningTrim : extrudeProfileSolidAlongX;
        const sill = extrudeTrim({
          profile: { id: "construction.sill", label: "Sloped stone sill", points: [
            { u: 0, d: 0.015 }, { u: 0.025, d: sillProjectionM * 0.8 },
            { u: 0.045, d: sillProjectionM }, { u: 0.1, d: sillProjectionM },
            { u: 0.14, d: 0.025 }
          ] }, center: [0, opening.centerYM - opening.heightM / 2 - 0.035, 0],
          runLengthM: opening.widthM + 0.2
        });
        const lintel = extrudeTrim({
          profile: { id: "construction.lintel", label: "Chamfered stone lintel", points: [
            { u: 0, d: 0.025 }, { u: 0.012, d: 0.055 }, { u: 0.17, d: 0.055 }, { u: 0.185, d: 0.025 }
          ] }, center: [0, opening.centerYM + opening.heightM / 2 + 0.09, 0],
          runLengthM: opening.widthM + 0.2
        });
        value = { kind: "geometry", parts: [
          makePart(node.id, "frame", materials.frame, frame, "openings"),
          makePart(node.id, "glass", materials.glass, glass, "openings"),
          makePart(node.id, "trim", materials.trim, [sill, lintel], "trim")
        ] };
        break;
      }
      case "Footprint": case "Storeys": case "PlaceDoor": case "AssembleDoor": case "BuildingRoof": case "JoinGeometry": case "SetSurface": throw new Error("Surface operators require the construction program evaluator.");
      case "Output": {
        const parts = node.inputs.flatMap(link => {
          const upstream = evaluate(link.nodeId);
          if (upstream.kind !== "geometry") throw new Error("Output requires geometry contributions.");
          return upstream.parts;
        });
        if (new Set(parts.map(part => part.batch.batchId)).size !== parts.length) throw new Error("Output repeats geometry contributions.");
        const wallScopes = new Set(parts.filter(part => part.batch.role === "wall").map(part => part.scopeId));
        const windows = parts.filter(part => part.batch.role === "frame");
        if (wallScopes.size && windows.some(part => !wallScopes.has(part.scopeId))) {
          throw new Error("Connect Wall and Window assembly to the same opening layout, or preview the window by itself.");
        }
        if (new Set(windows.map(part => part.scopeId)).size !== windows.length) {
          throw new Error("Output places more than one window assembly into the same opening.");
        }
        value = { kind: "geometry", parts };
        break;
      }
      default: throw new Error("Unsupported operator in single-bay construction.");
    }
    values.set(node.id, value);
    trace.push({ nodeId: node.id, type: node.type, output: value.kind,
      openingCount: value.kind === "scope" && value.scope.opening ? 1 : 0,
      meshCount: value.kind === "geometry" ? value.parts.length : 0,
      bounds: value.kind === "scope" ? frontBounds(scopeBounds(value.scope)) :
        value.parts.reduce((bounds, part) => expandBounds(bounds, part.bounds), emptyBounds()) });
    return value;
  };
  const output = evaluate(graph.outputNodeId);
  if (output.kind !== "geometry" || output.parts.length === 0) throw new Error("Construction output is empty.");
  const ir = RuntimeBuildingIRSchema.parse({
    schemaVersion: "0.1.0", buildingId: graph.documentId, familyId: graph.documentId,
    sourceGraphHash: await hashCanonicalJson(graph),
    bounds: output.parts.reduce((bounds, part) => expandBounds(bounds, part.bounds), emptyBounds()),
    meshBatches: output.parts.map(part => part.batch), instanceBatches: [],
    semanticIndex: output.parts.map(part => ({ semanticPath: part.semanticPath, batchId: part.batch.batchId, stage: part.stage })),
    metrics: { vertexCount: output.parts.reduce((sum, part) => sum + part.batch.positions!.length / 3, 0),
      triangleCount: output.parts.reduce((sum, part) => sum + part.batch.indices!.length / 3, 0), instanceCount: 0 }
  });
  return { graph, ir, trace };
}

