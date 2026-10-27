# R3.P12 — Accepted window-width undo/redo

The inspector now undoes and redoes accepted width edits through the same source-guarded transaction. Each real transition increases revision and participates in automatic source saving. History owns bounded directive state and resets at source/document boundaries or restart.

All five checks pass: **1,357 tests / 97 files**, TypeScript, lint, build and E2E. Focused App/State: **186 / two files**. Source: `8301fd433f7a7fbcfbfbf20c7ea812ce31c34dafc856c875fb2b5205376ed799`. Five existing paths change; 252 others remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `382c6ae99dfe6fc00201bc09024dd6c5fe7e08ac2777b82f6ca98651626d3f76`
- [Required checks](raw/required-checks-final-01.json)
- [Source review](raw/source-review-01.json) and [root notes](raw/review-notes-01.md)
- [Inspected current captures](raw/rendered-review-01.json)
- [Workspace](app-workflow.json), [width edits](app-width-workflow.json), [automatic recovery](app-recovery-workflow.json) and [undo/redo/recovery](app-width-history-workflow.json)

Four new App cases and nine controller cases exercise multi-step undo/redo, original-width restoration and different-target replacement, new accepted branches, no-op and invalid-request exclusion, monotonic revision and stale supplied authority, owned requests, held/canceled work, rejected viewers, document changes and commit-time ABA, changed candidate source, retired aliases and GPU fixture disposal. They also prove history visibility before observers and queued commands, accepted observer failure, explicit same-source Open and other accepted publication boundaries, the 32-entry cap, one-time document-listener release, checkpoint FIFO and failed-save authority. App coverage uses the existing renderer mock and controlled writer interface; the separate browser proof uses native locks and the actual Hall. Native text-key events are not intercepted. All historical test bodies remain literal.

The first reviewed source candidate (01) passed the required checks without a feature-source repair or retry. Root verified both complete historical test-file prefixes and reconstructed the earlier E2E script byte-for-byte by removing only the P12 block and invocation. Read-only helper review added accepted-baseline, aggregate-source and prior-checkpoint pin guards before their mains ran; earlier parser-only preparations remain preserved.

The native proof compares actual source, complete IR/gallery, pinned inputs, five material channels and metadata before/after undo and redo, then acknowledges, closes and recovers the current source with empty history. Human appearance, worth-keeping, density and representative performance remain open.
