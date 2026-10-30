# AL.P10.14 — selected-window width with facade piers

The selected-window width control now works on a pier-bearing building. Its graph retains the existing pier directive and the compiler rejects an otherwise valid width that collides with a pier's opening clearance. The change does not regenerate the material source.

Actual clean-start WebGPU and WebGL runs add piers, edit one upper-front window, verify unchanged materials, undo, redo and reopen. The script uses the app's starter building and does not depend on the untracked large fixtures used in earlier family studies. WebGL emitted existing shadow-map and shader precision warnings. Grouped-bay, awning, surface and advanced controls remain guarded for pier graphs; this packet does not claim broad street diversity.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,085 tests in 168 files). The build retains its existing chunk-size warning.
