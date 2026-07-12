# Kit Grammar → WFC → UTDG → Block Generation

## Implementation plan

**Status:** in progress — M1–M11 landed (Phase C complete); next M12 WFC facade solver  
**Date:** 2026-07-12  
**Depends on:** MVP vertical slice (Milestones 0–7) complete; art-fidelity Slice 1 (`ArtKitManifest` + `late19cApartmentKit`) complete; visual-truth Assembly Hall prerequisite  
**Related plans:**

| Plan | Role |
|---|---|
| `docs/plans/dynamic-building-family.md` | Original MVP architecture and invariants |
| `docs/architecture/dynamic-building-family-integration.md` | Live integration map / current state |
| `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md` | Fidelity bridge goal and Slices 1–8 |
| `docs/superpowers/plans/2026-06-25-art-kit-snap-grid-facade-planner.md` | Detailed task plan for Phase A1 |
| `docs/superpowers/plans/2026-06-25-profiled-trim-cornice-geometry.md` | Detailed task plan for Phase B1 |
| `docs/superpowers/plans/2026-07-12-high-fidelity-openings.md` | Detailed task plan for Phase B2 / M7 |
| `docs/superpowers/plans/2026-07-12-art-kit-material-set.md` | Detailed task plan for Phase C1 / M8 |
| `docs/superpowers/plans/2026-07-12-art-fidelity-mode.md` | Detailed task plan for Phase C2 / M9 |
| `docs/superpowers/plans/2026-07-12-art-kit-lab-gallery.md` | Detailed task plan for Phase C3 / M10 |
| `docs/superpowers/plans/2026-07-12-visual-qa-packet.md` | Detailed task plan for Phase C4 / M11 |

**Delivery mode:** small, reviewable milestones. Do not combine phases or merge independent intermediate artifacts without explicit instruction. Preserve all `AGENTS.md` Dynamic Building Family rules.

### Research alignment (2026-07-12)

External research brief validated the architecture. Use it as guidance, not a rewrite:

| Literature / practice | Buildo mapping | When |
|---|---|---|
| CGA shape grammars (Müller et al.) | `BuildingGraph` + facade planner + later WFC tiles — not a freeform CGA interpreter inside the mesh compiler | A1–A2, D |
| Kit-of-parts / parametric profiles | Art-kit modules, sockets, snap grid, profiled trim expanders | A–B |
| Facade parsing (FaçAID-class) | Intent/style suggestions only; never structural truth from images | After C–D |
| SYNBUILD-3D / large synthetic sets | Validation and style-pack seeding, not a near-term dependency | C4+ research |
| ML ornament / diffusion | Material and mask overlays only (existing remote material lane) | Optional, never structure |

**Explicit non-starts until A2 (plan-driven placement) is green:** full CGA DSL, photo→mesh import, block generation, UTDG authoring UI.

---

## 1. Goal

Move Buildo from a **pipeline-complete, geometry-crude** vertical slice to a **kit-composed architectural grammar** that can later support:

1. Geometry-Nodes-like module expansion without a DCC UI  
2. Wave Function Collapse (WFC) over typed facade tiles  
3. Universal Texture Description Graph (UTDG) inputs for dynamic trim sheets  
4. Hybrid dial-in of a **block of buildings** that read as sellable architecture  

The first commercial-quality target is still a single late-19th-century modular apartment/commercial building family. District scale is deliberately late.

### Product north star (executable form)

```text
User prompt + seeds + locks
        ↓
Prompt Spaghetti evaluation  (stochastic intent)
        ↓
BuildingIntent + HistoricalStylePack
        ↓
BuildingFamilySpec
   ┌────────────┴────────────┐
   ↓                         ↓
ArtKitManifest          Atlas / UTDG lane
Module catalog          role sheets, scale,
   ↓                    weathering, remote detail
Facade planner
  (seeded-greedy → WFC)
   ↓
FacadeModulePlan
   ↓
BuildingGraph (plan-backed, evaluated)
   ↓
Component expanders (recipe instances)
   ↓
RuntimeBuildingIR
   ↓
FamilyRuntime + Assembly Hall / export
        ↓ (later)
Parcel graph + lot WFC → N buildings / shared kit
```

---

## 2. Current baseline (do not re-implement)

Already landed and must remain stable:

- Contracts, seed tree, PSG adapter, style pack, invalidation matrix  
- Procedural + remote material atlas pipeline  
- Component catalog, building graph schema, pure compiler + worker  
- Three.js adapter, family/instance runtimes, high/low detail  
- Four rooms + sample gallery, provenance, locks foundation  
- Persistence, export/import, benchmarks, remote material proof  
- Art-kit contracts + `late19cApartmentKit` fixture (Slice 1)  
- Assembly Hall visual-truth prerequisite (slot UV remap, clay/textured modes)

### Known structural gaps this plan closes

| Gap | Symptom | First phase that closes it |
|---|---|---|
| Graph is declarative scaffolding | Compiler re-derives placement from `BuildingFamilySpec` boxes | A2 |
| Art kit not structural | Manifest exists; no planner, no compiler consumption | A1–A2 |
| Weak component edit loop | Forge shows recipes but not click→style variants→recompile | A0 (thin), deeper after A2 |
| Flat geometry | Cornice/openings/trim are orthographic boxes | B1–B2 |
| Material scale soft | Roles exist; kit-level scale discipline incomplete | C1 |
| No WFC | Placement is fixed/greedy only | D1–D2 |
| No UTDG | No historical texture-description graph or trim-sheet compiler | E1–E2 |
| No block grammar | Family stress view only, not parcel composition | F1–F2 |

---

## 3. Fixed constraints

These are not open for reinterpretation during this plan:

1. React + Three.js + Zustand remain the app direction.  
2. Core contracts, deterministic core, art-kit planning, WFC, UTDG material compilers, and geometry expanders **must not** import React, Three.js, Zustand, DOM APIs, or app stores.  
3. No `Math.random()` for structural or material decisions; use the semantic seed tree.  
4. No preassembled complete building, facade, window, door, cornice, or roof meshes as source of truth. Primitive meshes and authored profile point sets are allowed.  
5. No general mesh booleans. Openings use recesses, frames, layered components.  
6. Image / remote models never own structure; they may detail materials and ornament masks.  
7. Every serialized artifact is schema-versioned and runtime-validated (Zod).  
8. Structural-control changes must not regenerate material artifacts.  
9. Do not build a user-facing Geometry Nodes editor in this plan.  
10. Work in small milestones; update the integration map after each completed phase slice.

---

## 4. Intermediate artifact stack

Introduce (or firm up) these pure, serializable artifacts in order. Each must have `schemaVersion`, Zod schema, tests, and provenance-friendly hashes where it enters the run pipeline.

```text
ArtKitManifest                 (exists — Slice 1)
  → FacadeModulePlan           (Phase A1 — planner output)
  → ModuleInstanceSet          (Phase A2 — compiler-facing instances)
  → ExpandedComponentPlan      (Phase B — optional if expanders stay in-compiler initially;
                                promote to artifact when expanders split)
  → RuntimeBuildingIR          (exists)
  → ArtKitMaterialSet          (Phase C1)
  → TrimSheetPlan              (Phase E1)
  → ParcelPlan / BlockPlan     (Phase F1)
```

### 4.1 `FacadeModulePlan` (Phase A1)

Already sketched in the Slice 2 plan. Canonical fields:

```ts
export type ArtKitFacadeName = "front" | "rear" | "left" | "right";
export type ArtKitPlacementLayer = "wall" | "opening" | "trim" | "roof" | "corner";

export interface FacadeModulePlan {
  schemaVersion: "0.1.0";
  artKitManifestId: string;
  unitMeters: 1;
  plannerId: "seeded-greedy" | "wfc"; // "wfc" only after Phase D
  cells: FacadeCell[];
  placements: FacadeModulePlacement[];
  diagnostics: Diagnostic[];
}
```

### 4.2 `ModuleInstanceSet` (Phase A2)

Compiler-facing expansion of placements into transforms + bindings:

```ts
export interface ModuleInstance {
  id: string;
  moduleId: string;
  recipeRef: { id: string; kind: string };
  facade: ArtKitFacadeName;
  layer: ArtKitPlacementLayer;
  semanticPath: string;
  transform: number[]; // 16-float column-major or documented layout
  boundsMeters: { origin: [number, number, number]; size: [number, number, number] };
  materialRoleBindings: Record<string, string>;
}

export interface ModuleInstanceSet {
  schemaVersion: "0.1.0";
  buildingId: string;
  familyId: string;
  sourcePlanHash: string;
  instances: ModuleInstance[];
  diagnostics: Diagnostic[];
}
```

### 4.3 Planner interface (Phase A1, extended in D)

```ts
export interface FacadePlanner {
  readonly plannerId: "seeded-greedy" | "wfc";
  plan(input: FacadePlannerInput): FacadeModulePlan;
}

export interface FacadePlannerInput {
  spec: BuildingFamilySpec;
  artKit: ArtKitManifest;
  seedPath: string; // e.g. building/{id}/facade-plan
}
```

WFC must implement the same interface and emit the same `FacadeModulePlan` schema so the compiler never branches on solver type.

---

## 5. Phase overview

| Phase | Name | Outcome | Depends on |
|---|---|---|---|
| **A** | Kit placement is structural truth | Planner + compiler consumption | Slice 1 |
| **B** | Readable component geometry | Profiled trim + deep openings | A2 |
| **C** | Material scale + kit product surface | Kit materials, kit mode, Art Kit Lab, visual QA | B |
| **D** | WFC facade solver | Constraint-based placement behind planner API | A + B (C preferred) |
| **E** | UTDG / trim-sheet foundations | Role-aware trim sheets + historical tags | C1 |
| **F** | Block generation | Parcel plan + multi-building street segment | D + shared family runtime |

**Rule:** do not start Phase D, E, or F until Phase A is complete and Phase B openings pass clay/textured visual checklist items in Section 11.

---

## 6. Phase A — Kit placement becomes structural truth

### A0 — Thin selection-aware variant swap (product feel, parallel-safe)

#### Intent

Give an early “editable kit” loop **without** waiting for WFC or full planner-driven geometry:

- Select a semantic element in Component Forge (or Assembly Hall selection where already available).
- Show alternate `selectedFamilies` / recipe ids allowed by the active style pack for that role (window, door, cornice, trim).
- Commit a swap → re-normalize/recompile for the current building seed with the existing invalidation matrix (prefer no material regen when only component family changes and the matrix allows).

#### Constraints

- Do **not** invent freeform mesh edits.
- Do **not** block A1/A2; A0 may land after A1 if it would delay snap grid.
- Prefer reusing existing lock + control surfaces over a new room.
- Full click-any-module-id kit editing waits until A2 module instance ids are stable.

#### Acceptance

- [ ] User can change at least one component family (e.g. window) from the UI and see a recompiled IR / scene update  
- [ ] Invalidation preview shows structural stages without forcing material regeneration when matrix says so  
- [ ] Swap is seed-stable and recorded in run/provenance diagnostics  

#### Validation

```powershell
npm.cmd run test -- ComponentForge buildingRunController invalidation
npm.cmd run typecheck
```

---

### A1 — Snap grid + facade module planner

**Detailed task plan:** `docs/superpowers/plans/2026-06-25-art-kit-snap-grid-facade-planner.md`  
**Status in fidelity bridge:** Slice 2 (not yet implemented)

#### Intent

Build renderer-independent snap-grid helpers and a seeded-greedy facade planner that places `late19cApartmentKit` modules on front/side/rear facades with diagnostics.

#### Files (from detailed plan)

| Action | Path |
|---|---|
| Create | `src/features/building-family/art-kit/moduleSnapGrid.ts` |
| Create | `src/features/building-family/art-kit/facadeModulePlanner.ts` |
| Modify | `src/features/building-family/art-kit/index.ts` |
| Modify | `src/features/building-family/compiler/buildingGraphBuilder.ts` |
| Create | `src/features/building-family/tests/moduleSnapGrid.test.ts` |
| Create | `src/features/building-family/tests/facadeModulePlanner.test.ts` |
| Modify | `src/features/building-family/tests/buildingGraphBuilder.test.ts` |
| Update docs | fidelity bridge + integration map |

#### Acceptance

- [ ] Same seed → identical `FacadeModulePlan` (canonical JSON / content hash stable)  
- [ ] Placements align to 1 m grid within epsilon  
- [ ] Front gets richest treatment; side/rear simpler but non-empty  
- [ ] Overlap / fit failures become diagnostics, not silent clips  
- [ ] Graph contains a `Group` node carrying a serializable plan summary  
- [ ] No Three.js / DOM imports in art-kit modules  

#### Validation

```powershell
npm.cmd run test -- moduleSnapGrid facadeModulePlanner buildingGraphBuilder
npm.cmd run typecheck
```

#### Exit criterion

Planner output is inspectable via graph node parameters and unit-tested. Compiler may still ignore placements (A2 owns consumption).

---

### A2 — Compiler consumes `FacadeModulePlan` / `ModuleInstanceSet`

**No prior detailed slice plan — this is the critical bridge missing from Slice 2 alone.**

#### Intent

Stop treating the building graph as documentation for a hardcoded placement loop. The compiler must derive opening/wall/trim transforms primarily from the plan (or from a derived `ModuleInstanceSet`), falling back to legacy hardcoded placement only when explicitly in `proof` fidelity mode (if kit mode lands later) or behind a temporary feature flag during migration.

Recommended migration path:

1. Build `ModuleInstanceSet` from `FacadeModulePlan` + `ArtKitManifest` (pure).  
2. Teach `compileBuilding` to place instances/meshes from that set for wall, opening, and trim layers.  
3. Keep massing/roof from massing nodes for now (rectangular footprint still MVP).  
4. Preserve low-detail omission of decorative trim.  
5. Remove or quarantine duplicate hardcoded bay loops once kit path matches tests.

#### Files

| Action | Path |
|---|---|
| Create | `src/features/building-family/art-kit/moduleInstanceBuilder.ts` |
| Create | `src/features/building-family/contracts/moduleInstanceSet.ts` (or nest under art-kit contracts if preferred — document choice) |
| Create | `src/features/building-family/tests/moduleInstanceBuilder.test.ts` |
| Modify | `src/features/building-family/compiler/buildingCompiler.ts` |
| Modify | `src/features/building-family/compiler/buildingGraphBuilder.ts` (ensure plan hash available to compile input) |
| Modify | `src/features/building-family/compiler/compilerWorkerProtocol.ts` if compile input shape changes |
| Modify | `src/features/building-family/tests/buildingCompiler.test.ts` |
| Modify | `src/features/building-family/tests/buildingGraphBuilder.test.ts` |
| Update | integration map + this plan checkboxes |

#### Compile input extension

```ts
export interface CompileBuildingInput {
  spec: BuildingFamilySpec;
  catalog: ComponentCatalog;
  graph: BuildingGraph;
  buildingId?: string;
  detailLevel?: BuildingComponentDetailLevel;
  facadePlan?: FacadeModulePlan;       // preferred
  moduleInstances?: ModuleInstanceSet; // optional precomputed
  fidelityMode?: "proof" | "kit";      // default "proof" until Phase C2
}
```

#### Acceptance

- [ ] With identical seeds, kit path produces deterministic IR hashes  
- [ ] Changing floor/bay count changes instance set without regenerating materials (invalidation matrix preserved)  
- [ ] Window/door semantic paths remain stable and indexable  
- [ ] Low detail still omits decorative trim batches  
- [ ] Proof path remains available until kit mode is defaulted  
- [ ] Focused compiler tests cover plan-driven placement and empty-plan diagnostics  

#### Validation

```powershell
npm.cmd run test -- moduleInstanceBuilder buildingCompiler buildingGraphBuilder buildingCompilerWorker
npm.cmd run typecheck
```

#### Exit criterion

Assembly Hall can render a plan-driven building that is not identical to pure hardcoded placement (different module selection or side/rear treatment is enough). Artifact timeline can show plan/instance hashes.

---

### A3 — Plan diagnostics in UI (small)

#### Intent

Surface planner diagnostics and placement counts in Prompt Lab or Assembly Hall provenance so kit composition is debuggable without Art Kit Lab.

#### Files

| Action | Path |
|---|---|
| Modify | `src/features/building-family/ui/ArtifactTracePanel.tsx` and/or `AssemblyHall.tsx` |
| Modify | corresponding tests |
| Optional | store selectors for plan summary |

#### Acceptance

- [ ] User can see `artKitManifestId`, placement count per facade, and non-empty diagnostics list when present  

#### Validation

```powershell
npm.cmd run test -- ArtifactTracePanel AssemblyHall
npm.cmd run typecheck
```

---

## 7. Phase B — Readable component geometry

### B1 — Profiled trim, cornice, quoin, roof-cap

**Detailed task plan:** `docs/superpowers/plans/2026-06-25-profiled-trim-cornice-geometry.md`  
**Fidelity bridge:** Slice 3

#### Intent

Replace single-box cornices and flat vertical trim with multi-layer profile primitives; add quoins and roof-cap runs for high detail only.

#### Acceptance (summary)

- [ ] High-detail IR includes layered cornice / belt / quoin / roof-cap batches  
- [ ] Low-detail IR omits decorative trim without breaking bounds  
- [ ] Normals coherent in clay mode  
- [ ] Recipes validate; catalog ids updated  

#### Validation

```powershell
npm.cmd run test -- profiledTrimBuilder quoinBuilder profiledTrimGeometry buildingCompiler familyBenchmarkScene
npm.cmd run typecheck
```

---

### B2 — High-fidelity openings

**Fidelity bridge:** Slice 4 (no dedicated task file yet — create one before coding if tasks exceed a single reviewable PR)

#### Intent

Procedural window/door modules with depth:

- rectangular sash + arched variants  
- recessed opening pockets  
- sill / lintel variants  
- mullion grids  
- transom / storefront ground-floor option  
- optional simple balcony rail insert (optional within B2; may slip to B3 if size balloons)

#### Files (proposed)

| Action | Path |
|---|---|
| Create | `src/features/building-family/components/archedOpeningBuilder.ts` |
| Create | `src/features/building-family/components/openingAssemblyBuilder.ts` |
| Create | `src/features/building-family/compiler/openingGeometry.ts` |
| Modify | `src/features/building-family/components/frameBuilder.ts` |
| Modify | `src/features/building-family/components/componentCatalogBuilder.ts` |
| Modify | `src/features/building-family/compiler/buildingCompiler.ts` |
| Modify | `src/features/building-family/art-kit/late19cApartmentKit.ts` (opening modules as needed) |
| Create | tests for builders, geometry, compiler, Component Forge |

#### Acceptance

- [ ] Openings have measurable recess depth (not coplanar frames)  
- [ ] Arched and rectangular variants share material roles  
- [ ] Module bounds/anchors available for diagnostics  
- [ ] Component Forge can select and inspect each opening family  
- [ ] Plan-driven placement still works with multi-primitive opening recipes  

#### Validation

```powershell
npm.cmd run test -- archedOpeningBuilder openingAssemblyBuilder openingGeometry buildingCompiler ComponentForge
npm.cmd run typecheck
```

#### Exit criterion for Phase B

Default Assembly Hall camera: building reads as architecture in clay mode (silhouette + opening depth + trim layering), not a textured shoebox.

---

## 8. Phase C — Material scale and kit product surface

### C1 — Art-kit material set + atlas mapping

**Fidelity bridge:** Slice 5

#### Intent

Define kit-level material roles with physical scale and map them into atlas planner / packer / Three material factory without breaking procedural-first acceptance.

#### Files (proposed)

| Action | Path |
|---|---|
| Create | `src/features/building-family/materials/artKitMaterialSet.ts` |
| Create | `src/features/building-family/materials/proceduralBrickSet.ts` (or fold into existing procedural provider) |
| Modify | `atlasPlanner.ts`, `atlasPacker.ts`, `buildingAtlasMaterialFactory.ts` as needed |
| Create | tests for scale stability and role channel sets |

#### Acceptance

- [ ] Brick coursing scale stable across wall modules  
- [ ] Plaster/roof/trim distinct sources  
- [ ] Atlas metadata sufficient for later glTF mapping notes  
- [ ] Material seed changes refresh materials without recompiling structure  

#### Validation

```powershell
npm.cmd run test -- artKitMaterialSet atlasPlanner atlasPacker buildingAtlasMaterialFactory
npm.cmd run typecheck
```

---

### C2 — Fidelity mode (`proof` | `kit`)

**Fidelity bridge:** Slice 6

#### Intent

Expose an explicit mode so kit composition does not break the MVP proof path.

#### Acceptance

- [ ] Assembly Hall can run the same prompt in both modes  
- [ ] Persistence/export packets include fidelity mode (schema-validated)  
- [ ] Import restores mode correctly  
- [ ] Benchmark reports include fidelity mode  

#### Validation

```powershell
npm.cmd run test -- buildingFamilyRuntime completedFamilyExportBundle completedFamilyExportVerifier familyBenchmarkProfilePacket
npm.cmd run typecheck
```

---

### C3 — Art Kit Lab + sample gallery upgrade

**Fidelity bridge:** Slice 7

#### Intent

`#room=artKitLab` for module catalog + clay/wireframe/textured previews; gallery labels proof vs kit honestly.

#### Validation

```powershell
npm.cmd run test -- ArtKitLab SampleBuildingGallery AssemblyHall
npm.cmd run test:e2e
npm.cmd run typecheck
```

---

### C4 — Visual QA packet

**Fidelity bridge:** Slice 8

#### Intent

Schema-versioned visual QA packet with seed, hashes, checklist categories (silhouette, rhythm, opening depth, trim, material scale, side/rear, roof edge, clay/wireframe/textured, performance).

#### Validation

```powershell
npm.cmd run test -- moduleQualityReport familyBenchmarkDocumentation
npm.cmd run test:e2e
npm.cmd run typecheck
```

#### Phase C exit

One kit-mode building in Assembly Hall + Art Kit Lab + gallery variants + exportable visual QA packet.

---

## 9. Phase D — WFC facade solver

### Preconditions

- A1–A2 complete  
- B openings/trim readable enough that WFC module choices are visually meaningful  
- C preferred so kit mode can host WFC without destabilizing proof mode  

### D1 — Constraint model + pure solver core

#### Intent

Implement a deterministic WFC (or WFC-like) solver over facade cells and art-kit modules.

#### Constraint vocabulary (minimum)

| Constraint | Example |
|---|---|
| Zone allow-list | ground vs body vs cornice modules |
| Adjacency | door not adjacent to door without pier; cornice continuity |
| Socket compatibility | edge/grid accepts |
| Facade hierarchy | front richer than rear |
| Vertical stack rules | storefront only floor 0; optional balcony above body windows |
| Frequency / density | trim density from intent/style pack |

#### Files (proposed)

| Action | Path |
|---|---|
| Create | `src/features/building-family/art-kit/wfc/facadeTileSet.ts` |
| Create | `src/features/building-family/art-kit/wfc/facadeConstraints.ts` |
| Create | `src/features/building-family/art-kit/wfc/facadeWfcSolver.ts` |
| Create | `src/features/building-family/art-kit/wfc/facadeWfcPlanner.ts` implements `FacadePlanner` |
| Create | tests for entropy collapse, contradiction diagnostics, seed stability, lock pre-collapse |

#### Seed paths

```text
building/{buildingId}/facade-plan/wfc
building/{buildingId}/facade/{facade}/cell/{floor}-{bay}
```

Use seed tree branches for tie-breaks and collapse order; never `Math.random()`.

#### Acceptance

- [ ] Same seed + kit + constraints → identical plan hash  
- [ ] Contradictions produce diagnostics and a safe fallback path (documented: e.g. revert cell to wall-panel or use seeded-greedy repair)  
- [ ] Local locks (when wired) pre-collapse corresponding tiles  
- [ ] Solver is pure and renderer-free  

#### Validation

```powershell
npm.cmd run test -- facadeTileSet facadeConstraints facadeWfcSolver facadeWfcPlanner facadeModulePlanner
npm.cmd run typecheck
```

---

### D2 — Wire WFC into run controller

#### Intent

Select planner via control / style pack / feature flag:

```ts
type FacadePlannerKind = "seeded-greedy" | "wfc";
```

Invalidation:

- building seed, floors, bays, locks, trim density → replan structure  
- material seed → no replan  

#### Acceptance

- [ ] Prompt Lab or Assembly Hall can switch planner kind  
- [ ] Timeline shows planner id + plan hash  
- [ ] Floor/bay changes do not regenerate materials  
- [ ] Export packets record planner kind  

#### Validation

```powershell
npm.cmd run test -- buildingRunController buildingState buildingCompiler invalidation
npm.cmd run typecheck
```

#### Phase D exit

WFC is a drop-in planner producing the same `FacadeModulePlan` consumed by A2. No compiler special cases for WFC.

---

## 10. Phase E — UTDG and dynamic trim sheets

### E1 — Texture description contracts + historical tags

#### Intent

Introduce a minimal Universal Texture Description Graph **consumer contract** (not a full authoring product):

```ts
export interface TextureDescriptionNode {
  id: string;
  role: string; // e.g. masonry.brick.running, stone.trim.cast
  channels: Array<"baseColor" | "normal" | "orm" | "height" | "opacity" | "mask">;
  metersPerTile: number;
  historicalTags: string[]; // period, region, material family
  generationHints: {
    proceduralSource?: string;
    remotePromptFragment?: string;
    weathering?: string;
  };
}

export interface TextureDescriptionGraph {
  schemaVersion: "0.1.0";
  id: string;
  nodes: TextureDescriptionNode[];
  edges: Array<{ from: string; to: string; relation: "pairs-with" | "weathers-to" | "trims" | "overlays" }>;
}
```

Style packs and art-kit material roles reference node ids. Structure remains forbidden output.

#### Files (proposed)

| Action | Path |
|---|---|
| Create | `src/features/building-family/utdg/textureDescriptionContracts.ts` |
| Create | `src/features/building-family/utdg/late19cTextureGraph.ts` (demo draft) |
| Create | tests for validation, pairing rules, scale positivity |

#### Acceptance

- [ ] Demo graph validates  
- [ ] Invalid pairs / missing scales diagnose  
- [ ] No geometry imports  

---

### E2 — Trim sheet planner / packer

#### Intent

From selected modules + UTDG roles, emit a `TrimSheetPlan` that drives atlas packing for:

- wall field tiles  
- frame / sill / lintel  
- cornice profile bands  
- quoin corners  
- roof edge  

Remote overlays remain composited on procedural height authority (existing Milestone 6 invariant).

#### Acceptance

- [ ] Trim sheet plan is deterministic for fixed module instance set + material seed  
- [ ] Structural IR hash unchanged when only UTDG weathering changes (if structure bindings unchanged)  
- [ ] Atlas Lab can show trim-sheet slots  

#### Validation

```powershell
npm.cmd run test -- textureDescriptionContracts trimSheetPlanner atlasPlanner atlasPacker
npm.cmd run typecheck
```

#### Non-goals for Phase E

- Full historical research database  
- Claiming academic authority (keep `demo` / `draft` labels)  
- Using UTDG to invent floors, bays, or openings  

---

## 11. Phase F — Block of buildings

### Preconditions

- Kit-mode single buildings sell under visual QA checklist  
- WFC planner stable  
- Family runtime sharing proven (already via benchmarks)  

### F1 — Parcel / lot contracts + seeded lot plan

#### Intent

```ts
export interface ParcelPlan {
  schemaVersion: "0.1.0";
  blockId: string;
  lots: Array<{
    lotId: string;
    footprint: { originM: [number, number]; sizeM: [number, number]; rotationY: number };
    frontage: "street" | "corner" | "alley";
    buildingSeed: string;
    heightBias?: number;
  }>;
  diagnostics: Diagnostic[];
}
```

Generate N `BuildingFamilySpec`s (or building seeds under one family) from a shared style pack + kit.

#### Acceptance

- [ ] Shared atlas/catalog across lots when family-shared  
- [ ] Corner lots get different facade treatment hooks  
- [ ] Deterministic block from block seed  

---

### F2 — Street segment assembly view

#### Intent

New Assembly Hall mode or secondary view: 4–12 buildings along a curb line, shared kit, distinct building seeds, simple sidewalk/ground plane (non-structural placeholder allowed).

#### Acceptance

- [ ] Performance path reuses family runtime patterns from 16/100 building benchmarks  
- [ ] Export can package block plan + per-building plan hashes  
- [ ] Still no city sim, traffic, or interiors  

#### Validation

```powershell
npm.cmd run test -- parcelPlan blockAssembly familyBenchmarkScene
npm.cmd run typecheck
```

---

## 12. Visual QA checklist (gate between phases)

Use for Phase B exit, C4 packets, and any claim of “sellable”:

| # | Category | Gate |
|---|---|---|
| 1 | Silhouette | Parapet/cornice/roof edge/corners readable in clay |
| 2 | Facade rhythm | Ground/body/cornice not uniform stamp |
| 3 | Opening depth | Recess + frame + glass plane separation |
| 4 | Trim layering | Multi-layer cornice/belt, not flat ribbon only |
| 5 | Material scale | Brick/roof/trim scale coherent at default camera |
| 6 | Side/rear | Simpler hierarchy, not blank slab |
| 7 | Family variants | Shared kit, distinct seeds, believable diversity |
| 8 | Dial-in | Floors/bays/locks/seeds do not thrash materials |

Do not start Phase F until items 1–7 pass for kit mode on a representative machine with a stored visual QA packet.

---

## 13. Milestone / PR sequence

Execute in order. Each row is one reviewable PR-sized milestone unless noted.

| ID | Milestone | Phase | Primary validation focus | Status |
|---|---|---|---|---|
| M1 | Snap grid helpers | A1 | `moduleSnapGrid` | done 2026-07-12 |
| M2 | Seeded-greedy facade planner + graph Group node | A1 | `facadeModulePlanner`, graph tests | done 2026-07-12 |
| M3 | `ModuleInstanceSet` builder | A2 | pure instance builder tests | done 2026-07-12 |
| M4 | Compiler consumes plan/instances; keep proof fallback | A2 | compiler + worker | done 2026-07-12 (openings; walls/trim still hybrid) |
| M5 | Plan diagnostics in trace/Assembly Hall | A3 | UI tests | done 2026-07-12 |
| M5b | Thin Forge/Assembly variant swap | A0 | ComponentForge + invalidation | done 2026-07-12 |
| M6 | Profiled trim recipes + geometry | B1 | trim/quoin/compiler | done 2026-07-12 |
| M7 | High-fidelity openings | B2 | opening geometry + forge | done 2026-07-12 |
| M8 | Art-kit material set + scale | C1 | atlas + materials | done 2026-07-12 |
| M9 | Fidelity mode proof/kit in run + export | C2 | persistence/export | done 2026-07-12 |
| M10 | Art Kit Lab + gallery labels | C3 | UI + e2e | done 2026-07-12 |
| M11 | Visual QA packet | C4 | QA schema + docs | done 2026-07-12 |
| M12 | WFC constraint model + solver | D1 | pure WFC tests | pending |
| M13 | WFC planner wiring + invalidation | D2 | controller + invalidation | pending |
| M14 | UTDG contracts + demo graph | E1 | contract tests | pending |
| M15 | Trim sheet planner integration | E2 | atlas + trim sheet | pending |
| M16 | Parcel plan + block seeds | F1 | parcel tests | pending |
| M17 | Street segment assembly view | F2 | block UI + perf smoke | pending |

**Execution order:** M1 → M2 → M3 → M4 → (M5 and/or M5b) → B…. Do not start M3 until M2 lands. Do not start M12+ until A2 and B openings/trim gates pass.

---

## 14. Invalidation matrix extensions

Preserve existing matrix. Add:

| Change | Replan facade | Rebuild instances | Materials | Geometry IR | GPU |
|---|---:|---:|---:|---:|---:|
| Planner kind (greedy ↔ WFC) | yes | yes | no | yes | yes |
| Art kit id | yes | yes | maybe* | yes | yes |
| Facade lock | partial | branch | no | yes | yes |
| UTDG weathering only | no | no | yes | no | material |
| Trim sheet packing seed | no | no | yes | no | material |
| Block seed | yes (lots) | yes | family reuse | yes | yes |
| Lot building seed | one lot | one lot | no if family shared | one lot | yes |

\*Only if kit material roles change atlas plan inputs.

---

## 15. Testing strategy

Per milestone:

1. Unit tests for pure planners/solvers/geometry  
2. Contract schema tests for new artifacts  
3. Compiler determinism tests (same seed → same hashes)  
4. Invalidation tests when controls change  
5. UI tests only when surfaces change  
6. `npm run typecheck` before finish  
7. `npm run test:e2e` when rooms/routes change  
8. Update `docs/architecture/dynamic-building-family-integration.md` after each milestone  

Benchmark: re-run 16-building orbit / 100-building shared-family reports after B and D to catch instance explosions.

---

## 16. Risk register

| Risk | Mitigation |
|---|---|
| Planner lands but compiler ignores it | A2 is mandatory before calling kit placement “done” |
| WFC contradictions freeze generation | Documented repair fallback; diagnostics; seed stability tests |
| Profile geometry explodes triangle counts | High/low detail; instance/batch by role; benchmarks after B1/B2 |
| UTDG scope creep into structure | Explicit non-goal; consumer contract only in E1 |
| Block generation multiplies bad facades | Visual QA gate before F |
| Dual code paths (proof vs kit) diverge forever | Kit becomes default after C4; proof retained as regression fixture only |
| Graph schema becomes a second unused DSL | A2 makes plan the compiler input; later evaluate more node types only when needed |

---

## 17. Non-goals (this plan)

- User-facing Geometry Nodes / full node editor  
- Arbitrary footprints / CSG / text-to-mesh structure  
- Interiors, stairs, MEP  
- Multiplayer, production multi-tenant jobs  
- Unreal/Blender runtime integration  
- Academically authoritative historical claims  
- Full city simulation  
- Replacing PSG with WFC or UTDG  

---

## 18. Open product decisions

Resolve before or during the listed milestones:

| Decision | When | Options / recommendation |
|---|---|---|
| Kit style id | A1 | Keep `late-19c-apartment-kit` sibling to commercial demo style pack (**recommended**) |
| Default fidelity mode after C4 | C2–C4 | Default `kit` in Sample Gallery; Prompt Lab starts `proof` until kit QA passes, then flip |
| Presentation first pass | B–C | Clay + textured both required; clay is the honesty gate |
| glTF export | after C1/E2 | Later milestone; material roles must stabilize first |
| WFC fallback on contradiction | D1 | Seeded-greedy cell repair vs empty wall module — pick one and test |
| Block size for F2 | F1 | Start with 6–8 lots, not 100 |

---

## 19. Documentation updates per milestone

Always:

1. Check off items in **this** plan  
2. Update `docs/architecture/dynamic-building-family-integration.md` current-state summary and file list  
3. Update fidelity bridge plan slice status when A–C slices complete  
4. Only edit `docs/plans/dynamic-building-family.md` if a fixed MVP invariant changes  

---

## 20. First prompt for implementers

```text
Read AGENTS.md, docs/plans/kit-grammar-wfc-utdg-block.md, and
docs/superpowers/plans/2026-06-25-art-kit-snap-grid-facade-planner.md.

Execute Phase A1 (M1 + M2): snap grid helpers, facade module planner,
and graph Group handoff. Do not implement compiler plan consumption (M3/M4),
WFC, UTDG, or block generation. Run Slice 2 validation commands, update the
integration map and plan checkboxes, then stop for review before A2.
```

Subsequent milestones use the same pattern: one ID range from Section 13, no forward scope into later phases.

---

## 21. Success definition

This plan is complete when:

1. Kit-mode buildings are composed from art-kit modules on a snap grid  
2. Geometry includes layered trim and deep openings  
3. Materials respect physical scale and optional UTDG-driven trim sheets  
4. Facade placement can run under WFC with the same plan artifact  
5. A small street segment can be generated from a block/parcel plan with shared family assets  
6. Hybrid dial-in (prompt, seeds, locks, planner kind, fidelity mode) remains inspectable and exportable  
7. Output is good enough that a block of buildings can be **sold as realistic architectural structures** under the visual QA checklist—not merely as a procedural tech demo  

Until item 7 holds for a single building, treat block generation as explicitly out of scope for product claims.
