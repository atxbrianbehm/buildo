# High-Fidelity Openings Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Slice 4 / Milestone M7 of the kit-grammar plan: procedural window and door assemblies with measurable depth (recess, frame, glass plane, sill, lintel, mullions, arched crown, door transom) while preserving instancing, low-detail lean output, and kit-mode plan-driven transforms.

**Architecture:**

- Recipe declarations live in `src/features/building-family/components/openingAssemblyBuilder.ts` (frameBuilder re-exports or delegates).
- Local compound geometry lives in `src/features/building-family/compiler/openingGeometry.ts` (renderer-independent typed arrays).
- Compiler continues to emit `InstanceBatchIR` transforms from proof loops or kit `ModuleInstanceSet`.
- High-detail openings use **paired instance batches** (frame assembly + glass) so materials stay single-slot-per-batch.
- Three.js adapter builds `BufferGeometry` from `openingGeometry` for window/door roles instead of a single `BoxGeometry`.
- No mesh booleans; arches are stepped box approximations.

**Tech Stack:** TypeScript, Zod contracts, Vitest, existing `ComponentRecipe`, `PrimitiveGeometry`, `RuntimeBuildingIR`, seed-stable catalog builders.

**Parent plans:**

- `docs/plans/kit-grammar-wfc-utdg-block.md` (M7)
- `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md` (Slice 4)

---

## File Structure

| Action | Path |
|---|---|
| Create | `src/features/building-family/components/openingAssemblyBuilder.ts` |
| Create | `src/features/building-family/compiler/openingGeometry.ts` |
| Create | `src/features/building-family/renderer-three/recipeGeometryFactory.ts` |
| Modify | `src/features/building-family/components/frameBuilder.ts` |
| Modify | `src/features/building-family/components/componentCatalogBuilder.ts` |
| Modify | `src/features/building-family/compiler/buildingCompiler.ts` |
| Modify | `src/features/building-family/compiler/componentGalleryBuilder.ts` |
| Modify | `src/features/building-family/renderer-three/buildingSceneAdapter.ts` |
| Create | `src/features/building-family/tests/openingAssemblyBuilder.test.ts` |
| Create | `src/features/building-family/tests/openingGeometry.test.ts` |
| Modify | `src/features/building-family/tests/buildingCompiler.test.ts` |
| Modify | `src/features/building-family/tests/componentCatalogBuilder.test.ts` |
| Modify | `src/features/building-family/tests/ComponentForge.test.tsx` (if labels/recipes change) |
| Update | fidelity bridge + kit-grammar plan + integration map |

## Planned Public API

```ts
// openingAssemblyBuilder.ts
export function buildWindowFrameRecipe(spec: BuildingFamilySpec): ComponentRecipe;
export function buildWindowGlassRecipe(spec: BuildingFamilySpec): ComponentRecipe;
export function buildWindowRecessRecipe(spec: BuildingFamilySpec): ComponentRecipe;
export function buildDoorRecipe(spec: BuildingFamilySpec): ComponentRecipe;
export function buildDoorGlassRecipe(spec: BuildingFamilySpec): ComponentRecipe;
export function isArchedWindowFamily(windowFamily: string): boolean;

// openingGeometry.ts
export type OpeningGeometryDetail = "high" | "low";

export interface BuildOpeningGeometryInput {
  recipe: ComponentRecipe;
  detail?: OpeningGeometryDetail;
  /** When true, treat recipe family as arched (from selectedFamilies or recipe id). */
  arched?: boolean;
}

export function buildOpeningAssemblyPrimitives(input: BuildOpeningGeometryInput): PrimitiveGeometry[];
export function buildOpeningAssemblyGeometry(input: BuildOpeningGeometryInput): PrimitiveGeometry; // combined

// recipeGeometryFactory.ts (renderer-three, may import three)
export function createRecipeBufferGeometry(recipe: ComponentRecipe): BufferGeometry;
```

## Geometry rules (local space)

Opening center is the origin. Outer size matches `recipe.dimensionsM`.

**High-detail window frame assembly (frame material batch):**

1. Recess pocket — slightly larger XY, deeper −Z into the wall  
2. Outer frame bars — left, right, head, sill band  
3. Mullion grid — vertical + horizontal bars (2×2 or 1×2 from params)  
4. Sill projection — bottom lip beyond frame (+Z exterior)  
5. Lintel band — top mass  
6. If arched — 3–5 stepped crown boxes above the rectangular head  

**High-detail glass batch:**

- Thin glass plane inset on Z and inset on XY inside the frame  

**High-detail door:**

- Recess + side/head frame + threshold  
- Solid leaf panel (lower ~70%)  
- Transom glass band (upper ~25%) as separate glass batch  

**Low-detail:**

- Single outer box for frame role; thin glass plane only  

## Compiler batch rules

For both proof and kit opening placement paths:

| Batch id | Role | Material slot | Geometry source |
|---|---|---|---|
| `instances.window` | window frame | `frame.primary` (first non-glass slot preferred: `frame.primary`) | assembly primitives |
| `instances.window.glass` | window glass | `glass.primary` | glass plane |
| `instances.door` | door assembly | `door.primary` or `frame.primary` | door assembly |
| `instances.door.glass` | door transom | `glass.primary` | thin plane |

Use the **same transform list** for paired frame/glass batches.

`firstAtlasSlot` today returns `glass.primary` first for windows — **change** window frame batch to prefer `frame.primary` when present so assemblies do not sample glass UVs.

Low-detail IR:

- Keep `instances.window` + `instances.door` only (no glass pair required if low detail uses single-box frame with glass material slot still acceptable, OR keep glass pair for consistency).
- Prefer: low detail still emits glass pair for material correctness, with simple geometries.

## Task checklist

### Task 1: Opening assembly recipes

- [x] Write `openingAssemblyBuilder.test.ts` (recipe ids, depths, anchors, parameter ranges, arched vs rectangular)
- [x] Implement `openingAssemblyBuilder.ts`
- [x] Delegate `frameBuilder` window/door/recess builders to it
- [x] Catalog includes window glass + door glass recipes
- [x] `npm.cmd run test -- openingAssemblyBuilder componentCatalogBuilder`

### Task 2: Pure opening geometry

- [x] Write `openingGeometry.test.ts` (multi-primitive high detail, measurable depth > 0.15 m, arched has more primitives, low detail fewer, normals finite)
- [x] Implement `openingGeometry.ts`
- [x] `npm.cmd run test -- openingGeometry`

### Task 3: Compiler paired batches + material slot preference

- [x] Prefer frame material slot for window frame batch
- [x] Emit glass instance batches sharing transforms
- [x] Update compiler tests for batch ids, counts, semantic paths
- [x] Low-detail still omits decorative trim; openings remain present
- [x] `npm.cmd run test -- buildingCompiler buildingCompilerWorker`

### Task 4: Renderer recipe geometry factory

- [x] `createRecipeBufferGeometry` uses opening assembly for window/door roles
- [x] Scene adapter uses factory
- [x] Adapter/runtime tests still pass
- [x] `npm.cmd run test -- buildingSceneAdapter buildingFamilyRuntime`

### Task 5: Gallery / Forge inspectability

- [x] Gallery labels for glass/recess roles
- [x] Forge can select window, recess, door recipes with deeper dimensions
- [x] `npm.cmd run test -- componentGalleryBuilder ComponentForge`

### Task 6: Docs + final validation

- [x] Mark Slice 4 / M7 done in parent plans
- [x] Update integration map
- [x] `npm.cmd run typecheck`
- [x] Focused test suite green

## Acceptance criteria

- [x] Opening modules have depth (outer Z extent − glass Z > 0.08 m in high detail)
- [x] Arched and rectangular window families share material roles (`frame.primary`, `glass.primary`)
- [x] Recipes expose anchors and parameter ranges for recess/mullion/sill
- [x] Component Forge lists and inspects window/door/recess recipes
- [x] Kit-mode plan transforms still drive opening placement
- [x] Proof-mode path still works
- [x] No Three.js imports in components/ or compiler/openingGeometry.ts
- [x] No `Math.random()`

## Non-goals

- True curved arch meshes or boolean cutouts  
- Per-mullion unique materials  
- Balcony rail insert (optional follow-up if size balloons)  
- Multi-material single mesh  

## Validation commands

```powershell
npm.cmd run test -- openingAssemblyBuilder openingGeometry buildingCompiler buildingCompilerWorker componentCatalogBuilder componentGalleryBuilder buildingSceneAdapter ComponentForge
npm.cmd run typecheck
```
