# Geometry-Node Quality Packets

**Status:** active planning — geometry fidelity track (post–vertical-slice, post–kit M1–M11)  
**Date:** 2026-07-12  
**Branch baseline:** `main` @ `92ce977` (facade split plan reconvergence)  
**Owner track:** Dynamic Building Family geometry expanders + kit split  
**Related:**

| Doc | Role |
|---|---|
| `docs/research/geometry-nodes-building-adaptation.md` | Research mapping GN/CGA → Buildo |
| `docs/plans/kit-grammar-wfc-utdg-block.md` | Parent kit → WFC → UTDG → block roadmap |
| `docs/plans/dynamic-building-family.md` | Original MVP architecture |
| `docs/architecture/dynamic-building-family-integration.md` | Live integration map |
| `Agents.md` | Hard constraints (pure core, no preassembled buildings, seed tree) |

**Delivery mode:** one **packet** = one reviewable PR-sized milestone. Do not merge independent packets without explicit instruction. Prefer sequential landing on `main`.

---

## 1. Goal

Move Buildo from **pipeline-complete, massing-improved box architecture** to a **Geometry-Nodes-like expand pipeline**:

```text
Mass (spec)
  → Component-split facades
  → Split / repeat scopes (floors × bays × wall pieces)
  → Module fill (openings, storefront, trim roles)
  → Profile expanders (authored polylines → solids)
  → RuntimeBuildingIR → Assembly Hall clay/textured
```

The **natural stopping point for this plan** is **not** “photoreal city” and **not** “Blender GN parity.” It is:

> **A late-19c family building that, in Assembly Hall clay mode with orbit + Shift-light, reads as composed architecture (piers, punched openings, storefront hierarchy, continuous moldings) driven by one split plan + pure expanders—with no parallel hard-coded “slab + stick window” path for kit mode—and with schema-versioned traces so quality is debuggable.**

That is **packet G8 exit**. Beyond G8, work returns to the parent roadmap (WFC layout, UTDG materials consumer, block/parcel) with geometry that is good enough that layout variety is meaningful.

---

## 2. Current baseline (do not re-implement)

### Landed and must remain stable

| Layer | State |
|---|---|
| PSG → intent → style pack → atlas → IR → Three | Vertical slice |
| Art kit + greedy facade planner + module instances | Kit placement |
| Proof / kit fidelity mode | Export/persistence aware |
| Building-seed structural variety | Bays/depth/window family/rhythm |
| Profile **library** + densify + **closed-profile extrude** | Cornice/belt/roof-cap/pilaster/base |
| Full-height pilasters, multi-floor belts, spandrels | Facade mass |
| Opening frames + additive wall pockets | Openings |
| Storefront bulkhead/lintel mesh (partial) | Ground hierarchy |
| **Facade wall subdivision** (pier/sill/head) | CGA-like wall punch |
| **`FacadeSplitPlan`** (walls + opening centers from one plan) | Reconvergence started |
| Art Kit Lab, Sample Gallery, Visual QA, orbit + light | Product surfaces |
| UTDG research brief + inject parse (no material consumer) | Parked materials track |

### Known remaining gaps (this plan closes most of them)

| Gap | Symptom | Closed by |
|---|---|---|
| Dual authority for openings | Kit plan vs split defaults still diverge in edge cases | G1–G2 |
| Storefront not a real split/module | One-off mesh stack, not kit scopes | G3–G4 |
| Opening size ≠ wall hole | Frames float or clip piers | G2 |
| Pockets not slot-bound | Recess boxes misaligned with frames | G2 |
| Split invisible in product | Can’t debug “why this bay” | G5 |
| Compiler still hybrid | Massing paths mixed with expanders | G1, G6 |
| Profile quality soft | Low densify, no shared expander API | G6 |
| Clay QA soft / incomplete | Checklist lagging geometry | G5, G8 |
| No second kit stress | Only late-19c apartment | G7 (optional thin) |
| WFC before geometry is good | Rearranges weak modules | **Parked until G8** |

---

## 3. Fixed constraints (non-negotiable)

1. React + Three.js + Zustand app direction.  
2. Core contracts, expanders, planners, profile math: **no** React / Three / Zustand / DOM / app stores.  
3. No `Math.random()` for structure or materials; semantic seed tree only.  
4. No preassembled complete building / facade / window / door / cornice / roof meshes as **source of truth**. Authored profile point sets and primitive expanders are allowed.  
5. Every new serialized artifact: **schema-versioned + runtime-validated**.  
6. Structural control changes must not force material atlas regen unless invalidation matrix says so.  
7. Work in **small packets**; tests for every behavior change; run documented checks before finish.

---

## 4. Target architecture (end of G8)

```text
BuildingFamilySpec + ArtKitManifest + seeds
        │
        ▼
FacadeModulePlan          (greedy now; WFC later, same schema)
        │
        ▼
FacadeSplitPlan           ★ single structural authority for kit mode
  · bay scopes (floor × bay × facade)
  · wall pieces (pier L/R, sill, head, reveal)
  · opening slots (center, size, kind, moduleId)
  · contentHash
        │
        ├──────────────────┬────────────────────┐
        ▼                  ▼                    ▼
Wall expanders      Opening expanders     Trim expanders
(subdivided wall)   (frame/glass/pocket   (profile solids,
                     from slot)            storefront modules)
        │                  │                    │
        └──────────────────┴────────────────────┘
                           ▼
                  RuntimeBuildingIR
                           ▼
              FamilyRuntime + Assembly Hall
                           ▼
           Visual QA + split hash in trace
```

**Proof mode** may keep a reduced path, but kit mode must not reintroduce a second placement truth.

---

## 5. Packet overview

| Packet | Name | Outcome | Depends on | Est. size |
|---|---|---|---|---|
| **G1** | Split authority cleanup | Kit mode: openings **only** from plan; no dual defaults; split hash stable | baseline | S |
| **G2** | Slot-locked openings & pockets | Frame size/depth + pocket bounds = split slot | G1 | M |
| **G3** | Storefront scope split | Ground bay → bulkhead / glazing / lintel scopes | G1 | M |
| **G4** | Storefront kit modules | Art-kit modules + expanders for GF system | G3 | M |
| **G5** | Split observability | Trace panel + Visual QA + clay checklist for split | G2 | S |
| **G6** | Expander unification | Shared profile/opening APIs; kill dead hybrid wall paths | G2–G4 | M |
| **G7** | Second-stress thin kit delta | One alternate window/trim profile pack (optional) | G6 | S–M |
| **G8** | Clay quality gate | Documented checklist green; e2e smoke; plan exit | G5–G6 | M |

**Natural stop:** G8.  
**Explicitly after G8 (parent plan, not this track):** WFC (M12–M13), UTDG material consumer (M14–M15), block/parcel (M16–M17).

---

## 6. Packet specs

### G1 — Split authority cleanup

#### Intent

Make `FacadeSplitPlan` the **only** opening layout authority for kit-mode compile:

- If `facadePlan` / art-kit graph plan exists → `strictOpenings: true` (already partial).  
- Remove remaining compiler fallbacks that re-plan openings differently from the split.  
- Ensure proof mode still compiles without kit plan.  
- Document which code paths are kit-only vs shared.

#### Files (expected)

| Action | Path |
|---|---|
| Modify | `src/features/building-family/compiler/facadeSplitPlan.ts` |
| Modify | `src/features/building-family/compiler/buildingCompiler.ts` |
| Modify | `src/features/building-family/tests/facadeSplitPlan.test.ts` |
| Modify | `src/features/building-family/tests/buildingCompiler.test.ts` |
| Update | research brief status bullets |

#### Acceptance

- [x] Kit compile: every opening instance maps 1:1 to a `FacadeSplitPlan.openings[]` entry  
- [x] Kit compile: no front-bay default openings outside planner placements  
- [x] Same seed + kit → same `FacadeSplitPlan.contentHash`  
- [x] Proof mode still produces windows/doors without art-kit plan (front-only split defaults)  
- [x] No regression in family benchmark smoke tests (compiler suite)  

#### Validation

```powershell
npm.cmd run test -- facadeSplitPlan facadeWallSubdivision buildingCompiler
npm.cmd run typecheck
```

#### Exit

Engineers can answer “where does this window come from?” with: **split opening slot**.

---

### G2 — Slot-locked openings and pockets

#### Intent

Opening **geometry** and **wall pockets** consume split slot metrics:

- Frame outer width/height from slot (or slot inset recipe params).  
- Pocket mesh AABB derived from same center/size/wall depth.  
- Depth hierarchy: wall thickness → pocket → frame → glass (documented constants).  
- Optional: clamp kit module bounds to bay with diagnostics instead of silent overflow.

#### Files (expected)

| Action | Path |
|---|---|
| Create | `src/features/building-family/compiler/openingSlotBinding.ts` (pure helpers) |
| Modify | `openingGeometry.ts`, `buildingCompiler.ts` (pocket + instance size) |
| Modify | `facadeSplitPlan.ts` if slot insets need schema fields |
| Create/modify | tests for slot binding + pocket alignment |
| Modify | `moduleQualityReport.ts` measured pocket/frame metrics |

#### Acceptance

- [x] For a fixed seed, `|frameWidth - slotWidth| < ε` (documented ε, e.g. 5 cm inset)  
- [x] Pocket center equals slot center in X/Y (facade plane) within ε  
- [x] Glass still inset behind frame; clay depth checklist passes  
- [x] Oversize module → diagnostic, not silent clip through pier  

#### Validation

```powershell
npm.cmd run test -- openingSlotBinding openingGeometry buildingCompiler moduleQualityReport
npm.cmd run typecheck
```

#### Exit

Clay: windows look **in the hole**, not glued on a wall.

---

### G3 — Storefront scope split

#### Intent

Ground-floor front bays use an explicit vertical split (CGA-style), not only a global bulkhead mesh:

```text
ground bay
  ├─ bulkhead scope   (solid wall / panel)
  ├─ glazing scope    (opening slot: door or storefront window)
  └─ lintel / fascia  (solid band under 2nd floor)
```

Side/rear ground can stay simpler.

#### Files (expected)

| Action | Path |
|---|---|
| Modify | `facadeWallSubdivision.ts` / `facadeSplitPlan.ts` |
| Create | storefront scope types + expanders |
| Modify | compiler wall/storefront mesh emission |
| Tests | ground split piece counts + zone coverage |

#### Acceptance

- [x] Ground front bay with door: bulkhead + door slot + lintel pieces present  
- [x] Ground front bay with window: same structure with window slot  
- [x] Upper floors unchanged in contract (body zone)  
- [x] Split hash changes when ground floor height changes  

#### Validation

```powershell
npm.cmd run test -- facadeSplitPlan facadeWallSubdivision buildingCompiler storefrontScopeSplit
npm.cmd run typecheck
```

#### Exit

Ground reads as **storefront system**, not “taller first floor slab.”

---

### G4 — Storefront kit modules

#### Intent

Promote storefront to art-kit modules (still procedural expanders, not mesh assets):

| Module id (proposed) | Kind | Role |
|---|---|---|
| `storefront.bulkhead.panel` | panel | solid base |
| `storefront.glazing.bay` | opening | large ground glass/window |
| `storefront.door.recessed` | door | (may alias existing door) |
| `storefront.lintel.band` | trim | head band |

Planner places them only on `zone: ground` + `facade: front` (and optional side for corners later).

#### Files (expected)

| Action | Path |
|---|---|
| Modify | `late19cApartmentKit.ts` |
| Modify | `facadeModulePlanner.ts` (ground treatment) |
| Modify | expanders + catalog if new roles needed |
| Tests | planner ground placements + compile |

#### Acceptance

- [x] Kit plan for default demo includes storefront modules on floor 0  
- [x] Split + compile consume those module ids  
- [x] Body floors still use residential/commercial window modules  
- [x] Art Kit Lab lists new modules  

#### Validation

```powershell
npm.cmd run test -- late19cApartmentKit facadeModulePlanner facadeSplitPlan ArtKitLab buildingCompiler
npm.cmd run typecheck
```

#### Exit

Storefront is **kit grammar**, not a special-case mesh function alone.

---

### G5 — Split observability (trace + QA)

#### Intent

Make the expand pipeline debuggable in-product:

- Artifact / run timeline: `FacadeSplitPlan.contentHash`, opening count, scope count.  
- Visual QA / module quality: checklist rows for split presence, pier count, slot/frame alignment status.  
- Assembly Hall optional compact “Split” summary (not a new room).

#### Files (expected)

| Action | Path |
|---|---|
| Modify | `buildingRunController` / artifact registration if needed |
| Modify | `ArtifactTracePanel` or run events |
| Modify | `visualQaPacket.ts`, `moduleQualityReport.ts` |
| Modify | Assembly Hall or Prompt Lab summary UI |
| Tests | UI + QA packet fields |

#### Acceptance

- [x] Completed run exposes split hash in trace or metrics  
- [x] Visual QA packet includes split hash + opening/slot counts  
- [x] Checklist fails if kit mode missing split / zero piers  

#### Validation

```powershell
npm.cmd run test -- visualQaPacket moduleQualityReport facadeSplitObservability ArtifactTracePanel AssemblyHall
npm.cmd run typecheck
```

#### Exit

Quality issues are **attributable** to plan vs expander vs materials.

---

### G6 — Expander unification

#### Intent

Reduce hybrid compiler debt so kit mode is “split → expand → IR” only:

- Single entry for profile moldings (`expandProfileRun`).  
- Single entry for openings (`expandOpeningFromSlot`).  
- Remove dead `FacadePanelPlan` / unused slab helpers if still present.  
- Document expander map in research brief or short architecture note (only if needed for G8).  
- Ensure worker compile path uses same pure functions as main thread.

#### Files (expected)

| Action | Path |
|---|---|
| Create | `src/features/building-family/compiler/expanders/index.ts` (barrel) |
| Refactor | `buildingCompiler.ts` (orchestration only) |
| Move/thin | profile/opening/wall expanders |
| Tests | existing suites green; no public IR schema break without version bump |

#### Acceptance

- [x] `buildingCompiler.ts` reads as orchestrator, not geometry kitchen sink  
- [x] Kit IR golden-ish smoke: mesh batch ids stable list documented  
- [x] Worker + main compile parity for one fixture seed  
- [x] Typecheck + focused tests pass  

#### Validation

```powershell
npm.cmd run test -- buildingCompiler buildingCompilerWorker facadeSplitPlan openingGeometry profileSweepGeometry expanders
npm.cmd run typecheck
```

#### Exit

New geometry features have an obvious home (expander), not another ad-hoc branch.

---

### G7 — Thin second profile / module stress (optional but recommended)

#### Intent

Prove expanders are data-driven: add **one** alternate profile set or window family pack without forking compiler code.

Examples (pick one):

- `profile.cornice.late19c.restrained` (shallower)  
- Rectangular-dominant body windows already exist; add **storefront glazing** profile  
- Second trim density profile for belts  

Not a full second historical style pack unless cheap.

#### Acceptance

- [ ] Seed or control selects alternate profile id  
- [ ] IR / clay visibly different for same massing  
- [ ] No new compiler conditionals per style—lookup by profile id  

#### Validation

```powershell
npm.cmd run test -- profileLibrary profileSweepGeometry facadeSplitPlan
npm.cmd run typecheck
```

---

### G8 — Clay quality gate (plan exit)

#### Intent

Formal exit for the geometry-node quality track.

#### Clay checklist (must pass for default late-19c kit demo seed)

| # | Criterion | Evidence |
|---|---|---|
| 1 | Mass reads as floors × bays (piers continuous) | Clay orbit |
| 2 | Openings read punched (pocket + frame + glass) | Shift-light raking |
| 3 | Ground storefront ≠ upper body | Bulkhead/lintel/door |
| 4 | Cornice continuous molded profile | Clay silhouette top |
| 5 | Belts at intermediate floors | Horizontal rhythm |
| 6 | Base plinth present | Ground line |
| 7 | Seed variety still ≥6 compositions | Unit test + gallery |
| 8 | Split hash in QA/trace | Packet / panel |
| 9 | Kit mode has no default-opening dual path | G1 tests |
| 10 | e2e Assembly Hall still green | `npm.cmd run test:e2e` |

#### Deliverables

- [ ] Checklist recorded in Visual QA packet categories (or module quality) as automated where possible + manual notes for pure visual rows  
- [ ] Short “G8 exit” note in this plan status section  
- [ ] Parent kit plan updated: geometry track ready for WFC/materials  

#### Validation

```powershell
npm.cmd run test -- facadeSplitPlan buildingCompiler moduleQualityReport visualQaPacket AssemblyHall
npm.cmd run test:e2e
npm.cmd run typecheck
```

#### Exit criterion (natural stop)

**G8 complete** ⇒ geometry-node quality track **paused**; next work is either:

- **Layout intelligence** (WFC M12–M13) on modules that already look architectural, or  
- **Material inject** (UTDG brief consumer), or  
- **Product edit loop** (deeper kit swapping)—only if product prioritizes that over layout.

---

## 7. Cross-cutting invalidation

| Change | Facade plan | Split plan | Instances | Materials | IR | GPU |
|---|---:|---:|---:|---:|---:|---:|
| Building seed | yes | yes | yes | no* | yes | yes |
| Floor/bay counts | yes | yes | yes | no* | yes | yes |
| Window/door family | maybe | maybe | yes | maybe | yes | yes |
| Profile id only | no | no | no | no | yes | yes |
| Storefront module swap | yes | yes | yes | maybe | yes | yes |
| Material seed | no | no | no | yes | no | material |
| Planner kind (later WFC) | yes | yes | yes | no | yes | yes |

\*Unless atlas packing depends on physical opening sizes (prefer not to).

---

## 8. Testing strategy

Per packet:

1. **Pure unit tests** for split/expand math (no jsdom when possible).  
2. **Compiler integration** with fixed seeds (hash stability).  
3. **QA schema** updates when new evidence fields appear.  
4. **UI tests** only when packet touches rooms.  
5. **e2e smoke** at G2 (optional), G5, and **required G8**.  
6. Watch **triangle budgets**: high-detail one-building limit remains enforced; if exceeded, simplify densify or instance more.

Benchmark: re-run 100-building construction + 16-orbit after G2 and G6 if mesh density jumps.

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Mesh explosion (subdivided walls + pockets + extrude) | Cap densify steps; instance openings; budget tests |
| Float AABB / integrity flakes | Shared ε helpers; already used in compiler tests |
| Kit plan vs split drift | G1 single authority; strict openings |
| Scope creep into WFC/UTDG | Explicit park until G8 |
| “Looks better” subjective | G8 checklist + Shift-light clay protocol |
| Persistence of new artifacts | Version split plan if stored; optional until G5 |

---

## 10. Non-goals (entire plan)

- Blender Geometry Nodes runtime or file import  
- Full CGA DSL interpreter  
- Photo → structure  
- District / parcel generation (parent Phase F)  
- Live remote material as quality substitute for form  
- Preassembled facade libraries as truth  
- Perfect CSG booleans (additive pockets OK through G8)

---

## 11. Suggested execution order and parallelization

```text
G1 ──► G2 ──► G3 ──► G4
              │
              ├──► G5 (after G2; can overlap G3)
              │
              └──► G6 (after G2; best after G4 for storefront expanders)
                         │
                         ▼
                        G7 (optional)
                         │
                         ▼
                        G8 exit gate
```

- **Do not start G4 before G3.**  
- **Do not start G8 until G1–G2 and G5 are done** (G3–G4 strongly preferred).  
- **Do not start WFC (M12) before G8** unless product explicitly trades quality for layout.

---

## 12. Mapping to parent milestones

| Parent ID | Relation to this plan |
|---|---|
| M1–M11 | Done; foundation |
| M12–M13 WFC | **After G8** |
| M14 UTDG inject | Partial; consumer **after G8** or parallel only if zero structural risk |
| M15 trim sheets | After UTDG consumer |
| M16–M17 block | After WFC + geometry gate |

This plan inserts a **Geometry Quality track (G1–G8)** between “kit grammar usable” and “WFC/layout scale.”

---

## 13. First implementation action (when leaving plan mode)

Start **G1** only:

1. Audit `buildingCompiler.ts` for any kit path that places openings without `FacadeSplitPlan.openings`.  
2. Collapse to split-only for kit.  
3. Tests for 1:1 opening count and hash stability.  
4. No storefront invention in G1.

---

## 14. Status log

| Date | Note |
|---|---|
| 2026-07-12 | Plan created from codebase + GN/CGA research; baseline `92ce977`. |
| | Prior unplanned quality commits: seeds, openings, profiles, pilasters, split walls, split plan. |
| 2026-07-12 | **G1 landed:** kit openings only from split; proof front-only split defaults; 1:1 assert in compiler. |
| 2026-07-12 | **G2 landed:** `openingSlotBinding` locks frame scale + pocket AABB to split slots; oversize diagnostics. |
| 2026-07-12 | **G3 landed:** ground front storefront vertical split (bulkhead/glazing/lintel); proud hierarchy from scopes. |
| 2026-07-12 | **G4 landed:** storefront kit modules + planner ground grammar (bulkhead/glazing/door/lintel). |
| 2026-07-12 | **G5 landed:** split hash + counts in Visual QA / quality checklist / Artifact Trace / Assembly Hall. |
| 2026-07-12 | **G6 landed:** expanders barrel (`expandOpeningFromSlot` / `expandProfileRun`), kit mesh batch id list, worker parity. |

**Next packet to implement:** G7 — Thin second profile / module stress.
