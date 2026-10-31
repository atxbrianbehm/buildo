# AL.P11.13 — same-bay sign authoring

The grouped storefront sign control can add a blank framed sign above an existing awning in the selected bay. A 40 mm illustrative clearance is recorded, lowering the canopy and optional rods together; removing the sign restores the original awning graph. The compiler rejects a combination without sufficient ground or anchor clearance before publishing it.

Clean-start actual app runs on WebGL and WebGPU exercised an unsafe ground-clearance rejection, adding and removing the sign, unchanged awning and support directives, unchanged fabric and material sources, undo, redo and checkpoint recovery. The capture shows the authored striped awning and sign in context. Combined sign and awning dimensions, adding an awning to a sign-bearing graph, generation and family editing remain guarded. The demo geometry does not establish historical evidence. Existing WebGL shadow-map and shader precision warnings were observed.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,102 tests in 175 files). The build retains its existing chunk-size warning.
