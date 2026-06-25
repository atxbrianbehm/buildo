# Profiled Trim And Cornice Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Slice 3 of the art-fidelity bridge: reusable profiled trim, layered cornice, roof-cap, corner-quoin, and shallow-pilaster geometry that upgrades high-detail output while preserving the existing low-detail output path.

**Architecture:** Keep component recipe declarations in `src/features/building-family/components/` and renderer-independent mesh primitive construction in `src/features/building-family/compiler/`. The compiler continues to emit typed-array `RuntimeBuildingIR` batches; this slice only changes how high-detail trim geometry is planned and batched. Execute this after Slice 2 lands, because the final compiler integration should coexist with the art-kit facade-plan graph node.

**Tech Stack:** TypeScript, Vitest, existing `ComponentRecipe` contracts, existing `PrimitiveGeometry` helpers, existing `RuntimeBuildingIR`, existing high/low detail compiler switch.

---

## File Structure

- Create `src/features/building-family/components/profiledTrimBuilder.ts`
  - Owns recipe builders for horizontal belt courses, vertical pilasters, layered cornices, and roof-cap trim recipes.
- Create `src/features/building-family/components/quoinBuilder.ts`
  - Owns the corner-quoin component recipe.
- Modify `src/features/building-family/components/profileSweepBuilder.ts`
  - Re-export or delegate `buildCorniceRecipe` to the new profiled trim builder so existing imports remain stable.
- Modify `src/features/building-family/components/frameBuilder.ts`
  - Replace the current `buildTrimRecipes` body with calls into `profiledTrimBuilder.ts` while preserving its exported function name.
- Modify `src/features/building-family/components/componentCatalogBuilder.ts`
  - Add the quoin recipe and roof-cap recipe to the catalog.
- Create `src/features/building-family/compiler/profiledTrimGeometry.ts`
  - Owns box-composed profile primitives for cornices, belt courses, roof caps, quoins, and trim end caps.
- Modify `src/features/building-family/compiler/buildingCompiler.ts`
  - Replace the single-box cornice mesh with layered profile primitives.
  - Add high-detail-only mesh batches for horizontal belt courses, roof caps, and corner quoins.
  - Preserve the low-detail output shape: `mesh.wall-panels`, `mesh.roof`, `instances.window`, and `instances.door`.
- Create `src/features/building-family/tests/profiledTrimBuilder.test.ts`
  - Tests recipe ids, roles, slots, profile ids, and low-detail fallback references.
- Create `src/features/building-family/tests/quoinBuilder.test.ts`
  - Tests quoin recipe shape and validation.
- Create `src/features/building-family/tests/profiledTrimGeometry.test.ts`
  - Tests primitive counts, bounds, normals, and typed geometry readiness.
- Modify `src/features/building-family/tests/componentCatalogBuilder.test.ts`
  - Updates expected catalog recipe ids and verifies new trim/quoin recipes validate.
- Modify `src/features/building-family/tests/buildingCompiler.test.ts`
  - Verifies high-detail IR includes layered trim batches and low-detail still omits decorative trim.
- Modify `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md`
  - Mark Slice 3 implemented after validation.
- Modify `docs/architecture/dynamic-building-family-integration.md`
  - Add new geometry ownership and current-state summary after validation.

## Planned Public API

Use these names consistently.

```ts
export interface ProfileLayer {
  id: string;
  offsetM: [number, number, number];
  sizeM: [number, number, number];
}

export interface ProfiledRunInput {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  layers: ProfileLayer[];
}

export function buildProfiledRunPrimitives(input: ProfiledRunInput): PrimitiveGeometry[];
export function buildCorniceProfilePrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[];
export function buildHorizontalBeltCoursePrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[];
export function buildRoofCapPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[];
export function buildCornerQuoinPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[];
```

## Task 1: Profiled Trim Recipe Builders

**Files:**
- Create: `src/features/building-family/components/profiledTrimBuilder.ts`
- Modify: `src/features/building-family/components/profileSweepBuilder.ts`
- Modify: `src/features/building-family/components/frameBuilder.ts`
- Test: `src/features/building-family/tests/profiledTrimBuilder.test.ts`

- [ ] **Step 1: Write the failing profiled trim recipe tests**

Create `src/features/building-family/tests/profiledTrimBuilder.test.ts`:

```ts
import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import {
  buildCorniceRecipe,
  buildProfiledHorizontalTrimRecipe,
  buildProfiledRoofCapRecipe,
  buildProfiledVerticalTrimRecipe
} from "../components/profiledTrimBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-profiled-trim",
    sourceIntentHash: "intent-profiled-trim",
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
    variationPolicy: { trim: "family", cornice: "family" },
    locks: [],
    diagnostics: []
  };
}

describe("profiled trim builders", () => {
  it("builds validated profile-sweep recipes for belt courses, pilasters, cornices, and roof caps", () => {
    const spec = fixtureSpec();
    const recipes = [
      buildProfiledHorizontalTrimRecipe(spec),
      buildProfiledVerticalTrimRecipe(spec),
      buildCorniceRecipe(spec),
      buildProfiledRoofCapRecipe(spec)
    ];

    expect(recipes.map((recipe) => recipe.id)).toEqual([
      "recipe.trim.pressed-metal.horizontal",
      "recipe.trim.pressed-metal.vertical",
      "recipe.cornice.bracketed-metal.primary",
      "recipe.roof-cap.flat-membrane.profiled"
    ]);
    expect(recipes.map((recipe) => recipe.kind)).toEqual([
      "profileSweep",
      "profileSweep",
      "profileSweep",
      "profileSweep"
    ]);
    expect(recipes.map((recipe) => ComponentRecipeSchema.safeParse(recipe).success)).toEqual([true, true, true, true]);
  });

  it("declares profile ids, material slots, and low-detail fallbacks explicitly", () => {
    const spec = fixtureSpec();
    const horizontal = buildProfiledHorizontalTrimRecipe(spec);
    const vertical = buildProfiledVerticalTrimRecipe(spec);
    const cornice = buildCorniceRecipe(spec);
    const roofCap = buildProfiledRoofCapRecipe(spec);

    expect(horizontal.profileRecipeId).toBe("profile.trim.pressed-metal.belt-course");
    expect(horizontal.atlasSlotIds).toEqual(["trim.horizontal.primary"]);
    expect(horizontal.lowDetailRecipeId).toBe(horizontal.id);
    expect(vertical.profileRecipeId).toBe("profile.trim.pressed-metal.shallow-pilaster");
    expect(vertical.atlasSlotIds).toEqual(["trim.vertical.primary"]);
    expect(cornice.profileRecipeId).toBe("profile.cornice.bracketed-metal.layered");
    expect(cornice.parameterRanges.projectionM).toEqual({ min: 0.24, max: 0.68 });
    expect(roofCap.role).toBe("roofCap");
    expect(roofCap.atlasSlotIds).toEqual(["trim.horizontal.primary"]);
  });
});
```

- [ ] **Step 2: Run the profiled trim builder test to verify RED**

Run:

```powershell
npm.cmd run test -- profiledTrimBuilder
```

Expected: fail because `profiledTrimBuilder.ts` does not exist.

- [ ] **Step 3: Implement `profiledTrimBuilder.ts`**

Create `src/features/building-family/components/profiledTrimBuilder.ts`:

```ts
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";

export function buildProfiledHorizontalTrimRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.trim.${spec.selectedFamilies.trim}.horizontal`,
    kind: "profileSweep",
    role: "horizontalTrim",
    dimensionsM: { width: spec.massing.widthM, height: 0.34, depth: 0.2 },
    atlasSlotIds: ["trim.horizontal.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId: `profile.trim.${spec.selectedFamilies.trim}.belt-course`,
    parameterRanges: {
      projectionM: { min: 0.1, max: 0.28 },
      capHeightM: { min: 0.05, max: 0.12 }
    }
  });
}

export function buildProfiledVerticalTrimRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.trim.${spec.selectedFamilies.trim}.vertical`,
    kind: "profileSweep",
    role: "verticalTrim",
    dimensionsM: { width: 0.34, height: typicalFloorHeight(spec.massing.floorHeightsM), depth: 0.18 },
    atlasSlotIds: ["trim.vertical.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId: `profile.trim.${spec.selectedFamilies.trim}.shallow-pilaster`,
    parameterRanges: {
      projectionM: { min: 0.08, max: 0.22 },
      plinthHeightM: { min: 0.18, max: 0.36 }
    }
  });
}

export function buildCorniceRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.cornice.${spec.selectedFamilies.cornice}.primary`,
    kind: "profileSweep",
    role: "cornice",
    dimensionsM: {
      width: spec.massing.widthM,
      height: spec.facade.corniceHeightM,
      depth: 0.62
    },
    atlasSlotIds: ["cornice.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.cornice ?? "family",
    attachmentPlane: "facade.front",
    profileRecipeId: `profile.cornice.${spec.selectedFamilies.cornice}.layered`,
    parameterRanges: {
      projectionM: { min: 0.24, max: 0.68 },
      bracketSpacingM: { min: 0.6, max: 1.4 },
      crownHeightM: { min: 0.18, max: 0.4 }
    }
  });
}

export function buildProfiledRoofCapRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.roof-cap.${spec.selectedFamilies.roof}.profiled`,
    kind: "profileSweep",
    role: "roofCap",
    dimensionsM: { width: spec.massing.widthM, height: 0.22, depth: 0.34 },
    atlasSlotIds: ["trim.horizontal.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.roof ?? "family",
    attachmentPlane: "massing.top",
    profileRecipeId: `profile.roof-cap.${spec.selectedFamilies.roof}.parapet-cap`,
    parameterRanges: {
      projectionM: { min: 0.08, max: 0.22 }
    }
  });
}

export function buildTrimRecipes(spec: BuildingFamilySpec) {
  return [buildProfiledHorizontalTrimRecipe(spec), buildProfiledVerticalTrimRecipe(spec)];
}
```

- [ ] **Step 4: Preserve existing builder imports**

Modify `src/features/building-family/components/profileSweepBuilder.ts`:

```ts
export { buildCorniceRecipe } from "./profiledTrimBuilder";
```

Modify `src/features/building-family/components/frameBuilder.ts` so its `buildTrimRecipes` export delegates:

```ts
export { buildTrimRecipes } from "./profiledTrimBuilder";
```

Keep the existing wall, window, recess, and door builders unchanged.

- [ ] **Step 5: Run the profiled trim builder test to verify GREEN**

Run:

```powershell
npm.cmd run test -- profiledTrimBuilder
```

Expected: pass.

## Task 2: Corner Quoin Recipe

**Files:**
- Create: `src/features/building-family/components/quoinBuilder.ts`
- Test: `src/features/building-family/tests/quoinBuilder.test.ts`
- Modify: `src/features/building-family/components/componentCatalogBuilder.ts`
- Modify: `src/features/building-family/tests/componentCatalogBuilder.test.ts`

- [ ] **Step 1: Write the failing quoin builder test**

Create `src/features/building-family/tests/quoinBuilder.test.ts`:

```ts
import { buildQuoinRecipe } from "../components/quoinBuilder";
import { ComponentRecipeSchema } from "../contracts/componentRecipe";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-quoin",
    sourceIntentHash: "intent-quoin",
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
    variationPolicy: { trim: "family" },
    locks: [],
    diagnostics: []
  };
}

describe("quoin builder", () => {
  it("builds a validated corner-quoin recipe from the normalized spec", () => {
    const recipe = buildQuoinRecipe(fixtureSpec());

    expect(ComponentRecipeSchema.safeParse(recipe).success).toBe(true);
    expect(recipe).toEqual(
      expect.objectContaining({
        id: "recipe.quoin.pressed-metal.corner",
        kind: "boxAssembly",
        role: "cornerQuoin",
        atlasSlotIds: ["trim.vertical.primary"],
        uvBehavior: "cap-repeat-cap",
        profileRecipeId: "profile.quoin.pressed-metal.stacked"
      })
    );
    expect(recipe.dimensionsM).toEqual({ width: 0.42, height: 3, depth: 0.42 });
    expect(recipe.parameterRanges.blockHeightM).toEqual({ min: 0.28, max: 0.54 });
  });
});
```

- [ ] **Step 2: Run the quoin test to verify RED**

Run:

```powershell
npm.cmd run test -- quoinBuilder
```

Expected: fail because `quoinBuilder.ts` does not exist.

- [ ] **Step 3: Implement `quoinBuilder.ts`**

Create `src/features/building-family/components/quoinBuilder.ts`:

```ts
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { makeComponentRecipe, typicalFloorHeight } from "./primitiveBuilders";

export function buildQuoinRecipe(spec: BuildingFamilySpec) {
  return makeComponentRecipe({
    id: `recipe.quoin.${spec.selectedFamilies.trim}.corner`,
    kind: "boxAssembly",
    role: "cornerQuoin",
    dimensionsM: { width: 0.42, height: typicalFloorHeight(spec.massing.floorHeightsM), depth: 0.42 },
    atlasSlotIds: ["trim.vertical.primary"],
    uvBehavior: "cap-repeat-cap",
    variationScope: spec.variationPolicy.trim ?? "family",
    attachmentPlane: "facade.corner",
    profileRecipeId: `profile.quoin.${spec.selectedFamilies.trim}.stacked`,
    parameterRanges: {
      blockHeightM: { min: 0.28, max: 0.54 },
      projectionM: { min: 0.08, max: 0.2 }
    }
  });
}
```

- [ ] **Step 4: Add quoin and roof-cap recipes to the catalog**

Modify `src/features/building-family/components/componentCatalogBuilder.ts` imports:

```ts
import { buildProfiledRoofCapRecipe } from "./profiledTrimBuilder";
import { buildQuoinRecipe } from "./quoinBuilder";
```

Add the recipes before `buildRoofRecipe(spec)`:

```ts
    buildCorniceRecipe(spec),
    buildProfiledRoofCapRecipe(spec),
    buildQuoinRecipe(spec),
    buildRoofRecipe(spec)
```

Update `src/features/building-family/tests/componentCatalogBuilder.test.ts` expected ids:

```ts
expect(first.recipes.map((recipe) => recipe.id)).toEqual([
  "recipe.wall.panel.primary",
  "recipe.window.tall-arched.frame",
  "recipe.opening.window.recess",
  "recipe.door.recessed-storefront",
  "recipe.trim.pressed-metal.horizontal",
  "recipe.trim.pressed-metal.vertical",
  "recipe.cornice.bracketed-metal.primary",
  "recipe.roof-cap.flat-membrane.profiled",
  "recipe.quoin.pressed-metal.corner",
  "recipe.roof.flat-membrane"
]);
```

Add assertions:

```ts
const roofCap = catalog.recipes.find((recipe) => recipe.role === "roofCap");
const quoin = catalog.recipes.find((recipe) => recipe.role === "cornerQuoin");
expect(roofCap?.kind).toBe("profileSweep");
expect(roofCap?.atlasSlotIds).toEqual(["trim.horizontal.primary"]);
expect(quoin?.kind).toBe("boxAssembly");
expect(quoin?.atlasSlotIds).toEqual(["trim.vertical.primary"]);
```

- [ ] **Step 5: Run catalog and quoin tests to verify GREEN**

Run:

```powershell
npm.cmd run test -- quoinBuilder componentCatalogBuilder
```

Expected: pass.

## Task 3: Profiled Trim Geometry Primitives

**Files:**
- Create: `src/features/building-family/compiler/profiledTrimGeometry.ts`
- Test: `src/features/building-family/tests/profiledTrimGeometry.test.ts`

- [ ] **Step 1: Write the failing geometry primitive tests**

Create `src/features/building-family/tests/profiledTrimGeometry.test.ts`:

```ts
import {
  buildCornerQuoinPrimitives,
  buildCorniceProfilePrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildProfiledRunPrimitives,
  buildRoofCapPrimitives
} from "../compiler/profiledTrimGeometry";
import { buildCorniceRecipe, buildProfiledHorizontalTrimRecipe, buildProfiledRoofCapRecipe } from "../components/profiledTrimBuilder";
import { buildQuoinRecipe } from "../components/quoinBuilder";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { PrimitiveGeometry } from "../compiler/primitiveGeometry";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-profiled-geometry",
    sourceIntentHash: "intent-profiled-geometry",
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

function expectPrimitiveIntegrity(primitive: PrimitiveGeometry): void {
  expect(primitive.positions.length).toBeGreaterThan(0);
  expect(primitive.positions.length % 3).toBe(0);
  expect(primitive.normals.length).toBe(primitive.positions.length);
  expect(primitive.uvs.length).toBe((primitive.positions.length / 3) * 2);
  expect(primitive.indices.length % 3).toBe(0);
}

describe("profiled trim geometry", () => {
  it("builds a profiled run from a base box and layered offsets", () => {
    const primitives = buildProfiledRunPrimitives({
      id: "test.run",
      center: [0, 5, -9],
      size: [28, 0.2, 0.2],
      layers: [
        { id: "cap", offsetM: [0, 0.12, -0.08], sizeM: [28.4, 0.08, 0.12] },
        { id: "drip", offsetM: [0, -0.1, -0.12], sizeM: [28.2, 0.06, 0.08] }
      ]
    });

    expect(primitives).toHaveLength(3);
    primitives.forEach(expectPrimitiveIntegrity);
    expect(primitives[1].bounds.max[0]).toBeGreaterThan(14);
    expect(primitives[1].bounds.min[2]).toBeLessThan(-9);
  });

  it("creates multi-layer cornice, belt-course, roof-cap, and quoin primitives", () => {
    const spec = fixtureSpec();
    const cornice = buildCorniceProfilePrimitives(spec, buildCorniceRecipe(spec));
    const beltCourses = buildHorizontalBeltCoursePrimitives(spec, buildProfiledHorizontalTrimRecipe(spec));
    const roofCaps = buildRoofCapPrimitives(spec, buildProfiledRoofCapRecipe(spec));
    const quoins = buildCornerQuoinPrimitives(spec, buildQuoinRecipe(spec));

    expect(cornice.length).toBeGreaterThan(3);
    expect(beltCourses.length).toBeGreaterThan(spec.massing.floorCount);
    expect(roofCaps.length).toBe(8);
    expect(quoins.length).toBeGreaterThan(spec.massing.floorCount * 4);
    [...cornice, ...beltCourses, ...roofCaps, ...quoins].forEach(expectPrimitiveIntegrity);
  });
});
```

- [ ] **Step 2: Run geometry tests to verify RED**

Run:

```powershell
npm.cmd run test -- profiledTrimGeometry
```

Expected: fail because `profiledTrimGeometry.ts` does not exist.

- [ ] **Step 3: Implement `profiledTrimGeometry.ts`**

Create `src/features/building-family/compiler/profiledTrimGeometry.ts`:

```ts
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import { buildBoxPrimitive, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";

export interface ProfileLayer {
  id: string;
  offsetM: Vec3;
  sizeM: Vec3;
}

export interface ProfiledRunInput {
  id: string;
  center: Vec3;
  size: Vec3;
  layers: ProfileLayer[];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function floorBaseY(spec: BuildingFamilySpec, floor: number): number {
  return spec.massing.floorHeightsM.slice(0, floor).reduce((total, height) => total + height, 0);
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function buildProfiledRunPrimitives(input: ProfiledRunInput): PrimitiveGeometry[] {
  return [
    buildBoxPrimitive({ center: input.center, size: input.size }),
    ...input.layers.map((layer) =>
      buildBoxPrimitive({
        center: addVec3(input.center, layer.offsetM),
        size: layer.sizeM
      })
    )
  ];
}

export function buildCorniceProfilePrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = sum(spec.massing.floorHeightsM);
  const frontZ = -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2;
  const center: Vec3 = [0, totalHeight - recipe.dimensionsM.height / 2, frontZ];

  const run = buildProfiledRunPrimitives({
    id: "cornice.front",
    center,
    size: [recipe.dimensionsM.width, recipe.dimensionsM.height * 0.45, recipe.dimensionsM.depth * 0.55],
    layers: [
      { id: "crown", offsetM: [0, recipe.dimensionsM.height * 0.28, -0.08], sizeM: [recipe.dimensionsM.width + 0.42, recipe.dimensionsM.height * 0.22, recipe.dimensionsM.depth * 0.38] },
      { id: "drip", offsetM: [0, -recipe.dimensionsM.height * 0.28, -0.12], sizeM: [recipe.dimensionsM.width + 0.28, recipe.dimensionsM.height * 0.12, recipe.dimensionsM.depth * 0.22] }
    ]
  });

  const bracketCount = Math.max(4, Math.round(spec.facade.frontBayCount * 1.5));
  const bracketSpacing = spec.massing.widthM / bracketCount;
  const brackets = Array.from({ length: bracketCount + 1 }, (_, index) => {
    const x = -spec.massing.widthM / 2 + bracketSpacing * index;
    return buildBoxPrimitive({
      center: [x, totalHeight - recipe.dimensionsM.height * 0.62, -spec.massing.depthM / 2 + 0.12],
      size: [0.18, recipe.dimensionsM.height * 0.38, 0.22]
    });
  });

  return [...run, ...brackets];
}

export function buildHorizontalBeltCoursePrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const primitives: PrimitiveGeometry[] = [];
  for (let floor = 1; floor < spec.massing.floorCount; floor += 1) {
    const y = floorBaseY(spec, floor);
    primitives.push(
      ...buildProfiledRunPrimitives({
        id: `belt.floor${floor}`,
        center: [0, y, -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2],
        size: [spec.massing.widthM, recipe.dimensionsM.height * 0.55, recipe.dimensionsM.depth],
        layers: [
          { id: "upper-cap", offsetM: [0, recipe.dimensionsM.height * 0.35, -0.04], sizeM: [spec.massing.widthM + 0.18, recipe.dimensionsM.height * 0.22, recipe.dimensionsM.depth * 0.72] },
          { id: "lower-drip", offsetM: [0, -recipe.dimensionsM.height * 0.32, -0.06], sizeM: [spec.massing.widthM + 0.12, recipe.dimensionsM.height * 0.16, recipe.dimensionsM.depth * 0.58] }
        ]
      })
    );
  }
  return primitives;
}

export function buildRoofCapPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const totalHeight = sum(spec.massing.floorHeightsM) + spec.massing.parapetHeightM + recipe.dimensionsM.height / 2;
  const halfWidth = spec.massing.widthM / 2;
  const halfDepth = spec.massing.depthM / 2;
  return [
    buildBoxPrimitive({ center: [0, totalHeight, -halfDepth], size: [spec.massing.widthM + 0.34, recipe.dimensionsM.height, recipe.dimensionsM.depth] }),
    buildBoxPrimitive({ center: [0, totalHeight, halfDepth], size: [spec.massing.widthM + 0.34, recipe.dimensionsM.height, recipe.dimensionsM.depth] }),
    buildBoxPrimitive({ center: [-halfWidth, totalHeight, 0], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height, spec.massing.depthM + 0.34] }),
    buildBoxPrimitive({ center: [halfWidth, totalHeight, 0], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height, spec.massing.depthM + 0.34] }),
    buildBoxPrimitive({ center: [-halfWidth, totalHeight, -halfDepth], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height * 1.2, recipe.dimensionsM.depth] }),
    buildBoxPrimitive({ center: [halfWidth, totalHeight, -halfDepth], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height * 1.2, recipe.dimensionsM.depth] }),
    buildBoxPrimitive({ center: [-halfWidth, totalHeight, halfDepth], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height * 1.2, recipe.dimensionsM.depth] }),
    buildBoxPrimitive({ center: [halfWidth, totalHeight, halfDepth], size: [recipe.dimensionsM.depth, recipe.dimensionsM.height * 1.2, recipe.dimensionsM.depth] })
  ];
}

export function buildCornerQuoinPrimitives(spec: BuildingFamilySpec, recipe: ComponentRecipe): PrimitiveGeometry[] {
  const primitives: PrimitiveGeometry[] = [];
  const totalHeight = sum(spec.massing.floorHeightsM);
  const blockHeight = 0.42;
  const blockCount = Math.max(1, Math.floor(totalHeight / blockHeight));
  const corners: Vec3[] = [
    [-spec.massing.widthM / 2, 0, -spec.massing.depthM / 2],
    [spec.massing.widthM / 2, 0, -spec.massing.depthM / 2],
    [-spec.massing.widthM / 2, 0, spec.massing.depthM / 2],
    [spec.massing.widthM / 2, 0, spec.massing.depthM / 2]
  ];

  for (const corner of corners) {
    for (let index = 0; index < blockCount; index += 1) {
      const y = blockHeight * index + blockHeight / 2;
      const alternatingWidth = index % 2 === 0 ? recipe.dimensionsM.width : recipe.dimensionsM.width * 0.72;
      primitives.push(
        buildBoxPrimitive({
          center: [corner[0], y, corner[2]],
          size: [alternatingWidth, blockHeight * 0.82, recipe.dimensionsM.depth]
        })
      );
    }
  }

  return primitives;
}
```

- [ ] **Step 4: Run geometry tests to verify GREEN**

Run:

```powershell
npm.cmd run test -- profiledTrimGeometry
```

Expected: pass.

## Task 4: Compiler High-Detail Integration

**Files:**
- Modify: `src/features/building-family/compiler/buildingCompiler.ts`
- Modify: `src/features/building-family/tests/buildingCompiler.test.ts`
- Test: `src/features/building-family/tests/familyBenchmarkScene.test.ts`

- [ ] **Step 1: Write failing compiler tests for high-detail trim batches**

Append this test to `src/features/building-family/tests/buildingCompiler.test.ts`:

```ts
it("emits layered high-detail trim geometry while low detail omits decorative trim", async () => {
  const { spec, catalog, graph } = await fixtureCompilerInputs();
  const highIr = await compileBuilding({ spec, catalog, graph, detailLevel: "high" });
  const lowIr = await compileBuilding({ spec, catalog, graph, detailLevel: "low" });
  const highBatchIds = highIr.meshBatches.map((batch) => batch.batchId);

  expect(highBatchIds).toEqual(
    expect.arrayContaining(["mesh.cornice", "mesh.horizontal-trim", "mesh.roof-cap", "mesh.corner-quoins"])
  );
  expect(lowIr.meshBatches.map((batch) => batch.batchId)).toEqual(["mesh.wall-panels", "mesh.roof"]);
  expect(lowIr.instanceBatches.map((batch) => batch.batchId)).toEqual(["instances.window", "instances.door"]);

  const cornice = highIr.meshBatches.find((batch) => batch.batchId === "mesh.cornice");
  const roofCap = highIr.meshBatches.find((batch) => batch.batchId === "mesh.roof-cap");
  const quoins = highIr.meshBatches.find((batch) => batch.batchId === "mesh.corner-quoins");

  expect((cornice?.indices?.length ?? 0) / 3).toBeGreaterThan(12);
  expect((roofCap?.indices?.length ?? 0) / 3).toBeGreaterThan(12);
  expect((quoins?.indices?.length ?? 0) / 3).toBeGreaterThan(spec.massing.floorCount * 8);
  expect(highIr.metrics.triangleCount).toBeGreaterThan(lowIr.metrics.triangleCount);
  expect(highIr.semanticIndex).toContainEqual(
    expect.objectContaining({
      semanticPath: `building/${spec.familyId}/facade/front/trim/belt-course/floor/1`,
      batchId: "mesh.horizontal-trim",
      stage: "trim"
    })
  );
  expect(highIr.semanticIndex).toContainEqual(
    expect.objectContaining({
      semanticPath: `building/${spec.familyId}/roof/parapet/cap`,
      batchId: "mesh.roof-cap",
      stage: "trim"
    })
  );
});
```

- [ ] **Step 2: Run compiler tests to verify RED**

Run:

```powershell
npm.cmd run test -- buildingCompiler
```

Expected: fail because the new mesh batches do not exist.

- [ ] **Step 3: Import profiled geometry helpers**

Modify `buildingCompiler.ts` imports:

```ts
import {
  buildCorniceProfilePrimitives,
  buildCornerQuoinPrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildRoofCapPrimitives
} from "./profiledTrimGeometry";
```

- [ ] **Step 4: Add recipe lookup roles**

Use existing `recipeByRole`. The new roles must be:

```ts
const horizontalTrimRecipe = recipeByRole(catalog, "horizontalTrim");
const roofCapRecipe = recipeByRole(catalog, "roofCap");
const quoinRecipe = recipeByRole(catalog, "cornerQuoin");
```

- [ ] **Step 5: Replace and add mesh plan functions**

Replace `createCorniceMeshPlan` internals so `primitives` comes from `buildCorniceProfilePrimitives(spec, recipe)`.

Add:

```ts
function createHorizontalTrimMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "horizontalTrim");
  const primitives = buildHorizontalBeltCoursePrimitives(spec, recipe);
  return {
    batchId: "mesh.horizontal-trim",
    role: "horizontalTrim",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries: Array.from({ length: Math.max(0, spec.massing.floorCount - 1) }, (_, index) => ({
      semanticPath: semanticPath(spec, `facade/front/trim/belt-course/floor/${index + 1}`),
      batchId: "mesh.horizontal-trim",
      elementIndex: index,
      stage: "trim" as const
    }))
  };
}

function createRoofCapMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "roofCap");
  return {
    batchId: "mesh.roof-cap",
    role: "roofCap",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives: buildRoofCapPrimitives(spec, recipe),
    semanticEntries: [
      {
        semanticPath: semanticPath(spec, "roof/parapet/cap"),
        batchId: "mesh.roof-cap",
        elementIndex: 0,
        stage: "trim"
      }
    ]
  };
}

function createCornerQuoinMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "cornerQuoin");
  return {
    batchId: "mesh.corner-quoins",
    role: "cornerQuoin",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives: buildCornerQuoinPrimitives(spec, recipe),
    semanticEntries: [
      {
        semanticPath: semanticPath(spec, "facade/corners/quoins"),
        batchId: "mesh.corner-quoins",
        elementIndex: 0,
        stage: "trim"
      }
    ]
  };
}
```

- [ ] **Step 6: Add high-detail-only mesh plans**

Update the high-detail mesh plan list:

```ts
const meshPlans = [
  createWallMeshPlan(input.spec, input.catalog),
  ...(highDetail
    ? [
        createHorizontalTrimMeshPlan(input.spec, input.catalog),
        createCorniceMeshPlan(input.spec, input.catalog),
        createRoofCapMeshPlan(input.spec, input.catalog),
        createCornerQuoinMeshPlan(input.spec, input.catalog)
      ]
    : []),
  createRoofMeshPlan(input.spec, input.catalog)
];
```

Do not add these batches when `detailLevel` is `"low"`.

- [ ] **Step 7: Run compiler and benchmark tests to verify GREEN**

Run:

```powershell
npm.cmd run test -- buildingCompiler familyBenchmarkScene
```

Expected: pass. Benchmark aggregate triangle counts may increase because they are derived from fixture IR metrics, not hard-coded constants.

## Task 5: Documentation And Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md`
- Modify: `docs/architecture/dynamic-building-family-integration.md`

- [ ] **Step 1: Update the art-fidelity roadmap status**

Under `### Slice 3: Profiled Trim And Cornice Geometry`, add:

```md
Status: implemented on 2026-06-25. High-detail compilation now uses renderer-independent profiled trim primitives for belt courses, layered cornices, parapet roof caps, and corner quoins while preserving low-detail trim omission.
```

- [ ] **Step 2: Update the integration map**

Change the status line to:

```md
**Status:** Milestone 8 Slice 3 profiled trim and cornice geometry
```

Extend the current-state paragraph to mention:

```md
profiled trim recipe builders plus compiler-side layered trim geometry for belt courses, cornices, parapet caps, and corner quoins
```

- [ ] **Step 3: Run focused validation**

Run:

```powershell
npm.cmd run test -- profiledTrimBuilder quoinBuilder profiledTrimGeometry componentCatalogBuilder buildingCompiler familyBenchmarkScene
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
git add src/features/building-family/components/profiledTrimBuilder.ts src/features/building-family/components/quoinBuilder.ts src/features/building-family/components/profileSweepBuilder.ts src/features/building-family/components/frameBuilder.ts src/features/building-family/components/componentCatalogBuilder.ts src/features/building-family/compiler/profiledTrimGeometry.ts src/features/building-family/compiler/buildingCompiler.ts src/features/building-family/tests/profiledTrimBuilder.test.ts src/features/building-family/tests/quoinBuilder.test.ts src/features/building-family/tests/profiledTrimGeometry.test.ts src/features/building-family/tests/componentCatalogBuilder.test.ts src/features/building-family/tests/buildingCompiler.test.ts docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md docs/architecture/dynamic-building-family-integration.md
git commit -m "Add profiled trim geometry"
git push
```

Expected: commit is pushed to `origin/main`.

## Self-Review

- Spec coverage: Task 1 covers profiled belt, pilaster, cornice, and roof-cap recipe data. Task 2 covers corner quoins and catalog integration. Task 3 covers renderer-independent profiled primitive generation with coherent box normals. Task 4 integrates high-detail compiler output and preserves low-detail trim omission. Task 5 covers docs, validation, commit, and push.
- Placeholder scan: this plan contains no unresolved placeholder tokens or unspecified implementation steps.
- Type consistency: the API names in tests, implementation tasks, and compiler handoff all use `buildProfiledRunPrimitives`, `buildCorniceProfilePrimitives`, `buildHorizontalBeltCoursePrimitives`, `buildRoofCapPrimitives`, `buildCornerQuoinPrimitives`, `buildProfiledHorizontalTrimRecipe`, `buildProfiledVerticalTrimRecipe`, `buildProfiledRoofCapRecipe`, and `buildQuoinRecipe`.
