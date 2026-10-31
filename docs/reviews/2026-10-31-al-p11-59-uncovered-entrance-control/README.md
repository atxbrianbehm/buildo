# Artist control for uncovered family entrances

The grouped-family workspace offers an opt-in **Vary entrance positions (demo)** control. It creates the versioned family policy that chooses bays without authored awnings. The saved family displays the setting on reopen, and returning to the original building restores the artist's prior control state. With the option off, the earlier policies are used. Opening locks, imported entrance/frontage pins, and infeasible frontages remain errors; the original building and authored awnings are retained.

The actual app workflows combine this setting with varied storefront panes and demo awning fabrics. They check the saved entrance choices, source retention, save/reopen, and unchanged fabric assignments and entrance choices when grouped-window placement changes. The family remains visually repetitive, the rule is a demo awaiting visual review, and it makes no historical or metagrinder claim.

Reproduce with `node docs/reviews/2026-10-31-al-p11-59-uncovered-entrance-control/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation passed: typecheck, lint, production build, full suite (2,140 tests in 183 files), focused captured-lineage lock regression, standard browser smoke, and final WebGL and WebGPU app workflows. The earlier suite was stopped after identifying the missing pin guard and rerun after correction. The build retains its existing chunk-size warning.
