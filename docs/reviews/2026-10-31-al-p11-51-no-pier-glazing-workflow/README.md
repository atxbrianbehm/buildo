# No-pier storefront reset-to-family workflow

Actual WebGL and WebGPU app checks start from a signed, awning-bearing building without facade piers. The artist clears its stored pane choice, applies the change, previews and saves a family with grouped upper windows and varied storefront panes, reopens it, and returns to the source. The test then authors a division, verifies that variation protects it, clears it, exercises undo and redo, saves and reopens the reset building, and successfully generates the family again. Sign, awning, rods and material and fabric sources remain intact; no material-provider calls occur during the checked operations.

This verifies the app workflow enabled by the signed-source provenance fix. It does not change the implementation or serialized format. The screenshots show actual app output; the family still has repeated materials and storefront layouts and is not a completed street or historical reconstruction. Graph versions that require a division still need a safe migration before they can offer the reset.

Reproduce with `node docs/reviews/2026-10-31-al-p11-51-no-pier-glazing-workflow/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation: typecheck, lint, production build, full suite (2,136 tests in 181 files), standard browser smoke, and dedicated WebGL and WebGPU workflows passed. The build retains its existing chunk-size warning.
