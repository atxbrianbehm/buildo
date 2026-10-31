# Demo awning fabrics in grouped-family preview

The grouped-family demo offers an opt-in **Vary awning fabrics (demo)** choice. It creates a validated portable fabric-family archive, displays the member assignments, and saves and reopens them. The inherited source fabric remains intact. The workspace caches one set of assignments by family and member identity, material seed and inherited-fabric hash; changing only grouped-window placement reuses the same assignments instead of resolving a new palette. The archive reader still validates the saved artifact contents.

Actual WebGL and WebGPU app checks create a family with grouped windows and storefront-pane variation, save it, change grouped-window placement and generate different geometry while reusing identical fabric assignments, then reopen the original archive. The test observes one demo-assignment resolution and no material-provider calls. Returning to the source retains the original building and the artist's prior control choice. The colors are demo choices, not historical evidence; the family remains read-only and its brick, storefront layouts and awning placement still repeat.

Reproduce with `node docs/reviews/2026-10-31-al-p11-55-family-fabric-control/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation passed: typecheck, lint, production build, 2,138 tests in 182 files, standard browser smoke, and the dedicated WebGL and WebGPU workflows. The build retains its existing chunk-size warning.
