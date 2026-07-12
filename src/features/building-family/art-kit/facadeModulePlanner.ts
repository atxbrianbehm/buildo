import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { Diagnostic } from "../core/diagnostics";
import { createSeedTree } from "../core/seedTree";
import type { ArtKitFacadeZone, ArtKitManifest, ArtKitModule, ArtKitModuleKind } from "./artKitContracts";
import {
  validateBoundsFit,
  validateSameFacadeLayerOverlap,
  type ArtKitPlacementLayer
} from "./moduleSnapGrid";

export type ArtKitFacadeName = "front" | "rear" | "left" | "right";

export interface FacadeCell {
  id: string;
  facade: ArtKitFacadeName;
  floorIndex: number;
  bayIndex: number;
  zone: "ground" | "body";
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
  semanticPath: string;
}

export interface FacadeModulePlacement {
  id: string;
  moduleId: string;
  facade: ArtKitFacadeName;
  floorIndex: number;
  bayIndex: number;
  zone: "ground" | "body" | "cornice" | "roof" | "side" | "rear";
  layer: ArtKitPlacementLayer;
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
  semanticPath: string;
}

export interface FacadeModulePlan {
  schemaVersion: "0.1.0";
  artKitManifestId: string;
  unitMeters: 1;
  plannerId: "seeded-greedy";
  cells: FacadeCell[];
  placements: FacadeModulePlacement[];
  diagnostics: Diagnostic[];
}

export interface PlanFacadeModulesInput {
  spec: BuildingFamilySpec;
  kit: ArtKitManifest;
}

const SIDE_PANEL_DEPTH_M = 0.6;

export function sideBayCount(spec: BuildingFamilySpec): number {
  return Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));
}

function floorBaseY(spec: BuildingFamilySpec, floorIndex: number): number {
  return spec.massing.floorHeightsM.slice(0, floorIndex).reduce((total, height) => total + height, 0);
}

function zoneForFloor(floorIndex: number): "ground" | "body" {
  return floorIndex === 0 ? "ground" : "body";
}

function plannerDiagnostic(code: string, message: string, path: string, received?: unknown): Diagnostic {
  return { code, message, severity: "error", path, received };
}

function placementSizeForFacade(
  facade: ArtKitFacadeName,
  module: ArtKitModule
): [number, number, number] {
  if (facade === "left" || facade === "right") {
    return [module.boundsMeters.depth, module.boundsMeters.height, module.boundsMeters.width];
  }
  return [module.boundsMeters.width, module.boundsMeters.height, module.boundsMeters.depth];
}

function wallSizeForCell(cell: FacadeCell): [number, number, number] {
  return [...cell.sizeMeters];
}

function placementOrigin(
  cell: FacadeCell,
  size: [number, number, number],
  centerOnFacade: boolean
): [number, number, number] {
  let x = cell.originMeters[0];
  let y = cell.originMeters[1] + Math.max(0, (cell.sizeMeters[1] - size[1]) / 2);
  let z = cell.originMeters[2];

  if (centerOnFacade) {
    if (cell.facade === "front" || cell.facade === "rear") {
      x = cell.originMeters[0] + Math.max(0, (cell.sizeMeters[0] - size[0]) / 2);
    } else {
      z = cell.originMeters[2] + Math.max(0, (cell.sizeMeters[2] - size[2]) / 2);
    }
  }

  // Preserve exact cell topology. Fractional bay spans (e.g. 3.6 m side bays)
  // must not be snapped onto the 1 m lattice or same-facade walls falsely overlap.
  return [x, y, z];
}

function moduleSupportsZone(module: ArtKitModule, zone: ArtKitFacadeZone): boolean {
  return module.facadeZones.includes(zone);
}

function findModule(
  kit: ArtKitManifest,
  kind: ArtKitModuleKind,
  zone: ArtKitFacadeZone,
  diagnostics: Diagnostic[]
): ArtKitModule | undefined {
  const module = kit.modules.find((candidate) => candidate.kind === kind && moduleSupportsZone(candidate, zone));
  if (!module) {
    diagnostics.push(
      plannerDiagnostic(
        "artKit.facadePlanner.missingModule",
        `No art-kit module of kind ${kind} supports facade zone ${zone}.`,
        `modules.${kind}`,
        zone
      )
    );
  }
  return module;
}

function wallZoneForCell(cell: FacadeCell): ArtKitFacadeZone {
  if (cell.facade === "left" || cell.facade === "right") {
    return "side";
  }
  if (cell.facade === "rear") {
    return "rear";
  }
  return cell.zone === "ground" ? "ground" : "body";
}

function resolveWallModule(kit: ArtKitManifest, cell: FacadeCell, diagnostics: Diagnostic[]): ArtKitModule | undefined {
  const preferredZone = wallZoneForCell(cell);
  const preferred = kit.modules.find(
    (candidate) => candidate.kind === "wall-panel" && moduleSupportsZone(candidate, preferredZone)
  );
  if (preferred) {
    return preferred;
  }

  // Body-capable wall panels often also cover ground cells in the demo kit.
  const fallbackZones: ArtKitFacadeZone[] =
    preferredZone === "ground" ? ["body", "side", "rear"] : [preferredZone];
  for (const zone of fallbackZones) {
    const module = kit.modules.find(
      (candidate) => candidate.kind === "wall-panel" && moduleSupportsZone(candidate, zone)
    );
    if (module) {
      return module;
    }
  }

  return findModule(kit, "wall-panel", preferredZone, diagnostics);
}

function createPlacement(input: {
  cell: FacadeCell;
  module: ArtKitModule;
  layer: ArtKitPlacementLayer;
  zone: FacadeModulePlacement["zone"];
  size: [number, number, number];
  centerOnFacade: boolean;
}): FacadeModulePlacement {
  const originMeters = placementOrigin(input.cell, input.size, input.centerOnFacade);
  return {
    id: `placement.${input.layer}.${input.cell.facade}.floor${input.cell.floorIndex}.bay${input.cell.bayIndex}.${input.module.id}`,
    moduleId: input.module.id,
    facade: input.cell.facade,
    floorIndex: input.cell.floorIndex,
    bayIndex: input.cell.bayIndex,
    zone: input.zone,
    layer: input.layer,
    originMeters,
    sizeMeters: input.size,
    semanticPath: `${input.cell.semanticPath}/${input.layer}/${input.module.id}`
  };
}

export function buildFacadeCells(spec: BuildingFamilySpec): FacadeCell[] {
  const cells: FacadeCell[] = [];
  const width = spec.massing.widthM;
  const depth = spec.massing.depthM;
  const frontBayWidth = width / spec.facade.frontBayCount;
  const sides = sideBayCount(spec);
  const sideBayDepth = depth / sides;

  for (let floorIndex = 0; floorIndex < spec.massing.floorCount; floorIndex += 1) {
    const floorHeight = spec.massing.floorHeightsM[floorIndex] ?? spec.massing.floorHeightsM.at(-1) ?? 3;
    const y = floorBaseY(spec, floorIndex);
    const zone = zoneForFloor(floorIndex);

    for (let bayIndex = 0; bayIndex < spec.facade.frontBayCount; bayIndex += 1) {
      cells.push({
        id: `cell.front.floor${floorIndex}.bay${bayIndex}`,
        facade: "front",
        floorIndex,
        bayIndex,
        zone,
        originMeters: [-width / 2 + bayIndex * frontBayWidth, y, -depth / 2],
        sizeMeters: [frontBayWidth, floorHeight, SIDE_PANEL_DEPTH_M],
        semanticPath: `building/${spec.familyId}/facade/front/floor/${floorIndex}/bay/${bayIndex}`
      });
      cells.push({
        id: `cell.rear.floor${floorIndex}.bay${bayIndex}`,
        facade: "rear",
        floorIndex,
        bayIndex,
        zone,
        originMeters: [-width / 2 + bayIndex * frontBayWidth, y, depth / 2 - SIDE_PANEL_DEPTH_M],
        sizeMeters: [frontBayWidth, floorHeight, SIDE_PANEL_DEPTH_M],
        semanticPath: `building/${spec.familyId}/facade/rear/floor/${floorIndex}/bay/${bayIndex}`
      });
    }

    for (let bayIndex = 0; bayIndex < sides; bayIndex += 1) {
      cells.push({
        id: `cell.left.floor${floorIndex}.bay${bayIndex}`,
        facade: "left",
        floorIndex,
        bayIndex,
        zone,
        originMeters: [-width / 2, y, -depth / 2 + bayIndex * sideBayDepth],
        sizeMeters: [SIDE_PANEL_DEPTH_M, floorHeight, sideBayDepth],
        semanticPath: `building/${spec.familyId}/facade/left/floor/${floorIndex}/bay/${bayIndex}`
      });
      cells.push({
        id: `cell.right.floor${floorIndex}.bay${bayIndex}`,
        facade: "right",
        floorIndex,
        bayIndex,
        zone,
        originMeters: [width / 2 - SIDE_PANEL_DEPTH_M, y, -depth / 2 + bayIndex * sideBayDepth],
        sizeMeters: [SIDE_PANEL_DEPTH_M, floorHeight, sideBayDepth],
        semanticPath: `building/${spec.familyId}/facade/right/floor/${floorIndex}/bay/${bayIndex}`
      });
    }
  }

  return cells;
}

function chooseWindowModule(
  kit: ArtKitManifest,
  cell: FacadeCell,
  seedTree: ReturnType<typeof createSeedTree>
): ArtKitModule | undefined {
  const zone: ArtKitFacadeZone = cell.zone;
  const rectangular = kit.modules.find(
    (module) => module.id === "opening.window.rectangular" && moduleSupportsZone(module, zone)
  );
  const arched = kit.modules.find(
    (module) => module.id === "opening.window.arched" && moduleSupportsZone(module, zone)
  );

  // Balanced weights so building-seed samples visibly differ (not always rectangular).
  const weighted = [
    rectangular ? { value: rectangular, weight: 2 } : undefined,
    arched ? { value: arched, weight: 3 } : undefined
  ].filter((item): item is { value: ArtKitModule; weight: number } => item !== undefined);

  if (weighted.length === 0) {
    return kit.modules.find((module) => module.kind === "opening" && moduleSupportsZone(module, zone));
  }
  if (weighted.length === 1) {
    return weighted[0].value;
  }
  return seedTree.chooseWeighted(weighted, cell.semanticPath);
}

export function planFacadeModules(input: PlanFacadeModulesInput): FacadeModulePlan {
  const { spec, kit } = input;
  const cells = buildFacadeCells(spec);
  const diagnostics: Diagnostic[] = [];
  const placements: FacadeModulePlacement[] = [];
  // Building seed drives per-building facade choices so sample gallery variants
  // and Assembly Hall opens are not identical for a shared family seed.
  const seedTree = createSeedTree(spec.seeds.building).fork("art-kit/facades");
  const centerDoorBay = Math.floor(spec.facade.frontBayCount / 2);
  const doorBayCandidates = [centerDoorBay - 1, centerDoorBay, centerDoorBay + 1].filter(
    (bay) => bay >= 0 && bay < spec.facade.frontBayCount
  );
  const doorBay = seedTree.chooseWeighted(
    doorBayCandidates.map((bay) => ({
      value: bay,
      // Prefer center, allow ±1 for visible sample variety.
      weight: bay === centerDoorBay ? 3 : 1
    })),
    "door-bay"
  );

  for (const cell of cells) {
    const wallModule = resolveWallModule(kit, cell, diagnostics);
    if (wallModule) {
      const wallPlacement = createPlacement({
        cell,
        module: wallModule,
        layer: "wall",
        zone:
          cell.facade === "left" || cell.facade === "right"
            ? "side"
            : cell.facade === "rear"
              ? "rear"
              : cell.zone,
        size: wallSizeForCell(cell),
        centerOnFacade: false
      });
      placements.push(wallPlacement);
      diagnostics.push(...validateBoundsFit(wallPlacement, cell));
    }

    const isFrontDoorCell =
      cell.facade === "front" && cell.floorIndex === 0 && cell.bayIndex === doorBay;
    if (isFrontDoorCell) {
      const doorModule = findModule(kit, "door", "ground", diagnostics);
      if (doorModule) {
        const size = placementSizeForFacade(cell.facade, doorModule);
        const doorPlacement = createPlacement({
          cell,
          module: doorModule,
          layer: "opening",
          zone: "ground",
          size,
          centerOnFacade: true
        });
        placements.push(doorPlacement);
        diagnostics.push(...validateBoundsFit(doorPlacement, cell));
      }
      continue;
    }

    if (cell.facade === "front") {
      // Building-seed rhythm: some body bays stay solid wall so samples are not
      // a uniform punched grid of identical openings.
      const openProbability =
        cell.zone === "ground"
          ? 0.92
          : 0.55 + seedTree.float01("front-density") * 0.4;
      if (
        seedTree.float01(`front-open/${cell.floorIndex}/${cell.bayIndex}`) >
        openProbability
      ) {
        continue;
      }
      const windowModule = chooseWindowModule(kit, cell, seedTree);
      if (windowModule) {
        const size = placementSizeForFacade(cell.facade, windowModule);
        const openingPlacement = createPlacement({
          cell,
          module: windowModule,
          layer: "opening",
          zone: cell.zone,
          size,
          centerOnFacade: true
        });
        placements.push(openingPlacement);
        diagnostics.push(...validateBoundsFit(openingPlacement, cell));
      } else {
        findModule(kit, "opening", cell.zone, diagnostics);
      }
      continue;
    }

    if (cell.facade === "rear" && cell.zone === "body") {
      const rearWindow =
        kit.modules.find((module) => module.id === "opening.window.rectangular") ??
        findModule(kit, "opening", "rear", diagnostics) ??
        findModule(kit, "opening", "body", diagnostics);
      if (rearWindow) {
        const size = placementSizeForFacade(cell.facade, rearWindow);
        const openingPlacement = createPlacement({
          cell,
          module: rearWindow,
          layer: "opening",
          zone: "rear",
          size,
          centerOnFacade: true
        });
        placements.push(openingPlacement);
        diagnostics.push(...validateBoundsFit(openingPlacement, cell));
      }
      continue;
    }

    if (
      (cell.facade === "left" || cell.facade === "right") &&
      cell.zone === "body" &&
      seedTree.float01(`side-opening/${cell.facade}/${cell.floorIndex}/${cell.bayIndex}`) < 0.55
    ) {
      const sideWindow =
        kit.modules.find((module) => module.id === "opening.window.rectangular") ??
        findModule(kit, "opening", "side", diagnostics) ??
        findModule(kit, "opening", "body", diagnostics);
      if (sideWindow) {
        const size = placementSizeForFacade(cell.facade, sideWindow);
        const openingPlacement = createPlacement({
          cell,
          module: sideWindow,
          layer: "opening",
          zone: "side",
          size,
          centerOnFacade: true
        });
        placements.push(openingPlacement);
        diagnostics.push(...validateBoundsFit(openingPlacement, cell));
      }
    }
  }

  diagnostics.push(...validateSameFacadeLayerOverlap(placements));

  return {
    schemaVersion: "0.1.0",
    artKitManifestId: kit.id,
    unitMeters: 1,
    plannerId: "seeded-greedy",
    cells,
    placements,
    diagnostics
  };
}
