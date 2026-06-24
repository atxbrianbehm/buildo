export type FacadeSide = "front" | "rear" | "left" | "right";

export interface BaySemanticPathInput {
  buildingId: string;
  facade: FacadeSide;
  floor: number;
  bay: number;
  role: string;
  subrole: string;
}

export function baySemanticPath(input: BaySemanticPathInput): string {
  return [
    "building",
    input.buildingId,
    "facade",
    input.facade,
    "floor",
    input.floor,
    "bay",
    input.bay,
    input.role,
    input.subrole
  ].join("/");
}

export function corniceSemanticPath(buildingId: string, subrole = "primary"): string {
  return `building/${buildingId}/facade/front/cornice/${subrole}`;
}

