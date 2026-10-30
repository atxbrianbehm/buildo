# AL.P10.6 — retain façade piers through building generation

Single-building generation retains authored piers when edited assemblies are kept, openings are locked, or an applicable imported opening or frontage lock is present. It reattaches them after existing grouped openings, storefronts, awnings and supports, then recompiles and rejects an infeasible retained fit. Explicitly releasing edited assemblies with openings unlocked removes piers and other unlocked authored assemblies, while retaining the independent material artifacts. The generation resolver does not yet support a pier-specific imported semantic lock; unsupported locks are rejected. Family generation remains guarded.

Both real app backends exercise authored piers plus an awning and rods through reroll, undo/redo, checkpoint recovery and explicit reopen; then they release the authored assemblies. The original atlas and awning fabric remain unchanged and material-provider calls during each edit are zero. Focused tests cover retention, opening-lock retention, a supported imported opening lock and explicit release. The pier treatment remains a fixed demo, not a historical claim.

All five checks passed: 2,080 unit tests across 167 files, browser smoke, typecheck, lint and build. The WebGPU workflow was rerun after the final lock correction. The build retains its existing chunk-size warning.
