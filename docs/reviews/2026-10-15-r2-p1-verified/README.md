# R2.P1 — transactional fixture activation

Complete for this bounded runtime milestone. Identical-input regeneration and restore replace the active fixture and its child aliases coherently, and a failed replacement renderer retains the last valid scene.

Verified October 15, 2026 (America/Chicago), on local `main` at `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9` plus the existing mixed revival worktree. No commit, push, publication or paid-provider call occurred.

## Behavior

The registry prepares a complete fixture-owned artifact set before publication. Controller operations use independent identity and abort guards across generation, restore and persistence. Same-ID replacements refresh all eight aliases; retiring an old owner cannot remove its replacement. Viewer/export leases keep exact fixture objects alive until their consumers finish.

Assembly Hall prepares a private scene, renderer and first frame while the valid canvas stays active. Publication switches reversibly, then finalizes the old viewer and retires its owner. Failed preparation, cancellation, supersession and late renderer completion clean only their own candidates. Cleanup attempts every owned resource before lease release, even when one disposer throws; abort listeners contain event-driven cleanup exceptions.

Restore copies caller-owned receipts and typed buffers before asynchronous work and explicitly clears the unrelated control baseline. Unproven restored structural reuse fails with `building.restoredReuseProvenanceUnresolved` while preserving the scene. An exact saved request plus actual artifact provenance permits a fresh compile; subsequent known-baseline structural edits preserve material bytes. No authored controls are inferred from legacy spec or trace.

App intent guards span file reading/conversion, newer runs/imports, cancel, document navigation, unmount and startup fallback. An older import cannot overwrite a newer action. Downloads lease their captured fixture across asynchronous export.

## Scope and verification

Exactly five production files and three test files changed. No source files were added or removed; the other **243 sources** match their accepted literal snapshots. The [source review](../../../test-results/r2-p1-2026-10-15/source-review-final-01.log) and [scoped whitespace check](../../../test-results/r2-p1-2026-10-15/source-review-diff-check-01.log) passed on the final hashes.

The existing seams are `state/artifactRegistry.ts`, `state/buildingRunController.ts`, `state/buildingStore.ts`, `ui/AssemblyHall.tsx` and `src/app/App.tsx`. Feature paths start at `src/features/building-family/`. Coverage is in `tests/buildingState.test.ts` (46 cases), `tests/AssemblyHall.test.tsx` (25 cases) and `src/app/App.test.tsx` (24 cases), including a real App/controller renderer-rejection transaction.

| Required command | Accepted final-01 result |
|---|---|
| `npm.cmd run test` | Exit 0; **1,001 tests / 94 files** ([log](../../../test-results/r2-p1-2026-10-15/test-final-01.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r2-p1-2026-10-15/lint-final-01.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r2-p1-2026-10-15/typecheck-final-01.log)) |
| `npm.cmd run build` | Exit 0; existing chunk-size advisory ([log](../../../test-results/r2-p1-2026-10-15/build-final-01.log)) |
| `npm.cmd run test:e2e` | Exit 0 ([log](../../../test-results/r2-p1-2026-10-15/e2e-final-01.log)) |

All five logs bind the unchanged **251-file** source aggregate `b8f3084c1507cdf7ea95e94f10d4d4d915179764168563ea2b2bef809b37e76e`. The [external wrapper](../../../test-results/r2-p1-2026-10-15/final-checks-wrapper-01.log) exited 0; E2E contains `ALL_FIVE_CHECKS_PASSED_AND_SOURCE_STABLE`.

## Actual app proof

[Accepted app-proof-02](../../../test-results/r2-p1-2026-10-15/app-proof-02/result.json) and its [external log](../../../test-results/r2-p1-2026-10-15/app-proof-02.log) pass with WebGPU and zero page errors: initial generation, identical rerun, restore, exact restored rerun, then a structural rerun. Five snapshots hash actual saved IR buffers. Four actual exports match their saved header/receipt and shared-channel bindings; preservation does not run full export-bundle verification. All five raw RGBA atlas channels retain identical dimensions, byte lengths and SHA-256 hashes while structural geometry/bounds change.

The [initial canvas](../../../test-results/r2-p1-2026-10-15/app-proof-02/initial-canvas.png) and [structural canvas](../../../test-results/r2-p1-2026-10-15/app-proof-02/structural-canvas.png) were inspected: the visible building changes from four to five floors. Unit lifecycle assertions establish exact runtime/root object identity and failure retention; PNG byte inequality alone is not a decoded-pixel comparison or an aesthetic gate.

## Preserved evidence and excluded attempts

The [pre-edit ledger](../../../test-results/r2-p1-2026-10-15/before-source/source-baseline.json), SHA `bca3fa7ec8b45c82e30e83ea335f3c8d4768fbd8748552a1294fe916c587ba64`, pins accepted P0 and all 251 inherited snapshots, with eight editable preimages.

The [durable checkpoint](source-check-and-app-checkpoint.json), SHA `7f0aa7f5fe88fca97d7270a58718cf905ae9df18d461f90719ccfcd3a7d9142f`, equals the [raw checkpoint](../../../test-results/r2-p1-2026-10-15/final-01-proof/source-check-and-app-checkpoint.json) byte-for-byte. It records the exact eight-file delta, 28 preserved inputs plus one ledger, five source-bound checks, and the actual app result/exports/captures. [Preservation](../../../test-results/r2-p1-2026-10-15/verification-final-01.log) exited 0. Accepted verifier SHA: `fed04ff063f14b67a3016f479d1141863f893215979ab1d49b5de19a31f7d8af`; wrapper SHA: `ac6c11029ca3271c21bc274acd1eb02d027bdf4fb20cdfe2b774259b98fdae71`.

Excluded intermediate results remain intact. Typecheck-01 caught two invalid new disposal mocks, corrected to actual zero-resource receipts. UI-focused-02 retained three legacy one-second readiness timeouts; the same functional completion assertion now has a bounded ten-second wait. UI-focused-03 exposed missing route isolation in new tests; lint-02 caught three new lint errors. These were corrected without removing assertions. Final Hall, lint and typecheck runs pass, as does the full final suite.

[App-proof-01](../../../test-results/r2-p1-2026-10-15/app-proof-01.log) timed out at the initial 45-second completion wait. Its [helper snapshot](../../../test-results/r2-p1-2026-10-15/app-proof-01/helper.mjs.snapshot) is preserved with its original hash. Failure diagnostics were added; app-proof-02 and the separate final E2E passed with unchanged production source and no timeout increase. The first timeout's cause remains unexplained; it is excluded, with no claim that a startup defect was diagnosed or fixed.

## Remaining gates

R1 human appearance, worth-keeping, measured whole-building density and representative-machine/family performance remain open. P1 retains legacy identities; authored source save/reopen, compiler-aware identity, stale completed-IR migration and broad restore-to-recompile acceptance remain later R2 work.

The [next packet](../../plans/building-authoring-revival.md#ready-queue) is R2.P2: retain the existing explicit window-family choice during fresh compilation.
