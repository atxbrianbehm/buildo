# Entrance placement beside authored awnings

This isolated, opt-in study chooses a front bay without an authored awning for a generated family member's entrance. It uses the family seed and the member document identity, retains the rest of the signed building graph, and refuses locked openings or a frontage with no available bay. The original versioned family composition recipes are unchanged. A generated choice is not historical evidence or a claim that a door belongs in a particular bay.

The actual WebGL render uses the retained-sign family with facade piers, storefront divisions, a canopy, support rods and sign clearance. Door bays are 1, 1, 2, 1, 2 and 2; the authored awning remains in bay 0. `storefront-detail.png` shows a generated door and awning. Massing and most facade composition are deliberately held constant, so these remain repetitive buildings rather than a finished street. The study does not yet participate in saved grouped-family archives or the artist controls, and does not resolve whether an entrance can sit under a canopy.

Run `node docs/reviews/2026-10-31-al-p11-57-uncovered-entrance-study/render.mjs` to reproduce. The focused test checks deterministic replay, source retention, real door geometry, locks and the no-available-bay case.

Validation passed: typecheck, lint, production build, full suite (2,139 tests in 183 files), focused geometry test, standard browser smoke, and actual WebGL renders. The production build retains the existing chunk-size warning.
