# R3.P14 verified checkpoint

Compiler and worker batch support is engineering complete. A strict versioned envelope compiles several addressed window widths atomically while preserving the legacy max-one API and exact final-split identity.

All five checks pass: **1,376 tests / 97 files**, TypeScript, lint, build and E2E. Focused worker coverage: **22 / one file**. Source: `668364522c6c2fed2956c44197baaf15cce280f2027b4c1e8fa69334ce76b03f`. Five paths change; 252 remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `0771f925664958764de9e2a36d4504148863c5bb6d0845743034a674c23f2f80`
- [Required checks](raw/required-checks-final-01.json)
- [Source review](raw/source-review-01.json) and [root notes](raw/review-notes-01.md)
- [Legacy reconstruction and complete historical test prefix](raw/historical-source-preservation-01.json)
- [Inspected captures](raw/rendered-review-01.json)
- [Workspace](app-workflow.json), [width edits](app-width-workflow.json), [automatic recovery](app-recovery-workflow.json) and [undo/redo/recovery](app-width-history-workflow.json)

Nine appended Worker cases compare complete IR and raw spans across direct compilation, the default runtime and real client for kit/proof and high/low. They anchor literal old goldens, empty/all-noop/single parity, actual P13 floor and discovered cross-facade geometry, unchanged wall/instance spans and material inputs, canonical numeric 1/2/10 ordering, exact hash receipts, full input ownership, getter-safe malformed/duplicate/dual admission, held-request survival, typed late failures, admitted semantic supersession, cancellation and listener/unique-buffer cleanup. The entire old 40,680-byte Worker test file is a literal prefix.

Candidate 01 passed every required stage without a source repair or feature-check retry. The corrected runner 02 replaces an unused parser-only preparation with a stale P13 log heading. A notes-writer pin typo failed before notes creation and its dependent source review failed on missing notes; corrected writer 02 and review wrapper 02 then passed. These helper-only attempts remain preserved and are distinct from the single successful feature candidate.

Existing native workflows supply regression evidence. Saved multi-window source and floor editing follow separately. The in-process wire does not prove native-thread detachment. Human appearance, worth-keeping, density and representative performance remain open.
