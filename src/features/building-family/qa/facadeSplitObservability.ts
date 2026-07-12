/**
 * Split observability (G5) — pure metrics from FacadeSplitPlan for QA / trace.
 */

import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildFacadeSplitPlan, wallPrimitivesFromSplitPlan } from "../compiler/facadeSplitPlan";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";

export interface FacadeSplitObservabilitySummary {
  schemaVersion: "0.1.0";
  contentHash: string;
  openingCount: number;
  scopeCount: number;
  storefrontScopeCount: number;
  wallPieceCount: number;
  doorCount: number;
  windowCount: number;
  fidelityMode: "proof" | "kit";
}

export async function buildFacadeSplitObservabilitySummary(input: {
  spec: BuildingFamilySpec;
  catalog: ComponentCatalog;
  fidelityMode: "proof" | "kit";
}): Promise<FacadeSplitObservabilitySummary> {
  const wallRecipe = input.catalog.recipes.find((recipe) => recipe.role === "wall");
  const wallDepthM = Math.max(0.02, wallRecipe?.dimensionsM.depth ?? 0.34);
  const isKit = input.fidelityMode === "kit";
  const facadePlan = isKit
    ? planFacadeModules({ spec: input.spec, kit: late19cApartmentKit })
    : undefined;
  const split = await buildFacadeSplitPlan({
    spec: input.spec,
    wallDepthM,
    facadePlan,
    kit: facadePlan ? late19cApartmentKit : undefined,
    defaultOpeningMode: "front-only"
  });
  const wallPieceCount = wallPrimitivesFromSplitPlan(split).length;
  return {
    schemaVersion: "0.1.0",
    contentHash: split.contentHash,
    openingCount: split.openings.length,
    scopeCount: split.scopes.length,
    storefrontScopeCount: split.scopes.filter((scope) => scope.storefront !== undefined).length,
    wallPieceCount,
    doorCount: split.openings.filter((opening) => opening.kind === "door").length,
    windowCount: split.openings.filter((opening) => opening.kind === "window").length,
    fidelityMode: input.fidelityMode
  };
}
