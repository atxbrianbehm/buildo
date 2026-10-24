# R3.P10 — exclusive checkpoint writer lifetime

A nonblocking exact-document Web Lock now supplies the controller's exclusive checkpoint capability. Close denies new retains, drains retained/admitted work and waits for native settlement. Storage is constructed only after grant; actual P8 parsing and acknowledgement remain authoritative.

All five checks pass: **1,325 tests / 97 files**, TypeScript, lint, build and E2E. Focused writer/checkpoint: **19 / two files**. Source: `3be00d4ac4e32e093dad4b53d3fb2dcd9857f712225c77be648282c6afcf54a8`. Two new paths; every prior 255 source remains literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `5922183aaa2cabf254c6e967d23fbab3fa212e5444ca5e01e699f077de2fb16c`
- [Required checks](raw/required-checks-final-01.json)
- [Source review](raw/source-review-01.json) and [root notes](raw/review-notes-01.md)
- [Current baseline App workflow](raw/app-workflow-01.json) and [width workflow](raw/app-width-workflow-01.json)
- [Inherited inspected P6 captures](../2026-10-15-r3-p6-verified/raw/rendered-review-02.json)

Nine causal cases exercise installed lock overloads, exact request options/document isolation, deferred factory, unsupported/native/factory failures, captured option references, retained work after close, independent callback/native settlement, real P8 pre-await ownership, early release through parse and IO, parser/accessor/document admission, exact storage causes with later recovery, native loss before/after delegation, and the acquisition-delivery failure race. Every historical source and test remains literal.

Source review found an acquisition-delivery race before checks. Both new candidate files and the full source manifest were captured before a bounded final-held guard and ninth causal case were added. Exact inverse checks reproduce both candidates; all eight original test bodies and all 255 existing sources remain literal. The first tested final candidate passes TypeScript, lint, all 19 focused cases, both App workflows, all 1,325 regression tests with two workers and build. No feature/test repair after checks or check retry was needed. The first inverse-recorder preparation retained one surplus separator newline; its corrected helper passes without source changes. Two archive attempts referenced old wrapper-log names and stopped before durable-directory creation; their failures are retained, the paths were corrected, and the already-written width receipt is accepted only after exact byte comparison.

Unsupported/busy ownership produces no writable session. Native/factory/IO failures retain their causes. Unexpected loss after delegated IO cannot undo that IO; failure is conservative even if a write committed. Controlled manager tests do not establish native multi-page App integration.

Default App remains unchanged. App status/recovery is next; no automatic restart recovery, new visual approval, representative performance or release readiness is claimed.
