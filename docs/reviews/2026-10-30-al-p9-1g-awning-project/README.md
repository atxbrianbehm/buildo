# AL.P9.1g: Awning graph project persistence

Project version 0.15 binds an awning graph to its separately validated fabric artifact and the existing material source. A graph with awnings cannot be saved without fabric, and older project versions cannot silently carry the new graph. Save/read replay retains the graph and literal material sources; a structural width edit keeps fabric and atlas unchanged. The reopened graph compiles its canopy and valance.

The [actual editor guard](editor-guard.mjs) verifies that opening this project reports the unsupported supplemental fabric and preserves the current building. Checkpoint recovery remains guarded too. These are deliberate temporary limits: workspace scene ownership, history and recovery must retain the fabric before opening is enabled. The browser guard relies on the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`.

Focused graph and project tests, typecheck and lint passed. All five repository checks passed: 2,057 tests across 156 files, the standard browser smoke suite, typecheck, lint and build. The build retains its large-chunk warning.
