import {
  buildModuleInstanceSet,
  late19cApartmentKit,
  planFacadeModules
} from "../art-kit";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { ModuleInstanceSetSchema } from "../contracts/moduleInstanceSet";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-test",
    sourceIntentHash: "intent-test",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 28,
      depthM: 18,
      floorCount: 4,
      floorHeightsM: [4, 3, 3, 3],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 7,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

describe("buildModuleInstanceSet", () => {
  it("expands facade placements into deterministic module instances", async () => {
    const spec = fixtureSpec();
    const plan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const first = await buildModuleInstanceSet({ spec, kit: late19cApartmentKit, plan });
    const second = await buildModuleInstanceSet({ spec, kit: late19cApartmentKit, plan });

    expect(first).toEqual(second);
    expect(ModuleInstanceSetSchema.safeParse(first).success).toBe(true);
    expect(first.instances.length).toBe(plan.placements.length);
    expect(first.sourcePlanHash.length).toBeGreaterThan(8);
    expect(first.instances.some((instance) => instance.layer === "opening")).toBe(true);
    expect(first.instances.some((instance) => instance.moduleId === "storefront.door.recessed")).toBe(true);
    expect(first.instances.every((instance) => instance.transform.length === 16)).toBe(true);
  });

  it("reports missing modules without throwing", async () => {
    const spec = fixtureSpec();
    const plan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const brokenPlan = {
      ...plan,
      placements: [
        ...plan.placements,
        {
          ...plan.placements[0],
          id: "placement.wall.front.floor0.bay0.missing",
          moduleId: "module.does.not.exist"
        }
      ],
      diagnostics: []
    };

    const result = await buildModuleInstanceSet({
      spec,
      kit: late19cApartmentKit,
      plan: brokenPlan
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.moduleInstance.missingModule",
        received: "module.does.not.exist"
      })
    );
    expect(result.instances.every((instance) => instance.moduleId !== "module.does.not.exist")).toBe(true);
  });
});
