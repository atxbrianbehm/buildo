# AL.P11.21 — retained sign generation project

The existing version 0.19 construction project can store the retained sign-and-awning generation study together with its versioned generation lineage, base material source and separate awning fabric. Project and checkpoint round trips retain the graph, geometry, sources and lineage. A subsequent building reroll preserves the sign, awning, rods, gap and fabric while reusing the same material inputs. A mismatched material-source identity is rejected.

This is a project API and checkpoint test using real generated material artifacts. It does not enable workspace generation or family generation, prove visual family diversity, or establish historical evidence. Imported sign, awning and pier lock paths remain guarded by the study.

All five documented checks passed: typecheck, lint, build, browser smoke and the full suite (2,111 tests in 177 files). The build retains its existing chunk-size warning.
