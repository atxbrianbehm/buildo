# AL.P11.15 — combined awning dimensions

The grouped awning controls expose projection, drop and valance height for the bay shared with a sign. The selected bay is locked and awning removal, support editing and fabric editing remain guarded. Edits retain the sign, recorded gap, support rods and material sources; unsafe clearances reject the proposed scene.

Clean-start actual app checks in WebGL and WebGPU resized the awning, rejected an unsafe drop, removed the sign while retaining the resized awning and rods, and verified material and fabric continuity, undo, redo and checkpoint recovery. The capture is an illustrative demo rather than historical evidence. Adding an awning to an existing sign, awning removal and support authoring while combined, generation and family editing remain pending. Existing WebGL shadow-map and shader precision warnings were observed.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,103 tests in 175 files). The build retains its existing chunk-size warning.
