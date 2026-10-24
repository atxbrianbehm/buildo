import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildFacadeCells,
  deriveFacadeBodyOpeningPlacement,
  late19cApartmentKit,
  planFacadeModules,
  sideBayCount,
  type FacadeModulePlan
} from "../art-kit";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";

const frozenSpec = R1AcceptanceCardSchema.parse(JSON.parse(readFileSync(
  path.resolve("docs/reviews/2026-10-14-r1-s3/acceptance-card.json"), "utf8"
))).resolvedSpec;

function bodyRowBays(plan: FacadeModulePlan, facade: "front" | "left" | "right", floorIndex: number): number[] {
  return plan.placements.filter((placement) => placement.layer === "opening" &&
    placement.facade === facade && placement.floorIndex === floorIndex).map((placement) => placement.bayIndex);
}

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
  it("repairs the frozen blind row with 58 windows, one door and deterministic storey masks", () => {
    const plan = planFacadeModules({ spec: frozenSpec, kit: late19cApartmentKit });
    const openings = plan.placements.filter((placement) => placement.layer === "opening");
    expect(openings.filter((placement) => placement.moduleId.includes("door"))).toHaveLength(1);
    expect(openings.filter((placement) => !placement.moduleId.includes("door"))).toHaveLength(58);
    expect([1, 2, 3].map((floor) => bodyRowBays(plan, "front", floor))).toEqual([
      [0, 1, 3, 5, 6], [0, 1, 2, 3, 5, 6], [0, 1, 2, 3, 4, 5, 6]
    ]);
    expect([1, 2, 3].map((floor) => bodyRowBays(plan, "left", floor))).toEqual([
      [0, 1], [0, 1, 2], [0, 1]
    ]);
    expect([1, 2, 3].map((floor) => bodyRowBays(plan, "right", floor))).toEqual([
      [1, 2], [2, 3], [2, 3]
    ]);
    expect(plan.diagnostics).toEqual([]);
  });

  it("preserves the authored semantic choice and exact newly occupied candidate payload", () => {
    const cells = buildFacadeCells(frozenSpec);
    const cell = cells.find((item) => item.id === "cell.front.floor2.bay0")!;
    expect(deriveFacadeBodyOpeningPlacement({ spec: frozenSpec, kit: late19cApartmentKit, cell })).toEqual({
      id: "placement.opening.front.floor2.bay0.opening.window.rectangular",
      moduleId: "opening.window.rectangular", facade: "front", floorIndex: 2, bayIndex: 0,
      zone: "body", layer: "opening", originMeters: [-13.06042857142857, 9.959, -7.5],
      sizeMeters: [1.25, 2.1, 0.42],
      semanticPath: "building/family-86f9731664e70f71/facade/front/floor/2/bay/0/opening/opening.window.rectangular"
    });
    for (const excluded of cells.filter((item) => item.zone === "ground" || item.facade === "rear")) {
      expect(deriveFacadeBodyOpeningPlacement({ spec: frozenSpec, kit: late19cApartmentKit, cell: excluded })).toBeUndefined();
    }
  });

  it("uses the same candidates for selected cells and retains candidates for closed bays", () => {
    const plan = planFacadeModules({ spec: frozenSpec, kit: late19cApartmentKit });
    for (const cell of plan.cells.filter((item) => item.zone === "body" && item.facade !== "rear")) {
      const candidate = deriveFacadeBodyOpeningPlacement({ spec: frozenSpec, kit: late19cApartmentKit, cell });
      expect(candidate).toBeDefined();
      const selected = plan.placements.find((placement) => placement.id === candidate!.id);
      if (selected) expect(selected).toEqual(candidate);
    }
    const closedCell = plan.cells.find((cell) => cell.id === "cell.front.floor1.bay2")!;
    const closedCandidate = deriveFacadeBodyOpeningPlacement({ spec: frozenSpec, kit: late19cApartmentKit, cell: closedCell });
    expect(closedCandidate).toBeDefined();
    expect(plan.placements.some((placement) => placement.id === closedCandidate!.id)).toBe(false);
  });

  it.each([
    [2, 3, 3.6, 3.4], [2, 10, 4.8, 3.7], [8, 3, 4.8, 3.7], [8, 10, 3.6, 3.4]
  ])("keeps meaningful row minima across legal endpoints: %i floors, %i front bays, %fm sides, %fm body", (floors, bays, spacing, height) => {
    const masks = new Set<string>();
    for (const seed of ["building-seed", "a", "b", "c", "seed-17", "seed-18", "seed-19", "seed-20"]) {
      const spec: BuildingFamilySpec = structuredClone(frozenSpec);
      spec.seeds.building = seed;
      spec.massing.floorCount = floors;
      spec.massing.floorHeightsM = [5.6, ...Array<number>(floors - 1).fill(height)];
      spec.massing.widthM = 40;
      spec.facade.frontBayCount = bays;
      spec.facade.sideBaySpacingM = spacing;
      const plan = planFacadeModules({ spec, kit: late19cApartmentKit });
      expect(plan).toEqual(planFacadeModules({ spec, kit: late19cApartmentKit }));
      expect(plan.diagnostics).toEqual([]);
      const rows: number[][] = [];
      for (let floor = 1; floor < floors; floor += 1) {
        for (const facade of ["front", "left", "right"] as const) {
          const present = bodyRowBays(plan, facade, floor);
          const rowSize = facade === "front" ? bays : sideBayCount(spec);
          expect(present.length).toBeGreaterThanOrEqual(Math.ceil(rowSize * (facade === "front" ? 0.7 : 0.5)));
          expect(present.length).toBeLessThanOrEqual(rowSize);
          expect(new Set(present).size).toBe(present.length);
          expect(present).toEqual([...present].sort((a, b) => a - b));
          rows.push(present);
        }
      }
      masks.add(JSON.stringify(rows));
    }
    expect(masks.size).toBeGreaterThanOrEqual(4);
  });

  it("preserves cell traversal, wall extents, storefront grammar and every rear bay", () => {
    const plan = planFacadeModules({ spec: frozenSpec, kit: late19cApartmentKit });
    expect(plan.cells).toEqual(buildFacadeCells(frozenSpec));
    const cellOrder = new Map(plan.cells.map((cell, index) => [cell.id, index]));
    let previous = -1;
    for (const placement of plan.placements) {
      const cellId = `cell.${placement.facade}.floor${placement.floorIndex}.bay${placement.bayIndex}`;
      const order = cellOrder.get(cellId)!;
      expect(order).toBeGreaterThanOrEqual(previous);
      previous = order;
    }
    expect(plan.placements.filter((placement) => placement.layer === "wall")).toHaveLength(plan.cells.length);
    for (const cell of plan.cells) {
      const wall = plan.placements.find((placement) => placement.layer === "wall" &&
        placement.facade === cell.facade && placement.floorIndex === cell.floorIndex && placement.bayIndex === cell.bayIndex)!;
      expect(wall.originMeters).toEqual(cell.originMeters);
      expect(wall.sizeMeters).toEqual(cell.sizeMeters);
    }
    const ground = plan.placements.filter((placement) => placement.facade === "front" && placement.floorIndex === 0);
    expect(ground.filter((placement) => placement.moduleId === "storefront.bulkhead.panel")).toHaveLength(7);
    expect(ground.filter((placement) => placement.moduleId === "storefront.lintel.band")).toHaveLength(7);
    expect(ground.filter((placement) => placement.moduleId === "storefront.glazing.bay")).toHaveLength(6);
    expect(ground.filter((placement) => placement.moduleId === "storefront.door.recessed")).toHaveLength(1);
    for (const floor of [1, 2, 3]) {
      expect(plan.placements.filter((placement) => placement.facade === "rear" &&
        placement.floorIndex === floor && placement.layer === "opening").map((placement) => placement.bayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
    expect(plan.placements.some((placement) => placement.layer === "opening" && placement.floorIndex === 0 && placement.facade !== "front")).toBe(false);
  });

  it("leaves the spec, kit and candidate cell immutable", () => {
    const spec = structuredClone(frozenSpec);
    const kit = structuredClone(late19cApartmentKit);
    const cell = buildFacadeCells(spec).find((item) => item.id === "cell.left.floor1.bay0")!;
    const before = structuredClone({ spec, kit, cell });
    planFacadeModules({ spec, kit });
    deriveFacadeBodyOpeningPlacement({ spec, kit, cell });
    expect({ spec, kit, cell }).toEqual(before);
  });

  it("retains missing-opening diagnostics for selected front and side body candidates", () => {
    const kit = { ...late19cApartmentKit, modules: late19cApartmentKit.modules.filter((module) => module.kind !== "opening") };
    const plan = planFacadeModules({ spec: frozenSpec, kit });
    const missing = plan.diagnostics.filter((diagnostic) => diagnostic.code === "artKit.facadePlanner.missingModule" && diagnostic.path === "modules.opening");
    expect(missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ received: "body", severity: "error" }),
      expect.objectContaining({ received: "side", severity: "error" })
    ]));
    const cell = plan.cells.find((item) => item.id === "cell.front.floor2.bay0")!;
    expect(deriveFacadeBodyOpeningPlacement({ spec: frozenSpec, kit, cell })).toBeUndefined();
  });

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
