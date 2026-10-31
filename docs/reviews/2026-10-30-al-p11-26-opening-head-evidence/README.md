# AL.P11.26 — opening-head evidence pin, resolver only

The generation resolver accepts an explicit building- or family-scoped numeric pin for `construction/opening/upperFrontRoundHead` (0 flat, 1 round), records its locked choice, creates the versioned operator graph and replays it from the saved source. Invalid values and element-scoped pins remain rejected. Sources without that pin retain their previous resolution behavior.

The workbench deliberately rejects this pin for now: its authored-detail retention could otherwise overwrite the resolved choice. The family study consequently remains guarded too. This is a narrow evidence contract, not a claim of imported historical observations or workspace support. The earlier [family render](../2026-10-30-al-p11-25-retained-sign-family-openings/family.png) shows the existing head geometry; it does not demonstrate this new pinned-source path.

Typecheck, lint, build, browser smoke and the full suite passed (2,117 tests in 179 files). A focused regression also confirms the pinned source retains the same material-input hash. The build retains its existing chunk-size warning.
