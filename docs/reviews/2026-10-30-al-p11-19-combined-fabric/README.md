# AL.P11.19 — combined shared fabric

The grouped awning control can edit the building's shared fabric while an awning shares a bay with a sign. The sign, canopy, supports and their saved clearance remain structural choices; a fabric edit changes the separate awning fabric source for all awnings in the building.

Clean-start actual app checks on WebGL and WebGPU switched from striped to solid and back to a different stripe color with two awnings, one sharing a sign and rods. They verified unchanged construction graph and base material atlas, no base material-provider calls during fabric edits, and exact save, reopen and recovery. Captures show illustrative demo materials rather than historical evidence. Generation and family editing remain guarded. Existing WebGL shadow-map and shader precision warnings were observed.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,108 tests in 175 files). The build retains its existing chunk-size warning.
