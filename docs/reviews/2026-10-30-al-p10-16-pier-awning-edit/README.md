# AL.P10.16 — awnings with facade piers

The storefront awning control now supports a pier-bearing building. It adds and removes procedural awnings and support rods without removing facade piers; removing the last awning also removes its rods while retaining the separately saved fabric and base material source.

Clean-start WebGPU and WebGL app runs choose a storefront, add piers, add an awning and rods, change projection, remove and restore the rods, remove the awning, undo and reopen. The script uses the app's own building instead of an untracked fixture. WebGL emitted existing shadow-map and shader precision warnings. Surface and advanced controls remain guarded for pier graphs; this is not a claim of street readiness.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,087 tests in 168 files). The build retains its existing chunk-size warning.
