import { resolveConstructionFacadePiers } from "../core/constructionFacadePier";
import { buildConstructionFacadePierGeometry } from "./constructionFacadePierGeometry";
import { ConstructionFacadePierStudyRequestSchema, type ConstructionFacadePierStudyRequest } from "../contracts/constructionFacadePierStudy";
import { ConstructionStorefrontSignStudyRequestSchema, type ConstructionStorefrontSignStudyRequest } from "../contracts/constructionStorefrontSignStudy";
import { resolveConstructionStorefrontSign } from "../core/constructionStorefrontSign";
import { buildConstructionStorefrontSignGeometry } from "./constructionStorefrontSignGeometry";
import { resolveConstructionAwningSupports } from "../core/constructionAwningSupports";
import { buildConstructionAwningSupportGeometry } from "./constructionAwningSupportGeometry";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { resolveConstructionOpeningWidth } from "../core/constructionOpeningEdit";
import type { ConstructionStorefrontPlan } from "../contracts/constructionStorefront";
import { resolveConstructionCorniceDetail } from "../core/constructionCorniceDetail";
import { buildConstructionCorniceGeometry } from "./constructionCorniceGeometry";
import { buildConstructionStorefrontGeometry, buildConstructionDividedStorefrontGeometry } from "./constructionStorefrontGeometry";
import { resolveConstructionStorefrontDivision } from "../core/constructionStorefrontDivision";
import { BayConstructionGraphSchema, type BayConstructionGraph, type BayConstructionNode } from "../contracts/bayConstructionGraph";
import { RuntimeBuildingIRSchema, type MeshBatchIR, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { hashCanonicalJson } from "../core/contentHash";
import { buildBoxPrimitive, combinePrimitiveGeometry, emptyBounds, expandBounds, type Bounds3, type PrimitiveGeometry } from "./primitiveGeometry";
import { resolveConstructionParapetSilhouette } from "../core/constructionParapetSilhouette";
import { buildSteppedParapetSolid, buildSteppedParapetCoping } from "./constructionSteppedParapetGeometry";
import { expandBayWallPrimitives, MIN_FACADE_PIER_WIDTH_M, type FacadeBayScope } from "./facadeWallSubdivision";
import { extrudeProfileSolidAlongX } from "./profileSweepGeometry";
import { evaluateBayConstruction, DEFAULT_BAY_MATERIALS, type BayConstructionMaterials, type BayConstructionResult, type BayConstructionTrace } from "./evaluateBayConstruction";
import { buildBayDoorGeometry } from "./bayWindowGeometry";
import { constructionFacePose, constructionFacadeSolid, constructionProfileRing, poseMatrix, posedBounds, posedPoint, type ConstructionBuilding, type ConstructionFacePose, type ConstructionFootprint } from "./buildingShellGeometry";
import { constructionSurfaceAt } from "./constructionSurfaceProgram";
import { resolveConstructionRoundHead } from "../core/constructionRoundHead";
import { buildConstructionRoundHeadSash, buildConstructionRoundHeadWindow } from "./constructionRoundHeadGeometry";
import { buildConstructionSillSeat } from "./constructionOpeningTrimGeometry";
import { readConstructionGroupedBay, resolveConstructionGroupedBay } from "../core/constructionGroupedBay";
import { canonicalJson } from "../core/canonicalJson";
import { resolveConstructionAwning } from "../core/constructionAwning";
import { buildConstructionAwningGeometry } from "./constructionAwningGeometry";
import { CONSTRUCTION_AWNING_FABRIC_SLOT } from "../contracts/constructionAwningFabric";
import { ConstructionSignAwningBuildingStudyRequestSchema, type ConstructionSignAwningBuildingStudyRequest } from "../contracts/constructionSignAwningBuildingStudy";
import { resolveConstructionSignAwningArrangement } from "../core/constructionSignAwningArrangement";
import { resolveConstructionSignAwningSupports } from "../core/constructionSignAwningSupports";
import { buildConstructionSignAwningArrangementGeometry } from "./constructionSignAwningArrangementGeometry";
import { buildConstructionSignAwningSupportGeometry } from "./constructionSignAwningSupportGeometry";

type Cell = { localOpeningWidth?: boolean; groupedOpening?: boolean; storefrontPlan?: ConstructionStorefrontPlan; root: string; key: string; floorSplit: boolean; baySplit: boolean; scope: FacadeBayScope; face?: "front" | "right" | "rear" | "left"; pose?: ConstructionFacePose; building?: ConstructionBuilding };
type Stage = "facade" | "openings" | "trim" | "roof";
type Part = { id: string; stage: Stage; bounds: Bounds3; mesh?: MeshBatchIR; prototype?: MeshBatchIR;
  translation?: [number, number, number]; pose?: ConstructionFacePose; wallCells?: Cell[]; cell?: Cell; role: string; nodeId: string };
type Value = { kind: "footprint"; footprint: ConstructionFootprint } | { kind: "scope"; cells: Cell[] } | { kind: "geometry"; parts: Part[] };
const boundsOf = (scope: FacadeBayScope): Bounds3 => ({ min: [scope.originM[0], scope.originM[1], 0],
  max: [scope.originM[0] + scope.sizeM[0], scope.originM[1] + scope.sizeM[1], scope.sizeM[2]] });
const keyOf = (cell: Cell) => `${cell.root}/floor/${cell.scope.floorIndex}/bay/${cell.scope.bayIndex}`;
const layoutOf = (cell: Cell) => JSON.stringify([cell.scope.originM, cell.scope.sizeM, cell.scope.opening]);
const union = (bounds: Bounds3[]) => bounds.reduce(expandBounds, emptyBounds());
const shifted = (box: Bounds3, offset: [number, number, number]): Bounds3 => ({
  min: box.min.map((v, i) => v + offset[i]) as [number, number, number], max: box.max.map((v, i) => v + offset[i]) as [number, number, number] });
function batchBounds(batch: MeshBatchIR): Bounds3 {
  let box = emptyBounds();
  for (let i = 0; i < batch.positions!.length; i += 3) {
    const point = [...batch.positions!.slice(i, i + 3)] as [number, number, number];
    box = expandBounds(box, { min: point, max: point });
  }
  return box;
}
function front(primitive: PrimitiveGeometry): PrimitiveGeometry {
  const indices = [...primitive.indices];
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return { ...primitive, indices, positions: primitive.positions.map((v, i) => i % 3 === 2 ? -v : v),
    normals: primitive.normals.map((v, i) => i % 3 === 2 ? -v : v),
    bounds: { min: [primitive.bounds.min[0], primitive.bounds.min[1], -primitive.bounds.max[2]],
      max: [primitive.bounds.max[0], primitive.bounds.max[1], -primitive.bounds.min[2]] } };
}

/** Scope collections feed the same wall subtractor and accepted C1 window geometry. */
export async function evaluateFacadeConstruction(input: unknown, materials: BayConstructionMaterials = DEFAULT_BAY_MATERIALS,
  previewNodeId?: string, groupedInput: readonly unknown[] = [], pierStudyInput?: ConstructionFacadePierStudyRequest, signStudyInput?: ConstructionStorefrontSignStudyRequest,
  signAwningStudyInput?: ConstructionSignAwningBuildingStudyRequest): Promise<BayConstructionResult> {
  const graph = structuredClone(BayConstructionGraphSchema.parse(input));
  const explicitSignAwningStudy = signAwningStudyInput && ConstructionSignAwningBuildingStudyRequestSchema.parse(signAwningStudyInput);
  const signAwningStudy = explicitSignAwningStudy ?? (graph.schemaVersion === "0.17.0" && graph.storefrontSign && graph.signAwningGapM !== undefined
    ? { graph, ...graph.storefrontSign, gapM: graph.signAwningGapM } : undefined);
  if (explicitSignAwningStudy && (signStudyInput || graph.storefrontSign || pierStudyInput || previewNodeId || groupedInput.length || canonicalJson(explicitSignAwningStudy.graph) !== canonicalJson(graph)))
    throw new Error("Sign and awning study requires its complete matching graph and no other experimental study.");
  if (signAwningStudy && !graph.awnings?.some(awning => awning.bayIndex === signAwningStudy.bayIndex))
    throw new Error("Sign and awning study requires an existing awning in its storefront bay.");
  if (explicitSignAwningStudy) signStudyInput = ConstructionStorefrontSignStudyRequestSchema.parse({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-study-request", graph,
    bayIndex: explicitSignAwningStudy.bayIndex, heightM: explicitSignAwningStudy.heightM, projectionM: explicitSignAwningStudy.projectionM, frameWidthM: explicitSignAwningStudy.frameWidthM });
  if (signStudyInput && graph.storefrontSign) throw new Error("Use either the graph sign directive or an experimental sign study.");
  const signStudy = signStudyInput === undefined ? graph.storefrontSign ? ConstructionStorefrontSignStudyRequestSchema.parse({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-study-request", graph, ...graph.storefrontSign }) : undefined : ConstructionStorefrontSignStudyRequestSchema.parse(signStudyInput);
  if (signStudy && pierStudyInput) throw new Error("Use graph-authored piers instead of combining two experimental studies.");
  if (signStudy && (previewNodeId || groupedInput.length || canonicalJson(signStudy.graph) !== canonicalJson(graph)))
    throw new Error("Storefront sign study requires its complete matching graph and no experimental grouping request.");
  if (pierStudyInput && graph.facadePiers) throw new Error("Use either the graph pier directive or an experimental pier study.");
  const pierStudy = pierStudyInput === undefined ? graph.facadePiers ? ConstructionFacadePierStudyRequestSchema.parse({ schemaVersion: "0.1.0", kind: "construction-facade-pier-study-request", graph, ...graph.facadePiers }) : undefined : ConstructionFacadePierStudyRequestSchema.parse(pierStudyInput);
  if (pierStudy && (previewNodeId || groupedInput.length || canonicalJson(pierStudy.graph) !== canonicalJson(graph)))
    throw new Error("Facade pier study requires its complete matching graph and no experimental grouping request.");
  if (pierStudy && (graph.nodes.filter(node => node.type === "EmitWall" && !node.bypassed).length !== 1 || graph.nodes.filter(node => node.type === "SplitBays" && !node.bypassed).length !== 1 ||
      graph.nodes.filter(node => node.type === "Storeys").length !== 1 || graph.nodes.filter(node => node.type === "ProfileTrim" && !node.bypassed).length > 1 ||
      graph.nodes.filter(node => node.type === "BuildingRoof" && !node.bypassed).length > 1))
    throw new Error("Facade pier study requires one active wall, storey system and bay split, and at most one band and roof.");
  let pierCount = 0;
  const grouped = groupedInput.map(readConstructionGroupedBay);
  if (grouped.length && graph.upperBayGroups?.length) throw new Error("Use the graph grouping or an explicit experimental request, not both.");
  const groupedByScope = new Map(grouped.map(plan => [plan.source.scope.id, plan]));
  if (groupedByScope.size !== grouped.length) throw new Error("Grouped bay scope IDs must be unique.");
  const usedGroups = new Set<string>();
  if ((grouped.length || graph.upperBayGroups?.length) && (graph.nodes.filter(node => node.type === "PlaceOpening" && !node.bypassed).length !== 1 ||
      graph.nodes.filter(node => node.type === "AssembleWindow" && !node.bypassed).length !== 1))
    throw new Error("Grouped bays require one active opening and window assembly.");
  if (!["0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0", "0.16.0", "0.17.0"].includes(graph.schemaVersion)) throw new Error("Facade construction requires a supported graph version.");
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (previewNodeId && !nodes.has(previewNodeId)) throw new Error("The preview node is missing.");
  const values = new Map<string, Promise<Value>>(), trace: BayConstructionTrace[] = [];
  const templates = new Map<string, Promise<{ hash: string; batches: MeshBatchIR[] }>>();
  const editedOpenings = new Map<string, { key: string; layout: string }>();
  const storefrontTargets = new Map<string, string>();
  function roundPlan(cell: Cell) {
    const opening = cell.scope.opening;
    const windows = graph.nodes.filter(node => node.type === "AssembleWindow" && !node.bypassed);
    if (!opening?.roundHead || cell.face !== "front" || windows.length !== 1 || windows[0].type !== "AssembleWindow") throw new Error("Round-headed openings require one active front window assembly.");
    const p = windows[0].parameters, scope = cell.scope;
    if (p.recessM + 0.08 > scope.sizeM[2]) throw new Error("Round-headed frame depth exceeds its wall.");
    return resolveConstructionRoundHead({ schemaVersion: "0.1.0", kind: "construction-round-head-request",
      scope: { id: cell.key, face: "front", floorIndex: scope.floorIndex, bayIndex: scope.bayIndex,
        originM: cell.groupedOpening ? [opening.centerAlongM - scope.sizeM[0] / 2, scope.originM[1], scope.originM[2]] : scope.originM, sizeM: scope.sizeM },
      parameters: { widthM: opening.widthM, heightM: opening.heightM, sillM: opening.centerYM - scope.originM[1] - opening.heightM / 2,
        frameWidthM: p.frameWidthM, revealDepthM: p.recessM, masonryMarginM: 0.08 } });
  }
  function makeMesh(node: BayConstructionNode, cell: Cell, role: string, primitives: PrimitiveGeometry[], stage: Stage, slot: string): Part {
    const geometry = combinePrimitiveGeometry(primitives.map(front));
    if (role === "wall") for (let i = 0; i < geometry.positions.length / 3; i++) {
      const p = i * 3, x = geometry.positions[p], y = geometry.positions[p + 1], z = geometry.positions[p + 2];
      geometry.uvs[i * 2] = Math.abs(geometry.normals[p]) > 0.9 ? z : x;
      if (cell.pose && Math.abs(geometry.normals[p + 2]) > .9) geometry.uvs[i * 2] += cell.pose.uvOffsetM;
      geometry.uvs[i * 2 + 1] = Math.abs(geometry.normals[p + 1]) > 0.9 ? z : y;
    }
    if (cell.pose) {
      for (let i = 0; i < geometry.positions.length; i += 3) {
        geometry.positions.set(posedPoint([...geometry.positions.slice(i,i+3)] as [number,number,number],cell.pose),i);
        geometry.normals.set(posedPoint([...geometry.normals.slice(i,i+3)] as [number,number,number],cell.pose,true),i);
      }
      geometry.bounds = posedBounds(geometry.bounds,cell.pose);
    }
    const id = `building/${graph.documentId}/node/${node.id}/${cell.key}/${role}`;
    return { id, nodeId: node.id, cell, role, stage, bounds: geometry.bounds,
      mesh: { batchId: id, role, materialSlotId: slot, positions: geometry.positions, normals: geometry.normals, uvs: geometry.uvs, indices: geometry.indices } };
  }
  function globalMesh(node: BayConstructionNode, role: string, primitives: PrimitiveGeometry[], stage: Stage, slot: string): Part {
    const cell: Cell = { root: "building", key: "building", floorSplit: false, baySplit: false,
      scope: { facade: "front", floorIndex: 0, bayIndex: 0, zone: "body", originM: [0,0,0], sizeM: [1,1,1] } };
    return makeMesh(node,cell,role,primitives,stage,slot);
  }
  function awningParts(node: BayConstructionNode, cell: Cell): Part[] {
    const directive = graph.awnings?.find(awning => awning.bayIndex === cell.scope.bayIndex);
    if (!directive || !cell.storefrontPlan || cell.face !== "front" || cell.scope.floorIndex !== 0) return [];
    const plan = resolveConstructionAwning({ schemaVersion: "0.1.0", kind: "construction-awning-request", storefront: cell.storefrontPlan,
      projectionM: directive.projectionM, dropM: directive.dropM, valanceHeightM: directive.valanceHeightM });
    if (signAwningStudy && directive.bayIndex === signAwningStudy.bayIndex) {
      const arrangement = resolveConstructionSignAwningArrangement({ schemaVersion: "0.1.0", kind: "construction-sign-awning-arrangement-request", storefront: cell.storefrontPlan,
        sign: { heightM: signAwningStudy.heightM, projectionM: signAwningStudy.projectionM, frameWidthM: signAwningStudy.frameWidthM },
        awning: { projectionM: directive.projectionM, dropM: directive.dropM, valanceHeightM: directive.valanceHeightM }, gapM: signAwningStudy.gapM });
      const support = graph.awningSupports?.find(item => item.bayIndex === directive.bayIndex);
      const supported = support ? buildConstructionSignAwningSupportGeometry(resolveConstructionSignAwningSupports({ schemaVersion: "0.1.0", kind: "construction-sign-awning-support-request", arrangement,
        anchorRiseM: support.anchorRiseM, thicknessM: support.thicknessM })) : undefined;
      const combined = supported ?? buildConstructionSignAwningArrangementGeometry(arrangement);
      const shift: [number, number, number] = [cell.scope.originM[0], cell.scope.originM[1], 0];
      const move = (part: PrimitiveGeometry): PrimitiveGeometry => ({ ...part, positions: part.positions.map((value, index) => value + shift[index % 3]), bounds: shifted(part.bounds, shift) });
      return [makeMesh(node, cell, "awning.canopy", [move(combined.awning.roof)], "openings", CONSTRUCTION_AWNING_FABRIC_SLOT),
        makeMesh(node, cell, "awning.valance", [move(combined.awning.valance)], "openings", CONSTRUCTION_AWNING_FABRIC_SLOT),
        ...(supported ? [makeMesh(node, cell, "awning.support", supported.rods.map(move), "openings", "ornament.primary")] : [])];
    }
    const geometry = buildConstructionAwningGeometry(plan);
    const translate = (part: PrimitiveGeometry): PrimitiveGeometry => ({ ...part,
      positions: part.positions.map((value, index) => index % 3 === 0 ? value + plan.centerAlongM : index % 3 === 1 ? value + cell.scope.originM[1] : value),
      bounds: shifted(part.bounds, [plan.centerAlongM, cell.scope.originM[1], 0]) });
    const support = graph.awningSupports?.find(item => item.bayIndex === directive.bayIndex);
    const rods = support ? buildConstructionAwningSupportGeometry(resolveConstructionAwningSupports({ schemaVersion: "0.1.0", kind: "construction-awning-support-request", awning: plan, anchorRiseM: support.anchorRiseM, thicknessM: support.thicknessM })) : [];
    return [makeMesh(node, cell, "awning.canopy", [translate(geometry.roof)], "openings", CONSTRUCTION_AWNING_FABRIC_SLOT),
      makeMesh(node, cell, "awning.valance", [translate(geometry.valance)], "openings", CONSTRUCTION_AWNING_FABRIC_SLOT),
      ...(support ? [makeMesh(node, cell, "awning.support", rods.map(translate), "openings", "ornament.primary")] : [])];
  }
  function signParts(node: BayConstructionNode, cell: Cell): Part[] {
    if (!signStudy || cell.face !== "front" || cell.scope.floorIndex !== 0 || cell.scope.bayIndex !== signStudy.bayIndex || !cell.storefrontPlan) return [];
    const plan = resolveConstructionStorefrontSign({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-request", storefront: cell.storefrontPlan,
      heightM: signStudy.heightM, projectionM: signStudy.projectionM, frameWidthM: signStudy.frameWidthM,
      awningPresent: !signAwningStudy && Boolean(graph.awnings?.some(awning => awning.bayIndex === cell.scope.bayIndex)) });
    const geometry = buildConstructionStorefrontSignGeometry(plan), shift: [number, number, number] = [cell.scope.originM[0], cell.scope.originM[1], 0];
    const translate = (part: PrimitiveGeometry): PrimitiveGeometry => ({ ...part, positions: part.positions.map((value, index) => value + shift[index % 3]), bounds: shifted(part.bounds, shift) });
    return [makeMesh(node, cell, "sign.panel", [translate(geometry.panel)], "openings", "ornament.primary"),
      makeMesh(node, cell, "sign.frame", geometry.frame.map(translate), "trim", materials.trim)];
  }
  const samePlane = (a: Cell, b: Cell) => JSON.stringify(a.pose ? [a.pose.cosine,a.pose.sine,a.pose.x,a.pose.z] : [1,0,0,0]) === JSON.stringify(b.pose ? [b.pose.cosine,b.pose.sine,b.pose.x,b.pose.z] : [1,0,0,0]);
  const wallCells = (parts: Part[]) => parts.filter(part => part.role === "wall").flatMap(part => part.wallCells ?? (part.cell ? [part.cell] : []));
  const scopes = async (nodeId: string): Promise<Cell[]> => {
    const value = await evaluate(nodeId);
    if (value.kind !== "scope") throw new Error("Connect a scope output.");
    return structuredClone(value.cells);
  };
  const evaluate = (id: string): Promise<Value> => {
    const cached = values.get(id); if (cached) return cached;
    const computation = compute(nodes.get(id)!); values.set(id, computation); return computation;
  };
  async function compute(node: BayConstructionNode): Promise<Value> {
    let value: Value;
    switch (node.type) {
      case "Footprint": {
        const footprint = { ...node.parameters };
        if (footprint.wallDepthM * 4 >= Math.min(footprint.widthM,footprint.depthM)) throw new Error("Keep wall depth below a quarter of the footprint span.");
        value = { kind: "footprint", footprint }; break;
      }
      case "Storeys": {
        const input = await evaluate(node.input.nodeId);
        if (input.kind !== "footprint") throw new Error("Storeys require a footprint input.");
        const p = node.parameters, heights = Array.from({ length: p.count }, (_, floor) => floor === 0 ? p.groundHeightM : p.upperHeightM);
        const floorTopsM = heights.map((_, index) => Math.round(heights.slice(0,index+1).reduce((sum,h)=>sum+h,0)*1e9)/1e9);
        const building: ConstructionBuilding = { ...input.footprint, heightM: floorTopsM.at(-1)!, floorTopsM };
        if (building.heightM > 100) throw new Error("The authored building exceeds 100 metres.");
        const cells: Cell[] = [];
        for (const face of ["front","right","rear","left"] as const) for (let floor = 0; floor < p.count; floor++) {
          const span = face === "front" || face === "rear" ? building.widthM : building.depthM;
          const cell: Cell = { root: face === "front" ? node.id : `${node.id}/${face}`, key: "", face, pose: constructionFacePose(face,building), building,
            floorSplit: true, baySplit: false, scope: { facade: "front", floorIndex: floor, bayIndex: 0, zone: floor === 0 ? "ground" : "body",
              originM: [-span/2,floor === 0 ? 0 : floorTopsM[floor-1],-building.wallDepthM], sizeM: [span,heights[floor],building.wallDepthM] } };
          cell.key = keyOf(cell); cells.push(cell);
        }
        value = { kind: "scope", cells }; break;
      }
      case "PlaceDoor": {
        const cells = await scopes(node.input.nodeId), p = node.parameters;
        if (!node.bypassed) {
          const targets = cells.filter(cell => cell.face === "front" && cell.scope.floorIndex === 0 && cell.scope.bayIndex === p.bayIndex);
          if (targets.length !== 1) throw new Error("Choose one existing ground-floor front bay for the entrance.");
          const cell = targets[0], scope = cell.scope;
          if (p.widthM > scope.sizeM[0] - MIN_FACADE_PIER_WIDTH_M*2 || p.heightM > scope.sizeM[1]-.15) throw new Error("The entrance exceeds its masonry scope.");
          scope.opening = { kind: "door", widthM: p.widthM, heightM: p.heightM, centerAlongM: scope.originM[0]+scope.sizeM[0]/2, centerYM: p.heightM/2 };
        }
        value = { kind: "scope", cells }; break;
      }
      case "PlaceStorefront": {
        const cells = await scopes(node.input.nodeId), { mode, ...parameters } = node.parameters;
        if (!node.bypassed && mode === 1) {
          const targets = cells.filter(cell => cell.face === "front" && cell.scope.floorIndex === 0);
          if (!targets.length || targets.some(cell => !cell.building)) throw new Error("Storefronts require front ground-floor building scopes.");
          if (targets.filter(cell => cell.scope.opening?.kind === "door").length !== 1) throw new Error("Storefronts require one existing ground-floor entrance.");
          for (const cell of targets) {
            const scope = cell.scope, entrance = scope.opening?.kind === "door";
            const plan = resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request",
              scope: { id: cell.key, face: cell.face, floorIndex: scope.floorIndex, bayIndex: scope.bayIndex, originM: scope.originM, sizeM: scope.sizeM },
              assembly: entrance ? "glazed-entrance" : "display", parameters: { ...parameters, entranceWidthM: entrance ? scope.opening!.widthM : 1.22 } });
            const a = plan.aperture;
            scope.opening = { kind: entrance ? "door" : "window", widthM: a.widthM, heightM: a.heightM, centerAlongM: a.leftM + a.widthM / 2, centerYM: a.bottomM + a.heightM / 2 };
            cell.storefrontPlan = plan;
            if (graph.storefrontDivision) storefrontTargets.set(cell.key, layoutOf(cell));
          }
        }
        value = { kind: "scope", cells }; break;
      }
      case "EditOpeningWidth": {
        const cells = await scopes(node.input.nodeId);
        if (!node.bypassed) for (const { target, widthM } of node.overrides) {
          const assembly = nodes.get(target.windowNodeId);
          if (assembly?.type !== "AssembleWindow" || assembly.bypassed) throw new Error("The target window assembly is unavailable.");
          let upstream = assembly.input.nodeId;
          while (upstream !== node.id) {
            const parent = nodes.get(upstream);
            if (!parent || !("input" in parent) || parent.input.socket !== "scope") throw new Error("The target window must consume its edited opening scopes.");
            upstream = parent.input.nodeId;
          }
          const matches = cells.filter(cell => cell.root === target.storeysNodeId && cell.face === target.face &&
            cell.scope.floorIndex === target.floorIndex && cell.scope.bayIndex === target.bayIndex);
          if (matches.length !== 1 || !matches[0].building || matches[0].storefrontPlan || matches[0].scope.opening?.kind !== "window") {
            throw new Error("The exact selected regular-window scope is missing or ambiguous.");
          }
          const cell = matches[0], scope = cell.scope;
          const { roundHead, ...openingForWidth } = scope.opening!;
          const plan = resolveConstructionOpeningWidth({ schemaVersion: "0.1.0", kind: "construction-opening-width-request",
            target, widthM, frameWidthM: assembly.parameters.frameWidthM,
            scope: { id: cell.key, face: cell.face, floorIndex: scope.floorIndex, bayIndex: scope.bayIndex,
              originM: scope.originM, sizeM: scope.sizeM, opening: openingForWidth } });
          scope.opening = { ...plan.opening, ...(roundHead ? { roundHead: true } : {}) };
          cell.localOpeningWidth = true;
          editedOpenings.set(`building/${graph.documentId}/node/${target.windowNodeId}/${cell.key}/frame`, { key: cell.key, layout: layoutOf(cell) });
        }
        value = { kind: "scope", cells }; break;
      }
      case "AssembleDoor": {
        const cells = await scopes(node.input.nodeId), parts: Part[] = [];
        if (!node.bypassed) for (const cell of cells.filter(cell => cell.scope.opening?.kind === "door")) {
          const opening = cell.scope.opening!, p = node.parameters;
          if (!cell.storefrontPlan && (p.leafHeightM + p.frameWidthM*2 + .15 >= opening.heightM || p.frameWidthM*4 >= opening.widthM || p.recessM+.08 >= cell.scope.sizeM[2])) throw new Error("The door leaf, transom or recess does not fit its opening.");
          const geometry = cell.storefrontPlan ? graph.storefrontDivision ? buildConstructionDividedStorefrontGeometry(resolveConstructionStorefrontDivision({ schemaVersion: "0.1.0", kind: "construction-storefront-division-request", storefront: cell.storefrontPlan, displayLights: 1, transomLights: graph.storefrontDivision.transomLights }), p.thresholdProjectionM) : buildConstructionStorefrontGeometry(cell.storefrontPlan, p.thresholdProjectionM) : buildBayDoorGeometry(opening.widthM,opening.heightM,p.leafHeightM,p.frameWidthM,p.recessM,p.thresholdProjectionM);
          const shiftedGeometry = (primitives: PrimitiveGeometry[]) => primitives.map(primitive => ({ ...primitive,
            positions: primitive.positions.map((v,i)=>i%3===0?v+opening.centerAlongM:v), bounds: shifted(primitive.bounds,[opening.centerAlongM,0,0]) }));
          parts.push(makeMesh(node,cell,"frame",shiftedGeometry(geometry.frame),"openings",materials.frame),makeMesh(node,cell,"leaf",shiftedGeometry(geometry.leaf),"openings","door.primary"),makeMesh(node,cell,"hardware",shiftedGeometry(geometry.hardware),"openings","ornament.primary"),makeMesh(node,cell,"glass",shiftedGeometry(geometry.glass),"openings",materials.glass),makeMesh(node,cell,"trim",shiftedGeometry(geometry.trim),"trim",materials.trim));
          parts.push(...awningParts(node, cell));
          parts.push(...signParts(node, cell));
        }
        value = { kind: "geometry", parts }; break;
      }
      case "BuildingRoof": {
        const cells = await scopes(node.input.nodeId), building = cells[0]?.building, p = node.parameters;
        if (!building || cells.some(cell=>JSON.stringify(cell.building)!==JSON.stringify(building))) throw new Error("Roof requires scopes from one complete storey system.");
        if (node.bypassed) { value = { kind:"geometry", parts:[] }; break; }
        const { widthM:w,depthM:d,heightM:h }=building;
        const ring=(points:Array<{y:number;offset:number}>)=>constructionProfileRing(w,d,points);
        const cornicePlan = resolveConstructionCorniceDetail({ schemaVersion:"0.1.0",kind:"construction-cornice-detail-request",
          assembly:p.corniceAssembly === 1 ? "dentil-course" : p.corniceAssembly === 2 ? "bracket-course" : "moulded",
          building:{widthM:w,depthM:d,heightM:h},cornice:{heightM:p.corniceHeightM,projectionM:p.corniceProjectionM} });
        const cornice = buildConstructionCorniceGeometry(cornicePlan);
        const parapet = ring([{y:h,offset:-.22},{y:h,offset:0},{y:h+p.parapetHeightM,offset:0},{y:h+p.parapetHeightM,offset:-.22}]);
        const top=h+p.parapetHeightM,c=p.copingProjectionM;
        const silhouette = p.parapetSilhouette === 1 ? resolveConstructionParapetSilhouette({ schemaVersion: "0.1.0", kind: "construction-parapet-silhouette-request",
          treatment: "raised-center", building: { widthM: w, depthM: d, heightM: h }, parapet: { heightM: p.parapetHeightM, copingProjectionM: c } }) : null;
        // globalMesh mirrors Z; pre-mirror asymmetric geometry so the raised treatment lands on the front.
        const coping = silhouette ? front(buildSteppedParapetCoping(silhouette)) : ring([{y:top,offset:-.22-c},{y:top,offset:c-.015},{y:top+.025,offset:c},{y:top+.075,offset:c},{y:top+.095,offset:c-.015},{y:top+.095,offset:-.22-c}]);
        const deck=buildBoxPrimitive({center:[0,h-.1,0],size:[w-.44,.16,d-.44]});
        for(let i=0;i<deck.positions.length/3;i++){deck.uvs[i*2]=deck.positions[i*3];deck.uvs[i*2+1]=deck.positions[i*3+2];}
        value = { kind: "geometry", parts: [globalMesh(node,"roof",[deck],"roof","roof.primary"),globalMesh(node,"parapet",silhouette ? [front(buildSteppedParapetSolid(silhouette))] : [parapet],"roof",materials.wall),globalMesh(node,"cornice",[cornice.backing,coping,...cornice.units],"roof",materials.trim)] };break;
      }
      case "FacadeScope": {
        const { widthM, heightM, wallDepthM } = node.parameters;
        const cell: Cell = { root: node.id, key: "", floorSplit: false, baySplit: false,
          scope: { facade: "front", floorIndex: 0, bayIndex: 0, zone: "body", originM: [-widthM / 2, 0, -wallDepthM], sizeM: [widthM, heightM, wallDepthM] } };
        cell.key = keyOf(cell); value = { kind: "scope", cells: [cell] }; break;
      }
      case "SplitFloors": case "SplitBays": {
        const input = await scopes(node.input.nodeId), floor = node.type === "SplitFloors";
        if (node.bypassed) { value = { kind: "scope", cells: input }; break; }
        const cells = input.flatMap(parent => {
          if (parent.scope.opening || (floor ? parent.floorSplit : parent.baySplit)) throw new Error(`Node ${node.id}: split each axis once, before placing openings.`);
          return Array.from({ length: node.parameters.count }, (_, index) => {
            const cell = structuredClone(parent), axis = floor ? 1 : 0;
            cell.scope.sizeM[axis] /= node.parameters.count;
            cell.scope.originM[axis] += cell.scope.sizeM[axis] * index;
            if (floor) { cell.floorSplit = true; cell.scope.floorIndex = index; }
            else { cell.baySplit = true; cell.scope.bayIndex = index; }
            cell.key = keyOf(cell); return cell;
          });
        });
        if (cells.length > 256) throw new Error("A facade supports at most 256 scopes.");
        value = { kind: "scope", cells }; break;
      }
      case "SelectScopes": {
        const input = await scopes(node.input.nodeId), { floorIndex, bayIndex } = node.parameters;
        const cells = node.bypassed ? input : input.filter(cell => (floorIndex < 0 || cell.scope.floorIndex === floorIndex) && (bayIndex < 0 || cell.scope.bayIndex === bayIndex));
        if (!cells.length) throw new Error(`Node ${node.id}: no matching floor/bay scopes. Use -1 for all or choose an existing index.`);
        value = { kind: "scope", cells }; break;
      }
      case "PlaceOpening": {
        const cells = await scopes(node.input.nodeId), { widthM, heightM, sillM } = node.parameters;
        if (!node.bypassed && node.parameters.upperFrontRoundHead && !cells.some(cell => cell.building && cell.face === "front" && cell.scope.floorIndex > 0))
          throw new Error("Round-headed openings require at least one upper front building scope.");
        if (!node.bypassed) for (const { scope, face } of cells) {
          if (scope.opening) throw new Error(`Node ${node.id}: this scope already has an opening.`);
          if (widthM > scope.sizeM[0] - MIN_FACADE_PIER_WIDTH_M * 2 || sillM + heightM > scope.sizeM[1] - 0.08) throw new Error(`Node ${node.id}: opening exceeds a split scope; retain 80 mm masonry at each edge.`);
          scope.opening = { kind: "window", widthM, heightM, centerAlongM: scope.originM[0] + scope.sizeM[0] / 2, centerYM: scope.originM[1] + sillM + heightM / 2,
            ...(node.parameters.upperFrontRoundHead && face === "front" && scope.floorIndex > 0 ? { roundHead: true } : {}) };
        }
        for (const directive of graph.upperBayGroups ?? []) {
          const matches = cells.filter(cell => cell.root === directive.storeysNodeId && cell.face === "front" &&
            cell.scope.floorIndex === directive.floorIndex && cell.scope.bayIndex === directive.bayIndex);
          if (matches.length !== 1 || node.bypassed) throw new Error("The authored grouped bay no longer exists in the opening scopes.");
          const cell = matches[0], window = graph.nodes.find(item => item.type === "AssembleWindow" && !item.bypassed);
          if (!cell.building || window?.type !== "AssembleWindow") throw new Error("Grouped bays require a building and active window assembly.");
          const plan = resolveConstructionGroupedBay({ schemaVersion: "0.1.0", kind: "construction-grouped-bay-request",
            scope: { id: cell.key, face: "front", floorIndex: cell.scope.floorIndex, bayIndex: cell.scope.bayIndex,
              originM: cell.scope.originM, sizeM: cell.scope.sizeM },
            parameters: { memberCount: directive.memberCount, memberWidthM: directive.memberWidthM, pierWidthM: directive.pierWidthM,
              heightM, sillM, frameWidthM: window.parameters.frameWidthM, recessM: window.parameters.recessM } });
          grouped.push(plan); groupedByScope.set(cell.key, plan);
        }
        const expanded = cells.flatMap(cell => {
          const plan = groupedByScope.get(cell.key);
          if (!plan || node.bypassed) return [cell];
          const { scope: requested, parameters: p } = plan.source, scope = cell.scope;
          // Existing rectangular sill and lintel extend 0.1 m past each side.
          // Separate members must not generate overlapping coplanar trim.
          if (p.pierWidthM <= 0.2) throw new Error(`Grouped bay ${cell.key} needs more than 0.2 m between openings for separate trim.`);
          const outerMargin = (scope.sizeM[0] - p.memberCount * p.memberWidthM - (p.memberCount - 1) * p.pierWidthM) / 2;
          if (outerMargin <= 0.12) throw new Error(`Grouped bay ${cell.key} needs more outer masonry for its trim and neighboring bays.`);
          const windows = graph.nodes.filter(item => item.type === "AssembleWindow" && !item.bypassed);
          const window = windows[0];
          if (!cell.building || cell.face !== "front" || scope.floorIndex === 0 ||
              requested.face !== cell.face || requested.floorIndex !== scope.floorIndex || requested.bayIndex !== scope.bayIndex ||
              canonicalJson(requested.originM) !== canonicalJson(scope.originM) || canonicalJson(requested.sizeM) !== canonicalJson(scope.sizeM) ||
              p.heightM !== heightM || p.sillM !== sillM || window?.type !== "AssembleWindow" ||
              p.frameWidthM !== window.parameters.frameWidthM || p.recessM !== window.parameters.recessM)
            throw new Error(`Grouped bay ${cell.key} does not match the active building scope and assembly.`);
          usedGroups.add(cell.key);
          return plan.members.map((member, index) => {
            const left = index === 0 ? scope.originM[0] : (plan.members[index-1].centerAlongM + member.centerAlongM) / 2;
            const right = index === plan.members.length-1 ? scope.originM[0]+scope.sizeM[0] : (member.centerAlongM+plan.members[index+1].centerAlongM)/2;
            const child = structuredClone(cell);
            child.key = member.id;
            child.groupedOpening = true;
            child.scope.originM[0] = left;
            child.scope.sizeM[0] = right-left;
            child.scope.opening = { kind: "window", widthM: member.widthM, heightM: member.heightM,
              centerAlongM: member.centerAlongM, centerYM: member.centerYM, ...(scope.opening?.roundHead ? { roundHead: true } : {}) };
            return child;
          });
        });
        if (expanded.length > 256) throw new Error("A facade supports at most 256 scopes after grouping.");
        value = { kind: "scope", cells: expanded }; break;
      }
      case "EmitWall": {
        const cells = await scopes(node.input.nodeId);
        if (["0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0", "0.15.0", "0.16.0", "0.17.0"].includes(graph.schemaVersion) && cells.every(cell=>cell.building)) {
          const faces = new Map<string,Cell[]>(); for(const cell of cells) faces.set(cell.root,[...(faces.get(cell.root)??[]),cell]);
          const parts = node.bypassed ? [] : [...faces.values()].map(group=>{
            const cell={...group[0],key:group[0].root},part=makeMesh(node,cell,"wall",[constructionFacadeSolid(group.map(cell=>cell.scope),group.filter(cell=>cell.scope.opening?.roundHead).map(roundPlan))],"facade",materials.wall);
            part.wallCells=group;return part;
          });
          if (pierStudy && !node.bypassed) {
            const frontCells = cells.filter(cell => cell.face === "front" && cell.scope.floorIndex > 0), building = frontCells[0]?.building;
            const split = graph.nodes.find(item => item.type === "SplitBays" && !item.bypassed);
            if (!building || split?.type !== "SplitBays" || frontCells.some(cell => !cell.scope.opening || canonicalJson(cell.building) !== canonicalJson(building)))
              throw new Error("Facade pier study requires upper-front opening scopes on one building.");
            const floorIndices = [...new Set(frontCells.map(cell => cell.scope.floorIndex))].sort((a, b) => a - b);
            if (floorIndices.length !== building.floorTopsM.length - 1 || floorIndices.some((floor, index) => floor !== index + 1) ||
                floorIndices.some(floor => new Set(frontCells.filter(cell => cell.scope.floorIndex === floor).map(cell => cell.scope.bayIndex)).size !== split.parameters.count))
              throw new Error("Facade pier study requires all upper-front floors and bays in the wall output.");
            const band = graph.nodes.find(item => item.type === "ProfileTrim" && !item.bypassed);
            const roof = graph.nodes.find(item => item.type === "BuildingRoof" && !item.bypassed);
            const meetBands = pierStudy.schemaVersion === "0.2.0" && band?.type === "ProfileTrim";
            if (pierStudy.schemaVersion === "0.2.0" && !meetBands) throw new Error("The pier junction study requires an active storey band.");
            const floors = floorIndices.map(floorIndex => {
              const floorCells = frontCells.filter(cell => cell.scope.floorIndex === floorIndex), scope = floorCells[0].scope;
              const topFloor = floorIndex === building.floorTopsM.length - 1;
              const topReserve = topFloor ? (roof?.type === "BuildingRoof" ? roof.parameters.corniceHeightM : 0) : (band?.type === "ProfileTrim" ? band.parameters.heightM : 0);
              return { floorIndex, bottomM: scope.originM[1] + (meetBands ? 0 : pierStudy.clearanceM),
                topM: scope.originM[1] + scope.sizeM[1] - topReserve - (meetBands && !topFloor ? 0 : pierStudy.clearanceM),
                openingSpans: floorCells.map(cell => [cell.scope.opening!.centerAlongM - cell.scope.opening!.widthM / 2 - 0.1,
                  cell.scope.opening!.centerAlongM + cell.scope.opening!.widthM / 2 + 0.1] as [number, number]) };
            });
            const plan = resolveConstructionFacadePiers({ schemaVersion: "0.1.0", kind: "construction-facade-pier-request", facadeWidthM: building.widthM,
              bayCount: split.parameters.count, floors, pierWidthM: pierStudy.pierWidthM, projectionM: pierStudy.projectionM, endHeightM: pierStudy.endHeightM, clearanceM: pierStudy.clearanceM });
            for (const pier of buildConstructionFacadePierGeometry(plan)) {
              const base = frontCells.find(cell => cell.scope.floorIndex === pier.floorIndex)!;
              const cell = { ...base, key: `${base.root}/floor/${pier.floorIndex}/bay-edge/${pier.edgeIndex}` };
              parts.push(makeMesh(node, cell, "facade-pier", pier.parts, "trim", materials.trim)); pierCount++;
            }
          }
          value = { kind: "geometry", parts };
        } else value = { kind: "geometry", parts: node.bypassed ? [] : cells.map(cell => makeMesh(node, cell, "wall", expandBayWallPrimitives(cell.scope), "facade", materials.wall)) }; break;
      }
      case "AssembleWindow": {
        const cells = await scopes(node.input.nodeId), parts: Part[] = [];
        if (!node.bypassed) for (const cell of cells) {
          const opening = cell.scope.opening, p = node.parameters;
          if (opening?.kind === "door") continue;
          if (!opening) throw new Error(`Node ${node.id}: connect scopes containing openings.`);
          if (!cell.storefrontPlan && (p.frameWidthM * 4 >= Math.min(opening.widthM, opening.heightM) || p.recessM + 0.08 >= cell.scope.sizeM[2])) throw new Error(`Node ${node.id}: frame or recess does not fit the wall.`);
          const sillM = Math.round((opening.centerYM - cell.scope.originM[1] - opening.heightM / 2) * 1e9) / 1e9;
          const metricTimberUvs=Boolean(cell.building);
          const key = JSON.stringify(opening.roundHead ? [opening.widthM, opening.heightM, sillM, cell.scope.sizeM, p, "round-head-seated-v2"] : cell.storefrontPlan ? [opening.widthM, opening.heightM, sillM, cell.storefrontPlan.source.parameters, "storefront-seated-sill-v2", ...(graph.storefrontDivision && (graph.storefrontDivision.displayLights !== 1 || graph.storefrontDivision.transomLights !== 1) ? [graph.storefrontDivision] : [])] : cell.localOpeningWidth ? [opening.widthM,opening.heightM,sillM,p,"local-opening-seated-trim-v2"] : metricTimberUvs ? [opening.widthM, opening.heightM, sillM, p, "metric-timber-uv-seated-trim-v3"] : [opening.widthM, opening.heightM, sillM, p]);
          if (!templates.has(key)) templates.set(key, (async () => {
            if (opening.roundHead) {
              const actual = roundPlan(cell), source = structuredClone(actual.source);
              source.scope.id = "round-head-template"; source.scope.originM = [-source.scope.sizeM[0] / 2, 0, source.scope.originM[2]];
              const plan = resolveConstructionRoundHead(source), geometry = buildConstructionRoundHeadWindow(plan);
              // Keep the sill outside the wall: sharing its top plane with the
              // masonry below the aperture produces visible coplanar flicker.
              const sill = buildBoxPrimitive({ center: [0, sillM - 0.045, p.sillProjectionM / 2], size: [opening.widthM + 0.12, 0.09, p.sillProjectionM] });
              for (let i = 0; i < sill.positions.length / 3; i++) {
                const pos = i * 3, nx = Math.abs(sill.normals[pos]), ny = Math.abs(sill.normals[pos + 1]);
                sill.uvs[i*2] = nx > .9 ? sill.positions[pos+2] - sill.bounds.min[2] : sill.positions[pos] - sill.bounds.min[0];
                sill.uvs[i*2+1] = ny > .9 ? sill.positions[pos+2] - sill.bounds.min[2] : sill.positions[pos+1] - sill.bounds.min[1];
              }
              const pieces = { frame: [geometry.frame, ...buildConstructionRoundHeadSash(plan, p.layout ?? 0)], glass: [geometry.glass], trim: [sill, buildConstructionSillSeat(opening.widthM, sillM, p.recessM)] };
              const batches = (["frame", "glass", "trim"] as const).map(role => {
                const combined = combinePrimitiveGeometry(pieces[role].map(front));
                return { batchId: "round-head." + role, role, materialSlotId: materials[role], positions: combined.positions, normals: combined.normals, uvs: combined.uvs, indices: combined.indices };
              });
              return { hash: (await hashCanonicalJson(JSON.parse(key))).slice(0, 20), batches };
            }
            if (cell.storefrontPlan) {
              const geometry = graph.storefrontDivision ? buildConstructionDividedStorefrontGeometry(resolveConstructionStorefrontDivision({ schemaVersion: "0.1.0", kind: "construction-storefront-division-request", storefront: cell.storefrontPlan, ...graph.storefrontDivision })) : buildConstructionStorefrontGeometry(cell.storefrontPlan);
              const batches = (["frame", "glass", "trim"] as const).map(role => {
                const combined = combinePrimitiveGeometry(geometry[role].map(front));
                return { batchId: "storefront." + role, role, materialSlotId: materials[role], positions: combined.positions, normals: combined.normals, uvs: combined.uvs, indices: combined.indices };
              });
              return { hash: (await hashCanonicalJson(JSON.parse(key))).slice(0, 20), batches };
            }
            const template: BayConstructionGraph = { schemaVersion: "0.1.0", kind: "bay-construction", documentId: graph.documentId, outputNodeId: "output", nodes: [
              { id: "facade", type: "FacadeScope", parameters: { widthM: cell.scope.sizeM[0], heightM: cell.scope.sizeM[1], wallDepthM: cell.scope.sizeM[2] } },
              { id: "opening", type: "PlaceOpening", input: { nodeId: "facade", socket: "scope" }, parameters: { widthM: opening.widthM, heightM: opening.heightM, sillM } },
              { id: "window", type: "AssembleWindow", input: { nodeId: "opening", socket: "scope" }, parameters: { recessM:p.recessM, frameWidthM:p.frameWidthM, sillProjectionM:p.sillProjectionM } },
              { id: "output", type: "Output", inputs: [{ nodeId: "window", socket: "geometry" }] }
            ] };
            return { hash: (await hashCanonicalJson(JSON.parse(key))).slice(0, 20), batches: (await evaluateBayConstruction(template, materials, {metricTimberUvs,windowLayout:p.layout ?? 0,closedOpeningTrim:metricTimberUvs || cell.localOpeningWidth})).ir.meshBatches };
          })());
          const template = await templates.get(key)!;
          for (const batch of template.batches) {
            const prototype = { ...batch, batchId: `construction.prototype.${batch.role}.${template.hash}` };
            const translation: [number, number, number] = [opening.centerAlongM, cell.scope.originM[1], 0];
            parts.push({ id: `building/${graph.documentId}/node/${node.id}/${cell.key}/${batch.role}`, nodeId: node.id, cell, role: batch.role,
              prototype, translation, pose: cell.pose, bounds: posedBounds(shifted(batchBounds(batch), translation),cell.pose), stage: batch.role === "trim" ? "trim" : "openings" });
          }
          parts.push(...awningParts(node, cell));
          parts.push(...signParts(node, cell));
        }
        value = { kind: "geometry", parts }; break;
      }
      case "ProfileTrim": case "RoofCap": {
        const cells = await scopes(node.input.nodeId), parts: Part[] = [];
        if (node.type === "ProfileTrim" && cells[0]?.building) {
          const b=cells[0].building,p=node.parameters;
          if (cells.some(cell=>JSON.stringify(cell.building)!==JSON.stringify(b))) throw new Error("Profile bands require one storey system.");
          if (!node.bypassed) for(const top of b.floorTopsM.slice(0,-1)) parts.push(globalMesh(node,`band.${top}`,[constructionProfileRing(b.widthM,b.depthM,[
            {y:top-p.heightM,offset:0},{y:top-p.heightM*.8,offset:p.projectionM*.65},{y:top-p.heightM*.3,offset:p.projectionM*.65},
            {y:top-p.heightM*.2,offset:p.projectionM},{y:top,offset:p.projectionM},{y:top,offset:0}])],"trim",materials.trim));
          value={kind:"geometry",parts};break;
        }
        if (!node.bypassed) for (const cell of cells) {
          const p = node.parameters, s = cell.scope, x = s.originM[0] + s.sizeM[0] / 2, top = s.originM[1] + s.sizeM[1];
          const primitives = node.type === "ProfileTrim" ? [extrudeProfileSolidAlongX({ profile: { id: node.id, label: "Stepped stone band", points: [
            { u: 0, d: 0.015 }, { u: p.heightM * 0.25, d: p.projectionM * 0.65 }, { u: p.heightM * 0.7, d: p.projectionM * 0.65 },
            { u: p.heightM * 0.8, d: p.projectionM }, { u: p.heightM, d: p.projectionM }
          ] }, center: [x, top - p.heightM / 2, 0], runLengthM: s.sizeM[0] })]
            : [buildBoxPrimitive({ center: [x, top + p.heightM / 2, -(node.parameters.depthM) / 2], size: [s.sizeM[0] + p.projectionM * 2, p.heightM, node.parameters.depthM + p.projectionM * 2] })];
          parts.push(makeMesh(node, cell, node.type === "RoofCap" ? "roof" : "band", primitives, node.type === "RoofCap" ? "roof" : "trim", materials.trim));
        }
        value = { kind: "geometry", parts }; break;
      }
      case "SetSurface": {
        const upstream = await evaluate(node.input.nodeId);
        if (upstream.kind !== "geometry") throw new Error("Surface finish requires geometry.");
        value = { kind: "geometry", parts: upstream.parts }; break;
      }
      case "JoinGeometry": case "Output": {
        const parts: Part[] = [];
        for (const link of node.inputs) {
          const upstream = await evaluate(link.nodeId);
          if (upstream.kind !== "geometry") throw new Error("Output requires geometry contributions.");
          parts.push(...upstream.parts);
        }
        if (parts.length > 2048) throw new Error("Construction exceeds the 2048-part output budget.");
        if (new Set(parts.map(part => part.id)).size !== parts.length) throw new Error("Output repeats geometry contributions.");
        const walls = new Map<string, string>(), windows = new Set<string>();
        const wallParts = wallCells(parts);
        const overlaps = (a: FacadeBayScope, b: { originM: number[]; sizeM: number[] }) => [0, 1].every(axis =>
          Math.min(a.originM[axis] + a.sizeM[axis], b.originM[axis] + b.sizeM[axis]) - Math.max(a.originM[axis], b.originM[axis]) > 1e-8);
        for (let i = 0; i < wallParts.length; i++) for (let j = i + 1; j < wallParts.length; j++) {
          if (samePlane(wallParts[i],wallParts[j]) && overlaps(wallParts[i].scope, wallParts[j].scope)) throw new Error("Output repeats overlapping wall scopes.");
        }
        for (const cell of wallParts) {
          if (walls.has(cell.key)) throw new Error("Output repeats overlapping wall scopes.");
          walls.set(cell.key, layoutOf(cell));
        }
        for (const part of parts.filter(part => part.role === "frame")) {
          if (windows.has(part.cell!.key)) throw new Error("Output places more than one window assembly into the same opening.");
          windows.add(part.cell!.key);
          const opening = part.cell!.scope.opening!;
          const aperture = { originM: [opening.centerAlongM - opening.widthM / 2, opening.centerYM - opening.heightM / 2], sizeM: [opening.widthM, opening.heightM] };
          if (wallParts.some(wall => samePlane(wall,part.cell!) && overlaps(wall.scope, aperture) && (wall.key !== part.cell!.key || layoutOf(wall) !== layoutOf(part.cell!)))) {
            throw new Error("Connect Wall and Window assembly to the same opening layout.");
          }
        }
        value = { kind: "geometry", parts }; break;
      }
    }
    const boxes = value.kind === "footprint" ? [{min:[-value.footprint.widthM/2,0,-value.footprint.depthM/2],max:[value.footprint.widthM/2,0,value.footprint.depthM/2]} as Bounds3] : value.kind === "scope" ? value.cells.map(cell => posedBounds(boundsOf(cell.scope),cell.pose)) : value.parts.map(part => part.bounds);
    trace.push({ nodeId: node.id, type: node.type, output: value.kind, openingCount: value.kind === "scope" ? value.cells.filter(c => c.scope.opening).length : 0,
      meshCount: value.kind === "geometry" ? value.parts.length : 0, bounds: boxes.length ? union(boxes) : { min: [0, 0, 0], max: [0, 0, 0] },
      scopeCount: value.kind === "scope" ? value.cells.length : undefined,
      scopeNames: value.kind === "scope" ? value.cells.map(cell => cell.key) : undefined });
    return value;
  }
  const full = await evaluate(graph.outputNodeId);
  if (full.kind !== "geometry" || !full.parts.length) throw new Error("Construction output is empty.");
  if (pierStudy && (!pierCount || full.parts.filter(part => part.role === "facade-pier").length !== pierCount)) throw new Error("Facade piers must reach the complete building output.");
  if (signStudy && (full.parts.filter(part => part.role === "sign.panel").length !== 1 || full.parts.filter(part => part.role === "sign.frame").length !== 1))
    throw new Error("The sign must reach one existing front storefront and the final building output.");
  if (signStudy) {
    const signs = full.parts.filter(part => part.role === "sign.panel" || part.role === "sign.frame");
    const bands = full.parts.filter(part => part.role.startsWith("band."));
    if (signs.some(sign => bands.some(band => [0, 1, 2].every(axis => sign.bounds.min[axis] < band.bounds.max[axis] + 0.01 && sign.bounds.max[axis] > band.bounds.min[axis] - 0.01))))
      throw new Error("The sign needs clearance from the storey trim band.");
  }
  if (usedGroups.size !== grouped.length) throw new Error("A grouped bay is missing from the executed opening scopes.");
  for (const node of graph.nodes) if (node.type === "EditOpeningWidth" && !node.bypassed) for (const { target } of node.overrides) {
    const path = `building/${graph.documentId}/node/${target.windowNodeId}/${target.storeysNodeId}/floor/${target.floorIndex}/bay/${target.bayIndex}/frame`;
    if (!editedOpenings.has(path)) throw new Error("The selected opening edit is not connected to the final output.");
  }
  const fullWalls = full.parts.flatMap(part => part.wallCells ?? (part.role === "wall" && part.cell ? [part.cell] : []));
  if (signStudy) {
    const sign = full.parts.find(part => part.role === "sign.panel")!, cell = sign.cell!;
    if (fullWalls.filter(wall => wall.key === cell.key && layoutOf(wall) === layoutOf(cell)).length !== 1 ||
        full.parts.filter(part => part.cell?.key === cell.key && part.cell.storefrontPlan && part.role === "frame").length !== 1 ||
        full.parts.filter(part => part.cell?.key === cell.key && part.cell.storefrontPlan && part.role === "glass").length !== 1)
      throw new Error("The sign requires its matching storefront wall, frame and glazing in the final output.");
  }
  for (const awning of graph.awnings ?? []) {
    const matching = full.parts.filter(part => part.cell?.face === "front" && part.cell.scope.floorIndex === 0 && part.cell.scope.bayIndex === awning.bayIndex);
    if (matching.filter(part => part.role === "awning.canopy").length !== 1 || matching.filter(part => part.role === "awning.valance").length !== 1)
      throw new Error("Each awning must reach one existing storefront and the final building output.");
  }
  if (graph.storefrontDivision) {
    if (!storefrontTargets.size) throw new Error("The divided storefront must be connected to the final building output.");
    for (const [key, layout] of storefrontTargets) {
      const wall = fullWalls.filter(cell => cell.key === key && layoutOf(cell) === layout);
      const frame = full.parts.filter(part => part.cell?.key === key && part.cell.storefrontPlan && part.role === "frame");
      const glass = full.parts.filter(part => part.cell?.key === key && part.cell.storefrontPlan && part.role === "glass");
      if (wall.length !== 1 || frame.length !== 1 || glass.length !== 1)
        throw new Error("Each divided storefront must reach its matching wall, frame and glazing in the final output.");
    }
  }
  for (const plan of grouped) for (const member of plan.members) {
    const matchingWalls = fullWalls.filter(cell => cell.key === member.id);
    const matchingFrames = full.parts.filter(part => part.role === "frame" && part.cell?.key === member.id);
    if (matchingWalls.length !== 1 || matchingFrames.length !== 1 || layoutOf(matchingWalls[0]) !== layoutOf(matchingFrames[0].cell!))
      throw new Error("Each grouped member must reach one matching wall aperture and window frame.");
  }
  for (const [path, expected] of editedOpenings) {
    if (full.parts.filter(part => part.id === path).length !== 1 ||
        fullWalls.filter(cell => cell.key === expected.key && layoutOf(cell) === expected.layout).length !== 1) {
      throw new Error("The selected opening edit must reach one final window and its matching wall aperture.");
    }
  }
  const selected = previewNodeId ? await evaluate(previewNodeId) : full;
  let parts: Part[];
  if (selected.kind === "geometry") parts = selected.parts;
  else if (selected.kind === "footprint") parts = [globalMesh(nodes.get(previewNodeId!)!,"footprint",[buildBoxPrimitive({center:[0,.01,0],size:[selected.footprint.widthM,.02,selected.footprint.depthM]})],"facade",materials.frame)];
  else parts = selected.cells.map(cell => {
    const s = cell.scope, x = s.originM[0] + s.sizeM[0] / 2, y = s.originM[1] + s.sizeM[1] / 2, t = 0.018;
    return makeMesh(nodes.get(previewNodeId!)!, cell, "scope", [
      buildBoxPrimitive({ center: [s.originM[0], y, 0.012], size: [t, s.sizeM[1], t] }),
      buildBoxPrimitive({ center: [s.originM[0] + s.sizeM[0], y, 0.012], size: [t, s.sizeM[1], t] }),
      buildBoxPrimitive({ center: [x, s.originM[1], 0.012], size: [s.sizeM[0], t, t] }),
      buildBoxPrimitive({ center: [x, s.originM[1] + s.sizeM[1], 0.012], size: [s.sizeM[0], t, t] })
    ], "facade", materials.frame);
  });
  if (!parts.length) throw new Error("This node produces no geometry while bypassed.");
  const prototypes = new Map<string, MeshBatchIR>(), instanceGroups = new Map<string, Part[]>();
  const meshBatches: MeshBatchIR[] = [], semanticIndex: RuntimeBuildingIR["semanticIndex"] = [];
  for (const part of parts) {
    if (part.mesh) { meshBatches.push(part.mesh); semanticIndex.push({ semanticPath: part.id, batchId: part.mesh.batchId, stage: part.stage }); }
    else {
      prototypes.set(part.prototype!.batchId, part.prototype!);
      const batchId = `construction.${part.nodeId}.${part.prototype!.batchId}`;
      const group = instanceGroups.get(batchId) ?? [];
      semanticIndex.push({ semanticPath: part.id, batchId, stage: part.stage, elementIndex: group.length });
      group.push(part); instanceGroups.set(batchId, group);
    }
  }
  const instanceBatches = [...instanceGroups].map(([batchId, group]) => ({ batchId, recipeId: group[0].prototype!.batchId,
    materialSlotId: group[0].prototype!.materialSlotId!, count: group.length,
    transforms: new Float32Array(group.flatMap(part => poseMatrix(part.translation!,part.pose))) }));
  const ir = RuntimeBuildingIRSchema.parse({ schemaVersion: "0.1.0", buildingId: graph.documentId, familyId: graph.documentId,
    sourceGraphHash: await hashCanonicalJson(signAwningStudyInput ?? signStudyInput ?? pierStudyInput ?? (groupedInput.length ? { schemaVersion: "0.1.0", kind: "construction-grouped-geometry-request", graph, groups: grouped } : graph)), bounds: union(parts.map(p => p.bounds)), meshBatches, instanceBatches, semanticIndex,
    metrics: { vertexCount: [...meshBatches, ...prototypes.values()].reduce((sum, batch) => sum + batch.positions!.length / 3, 0),
      triangleCount: parts.reduce((sum, part) => sum + (part.mesh ?? part.prototype)!.indices!.length / 3, 0),
      instanceCount: instanceBatches.reduce((sum, batch) => sum + batch.count, 0) } });
  const surfaceComposition = constructionSurfaceAt(graph, previewNodeId ?? graph.outputNodeId);
  return { graph, ir, trace, prototypes: [...prototypes.values()], ...(previewNodeId ? { previewNodeId } : {}), ...(surfaceComposition ? { surfaceComposition } : {}) };
}
