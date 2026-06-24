# Repository Instructions

## Dynamic Building Family

- Read `docs/plans/dynamic-building-family.md` and `docs/architecture/dynamic-building-family-integration.md` before changing this feature.
- Work in small, reviewable milestones. Do not combine implementation milestones without explicit instruction.
- Preserve the React + Three.js + Zustand direction unless a documented scaffold decision replaces it.
- Core building contracts, deterministic core logic, and compiler modules may not import React, Three.js, Zustand, browser DOM APIs, or application stores.
- Do not use `Math.random()` for structural or material decisions; use the semantic seed tree when it exists.
- Do not add preassembled building, facade, window, door, cornice, or roof meshes.
- Do not place provider secrets in client code.
- Every serialized artifact must be schema-versioned and runtime-validated.
- Structural-control changes must not regenerate material artifacts.
- Add or update tests for behavior changes.
- Before finishing, run the relevant documented checks and review the diff for unrelated changes, resource leaks, stale async updates, and accidental nondeterminism.

