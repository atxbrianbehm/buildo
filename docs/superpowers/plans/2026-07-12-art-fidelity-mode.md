# Art Fidelity Mode (`proof` | `kit`) Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** Milestone M9 / Slice 6 — explicit `fidelityMode` control so users can run the same prompt as proof (hardcoded front openings, no art-kit plan node) or kit (facade planner + plan-driven openings), with persistence, export, import, and benchmarks recording the mode.

**Architecture:**

- `BuildingPromptControls.fidelityMode: "proof" | "kit"` (default `"kit"` to preserve current product path).
- `buildBuildingGraph(spec, catalog, { fidelityMode })` omits art-kit `Group` node in proof mode.
- `compileBuilding({ fidelityMode })` already branches openings; always pass the control explicitly from fixture/run.
- `AssemblyHallFixture.fidelityMode` is the runtime source of truth for export/benchmark.
- Completed-family persistence + export bundles include schema-validated `fidelityMode`.
- Benchmark profile packet records `fidelityMode` from fixture.
- Invalidation: fidelity mode changes graph + IR + GPU, not materials.

**Parent plans:** kit-grammar M9, art-fidelity bridge Slice 6.

---

## Files

| Action | Path |
|---|---|
| Create | `docs/superpowers/plans/2026-07-12-art-fidelity-mode.md` (this file) |
| Modify | `state/buildingStore.ts` |
| Modify | `core/invalidation.ts` |
| Modify | `compiler/buildingGraphBuilder.ts` |
| Modify | `ui/assemblyHallFixture.ts` |
| Modify | `state/completedFamilyPersistence.ts` |
| Modify | `state/completedFamilyExportBundle.ts` |
| Modify | `performance/familyBenchmarkProfilePacket.ts` |
| Modify | `app/App.tsx` (+ CSS if needed) |
| Modify | tests for store, invalidation, graph, compiler, fixture, export, benchmark, App |

## Tasks

1. [x] Controls + invalidation  
2. [x] Graph builder fidelity option  
3. [x] Fixture compile/graph wiring + fixture field  
4. [x] Persistence/export  
5. [x] Benchmark profile  
6. [x] Prompt Lab UI  
7. [x] Docs + validate  

## Acceptance

- [x] Same prompt renders differently in proof vs kit (window instance counts / art-kit node presence)
- [x] Packet/export/import carry fidelityMode
- [x] Benchmark profile includes fidelityMode
- [x] Material artifacts reusable across fidelity-only changes
- [x] Typecheck + focused tests green

## Validation

```powershell
npm.cmd run test -- buildingState invalidation buildingGraphBuilder buildingCompiler assemblyHallFixture completedFamilyExportBundle completedFamilyPersistence familyBenchmarkProfilePacket App
npm.cmd run typecheck
```
