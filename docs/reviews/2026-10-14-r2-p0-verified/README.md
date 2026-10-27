# R2.P0 — authored source contract and pure resolution

Complete for pure preparation. The live app still uses its existing store, fixture and normalization path; this packet does not implement artist-facing source save/reopen.

Packet `2026-10-14-r2-p0` began on October 14; final checks/preservation completed **2026-10-15 (America/Chicago)**. Base remains local `main` at `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9` plus the mixed revival worktree. No commit, push, publication or remote-provider call occurred.

## Behavior

[BuildingDocument](../../../src/features/building-family/contracts/buildingDocument.ts) is a strict versioned parameter source: identity/revision, original intent/style content references, four semantic seeds, six optional authored values (floors, bays, roof, trim, window, cornice) and typed component-lock metadata. Unsupported graph/scope/surface directives reject. An absent override differs from an explicitly authored default. Component locks retain existing metadata semantics.

[resolveBuildingDocument](../../../src/features/building-family/core/resolveBuildingDocument.ts) validates original dependency snapshots and constraints, projects explicit values before legacy normalization, then retains a valid authored window after late building-seed variation. This preserves correlated widths, floor stacks, roof/cornice identity and requested-bay metadata. Explicit choices that cannot be retained reject; unrelated proposal warnings remain valid.

Resolution receipts are runtime-validated and versioned. They bind document/revision/content, original dependency hashes, resolver version and resolved-spec content. `spec.sourceIntentHash` binds the effective intent after projection. These are content receipts, not structural or runtime cache identities. Shape-invalid schemas produce Zod issues; valid-shaped unsafe dependencies/reference/constraint conflicts produce rejected receipts without a spec.

Document/dependency snapshots are owned before the first await, protecting resolution from later caller mutation. Plain-JSON checks also cover opaque PSG/legacy-lock payloads and standalone receipt diagnostics; unsafe values, cycles, holes, accessors, symbols, nonplain objects/arrays and nonfinite values reject. Size/depth limits keep traversal bounded. Declared optional undefined fields retain existing omission conventions.

## Scope and evidence

Exactly four new files were added, with **zero changes/removals among the preceding 247 source files**:

| New file | Final SHA-256 |
|---|---|
| `contracts/buildingDocument.ts` | `826ad46e2baa7793b7afa5a0b7511b3002c9bf878ec92cccc5add2b00e237063` |
| `core/resolveBuildingDocument.ts` | `03521e3682b601174e7d462a1ef987a78d57dedc9944113a84fd3142a30c5ffa` |
| `tests/buildingDocument.test.ts` | `c13918303c5e78cc0efadff09aa7e59dc870aa98f90148f0dd088c2e0869772a` |
| `tests/resolveBuildingDocument.test.ts` | `8cfc11d37ed7e2a5468d06f2458cc2d8523b95a7c1a79b3d15a6ea334f856e2b` |

Paths are relative to `src/features/building-family/`. Final source aggregate, 251 files: **`d099785ab3ee2c6421debb84779a185f5a317bb17842ac42a19070a046a6412b`**.

- [Pre-edit ledger](../../../test-results/r2-p0-2026-10-14/before-source/source-baseline.json), SHA **`7e1ef3773d811c9a6e4b5831e565e0697a0030f26e965dff7521f7f3a2b41228`**, preserves 253 literal copies including all 247 sources and accepted starting documents. The four added paths were absent before/after actual freeze execution, which exited 0.
- [Durable final checkpoint](source-and-check-checkpoint.json), SHA **`1666edf558c986eb46f9cc36f1894cb179d5b6b4600cca9e2c7293b36e1f87d1`**, equals the [raw checkpoint](../../../test-results/r2-p0-2026-10-14/final-02-proof/source-and-check-checkpoint.json) byte-for-byte. It records exact four-only delta, 17 literal input copies (new sources, five logs, seven provenance files and tracked patch), all 251 hashes and five actual source-bound checks.
- [Actual preservation log](../../../test-results/r2-p0-2026-10-14/verification-final-02.log) ends `R2_P0_PRESERVATION_EXIT_CODE=0`. Accepted verifier SHA: `abe05e9373fe52a9415555ab3e32161e56c6a0b34876280214ac547d7965956d`; check-wrapper SHA: `78a883d62b8ec58f59b2f7cd15714667fd49fa0d40757ef7c5320ffe2a7a7dc8`.
- Material/compiler/render evidence is explicitly inherited from [accepted S10](../2026-10-14-r1-s10-verified/README.md) through the immutable pre-edit proof. Those 247 sources remain unchanged. P0 adds no material-generation calls or R1 acceptance captures; existing unit/E2E fixtures still construct transient materials as part of their checks.

## Verification

The two new suites contain **51 passing cases**: proposal four → authored seven; complete correlated specs; the actual late-window counterexample; coherent cornice/roof choices; empty-authored legacy parity; dependency/version/constraint rejection; source JSON roundtrip; immutable inputs; async caller mutation; strict lock metadata and safe serialized receipts. Independent source/test review passed on the final hashes, including corrected actual lock-array cases. Diff and new-file whitespace checks passed.

| Required command | Accepted final-02 result |
|---|---|
| `npm.cmd run test` | Exit 0; **952 tests / 94 files** ([log](../../../test-results/r2-p0-2026-10-14/test-final-02.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r2-p0-2026-10-14/lint-final-02.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r2-p0-2026-10-14/typecheck-final-02.log)) |
| `npm.cmd run build` | Exit 0; existing non-failing chunk-size advisory ([log](../../../test-results/r2-p0-2026-10-14/build-final-02.log)) |
| `npm.cmd run test:e2e` | Exit 0 ([log](../../../test-results/r2-p0-2026-10-14/e2e-final-02.log)) |

All five logs bind identical source-before/after hashes and stable results. E2E's terminal log includes `ALL_FIVE_CHECKS_PASSED_AND_SOURCE_STABLE`. Final focused/scoped/type checks are retained in [focused-03](../../../test-results/r2-p0-2026-10-14/document-focused-03.log), [lint-03](../../../test-results/r2-p0-2026-10-14/document-lint-03.log) and [typecheck-03](../../../test-results/r2-p0-2026-10-14/document-typecheck-03.log).

Excluded evidence remains intact. Focused attempt 01 passed while lint caught three unused omission bindings in a new test fixture; attempt 02 passed both. Full-five final-01 passed 952 tests, lint and E2E, but typecheck/build exposed a bare-array `it.each` table: callbacks received individual locks, making three negative cases test the wrong shape. Object rows now pass complete arrays for mismatched path/key, duplicate targets and unsupported scope/value, with the valid-lock positive control retained. Focused/lint/typecheck attempt 03 and full-five final-02 pass. No legacy assertion or historical guard was relaxed; final preservation passed on its first execution.

## Boundaries and next packet

The modules are not yet wired into live controls or completed-family persistence. P0 does not establish source reopening, compiler-content cache identity, stale saved-IR migration or atomic runtime replacement. R1's human appearance, worth-keeping, measured whole-building density and representative-machine/family-performance gates remain open.

The [next packet](../../plans/building-authoring-revival.md#ready-queue) is R2.P1 transactional same-ID fixture activation. Current duplicate registry IDs, stale child aliases and delayed persistence ownership must be corrected before live source integration. It will preserve viewer lifetimes and material reuse; unknown restored provenance remains explicit. Source save/reopen and compiler migration stay separate.
