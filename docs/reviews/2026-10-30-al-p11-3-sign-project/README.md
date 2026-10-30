# AL.P11.3 — sign-bearing project persistence

Construction project 0.18 stores graph 0.16 with the original base material source and, when awnings exist, the separately validated fabric. Tests round-trip plain and fabric-bearing sign projects and checkpoints, compile sign geometry, and reject missing fabric and older project versions.

A clean-start browser check verifies that the current editor rejects a sign project without replacing its scene. A sign checkpoint is read but cannot yet be displayed; the editor reports this and retains the saved copy. The script builds its fixture from the app's own starter project. Generation, editor continuity, artist controls, lettering and same-bay awning coexistence remain future work; no historical claim is made.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,093 tests in 171 files). The build retains its existing chunk-size warning.
