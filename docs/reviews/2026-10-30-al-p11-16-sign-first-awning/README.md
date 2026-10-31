# AL.P11.16 — sign-first awning authoring

The grouped awning control can add an awning beneath an existing sign. The sign's bay is locked, the same illustrative 40 mm clearance is recorded, and the existing material source is retained. If another awning already has fabric, the new awning reuses it; the first awning creates the existing striped demo fabric. Subsequent unsafe awning dimensions reject the proposed scene.

Clean-start WebGL and WebGPU app runs exercised sign-first creation, clearance rejection, undo, redo and checkpoint recovery. An additional WebGL run verified an existing neighboring awning and fabric survive unchanged. Awning removal and support authoring while combined, generation and family editing remain guarded. The captured demo is not historical evidence. Existing WebGL shadow-map and shader precision warnings were observed.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,104 tests in 175 files). The suite exited successfully after Vitest reported worker-shutdown timeouts for the workbench and fabric-project files. The build retains its existing chunk-size warning.
