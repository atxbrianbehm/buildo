# Art Kit Lab And Sample Gallery Upgrade Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** Milestone M10 / Slice 7 — add `#room=artKitLab` for inspecting the late-19c art kit (modules, materials, presentation modes, quality report) and upgrade Sample Gallery to label fidelity mode honestly.

**Architecture:**

- New pure UI room `ArtKitLab.tsx` under `ui/` (no Three in tests beyond optional fixture).
- Kit data from `late19cApartmentKit` + `resolveArtKitMaterialSet`.
- Optional live fixture for graph plan diagnostics / fidelity mode badge.
- Presentation modes (clay / wireframe / textured) are inspectable SVG module previews — not a second renderer.
- Sample Gallery surfaces `fixture.fidelityMode` on summary + cards.
- Room routing extends existing hash `#room=artKitLab`.

**Parent plans:** kit-grammar M10, art-fidelity bridge Slice 7.

---

## Files

| Action | Path |
|---|---|
| Create | `ui/ArtKitLab.tsx` |
| Create | `tests/ArtKitLab.test.tsx` |
| Modify | `ui/SampleBuildingGallery.tsx` + test |
| Modify | `state/buildingStore.ts` (`BuildingRoom`) |
| Modify | `app/App.tsx`, `App.css`, `App.test.tsx` |
| Update | parent plans + integration map |

## Acceptance

- [x] `#room=artKitLab` lists modules with dimensions and material roles
- [x] Clay / wireframe / textured presentation toggles update previews
- [x] Quality report shows module count, material roles, diagnostics
- [x] Sample Gallery labels kit vs proof fidelity
- [x] Tests + typecheck green

## Validation

```powershell
npm.cmd run test -- ArtKitLab SampleBuildingGallery App buildingState
npm.cmd run typecheck
```
