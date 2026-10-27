import { readConstructionCorniceDetailPlan } from "../core/constructionCorniceDetail";
import { constructionProfileRing, poseGeometry, type ConstructionFacePose } from "./buildingShellGeometry";
import { extrudeConstructionOpeningTrim } from "./constructionOpeningTrimGeometry";
import { buildConstructionBevelledBox } from "./constructionBevelledBox";
import type { PrimitiveGeometry } from "./primitiveGeometry";

/** Compiler-source coordinates: globalMesh applies the compiler's front-Z reflection once. */
export function buildConstructionCorniceGeometry(input: unknown): { backing: PrimitiveGeometry; units: PrimitiveGeometry[] } {
  const plan = readConstructionCorniceDetailPlan(input), b = plan.source.building, recipe = plan.recipe;
  const backing = constructionProfileRing(b.widthM,b.depthM,plan.backingProfile.map(point => ({ y:point.yM,offset:point.depthM })));
  if (recipe.kind === "none") return { backing, units:[] };
  const prototype = recipe.kind === "dentil" ? buildConstructionBevelledBox({
    center:[0,(recipe.bottomM+recipe.topM)/2,(recipe.backDepthM+recipe.frontDepthM)/2],
    size:[recipe.widthM,recipe.topM-recipe.bottomM,recipe.frontDepthM-recipe.backDepthM],bevelM:recipe.bevelM
  }) : extrudeConstructionOpeningTrim({
    profile:{id:"construction.cornice.bracket",label:"Procedural cornice bracket",points:recipe.profile.map(point => ({u:point.yM,d:point.depthM-recipe.backDepthM}))},
    center:[0,(recipe.profile[0].yM+recipe.profile.at(-1)!.yM)/2,recipe.backDepthM],runLengthM:recipe.widthM
  });
  // These are the source-space conjugates of the facade poses. Global Z reflection
  // maps each logical face back to its actual building face, with outward winding.
  const poses: Record<typeof plan.units[number]["face"], ConstructionFacePose> = {
    front:{cosine:1,sine:0,x:0,z:b.depthM/2,uvOffsetM:0},
    right:{cosine:0,sine:1,x:b.widthM/2,z:0,uvOffsetM:0},
    rear:{cosine:-1,sine:0,x:0,z:-b.depthM/2,uvOffsetM:0},
    left:{cosine:0,sine:-1,x:-b.widthM/2,z:0,uvOffsetM:0}
  };
  const units = plan.units.map(unit => {
    const geometry = poseGeometry({ ...prototype,
      positions:prototype.positions.map((value,i) => i%3===0 ? value+unit.centerAlongM : value),
      uvs:[...prototype.uvs],indices:[...prototype.indices]
    },poses[unit.face]);
    return geometry;
  });
  return { backing,units };
}
