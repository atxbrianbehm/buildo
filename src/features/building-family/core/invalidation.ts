export type ArtifactKind = "intent" | "spec" | "atlas" | "componentCatalog" | "graph" | "geometry";

const invalidationMatrix: Record<string, ArtifactKind[]> = {
  floorCount: ["spec", "graph", "geometry"],
  bayCount: ["spec", "graph", "geometry"],
  buildingSeed: ["spec", "graph", "geometry"],
  familySeed: ["intent", "spec", "atlas", "componentCatalog", "graph", "geometry"],
  materialSeed: ["atlas"],
  trimDensity: ["spec", "componentCatalog", "graph", "geometry"]
};

export function invalidatedArtifactsFor(controlName: string): ArtifactKind[] {
  return invalidationMatrix[controlName] ?? ["intent", "spec", "atlas", "componentCatalog", "graph", "geometry"];
}

