# AL.P11.25 — retained storefront family opening variation

The isolated family study combines its existing roof and massing variation with upper round-headed or rectangular windows and sash layouts. All six members retain the authored sign, awning, rods, clearance and material identity. Opening locks remain authoritative; unsupported variation groups remain guarded. Expanded receipts include the family seed and composition hash, including opening-only variation.

The [rendered textured fixture](family.png) shows visibly different upper window heads and building proportions. It still repeats brick, storefront arrangement and awning placement, and is not street-ready or a historical reconstruction. This remains an isolated study, not saved-family or workspace integration; architecture coverage is unknown.

The global opening lock prevents variation. A direct imported `construction/opening/upperFrontRoundHead` pin is currently rejected by the generation resolver as unsupported; this study does not claim to ingest that evidence yet.

Typecheck, lint, build and browser smoke passed. The full suite passed 2,116 tests in 179 files with two Vitest worker shutdown timeout warnings; the focused suite passed again after adding the direct-pin rejection check. The build retains its existing chunk-size warning.
