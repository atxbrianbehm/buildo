import { BoxGeometry, BufferAttribute, BufferGeometry } from "three";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import { buildOpeningAssemblyGeometry } from "../compiler/openingGeometry";

function isOpeningRole(role: string): boolean {
  return (
    role === "window" ||
    role === "door" ||
    role === "windowGlass" ||
    role === "doorGlass" ||
    role === "opening"
  );
}

function bufferFromOpeningRecipe(recipe: ComponentRecipe): BufferGeometry {
  const assembly = buildOpeningAssemblyGeometry({
    recipe,
    detail: "high",
    part: recipe.role.includes("Glass") || recipe.role === "windowGlass" || recipe.role === "doorGlass" ? "glass" : "frame"
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(assembly.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(assembly.normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(assembly.uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(assembly.indices), 1));
  geometry.computeBoundingBox();
  geometry.name = `recipe-geometry.opening.${recipe.id}`;
  geometry.userData = {
    recipeId: recipe.id,
    generatedFromRecipe: true,
    openingAssembly: true
  };
  return geometry;
}

export function createRecipeBufferGeometry(recipe: ComponentRecipe): BufferGeometry {
  if (isOpeningRole(recipe.role)) {
    return bufferFromOpeningRecipe(recipe);
  }

  const geometry = new BoxGeometry(
    recipe.dimensionsM.width,
    recipe.dimensionsM.height,
    Math.max(recipe.dimensionsM.depth, 0.01)
  );
  geometry.name = `recipe-geometry.${recipe.id}`;
  geometry.userData = {
    recipeId: recipe.id,
    generatedFromRecipe: true
  };
  return geometry;
}
