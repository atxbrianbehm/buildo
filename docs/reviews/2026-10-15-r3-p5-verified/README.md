# R3.P5 — verified saved local-window width authority

One absolute local-window width directive now survives portable source Save/Open and the existing viewer transaction. Strict source/file v0.4 requires its source-owned max-one list. Literal v1–v3 remain compatible, and existing global edits retain the list or reject an invalidated target atomically.

All five checks pass: **1,281 tests / 95 files**, TypeScript, lint, build and E2E. Focused codec/controller coverage passes **181 cases / two files**. Source: `61769973414db912091282408e470f205c5050bceef876d87f6fa4fe8b44e14f`. Three production files and two tests change; 248 other sources and historical tests/helpers remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `cb7c986fa4b52b4d4d6c31d12cc0799e621656f28b61b72c650cc0bae2eb52af`
- [Required checks](raw/required-checks-final-01.json)
- [Source review](raw/source-review-01.json) and [root review notes](raw/review-notes-01.md)
- [Before portable compatibility](raw/portable-baseline-before-01.json) and [final compatibility](raw/portable-baseline-after-01.json)
- [Current-source baseline App workflow](raw/app-workflow-01.json)

The width ceiling comes from the authoritative unedited split reconstructed from pinned source/catalog/profile. First equal-base and repeated accepted widths are full no-ops; a replacement may increase to the base ceiling. Restoring the current target removes the directive once, preserving imported v4 empty-list format. An equal-base request at another address retains the existing edit.

Caller hash and revision checks reject stale authority, including equal-content A→B→A cycles. The controller owns the request before awaits, leases the accepted fixture and guards its owner through viewer preparation/publication/commit. Cancellation, supersession, rejected preparation and commit rollback retain the accepted view and retire candidates exactly once.

Source-backed request identities include sourceContentHash. Nonempty width lists skip completed-cache packet creation and writes, because legacy cache replay cannot represent their saved authority. Portable Save/Open reproduces complete edited IR/gallery and all five raw material channels/metadata without interpretation or generation. Pinned inputs and compatible accepted catalog/material artifacts are reused.

Source-backed v1–v4 empty-list packets carry a source-keyed request receipt. P11 can restore their recognized geometry, but the restored view has no saved source authority; a later prompt-only Run rejects unresolved reuse provenance before fixture creation. Reopen the portable source to continue editing. Initial fresh prompt-only cache receipts keep their prior reuse equation.

Review repaired the preflight-ordering and published-source-reference races before verification. The first coherent candidate passes all 181 focused cases and all five required checks. No feature/test repair or check retry was needed.

The four accepted v1/v2/v3/edited-roof-v3 canaries were exercised before edits and after final checks through the actual parser and encoder. Canonical full file outputs remain literal. Tests do not read ignored artifacts. All 253 sources are guarded during capture and copied here with five preimages.

The App smoke still exercises the protected baseline global-edit/selection workflow; it does not apply a width directive through UI controls. No new PNG batch was generated. Existing P1 rendered captures remain inherited. Next: separate selected-window controls, then independent restart persistence/cache replay and undo work. Human appearance, worth-keeping, density and representative performance remain open.
