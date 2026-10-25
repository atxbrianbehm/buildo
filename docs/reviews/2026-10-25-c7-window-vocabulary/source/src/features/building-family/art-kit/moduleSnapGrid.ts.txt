import type { Diagnostic } from "../core/diagnostics";

export type ArtKitPlacementLayer = "wall" | "opening" | "trim" | "roof" | "corner";

export interface ModuleSnapGrid {
  unitMeters: 1;
  epsilonMeters: number;
}

export interface ModulePlacementBounds {
  id: string;
  moduleId?: string;
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
}

export interface LayeredModulePlacementBounds extends ModulePlacementBounds {
  layer: ArtKitPlacementLayer;
}

export function createModuleSnapGrid(): ModuleSnapGrid {
  return { unitMeters: 1, epsilonMeters: 1e-5 };
}

export function snapMeters(value: number, grid: ModuleSnapGrid = createModuleSnapGrid()): number {
  return Math.round(value / grid.unitMeters) * grid.unitMeters;
}

export function isAlignedToGrid(value: number, grid: ModuleSnapGrid = createModuleSnapGrid()): boolean {
  return Math.abs(value - snapMeters(value, grid)) <= grid.epsilonMeters;
}

function snapDiagnostic(code: string, message: string, path: string, received?: unknown): Diagnostic {
  return { code, message, severity: "error", path, received };
}

export function validatePlacementGridAlignment(
  placement: ModulePlacementBounds,
  grid: ModuleSnapGrid = createModuleSnapGrid()
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  placement.originMeters.forEach((value, index) => {
    if (!isAlignedToGrid(value, grid)) {
      diagnostics.push(
        snapDiagnostic(
          "artKit.snapGrid.originOffGrid",
          `Placement ${placement.id} origin coordinate ${index} is not aligned to the ${grid.unitMeters} meter grid.`,
          `${placement.id}.originMeters[${index}]`,
          value
        )
      );
    }
  });
  return diagnostics;
}

export function validateBoundsFit(placement: ModulePlacementBounds, cell: ModulePlacementBounds): Diagnostic[] {
  const overflow = placement.sizeMeters.some((size, index) => size - (cell.sizeMeters[index] ?? 0) > 1e-5);
  if (!overflow) {
    return [];
  }

  return [
    snapDiagnostic(
      "artKit.snapGrid.moduleDoesNotFit",
      `Placement ${placement.id} is larger than facade cell ${cell.id}.`,
      `${placement.id}.sizeMeters`,
      { placement: placement.sizeMeters, cell: cell.sizeMeters }
    )
  ];
}

export function boundsOverlap(a: ModulePlacementBounds, b: ModulePlacementBounds, epsilonMeters = 1e-5): boolean {
  return [0, 1, 2].every((index) => {
    const aMin = a.originMeters[index] ?? 0;
    const aMax = aMin + (a.sizeMeters[index] ?? 0);
    const bMin = b.originMeters[index] ?? 0;
    const bMax = bMin + (b.sizeMeters[index] ?? 0);
    return aMin < bMax - epsilonMeters && bMin < aMax - epsilonMeters;
  });
}

export function validateSameLayerOverlap(placements: LayeredModulePlacementBounds[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      const a = placements[left];
      const b = placements[right];
      if (a && b && a.layer === b.layer && boundsOverlap(a, b)) {
        diagnostics.push(
          snapDiagnostic(
            "artKit.snapGrid.sameLayerOverlap",
            `Placements ${a.id} and ${b.id} overlap on layer ${a.layer}.`,
            "placements",
            [a.id, b.id]
          )
        );
      }
    }
  }
  return diagnostics;
}

/**
 * Facade wall panels intentionally meet at corners in world space.
 * Overlap diagnostics only apply within the same facade + layer.
 */
export function validateSameFacadeLayerOverlap(
  placements: Array<LayeredModulePlacementBounds & { facade: string }>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      const a = placements[left];
      const b = placements[right];
      if (a && b && a.facade === b.facade && a.layer === b.layer && boundsOverlap(a, b)) {
        diagnostics.push(
          snapDiagnostic(
            "artKit.snapGrid.sameLayerOverlap",
            `Placements ${a.id} and ${b.id} overlap on layer ${a.layer} of facade ${a.facade}.`,
            "placements",
            [a.id, b.id]
          )
        );
      }
    }
  }
  return diagnostics;
}
