import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ModuleInstance, ModuleInstanceSet } from "../contracts/moduleInstanceSet";
import { ModuleInstanceSetSchema } from "../contracts/moduleInstanceSet";
import { hashCanonicalJson } from "../core/contentHash";
import type { Diagnostic } from "../core/diagnostics";
import type { ArtKitManifest, ArtKitModule } from "./artKitContracts";
import type { FacadeModulePlan, FacadeModulePlacement } from "./facadeModulePlanner";
import { translationMatrix } from "../compiler/primitiveGeometry";

export interface BuildModuleInstanceSetInput {
  spec: BuildingFamilySpec;
  kit: ArtKitManifest;
  plan: FacadeModulePlan;
  buildingId?: string;
  sourcePlanHash?: string;
}

function moduleById(kit: ArtKitManifest, moduleId: string): ArtKitModule | undefined {
  return kit.modules.find((module) => module.id === moduleId);
}

function placementCenter(placement: FacadeModulePlacement): [number, number, number] {
  return [
    placement.originMeters[0] + placement.sizeMeters[0] / 2,
    placement.originMeters[1] + placement.sizeMeters[1] / 2,
    placement.originMeters[2] + placement.sizeMeters[2] / 2
  ];
}

function buildInstance(
  placement: FacadeModulePlacement,
  module: ArtKitModule
): ModuleInstance {
  const center = placementCenter(placement);
  return {
    id: placement.id,
    moduleId: placement.moduleId,
    recipeRef: {
      id: module.recipe.id,
      kind: module.recipe.kind
    },
    facade: placement.facade,
    layer: placement.layer,
    semanticPath: placement.semanticPath,
    transform: translationMatrix(center),
    boundsMeters: {
      origin: placement.originMeters,
      size: placement.sizeMeters
    },
    materialRoleBindings: { ...module.materialRoles },
    floorIndex: placement.floorIndex,
    bayIndex: placement.bayIndex,
    zone: placement.zone
  };
}

export async function buildModuleInstanceSet(
  input: BuildModuleInstanceSetInput
): Promise<ModuleInstanceSet> {
  const diagnostics: Diagnostic[] = [...input.plan.diagnostics];
  const instances: ModuleInstance[] = [];

  for (const placement of input.plan.placements) {
    const module = moduleById(input.kit, placement.moduleId);
    if (!module) {
      diagnostics.push({
        code: "artKit.moduleInstance.missingModule",
        message: `Placement ${placement.id} references unknown module ${placement.moduleId}.`,
        severity: "error",
        path: placement.id,
        received: placement.moduleId
      });
      continue;
    }
    instances.push(buildInstance(placement, module));
  }

  const sourcePlanHash =
    input.sourcePlanHash ??
    (await hashCanonicalJson({
      artKitManifestId: input.plan.artKitManifestId,
      plannerId: input.plan.plannerId,
      placements: input.plan.placements,
      cells: input.plan.cells
    }));

  return ModuleInstanceSetSchema.parse({
    schemaVersion: "0.1.0",
    buildingId: input.buildingId ?? input.spec.familyId,
    familyId: input.spec.familyId,
    sourcePlanHash,
    instances,
    diagnostics
  });
}
