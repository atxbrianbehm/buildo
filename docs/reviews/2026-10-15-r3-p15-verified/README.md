# R3.P15 verified checkpoint

Complete multi-window source survives selected-member edits, full-set undo/redo, Save/Open and automatic recovery. Strict v5 authority retains all members; legacy v1–v4 behavior remains compatible.

All five checks pass: **1,388 tests / 97 files**, TypeScript, lint, build and E2E. Focused source/controller/App: **277 / three files**. Source: `987fbfbec3f43c0ca02f86cc3f97158a167a809c96fea675a9cc7439264f86c9`. Eight paths change; 249 remain protected. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `3a0bc355f12e9bf729bf1a15057e92aa722421ccbb0a4df369d02489220caaa2`
- [Required checks](raw/required-checks-final-04.json)
- [Source review](raw/source-review-04.json) and [root notes](raw/review-notes-04.md)
- [Historical preservation](raw/historical-source-preservation-04.json)
- [Seven fresh compatibility roundtrips](raw/portable-compatibility-04.json)
- [Inspected captures](raw/rendered-review-04.json)
- [Native batch source/recovery](app-width-batch-workflow.json), [workspace](app-workflow.json), [single width](app-width-workflow.json), [recovery](app-recovery-workflow.json), and [history](app-width-history-workflow.json)

Twelve appended cases cover canonical full-set version/noop rules, signed order/unknown-field/duplicate/getter/hash/cross-version admission, eager ownership, global carries, literal five-channel receipts, actual custom-pinned two-window kit/high and proof/low replay, complete IR/gallery/spec/catalog/graph equality, second-member upsert/restore and full-set history, invalid-member/global rejection, held cancellation and viewer rollback, actual checkpoint codec-backed put/get, App selection/explicit-base Restore, and owner release before cold recovery. The complete three historical test files remain literal prefixes.

Four frozen candidates and their actual failures remain preserved. Candidate 01 stopped at TypeScript on an unknown mock argument in a new test. Candidate 02 changed only that assertion to the same runtime address oracle; TypeScript and lint passed, then focused coverage reported 276 passes and one new App readiness failure. Candidate 03 added only default waitFor on the exact post-Restore field value, passed its actual one-case diagnostic and all 277 focused cases, then failed the new native expected-gallery comparison after the four inherited workflows had passed. The gallery carries geometry identity; candidate 04 corrects only the new oracle to build each complete expected gallery from its separately expected P14 IR. Exact inverses preserve the three earlier candidates, and all production/test paths remain identical between candidates 03 and 04. Candidate 04 actually executes one isolated App case, all focused cases, all five native workflows and the complete required checks. Parser-only preparations and helper-only failures are retained separately, including one premature compatibility invocation before its source manifest existed; the later seven-case compatibility main passes on the current frozen source.

Floor-wide editing follows separately. Native proof does not accept architectural appearance, representative performance or physical worker-thread detachment. Those gates remain open.
