# Storefront-pane variation in grouped-family preview

The grouped-family demo has an opt-in **Vary storefront panes** control. It records the existing deterministic composition in the family archive, displays the saved choice when reopened, and restores the artist's prior choice when returning to the building. Existing authored storefront divisions remain protected; the preview reports the conflict and retains the original building. The control explains that the option can be turned off to retain them.

Some older or migrated graphs contain an explicit one-by-one division even if it originated as a default. The current source does not distinguish that history from an artist-authored choice, so variation rejects it as well. This packet does not add a control to clear that source choice.

Actual WebGL and WebGPU app runs generated, saved and reopened a family from a signed building with an awning, rods and piers, preserving the source and materials without material-provider calls. The WebGPU run also authored a pane division and verified that variation is rejected without changing the building. The WebGL successful-flow capture was taken before that additional rejection check was added. The family varies heights, bay counts, upper windows, cornices and pane counts, but materials, sign/awning placement and storefront layouts still repeat. This is a demo, not a completed street or historical reconstruction.

Reproduce with `node docs/reviews/2026-10-31-al-p11-47-family-glazing-control/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation: typecheck, lint, production build, full suite (2,133 tests in 181 files), standard browser smoke, and dedicated WebGL and WebGPU app flows passed. The build retains its existing chunk-size warning.
