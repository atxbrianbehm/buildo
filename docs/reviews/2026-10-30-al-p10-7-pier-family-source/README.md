# AL.P10.7 — pier-bearing family source

Family source 0.13 can retain graph 0.15 piers on the original or member buildings, with optional existing composition, inherited awning fabric and per-member assignments. It validates graph and lineage identities, shared material inputs, composition replay, fabric hashes and assignment ownership. Awning-bearing pier graphs require inherited fabric; plain pier graphs do not. Member updates retain the version even if the last pier is later removed.

Source tests round-trip plain and support/fabric-bearing families, compile a member's pier geometry and reject missing fabric, incorrect assignments and older source versions. A real WebGPU app run constructs a pier-bearing family with an individual fabric assignment and confirms the current family workspace rejects it without replacing the prior scene. The family generator and workspace are still guarded; this packet does not render a pier-bearing family or claim historical evidence.

All five checks passed: 2,080 unit tests across 167 files, browser smoke, typecheck, lint and build. The build retains its existing chunk-size warning.
