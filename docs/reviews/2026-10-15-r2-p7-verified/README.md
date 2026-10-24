# R2.P7 verified source continuation

This packet adds isolated bay editing to a pinned authored building source. A six-bay v2 file becomes an exact seven-bay v3 building; later floor/window edits retain authored bays, and Save/Open/Save retains literal source bytes. Appearance and performance acceptance remain open.

- [Verified checkpoint](source-check-and-app-checkpoint.json): all 253 final sources, five changed paths, 248 protected inherited snapshots, preimages, literal evidence copies and exact hashes.
- [Actual preservation run](verification-final-01.log): parent exit code 0; evidence copied without rerunning tests or the browser.
- [Retained failure](causal/red.log) and [unchanged test after production repair](causal/green.log).
- [Final unit suite](checks/test.log): 1,129 tests in 95 files. Lint, TypeScript, build and E2E also pass.
- [Focused source/controller/factory coverage](focused/check.log): 176 cases in three files.
- [Independent source review](source-review/review.json): no findings; all old test bytes reconstruct, including exactly two declared setup-input amendments.
- [Actual App proof](app/result.json): 32 artifacts/ten captures, six→seven bays, five→six floors, arched→rectangular windows, exact v3 Save/Open/Save, zero interpreter/provider calls and exact five-channel reuse.
- [Root visual inspection](app/visual-inspection.json): ten actual captures, with the engineering observations and open human gates recorded.

The original v1/v2 canaries remain literal compatibility inputs; the final v3 Save is retained as a new portable canary. The initial proof's failed cache-owner lookup and the corrected proof helper remain in the raw packet as excluded preparation evidence. They do not count as a passing App result.

Roof/trim/cornice source admission, roof/trim geometry consumers, compiler-content identity and legacy completed-IR migration remain separate. No commit, push, provider spending, publication or release was performed.
