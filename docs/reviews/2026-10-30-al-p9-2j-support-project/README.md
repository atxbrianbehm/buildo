# AL.P9.2j: Support project persistence

Project version 0.16 stores a version 0.14 support graph with its independently validated fabric and atlas sources. Round trips and checkpoint encoding retain the directives and produce the support geometry; missing fabric and older project versions reject. An actual editor check verifies that opening this version retains the current building, and an actual recovery check verifies that an unsupported checkpoint stays intact. These guards are temporary: workspace scene ownership, history and authoring are not yet implemented for support graphs.

The browser guard uses the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`. All five repository checks passed: 2,066 tests across 161 files, standard browser smoke, typecheck, lint and build. The build retains its large-chunk warning.
