# R3.P2 — verified window-slot targeting

Targeting preparation complete. A standalone versioned facade/floor/bay address identifies a logical window cell under its owning document. Exact current frame/glass paths resolve to that address; reverse lookup returns one owned window placement. Doors, missing cells, ambiguous cells/aliases and malformed payloads reject explicitly.

All five checks pass: **1,251 tests / 95 files**, TypeScript, lint, build and E2E. Focused full document/split-plan coverage passes **81 cases / two files**, including 48 added cases. Source: `ec4f66563b333c140ca6182bd52ccf94e01763c401247dc93778844509765ff6`. Four existing files change; all other 249 sources remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `31f02e08b7fafbdbc9d13405dc08ebb6c50662b638abf8ca7309a7f09ba54623`
- [Required checks](raw/required-checks-final-03.json)
- [Source review](raw/source-review-02.json)
- [Current-source App workflow](raw/app-workflow-02.json)
- [Measured oracle repair](raw/oracle-repair-02.json) and [two-case diagnostic](raw/realm-diagnostic-01.log)
- [Failed first focused run](raw/focused-final-01.log) and [exact candidate sources](raw/candidate-sources-01.json)

The tests join actual kit/proof compiler frame and glass entries, exercise all four facade coordinate axes, and retain surviving logical addresses across reordered openings, changed family/module paths and added floors. They cover duplicate window/door cells, raw/glass alias collisions, stale unmatched paths, strict hostile JSON boundaries and owned coordinate arrays. Plans, hashes, geometry and compiled IR remain unchanged. The complete old contract is a literal prefix; all existing compiler function/interface declarations and historical test bodies remain exact.

First focused run passed79/81 but failed only two new cloned-IR equality checks. A diagnostic confirms both original/cloned values are Float32Array with different constructor identities and identical normalized metadata/raw bytes. Only the new test oracle changes; all252other sources remain exact. The corrected cases preserve all own metadata keys and typed-span tags/types/lengths/offsets/raw bytes, detect a changed actual vertex byte, restore it and require exact final equality. The full81case pass is separate from the filtered2case diagnostic.

The first full-unit attempt has 1,250 passes and one existing benchmark-profile timeout at its unchanged five-second deadline. The complete same-source rerun passes all1,251 with the same command; the failed attempt stays retained. Accepted checks combine preflight02 and final03 on the identical source. The unchanged P1 E2E workflow runs again on P2's frozen source using its existing runtime-validated receipt format. Its structural edit/Open, complete IR/source/material invariance, native disclosures, actual pointer/keyboard selection, orbit, marker-bounds and camera-framing checks pass. No new PNG batch is generated. [P1's six inspected views](../2026-10-15-r3-p1-verified/raw/visual-review-02.json) remain inherited evidence because UI/renderer sources are protected unchanged. Four portable source canaries are inherited and hash-bound without a new four-canary roundtrip.

This is a document-relative logical address, not global physical identity or independent old-revision authentication. Local width edits, Save/Open authority, apply-to-floor and undo remain separate. Human appearance, worth-keeping, density and representative-machine/family-performance gates stay open.

Next separate packet: a validated split-plan width kernel with aperture/frame/glass/reveal alignment. Worker transport, emitted-IR identity, cache/replay and source/UI integration must follow before active authored editing is claimed.
