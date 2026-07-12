import type { BuildingGraph } from "../contracts/buildingGraph";
import type { Diagnostic } from "../core/diagnostics";
import type { ArtKitFacadeName } from "./facadeModulePlanner";

export interface ArtKitFacadePlanPlacementSummary {
  id: string;
  moduleId: string;
  facade: ArtKitFacadeName | string;
  layer: string;
  floorIndex?: number;
  bayIndex?: number;
}

export interface ArtKitFacadePlanSummary {
  schemaVersion: "0.1.0";
  present: boolean;
  artKitManifestId?: string;
  plannerId?: string;
  unitMeters?: number;
  cellCount: number;
  placementCount: number;
  placementsByFacade: Record<string, number>;
  diagnostics: Diagnostic[];
  samplePlacements: ArtKitFacadePlanPlacementSummary[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asDiagnostics(value: unknown): Diagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Diagnostic => {
    const record = asRecord(item);
    return Boolean(record && asString(record.code) && asString(record.message) && asString(record.severity));
  });
}

function asPlacements(value: unknown): ArtKitFacadePlanPlacementSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const placements: ArtKitFacadePlanPlacementSummary[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const id = asString(record.id);
    const moduleId = asString(record.moduleId);
    const facade = asString(record.facade);
    const layer = asString(record.layer);
    if (!id || !moduleId || !facade || !layer) {
      continue;
    }
    placements.push({
      id,
      moduleId,
      facade,
      layer,
      floorIndex: asNumber(record.floorIndex),
      bayIndex: asNumber(record.bayIndex)
    });
  }
  return placements;
}

export function emptyArtKitFacadePlanSummary(): ArtKitFacadePlanSummary {
  return {
    schemaVersion: "0.1.0",
    present: false,
    cellCount: 0,
    placementCount: 0,
    placementsByFacade: {},
    diagnostics: [],
    samplePlacements: []
  };
}

export function summarizeArtKitFacadePlanFromGraph(graph: BuildingGraph | null | undefined): ArtKitFacadePlanSummary {
  if (!graph) {
    return emptyArtKitFacadePlanSummary();
  }

  const node = graph.nodes.find((candidate) => candidate.id === "node.art-kit-facade-plan" && candidate.type === "Group");
  if (!node) {
    return emptyArtKitFacadePlanSummary();
  }

  const parameters = node.parameters;
  const placements = asPlacements(parameters.placements);
  const placementsByFacade: Record<string, number> = {};
  for (const placement of placements) {
    placementsByFacade[placement.facade] = (placementsByFacade[placement.facade] ?? 0) + 1;
  }

  return {
    schemaVersion: "0.1.0",
    present: true,
    artKitManifestId: asString(parameters.artKitManifestId),
    plannerId: asString(parameters.plannerId),
    unitMeters: asNumber(parameters.unitMeters),
    cellCount: asNumber(parameters.cellCount) ?? 0,
    placementCount: asNumber(parameters.placementCount) ?? placements.length,
    placementsByFacade,
    diagnostics: asDiagnostics(parameters.diagnostics),
    samplePlacements: placements.slice(0, 8)
  };
}
