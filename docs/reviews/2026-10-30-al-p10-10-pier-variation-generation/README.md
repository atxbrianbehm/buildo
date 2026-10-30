# AL.P10.10 — seeded pier family generation

Family generation accepts the isolated, versioned pier-variation plan as an optional input. Its seed and opening-lock state must match the family request. Enabled variation rejects overlapping imported opening, window, grouped-bay and facade-pier locks; existing authored piers are retained. Each candidate is compiled with the normal fit checks and keeps the pinned material plan.

Tests generate all six members alongside existing roof composition, confirm actual pier meshes and material hashes, and exercise authored piers, mismatched seeds and locks. This is a generation seam only: the workspace does not expose the policy or persist it in family sources, and no new visual or historical acceptance is claimed.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,084 tests in 168 files). The build retains its existing chunk-size warning.
