# AL.P11.10 — sign and awning graph and worker

Graph version 0.17 records an explicit sign-to-awning clearance for an authored sign and matching awning. Direct compilation reproduces the earlier complete-building study, including optional rods. The previous 0.16 graph still rejects a same-bay combination. The graph schema and worker protocol reject incompatible versions and missing clearance or awning. Generation and construction project creation explicitly reject the new graph until they have their own integration.

The local Chromium worker check compiles the graph through an actual worker and compares the canonically ordered complete result against direct compilation. It passed with matching source hash and canopy, valance, support, sign panel and sign frame roles. The initial plain JSON string comparison differed because of object key order; canonical comparison matched. This is not yet an editable workspace feature or historical evidence.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,102 tests in 175 files). The build retains its existing chunk-size warning.
