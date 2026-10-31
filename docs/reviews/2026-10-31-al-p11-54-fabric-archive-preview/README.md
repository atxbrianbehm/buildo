# Fabric-family archive preview

The workspace opens a validated grouped-family fabric archive as a read-only family preview, renders the saved per-member assignments, saves an identical copy, and returns to the original building. Failed verification leaves the current building unchanged. Legacy grouped-family archives continue to open without fabric overrides. This packet does not create or edit fabric-family archives in the app.

Actual WebGL and WebGPU app checks create a portable source, open it in the workspace, save an identical copy and return to the original building. Focused workspace tests check the assigned material hashes, resource disposal and failed-verification behavior. The first WebGL script run timed out because changing a URL fragment did not reload a page that the test had replaced; the corrected full reload passed. The demo palette is not historical evidence, and brick, storefront layout and awning placement still repeat.

Reproduce with `node docs/reviews/2026-10-31-al-p11-54-fabric-archive-preview/verify.mjs webgl <new-output-dir>` or `webgpu`.

Validation: typecheck, lint, production build, full suite (2,138 tests in 182 files), standard browser smoke, and dedicated WebGL and WebGPU app flows passed. The build retains its existing chunk-size warning.
