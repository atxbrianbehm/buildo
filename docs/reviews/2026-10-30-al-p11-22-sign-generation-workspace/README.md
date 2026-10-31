# AL.P11.22 — retained sign workspace generation

The grouped workspace can generate or reroll a sign-bearing building when it already has generation lineage and the artist keeps authored choices. It retains the sign, awning, rods, gap, material atlas and fabric. The material seed is pinned; a changed reference or other request that would change material inputs is rejected instead of regenerating materials. A building without lineage must be generated before adding its sign. Imported sign, awning and pier lock paths and release of authored choices remain guarded by the study.

Clean-start WebGL and WebGPU app runs exercised the no-lineage guard, retained-sign reroll, rejection of releasing authored choices, exact material and fabric retention, zero base material-provider calls during reroll, undo, redo and checkpoint recovery. The capture remains visually repetitive and is not a family-diversity or historical-coverage claim. Family generation is still guarded. Existing WebGL shadow-map and shader precision warnings were observed.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,112 tests in 178 files). The build retains its existing chunk-size warning.
