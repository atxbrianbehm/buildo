# AL.P11.2 — storefront sign graph and worker

Construction graph 0.16 stores one front-bay sign directive and compiles it through the matching worker protocol. It retains compatible authored piers, grouped windows and awnings on other bays. The compiler uses the same storefront, output-connectivity and clearance checks as the experimental study; older graph and worker versions reject the new directive.

The focused tests compare executed geometry with the previous study, verify deterministic replay and version admission, and check that project save, generation and node preview reject until their preservation paths are implemented. A real browser worker exercise compares direct and worker geometry, paths and hash with piers, a neighboring awning and rods. Project persistence, artist controls, same-bay sign and awning layout, lettering and historical evidence remain future work.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,093 tests in 171 files). The build retains its existing chunk-size warning.
