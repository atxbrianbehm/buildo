import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { VariationScope } from "../contracts/shared";

export interface RecipeDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface RecipeAnchor {
  id: string;
  position: [number, number, number];
  normal?: [number, number, number];
}

export interface BaseRecipeInput {
  id: string;
  kind: ComponentRecipe["kind"];
  role: string;
  dimensionsM: RecipeDimensions;
  atlasSlotIds: string[];
  uvBehavior: ComponentRecipe["uvBehavior"];
  variationScope: VariationScope;
  attachmentPlane?: string;
  anchors?: RecipeAnchor[];
  subcomponentRecipeIds?: string[];
  parameterRanges?: ComponentRecipe["parameterRanges"];
  profileRecipeId?: string;
  lowDetailRecipeId?: string;
}

export function makeComponentRecipe(input: BaseRecipeInput): ComponentRecipe {
  return {
    schemaVersion: "0.1.0",
    id: input.id,
    kind: input.kind,
    role: input.role,
    dimensionsM: input.dimensionsM,
    parameterRanges: input.parameterRanges ?? {},
    anchors: input.anchors ?? [
      {
        id: "origin",
        position: [0, 0, 0],
        normal: [0, 0, 1]
      }
    ],
    attachmentPlane: input.attachmentPlane,
    subcomponentRecipeIds: input.subcomponentRecipeIds,
    atlasSlotIds: input.atlasSlotIds,
    profileRecipeId: input.profileRecipeId,
    uvBehavior: input.uvBehavior,
    variationScope: input.variationScope,
    lowDetailRecipeId: input.lowDetailRecipeId ?? input.id
  };
}

export function bayWidth(widthM: number, bayCount: number): number {
  return widthM / bayCount;
}

export function typicalFloorHeight(floorHeightsM: number[]): number {
  return floorHeightsM[1] ?? floorHeightsM[0];
}
