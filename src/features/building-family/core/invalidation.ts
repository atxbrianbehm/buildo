import type { Seeds } from "../contracts/shared";

export type ArtifactKind = "intent" | "spec" | "atlas" | "componentCatalog" | "graph" | "geometry";

export type BuildingInvalidationStage =
  | "psgEvaluation"
  | "normalizedSpec"
  | "atlasPlan"
  | "materialSources"
  | "packedAtlas"
  | "componentCatalog"
  | "buildingGraph"
  | "runtimeBuildingIr"
  | "gpuScene";

export type BuildingInvalidationImpact =
  | "none"
  | "partial"
  | "full"
  | "trimOnly"
  | "affectedSources"
  | "materialRefresh"
  | "branch"
  | "branchOrFullMvp";

export type BuildingControlName =
  | "prompt"
  | "stylePack"
  | "familySeed"
  | "buildingSeed"
  | "materialSeed"
  | "trimSeed"
  | "floorCount"
  | "bayCount"
  | "roofType"
  | "trimDensity"
  | "localComponentLock"
  | "weathering";

export interface BuildingControlSnapshot {
  prompt: string;
  stylePackId: string;
  seeds: Seeds;
  floorCount: number;
  bayCount: number;
  roofType: string;
  trimDensity: string;
  weathering?: number;
  lockedComponentKeys?: string[];
}

export interface BuildingInvalidation {
  changedControls: BuildingControlName[];
  invalidatedStages: BuildingInvalidationStage[];
  stageImpacts: Record<BuildingInvalidationStage, BuildingInvalidationImpact>;
  materialGenerationRequired: boolean;
  reusableArtifacts: {
    materialSources: boolean;
    packedAtlas: boolean;
    componentCatalog: boolean;
  };
}

const stageOrder: BuildingInvalidationStage[] = [
  "psgEvaluation",
  "normalizedSpec",
  "atlasPlan",
  "materialSources",
  "packedAtlas",
  "componentCatalog",
  "buildingGraph",
  "runtimeBuildingIr",
  "gpuScene"
];

const noImpact: Record<BuildingInvalidationStage, BuildingInvalidationImpact> = {
  psgEvaluation: "none",
  normalizedSpec: "none",
  atlasPlan: "none",
  materialSources: "none",
  packedAtlas: "none",
  componentCatalog: "none",
  buildingGraph: "none",
  runtimeBuildingIr: "none",
  gpuScene: "none"
};

const fullImpact: Record<BuildingInvalidationStage, BuildingInvalidationImpact> = {
  psgEvaluation: "full",
  normalizedSpec: "full",
  atlasPlan: "full",
  materialSources: "full",
  packedAtlas: "full",
  componentCatalog: "full",
  buildingGraph: "full",
  runtimeBuildingIr: "full",
  gpuScene: "full"
};

const controlImpactMatrix: Record<BuildingControlName, Record<BuildingInvalidationStage, BuildingInvalidationImpact>> = {
  prompt: fullImpact,
  stylePack: {
    ...fullImpact,
    psgEvaluation: "none"
  },
  familySeed: fullImpact,
  materialSeed: {
    ...noImpact,
    normalizedSpec: "partial",
    materialSources: "full",
    packedAtlas: "full",
    gpuScene: "materialRefresh"
  },
  trimSeed: {
    ...noImpact,
    normalizedSpec: "partial",
    atlasPlan: "partial",
    materialSources: "trimOnly",
    packedAtlas: "full",
    componentCatalog: "trimOnly",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  floorCount: {
    ...noImpact,
    normalizedSpec: "partial",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  bayCount: {
    ...noImpact,
    normalizedSpec: "partial",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  buildingSeed: {
    ...noImpact,
    normalizedSpec: "partial",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  roofType: {
    ...noImpact,
    normalizedSpec: "partial",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  trimDensity: {
    ...noImpact,
    normalizedSpec: "partial",
    atlasPlan: "partial",
    materialSources: "trimOnly",
    packedAtlas: "full",
    componentCatalog: "trimOnly",
    buildingGraph: "full",
    runtimeBuildingIr: "full",
    gpuScene: "full"
  },
  localComponentLock: {
    ...noImpact,
    normalizedSpec: "partial",
    componentCatalog: "partial",
    buildingGraph: "branch",
    runtimeBuildingIr: "branchOrFullMvp",
    gpuScene: "full"
  },
  weathering: {
    ...noImpact,
    normalizedSpec: "partial",
    materialSources: "affectedSources",
    packedAtlas: "full",
    gpuScene: "materialRefresh"
  }
};

const legacyArtifactMatrix: Record<string, ArtifactKind[]> = {
  floorCount: ["spec", "graph", "geometry"],
  bayCount: ["spec", "graph", "geometry"],
  buildingSeed: ["spec", "graph", "geometry"],
  familySeed: ["intent", "spec", "atlas", "componentCatalog", "graph", "geometry"],
  materialSeed: ["atlas"],
  trimSeed: ["spec", "componentCatalog", "graph", "geometry"],
  trimDensity: ["spec", "componentCatalog", "graph", "geometry"]
};

const impactPriority: Record<BuildingInvalidationImpact, number> = {
  none: 0,
  partial: 1,
  materialRefresh: 2,
  affectedSources: 2,
  trimOnly: 2,
  branch: 3,
  branchOrFullMvp: 4,
  full: 5
};

function mergeImpact(
  current: BuildingInvalidationImpact,
  next: BuildingInvalidationImpact
): BuildingInvalidationImpact {
  return impactPriority[next] > impactPriority[current] ? next : current;
}

function arrayEquals(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  const normalizedLeft = [...(left ?? [])].sort();
  const normalizedRight = [...(right ?? [])].sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function changedControls(previous: BuildingControlSnapshot, next: BuildingControlSnapshot): BuildingControlName[] {
  const changed: BuildingControlName[] = [];

  if (previous.prompt !== next.prompt) changed.push("prompt");
  if (previous.stylePackId !== next.stylePackId) changed.push("stylePack");
  if (previous.seeds.family !== next.seeds.family) changed.push("familySeed");
  if (previous.seeds.building !== next.seeds.building) changed.push("buildingSeed");
  if (previous.seeds.material !== next.seeds.material) changed.push("materialSeed");
  if (previous.seeds.trim !== next.seeds.trim) changed.push("trimSeed");
  if (previous.floorCount !== next.floorCount) changed.push("floorCount");
  if (previous.bayCount !== next.bayCount) changed.push("bayCount");
  if (previous.roofType !== next.roofType) changed.push("roofType");
  if (previous.trimDensity !== next.trimDensity) changed.push("trimDensity");
  if (previous.weathering !== next.weathering) changed.push("weathering");
  if (!arrayEquals(previous.lockedComponentKeys, next.lockedComponentKeys)) {
    changed.push("localComponentLock");
  }

  return changed;
}

export function computeBuildingInvalidation(
  previous: BuildingControlSnapshot,
  next: BuildingControlSnapshot
): BuildingInvalidation {
  const changed = changedControls(previous, next);
  const stageImpacts = { ...noImpact };

  for (const control of changed) {
    const impacts = controlImpactMatrix[control];
    for (const stage of stageOrder) {
      stageImpacts[stage] = mergeImpact(stageImpacts[stage], impacts[stage]);
    }
  }

  return {
    changedControls: changed,
    invalidatedStages: stageOrder.filter((stage) => stageImpacts[stage] !== "none"),
    stageImpacts,
    materialGenerationRequired: stageImpacts.materialSources !== "none",
    reusableArtifacts: {
      materialSources: stageImpacts.materialSources === "none",
      packedAtlas: stageImpacts.packedAtlas === "none",
      componentCatalog: stageImpacts.componentCatalog === "none"
    }
  };
}

export function invalidatedArtifactsFor(controlName: string): ArtifactKind[] {
  return legacyArtifactMatrix[controlName] ?? ["intent", "spec", "atlas", "componentCatalog", "graph", "geometry"];
}
