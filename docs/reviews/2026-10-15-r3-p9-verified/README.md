# R3.P9 — accepted-publication checkpoint scheduling

An optional exclusive document writer now receives checkpoints in controller publication order. Data is captured before store observers; the GPU lease is released after synchronous ownership, and writer ownership lasts through commit. Failures keep the accepted scene and previous durable record.

All five checks pass: **1,316 tests / 96 files**, TypeScript, lint, build and E2E. Focused State/checkpoint/codec: **200 / three files**. Source: `ee4d5c3d88e33f741e26b586c78a324563e54f099dab59ee95cd54a13ba04517`. Only two existing files change; 253 other sources remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `38de44643fb8f9a055fc8a28d4158512e8df5a4b92ea882f50b5d2c03114313d`
- [Required checks](raw/required-checks-final-02.json)
- [Source review](raw/source-review-02.json) and [root notes](raw/review-notes-02.md)
- [Current baseline App workflow](raw/app-workflow-02.json) and [current width workflow](raw/app-width-workflow-02.json)
- [Inherited inspected P6 captures](../2026-10-15-r3-p6-verified/raw/rendered-review-02.json)

Nine appended causal cases use actual portable/v4 width compilation and codec decoding, complete material metadata and all five raw channel buffers. Deferred captures and writes prove ownership before retain/status/store observers, GPU retirement while capture/IO are blocked, reverse-completion FIFO, snapshot drain and latest status. Coverage includes retained durable data across capture/write failures with later success, listener/release isolation, four exclusive-capability admission failures, paired retention/capture failure with held drain, explicit import versus cache replay/wrong document, accepted observer throws, stale/rejected/cancelled/no-op exclusion, and zero interpretation/material generation for the width edit. Every historical test/hook/helper remains literal; only new multi-compile cases use explicit 30–40 second budgets.

The first coherent two-file candidate passes TypeScript, all 200 focused cases, both protected App browser workflows and all 1,316 regression tests. Lint then finds one single-assignment context binding in a new test. Both candidate files are captured before the exact two-line cleanup: remove its earlier let declaration and annotate a const at the awaited assignment. Reversing that change reproduces the candidate bytes; every assertion and the other 254 source files, including production, remain literal. Final02 frontloads TypeScript/lint and reruns the focused suites, both browser workflows, full regression suite with two workers and build. The original successful test results, lint failure and repair proof are retained; no production repair or assertion change is made.

Explicit imports create unavailable markers; cache replay writes nothing. Saved status follows commit acknowledgement, latest publication guards protect status, and accepted jobs drain through cancellation/document changes/disposal. The injected writer must already own an exclusive document lease; this packet does not acquire one.

Default App remains unchanged and no automatic restart recovery is claimed. The actual browser workflows rerun without new PNG/detector work. Next is separate exclusive writer acquisition/lifetime preparation. Human appearance, worth-keeping, density and representative performance remain open.
