# R1.S5 excluded diagnostic attempt

This directory preserves the **ineffective `2026-10-14-r1-s5-retry-01` attempt**. It does not complete R1.S5 or select a production repair.

The 30 PNGs and two validated JSON artifacts passed integrity and material-state checks: production/restored images matched S4, source/atlas/geometry bytes remained frozen, and the corresponding source checkpoint was preserved. Actual image review then found every six-condition series byte-identical on both WebGPU and WebGL. Frame counters also stayed constant within each preset. Material properties changed without submitting a new rendered frame.

The next attempt must prove advancing completed frames and visibly changed flat wall output before any causal finding. These files and their checkpoint remain unchanged for provenance. The primary-wall source and packed pixel measurements remain useful source data; they do not establish which source, normal, shadow or geometry contribution dominates the rendered building.

Raw attempt and logs: `test-results/r1-s5-2026-10-14/2026-10-14-r1-s5-retry-01`, `capture-retry-01.log` and `verification-retry-01.log`. The earlier zero-PNG serialization failure is also retained separately. See [the active revival plan](../../plans/building-authoring-revival.md).
