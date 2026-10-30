# AL.P10.3 — façade pier project persistence

Construction project version 0.17 stores graph 0.15 with the pier directive, original atlas and an optional retained awning fabric. An awning-bearing pier graph requires its fabric; a pier graph without awnings can omit it. Project and checkpoint codecs validate source hashes and ownership. Structural data remains separate from the saved material artifacts.

The project test round-trips pier graphs with and without awnings, including support rods, fabric and checkpoint, verifies compiled pier geometry, preserves source materials and rejects older project versions or missing awning fabric. Actual Chromium editor and recovery checks reject the new graph with a clear diagnostic, retain the existing building and preserve the unsupported checkpoint. The worker and renderer fixture remain documented in the preceding packet; app editing, node previews and generation remain guarded.

All five checks passed: 2,079 unit tests across 167 files, browser smoke, typecheck, lint and build. The build retains its existing chunk-size warning.
