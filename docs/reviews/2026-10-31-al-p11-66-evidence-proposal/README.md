# AL.P11.66: Explicit construction interpretation proposal

This packet records a caller-supplied choice of flat or round upper-front opening heads against one architecture candidate in a staged Metagrinder extract and the exact building graph used to make that choice. The versioned proposal retains the staged extract, its unreviewed status and unknown coverage, and can be saved and reopened as JSON. It does not edit the graph, review the source, establish who made the choice, or claim that the choice can be applied to every graph.

The graph and proposal hashes check content consistency, not authorship or historical truth. Reopening requires the same document and complete graph; any graph change makes the proposal stale. The caller must create a fresh proposal after changes. A future application step must separately check graph compatibility, locks and provenance before changing geometry.

Focused tests use synthetic claims and exercise source retention, detached input ownership, round-trip, stale graphs, missing candidates, altered payloads and unsafe JSON. No private research or historical evidence is included.

Validation: `npm run typecheck`, `npm run lint`, `npm run build`, the focused proposal tests, and `npm run test:e2e` passed. The first full `npm test -- --run` passed 2,148 tests but failed the existing family-member undo test while waiting for Undo to enable; that test passed when rerun alone. A complete rerun with `npm test -- --run --maxWorkers=2` passed all 2,149 tests in 187 files. The first failure is not proof of its cause; contention is a possible explanation.
