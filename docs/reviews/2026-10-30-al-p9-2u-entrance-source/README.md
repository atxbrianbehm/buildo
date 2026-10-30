# AL.P9.2u.3 — entrance family source

Family source version 0.12 stores the v6 seeded composition with the original and six member graphs. It admits an optional retained inherited fabric and optional individual assignments, validating the fabric bytes, assignment identity and hashes, composition replay and family seed. Graphs that require fabric and assignments without inherited fabric are rejected. Updating member graphs retains this version.

The source round-trip regression exercises both a no-fabric family and a family with individual fabric assignments and support graphs, plus missing fabric, incorrect family seed, mismatched fabric ownership, tampering and legacy-version rejection. The workspace continues to reject this version until its resource ownership and controls are integrated. This packet does not claim a product render or historical coverage.

Validation: all five checks passed (2,071 tests across 164 files, browser smoke, typecheck, lint and build), plus a final focused source round-trip rerun. The build retains its existing chunk-size warning.
