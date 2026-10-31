# Storefront glazing controls for signed buildings

The existing Ground floor controls for display and transom lights are available on compatible pier-bearing, signed and shared-awning buildings. An artist can choose the number of panes and apply the change; unrelated protected assembly controls remain disabled. Existing authored signs, awnings, support rods, facade piers, and the shared material and fabric sources are retained.

Actual app checks in WebGL and WebGPU add piers, a sign, awning and supports, edit the display and transom lights, and verify undo, redo, save and reopen without material-provider calls. The focused UI regression checks that the related frontage mode remains protected. The screenshots show a single demo building; seeded family glazing variation, a finished street, historical attribution, and broader storefront and material diversity remain future work.

Reproduce the app check with `node docs/reviews/2026-10-31-al-p11-44-storefront-artist-control/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation: typecheck, lint, production build, full suite (2,132 tests in 181 files), standard browser smoke, and the dedicated two-renderer workflow passed. Lint initially found an unused helper in the review script; the corrected script passed. The build retains its existing chunk-size warning.
