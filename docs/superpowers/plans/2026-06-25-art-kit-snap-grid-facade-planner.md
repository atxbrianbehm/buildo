# Art Kit Snap Grid And Facade Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Slice 2 of the art-fidelity bridge: a renderer-independent snap-grid and facade module planner that can place art-kit modules across front, rear, left, and right facades with deterministic output and diagnostics.

**Architecture:** Keep all new planning logic under `src/features/building-family/art-kit/`. The planner consumes `BuildingFamilySpec` and `ArtKitManifest`, emits a serializable placement plan, and hands a summary into `buildingGraphBuilder` through an existing `Group` graph node. It does not generate geometry, import Three.js, or change renderer behavior.

**Tech Stack:** TypeScript, Zod-backed Buildo contracts, Vitest, existing `SeedTree`, existing `Diagnostic` type, existing `BuildingGraph` `Group` node type.

---

## File Structure

- Create `src/features/building-family/art-kit/moduleSnapGrid.ts`
  - Owns grid rounding, grid-alignment checks, bounds helpers, fit checks, layer-aware overlap checks, and placement diagnostics.
- Create `src/features/building-family/art-kit/facadeModulePlanner.ts`
  - Owns facade cell generation, deterministic module selection, module placement assembly, and plan diagnostics.
- Modify `src/features/building-family/art-kit/index.ts`
  - Exports the snap-grid and facade-planner APIs.
- Modify `src/features/building-family/compiler/buildingGraphBuilder.ts`
  - Calls the facade planner with `late19cApartmentKit` and adds a `Group` node carrying the serializable art-kit facade plan summary.
- Create `src/features/building-family/tests/moduleSnapGrid.test.ts`
  - Tests grid rounding, alignment, fit, and overlap diagnostics.
- Create `src/features/building-family/tests/facadeModulePlanner.test.ts`
  - Tests facade cells, deterministic placements, zone filtering, side/rear treatment, and diagnostics.
- Modify `src/features/building-family/tests/buildingGraphBuilder.test.ts`
  - Verifies the graph contains the art-kit facade plan node and stays deterministic/acyclic.
- Modify `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md`
  - Mark Slice 2 implemented after validation.
- Modify `docs/architecture/dynamic-building-family-integration.md`
  - Add the new snap-grid/planner files to the current-state summary after validation.

## Planned Public API

Use these names consistently across tests and implementation.

```ts
export type ArtKitFacadeName = "front" | "rear" | "left" | "right";
export type ArtKitPlacementLayer = "wall" | "opening" | "trim" | "roof" | "corner";

export interface ModuleSnapGrid {
  unitMeters: 1;
  epsilonMeters: number;
}

export interface ModulePlacementBounds {
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
}

export interface FacadeCell {
  id: string;
  facade: ArtKitFacadeName;
  floorIndex: number;
  bayIndex: number;
  zone: "ground" | "body";
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
  semanticPath: string;
}

export interface FacadeModulePlacement extends ModulePlacementBounds {
  id: string;
  moduleId: string;
  facade: ArtKitFacadeName;
  floorIndex: number;
  bayIndex: number;
  zone: "ground" | "body" | "cornice" | "roof" | "side" | "rear";
  layer: ArtKitPlacementLayer;
  semanticPath: string;
}

export interface FacadeModulePlan {
  schemaVersion: "0.1.0";
  artKitManifestId: string;
  unitMeters: 1;
  cells: FacadeCell[];
  placements: FacadeModulePlacement[];
  diagnostics: Diagnostic[];
}
```

## Task 1: Snap Grid Helpers

**Files:**
- Create: `src/features/building-family/art-kit/moduleSnapGrid.ts`
- Create: `src/features/building-family/tests/moduleSnapGrid.test.ts`
- Modify: `src/features/building-family/art-kit/index.ts`

- [ ] **Step 1: Write the failing grid rounding and alignment tests**

Add this test file:

```ts
import {
  boundsOverlap,
  createModuleSnapGrid,
  isAlignedToGrid,
  snapMeters,
  validateBoundsFit,
  validatePlacementGridAlignment,
  validateSameLayerOverlap
} from "../art-kit";

describe("module snap grid", () => {
  it("snaps meter values to the configured one meter grid", () => {
    const grid = createModuleSnapGrid();

    expect(grid.unitMeters).toBe(1);
    expect(snapMeters(2.49, grid)).toBe(2);
    expect(snapMeters(2.5, grid)).toBe(3);
    expect(snapMeters(-1.49, grid)).toBe(-1);
    expect(isAlignedToGrid(4.0000001, grid)).toBe(true);
    expect(isAlignedToGrid(4.25, grid)).toBe(false);
  });

  it("reports placements that are not aligned to the grid", () => {
    const diagnostics = validatePlacementGridAlignment(
      {
        id: "placement.wall.off-grid",
        moduleId: "wall-panel.brick.body",
        originMeters: [0.5, 0, 0],
        sizeMeters: [2, 3, 0.35]
      },
      createModuleSnapGrid()
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.originOffGrid",
        path: "placement.wall.off-grid.originMeters[0]",
        received: 0.5
      })
    );
  });

  it("checks module bounds fit within facade cells", () => {
    const diagnostics = validateBoundsFit(
      {
        id: "placement.window.too-wide",
        moduleId: "opening.window.rectangular",
        originMeters: [0, 0, 0],
        sizeMeters: [4, 2, 0.42]
      },
      {
        id: "cell.front.0.0",
        originMeters: [0, 0, 0],
        sizeMeters: [3, 4, 0.6]
      }
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.moduleDoesNotFit",
        path: "placement.window.too-wide.sizeMeters"
      })
    );
  });

  it("detects overlap only when placements share the same layer", () => {
    const first = {
      id: "placement.wall.0",
      moduleId: "wall-panel.brick.body",
      layer: "wall" as const,
      originMeters: [0, 0, 0] as [number, number, number],
      sizeMeters: [2, 3, 0.3] as [number, number, number]
    };
    const second = {
      ...first,
      id: "placement.wall.1",
      originMeters: [1, 0, 0] as [number, number, number]
    };
    const opening = {
      ...first,
      id: "placement.opening.0",
      layer: "opening" as const
    };

    expect(boundsOverlap(first, second)).toBe(true);
    expect(validateSameLayerOverlap([first, opening])).toEqual([]);
    expect(validateSameLayerOverlap([first, second])).toContainEqual(
      expect.objectContaining({
        code: "artKit.snapGrid.sameLayerOverlap",
        received: ["placement.wall.0", "placement.wall.1"]
      })
    );
  });
});
```

- [ ] **Step 2: Run the snap-grid test to verify RED**

Run:

```powershell
npm.cmd run test -- moduleSnapGrid
```

Expected: fail because `moduleSnapGrid` exports do not exist.

- [ ] **Step 3: Implement `moduleSnapGrid.ts`**

Create the file with these exports and behavior:

```ts
import type { Diagnostic } from "../core/diagnostics";

export type ArtKitPlacementLayer = "wall" | "opening" | "trim" | "roof" | "corner";

export interface ModuleSnapGrid {
  unitMeters: 1;
  epsilonMeters: number;
}

export interface ModulePlacementBounds {
  id: string;
  moduleId?: string;
  originMeters: [number, number, number];
  sizeMeters: [number, number, number];
}

export interface LayeredModulePlacementBounds extends ModulePlacementBounds {
  layer: ArtKitPlacementLayer;
}

export function createModuleSnapGrid(): ModuleSnapGrid {
  return { unitMeters: 1, epsilonMeters: 1e-5 };
}

export function snapMeters(value: number, grid: ModuleSnapGrid = createModuleSnapGrid()): number {
  return Math.round(value / grid.unitMeters) * grid.unitMeters;
}

export function isAlignedToGrid(value: number, grid: ModuleSnapGrid = createModuleSnapGrid()): boolean {
  return Math.abs(value - snapMeters(value, grid)) <= grid.epsilonMeters;
}

function diagnostic(code: string, message: string, path: string, received?: unknown): Diagnostic {
  return { code, message, severity: "error", path, received };
}

export function validatePlacementGridAlignment(
  placement: ModulePlacementBounds,
  grid: ModuleSnapGrid = createModuleSnapGrid()
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  placement.originMeters.forEach((value, index) => {
    if (!isAlignedToGrid(value, grid)) {
      diagnostics.push(
        diagnostic(
          "artKit.snapGrid.originOffGrid",
          `Placement ${placement.id} origin coordinate ${index} is not aligned to the ${grid.unitMeters} meter grid.`,
          `${placement.id}.originMeters[${index}]`,
          value
        )
      );
    }
  });
  return diagnostics;
}

export function validateBoundsFit(placement: ModulePlacementBounds, cell: ModulePlacementBounds): Diagnostic[] {
  const overflow = placement.sizeMeters.some((size, index) => size - cell.sizeMeters[index] > 1e-5);
  if (!overflow) {
    return [];
  }

  return [
    diagnostic(
      "artKit.snapGrid.moduleDoesNotFit",
      `Placement ${placement.id} is larger than facade cell ${cell.id}.`,
      `${placement.id}.sizeMeters`,
      { placement: placement.sizeMeters, cell: cell.sizeMeters }
    )
  ];
}

export function boundsOverlap(a: ModulePlacementBounds, b: ModulePlacementBounds, epsilonMeters = 1e-5): boolean {
  return [0, 1, 2].every((index) => {
    const aMin = a.originMeters[index];
    const aMax = a.originMeters[index] + a.sizeMeters[index];
    const bMin = b.originMeters[index];
    const bMax = b.originMeters[index] + b.sizeMeters[index];
    return aMin < bMax - epsilonMeters && bMin < aMax - epsilonMeters;
  });
}

export function validateSameLayerOverlap(placements: LayeredModulePlacementBounds[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      const a = placements[left];
      const b = placements[right];
      if (a.layer === b.layer && boundsOverlap(a, b)) {
        diagnostics.push(
          diagnostic(
            "artKit.snapGrid.sameLayerOverlap",
            `Placements ${a.id} and ${b.id} overlap on layer ${a.layer}.`,
            "placements",
            [a.id, b.id]
          )
        );
      }
    }
  }
  return diagnostics;
}
```

- [ ] **Step 4: Export the snap-grid API**

Modify `src/features/building-family/art-kit/index.ts`:

```ts
export * from "./artKitContracts";
export * from "./moduleSnapGrid";
export { late19cApartmentKit } from "./late19cApartmentKit";
```

- [ ] **Step 5: Run the snap-grid test to verify GREEN**

Run:

```powershell
npm.cmd run test -- moduleSnapGrid
```

Expected: pass.

## Task 2: Facade Cell Builder

**Files:**
- Create: `src/features/building-family/art-kit/facadeModulePlanner.ts`
- Create: `src/features/building-family/tests/facadeModulePlanner.test.ts`
- Modify: `src/features/building-family/art-kit/index.ts`

- [ ] **Step 1: Write the failing facade-cell tests**

Add the initial tests:

```ts
import { buildFacadeCells } from "../art-kit";
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
    const sideBayCount = Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));

    expect(cells).toHaveLength(spec.massing.floorCount * (spec.facade.frontBayCount * 2 + sideBayCount * 2));
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
});
```

- [ ] **Step 2: Run the facade planner test to verify RED**

Run:

```powershell
npm.cmd run test -- facadeModulePlanner
```

Expected: fail because `buildFacadeCells` and `planFacadeModules` do not exist.

- [ ] **Step 3: Implement facade-cell generation**

In `facadeModulePlanner.ts`, add the public types from "Planned Public API" and implement `buildFacadeCells(spec)`.

Use these rules:

```ts
const SIDE_PANEL_DEPTH_M = 0.6;

export function sideBayCount(spec: BuildingFamilySpec): number {
  return Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));
}

function floorBaseY(spec: BuildingFamilySpec, floorIndex: number): number {
  return spec.massing.floorHeightsM.slice(0, floorIndex).reduce((total, height) => total + height, 0);
}

function zoneForFloor(floorIndex: number): "ground" | "body" {
  return floorIndex === 0 ? "ground" : "body";
}
```

Build front and rear cells with width `spec.massing.widthM / spec.facade.frontBayCount`, depth `0.6`, and origins starting at `[-width / 2, floorBaseY, -depth / 2]` for front and `[-width / 2, floorBaseY, depth / 2 - 0.6]` for rear.

Build left and right cells with width `0.6`, bay span `spec.massing.depthM / sideBayCount(spec)`, and origins starting at `[-width / 2, floorBaseY, -depth / 2]` for left and `[width / 2 - 0.6, floorBaseY, -depth / 2]` for right.

Every cell id must be `cell.${facade}.floor${floorIndex}.bay${bayIndex}`. Every semantic path must be `building/${spec.familyId}/facade/${facade}/floor/${floorIndex}/bay/${bayIndex}`.

- [ ] **Step 4: Export the facade-planner API**

Modify `src/features/building-family/art-kit/index.ts`:

```ts
export * from "./artKitContracts";
export * from "./facadeModulePlanner";
export * from "./moduleSnapGrid";
export { late19cApartmentKit } from "./late19cApartmentKit";
```

- [ ] **Step 5: Run the facade-cell tests to verify GREEN for cell generation**

Run:

```powershell
npm.cmd run test -- facadeModulePlanner
```

Expected: pass for cell generation.

## Task 3: Deterministic Facade Module Planner

**Files:**
- Modify: `src/features/building-family/art-kit/facadeModulePlanner.ts`
- Modify: `src/features/building-family/tests/facadeModulePlanner.test.ts`

- [ ] **Step 1: Add failing planner happy-path and diagnostics tests**

First update the test import:

```ts
import { buildFacadeCells, late19cApartmentKit, planFacadeModules } from "../art-kit";
```

Then append these tests:

```ts
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
      expect.objectContaining({ moduleId: "door.storefront.recessed", facade: "front", floorIndex: 0, layer: "opening" }),
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

  expect(plan.diagnostics).toContainEqual(
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
```

- [ ] **Step 2: Run the planner tests to verify RED**

Run:

```powershell
npm.cmd run test -- facadeModulePlanner
```

Expected: fail because `planFacadeModules` and diagnostics are incomplete.

- [ ] **Step 3: Implement module lookup and deterministic selection**

Add helpers in `facadeModulePlanner.ts`:

```ts
import type { Diagnostic } from "../core/diagnostics";
import { createSeedTree } from "../core/seedTree";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ArtKitFacadeZone, ArtKitManifest, ArtKitModule, ArtKitModuleKind } from "./artKitContracts";
import { createModuleSnapGrid, validateBoundsFit, validatePlacementGridAlignment, validateSameLayerOverlap } from "./moduleSnapGrid";

function diagnostic(code: string, message: string, path: string, received?: unknown): Diagnostic {
  return { code, message, severity: "error", path, received };
}

function moduleSupportsZone(module: ArtKitModule, zone: ArtKitFacadeZone): boolean {
  return module.facadeZones.includes(zone);
}

function findModule(
  kit: ArtKitManifest,
  kind: ArtKitModuleKind,
  zone: ArtKitFacadeZone,
  diagnostics: Diagnostic[]
): ArtKitModule | undefined {
  const module = kit.modules.find((candidate) => candidate.kind === kind && moduleSupportsZone(candidate, zone));
  if (!module) {
    diagnostics.push(
      diagnostic(
        "artKit.facadePlanner.missingModule",
        `No art-kit module of kind ${kind} supports facade zone ${zone}.`,
        `modules.${kind}`,
        zone
      )
    );
  }
  return module;
}
```

Use `createSeedTree(spec.seeds.family).fork("art-kit/facades")` for deterministic variant selection. For Slice 2, weighted choice only needs to choose between rectangular and arched windows when both fit the cell:

```ts
const windowModule = seedTree.chooseWeighted(
  [
    { value: rectangularWindow, weight: 3 },
    { value: archedWindow, weight: cell.zone === "ground" ? 2 : 1 }
  ].filter((item) => item.value !== undefined) as Array<{ value: ArtKitModule; weight: number }>,
  cell.semanticPath
);
```

- [ ] **Step 4: Implement placement creation**

Implement `planFacadeModules({ spec, kit })` with these rules:

- `cells = buildFacadeCells(spec)`.
- Add one wall placement for every cell using `wall-panel` and zone `body` for body cells, `side` for left/right cells, and `rear` for rear cells when applicable. Use the existing `wall-panel.brick.body` because the fixture supports `body`, `side`, and `rear`.
- Add the storefront door only on front facade, ground floor, center bay.
- Add front openings for all non-door front cells.
- Add rear rectangular windows for body cells.
- Add side rectangular windows only on body cells where `(bayIndex + floorIndex) % 2 === 0`; this is deterministic and avoids blank side facades.
- Placement `originMeters` should be the cell origin with horizontal centering for openings:
  - x-centered for front/rear cells;
  - z-centered for left/right cells;
  - y offset of `cell.originMeters[1] + Math.max(0, (cell.sizeMeters[1] - module.boundsMeters.height) / 2)`.
- Placement `sizeMeters` is `[module.boundsMeters.width, module.boundsMeters.height, module.boundsMeters.depth]`.
- Placement ids must be stable: `placement.${layer}.${facade}.floor${floorIndex}.bay${bayIndex}.${module.id}`.
- Run `validateBoundsFit`, `validatePlacementGridAlignment`, and `validateSameLayerOverlap`.
- Return diagnostics instead of throwing.

- [ ] **Step 5: Run planner tests to verify GREEN**

Run:

```powershell
npm.cmd run test -- facadeModulePlanner moduleSnapGrid
```

Expected: all snap-grid and planner tests pass.

## Task 4: Building Graph Handoff

**Files:**
- Modify: `src/features/building-family/compiler/buildingGraphBuilder.ts`
- Modify: `src/features/building-family/tests/buildingGraphBuilder.test.ts`

- [ ] **Step 1: Write the failing graph handoff test**

In the deterministic graph test, update the expected node type list to include a `Group` node after `SplitBays`. Add this assertion:

```ts
const artKitNode = first.nodes.find((node) => node.id === "node.art-kit-facade-plan");
expect(artKitNode).toEqual(
  expect.objectContaining({
    type: "Group",
    stage: "facade",
    upstreamIds: ["node.bays"]
  })
);
expect(artKitNode?.parameters.artKitManifestId).toBe("late-19c-apartment-kit");
expect(artKitNode?.parameters.placementCount).toBeGreaterThan(0);
expect(artKitNode?.parameters.diagnostics).toEqual([]);
expect(artKitNode?.parameters.placements).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      moduleId: "wall-panel.brick.body",
      layer: "wall",
      facade: "front"
    })
  ])
);
```

The expected node type list should become:

```ts
[
  "CreateRectFootprint",
  "ExtrudeMassing",
  "ForEachFacade",
  "SplitFloors",
  "SplitBays",
  "Group",
  "EmitWallPanel",
  "PlaceOpening",
  "InstanceComponent",
  "InstanceComponent",
  "SweepProfile",
  "EmitRoof",
  "OutputBuilding"
]
```

- [ ] **Step 2: Run graph tests to verify RED**

Run:

```powershell
npm.cmd run test -- buildingGraphBuilder
```

Expected: fail because the graph does not contain `node.art-kit-facade-plan`.

- [ ] **Step 3: Add the facade-plan `Group` node**

Modify `buildingGraphBuilder.ts`:

```ts
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
```

Inside `buildNodes`, compute:

```ts
const facadeModulePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
```

Insert this node immediately after `node.bays`:

```ts
node({
  id: "node.art-kit-facade-plan",
  type: "Group",
  parameters: {
    artKitManifestId: facadeModulePlan.artKitManifestId,
    unitMeters: facadeModulePlan.unitMeters,
    cellCount: facadeModulePlan.cells.length,
    placementCount: facadeModulePlan.placements.length,
    diagnostics: facadeModulePlan.diagnostics,
    placements: facadeModulePlan.placements.map((placement) => ({
      id: placement.id,
      moduleId: placement.moduleId,
      facade: placement.facade,
      floorIndex: placement.floorIndex,
      bayIndex: placement.bayIndex,
      zone: placement.zone,
      layer: placement.layer,
      originMeters: placement.originMeters,
      sizeMeters: placement.sizeMeters,
      semanticPath: placement.semanticPath
    }))
  },
  upstreamIds: ["node.bays"],
  semanticPathTemplate: buildingPath(spec, "art-kit/facade-plan"),
  stage: "facade"
})
```

Change `node.wall-panels.upstreamIds` from `["node.bays"]` to `["node.art-kit-facade-plan"]`.

- [ ] **Step 4: Run graph tests to verify GREEN**

Run:

```powershell
npm.cmd run test -- buildingGraphBuilder
```

Expected: pass, with graph validation still returning `[]`.

## Task 5: Documentation And Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md`
- Modify: `docs/architecture/dynamic-building-family-integration.md`

- [ ] **Step 1: Update the art-fidelity roadmap status**

Under `### Slice 2: Snap Grid And Facade Module Planner`, add:

```md
Status: implemented on 2026-06-25. The art-kit layer now includes one-meter snap-grid helpers, facade cell planning, deterministic module placements for front/rear/side facades, placement diagnostics, and a graph-builder handoff node.
```

- [ ] **Step 2: Update the integration map**

Change the status line to:

```md
**Status:** Milestone 8 Slice 2 art-kit snap grid and facade planner
```

Extend the repository-state paragraph to mention:

```md
art-kit snap-grid helpers and a facade module planner that emits deterministic, diagnostic-backed front/rear/side placement plans into the building graph through a renderer-independent Group node
```

- [ ] **Step 3: Run focused validation**

Run:

```powershell
npm.cmd run test -- moduleSnapGrid facadeModulePlanner buildingGraphBuilder
```

Expected: all focused tests pass.

- [ ] **Step 4: Run full validation**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected:

- Vitest passes.
- TypeScript passes.
- ESLint passes.
- Vite build exits 0. The existing large-chunk warning is acceptable if it remains only a warning.
- Git whitespace check exits 0.

- [ ] **Step 5: Commit and push the completed slice**

Run:

```powershell
git add src/features/building-family/art-kit/moduleSnapGrid.ts src/features/building-family/art-kit/facadeModulePlanner.ts src/features/building-family/art-kit/index.ts src/features/building-family/compiler/buildingGraphBuilder.ts src/features/building-family/tests/moduleSnapGrid.test.ts src/features/building-family/tests/facadeModulePlanner.test.ts src/features/building-family/tests/buildingGraphBuilder.test.ts docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md docs/architecture/dynamic-building-family-integration.md
git commit -m "Add art kit facade module planner"
git push
```

Expected: commit is pushed to `origin/main`.

## Self-Review

- Spec coverage: Task 1 covers 1 meter grid increments and placement diagnostics. Task 2 covers floor/bay cells and front/rear/side facades. Task 3 covers deterministic module selection, facade-zone constraints, side/rear treatment, fit diagnostics, and overlap diagnostics. Task 4 connects the planner to the building graph. Task 5 covers docs, validation, commit, and push.
- Placeholder scan: this plan contains no unresolved placeholder tokens or unspecified implementation steps.
- Type consistency: the API names in tests, implementation tasks, and graph handoff all use `buildFacadeCells`, `planFacadeModules`, `FacadeModulePlan`, `FacadeModulePlacement`, `createModuleSnapGrid`, `validatePlacementGridAlignment`, `validateBoundsFit`, and `validateSameLayerOverlap`.
