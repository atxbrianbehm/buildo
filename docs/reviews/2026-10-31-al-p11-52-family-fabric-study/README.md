# Grouped-family awning-fabric study

An opt-in study prepares six explicit member fabric assignments from a separate material seed: one inherits the original fabric and five use demo solid or striped palettes. It reuses validated procedural fabric artifacts and the existing family assignment format. The inherited fabric remains unchanged, and no architectural graph or geometry is modified. The palette is a visual demonstration, not evidence of historical colors or a source-derived claim.

The WebGL family and detail views combine the fabric assignments with signed awnings, grouped windows, varied massing and storefront panes. The canvas colors add useful separation, but awning placement, brick and storefront layouts still repeat, the sign panels are blank, and this is not a finished street. The study is not yet an artist control or integrated into the grouped-family archive.

Focused tests cover reproducibility, owned inputs, invalid identities and fabric tampering, assignment scope, actual renderer material assignment, geometry-buffer preservation and resource disposal. Reproduce the views with `node docs/reviews/2026-10-31-al-p11-52-family-fabric-study/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,137 tests in 182 files), and standard browser smoke passed. The first renderer-test comparison used a whole cloned result and failed; the corrected test compares the relevant geometry buffers and passes. The build retains its existing chunk-size warning. The study render used WebGL only.
