# AL.P10.9 — seeded pier variation study

This isolated, versioned study chooses two buildings without added piers, two with slender piers and two with more projecting piers. The family seed changes their order; replay checks reject altered choices. The policy is opt-in, rejects an active opening lock, and preserves existing authored pier directives. The compiler still checks each building's fit and rejects a conflicting placement.

Tests compile every choice as actual building geometry and check replay, lock handling and input preservation. The catalog is a bounded demonstration rather than sourced historical evidence. It is not yet connected to family generation, saved family sources or the artist workspace, and no street-quality or visual acceptance is claimed.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,083 tests in 168 files). The build retains its existing chunk-size warning.
