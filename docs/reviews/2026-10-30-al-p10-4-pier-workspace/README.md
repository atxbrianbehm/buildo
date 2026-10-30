# AL.P10.4 — façade pier workspace continuity

The construction workspace opens and recovers project 0.17 / graph 0.15 with its pier directive, existing finish, awning fabric and support rods. Registered grouped building controls permit numeric dimensions, while assembly choices, scoped opening/group/awning controls, surface editing, advanced graph editing and node preview remain disabled for pier graphs until their migrations are integrated. Single-building and family generation remain guarded. There is not yet an artist control to add or remove piers.

Both actual app backends open the same saved source, reject an infeasible width while retaining the last good view, change building width, undo/redo, checkpoint-recover and explicitly save/reopen. The graph's pier and support directives, source atlas and awning fabric are retained and material provider calls after opening are zero. The displayed textured captures include an existing local finish; visual inspection at this scale found no obvious sill artifact. The pier proportions are still a simple demo, not a historical claim or artist acceptance.

All five checks passed: 2,079 unit tests across 167 files, browser smoke, typecheck, lint and build. The build retains its existing chunk-size warning.
