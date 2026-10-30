# AL.P10.8 — pier-bearing family workspace

Family generation retains authored facade piers, awnings and their supports while applying existing composition choices. Individual members can add or remove piers; modifying a member in an older family upgrades its source to version 0.13. The original and sibling members, retained atlas, fabric and individual fabric assignments survive save and reopen.

Actual app exercises cover WebGPU and WebGL generation from a pier-bearing building, member editing, an individual fabric override and reopening, without provider calls. A separate WebGL exercise adds piers to one member of an older family and verifies the source upgrade and sibling continuity. The accompanying image is the actual edited WebGPU family, not a historical reconstruction.

The result is still visually repetitive: the family shares brick and similar overall proportions, pier dimensions are fixed, and automatic pier variation is not yet implemented. Some assembly, local-detail and node-preview controls remain guarded while piers are present; imported pier-specific locks are not supported. This evidence does not establish historical or street readiness.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,081 tests in 167 files). The build retains its existing chunk-size warning.
