# Undoable storefront pane reset

The Ground floor controls now offer **Clear pane divisions** on compatible graphs that contain an explicit division. The button changes the draft to single panes; the artist applies it using the existing Apply changes action. The change participates in construction undo and redo and retains the sign, awning, rods, piers and materials. Graph versions 0.13 and 0.14 cannot represent absence and do not offer the button.

Actual WebGL and WebGPU app checks create a signed, pier-bearing building, author pane divisions, verify that family variation protects the authored choice, clear and apply the choice, undo and redo, save and reopen, and then generate the varied grouped family without material-provider calls. The screenshots show the family after the reset; this is not a completed street or a historical reconstruction. A signed source without piers can still synthesize a legacy placeholder during family generation and requires separate continuity work.

Reproduce with `node docs/reviews/2026-10-31-al-p11-49-storefront-reset-control/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation: typecheck, lint, production build, full suite (2,135 tests in 181 files), standard browser smoke, and dedicated WebGL and WebGPU workflows passed. The build retains its existing chunk-size warning.
