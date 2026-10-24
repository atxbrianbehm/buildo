# R2.P2 — authoritative window choice on fresh compilation

Accepted 2026-10-15. The existing window-family control now survives late seed variation in fresh compilation. P0 resolves its explicit choice before atlas planning, catalog selection, graph construction and compilation. An absent choice keeps the legacy path.

Only two existing sources changed: the fixture and its test. All 249 other sources match the accepted P1 snapshots. The six new cases preserve all eleven original cases. Compatible catalogs retain identity; incompatible window recipes rebuild against the retained atlas.

The [versioned checkpoint](source-check-and-app-checkpoint.json) binds exact source snapshots, inherited protected sources, final logs, browser evidence and excluded attempts. Its SHA-256 is `db2c70c78b0f9a9d890cb4b8508a82acbd04771ff6d050be17d22d2062953ab9`; the 251-source aggregate is `ad0a84624b6f097397e61456dd21478a3a6ed3e29455d4ed129e0657973fa0cb`.

| Check | Actual final result |
|---|---|
| [Unit tests](checks/test-final-01.log) | Exit 0; 1,007 tests across 94 files |
| [Lint](checks/lint-final-01.log) | Exit 0 |
| [Type checking](checks/typecheck-final-01.log) | Exit 0 |
| [Production build](checks/build-final-01.log) | Exit 0; existing non-failing chunk-size advisory |
| [Browser smoke](checks/e2e-final-01.log) | Exit 0 |
| [Source review](review/source-review-final-01.log.snapshot) | Two permitted changes, 249 protected sources, original tests intact, no concrete findings |
| [Preservation](verification-final-01.log) | Actual external exit 0; 39 literal input copies, one patch and one ledger |

All five final commands used the same source aggregate before and after execution. The scoped diff check passed; its actual LF-to-CRLF warning streams are retained.

The [real App proof](app/result.json) uses the opposing seeds `fam / building-seed-variant-07 / mat / trim`. It records the actual saved and exported spec, frame/glass recipe IDs and connected-canvas Three.js geometry for arched and rectangular selections. Both cases used WebGPU. The submitted frame position buffers differ.

The procedural-provider hook has a positive control: the fresh opposing-seed run makes 12 calls. The window-only swap makes zero calls. All five actual saved raw channel spans, dimensions and hashes remain identical; the complete exported atlas also remains identical. Other structural spec fields remain equal, excluding the requested window choice and its necessarily changed source-intent hash.

The four actual captures were inspected:

- [Arched control and recipe](app/arched-component-forge.png)
- [Arched building](app/arched-assembly-hall.png)
- [Rectangular control and recipe](app/rectangular-component-forge.png)
- [Rectangular building](app/rectangular-assembly-hall.png)

The retained [causal red run](retained-attempts/0-causal-red/test-results/r2-p2-2026-10-15/opposing-red-01.log.snapshot) failed against the unchanged old factory: requested arched, returned rectangular. Earlier integration failures remain excluded. They exposed an overstrict catalog check against changing legacy IDs and a required-control typing error; neither was hidden by relaxing existing assertions.

A retained [material diagnostic](retained-attempts/1-diagnostic/test-results/r2-p2-2026-10-15/material-snapshot-diagnostic-01.log.snapshot) proved that every raw channel byte and complete serialized material artifact matched while structured-clone typed-array constructors differed. The two new tests now compare complete serialized metadata and independent copied primitive byte arrays, retaining object identity and zero-provider-call assertions.

The durable folder contains 42 literal files from the proof and actual preservation log, plus this review card. Its checkpoint and helper snapshot match the executed versions byte for byte. Historical protected snapshots remain inherited through their accepted checkpoint pointers.

Source save/reopen, compiler-content identity and legacy completed-IR migration remain separate work. This packet establishes control authority and material reuse on fresh compilation. Screenshot PNGs are visual records; no decoded-pixel comparison, aesthetic approval, measured whole-building density or representative-machine performance sign-off is inferred. R1's human gates remain open. No commit, push, paid provider, publication or release occurred.
