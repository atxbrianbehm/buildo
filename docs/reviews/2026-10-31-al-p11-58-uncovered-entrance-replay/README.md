# Replaying uncovered entrances in a grouped family

A new versioned grouped-family policy applies the uncovered-entrance study after upper-window grouping. Existing policies and their replay behavior are unchanged. The saved archive replays the final graph and geometry hashes and retains the signed source, material and fabric. It composes with the optional pier-variation policy and the existing fabric-assignment wrapper. The workspace identifies an opened archive as using demo entrance positions; this packet does not add an artist-facing creation control.

The render is compiled from a saved archive after reopening. It combines grouped upper windows, varied storefront lights, the retained supported awning and entrance bays 3, 3, 1, 1, 2 and 2. This is an experimental result awaiting visual review, not historical evidence or a complete street; much of the facade still repeats.

The focused archive test covers old policies, reopening with and without piers, fabric-wrapper replay, source preservation, locked inputs and a tampered saved door. Reproduce the rendered views with `node docs/reviews/2026-10-31-al-p11-58-uncovered-entrance-replay/render.mjs`; reproduce the app open/save workflow with `node docs/reviews/2026-10-31-al-p11-58-uncovered-entrance-replay/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation passed: typecheck, lint, production build, full suite (2,139 tests in 183 files), focused archive regression, standard browser smoke, and final WebGL and WebGPU app workflows. An initial lint error from reading a React ref during render was corrected; renderer workflows were rerun after the fix. The build retains its existing chunk-size warning.
