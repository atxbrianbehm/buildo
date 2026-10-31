# Optional piers in grouped-family preview

The signed grouped-family demo has an opt-in **Vary upper facade piers** control. The selected plan is saved in the family archive; reopening displays the saved choice, and returning to the building restores the artist's previous choice. Existing saved families keep their old behavior. Authored piers are retained and material generation is not repeated.

The actual app was exercised on WebGL and WebGPU with paired windows on the top upper storey. Each run created, exported and reopened the family and returned to the original source, with no material-provider calls. A WebGL regression also tried triple windows and piers for the default seed: a pier conflicted with an opening, the source stayed unchanged, and switching to pairs succeeded. The control explains that some window groups or seeds need more clearance; this is not a promise that every pair will fit.

The screenshots are family-scale previews, not a street or historically verified reconstruction. Brick and storefronts remain repetitive and pier-to-band junctions need refinement. The family preview is read-only and the first Backlot cartridge remains undecided.

Reproduce the checks with `node docs/reviews/2026-10-31-al-p11-41-grouped-pier-control/verify.mjs webgl <new-output-dir>` or `webgpu`. The script includes the clearance regression; the WebGPU capture was taken with the same successful paired flow before that regression was added.

Validation: typecheck, lint, production build, full suite (2,129 tests in 181 files), and standard browser smoke passed. The build retains its existing chunk-size warning.
