# AL.P11.11 — sign and awning project source

Project version 0.19 stores the version 0.17 combined graph with its required awning fabric and existing material source. Round-trip tests cover graph and geometry equality, unchanged material and fabric sources, checkpoint recovery, missing fabric and older project-version rejection. The generation path remains guarded.

The current workspace guards file opening and automatic recovery of this format until its controls can preserve the combined assembly. The guard retains both the active building and the saved source. This packet does not yet enable artist authoring, actual workspace editing or historical claims.

The local Chromium guard script verified both manual open and checkpoint recovery in the actual app. All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,102 tests in 175 files). The build retains its existing chunk-size warning.
