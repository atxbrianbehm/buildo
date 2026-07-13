# Period Reference Lab Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** Start using `docs/ref` (plus the HABS pack under `docs/research/period-reference`) for manual visual comparisons between kit-mode renders and photo references.

**Architecture:**

- Schema-versioned catalog at `docs/ref/catalog.json` (validated in pure QA module).
- Vite middleware serves `/period-ref/user/*` and `/period-ref/habs/*` from docs folders (dev/preview).
- `#room=periodRef` Period Ref Lab: browse refs, score rubric, download comparison notes JSON.
- Does **not** drive structure generation; complements automated Visual QA packets.

## Tasks

1. [x] Catalog + README for `docs/ref` and HABS pack  
2. [x] `periodReferenceCatalog` parser + comparison notes + tests  
3. [x] Static middleware plugin + path safety tests  
4. [x] PeriodReferenceLab UI room + store/App wiring  
5. [x] Visual QA known-gap note pointing at periodRef  

## Validation

```powershell
npm.cmd run test -- periodReferenceCatalog PeriodReferenceLab visualQaPacket
npm.cmd run typecheck
```

**Status:** implemented 2026-07-12.
