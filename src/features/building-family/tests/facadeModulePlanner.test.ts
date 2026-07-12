import { buildFacadeCells, late19cApartmentKit, planFacadeModules } from "../art-kit";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

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

describe("facade module planner", () => {
  it("builds grid-aligned cells for front, rear, left, and right facades", () => {
    const spec = fixtureSpec();
    const cells = buildFacadeCells(spec);
    const sideCount = Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));

    expect(cells).toHaveLength(spec.massing.floorCount * (spec.facade.frontBayCount * 2 + sideCount * 2));
    expect(cells[0]).toEqual(
      expect.objectContaining({
        id: "cell.front.floor0.bay0",
        facade: "front",
        floorIndex: 0,
        bayIndex: 0,
        zone: "ground",
        originMeters: [-14, 0, -9],
        sizeMeters: [4, 4, 0.6]
      })
    );
    expect(cells.some((cell) => cell.facade === "left" && cell.zone === "body")).toBe(true);
    expect(cells.every((cell) => cell.semanticPath.startsWith("building/family-test/facade/"))).toBe(true);
  });

  it("varies front window module choices with building seed while remaining deterministic", () => {
    const base = fixtureSpec();
    const seedA = planFacadeModules({
      spec: { ...base, seeds: { ...base.seeds, building: "building-seed-a" } },
      kit: late19cApartmentKit
    });
    const seedAAgain = planFacadeModules({
      spec: { ...base, seeds: { ...base.seeds, building: "building-seed-a" } },
      kit: late19cApartmentKit
    });
    const seedB = planFacadeModules({
      spec: { ...base, seeds: { ...base.seeds, building: "building-seed-b" } },
      kit: late19cApartmentKit
    });

    expect(seedA).toEqual(seedAAgain);
    const frontOpeningsA = seedA.placements
      .filter((placement) => placement.facade === "front" && placement.layer === "opening")
      .map((placement) => `${placement.floorIndex}:${placement.bayIndex}:${placement.moduleId}`);
    const frontOpeningsB = seedB.placements
      .filter((placement) => placement.facade === "front" && placement.layer === "opening")
      .map((placement) => `${placement.floorIndex}:${placement.bayIndex}:${placement.moduleId}`);
    expect(frontOpeningsA).not.toEqual(frontOpeningsB);

    const doorA = seedA.placements.find(
      (placement) => placement.facade === "front" && placement.moduleId.includes("door")
    );
    const doorB = seedB.placements.find(
      (placement) => placement.facade === "front" && placement.moduleId.includes("door")
    );
    expect(doorA).toBeDefined();
    expect(doorB).toBeDefined();
  });

  it("returns a deterministic empty-diagnostic plan for the fixture art kit", () => {
    const spec = fixtureSpec();
    const first = planFacadeModules({ spec, kit: late19cApartmentKit });
    const second = planFacadeModules({ spec, kit: late19cApartmentKit });

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.artKitManifestId).toBe(late19cApartmentKit.id);
    expect(first.unitMeters).toBe(1);
    expect(first.diagnostics).toEqual([]);
    expect(first.placements.length).toBeGreaterThan(first.cells.length);
    expect(first.placements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleId: "wall-panel.brick.body", facade: "front", layer: "wall" }),
        expect.objectContaining({
          moduleId: "storefront.door.recessed",
          facade: "front",
          floorIndex: 0,
          layer: "opening"
        }),
        expect.objectContaining({
          moduleId: "storefront.bulkhead.panel",
          facade: "front",
          floorIndex: 0,
          layer: "trim"
        }),
        expect.objectContaining({
          moduleId: "storefront.lintel.band",
          facade: "front",
          floorIndex: 0,
          layer: "trim"
        }),
        expect.objectContaining({
          moduleId: "storefront.glazing.bay",
          facade: "front",
          floorIndex: 0,
          layer: "opening"
        }),
        expect.objectContaining({ moduleId: "opening.window.rectangular", facade: "rear", layer: "opening" })
      ])
    );
  });

  it("diagnoses modules that cannot fit inside a facade cell", () => {
    const spec = fixtureSpec();
    const oversizedKit = {
      ...late19cApartmentKit,
      modules: late19cApartmentKit.modules.map((module) =>
        module.id === "wall-panel.brick.body"
          ? { ...module, boundsMeters: { ...module.boundsMeters, width: 99 } }
          : module
      )
    };

    const plan = planFacadeModules({ spec, kit: oversizedKit });

    // Wall placements fill cell bounds, so force an oversized opening module instead.
    const oversizedOpeningKit = {
      ...late19cApartmentKit,
      modules: late19cApartmentKit.modules.map((module) =>
        module.id === "opening.window.rectangular"
          ? { ...module, boundsMeters: { width: 99, height: 2.1, depth: 0.42 } }
          : module
      )
    };
    const openingPlan = planFacadeModules({ spec, kit: oversizedOpeningKit });

    expect(
      plan.diagnostics.some((d) => d.code === "artKit.snapGrid.moduleDoesNotFit") ||
        openingPlan.diagnostics.some((d) => d.code === "artKit.snapGrid.moduleDoesNotFit")
    ).toBe(true);
    expect(openingPlan.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.moduleDoesNotFit",
        severity: "error"
      })
    );
  });

  it("diagnoses missing required facade-zone modules instead of silently skipping cells", () => {
    const spec = fixtureSpec();
    const kitWithoutRearWall = {
      ...late19cApartmentKit,
      modules: late19cApartmentKit.modules.filter((module) => module.id !== "wall-panel.brick.body")
    };

    const plan = planFacadeModules({ spec, kit: kitWithoutRearWall });

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.facadePlanner.missingModule",
        path: "modules.wall-panel"
      })
    );
  });
});
