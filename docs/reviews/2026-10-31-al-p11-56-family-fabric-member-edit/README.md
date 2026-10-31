# Individual awning fabrics in grouped families

An artist can change or reset the selected building's awning fabric in a grouped-family preview. The family archive stores explicit per-member assignments; changing one preserves the other members and the archived construction. Unsaved edits prevent leaving or opening another family until the artist saves. An opened archive is rendered using its own source materials, independent of the building currently in the workspace. The original source building is not edited.

The family geometry remains read-only. Recreating a family from the original building starts a new preview rather than incorporating edits from a previously saved family; reopen the saved archive to continue those edits. The colors are artist choices, not historical evidence, and repeated brick, storefront layout and awning placement remain visible limitations.

Reproduce the browser workflow with `node docs/reviews/2026-10-31-al-p11-56-family-fabric-member-edit/verify.mjs webgl <new-output-dir>` or `webgpu`. It checks a saved override, reopening, reset to shared fabric, preservation of other member assignments and the original source, and no material-provider calls.

Validation passed: typecheck, lint, production build, full suite (2,138 tests in 182 files), standard browser smoke, and dedicated WebGL and WebGPU app workflows. The production build retains the existing chunk-size warning.
