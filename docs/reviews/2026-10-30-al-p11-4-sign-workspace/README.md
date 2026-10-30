# AL.P11.4 — sign-bearing workspace continuity

The workspace can open and recover a sign-bearing project, retain its sign, piers, neighboring awning and fabric while editing building dimensions, and save the result. Unsupported assembly, local-detail, surface, node-preview, generation and family controls stay guarded; sign creation is not yet exposed.

Clean-start WebGPU and WebGL app runs open a generated sign project, change building width, undo, redo and recover the saved state while preserving base materials and supplemental fabric. The actual workspace image shows a shallow blank sign, with no lettering. Existing WebGL shadow-map and shader precision warnings remain. Same-bay awning coexistence, artist authoring, material choice and historical evidence are not claimed.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,093 tests in 171 files). The build retains its existing chunk-size warning.
