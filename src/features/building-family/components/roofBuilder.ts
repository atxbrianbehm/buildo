import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { makeComponentRecipe } from "./primitiveBuilders";

export function buildRoofRecipe(spec: BuildingFamilySpec) {
  const isGable = spec.massing.roof.type === "gable";

  return makeComponentRecipe({
    id: `recipe.roof.${spec.selectedFamilies.roof}`,
    kind: isGable ? "gableRoof" : "flatRoof",
    role: "roof",
    dimensionsM: {
      width: spec.massing.widthM,
      height: isGable ? Math.tan(((spec.massing.roof.pitchDegrees ?? 28) * Math.PI) / 180) * spec.massing.depthM * 0.5 : 0.3,
      depth: spec.massing.depthM
    },
    atlasSlotIds: ["roof.primary"],
    uvBehavior: "repeat",
    variationScope: spec.variationPolicy.roof ?? "family",
    attachmentPlane: "massing.top",
    parameterRanges: {
      parapetHeightM: {
        min: Math.max(0, spec.massing.parapetHeightM - 0.2),
        max: spec.massing.parapetHeightM + 0.2
      }
    }
  });
}
